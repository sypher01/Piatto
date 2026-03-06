#!/usr/bin/env python3
"""
scraper_api.py — Piatto Scraper API
=====================================
A lightweight Flask HTTP service that lets the Impostazioni UI:
  - Trigger the scraper or LLM normalizer
  - Poll run status and live logs (via DB polling)
  - Test LLM connectivity
  - Read / write LLM configuration stored in app_config table

Runs as a long-lived Docker service (always up, not --profile tools).
"""

import os
import sys
import threading
import subprocess
import time
import logging

import psycopg2
import requests
from flask import Flask, jsonify, request

app = Flask(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

DB_CONFIG = {
    "host":     os.environ.get("DB_HOST", "localhost"),
    "port":     int(os.environ.get("DB_PORT", "5432")),
    "dbname":   os.environ.get("DB_NAME", "hfresh_recipes"),
    "user":     os.environ.get("DB_USER", "hfresh_user"),
    "password": os.environ.get("DB_PASSWORD", ""),
}

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


# ── DB helpers ────────────────────────────────────────────────────────────────

def get_conn():
    return psycopg2.connect(**DB_CONFIG)


def db_get_config(key: str, default: str = "") -> str:
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute("SELECT value FROM app_config WHERE key = %s", (key,))
            row = cur.fetchone()
        conn.close()
        return row[0] if row else default
    except Exception:
        return default


def db_set_config(key: str, value: str) -> None:
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO app_config (key, value, updated_at)
               VALUES (%s, %s, NOW())
               ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()""",
            (key, value)
        )
    conn.commit()
    conn.close()


# ── Job runner ────────────────────────────────────────────────────────────────

def _run_job(job_type: str, cmd: list, extra_env: dict):
    """Spawn a subprocess; stream its output into the scraper_runs log column."""
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO scraper_runs (job_type, status) VALUES (%s, 'running') RETURNING id",
            (job_type,)
        )
        run_id = cur.fetchone()[0]
    conn.commit()

    log.info(f"Starting job {job_type!r} (run_id={run_id}): {cmd}")

    try:
        merged_env = {**os.environ, **extra_env}
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            bufsize=1,
            cwd=SCRIPT_DIR,
            env=merged_env,
        )

        buf = []
        for line in proc.stdout:
            buf.append(line)
            if len(buf) >= 5:
                chunk = "".join(buf)
                try:
                    with conn.cursor() as cur:
                        cur.execute(
                            "UPDATE scraper_runs SET log = log || %s WHERE id = %s",
                            (chunk, run_id)
                        )
                    conn.commit()
                except Exception as e:
                    log.warning(f"DB log write failed: {e}")
                buf = []

        if buf:
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE scraper_runs SET log = log || %s WHERE id = %s",
                        ("".join(buf), run_id)
                    )
                conn.commit()
            except Exception:
                pass

        proc.wait()
        status = "done" if proc.returncode == 0 else "error"
        log.info(f"Job {job_type!r} run_id={run_id} finished with status={status!r}")

    except Exception as e:
        status = "error"
        log.exception(f"Job {job_type!r} run_id={run_id} crashed")
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE scraper_runs SET log = log || %s WHERE id = %s",
                    (f"\n[FATAL] {e}\n", run_id)
                )
            conn.commit()
        except Exception:
            pass

    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE scraper_runs SET status = %s, finished_at = NOW() WHERE id = %s",
                (status, run_id)
            )
        conn.commit()
    except Exception as e:
        log.warning(f"Failed to mark run as {status}: {e}")
    finally:
        try:
            conn.close()
        except Exception:
            pass


def _is_running(job_type: str) -> bool:
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM scraper_runs WHERE status = 'running' AND job_type = %s",
                (job_type,)
            )
            row = cur.fetchone()
        conn.close()
        return row is not None
    except Exception:
        return False


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/health")
def health():
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/run/scraper", methods=["POST"])
def run_scraper():
    if _is_running("scraper"):
        return jsonify({"error": "Scraper already running"}), 409
    t = threading.Thread(
        target=_run_job,
        args=("scraper", [sys.executable, "scraper.py"], {}),
        daemon=True,
    )
    t.start()
    return jsonify({"status": "started"})


@app.route("/run/normalizer", methods=["POST"])
def run_normalizer():
    if _is_running("normalizer"):
        return jsonify({"error": "Normalizer already running"}), 409
    llm_url = db_get_config("llm_base_url", os.environ.get("LLM_BASE_URL", "http://host.docker.internal:1234/v1"))
    llm_model = db_get_config("llm_model", os.environ.get("LLM_MODEL", ""))
    t = threading.Thread(
        target=_run_job,
        args=(
            "normalizer",
            [sys.executable, "normalize_ingredients.py", "--new-only"],
            {"LLM_BASE_URL": llm_url, "LLM_MODEL": llm_model},
        ),
        daemon=True,
    )
    t.start()
    return jsonify({"status": "started"})


@app.route("/status")
def status():
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, job_type, status, started_at, finished_at, log
                   FROM scraper_runs
                   ORDER BY id DESC
                   LIMIT 10"""
            )
            rows = cur.fetchall()
        conn.close()
        return jsonify([
            {
                "id": r[0],
                "job_type": r[1],
                "status": r[2],
                "started_at": r[3].isoformat() if r[3] else None,
                "finished_at": r[4].isoformat() if r[4] else None,
                "log": r[5] or "",
            }
            for r in rows
        ])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/llm/test", methods=["POST"])
def llm_test():
    data = request.get_json(silent=True) or {}
    url = data.get("llm_base_url") or db_get_config("llm_base_url", os.environ.get("LLM_BASE_URL", ""))
    if not url:
        return jsonify({"ok": False, "error": "No LLM URL configured"})
    try:
        r = requests.get(f"{url}/models", timeout=8)
        if r.status_code == 200:
            models = [m["id"] for m in r.json().get("data", [])]
            return jsonify({"ok": True, "models": models})
        return jsonify({"ok": False, "error": f"HTTP {r.status_code}"})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)})


@app.route("/config", methods=["GET"])
def get_config():
    llm_url = db_get_config("llm_base_url", os.environ.get("LLM_BASE_URL", ""))
    llm_model = db_get_config("llm_model", os.environ.get("LLM_MODEL", ""))
    return jsonify({"llm_base_url": llm_url, "llm_model": llm_model})


@app.route("/config", methods=["POST"])
def set_config():
    data = request.get_json(silent=True) or {}
    if "llm_base_url" in data:
        db_set_config("llm_base_url", data["llm_base_url"])
    if "llm_model" in data:
        db_set_config("llm_model", data["llm_model"])
    return jsonify({"ok": True})


if __name__ == "__main__":
    # Wait for DB to be ready before serving
    for attempt in range(30):
        try:
            conn = get_conn()
            conn.close()
            log.info("DB connection OK — starting Flask API on :5001")
            break
        except Exception as e:
            log.info(f"Waiting for DB ({attempt + 1}/30): {e}")
            time.sleep(2)
    else:
        log.error("Could not connect to DB after 60 s, aborting.")
        sys.exit(1)

    app.run(host="0.0.0.0", port=5001, debug=False)

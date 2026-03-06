'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import './ImpostazioniClient.css';

const BASE = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/$/, '');

// ── Types ──────────────────────────────────────────────────────────────────

interface Stats {
    recipes: string;
    ingredients: string;
    unique_ingredients: string;
    llm_mappings: string;
    cuisines: string;
    categories: string;
    last_scraped: string | null;
    db_size: string;
}

interface ScraperRun {
    id: number;
    job_type: 'scraper' | 'normalizer';
    status: 'running' | 'done' | 'error';
    started_at: string | null;
    finished_at: string | null;
    log: string;
}

interface LlmConfig {
    llm_base_url: string;
    llm_model: string;
}

type Tab = 'stats' | 'scraper' | 'llm' | 'diagnostics';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
}

function StatusBadge({ status }: { status: ScraperRun['status'] }) {
    return (
        <span className={`run-status ${status}`}>
            {status === 'running' && <span className="dot-pulse" />}
            {status === 'running' ? 'in corso' : status === 'done' ? 'completato' : 'errore'}
        </span>
    );
}

// ── Stats Tab ──────────────────────────────────────────────────────────────

function StatsTab() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const res = await fetch(`${BASE}/api/impostazioni/stats`);
            if (!res.ok) throw new Error(await res.text());
            setStats(await res.json());
            setError('');
        } catch (e: any) {
            setError(e.message);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    if (error) return <p style={{ color: 'var(--primary)' }}>{error}</p>;
    if (!stats) return <p style={{ color: 'var(--text-muted)' }}>Caricamento...</p>;

    const cards = [
        { label: 'Ricette', value: stats.recipes },
        { label: 'Ingredienti', value: stats.ingredients },
        { label: 'Ingredienti unici', value: stats.unique_ingredients },
        { label: 'Mapping LLM', value: stats.llm_mappings },
        { label: 'Cucine', value: stats.cuisines },
        { label: 'Categorie', value: stats.categories },
    ];

    return (
        <>
            <div className="stats-grid">
                {cards.map(c => (
                    <div key={c.label} className="stat-card">
                        <div className="stat-value">{c.value}</div>
                        <div className="stat-label">{c.label}</div>
                    </div>
                ))}
            </div>
            <div className="settings-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <p className="section-label">Ultima sincronizzazione</p>
                    <p style={{ fontWeight: 600 }}>{fmtDate(stats.last_scraped)}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <p className="section-label">Dimensione DB</p>
                    <p style={{ fontWeight: 600 }}>{stats.db_size}</p>
                </div>
                <button className="btn-sm btn-outline" onClick={load}>Aggiorna</button>
            </div>
        </>
    );
}

// ── Scraper Tab ────────────────────────────────────────────────────────────

function ScraperTab() {
    const [runs, setRuns] = useState<ScraperRun[]>([]);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [busy, setBusy] = useState<'scraper' | 'normalizer' | null>(null);
    const [error, setError] = useState('');
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const logRef = useRef<HTMLPreElement | null>(null);

    const fetchRuns = useCallback(async () => {
        try {
            const res = await fetch(`${BASE}/api/impostazioni/scraper`);
            if (!res.ok) throw new Error(await res.text());
            const data: ScraperRun[] = await res.json();
            setRuns(data);
            // Auto-expand the most recent running job
            const running = data.find(r => r.status === 'running');
            if (running) setExpandedId(running.id);
        } catch (e: any) {
            setError(e.message);
        }
    }, []);

    useEffect(() => {
        fetchRuns();
        pollRef.current = setInterval(fetchRuns, 3000);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [fetchRuns]);

    // Auto-scroll log to bottom
    useEffect(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [runs]);

    const isRunning = runs.some(r => r.status === 'running');

    const triggerJob = async (job: 'scraper' | 'normalizer') => {
        setBusy(job);
        setError('');
        try {
            const res = await fetch(`${BASE}/api/impostazioni/scraper`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ job }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? 'Errore avvio');
            await fetchRuns();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setBusy(null);
        }
    };

    const expandedRun = runs.find(r => r.id === expandedId);

    return (
        <>
            <div className="settings-card">
                <h2>Avvia processo</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                    Lo <strong>Scraper</strong> raccoglie nuove ricette da hfresh.info.<br />
                    Il <strong>Normalizer</strong> usa l&apos;LLM per uniformare i nomi degli ingredienti.
                </p>
                <div className="action-row">
                    <button
                        className="btn-sm btn-danger"
                        onClick={() => triggerJob('scraper')}
                        disabled={isRunning || busy !== null}
                    >
                        {busy === 'scraper' ? 'Avvio...' : 'Avvia Scraper'}
                    </button>
                    <button
                        className="btn-sm btn-outline"
                        onClick={() => triggerJob('normalizer')}
                        disabled={isRunning || busy !== null}
                    >
                        {busy === 'normalizer' ? 'Avvio...' : 'Avvia Normalizer'}
                    </button>
                    <button className="btn-sm btn-outline" onClick={fetchRuns} style={{ marginLeft: 'auto' }}>
                        Aggiorna
                    </button>
                </div>
                {error && <p style={{ color: 'var(--primary)', marginTop: '0.75rem', fontSize: '0.85rem' }}>{error}</p>}
            </div>

            {expandedRun && (
                <div className="settings-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                        <h2 style={{ margin: 0 }}>
                            {expandedRun.job_type === 'scraper' ? 'Scraper' : 'Normalizer'} — Log
                        </h2>
                        <StatusBadge status={expandedRun.status} />
                        <span className="run-meta">{fmtDate(expandedRun.started_at)}</span>
                    </div>
                    <pre className="log-box" ref={logRef}>
                        {expandedRun.log || '(nessun output ancora)'}
                    </pre>
                </div>
            )}

            {runs.length > 0 && (
                <div className="settings-card">
                    <h2>Cronologia</h2>
                    <div className="run-list">
                        {runs.map(r => (
                            <div key={r.id} className="run-item">
                                <div
                                    className="run-item-header"
                                    onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                                >
                                    <span className={`run-job-badge`}>{r.job_type}</span>
                                    <StatusBadge status={r.status} />
                                    <span className="run-meta">
                                        {fmtDate(r.started_at)}
                                        {r.finished_at ? ` → ${fmtDate(r.finished_at)}` : ''}
                                    </span>
                                    <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                        {expandedId === r.id ? '▲' : '▼'}
                                    </span>
                                </div>
                                {expandedId === r.id && (
                                    <pre className="log-box" style={{ margin: '0.5rem', borderRadius: 'var(--radius-sm)' }}>
                                        {r.log || '(nessun output)'}
                                    </pre>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
}

// ── LLM Config Tab ─────────────────────────────────────────────────────────

function LlmTab() {
    const [config, setConfig] = useState<LlmConfig>({ llm_base_url: '', llm_model: '' });
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; models?: string[] } | null>(null);

    useEffect(() => {
        fetch(`${BASE}/api/impostazioni/llm-config`)
            .then(r => r.json())
            .then(d => setConfig({ llm_base_url: d.llm_base_url ?? '', llm_model: d.llm_model ?? '' }))
            .catch(e => setError(e.message));
    }, []);

    const save = async () => {
        setError(''); setSaved(false);
        try {
            const res = await fetch(`${BASE}/api/impostazioni/llm-config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config),
            });
            if (!res.ok) throw new Error(await res.text());
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch (e: any) {
            setError(e.message);
        }
    };

    const testLlm = async () => {
        setTesting(true); setTestResult(null);
        try {
            const res = await fetch(`${BASE}/api/impostazioni/diagnostics`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ check: 'llm', llm_base_url: config.llm_base_url }),
            });
            setTestResult(await res.json());
        } catch (e: any) {
            setTestResult({ ok: false, error: e.message });
        } finally {
            setTesting(false);
        }
    };

    return (
        <div className="settings-card">
            <h2>Configurazione LLM</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
                Configura l&apos;endpoint OpenAI-compatibile usato dal Normalizer (LM Studio, Ollama, OpenAI, ecc.).
            </p>
            <div className="field-group">
                <label>URL base API (es. http://localhost:1234/v1)</label>
                <input
                    type="text"
                    value={config.llm_base_url}
                    onChange={e => setConfig(c => ({ ...c, llm_base_url: e.target.value }))}
                    placeholder="http://localhost:1234/v1"
                />
            </div>
            <div className="field-group">
                <label>Modello (lascia vuoto per auto-detect)</label>
                <input
                    type="text"
                    value={config.llm_model}
                    onChange={e => setConfig(c => ({ ...c, llm_model: e.target.value }))}
                    placeholder="auto-detect"
                />
            </div>
            <div className="action-row">
                <button className="btn-sm btn-success" onClick={save}>
                    {saved ? 'Salvato!' : 'Salva'}
                </button>
                <button className="btn-sm btn-outline" onClick={testLlm} disabled={testing}>
                    {testing ? 'Test...' : 'Testa connessione'}
                </button>
            </div>
            {error && <p style={{ color: 'var(--primary)', marginTop: '0.75rem', fontSize: '0.85rem' }}>{error}</p>}
            {testResult && (
                <div className={`diag-result ${testResult.ok ? 'ok' : 'fail'}`}>
                    {testResult.ok
                        ? <>Connessione OK — Modelli: {testResult.models?.join(', ') || '(nessuno)'}</>
                        : <>Errore: {testResult.error}</>
                    }
                </div>
            )}
        </div>
    );
}

// ── Diagnostics Tab ────────────────────────────────────────────────────────

type DiagResult = { ok: boolean; error?: string; latency_ms?: number; models?: string[] };

function DiagnosticsTab() {
    const [results, setResults] = useState<Record<string, DiagResult | 'pending'>>({});

    const run = async (check: string) => {
        setResults(r => ({ ...r, [check]: 'pending' }));
        try {
            const res = await fetch(`${BASE}/api/impostazioni/diagnostics`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ check }),
            });
            const data = await res.json();
            setResults(r => ({ ...r, [check]: data }));
        } catch (e: any) {
            setResults(r => ({ ...r, [check]: { ok: false, error: e.message } }));
        }
    };

    const checks = [
        { id: 'db', label: 'Database PostgreSQL', desc: 'Verifica la connessione al database.' },
        { id: 'scraper_api', label: 'Scraper API', desc: 'Verifica che il servizio scraper_api sia raggiungibile.' },
        { id: 'llm', label: 'LLM API', desc: 'Verifica la connessione all\'endpoint LLM configurato.' },
    ];

    return (
        <>
            {checks.map(({ id, label, desc }) => {
                const res = results[id];
                return (
                    <div key={id} className="settings-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                            <div>
                                <h2>{label}</h2>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{desc}</p>
                            </div>
                            <button
                                className="btn-sm btn-outline"
                                onClick={() => run(id)}
                                disabled={res === 'pending'}
                                style={{ flexShrink: 0 }}
                            >
                                {res === 'pending' ? 'Test...' : 'Testa'}
                            </button>
                        </div>
                        {res && res !== 'pending' && (
                            <div className={`diag-result ${res.ok ? 'ok' : 'fail'}`}>
                                {res.ok
                                    ? <>
                                        OK
                                        {res.latency_ms !== undefined && ` — ${res.latency_ms} ms`}
                                        {res.models && res.models.length > 0 && ` — Modelli: ${res.models.join(', ')}`}
                                      </>
                                    : <>Errore: {res.error}</>
                                }
                            </div>
                        )}
                    </div>
                );
            })}
        </>
    );
}

// ── Root ───────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
    { id: 'stats', label: 'Statistiche' },
    { id: 'scraper', label: 'Scraper' },
    { id: 'llm', label: 'LLM' },
    { id: 'diagnostics', label: 'Diagnostica' },
];

export default function ImpostazioniClient() {
    const [activeTab, setActiveTab] = useState<Tab>('stats');

    return (
        <div className="impostazioni-page container">
            <div className="impostazioni-header">
                <h1>Impostazioni</h1>
                <p>Gestisci scraper, configurazione LLM e diagnostica.</p>
            </div>

            <div className="impostazioni-tabs">
                {TABS.map(t => (
                    <button
                        key={t.id}
                        className={`impostazioni-tab${activeTab === t.id ? ' active' : ''}`}
                        onClick={() => setActiveTab(t.id)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {activeTab === 'stats' && <StatsTab />}
            {activeTab === 'scraper' && <ScraperTab />}
            {activeTab === 'llm' && <LlmTab />}
            {activeTab === 'diagnostics' && <DiagnosticsTab />}
        </div>
    );
}

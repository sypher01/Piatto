FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY scraper.py normalize_ingredients.py ./

# Default command runs the scraper.
# Override with: docker compose run scraper python normalize_ingredients.py
CMD ["python", "scraper.py"]

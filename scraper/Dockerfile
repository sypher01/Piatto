FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY scraper.py normalize_ingredients.py scraper_api.py ./

# Default command runs the scraper.
# The scraper_api service overrides this CMD to: python scraper_api.py
CMD ["python", "scraper.py"]

FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# .env is only for local dev — Cloud Run injects env vars at runtime
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]

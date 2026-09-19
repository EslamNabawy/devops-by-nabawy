FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY hello.py .

EXPOSE 8081

ENV PORT=8081

CMD ["python", "hello.py"]

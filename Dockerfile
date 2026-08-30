FROM node:20-slim AS generator-deps
WORKDIR /report-builder/generator

COPY generator/package.json generator/package-lock.json ./

RUN npm ci --omit=dev

FROM python:3.12-slim
WORKDIR /report-builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    nodejs \
    libreoffice-writer \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --from=generator-deps \
    /report-builder/generator/node_modules \
    ./generator/node_modules

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
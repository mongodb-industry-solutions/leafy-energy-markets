# HOWTO: Run with Docker

This guide explains how to run Leafy Energy Markets using Docker Compose.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (v20+)
- [Docker Compose](https://docs.docker.com/compose/install/) (v2+)
- A MongoDB Atlas connection string
- An Anthropic API key or Azure AI Foundry credentials

## 1. Configure Environment

```bash
cp deploy/env.example deploy/.env
```

Edit `deploy/.env` with your credentials:

```env
# Required
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority

# LLM — choose one:
ANTHROPIC_API_KEY=sk-ant-...
# OR
AZURE_FOUNDRY_API_KEY=your-key
AZURE_FOUNDRY_ENDPOINT=https://your-endpoint.services.ai.azure.com/api

# Optional
VOYAGE_API_KEY=your-voyage-key
```

## 2. Build and Start

From the project root:

```bash
cd deploy
docker compose up --build
```

This builds both containers and starts them:
- **Backend** (FastAPI) → `http://localhost:8000`
- **Frontend** (Next.js) → `http://localhost:3000`

The frontend waits for the backend health check before starting.

## 3. Access the App

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 4. Stop

```bash
docker compose down
```

## 5. Rebuild After Code Changes

```bash
docker compose up --build
```

## Architecture

```
┌────────────────────┐      ┌────────────────────┐
│  frontend:3000     │─────▶│  backend:8000      │
│  Next.js 14        │ API  │  FastAPI            │
│  LeafyGreen UI     │ proxy│  Trading Simulator  │
└────────────────────┘      └────────┬───────────┘
                                     │
                            ┌────────▼───────────┐
                            │  MongoDB Atlas     │
                            │  (external)        │
                            └────────────────────┘
```

The frontend proxies `/api/*` requests to the backend container via Next.js rewrites. The `NEXT_PUBLIC_API_URL` environment variable controls the backend URL (defaults to `http://localhost:8000` for local dev, set to `http://backend:8000` in Docker).

## Troubleshooting

### Backend won't start
- Check `deploy/.env` has a valid `MONGO_URI`
- Check Docker logs: `docker compose logs backend`

### Frontend can't reach backend
- Ensure the backend health check passes: `docker compose ps`
- The frontend depends on the backend being healthy before it starts

### LLM not responding
- Verify `ANTHROPIC_API_KEY` or `AZURE_FOUNDRY_*` credentials in `deploy/.env`
- Check backend logs: `docker compose logs backend`

### Slow first build
- The initial build downloads Python/Node dependencies. Subsequent builds use Docker layer caching and are much faster.

### Hot reload (development)
- Docker builds are for production. For development with hot reload, use:
  ```bash
  ./start-demo.sh
  ```

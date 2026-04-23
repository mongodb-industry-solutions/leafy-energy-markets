# HOWTO: Run the Demo with Docker

## Prerequisites

- [Docker Desktop](https://docs.docker.com/get-docker/) (v20+) — make sure it's running
- A MongoDB Atlas connection string ([free tier works](https://www.mongodb.com/cloud/atlas/register))
- An Anthropic API key ([get one here](https://console.anthropic.com))

## Step 1: Configure

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority
ANTHROPIC_API_KEY=sk-ant-...
```

That's it. The demo works with just these two values. VoyageAI embeddings are optional (falls back automatically).

## Step 2: Run

```bash
docker compose up --build
```

First build takes ~2 minutes (downloads Python/Node dependencies). Subsequent runs use Docker cache and start in seconds.

## Step 3: Open

Go to **[http://localhost:3000](http://localhost:3000)**

## Demo Walkthrough

1. **Landing Page** — Click "Open Dashboard" to enter
2. **Dashboard** — Click "Start Simulation" to begin streaming live fleet data
   - Watch 8 European energy assets generate output in real-time
   - **Fleet Generation Value** shows the hourly revenue opportunity (output × best price)
   - Allocate capacity per asset type, select a market channel, and click **Trade**
   - **Captured Revenue** fills up the progress bar toward the daily target
3. **EnerLeafy AI** — Ask the AI advisor about your fleet. Try "Trade Recommendations" for optimal allocation strategy
   - Click **"Trigger Iberian Storm"** on the map to simulate a weather event (ES/PT solar drops to <20%)
   - Then ask the AI advisor for updated recommendations — it will factor in the storm
4. **Auditing** — Step through the Imbalance Settlement scenario event by event, watching `fold()` reconstruct state
5. **CQRS** — Read why Event Sourcing + CQRS is purpose-built for EU energy compliance
6. **Architecture** — Click any tile in the container diagram for detailed explanations

## What Works Without API Keys

| Feature | Needs MongoDB? | Needs LLM? |
|---------|---------------|------------|
| Trading Dashboard (fleet, prices, trades) | No | No |
| Position Gap + Revenue Tracker | No | No |
| Fleet Generation Value | No | No |
| Weather Alert (Iberian Storm) | No | No |
| EnerLeafy AI Advisor | Yes | Yes |
| Auditing (Event Replay) | No | Deep Analysis only |
| CQRS Explainer | No | No |
| Architecture Diagram | No | No |

The trading simulator runs entirely in-memory — no database needed for the core dashboard experience.

## Stopping

```bash
docker compose down
```

## Rebuilding After Changes

```bash
docker compose up --build
```

## Architecture

```
┌─────────────────────┐      ┌─────────────────────┐
│  frontend           │      │  backend             │
│  localhost:3000     │─────▶│  localhost:8000      │
│                     │ /api │                       │
│  Next.js 14        │proxy │  FastAPI              │
│  LeafyGreen UI     │      │  Trading Simulator    │
└─────────────────────┘      └──────────┬───────────┘
                                        │
                               ┌────────▼───────────┐
                               │  MongoDB Atlas     │
                               │  (your cluster)    │
                               └────────────────────┘
```

The frontend container proxies all `/api/*` requests to the backend container via Next.js rewrites. Both containers are on the same Docker network.

## Troubleshooting

**Docker not found**: Make sure Docker Desktop is installed and running.

**Backend health check failing**: Check your `MONGO_URI` is correct. View logs:
```bash
docker compose logs backend
```

**AI advisor not responding**: Verify your `ANTHROPIC_API_KEY` starts with `sk-ant-`. View logs:
```bash
docker compose logs backend | grep -i "llm\|anthropic\|azure"
```

**Port already in use**: Stop any local servers first:
```bash
lsof -ti :3000 | xargs kill 2>/dev/null
lsof -ti :8000 | xargs kill 2>/dev/null
```

**Slow first build**: Normal — downloads ~500MB of dependencies. Cached after first build.

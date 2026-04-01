# CLAUDE.md — Leafy Energy Markets

## Project Overview

Full-stack **European energy market demo** showcasing MongoDB Atlas, CQRS + Event Sourcing, real-time telemetry, and AI-driven compliance auditing.

- **Frontend**: Next.js 14 (app router), LeafyGreen UI, Emotion CSS, Three.js (R3F v8)
- **Backend**: FastAPI, PyMongo, LangChain ReAct agent, VoyageAI embeddings
- **DB**: MongoDB Atlas — database `leafy-energy-markets`
- **LLM**: Claude (`claude-opus-4-6`) via Azure AI Foundry (primary) or Anthropic direct (fallback)

---

## Quick Start

```bash
# One-command (starts backend + frontend, kills stale processes first)
./start-demo.sh

# Or separately:
./start-backend.sh   # FastAPI on :8000 — uses ./venv/ (Python 3.12)
./start-frontend.sh  # Next.js on :3000

# Logs
tail -f /tmp/leafy-backend.log
tail -f /tmp/leafy-frontend.log
```

**Environment**: copy `deploy/env.example` → `deploy/.env`. Required keys:
- `MONGO_URI`
- `ANTHROPIC_API_KEY` OR `AZURE_FOUNDRY_API_KEY` + `AZURE_FOUNDRY_ENDPOINT`
- `VOYAGE_API_KEY` (optional — falls back to deterministic hash embeddings)

---

## Repository Layout

```
leafy-energy-markets/
├── frontend/               # Next.js 14 app
│   ├── app/                # 12 page routes
│   ├── components/         # 41 components across 8 subdirectories
│   ├── lib/                # 14 utility/context files
│   ├── next.config.js      # API rewrites → :8000, 180s proxy timeout
│   └── .npmrc              # legacy-peer-deps=true (React 18 + R3F compat)
├── backend/
│   ├── app/
│   │   ├── api/            # 7 FastAPI routers
│   │   ├── domain/         # Event Sourcing: events, aggregates, commands
│   │   ├── infrastructure/ # db, event_store, embeddings, search, seed scripts
│   │   └── projections/    # Change Stream read model builders
│   └── requirements.txt
├── deploy/
│   ├── env.example         # All required env var keys documented here
│   ├── .env                # Actual secrets (gitignored)
│   └── docker-compose.yml
├── docs/scenarios/         # 4 EU compliance scenario docs
├── start-demo.sh           # Master startup script
└── venv/                   # Python 3.12 virtualenv (do not commit)
```

---

## Key Files by Task

| Task | File |
|------|------|
| Add/change a page | `frontend/app/<route>/page.tsx` |
| Add a shared component | `frontend/components/shared/` |
| API client (frontend) | `frontend/lib/api.ts` |
| Shared TypeScript types | `frontend/lib/types.ts` |
| Mock/fallback data | `frontend/lib/mock-data.ts` |
| Telemetry generator | `frontend/lib/generator-context.tsx` |
| Compliance scenarios | `frontend/lib/compliance-scenarios.ts` |
| Backend router | `backend/app/api/<module>.py` |
| LLM provider logic | `backend/app/api/advisor.py` → `_get_llm()` |
| Domain events | `backend/app/domain/events.py` |
| Event store (append-only) | `backend/app/infrastructure/event_store.py` |
| Embeddings (VoyageAI + fallback) | `backend/app/infrastructure/embeddings.py` |
| FastAPI app + CORS | `backend/app/main.py` |

---

## Architecture Decisions

### LLM Auto-Detection (`advisor.py::_get_llm()`)
1. Uses Azure AI Foundry if `AZURE_FOUNDRY_API_KEY` + `AZURE_FOUNDRY_ENDPOINT` are set
2. Falls back to Anthropic direct if `ANTHROPIC_API_KEY` starts with `"sk-ant-"`
3. Model: `claude-opus-4-6`, temp=0.3, max_tokens=4096
4. Expect ~15–30s response times for complex advisor queries

### Embeddings (`embeddings.py`)
- Primary: VoyageAI `voyage-finance-2` (1024-dim)
- Fallback: deterministic hash-based embedding — works without any API key

### Frontend Fallback Chain
- Backend available → real API calls
- Backend unavailable → simulated metrics + `mock-data.ts`
- SSE stream error → simulation mode (no hard crash)

### Telemetry Generator
- Controlled via `generator-context.tsx` (defaults to backend mode)
- `startTelemetry()` stops stale backend generator before starting a new one (prevents 409)
- 8 simulated European energy originators (Spanish solar, Dutch wind, German gas, etc.)

### npm Resolution
`frontend/.npmrc` sets `legacy-peer-deps=true` — **do not remove** — required for React 18 + Three.js R3F v8 peer dependency coexistence.

### Event Sourcing + CQRS
- Events are append-only; never update/delete from `events` collection
- `fold()` in `aggregates.py` replays events to rebuild aggregate state
- Read models are built by MongoDB Change Stream projections in `projections/`

---

## Frontend Navigation (7 tabs)

| Tab | Route | Description |
|-----|-------|-------------|
| Dashboard | `/dashboard` | Portfolio positions + 24h exposure chart |
| EnerLeafy AI | `/leafy` | LangChain ReAct advisor chat |
| Auditing | `/audit` | EU compliance scenario replay (Event Inspector) |
| CQRS | `/cqrs` | CQRS pattern explainer |
| Architecture | `/architecture` | System diagram visualization |
| VPP (3D) | `/telemetry` | Real-time telemetry + Three.js VPP globe |
| Evals | `/evals` | RAGAS evaluation dashboard |

---

## Backend API Summary

Base URL: `http://localhost:8000` (proxied via Next.js `/api/*` rewrites)

Key endpoints:
- `POST /api/commands/scenarios` — create tariff scenario
- `GET /api/queries/scenarios` — list scenarios
- `GET /api/queries/events/{stream_id}` — fetch event stream
- `POST /api/search/hybrid` — hybrid vector + text search
- `POST /api/advisor/chat` — LangChain ReAct agent (SSE)
- `POST /api/telemetry/start` — start load generator
- `DELETE /api/telemetry/stop` — stop load generator
- `GET /api/telemetry/stream` — SSE metrics stream
- `POST /api/audit/analyze` — LLM compliance analysis

Full 21-endpoint table: see `README.md`.

---

## Development Workflow

### Backend changes
```bash
# Backend auto-reloads (uvicorn --reload)
# Activate venv first if running manually:
source venv/bin/activate
cd backend && uvicorn app.main:app --reload --port 8000
```

### Frontend changes
```bash
cd frontend && npm run dev   # Hot reload
npm run build                # Production check (run before PRs)
npm run lint                 # ESLint
```

### Adding a new backend endpoint
1. Add route handler to the appropriate `backend/app/api/<module>.py`
2. Add typed fetch function to `frontend/lib/api.ts`
3. Update `frontend/lib/types.ts` if new request/response types are needed

### Adding a new domain event
1. Define the event dataclass in `backend/app/domain/events.py`
2. Handle it in `backend/app/domain/aggregates.py::fold()`
3. Append via `EventStore.append()` in the relevant API command handler

---

## EU Compliance Scenarios (Audit Tab)

Two pre-built regulatory replay scenarios in `frontend/lib/compliance-scenarios.ts`:

1. **Imbalance Settlement Audit** — EU 2017/2195
2. **REMIT Trade Surveillance** — EU 1227/2011

Each scenario has a full event stream that can be replayed step-by-step and analyzed by the LLM audit endpoint.

---

## MongoDB Collections

| Collection | Purpose |
|------------|---------|
| `events` | Append-only event store. Unique index: `{streamId, version}` |
| `telemetry_events` | Time-series collection: `{timestamp, event_type, measurements}` |
| `tariff_scenarios` | Read model projection from Change Streams |
| `market_documents` | Research docs with VoyageAI embeddings (hybrid search) |

---

## Common Pitfalls

- **409 on telemetry start**: stale generator running — `DELETE /api/telemetry/stop` first, or restart backend
- **LLM timeout**: Azure Foundry responses can take 15–30s; `next.config.js` sets 180s proxy timeout — do not lower
- **npm install fails**: always run inside `frontend/` with `legacy-peer-deps=true` in `.npmrc`
- **Embeddings return wrong dimensions**: `VOYAGE_API_KEY` missing → hash fallback active (expected; 1024-dim shape preserved)
- **Backend won't start**: check `deploy/.env` exists with `MONGO_URI` set; venv must be Python 3.12

#!/bin/bash

# Start Demo Script
# This script kills stale processes, frees ports, then starts all services

echo "🚀 Starting Leafy Energy Markets Demo..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Navigate to project root
cd "$(dirname "$0")"

# ── Kill previous processes and free ports ─────────────────
echo "🧹 Cleaning up previous processes..."

# Kill by process name (catches orphans not bound to a port yet)
pkill -9 -f "uvicorn app.main:app" 2>/dev/null || true
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "promptfoo view" 2>/dev/null || true

# Kill anything still holding our ports
for PORT in 8000 3000 15500; do
    PIDS=$(lsof -ti ":$PORT" 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
        echo "   Killing PIDs on port $PORT: $PIDS"
        echo "$PIDS" | xargs kill -9 2>/dev/null || true
    fi
done

sleep 1
echo "✅ Ports 8000, 3000, 15500 cleared"
echo ""

# ── Cleanup on exit ────────────────────────────────────────
cleanup() {
    echo ""
    echo "🛑 Stopping servers..."
    kill $BACKEND_PID $FRONTEND_PID $PROMPTFOO_PID 2>/dev/null || true
    wait $BACKEND_PID $FRONTEND_PID $PROMPTFOO_PID 2>/dev/null || true
    echo "✅ Servers stopped"
    exit 0
}

# Set trap to cleanup on script exit
trap cleanup SIGINT SIGTERM EXIT

# ── Start backend ──────────────────────────────────────────
echo "🔧 Starting backend server..."
./start-backend.sh > /tmp/leafy-backend.log 2>&1 &
BACKEND_PID=$!

# Wait for backend to respond
for i in $(seq 1 20); do
    if curl -s -o /dev/null http://127.0.0.1:8000/ 2>/dev/null; then
        echo "✅ Backend started (PID: $BACKEND_PID)"
        break
    fi
    if [ "$i" -eq 20 ]; then
        echo "❌ Backend failed to start. Check /tmp/leafy-backend.log for details"
        cat /tmp/leafy-backend.log
        exit 1
    fi
    sleep 1
done
echo ""

# ── Start frontend ─────────────────────────────────────────
echo "🎨 Starting frontend server..."
./start-frontend.sh > /tmp/leafy-frontend.log 2>&1 &
FRONTEND_PID=$!

# Wait for frontend to respond
for i in $(seq 1 30); do
    if curl -s -o /dev/null http://localhost:3000/ 2>/dev/null; then
        echo "✅ Frontend started (PID: $FRONTEND_PID)"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "❌ Frontend failed to start. Check /tmp/leafy-frontend.log for details"
        cat /tmp/leafy-frontend.log
        exit 1
    fi
    sleep 1
done
echo ""

# ── Start promptfoo viewer ─────────────────────────────────
echo "🧪 Starting promptfoo viewer..."
cd backend && npx promptfoo@latest view > /tmp/leafy-promptfoo.log 2>&1 &
PROMPTFOO_PID=$!
cd ..

for i in $(seq 1 15); do
    if curl -s -o /dev/null http://localhost:15500/ 2>/dev/null; then
        echo "✅ Promptfoo viewer started (PID: $PROMPTFOO_PID)"
        break
    fi
    if [ "$i" -eq 15 ]; then
        echo "⚠️  Promptfoo viewer may not have started. Check /tmp/leafy-promptfoo.log"
        break
    fi
    sleep 1
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Demo is ready!"
echo ""
echo "📍 Backend:   http://127.0.0.1:8000"
echo "📍 Frontend:  http://localhost:3000"
echo "📍 Evals:     http://localhost:15500"
echo "📍 API Docs:  http://127.0.0.1:8000/docs"
echo ""
echo "📝 Logs:"
echo "   Backend:   /tmp/leafy-backend.log"
echo "   Frontend:  /tmp/leafy-frontend.log"
echo "   Promptfoo: /tmp/leafy-promptfoo.log"
echo ""
echo "🛑 Press CTRL+C to stop all servers"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Wait for background processes
wait $BACKEND_PID $FRONTEND_PID $PROMPTFOO_PID

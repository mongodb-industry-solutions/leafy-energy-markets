#!/bin/bash

# Start Demo Script
# This script starts both backend and frontend servers in parallel

echo "🚀 Starting Leafy Energy Markets Demo..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Navigate to project root
cd "$(dirname "$0")"

# Function to cleanup background processes on exit
cleanup() {
    echo ""
    echo "🛑 Stopping servers..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
    echo "✅ Servers stopped"
    exit 0
}

# Set trap to cleanup on script exit
trap cleanup SIGINT SIGTERM EXIT

# Start backend in background
echo "🔧 Starting backend server..."
./start-backend.sh > /tmp/leafy-backend.log 2>&1 &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 3

# Check if backend is still running
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo "❌ Backend failed to start. Check /tmp/leafy-backend.log for details"
    cat /tmp/leafy-backend.log
    exit 1
fi

echo "✅ Backend started (PID: $BACKEND_PID)"
echo ""

# Start frontend in background
echo "🎨 Starting frontend server..."
./start-frontend.sh > /tmp/leafy-frontend.log 2>&1 &
FRONTEND_PID=$!

# Wait a moment for frontend to start
sleep 5

# Check if frontend is still running
if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    echo "❌ Frontend failed to start. Check /tmp/leafy-frontend.log for details"
    cat /tmp/leafy-frontend.log
    exit 1
fi

echo "✅ Frontend started (PID: $FRONTEND_PID)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Demo is ready!"
echo ""
echo "📍 Backend:  http://127.0.0.1:8000"
echo "📍 Frontend: http://localhost:3000"
echo "📍 API Docs: http://127.0.0.1:8000/docs"
echo ""
echo "📝 Logs:"
echo "   Backend:  /tmp/leafy-backend.log"
echo "   Frontend: /tmp/leafy-frontend.log"
echo ""
echo "🛑 Press CTRL+C to stop all servers"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Wait for background processes
wait $BACKEND_PID $FRONTEND_PID

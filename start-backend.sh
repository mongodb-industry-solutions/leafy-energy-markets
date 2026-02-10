#!/bin/bash

# Start Backend Server Script
# This script activates the virtual environment and starts the FastAPI backend

echo "🚀 Starting Leafy Energy Markets Backend..."
echo ""

# Navigate to project root
cd "$(dirname "$0")"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found!"
    echo "Creating virtual environment with Python 3.12..."
    python3.12 -m venv venv
    echo "✅ Virtual environment created"
    echo ""
fi

# Activate virtual environment
echo "📦 Activating virtual environment..."
source venv/bin/activate

# Check if dependencies are installed
if ! python -c "import fastapi" &> /dev/null; then
    echo "📥 Installing backend dependencies..."
    cd backend
    pip install -r requirements.txt
    cd ..
    echo "✅ Dependencies installed"
    echo ""
fi

# Navigate to backend directory and start server
cd backend
echo "🔥 Starting uvicorn server on http://127.0.0.1:8000"
echo "📝 Press CTRL+C to stop"
echo ""

uvicorn app.main:app --reload --port 8000

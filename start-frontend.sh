#!/bin/bash

# Start Frontend Server Script
# This script starts the Next.js frontend development server

echo "🚀 Starting Leafy Energy Markets Frontend..."
echo ""

# Navigate to project root
cd "$(dirname "$0")"

# Navigate to frontend directory
cd frontend

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📥 Installing frontend dependencies..."
    npm install
    echo "✅ Dependencies installed"
    echo ""
fi

# Start Next.js development server
echo "🔥 Starting Next.js dev server on http://localhost:3000"
echo "📝 Press CTRL+C to stop"
echo ""

npm run dev

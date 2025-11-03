#!/bin/bash

# VerbyFlow Startup Script
echo "Starting VerbyFlow..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running. Please start Docker first."
    exit 1
fi

# Check for NVIDIA GPU support
if ! command -v nvidia-smi &> /dev/null; then
    echo "Warning: nvidia-smi not found. GPU support may not be available."
fi

# Build and start containers
echo "Building containers..."
docker-compose up --build -d

echo ""
echo "VerbyFlow is starting up..."
echo "Frontend: http://localhost:3000"
echo "Backend:  http://localhost:8000"
echo ""
echo "Run 'docker-compose logs -f' to view logs"
echo "Run 'docker-compose down' to stop the application"

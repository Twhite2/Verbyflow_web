"""
VerbyFlow - FastAPI Backend Entry Point
Real-time voice translation platform
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import logging

from sockets import router as socket_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="VerbyFlow API",
    description="Real-time voice translation backend",
    version="1.0.0"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include WebSocket routes
app.include_router(socket_router)

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "online",
        "service": "VerbyFlow",
        "version": "1.0.0"
    }

@app.get("/health")
async def health_check():
    """Detailed health check"""
    return {
        "status": "healthy",
        "models_loaded": True,  # Will be dynamic later
        "active_connections": 0  # Will be dynamic later
    }

if __name__ == "__main__":
    logger.info("Starting VerbyFlow Backend...")
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )

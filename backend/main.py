"""
VerbyFlow - FastAPI Backend Entry Point
Real-time voice translation platform
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import logging
import asyncio
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from sockets import router as socket_router
from logging_config import setup_logging

# Configure logging with file output
log_filename = setup_logging()
logger = logging.getLogger(__name__)
logger.info(f"📝 Backend logs saved to: {log_filename}")

# Initialize FastAPI app
app = FastAPI(
    title="VerbyFlow API",
    description="Real-time voice translation backend",
    version="1.0.0"
)

@app.on_event("startup")
async def startup_event():
    """
    Preload ALL AI models at startup to eliminate first-call latency
    Includes: Whisper, MarianMT (en-es, es-en), XTTS-v2
    """
    logger.info("🚀 Preloading all AI models (Whisper, MarianMT, XTTS)...")
    
    from model_loader import preload_all_models
    
    try:
        await preload_all_models()
        logger.info("✅ All AI models preloaded and ready!")
    except Exception as e:
        logger.error(f"Model preload failed: {e}", exc_info=True)
        logger.warning("⚠️ Server will continue but first calls may be slow")

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

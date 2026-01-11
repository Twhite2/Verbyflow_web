"""
Logging configuration with file output
"""
import logging
import os
from datetime import datetime

def setup_logging():
    """Setup logging to both file and console"""
    
    # Create logs directory
    os.makedirs("logs", exist_ok=True)
    
    # Create log filename with timestamp
    log_filename = f"logs/backend_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
    
    # Configure root logger
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            # File handler
            logging.FileHandler(log_filename, encoding='utf-8'),
            # Console handler
            logging.StreamHandler()
        ]
    )
    
    logger = logging.getLogger(__name__)
    logger.info(f"✅ Logging initialized - writing to {log_filename}")
    
    return log_filename

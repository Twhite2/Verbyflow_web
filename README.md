# VerbyFlow 🗣️🌍

> Connect beyond language barriers with real-time voice translation

VerbyFlow is a modern Omegle-style platform that enables anonymous users to connect via audio/video and communicate in different languages with real-time translation, voice replication, and transcription.

## Features

- **Anonymous Random Pairing** - Connect instantly with users worldwide like Omegle
- **Real-time Voice Translation** - Speak your language, they hear theirs
- **AI-Powered STT/TTS** - Whisper for speech-to-text, Dia for text-to-speech
- **No Database** - Fully ephemeral, privacy-focused connections
- **GPU Accelerated** - CUDA-enabled for fast local model inference
- **Dockerized** - Easy deployment with docker-compose

## Tech Stack

### Frontend
- **Next.js 15** (React 19)
- **Tailwind CSS** + Shadcn UI
- **Zustand** for state management
- **Web Audio API** for microphone capture
- **WebSockets** for real-time communication

### Backend
- **FastAPI** (Python)
- **WebSockets** for connection management
- **Whisper** for Speech-to-Text
- **Dia (Nari Labs)** for Text-to-Speech
- **MarianMT** for translation
- **PyTorch** with CUDA support

## Project Structure

```
verbyflow/
├── frontend/              # Next.js application
│   ├── app/              # Next.js 15 app directory
│   ├── components/       # React components
│   ├── lib/              # Utilities and stores
│   └── package.json
│
├── backend/              # FastAPI application
│   ├── main.py          # Entry point
│   ├── sockets.py       # WebSocket logic
│   ├── stt.py           # Whisper integration
│   ├── tts.py           # TTS integration
│   ├── translator.py    # Translation module
│   └── requirements.txt
│
├── docker/              # Docker configuration
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   ├── docker-compose.yml
│   └── start.sh
│
└── README.md
```

## Quick Start

### Prerequisites

- Docker & Docker Compose
- NVIDIA GPU (optional but recommended)
- NVIDIA Container Toolkit (for GPU support)

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd verbyflow
```

2. **Start with Docker** (Recommended)
```bash
cd docker
chmod +x start.sh
./start.sh
```

Or manually:
```bash
docker-compose up --build
```

3. **Access the application**
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000

### Development Setup

#### Backend (Without Docker)

```bash
cd backend
pip install -r requirements.txt
python main.py
```

The backend will run on http://localhost:8000

#### Frontend (Without Docker)

```bash
cd frontend
npm install
npm run dev
```

The frontend will run on http://localhost:3000

## Usage

1. **Open the app** at http://localhost:3000
2. **Select your language** from the dropdown
3. **Click "Find Partner"** to connect with someone
4. **Start speaking** when paired - your voice will be translated in real-time
5. **Click "Disconnect"** to end the conversation and find a new partner

## Configuration

### Language Support

Currently supported languages:
- English (en)
- Spanish (es)
- French (fr)
- German (de)
- Italian (it)
- Portuguese (pt)
- Chinese (zh)
- Japanese (ja)

Add more in `backend/translator.py`

### Model Configuration

Edit `backend/stt.py` to change Whisper model size:
- `tiny` - Fastest, less accurate
- `base` - Good balance (default)
- `small` - More accurate
- `medium` - Very accurate
- `large` - Best quality, slower

## Architecture

### Connection Flow

1. User connects → WebSocket opened
2. User clicks "Find Partner" → Added to waiting queue
3. When another user connects → Pair created
4. Audio captured from mic → Sent to backend
5. Backend: Audio → STT → Translation → TTS
6. Translated audio sent back to partner
7. Partner hears in their language

### WebSocket Events

**Client → Server:**
- `find_partner` - Request pairing
- `audio_chunk` - Audio data (base64)
- `disconnect` - End session

**Server → Client:**
- `connected` - Connection established
- `searching` - Looking for partner
- `partner_found` - Paired successfully
- `audio_response` - Translated audio
- `partner_disconnected` - Partner left

## API Endpoints

### REST
- `GET /` - Health check
- `GET /health` - Detailed status
- `GET /stats` - Connection statistics

### WebSocket
- `WS /ws/{user_id}?lang={language}` - Main connection endpoint

## Deployment

### GPU Cloud Hosting

Deploy to RunPod, Paperspace, or Lambda Labs:

1. **Upload project files**
2. **Ensure NVIDIA drivers installed**
3. **Run docker-compose**
```bash
docker-compose up -d
```

4. **Open required ports:** 3000, 8000

### Environment Variables

Create `.env` file (optional):
```env
# Backend
WHISPER_MODEL_SIZE=base
MAX_CONCURRENT_CONNECTIONS=100

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Performance

- **Whisper base model:** ~1-2s latency
- **Translation:** ~100-300ms
- **TTS generation:** ~500ms-1s
- **Total roundtrip:** ~2-4s

GPU acceleration reduces latency by 3-5x.

## Troubleshooting

### No GPU detected
```bash
# Check NVIDIA driver
nvidia-smi

# Install NVIDIA Container Toolkit
# https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html
```

### WebSocket connection fails
- Check backend is running on port 8000
- Verify CORS settings in `backend/main.py`
- Check firewall rules

### Microphone not working
- Grant browser microphone permissions
- Use HTTPS in production (required for mic access)

### Models not loading
- Check disk space (models are ~1-5GB)
- Verify internet connection for first download
- Models cached in `/root/.cache` (Docker volume)

## Future Enhancements

- [ ] Video support
- [ ] Text chat overlay
- [ ] User filters (by language/region)
- [ ] Voice cloning for natural translation
- [ ] Mobile app (React Native)
- [ ] Moderation tools
- [ ] Optional user accounts
- [ ] Session recording (opt-in)

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - See LICENSE file for details

## Acknowledgments

- OpenAI Whisper for STT
- Nari Labs' Dia for TTS
- Helsinki-NLP for MarianMT models
- FastAPI and Next.js communities

## Support

For issues or questions:
- Open a GitHub issue
- Check the documentation
- Review existing issues

---

**Built with ❤️ for breaking language barriers**

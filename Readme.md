# Touch Grass Birder

An offline-first bird call identifier built with open-source AI.

Point your phone at a bird call, get a species ID in seconds, then put your phone away and go find the bird.

Built for Hacktoberfest 2026 — Week 1: Touch Grass.

## Why This Exists

Every cloud-based bird ID app fails exactly where birds are — in forests, mountains, and trails with no signal. BirdNET runs on-device with no network, no API keys, and no data leaving your machine. The open model is not a nice-to-have; it's the only thing that works in the field.

## The Open Stack

- BirdNET — open acoustic classifier from the Cornell Lab of Ornithology. 6,522 species, open weights, runs locally.
- BirdNET V2.4 — TFLite model via LiteRT runtime (no TensorFlow required).
- Geo model — separate 7 MB model that filters species by latitude, longitude, and week.
- FastAPI — local backend for audio processing.
- React + Vite — frontend with a "record 6 seconds, put phone away" UX.

No OpenAI. No cloud inference. No API keys.

## Architecture

Browser (React)
  |  record 6s or upload audio
  v
FastAPI backend
  |  convert to 48kHz mono WAV (pydub)
  v
Worker process (mp.Pool, 1 worker)
  |  geo model -> species filter set
  |  acoustic model -> predictions
  v
JSONL sighting log + JSON response

## Status

Work in progress.

- [x] Audio recording + upload UI
- [x] Backend audio conversion pipeline
- [x] BirdNET acoustic model integration
- [x] Geo model filtering
- [x] Sighting log
- [ ] PWA wrapper (offline install)
- [ ] End-to-end field testing
- [ ] dev.to writeup

## Setup

### Prerequisites

- Python 3.11 or 3.12
- Node.js 18+
- ffmpeg on PATH (required by pydub)

### Backend

From the project root:

    python -m venv my_venv
    source my_venv/Scripts/activate    # Windows Git Bash
    pip install -r backend/requirements.txt

Run the backend:

    uvicorn server:app --host 0.0.0.0 --port 8000 --reload

The first startup downloads the BirdNET model (~50 MB). Subsequent runs are cached.

### Frontend

    cd frontend
    npm install
    npm run dev

Frontend runs on http://localhost:5173 and posts to http://localhost:8000/api/identify.

## API

### POST /api/identify

Multipart form fields:

| Field | Type | Required | Description |
|---|---|---|---|
| audio_file | file | yes | Audio recording (webm, wav, mp3, etc.) |
| lat | float | no | Latitude for geo filtering |
| lon | float | no | Longitude for geo filtering |
| week | int | no | Week of year (1-48) |

Response:

    {
      "species": "Poecile atricapillus_Black-capped Chickadee",
      "confidence": 0.87,
      "alternative": [
        { "species": "Poecile carolinensis_Carolina Chickadee", "confidence": 0.11 }
      ]
    }

## Why Open Innovation Matters

- Offline-only capability. Closed bird ID APIs cannot work where birds are. Every closed identifier needs a round trip to a server. The best places to hear birds are exactly the places with no signal.
- Privacy. Location data stays on device. A rare sighting is sensitive; a closed app learns where you were and when.
- Cost. No API bills, no rate limits. A free public tool is only viable with open weights.
- Control. You can swap models, fine-tune on local species, or modify behavior. None of that is possible with a closed endpoint.

## License

MIT

## Acknowledgments

- BirdNET team at Cornell Lab of Ornithology and Chemnitz University of Technology
- Hacktoberfest 2026 organizers
# Touch Grass Birder

An offline, on-device bird call identifier that runs entirely in your browser. Record a bird call, get a species ID in seconds, then put your phone away and go find the bird.

Built for Hacktoberfest 2026 — Week 1: Touch Grass.

Live demo: [ADD YOUR VERCEL URL HERE]

## Why This Exists

Every cloud-based bird ID app fails exactly where birds are — in forests, mountains, and trails with no signal. BirdNET runs on your device with no network, no API keys, and no audio ever leaving your phone. The open model isn't a nice-to-have; it's the only thing that works in the field.

## The Open Stack

- BirdNET v2.4 — open acoustic classifier from the Cornell Lab of Ornithology. 6,522 species, open weights, trained on real-world recordings.
- ONNX Runtime Web — open-source inference engine. Runs the model via WebAssembly directly in the browser.
- React + Vite — frontend with a minimal "record 6 seconds, put phone away" UX.
- vite-plugin-pwa — makes the app installable and offline-capable.

No OpenAI. No cloud inference. No API keys. No cost.

## How It Works
```
Microphone captures 6 seconds of audio.
MediaRecorder produces a WebM/Opus Blob.
Web Audio API decodes and resamples to 48 kHz.
Audio is chunked into 3-second windows with 1.5s overlap.
Web Worker sends each chunk to ONNX Runtime WASM running BirdNET v2.4.
Sigmoid converts logits to confidence scores for 6,522 species.
Results are sorted and filtered (>25% confidence) to produce the top match and alternatives.
If confidence is high, a bird image is fetched from iNaturalist.

Everything happens on-device. The model is cached in the browser's Cache Storage on first load, so subsequent opens work with zero network.
```

## Features

- Fully offline after first load (works in airplane mode)
- Runs entirely in the browser — no backend, no server
- Open-weight AI (BirdNET v2.4 INT8 ARM, ~47 MB)
- Installable as a PWA (add to home screen)
- Zero API cost, zero rate limits
- Audio never leaves the device
- Low-confidence handling — tells you when it isn't sure instead of guessing

## Project Structure

```
frontend/
├── public/
│   ├── onnx/
│   │   ├── ort.min.js
│   │   ├── ort-wasm-simd-threaded.wasm
│   │   └── ort-wasm-simd-threaded.mjs
│   ├── icon-192.png
│   └── icon-512.png
├── pages/
│   ├── Home.jsx
│   └── Record.jsx
├── src/
│   ├── audio.js
│   ├── model.js
│   ├── inference-worker.js
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── vite.config.js
├── package.json
└── index.html
```

## Run Locally

Requires Node.js 18+.
```
cd frontend
npm install
npm run dev

Open http://localhost:5173.

First launch downloads the BirdNET model (~47 MB) from Hugging Face and caches it in the browser. Subsequent launches load instantly from disk.
```

## Build the PWA
```
cd frontend
npm run build
npm run preview

The service worker and manifest are generated automatically by vite-plugin-pwa into dist/.

To test offline:
1. Load the app once with network (wait for the model to download).
2. Open DevTools, Network tab, set throttling to Offline.
3. Reload — the app should still load and identify birds.
```

## Model Sources

- Model: tphakala/BirdNET-v2.4 on Hugging Face — BirdNET_v2.4_int8_arm.onnx
- Labels: tphakala/BirdNET-v2.4 on Hugging Face — labels.txt
- Bird images: iNaturalist API (research-grade observations)

## Why Open Innovation Matters

This project would not exist without open-source AI.

1. Offline capability. A closed bird ID API requires a network round trip. The best places to hear birds are exactly the places with no signal. Only an open-weight model can be downloaded to the device and run locally.

2. Privacy. A rare sighting is sensitive — it reveals where you were and when. With a closed API, that data goes to a company server. With BirdNET running on-device, the audio never leaves the phone.

3. Zero cost. No API bills, no rate limits, no monthly fees. A free public tool is only viable with open weights.

4. Portability. The same model runs on Python, Node.js, Raspberry Pi, and the browser via ONNX Runtime. No vendor lock-in.

5. Verifiability. Anyone can inspect the model, fine-tune it, or replace it. Closed systems give you a black box.

## Limitations and Future Work

- Accuracy depends on audio quality. The model performs best on clear, close bird calls. Ambient noise reduces confidence.
- 6,522 species only. Species outside BirdNET's class list will not be identified.
- No geographic filtering yet. A future version could intersect results with a location-based species list using BirdNET's geo model.
- Single-threaded inference. For maximum browser compatibility, ONNX Runtime runs single-threaded WASM. Multi-threaded requires SharedArrayBuffer and COOP/COEP headers.

## Acknowledgments
```
BirdNET team at Cornell Lab of Ornithology and Chemnitz University of Technology.
tphakala for the ONNX model conversion.
Hacktoberfest 2026 organizers.
```

## License

MIT
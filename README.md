# Dreamlight · Focus Music Studio

Free, open-source focus music. Pick what you're doing (deep work, morning coffee, study, wind down, power nap…) and music starts instantly. There's no account, no ads and no subscription, and it runs offline.

- **25 one-hour functional-music tracks**, generated with plain Python (`numpy`). They use true binaural beats plus rhythmic amplitude modulation, from 1.5 Hz delta for sleep to 42 Hz gamma for focus.
- **14 activities across Focus, Relax, Sleep and Meditate**, each with its own motion artwork, a default session length, intervals (25/5), a gentle power-nap wake and a breath pacer.
- **Runs three ways from the same files:** a static website, an offline Mac/Windows desktop app (Electron) with a menu bar remote, and on phones.
- **No lock-in.** Plain files you own. Rebuild it, host it anywhere, change anything.

> Binaural beats need stereo headphones. Dreamlight is music for focus and relaxation, not a medical device.

## Get it running

```bash
git clone https://github.com/promptadvisers/dreamlight && cd dreamlight

# 1. Get the music (2.2 GB of MP3s from the release), or render it yourself (step 4)
gh release download audio-v1 --repo promptadvisers/dreamlight --dir web/audio

# 2. Run the web player
python3 server.py 8787          # then open http://localhost:8787

# 3. Or run the desktop app (menu bar remote, Dock timer, plays offline)
cd desktop && npm install && npm start
#    Build a standalone Mac app into /Applications:  ./build-mac.sh --install

# 4. Render the tracks yourself instead of downloading them
pip install -r requirements.txt && python3 -m generators list
python3 -m generators render --track dreamlight
```

## Credits

- **Music:** generated with Python and NumPy. The generators are in `generators/`.
- **Motion graphics:** made with [Higgsfield](https://higgsfield.ai). Activity tiles, mode scenes and animated covers were generated as images, then turned into seamless video loops.
- **Built with AI:** Claude (Anthropic), with design reviews and implementation from Gemini 4 Neon and GPT-6.2 Sol.

## Repository Layout

```text
dreamlight/
├── web/                        # Static player (no build step)
│   ├── index.html              # Player markup and controls
│   ├── tracks.json             # Generated from generators/catalog.py (25 sessions)
│   ├── playback.js             # Two-deck audio, mixer, and session timing
│   ├── visualizer.js           # Per-track Signature and other Signal styles
│   ├── motion/                 # Mode and activity art
│   ├── motion-index.json       # Optional media inventory for static hosts
│   ├── manifest.json           # PWA manifest
│   ├── covers/                 # 512x512 studio cover PNGs
│   │   └── loops/              # Optional silent square MP4 cover loops (<slug>.mp4)
│   └── audio/                  # Local 1-hour MP3 renders (gitignored)
├── generators/                 # Python + NumPy synthesis & asset pipeline
│   ├── catalog.py              # Single source of truth for all 25 tracks
│   ├── dsp.py                  # Linear-phase FIRs, stereo reverb, ping-pong delay, synths
│   ├── engines.py              # Multi-style streaming engines + LUFS auto-calibration
│   ├── covers.py               # 512x512 procedural cover art generator
│   ├── dna.py                  # Optional CSV-driven personalized track synthesizer
│   ├── sample_dna_fake.csv     # Synthetic placeholder CSV (fake genes/genotypes for testing)
│   ├── render_video.py         # Optional 1080p waveform video exporter
│   └── __main__.py             # CLI entry point (`python -m generators ...`)
├── desktop/                    # Minimal offline Electron desktop wrapper
│   ├── package.json
│   ├── main.js
│   └── PROMPT.md               # Vendor-neutral plain-English prompt to recreate it
├── reports/
│   └── render-report.md        # Acoustic verification measurements (duration, LUFS, TP, FFT)
├── server.py                   # Optional local Range-streaming HTTP server for web/
├── requirements.txt
└── LICENSE
```

## Quick Start

### 1. Run the Web Player

Using Python's built-in static server:

```bash
python3 -m http.server 8787 --directory web
```

Or using the included Range-streaming server (recommended for instant seeking on 1-hour MP3s):

```bash
python3 server.py 8787
```

Then open `http://localhost:8787`.

The included server and Electron read optional motion files directly from disk. To include newly added posters and loops on a plain static host, refresh the bundled inventory while the included server is running.

```bash
curl --fail http://127.0.0.1:8787/motion-index.json -o web/motion-index.json
```

### 2. Run the Offline Desktop App (Electron)

```bash
cd desktop
npm install
npm start
```

The desktop app serves `../web` directly from disk over loopback with full audio seeking and Web Audio FFT visualization, completely offline.

### 3. Render Tracks & Assets

Install Python dependencies (`ffmpeg` must also be installed on your PATH):

```bash
pip install -r requirements.txt
```

List all 25 catalog tracks:

```bash
python3 -m generators list
```

Render any single track (1 hour, 44.1 kHz discrete stereo MP3, calibrated to -15.5 LUFS):

```bash
python3 -m generators render --track cobalt_lattice
```

Render a quick 30-second preview:

```bash
python3 -m generators render --track saffron_sanctuary --duration 30 --output /tmp/preview.mp3
```

Render all 14 expansion tracks in parallel:

```bash
python3 -m generators render --all-new --workers 6
```

Generate missing 512x512 covers and refresh `web/tracks.json`:

```bash
python3 -m generators covers
python3 -m generators tracks-json
```

Verify duration, stereo channels, loudness (LUFS), true peak, silence gaps, and discrete L/R binaural FFT carrier separation:

```bash
python3 -m generators verify --report reports/render-report.md
```

Try the CSV-driven Helix generator using the bundled clearly synthetic fake example CSV:

```bash
python3 -m generators dna --csv generators/sample_dna_fake.csv --duration 30 --output /tmp/helix_test.mp3
```

## How Audio Files Are Hosted

Each 1-hour 192 kbps MP3 is ~82–86 MB (~2.1 GB for all 25 tracks). Audio files live in `web/audio/` locally and are gitignored so the repository stays tiny and fast to clone.

For public static hosting, place the rendered MP3s in `web/audio/` (or mirror them to an object store / CDN bucket such as Cloudflare R2, S3, or Vercel Blob and update `url` prefixes in `web/tracks.json`). Every track uses discrete stereo encoding (`-joint_stereo 0`) to preserve true L/R binaural carrier separation.

## Credits

- Audio synthesis, DSP engines, cover art, and static player built with plain Python (`numpy`, `Pillow`), `ffmpeg`, HTML/CSS/Canvas/Web Audio, and Electron.
- Designed to remain portable across static hosts, local desktop apps, and standalone artifacts without vendor lock-in.

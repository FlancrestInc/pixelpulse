# PixelPulse

**A living, animated pixel-art city that displays your server metrics.**

Instead of staring at charts and numbers, watch a toy city come alive. Roads fill with traffic when your network is busy. Buildings light up under load. The sky shifts from dawn to dusk in real time. PixelPulse is a self-hosted system monitoring dashboard you'll actually enjoy having on a screen.

![PixelPulse Scene](assets/screenshots/preview.png)

---

## What It Looks Like

The display is a flat pixel-art cityscape — Sim City-style — rendered in your browser. Every element responds to your actual system data:

| What You See | What It Means |
|---|---|
| Road traffic density and speed | Request activity (`http_requests`) |
| Windmill rotation speed | CPU load |
| Server Tower LED blink rate + load bar | CPU load |
| Power station chimney smoke | CPU load |
| Warehouse shutter height + fill bar | Disk usage |
| Water Tower fill level | Any gauge signal |
| Bank Ticker scrolling text | Any text signal (RSS headlines, weather) |
| Bus Stop sign | Any text signal |
| Café neon sign flicker | HTTP request rate |
| Drive-In Theater screen + parked cars | Active streams gauge |
| Data Vault delivery truck | Any event signal (backup, deploy, etc.) |
| Data Vault truck arrival + nearby walkers | Event pulse such as deploys or backups |
| Sky gradient | Time of day (real clock or configurable) |
| Red sinusoidal pulse overlay on building | Signal has crossed its configured alert threshold |

A **● LIVE / ● DEMO** indicator in the top-right corner shows whether real data is flowing. If the backend isn't running, the city falls back to a curated showcase demo automatically, using the same default layout as the live configuration.

---

## Table of Contents

1. [Requirements](#requirements)
2. [Quick Start](#quick-start)
3. [Project Structure](#project-structure)
4. [Configuration](#configuration)
5. [Adapters (Data Sources)](#adapters-data-sources)
6. [Signal Architecture](#signal-architecture)
7. [Deploying on Raspberry Pi](#deploying-on-raspberry-pi)
8. [Sprite Pipeline (Optional)](#sprite-pipeline-optional)
9. [Alert Thresholds](#alert-thresholds)
10. [Troubleshooting](#troubleshooting)
11. [Contributing](#contributing)

---

## Requirements

### To just open and view the demo
- Any modern web browser (Chrome, Firefox, Safari, Edge)
- No installation required — open `pixelpulse_standalone.html` directly

### To run with live data (recommended)
- Python 3.11 or newer
- pip (Python package manager)
- A terminal / command prompt

> **Running on a Raspberry Pi?** See the dedicated [Deploying on Raspberry Pi](#deploying-on-raspberry-pi) section below. PixelPulse is specifically designed to run well on a Pi 4 with 2GB RAM at 1080p, 24 hours a day.

---

## Quick Start

If you've never used a terminal before, don't worry — these steps are written for you.

### Step 1 — Download the project

If you have Git installed:
```bash
git clone https://github.com/FlancrestInc/pixelpulse.git
cd pixelpulse
```

Or click the green **Code** button on GitHub, choose **Download ZIP**, and unzip it somewhere on your computer.

### Step 2 — Install Python dependencies

Open a terminal, navigate to the `pixelpulse` folder, then run:

```bash
pip install -r backend/requirements.txt
```

This installs everything the backend needs. It only takes a minute.

> **Windows users:** If `pip` isn't recognized, try `python -m pip install -r backend/requirements.txt`

> **Mac users:** You may need `pip3` instead of `pip`

### Step 3 — Set up your configuration

Copy the example config file to create your own:

```bash
cp backend/config.example.yaml backend/config.yaml
```

The default config works out of the box and will display your CPU, RAM, and disk usage immediately. You can customize it later — see the [Configuration](#configuration) section.

### Step 4 — Start the backend

```bash
python backend/main.py
```

You should see output like:
```
INFO     Starting PixelPulse backend on http://0.0.0.0:8000
INFO     Signal engine initialized with 5 adapters
INFO     Uvicorn running on http://0.0.0.0:8000
```

### Step 5 — Open the dashboard

Open your web browser and go to:

```
http://localhost:8000
```

The pixel city will load. The **● DEMO** indicator in the top-right corner should switch to **● LIVE** within a few seconds as the first real data arrives.

**That's it!** Your system metrics are now driving the city.

### Showcase layout

The current polished demo centers on a curated nine-plot city:

- `main_1` Windmill driven by `cpu_load`
- `main_2` Power Station driven by `memory_used`
- `main_3` Server Tower driven by `cpu_load`
- `main_4` Warehouse driven by `disk_used`
- `main_5` Bank Ticker driven by `news_ticker`
- `main_6` Bus Stop driven by `weather_text`
- `mid_1` Cafe driven by `http_requests`
- `mid_2` Data Vault driven by `deploy_event`
- `mid_3` Drive-In driven by `active_streams`

If the backend is unavailable, demo mode still drives this same layout with simulated signals so the city remains presentable.

---

## Project Structure

```
pixelpulse/
├── backend/
│   ├── main.py                  # Backend entry point — run this
│   ├── signal_engine.py         # Core data coordinator
│   ├── config.yaml              # Your configuration (edit this)
│   ├── config.example.yaml      # Safe template — don't edit this one
│   ├── config_loader.py         # Reads and validates your config
│   ├── adapters/                # Data source modules
│   │   ├── system.py            # CPU, RAM, disk, network (built-in)
│   │   ├── http_poll.py         # Poll any HTTP endpoint
│   │   ├── webhook.py           # Receive data from external services
│   │   ├── shell.py             # Run a shell command and read its output
│   │   ├── file_watcher.py      # Watch a log file for values
│   │   ├── rss_feed.py          # RSS headlines for the bank ticker
│   │   ├── weather.py           # Weather conditions (no API key needed)
│   │   └── sky_driver.py        # Drives the day/night sky cycle
│   └── requirements.txt
│
├── frontend/
│   ├── index.html
│   ├── main.js
│   ├── signal_bus.js            # WebSocket connection and demo fallback
│   └── scene/
│       └── city/                # City scene rendering modules
│
├── pixelpulse_standalone.html   # ⭐ Single-file build — works without a backend
│
├── assets/
│   └── sprites/                 # Kenney sprite atlas (optional)
│
└── tools/
    ├── render_sprites.py        # Blender sprite renderer
    └── pack_sprites.py          # Sprite atlas packer
```

### The standalone file

`pixelpulse_standalone.html` is a complete self-contained build of PixelPulse in a single HTML file. You can open it directly in any browser without running anything else — it will run in demo mode with simulated data. If you later start the backend, it will automatically detect it and switch to live data.

This file is the primary distributable — it's what you'd copy to another machine or a web server.

---

## Configuration

All configuration lives in `backend/config.yaml`. No Python code changes are ever needed to add new data sources.

### Basic structure

```yaml
scene: city

server:
  host: 0.0.0.0
  port: 8000            # The port your browser connects to

sky_driver:
  mode: clock           # clock = follows real time | cycle = loops on a timer | signal = driven by a metric
  cycle_minutes: 10     # Only used when mode is "cycle"

signals:
  # --- add your data sources here ---

scene_bindings:
  # --- map signal IDs to scene elements ---
```

### Adding your first signal

Each entry under `signals:` defines a data source. Here's the simplest example — reading CPU usage from your own machine:

```yaml
signals:
  - id: cpu_load         # A unique name you choose — used to reference this signal
    adapter: system      # Which adapter to use
    metric: cpu_percent  # Which system metric to read
    interval: 2          # How often to read it, in seconds
```

### Connecting a signal to the scene

Once you have a signal defined, tell the scene which visual element it drives under `scene_bindings:`:

```yaml
scene_bindings:
  windmill_speed: cpu_load      # Windmill rotates faster when cpu_load is high
  traffic_density: net_bytes_recv
  warehouse_fill: disk_used
  server_load: cpu_load
  bank_memory: memory_used
```

The left side is the scene slot name (fixed — these are the available bindings). The right side is your signal `id`.

### A complete working example

```yaml
scene: city

server:
  host: 0.0.0.0
  port: 8000

sky_driver:
  mode: clock

signals:
  - id: cpu_load
    adapter: system
    metric: cpu_percent
    interval: 2

  - id: memory_used
    adapter: system
    metric: memory_used
    interval: 5

  - id: disk_used
    adapter: system
    metric: disk_used
    path: /
    interval: 30

  - id: ticker_rss
    adapter: rss_feed
    feeds:
      - url: "https://feeds.bbci.co.uk/news/rss.xml"
        name: "BBC"
    interval: 300

  - id: weather
    adapter: weather
    city: "Salt Lake City"
    units: fahrenheit
    emit: ticker_text
    interval: 600

scene_bindings:
  windmill_speed: cpu_load
  traffic_density: net_bytes_recv
  warehouse_fill: disk_used
  server_load: cpu_load
  power_smoke: cpu_load
  bank_memory: memory_used
```

> **Note:** Never commit `config.yaml` to a public repository if it contains API keys or private URLs. Use `config.example.yaml` as your shareable template.

---

## Adapters (Data Sources)

Adapters are how PixelPulse connects to the outside world. Each adapter is a module that knows how to get data from a specific source and hand it to the scene. You configure them in `config.yaml` — no code changes required.

---

### `system` — Your machine's own metrics

Reads CPU, RAM, disk, and network stats using the `psutil` library. Works on Windows, Mac, and Linux.

**Available metrics:**

| Metric ID | What it measures |
|---|---|
| `cpu_percent` | Overall CPU load (0.0–1.0) |
| `memory_used` | RAM usage as a fraction of total |
| `disk_used` | Disk usage for a given path |
| `net_bytes_sent` | Network upload rate |
| `net_bytes_recv` | Network download rate |
| `cpu_temp` | CPU temperature (normalized 0–100°C) |

**Example:**
```yaml
- id: disk_used
  adapter: system
  metric: disk_used
  path: /          # On Windows, use C:\ or D:\ etc.
  interval: 30
```

---

### `http_poll` — Poll any URL

Fetches a URL on a regular interval and extracts a number from the JSON response. Great for home automation APIs, game server status pages, custom metrics endpoints, or anything that exposes data over HTTP.

**Example — reading a value from a JSON API:**
```yaml
- id: gas_price
  adapter: http_poll
  url: "https://api.example.com/gas?zip=84043"
  json_path: "$.current_price"   # JSONPath expression to find the value
  interval: 300                  # Every 5 minutes
  transform: "value / 6.0"       # Optional: normalize the value to 0.0–1.0
```

**Options:**
- `json_path` — A [JSONPath](https://jsonpath.com/) expression to extract the value from the response
- `interval` — How often to poll, in seconds
- `transform` — A Python expression to normalize the raw value. `value` refers to the extracted number
- `headers` — Optional HTTP headers (e.g. for API keys): `headers: {Authorization: "Bearer abc123"}`

---

### `webhook` — Receive data from external services

Registers an HTTP endpoint on the PixelPulse backend. External services (CI/CD pipelines, game servers, home automation) can POST to it to trigger events in the scene.

**Example:**
```yaml
- id: deploy_event
  adapter: webhook
  path: /hooks/deploy          # This endpoint is now available on your backend
  event_name: deploy_completed
```

Once configured, external services can trigger it with:
```bash
curl -X POST http://your-pi-address:8000/hooks/deploy
```

---

### `shell` — Run any command

Runs a shell command on a schedule and reads its standard output as a signal value. Useful for custom scripts, Jellyfin stream counts, smart home sensors, or anything you can query from the command line.

**Example — Jellyfin active stream count:**
```yaml
- id: active_streams
  adapter: shell
  command: "python3 /home/pi/scripts/jellyfin_streams.py"
  interval: 30
  type: gauge
  max_value: 10    # The script output is divided by this to normalize to 0.0–1.0
```

The command should print a single number to stdout.

---

### `file_watcher` — Watch a log file

Monitors a file and emits values from it. Useful for watching application log files or any file that gets written to over time. Handles log rotation automatically.

**Three modes:**

| Mode | What it does |
|---|---|
| `last_float` | Reads the last line of the file as a decimal number |
| `last_json` | Reads the last line as JSON and extracts a key |
| `line_count` | Counts lines added since last check (normalized to a ceiling) |

**Example — watching an error log:**
```yaml
- id: error_rate
  adapter: file_watcher
  path: /var/log/myapp/errors.log
  mode: line_count
  ceiling: 100     # 100+ new lines per interval = signal value of 1.0
  interval: 10
```

---

### `rss_feed` — Live news headlines

Fetches one or more RSS feeds and sends the headlines to the bank ticker at the bottom of the scene. Headlines rotate automatically as new ones arrive.

**Example:**
```yaml
- id: ticker_rss
  adapter: rss_feed
  feeds:
    - url: "https://feeds.bbci.co.uk/news/rss.xml"
      name: "BBC News"
    - url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml"
      name: "NY Times"
  max_items: 20    # How many headlines to keep in the rotation
  interval: 300    # Refresh every 5 minutes
```

---

### `weather` — Current conditions

Fetches weather data from [Open-Meteo](https://open-meteo.com/) — no API key or account required. The current conditions appear in the bank ticker.

PixelPulse will attempt to find your location automatically (via IP geolocation). You can also set it explicitly:

```yaml
- id: weather
  adapter: weather
  city: "Salt Lake City"    # Or use lat/lon: lat: 40.76 / lon: -111.89
  units: fahrenheit         # Or: celsius
  emit: ticker_text         # Sends conditions to the bank ticker
  interval: 600             # Update every 10 minutes
```

---

### `sky_driver` — Day/night cycle (built-in)

This is an internal adapter — you don't need to add it under `signals:`. Configure it at the top level of `config.yaml`:

```yaml
sky_driver:
  mode: clock           # Follows your system clock — sunrise/sunset feel natural
```

**Modes:**

| Mode | Behavior |
|---|---|
| `clock` | Derives sky position from real wall-clock time |
| `cycle` | Loops through a full day in `cycle_minutes` minutes — good for demo/presentation |
| `signal` | Maps another signal's value directly to sky position (e.g. bind it to temperature) |

---

## Signal Architecture

Every piece of data in PixelPulse — regardless of source — is converted into a **signal** before it reaches the scene. The scene never knows or cares where the data came from. This is what makes PixelPulse generic: you can connect anything.

A signal looks like this:

```json
{
  "id": "cpu_load",
  "type": "gauge",
  "value": 0.72,
  "label": "CPU Load",
  "source": "system",
  "timestamp": 1710000000
}
```

**Signal types:**

| Type | Value | Example uses |
|---|---|---|
| `gauge` | Float 0.0 to 1.0 | CPU load, memory, disk fill |
| `rate` | Float (events/sec) | HTTP requests/sec, errors/sec |
| `event` | String (event name) | `backup_completed`, `deploy_failed` |
| `state` | String (enum) | `up`, `down`, `degraded` |

All gauge signals should be normalized to 0.0–1.0. Use the `transform` option in `http_poll` or the `max_value` option in `shell` to normalize raw values.

---

## Running PixelPulse

### Recommended (module mode)

```bash
python3 -m backend.main
```

Run from the project root. This sets up the Python package path correctly so all imports resolve.

### Alternative (direct)

```bash
python3 backend/main.py
```

Works because `main.py` includes a `uvicorn.run()` entrypoint at the bottom.

### Development mode (auto-reload)

```bash
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

Restarts the server automatically whenever you edit a Python file.

### Cache busting during development

If the browser is serving stale JavaScript after you update files, open DevTools (F12), go to the Network tab, and check **Disable cache**. This persists as long as DevTools is open.

---

## Deploying on Raspberry Pi

PixelPulse is designed specifically for always-on Raspberry Pi deployment. Here's how to get it running on a fresh Pi.

### Recommended hardware
- Raspberry Pi 4 (2GB RAM or more)
- MicroSD card (16GB+)
- HDMI display or TV
- Stable power supply

### Step 1 — Install Raspberry Pi OS

Use the [Raspberry Pi Imager](https://www.raspberrypi.com/software/) to write **Raspberry Pi OS (64-bit)** to your SD card. Enable SSH and set your username/password in the imager's settings before writing.

### Step 2 — Install Python dependencies

SSH into your Pi (or open a terminal on it directly):

```bash
sudo apt update && sudo apt install -y python3-pip git
git clone https://github.com/FlancrestInc/pixelpulse.git
cd pixelpulse
pip3 install -r backend/requirements.txt
cp backend/config.example.yaml backend/config.yaml
```

### Step 3 — Test it works

```bash
python3 backend/main.py
```

Then open a browser on another device and navigate to `http://<your-pi-ip>:8000`. You should see the city.

### Step 4 — Auto-start on boot with systemd

Create a service file so PixelPulse starts automatically when the Pi boots:

```bash
sudo nano /etc/systemd/system/pixelpulse.service
```

Paste this content (replace `pi` with your username if different):

```ini
[Unit]
Description=PixelPulse Dashboard
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/pixelpulse
ExecStart=/usr/bin/python3 /home/pi/pixelpulse/backend/main.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Save and exit (`Ctrl+X`, then `Y`, then `Enter`), then enable the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable pixelpulse
sudo systemctl start pixelpulse
```

Check that it's running:
```bash
sudo systemctl status pixelpulse
```

### Step 5 — Launch Chromium in kiosk mode

To display the dashboard full-screen on the Pi's connected monitor automatically on boot, add Chromium to your autostart:

```bash
mkdir -p ~/.config/autostart
nano ~/.config/autostart/pixelpulse-kiosk.desktop
```

Paste:

```ini
[Desktop Entry]
Type=Application
Name=PixelPulse Kiosk
Exec=chromium-browser --kiosk --noerrdialogs --disable-infobars http://localhost:8000
```

Save and exit. On next reboot, Chromium will open full-screen to the dashboard automatically.

### Pi performance tips

- In `/boot/config.txt`, set `gpu_mem=128` to give the GPU more memory for smooth WebGL rendering
- Disable screen blanking: add `xset s off` and `xset -dpms` to your autostart if the display goes dark
- Use a wired Ethernet connection rather than WiFi for more stable network metric data

---

## Sprite Pipeline (Optional)

PixelPulse uses rendered sprites from [Kenney's City Kit](https://kenney.nl/) for decorative buildings, trees, and street furniture. The sprites are pre-rendered and bundled as an atlas (`assets/sprites/city_sprites.json`). If this file is present, it's loaded automatically. If not, the scene falls back to procedural graphics and still looks great.

If you want to re-render or customize the sprites yourself, the `tools/` directory contains a two-step pipeline.

### Requirements
- Blender 4.0+ (for rendering GLB models)
- Python with Pillow (`pip install Pillow`)
- Kenney GLB source files

### Step 1 — Render sprites from GLB models

```bash
blender --background --python tools/render_sprites.py -- \
    --input assets/glb/city \
    --input assets/glb/industrial \
    --output assets/sprites/raw \
    --angle 30 \
    --size 256 \
    --engine BLENDER_EEVEE_NEXT
```

This renders each model at a 30° elevation angle with a 3-point lighting rig. Output PNGs and a `render_manifest.json` are written to `assets/sprites/raw/`.

### Step 2 — Pack into an atlas

```bash
python tools/pack_sprites.py \
    --input assets/sprites/raw \
    --output assets/sprites \
    --name city_sprites \
    --size 128
```

This auto-crops each PNG, packs them into a 128px-cell spritesheet, and writes `city_sprites.json` in Pixi.js TexturePacker format. The frontend picks it up automatically on next load.

---

## Alert Thresholds

When a metric crosses a critical threshold, the corresponding building in the scene flashes with a pulsing red overlay to catch your attention.

Default thresholds (defined in the frontend as `ALERT_THRESHOLDS`):

| Signal | Default Threshold | Building |
|---|---|---|
| `cpu_load` | 85% | Server Tower, Power Station, Windmill |
| `memory_used` | 90% | Bank |
| `disk_used` | 95% | Warehouse |
| `net_throughput` | 90% | Road traffic |

These values can be adjusted by editing the `ALERT_THRESHOLDS` object in `pixelpulse_standalone.html` (search for `ALERT_THRESHOLDS` in the file).

---

## Troubleshooting

**The page loads but shows ● DEMO instead of ● LIVE**

The frontend can't reach the backend. Check that:
- `python backend/main.py` is running and shows no errors
- You're opening `http://localhost:8000` (not just the HTML file directly)
- Your firewall isn't blocking port 8000

**`pip install` fails with permissions errors**

Try: `pip install --user -r backend/requirements.txt`

**Nothing shows up on the canvas**

- Check your browser's developer console (F12) for JavaScript errors
- Make sure you're using a modern browser with WebGL support
- Try opening `pixelpulse_standalone.html` directly first to verify the scene renders

**The backend crashes with `ModuleNotFoundError`**

You may have multiple Python versions. Try: `python3 -m pip install -r backend/requirements.txt` and run with `python3 backend/main.py`

**Weather isn't showing in the ticker**

- The `weather` adapter auto-detects your location via IP. If you're on a VPN, set `city:` explicitly in your config
- Weather updates every 10 minutes by default — give it a moment

**RSS headlines aren't updating**

- Check that the feed URLs are accessible from your machine
- Some corporate/Pi networks block outbound RSS fetching — try a different feed URL
- RSS feeds refresh every 5 minutes (`interval: 300`) by default

**On Raspberry Pi: scene is choppy or slow**

- Increase GPU memory: add `gpu_mem=128` to `/boot/config.txt` and reboot
- Close other browser tabs or applications
- Ensure you're using the 64-bit version of Raspberry Pi OS
- Use Chromium (pre-installed) rather than Firefox for best WebGL performance

---

## Known Issues & Planned Work

| Item | Status | Notes |
|---|---|---|
| `auth_gate` building | 🔧 Planned | The backend auth adapter work is no longer the blocker. The remaining gap is the `auth_gate` visual itself, which is still a placeholder and is not part of the polished demo showcase. |
| `characters.js` and `vehicles.js` fully populated | 🔧 Partial | Vehicle traffic is implemented and lightweight walkers now appear for the cafe, drive-in, and deploy-event beats. A richer crowd/character system is still planned. |
| Extended building catalogue | 📋 Planned (Phase 8a) | `auth_gate`, `construction_yard`, `swimming_pool`, `billboard`, `city_park`, and `dockyard` still render as placeholders and are intentionally outside the current showcase slice. |
| Signal history / focus mode | 📋 Planned (Phase 7) | Rolling 10-minute history buffer per signal with a sparkline overlay panel anchored to the clicked building. |
| Calendar / to-do integration | 📋 Planned (Phase 8b) | Adapter to read from iCal / CalDAV / Google Calendar and surface upcoming events in the ticker or scene state. |
| Raspberry Pi kiosk autostart | 📋 Planned (Phase 8c) | Formal `systemd` service file and Chromium kiosk launch script committed to the repo. |
| Alert notifications | 📋 Planned (Phase 8d) | Web Audio API alert tone and optional desktop notification when thresholds are crossed, with configurable cooldown. |

---

## Contributing

Contributions are welcome! The codebase is intentionally kept simple — vanilla JavaScript on the frontend, straightforward Python on the backend, no build steps.

### Development setup

```bash
git clone https://github.com/FlancrestInc/pixelpulse.git
cd pixelpulse
pip install -r backend/requirements.txt
cp backend/config.example.yaml backend/config.yaml
python backend/main.py
```

### Adding a new adapter

1. Create a new file in `backend/adapters/builtin/` (or `plugins/` for user-supplied adapters)
2. Subclass `AdapterBase` from `backend/adapters/base.py` and implement `poll()` returning a `Signal`
3. Set the `adapter_type` class attribute — this is the key used in `config.yaml`
4. No registration needed — `plugin_loader.py` discovers it automatically on startup
5. Document it in `config.example.yaml` with a commented example

### Coding standards

- **Python:** PEP 8, async throughout, type hints on all function signatures
- **JavaScript:** ES modules, no framework, camelCase variables, PascalCase classes
- **Git commits:** Imperative present tense — `Add windmill animation` not `Added windmill animation`
- Never commit `config.yaml` — it may contain private API keys or URLs

---

## License

PixelPulse is open source. See [LICENSE](LICENSE) for details.

Kenney asset kits used in the sprite pipeline are [CC0 licensed](https://creativecommons.org/public-domain/cc0/) — free to use for any purpose.

Weather data provided by [Open-Meteo](https://open-meteo.com/) — free, no API key required.

---

*Built with PixiJS · FastAPI · psutil · Open-Meteo · Kenney Assets*

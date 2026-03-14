# PixelPulse

**A living, animated pixel-art city that displays your server metrics.**

Instead of staring at charts and numbers, watch a toy city come alive. Windmills spin faster under CPU load. Water towers fill as memory climbs. Weather and news scroll across a bus stop sign. The sky shifts from dawn to dusk in real time.

What makes PixelPulse distinct is how it's configured: **the city starts empty**. You connect data sources, run signal pipes between them and your buildings, and place buildings on plots — all through an in-browser graphical editor that feels like playing SimCity. Step back out of edit mode, and only the living city remains.

---

## Table of Contents

1. [How It Works](#how-it-works)
2. [Requirements](#requirements)
3. [Quick Start](#quick-start)
4. [Project Structure](#project-structure)
5. [Configuration](#configuration)
6. [Adapters (Data Sources)](#adapters-data-sources)
7. [Edit Mode](#edit-mode)
8. [Signal Architecture](#signal-architecture)
9. [Plugin System](#plugin-system)
10. [Prometheus Adapter](#prometheus-adapter)
11. [Deploying on Raspberry Pi](#deploying-on-raspberry-pi)
12. [Sprite Pipeline (Optional)](#sprite-pipeline-optional)
13. [WebSocket Message Reference](#websocket-message-reference)
14. [Known Issues & Planned Work](#known-issues--planned-work)
15. [Contributing](#contributing)

---

## How It Works

PixelPulse has three conceptual layers, all visible and interactive in edit mode:

```
┌─────────────────────────────────────────────────────────────┐
│  DISPLAY LAYER — The animated city. Always visible.         │
├─────────────────────────────────────────────────────────────┤
│  PIPE LAYER — Signal routing. Valves, thresholds, labels.   │
│  [edit mode only]                                           │
├─────────────────────────────────────────────────────────────┤
│  SOURCE LAYER — External data: metrics, RSS, APIs, hooks.   │
│  [edit mode only]                                           │
└─────────────────────────────────────────────────────────────┘
```

In **display mode**, you see only the animated city — buildings responding to live data, the sky cycling through time of day, a scrolling ticker with headlines and weather.

In **edit mode** (press ⚙ in the bottom-right corner), the pipe layer slides up from the bottom of the screen. You can connect signals from the Signal Library panel on the left to plot slots on the city street, then place buildings on those slots. Each connection can be configured with a **valve** — setting the raw value range, alert threshold, and display label. When you exit edit mode, the layout is saved to disk automatically.

### Building animation states

Every building follows the same state model:

| State | Trigger | Visual |
|---|---|---|
| **Idle** | Pipe connected, signal value is 0.0 | Building static; passive ambient animations continue |
| **Active** | Pipe connected, signal value > 0.0 | Driven animation plays, scaled to signal value |
| **Alert** | Signal exceeds valve's alert threshold | Red sinusoidal pulse overlay at 1.2Hz |
| **Disconnected** | Backend unreachable, or signal not updated within 2× its interval | Yellow ⚡ icon above building |

---

## Requirements

### To open the demo (no installation needed)
- Any modern web browser with WebGL support

### To run with live data
- Python 3.11 or newer
- pip

---

## Quick Start

### Step 1 — Get the project

```bash
git clone https://github.com/FlancrestInc/pixelpulse.git
cd pixelpulse
```

Or download and unzip from GitHub.

### Step 2 — Install Python dependencies

```bash
pip install -r backend/requirements.txt
```

> **Windows:** try `python -m pip install -r backend/requirements.txt`  
> **Mac:** try `pip3` instead of `pip`

### Step 3 — Start the backend

```bash
python backend/main.py
```

You should see:
```
INFO     Starting PixelPulse backend
INFO     Signal engine started with N adapters
INFO     Uvicorn running on http://0.0.0.0:8000
```

### Step 4 — Open the dashboard

Go to `http://localhost:8000` in your browser.

The **● DEMO** indicator in the top-right corner will switch to **● LIVE** within a few seconds once the first real `sky_time` signal is received from the backend.

### Step 5 — Configure your city

Press the **⚙** button (bottom-right) to enter edit mode. From there:
1. Use the **Signal Library** panel (left side) to browse available signals and drag them onto plot slots on the main street
2. Click a plot to open the **Building Picker** and place a building
3. Click a pipe to open the **Valve panel** and configure its range, alert threshold, and label
4. Press **Done ✓** to exit edit mode — your layout is saved automatically

---

## Project Structure

```
pixelpulse/
├── backend/
│   ├── main.py                  # FastAPI entry point — run this
│   ├── signal_engine.py         # Core signal coordinator
│   ├── config.yaml              # Your signal source configuration
│   ├── config.example.yaml      # Template — copy to config.yaml to start
│   ├── config_loader.py         # Reads and validates config.yaml
│   ├── config_api.py            # REST API for edit mode (read/write config)
│   ├── layout.yaml              # City layout (written by edit mode)
│   ├── layout.default.yaml      # Starter layout — used if layout.yaml doesn't exist
│   ├── plugin_loader.py         # Discovers adapter plugins from builtin/ and plugins/
│   ├── adapters/
│   │   └── builtin/             # Core adapter implementations
│   │       ├── system.py        # CPU, RAM, disk, network (psutil)
│   │       ├── http_poll.py     # Poll any HTTP endpoint
│   │       ├── webhook.py       # Receive data via inbound webhooks
│   │       ├── shell.py         # Run a shell command and read stdout
│   │       ├── file_watcher.py  # Watch a log file for values
│   │       ├── rss_feed.py      # RSS headlines for text signals
│   │       ├── weather.py       # Open-Meteo weather (no API key)
│   │       └── sky_driver.py    # Internal day/night cycle signal
│   └── requirements.txt
│
├── frontend/
│   ├── index.html               # Entry point
│   ├── main.js                  # Bootstrap — wires all components
│   ├── signal_bus.js            # WebSocket + demo mode fallback
│   ├── edit_mode/               # Edit mode UI components
│   │   ├── edit_controller.js   # Mode transitions and animation
│   │   ├── building_picker.js   # Building/style selection UI
│   │   ├── layout_serializer.js # Layout state and save to backend
│   │   ├── pipe_renderer.js     # Visual pipe network on canvas overlay
│   │   ├── signal_library.js    # Signal Library panel + adapter flow
│   │   └── valve_panel.js       # Valve configuration panel
│   └── scene/
│       ├── city/
│       │   ├── city_scene.js    # Scene root — init and update loop
│       │   ├── environment.js   # Sky gradient, skyline, hills
│       │   ├── buildings.js     # Building type registry
│       │   ├── plot_manager.js  # Plot state and visual rendering
│       │   └── building_types/  # Individual building implementations
│       └── shared/
│           └── sprite_sheet.js  # kSprite() and kRand() atlas helpers
│
├── pixelpulse_standalone.html   # ⭐ Single-file build — open directly in any browser
│
├── assets/
│   └── sprites/
│       ├── city_sprites.json    # Kenney atlas (auto-loaded if present)
│       └── city_sprites.png     # Kenney spritesheet
│
├── plugins/
│   └── builtin/
│       └── prometheus.py        # Prometheus adapter (first-party plugin)
│
└── tools/
    ├── render_sprites.py        # Blender headless sprite renderer
    └── pack_sprites.py          # Atlas packer (Pillow)
```

### Two config files

PixelPulse separates configuration into two files:

| File | Purpose | Edited by |
|---|---|---|
| `backend/config.yaml` | Signal sources — adapters, their settings, polling intervals | You (text editor or edit mode Add Source flow) |
| `backend/layout.yaml` | City layout — which buildings are on which plots, pipes, valves, styles | Edit mode (written automatically on exit) |

Both files can also be hand-edited. Changes are reflected on page reload.

---

## Configuration

### config.yaml

All signal sources are defined here. No code changes required to add new data sources.

```yaml
scene: city

server:
  host: 0.0.0.0
  port: 8000

sky_driver:
  mode: clock           # clock | cycle | signal
  cycle_minutes: 10     # used when mode=cycle

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

  - id: weather_text
    adapter: weather
    units: fahrenheit
    interval: 600

  - id: news_ticker
    adapter: rss_feed
    feeds:
      - url: "https://feeds.bbci.co.uk/news/rss.xml"
        name: "BBC"
    interval: 300
```

> **Note:** Never commit `config.yaml` to a public repository if it contains API keys or private URLs. Use `config.example.yaml` as your shareable template. The `config.yaml` filename is in `.gitignore` by default.

### layout.yaml

The city layout. Normally written by the GUI when you exit edit mode, but can also be hand-authored. The file is safe to commit — it contains no credentials.

```yaml
plots:
  - plot_id: main_1
    building: windmill
    style: classic_wood
    signal: cpu_load
    valve:
      range_min: 0.0
      range_max: 1.0
      alert_threshold: 0.85
      label: CPU Load

  - plot_id: main_2
    building: water_tower
    style: steel_municipal
    signal: memory_used
    valve:
      range_min: 0.0
      range_max: 1.0
      alert_threshold: 0.90
      label: Memory Used

  - plot_id: mid_1
    building: bus_stop
    style: classic_shelter
    signal: weather_text
    valve:
      label: Weather
```

**Plot IDs:** The scene has 9 fixed plots — `main_1` through `main_6` on the main street, and `mid_1` through `mid_3` on the mid strip.

**Valve fields:**

| Field | Required | Default | Description |
|---|---|---|---|
| `range_min` | no | 0.0 | Raw signal value that maps to 0.0 |
| `range_max` | no | 1.0 | Raw signal value that maps to 1.0 |
| `alert_threshold` | no | 0.85 | Normalized value (0–1) that triggers alert state |
| `label` | no | signal id | Override display label for tooltips and valve panel |

**Starter layout:** If `layout.yaml` doesn't exist, PixelPulse uses `layout.default.yaml` to generate an initial city (Windmill + Water Tower + Bus Stop, pre-wired to system and weather signals). This is written to `layout.yaml` on first launch.

---

## Adapters (Data Sources)

Adapters connect external data to the signal engine. All adapters — including user plugins — follow the same contract and are discovered automatically.

---

### `system` — Local machine metrics

Uses `psutil`. Works on Windows, Mac, and Linux.

| Metric ID | What it measures |
|---|---|
| `cpu_percent` | CPU load (0.0–1.0) |
| `memory_used` | RAM usage as fraction of total |
| `disk_used` | Disk usage for a given path |
| `net_bytes_sent` | Upload rate |
| `net_bytes_recv` | Download rate |
| `cpu_temp` | CPU temperature (normalized 0–100°C) |

```yaml
- id: disk_root
  adapter: system
  metric: disk_used
  path: /          # Windows: C:\ or D:\ etc.
  interval: 30
```

---

### `http_poll` — Poll any URL

Fetches a URL on a schedule and extracts a value from the JSON response using JSONPath.

```yaml
- id: my_metric
  adapter: http_poll
  url: "https://api.example.com/metrics"
  json_path: "$.current_value"
  interval: 60
  transform: "value / 100.0"    # normalize to 0.0–1.0
  headers:
    Authorization: "Bearer abc123"
```

---

### `webhook` — Receive inbound data

Registers a POST endpoint on the PixelPulse backend. External services can push data to it.

```yaml
- id: deploy_event
  adapter: webhook
  path: /hooks/deploy
  event_name: deploy_completed
```

Trigger it from anywhere:
```bash
curl -X POST http://your-server:8000/hooks/deploy
```

---

### `shell` — Run any command

Runs a shell command on a schedule and reads stdout as a signal value.

```yaml
- id: active_streams
  adapter: shell
  command: "python3 /home/pi/scripts/jellyfin_streams.py"
  interval: 30
  type: gauge
  max_value: 10    # divides output by this to normalize to 0–1
```

---

### `file_watcher` — Watch a log file

Monitors a file and emits values from it. Three modes: `last_float`, `last_json`, `line_count`.

```yaml
- id: error_rate
  adapter: file_watcher
  path: /var/log/myapp/errors.log
  mode: line_count
  ceiling: 100
  interval: 10
```

---

### `rss_feed` — Live news headlines

Fetches RSS feeds and sends rotating headlines as text signals, displayed on Bus Stop buildings.

```yaml
- id: news_ticker
  adapter: rss_feed
  feeds:
    - url: "https://feeds.bbci.co.uk/news/rss.xml"
      name: "BBC News"
    - url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml"
      name: "NY Times"
  max_items: 20
  interval: 300
```

---

### `weather` — Current conditions

Uses [Open-Meteo](https://open-meteo.com/) — no API key required. Auto-detects location via IP geolocation with explicit override option.

```yaml
- id: weather_text
  adapter: weather
  city: "Salt Lake City"    # optional override; falls back to IP geolocation
  units: fahrenheit         # or: celsius
  interval: 600
```

---

### `sky_driver` — Day/night cycle

Internal adapter. Configure at the top level of `config.yaml`:

```yaml
sky_driver:
  mode: clock           # clock | cycle | signal
  cycle_minutes: 10     # only used when mode=cycle
```

| Mode | Behavior |
|---|---|
| `clock` | Sky position derived from real wall-clock time |
| `cycle` | Loops through a full day in `cycle_minutes` minutes |
| `signal` | Maps another signal's value directly to sky position |

---

## Edit Mode

Enter edit mode by pressing the **⚙** button (bottom-right corner). The interface animates in over 600ms:
- The city lifts and dims slightly
- The pipe layer slides up from the bottom
- The Signal Library panel slides in from the left
- Plot slots on the city street become interactive

### Signal Library (left panel)

Lists all signals currently flowing through the signal engine. Each entry shows the signal ID, label, current value, type icon, and source adapter.

**To connect a signal to a plot:** drag from the Signal Library and drop onto a plot slot on the street.

**To add a new data source:** click **Add Source** at the bottom of the panel. A 4-step flow guides you through choosing an adapter, configuring it, naming the signal, and confirming. The new adapter is appended to `config.yaml` and starts emitting immediately.

### Building Picker

When you click an empty or zoned plot slot in edit mode, the Building Picker opens. It shows all available building types filtered by signal compatibility (a `text`-type signal can only receive buildings that accept text ports). Click a building to place it; a style picker appears inline.

### Valve panel

Click any pipe in edit mode (or use the ⚙ button that appears on hover) to open the Valve panel. Configure:
- **Signal range min/max** — what raw values map to 0.0 and 1.0
- **Alert threshold** — value at which the building enters alert state (0.0–1.0 normalized)
- **Label** — display name shown in tooltips and the focus overlay

A live mini-gauge preview updates in real time as the signal changes.

### Building actions

Right-click (or tap in edit mode) on a placed building to:
- **Remove building** — returns the plot to zoned state; pipe is preserved
- **Move building** — enables a move mode; click a destination plot to move
- **Change style** — opens the inline style picker for the current building type

### Exiting edit mode

Press **Done ✓**. The layout is saved to `backend/layout.yaml` via `PUT /api/layout`. If the save succeeds, a **✓ Saved** toast appears. If it fails (e.g. backend unreachable), a warning toast appears and the changes remain in-memory for the current session.

---

## Signal Architecture

Every piece of data in PixelPulse — regardless of source — is normalized into a **Signal** before it reaches the scene.

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
| `gauge` | Float 0.0–1.0 | CPU load, memory, disk fill |
| `rate` | Float (events/sec) | HTTP requests/sec, errors/sec |
| `text` | String | Weather conditions, RSS headlines |
| `event` | String (event name) | `backup_completed`, `deploy_failed` |
| `state` | String enum | `up`, `down`, `degraded` |

All gauge signals should be normalized to 0.0–1.0. Use the `transform` option in `http_poll`, the `max_value` option in `shell`, or the **Valve** range settings in edit mode to normalize raw values.

---

## Plugin System

PixelPulse uses a **drop-in plugin model** for adapters. Any Python file in the `plugins/` directory that subclasses `AdapterBase` is automatically discovered and registered at startup — no code changes required. Built-in adapters in `backend/adapters/builtin/` follow the same contract and are loaded by the same discovery mechanism.

### Writing a plugin

```python
# plugins/my_adapter.py
from backend.adapters.base import AdapterBase, Signal
import time

class MyAdapter(AdapterBase):
    adapter_type = "my_adapter"       # matches the "adapter:" key in config.yaml
    requirements = ["some_package"]   # optional pip dependencies

    def __init__(self, config):
        super().__init__(config)
        self._url = config.get("url", "")
        self._interval = float(config.get("interval", 10.0))

    @property
    def interval(self) -> float:
        return self._interval

    async def poll(self):
        """Return a Signal or list of Signals, or None on failure."""
        try:
            value = await self._fetch_value()
            return Signal(
                id=self.signal_id,
                type="gauge",
                value=value,
                label=self.label,
                source="my_adapter",
                timestamp=time.time(),
            )
        except Exception as e:
            self.logger.error(f"my_adapter failed: {e}")
            return None
```

Drop this file into `plugins/` and add an entry to `config.yaml`:

```yaml
signals:
  - id: my_signal
    adapter: my_adapter
    url: "https://example.com/api"
    interval: 30
```

**Plugin priority:** If a plugin and a built-in adapter share the same `adapter_type`, the plugin wins. This allows overriding built-ins without modifying the core codebase.

**Missing dependencies:** If a plugin's `requirements` aren't installed, the signal engine logs a clear `pip install` instruction and skips that adapter rather than crashing. All other adapters continue running normally.

The `plugins/` directory is in `.gitignore` by default so user plugins aren't accidentally committed.

---

## Prometheus Adapter

The Prometheus adapter ships in `plugins/builtin/prometheus.py`. It is included with the repo but treated as a plugin to keep the core adapter set minimal and illustrate the plugin model.

The adapter queries a Prometheus server's HTTP API (`/api/v1/query`) using PromQL. A single config block defines the server connection and lists all queries, batching them into one polling loop.

```yaml
signals:
  - id: prometheus_host
    adapter: prometheus
    url: "http://prometheus.local:9090"
    interval: 15
    queries:
      - signal_id: cpu_load
        label: "CPU Load"
        promql: '1 - avg(rate(node_cpu_seconds_total{mode="idle"}[1m]))'
        max_value: 1.0          # optional: raw value / max_value = normalized 0–1
      - signal_id: memory_used
        label: "Memory Used"
        promql: '1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)'
```

### Multi-host fan-out

Use `label_as_suffix` to generate one signal per host from a single query:

```yaml
queries:
  - signal_id: cpu_host
    label: "CPU"
    promql: '1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[1m]))'
    label_as_suffix: instance    # emits cpu_host_server1, cpu_host_server2, etc.
```

### Authentication

```yaml
auth:
  type: bearer
  token: "your_token_here"

# or Basic Auth:
auth:
  type: basic
  username: prometheus
  password: secret
```

### Test query from edit mode

When adding a Prometheus source through the **Add Source** flow in edit mode, step 2 includes a **Test Query** button that fires the PromQL against the configured server and previews the result inline before saving.

### Signal metadata

Prometheus signals carry additional metadata surfaced in the Signal Library under a **Source details** disclosure toggle:
- PromQL query string
- Prometheus server URL  
- Host label value (for multi-host signals)

---

## Deploying on Raspberry Pi

PixelPulse is designed for always-on Pi deployment.

### Recommended hardware
- Raspberry Pi 4 (2GB+ RAM)
- MicroSD card (16GB+)
- HDMI display or TV

### Step 1 — Install Raspberry Pi OS

Use [Raspberry Pi Imager](https://www.raspberrypi.com/software/) to write **Raspberry Pi OS 64-bit** to your SD card. Enable SSH and set your username/password in the imager settings.

### Step 2 — Install dependencies

SSH into your Pi:

```bash
sudo apt update && sudo apt install -y python3-pip git
git clone https://github.com/FlancrestInc/pixelpulse.git
cd pixelpulse
pip3 install -r backend/requirements.txt
```

### Step 3 — Test it

```bash
python3 backend/main.py
```

Navigate to `http://<your-pi-ip>:8000` from another device to verify the scene loads.

### Step 4 — Auto-start with systemd

```bash
sudo nano /etc/systemd/system/pixelpulse.service
```

Paste (replace `pi` with your username if different):

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

Save and enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable pixelpulse
sudo systemctl start pixelpulse
sudo systemctl status pixelpulse
```

### Step 5 — Chromium kiosk mode

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

### Pi performance tips

- Set `gpu_mem=128` in `/boot/config.txt` for smoother WebGL rendering
- Disable screen blanking: add `xset s off` and `xset -dpms` to autostart
- Use wired Ethernet for more stable network metric data
- Use the 64-bit version of Raspberry Pi OS
- Use Chromium (pre-installed) rather than Firefox for best WebGL performance

---

## Sprite Pipeline (Optional)

The Kenney sprite atlas (`assets/sprites/city_sprites.json`) is included in the repo and loaded automatically. This section is only needed if you want to re-render or customize the sprites.

### Requirements
- Blender 4.0+
- Python with Pillow (`pip install Pillow`)
- Kenney GLB source files

### Step 1 — Render from GLB

```bash
blender --background --python tools/render_sprites.py -- \
    --input assets/glb/city \
    --input assets/glb/industrial \
    --output assets/sprites/raw \
    --angle 30 \
    --size 256 \
    --engine BLENDER_EEVEE_NEXT
```

### Step 2 — Pack the atlas

```bash
python tools/pack_sprites.py \
    --input assets/sprites/raw \
    --output assets/sprites \
    --name city_sprites \
    --size 128
```

The frontend picks up the new atlas automatically on next load.

---

## WebSocket Message Reference

The backend communicates with the frontend over a WebSocket at `ws://host:port/ws`.

### Handshake (server → client, on connect)

```json
{
  "type": "handshake",
  "signals": { "cpu_load": { "id": "cpu_load", "type": "gauge", "value": 0.42, ... } },
  "layout": { "plots": [ { "plot_id": "main_1", "building": "windmill", "signal": "cpu_load", ... } ] },
  "config": { "signals": [ { "id": "cpu_load", "interval": 2 } ], "sky_driver": { ... } }
}
```

### Signal update (server → client)

```json
{ "type": "signal", "signal": { "id": "cpu_load", "type": "gauge", "value": 0.61, "timestamp": 1710000000 } }
```

### Layout saved confirmation (server → client)

```json
{ "type": "layout_saved", "layout": { "plots": [...] } }
```

```json
{ "type": "layout_save_failed" }
```

---

## Known Issues & Planned Work

| Item | Status | Notes |
|---|---|---|
| Most building types are placeholders | 🔧 In progress | Only Windmill, Water Tower, and Bus Stop have full implementations. All other registered building types render as a grey rectangle. Full implementations are planned in **Phase 8a**. |
| `characters.js` and `vehicles.js` are stubs | 🔧 In progress | Traffic and pedestrian animations from the original spec haven't been rebuilt in the new edit-mode architecture yet. |
| `auth_failures` backend adapter | 🔧 In progress | The `auth_gate` building type is registered but is currently a placeholder. The backend adapter that counts authentication failures and emits the signal is not yet implemented. |
| Signal history / focus mode | 📋 Planned (Phase 7) | Rolling 10-minute history buffer per signal; sparkline overlay anchored to clicked building. |
| Extended building catalogue | 📋 Planned (Phase 8a) | Full implementations for Construction Yard, Swimming Pool, Dockyard, Billboard, and additional style variants for existing buildings. |
| Calendar / to-do integration | 📋 Planned (Phase 8b) | iCal / CalDAV / Google Calendar adapter; to-do list gauge signal. |
| Raspberry Pi kiosk autostart | 📋 Planned (Phase 8c) | Formal `systemd` service file and Chromium kiosk script committed to the repo. |
| Alert notifications | 📋 Planned (Phase 8d) | Web Audio API alert tone on threshold crossing; optional desktop notification; configurable cooldown. |

---

## Contributing

Contributions are welcome. The codebase is intentionally simple — vanilla JavaScript on the frontend, straightforward async Python on the backend, no build steps.

### Development setup

```bash
git clone https://github.com/FlancrestInc/pixelpulse.git
cd pixelpulse
pip install -r backend/requirements.txt
python backend/main.py
```

Open `http://localhost:8000`.

### Adding a building type

1. Create `frontend/scene/city/building_types/my_building.js` — implement `init()`, `update(delta)`, `onSignal(signal)`, `setAnimationState(state)`, `destroy()`
2. Set `static portType`, `static styles`, `static label` class properties
3. Import and register it in `frontend/scene/city/buildings.js`
4. For the standalone build, add the class inline to `pixelpulse_standalone.html`

### Adding a backend adapter

1. Create `backend/adapters/builtin/my_adapter.py` — subclass `AdapterBase`, implement `poll()` returning a `Signal`
2. No registration needed — the plugin loader discovers it automatically
3. Document it in `config.example.yaml` with a commented example

### Coding standards

- **Python:** PEP 8, async throughout, type hints on all function signatures, one-line docstrings on all public methods
- **JavaScript:** ES modules, no framework, camelCase variables, PascalCase classes, `SCREAMING_SNAKE` constants
- **Git commits:** Imperative present tense — `Add windmill animation` not `Added windmill animation`
- Never commit `config.yaml` — it may contain private API keys or URLs

---

## License

PixelPulse is open source. See [LICENSE](LICENSE) for details.

Kenney asset kits used in the sprite pipeline are [CC0 licensed](https://creativecommons.org/public-domain/cc0/).

Weather data from [Open-Meteo](https://open-meteo.com/) — free, no API key required.

---

*Built with PixiJS · FastAPI · psutil · Open-Meteo · Kenney Assets*
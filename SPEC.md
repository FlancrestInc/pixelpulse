# PIXELPULSE
## Animated System Monitoring Dashboard

**Project Specification & Architecture Guide**  
Version 3.0 — March 2026

---

> **Document Purpose**
>
> This document serves as the authoritative reference for the PixelPulse project. It defines the vision, technical architecture, design decisions, coding standards, and phased build plan. Any contributor should be able to read this document and understand exactly what the project is, how it works, and where to begin in order to make meaningful progress.

---

## 1. Vision & Goals

### 1.1 What is PixelPulse?

PixelPulse is a self-hosted, browser-based system monitoring dashboard that replaces static charts and numbers with a living, animated pixel-art city. Instead of watching CPU percentages tick up and down, you watch a city come alive: windmills spin, smokestacks billow, tickers scroll headlines, and the environment shifts in response to what your services are actually doing.

What makes PixelPulse distinct is that it is **configured like a toy, not a tool**. The city starts empty. You connect data sources, run signal pipes between them and your buildings, and place buildings on plots of land — all through an interactive graphical interface that feels like playing SimCity. When you step back into display mode, the configuration disappears and only the living city remains.

The core idea: a well-designed ambient display can tell you more at a glance than a traditional dashboard — and be genuinely enjoyable to have running on a screen all day.

### 1.2 Primary Goals

- **Ambient awareness** — The display communicates system health at a glance from across the room, without requiring close reading or interpretation.
- **Delightful to configure** — Setting up the city should feel like playing a game. Connecting a pipe, placing a building, and watching data flow through should be satisfying, not tedious.
- **Delightful to watch** — The scene should feel alive and interesting even when nothing is wrong. Idle should look peaceful, not boring.
- **Generic signal architecture** — Any metric from any source — system stats, web APIs, game servers, home automation — should be connectable through a simple adapter system without modifying core code.
- **Lightweight & reliable** — Designed to run 24/7 on a Raspberry Pi alongside other services. Minimal resource usage is a hard requirement.
- **Self-contained** — One Python process serves both the backend aggregator and the frontend files. No external dependencies beyond `requirements.txt`.

### 1.3 Non-Goals (v1)

The following are explicitly out of scope for the initial version:

- Multiple scene types (only the Pixel City scene will be implemented first)
- Character memory / persistent entity state across sessions
- User authentication or multi-user support
- Mobile-responsive layout (TV/monitor display is the primary target)
- Native desktop app — browser-only
- Advanced signal transform chains (basic range/threshold config only in v1)

### 1.4 Target Deployment

PixelPulse is designed to run on a Raspberry Pi (3B+ or newer) as part of a personal home dashboard. The display target is a TV or monitor in always-on mode, running Chromium in kiosk mode. It will coexist on the same Pi with a DAKBoard calendar display, and eventually integrate with calendar, to-do, and RSS data sources.

> **Design Constraint**
>
> Every technical decision should be evaluated against: *'Will this run comfortably on a Raspberry Pi 4 with 2GB RAM, displaying in a browser at 1080p, 24 hours a day?'* If the answer is uncertain, choose the lighter option.

---

## 2. The Three-Tier Architecture

PixelPulse is organized into three conceptual tiers that mirror how utilities and infrastructure work in a real city — and in SimCity. Each tier is visible and editable in edit mode; only the top tier is shown in display mode.

```
┌─────────────────────────────────────────────────────────────┐
│  TIER 3 — DISPLAY LAYER                                     │
│  The animated city. Buildings, roads, characters, sky.      │
│  Always visible.                                            │
├─────────────────────────────────────────────────────────────│
│  TIER 2 — PIPE LAYER                  [edit mode only]      │
│  Signal routing and configuration. Valves, gauges,          │
│  range settings, alert thresholds. Visual pipe network      │
│  connecting data sources to building plots.                 │
├─────────────────────────────────────────────────────────────│
│  TIER 1 — SOURCE LAYER                [edit mode only]      │
│  External data sources. System metrics, RSS feeds, APIs,    │
│  webhooks. Connected like utilities coming in underground.  │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 Tier 1 — Source Layer

The Source Layer is where external data enters PixelPulse. Each connected adapter appears as a source node — a visual panel at the bottom of the edit mode screen. Source nodes show their adapter type (system, RSS, HTTP poll, etc.), a live preview of their current output value, and the signal ID they emit.

Sources are added through the Signal Library panel (see Section 4). Once added, a source emits a named signal into the pipe network, where it can be routed to one or more buildings.

### 2.2 Tier 2 — Pipe Layer

The Pipe Layer is the routing and configuration layer between sources and buildings. Conceptually, this is the city's underground — the pipes that carry data from utilities to buildings.

In edit mode, pipes are rendered as visible lines connecting source nodes to building plot connection points. Each pipe carries a single signal. Along the pipe, **valves** can be placed to configure how the signal is interpreted before it reaches the building. A valve is a small inline configuration panel that exposes:

- **Range** — what raw value range maps to 0.0–1.0 (e.g., network traffic from 0–100 Mbps)
- **Alert threshold** — the value at which the connected building triggers an alert state
- **Label** — a human-readable name shown in the building tooltip and focus overlay

This keeps signal configuration contextual and minimal. Valves show only the settings relevant to that signal type. Advanced transform options (inversion, clamping, custom expressions) are reserved for a future release and hidden behind a toggle that does not exist in v1.

A signal can be routed to multiple buildings simultaneously by branching a pipe. A building can only accept one signal per port.

### 2.3 Tier 3 — Display Layer

The Display Layer is the animated city itself. This is what is visible at all times, including outside of edit mode. Buildings are placed on plots of land and driven by the signal connected to them through the pipe layer.

In edit mode, the Display Layer shows additional UI elements overlaid on the city:

- **Empty plots** — available land that can receive a building
- **Zoned plots** — plots with a pipe connected but no building placed yet (see Section 3.3)
- **Active plots** — fully wired plots with a building placed and a signal flowing
- **Building connection points** — the port icons on each building showing what signal types it accepts
- **Edit handles** — click targets for moving, replacing, or removing buildings

In display mode, all edit UI disappears and only the city remains.

### 2.4 Mode Switch

Transitioning between display mode and edit mode is a deliberate, animated event — not a checkbox toggle.

**Entering edit mode:** The city animates as if being "lifted." The underground pipe layer slides up into view from below; building plots glow to show they are interactive; source nodes appear at the bottom of the screen; the Signal Library panel slides in from the side. The sky dims slightly to indicate the city is paused.

**Exiting edit mode:** The pipe layer animates back underground; source nodes retract; the overlay UI fades; the sky brightens; the city resumes its normal animated state. The current layout is saved to the layout config file automatically on exit.

The mode switch is triggered by a persistent button — a small wrench icon in the corner of the screen in display mode, or a prominent "Done" button in edit mode.

---

## 3. The Pixel City Scene

### 3.1 Overview

The Pixel City is a flat, layered 2D city (SimCity-style side-on perspective) rendered on an HTML5 Canvas using Pixi.js. The city contains buildings, roads, characters, and environmental elements that all respond to incoming signal data. The scene should feel like a toy city that is inhabited and active.

**Note on rendering approach:** The original spec described an isometric view. During implementation this was revised to a layered flat 2D approach with depth strips, which proved more compatible with the target assets and performed better on Raspberry Pi hardware.

### 3.2 Core Design Principle: Entities ARE the Data

Characters and vehicles in the scene are not decorations reacting to data — they represent data. A web request coming in spawns a person who walks into a building, waits, and leaves. A background job spawns a worker who picks up tools. This makes the display feel alive rather than like a skin on top of a traditional dashboard.

The scene has two layers of signal response:

- **Environment state** — Driven by gauge signals. Affects the persistent appearance of the world: road traffic density, fill levels, time of day, weather.
- **Event moments** — Driven by event signals. Spawn entities or trigger animations: a delivery truck arrives, a backup job completes, a service goes down.

### 3.3 Plot States

Every plot of land in the city exists in one of three visible states:

| State | Appearance | Meaning |
|---|---|---|
| **Empty** | Grass pad or concrete lot | No signal connected, no building placed. Invites interaction. |
| **Zoned** | Small pylon with a port-type icon | Signal connected, but no building placed yet. Icon shows the signal type (gauge dial, text scroll, event bolt). |
| **Active** | Full building with signal animation | Signal connected and building placed. Fully operational. |

Zoned plots use the same visual language as building ports to communicate signal type, so a user can immediately see which buildings are compatible before dragging one in.

### 3.4 Buildings & Signal Types

Buildings have a **signal type affinity** — not a locked signal ID. A Windmill accepts any `gauge` signal; a news ticker accepts any `text` signal. The city stays narratively coherent without binding buildings to specific data sources.

**Port types and their icons:**

| Port Type | Icon | Compatible Signal Types | Example Buildings |
|---|---|---|---|
| `gauge` | Dial | `gauge` | Windmill, Power Station, Water Tower, Warehouse |
| `rate` | Speedometer | `rate`, `gauge` | Café, Traffic, Construction Yard |
| `text` | Scroll | `text` | Bank Ticker, Bus Stop Sign, Billboard |
| `event` | Lightning bolt | `event` | Data Vault, Alert Gate, Drive-In Theater |
| `state` | Traffic light | `state` | Auth Gate, Service Monitor |

Buildings advertise their accepted port types visually via icons on their connection points in edit mode. Attempting to connect an incompatible signal produces a brief shake animation and a tooltip explanation — never a confusing error message.

### 3.5 Building Catalogue

The following buildings are available to place. Each shows its port type, visual response, and available styles.

| Building | Port | Visual Response | Styles |
|---|---|---|---|
| **Windmill** | gauge | Rotation speed scales with value | Classic wood, Modern steel, Rustic stone |
| **Power Station** | gauge | Chimney smoke intensity scales with value | Industrial brick, Concrete modern, Old factory |
| **Water Tower** | gauge | Fill level visible in tank | Classic wood-leg, Steel municipal, Painted vintage |
| **Warehouse** | gauge | Shutter door height scales with fill level | Corrugated steel, Brick loading dock, Timber barn |
| **Server Tower** | gauge | Window blink rate + load bar scales with value | Glass office, Brutalist concrete, Retro mainframe |
| **Café** | rate | Neon sign + foot traffic scales with request rate | Corner diner, French bistro, Tech startup |
| **Construction Yard** | rate | Cranes and steam shovels active at rate | Earthworks, High-rise steel, Road crew |
| **Swimming Pool** | rate | Swimmer count and splash activity scales with rate | Municipal outdoor, Rooftop luxury, Community rec |
| **Bank Ticker** | text | Scrolling text on building fascia | Art deco bank, Modern finance, Roadside marquee |
| **Bus Stop** | text | Small sign displays current text value | Classic shelter, Minimal post, Retro covered |
| **Billboard** | text | Large display rotates through text values | Classic billboard, LED display, Painted wall |
| **Data Vault** | event | Truck arrives and unloads on event trigger | Secure bunker, Server farm, Underground vault |
| **Drive-In Theater** | event | Screen illuminates and cars park on event | Classic 50s, Modern multiplex, Rooftop cinema |
| **Auth Gate** | state | Barrier raises/lowers; alarm on failure state | Security booth, Railway crossing, Castle gate |
| **City Park** | — | Idle decoration. People relax here. | Manicured formal, Scrubby urban, Zen garden |
| **Dockyard** | gauge | Containers being stacked scales with value | Industrial port, Small marina, River wharf |

> **"Building" is a loose term.** A swimming pool, a construction yard, and a dockyard are all first-class city elements with the same signal wiring system as traditional buildings. Any animated scene element that accepts a signal is a "building" for configuration purposes.

### 3.6 Building Styles

Each building has multiple visual styles available in the building picker. Styles are purely aesthetic — they do not affect signal compatibility or animation behavior. Selecting a style is done in edit mode when placing or modifying a building.

Style variants are designed to be extensible: adding a new style requires only new sprite assets and a registry entry. No logic changes are required.

### 3.7 Starter City

When PixelPulse is first launched with no existing layout config, a starter city is automatically generated. The starter city demonstrates the three primary display types and requires no configuration from the user.

**Starter city contents:**

| Plot | Building | Signal | Source |
|---|---|---|---|
| Center-left | Windmill | `cpu_load` | system adapter (always available) |
| Center | Water Tower | `memory_used` | system adapter (always available) |
| Right | Bus Stop Sign | `weather_text` | weather adapter (IP geolocation, no config needed) |

The starter city shows that PixelPulse is alive from the first load. Each building serves as a natural invitation: "what if I replaced this with my own data?" The city can be freely edited or cleared from edit mode.

### 3.8 Roads & Traffic

Roads run horizontally at two levels (road1 and road2). Car and pedestrian density and speed scale with `net_throughput` (derived from `net_bytes_recv`) if that signal is connected. If not connected, roads show gentle idle-state traffic. A calm network has slow, sparse traffic; a busy network has fast, dense traffic.

### 3.9 Environment

- **Day/night cycle** — The sky transitions through dawn, day, dusk, and night. Three configurable modes: `clock` (follows real wall-clock time), `cycle` (fixed-duration loop for demo), or `signal` (maps another metric to sky position). Driven by the backend `sky_driver` adapter emitting a `sky_time` gauge signal (0.0–1.0).
- **Weather** — Driven by the `weather` adapter using the Open-Meteo API (no API key required). Conditions displayed in a text building or the ticker. Optionally drives visual scene mood.
- **Alert states** — When a signal crosses its configured alert threshold, the connected building flashes with a pulsing red overlay. Thresholds are configured per-pipe in the Pipe Layer (see Section 2.2).
- **Kenney sprite integration** — Decorative scene elements (houses, trees, street furniture) use rendered sprites from the Kenney City Kit and Kenney Roads Kit, loaded from `assets/sprites/city_sprites.json`. Falls back gracefully to procedural graphics if the atlas file is not present.

### 3.10 Scene Layout

The city layout is divided into depth strips. Fixed environmental elements (sky, roads, background skyline) are always present. Building plots are positioned in the main street strip and the mid strip. The user can place buildings on available plots in edit mode.

```
┌─────────────────────────────────────────────────────────────┐
│ Sky / Weather / Day-Night Gradient                          │
│   [Skyline: building-skyscraper-a/b/c/d/e tinted to mood]  │
│ Hill row: [low-detail-*] [building-type-*] mixed            │
│ ~~~~~~~~~~~~~~~~~~~ road 1 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~│
│ 🚗→  →🚌  ←🚗   street lights + planters                   │
│ [PLOT] [PLOT] [PLOT] [PLOT] [PLOT] [PLOT] — main strip      │
│ ~~~~~~~~~~~~~~~~~~~ road 2 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~│
│ 🚶 🚶  [PLOT] [PLOT]  tree-large  [PLOT] — mid strip        │
│ ═══════════════ [ticker plot, if placed] ═══════════════════│
└─────────────────────────────────────────────────────────────┘
```

### 3.11 Focus Mode

Clicking any active building in display mode opens a **focus overlay** — a lightweight panel anchored to the building that shows:

- Building name and current style
- Connected signal ID and label
- Current signal value as both a number and a progress bar
- A sparkline of the last 5–10 minutes of signal history
- Alert threshold marker on the sparkline

Focus mode does not enter edit mode. It is a read-only view for investigating a specific metric while keeping the full city visible. Clicking anywhere outside the panel closes it.

Focus mode requires the backend to maintain a rolling history buffer for each active signal (see Section 5.4).

### 3.12 Building Tooltips

Hovering over any active building in the browser (outside of focus mode) shows a minimal tooltip with the building name, signal label, and current value. This is distinct from focus mode — tooltips are brief and disappear on mouse-out.

### 3.13 LIVE / DEMO HUD Indicator

A small HUD indicator in the top-right corner shows `● DEMO` (amber) when running with simulated data, and switches to `● LIVE` (blue) once a WebSocket connection is established and the first `sky_time` signal is received from the backend.

---

## 4. Edit Mode Interface

### 4.1 Signal Library Panel

The Signal Library is the primary panel in edit mode. It slides in from the left side of the screen when edit mode is entered. It lists all signals currently known to the system in two sections:

- **Connected & in use** — signals that are wired to at least one building plot
- **Connected & available** — signals that have been added as adapters but are not yet wired to any building

Each signal entry shows its ID, human-readable label, current live value, signal type icon (gauge/rate/text/event/state), and adapter source. Clicking a signal entry highlights the pipe(s) it is routed through on the canvas.

To route a signal to a plot, the user drags from a signal entry in the library and drops it onto a plot. This creates a pipe and zones the plot. If the plot already has a building, a valve is automatically created on the pipe with default settings.

New signals are added to the library by clicking an "Add Source" button at the bottom of the panel, which opens the adapter configuration flow.

### 4.2 Adapter Configuration Flow

Adding a new source opens a step-by-step panel (not a full-screen modal — it overlays the edit mode canvas):

1. **Choose adapter type** — system, weather, RSS feed, HTTP poll, webhook, shell, file watcher
2. **Configure adapter** — type-specific form with only the required fields shown. Live preview of the signal value appears as soon as configuration is valid.
3. **Name the signal** — assign a human-readable label
4. **Done** — signal appears in the Signal Library under "Connected & available"

For the `system` adapter, step 2 presents a list of available metrics with checkboxes, allowing multiple signals to be added in one flow.

### 4.3 Building Picker

Clicking an empty or zoned plot opens the Building Picker — a panel showing all available buildings compatible with the plot's zoned signal type (if zoned) or all buildings (if empty).

Buildings are shown as animated preview sprites. Below each building is its name and port type icon. Selecting a building drops it onto the plot. If the plot is unzoned, the building is placed without a signal connection, and the connection point glows to invite wiring.

After placing a building, the Style Picker appears inline, showing style variants as small preview sprites. A style can be changed at any time by clicking the building in edit mode and selecting "Change Style."

### 4.4 Valve Configuration

Clicking a pipe segment in edit mode opens the Valve panel for that pipe. The valve shows:

- **Signal range** — min and max raw values that map to 0.0 and 1.0 respectively (e.g., 0–100 for CPU %, 0–1000 for Mbps). Defaults are sensible per signal type.
- **Alert threshold** — the normalized value (0.0–1.0) at which the building triggers an alert overlay. Default: 0.85.
- **Label** — display name used in tooltips and the focus overlay. Defaults to the signal's label.

The valve panel shows a live preview of the current signal value on a mini gauge, including where it falls relative to the alert threshold.

### 4.5 Removing & Rearranging

- **Remove a building** — click the building in edit mode, then click the remove icon. The plot returns to its zoned or empty state; the pipe remains.
- **Remove a pipe** — click the pipe, then click remove. The plot returns to empty state. The signal remains in the Signal Library as "available."
- **Remove a source** — click the signal in the Signal Library, then remove. Any pipes carrying that signal are also removed. Affected plots return to empty state.
- **Move a building** — drag it from one plot to another. Compatible plots highlight as valid drop targets.

---

## 5. Signal Architecture

### 5.1 The Signal Contract

Every piece of data in PixelPulse — regardless of its source — is normalized into a Signal before it reaches the scene. The scene never knows where data came from.

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

### 5.2 Signal Types

| Type | Value Format | Example Uses |
|---|---|---|
| `gauge` | Float 0.0 to 1.0 | CPU load, memory used, disk fill, battery level |
| `rate` | Float, events/second | HTTP requests/sec, errors/sec, packets/sec |
| `text` | String | RSS headlines, weather descriptions, status messages |
| `event` | String (event name) | `backup_completed`, `deploy_failed`, `user_registered` |
| `state` | String (enum value) | `up`, `down`, `degraded`, `warning`, `maintenance` |

Scene bindings always reference a signal by its `id`. Port type compatibility is evaluated at connection time in the edit mode UI.

### 5.3 Adapters

An adapter is a Python module that collects data from a specific source and emits normalized signals into the signal engine.

#### system (built-in)

Uses the `psutil` library to read local machine metrics.

| Metric ID | Description |
|---|---|
| `cpu_percent` | Overall CPU utilization as a gauge (0.0 to 1.0) |
| `memory_used` | RAM usage as a gauge (used / total) |
| `disk_used` | Disk usage for a given mount point |
| `net_bytes_sent` | Network bytes sent, expressed as a rate |
| `net_bytes_recv` | Network bytes received, expressed as a rate |
| `cpu_temp` | CPU temperature as a gauge (normalized to 0–100°C range) |
| `http_requests` | Stub counter for HTTP request rate (incrementable via webhook) |
| `active_streams` | Active Jellyfin-style stream count (configurable via shell adapter) |

#### http_poll

Makes an HTTP GET request on a configurable interval and extracts a value from the JSON response using a JSONPath expression or regex. Optionally applies a transform expression to normalize the value. Supports configurable headers, method, and body for authenticated APIs.

```yaml
- id: gas_price
  adapter: http_poll
  url: "https://api.example.com/gas?zip=84043"
  json_path: "$.current_price"
  interval: 300
  transform: "value / 6.0"
```

#### webhook

Registers an HTTP endpoint on the PixelPulse backend that external services can POST to. The payload is mapped to a signal using a configurable template.

```yaml
- id: deploy_event
  adapter: webhook
  path: /hooks/deploy
  event_name: deploy_completed
```

#### shell

Runs a shell command on a configurable interval and reads stdout as a signal value.

```yaml
- id: active_streams
  adapter: shell
  command: "python3 /home/pi/scripts/jellyfin_streams.py"
  interval: 30
  type: gauge
  max_value: 10
```

#### file_watcher

Watches a local file and emits its value on change. Three modes: `last_float`, `last_json`, `line_count`. Handles log rotation via inode tracking.

```yaml
- id: error_rate
  adapter: file_watcher
  path: /var/log/app/errors.log
  mode: line_count
  ceiling: 100
  interval: 10
```

#### rss_feed

Fetches one or more RSS feeds on a configurable interval and emits the most recent headline as a `text` signal. Maintains a rotating deque of formatted headlines. Strips HTML entities and tags.

```yaml
- id: news_ticker
  adapter: rss_feed
  feeds:
    - url: "https://feeds.bbci.co.uk/news/rss.xml"
      name: "BBC News"
  max_items: 20
  interval: 300
```

#### weather

Fetches current weather conditions from the Open-Meteo API (no API key required). Location resolved by: explicit lat/lon → city name geocoding → IP geolocation fallback → hardcoded default. WMO weather codes mapped to human-readable descriptions. Emits as `text` type.

```yaml
- id: weather_text
  adapter: weather
  units: fahrenheit
  interval: 600
```

#### sky_driver

Internal adapter that emits a `sky_time` signal (0.0–1.0) to drive the frontend day/night cycle. Three modes: `clock`, `cycle`, `signal`.

```yaml
sky_driver:
  mode: clock
  cycle_minutes: 10
```

### 5.4 The Signal Engine

The signal engine is the central coordinator in the backend. Responsibilities:

- Loading and initializing all configured adapters on startup
- Scheduling each adapter's polling interval using async task loops with exponential backoff on error (max 30s)
- Receiving signals from adapters and validating them against the signal contract
- Maintaining the current state of all signals (latest value per id)
- **Maintaining a rolling history buffer** for each active signal — the last 10 minutes of values at the adapter's polling interval, used by the focus overlay sparkline
- Broadcasting signals to all connected WebSocket clients
- Serving the last known value and history buffer to newly connected clients on handshake
- Exposing a REST endpoint for the edit mode UI to query available signals, add adapters, and update layout config

---

## 6. Configuration & Persistence

### 6.1 Two Config Files

PixelPulse uses two separate configuration files to keep concerns cleanly separated:

**`backend/config.yaml`** — Adapter and server configuration. Defines which data sources are active, their credentials, polling intervals, and server settings. This file is the source of truth for the backend. It can be edited by hand or written by the GUI. It is gitignored to protect credentials.

**`backend/layout.yaml`** — City layout configuration. Defines which buildings are placed on which plots, what signal each is connected to, valve settings, and style choices. This file is written by the GUI on every edit mode exit and can also be hand-authored. It is safe to commit to git (no credentials).

### 6.2 config.yaml Structure

```yaml
server:
  host: 0.0.0.0
  port: 8000

sky_driver:
  mode: clock         # clock | cycle | signal
  cycle_minutes: 10

signals:
  - id: cpu_load
    adapter: system
    metric: cpu_percent
    interval: 2

  - id: memory_used
    adapter: system
    metric: memory_used
    interval: 5

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

### 6.3 layout.yaml Structure

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

### 6.4 Starter Layout

When `layout.yaml` does not exist, PixelPulse generates a default layout file with the starter city (Windmill + Water Tower + Bus Stop, pre-wired to system and weather signals). This file is written to disk so that subsequent launches load the user's layout.

### 6.5 Bidirectional Config

The GUI and config files are always in sync:

- **GUI → file:** On edit mode exit, the current layout is serialized to `layout.yaml`. New adapters added through the GUI are appended to `config.yaml`.
- **File → GUI:** On page load, both files are read by the backend and sent to the frontend as part of the initial WebSocket handshake payload. Reloading the page after hand-editing a config reflects the changes immediately.

---

## 7. Tech Stack

### 7.1 Backend

| Package | Purpose |
|---|---|
| Python 3.11+ | Runtime. Pre-installed on Raspberry Pi OS. |
| FastAPI | Web framework. Handles HTTP routes, WebSocket connections, REST API for edit mode, and serves static frontend files. |
| uvicorn | ASGI server. |
| psutil | System metrics (CPU, RAM, disk, network, temperature). |
| httpx | Async HTTP client for `http_poll` and `weather` adapters. |
| PyYAML | Parses `config.yaml` and `layout.yaml`. |
| jsonpath-ng | Evaluates JSONPath expressions in `http_poll` adapter. |
| feedparser | Parses RSS feeds. |

### 7.2 Frontend

| Technology | Purpose |
|---|---|
| HTML5 Canvas | Rendering surface for the city scene. |
| Pixi.js v7 | 2D WebGL renderer with Canvas fallback. Sprite sheets, animation, depth sorting, render loop. |
| `PIXI.Assets` | Atlas loader for the Kenney sprite sheet. |
| Vanilla JavaScript (ES Modules) | No framework. Keeps the bundle small. Zero build steps. |
| WebSocket (native browser API) | Receives signal updates in real time. Reconnects every 3 seconds on disconnect. |

> **Why no React/Vue/Svelte?**
>
> The edit mode UI, while interactive, is primarily canvas-driven. A component framework would add build tooling complexity and bundle size for minimal benefit. The edit mode UI is implemented as Pixi.js overlay containers and vanilla JS panels, consistent with the rest of the rendering stack.

### 7.3 Assets

| Source | Usage |
|---|---|
| Kenney City Kit (Roads) | Road tiles, street lights, construction details, signs. |
| Kenney City Kit (Commercial) | Skyscrapers and low-detail background buildings. |
| Kenney City Kit (Suburban) | Residential houses, trees, fences, planters. |
| Kenney Industrial Kit | Industrial buildings, chimneys, storage tanks. |
| Custom procedural graphics | Metric buildings drawn with `PIXI.Graphics` for runtime animation flexibility. |
| Custom pixel-art spritesheet | Cars, people, windmill — embedded as base64 in the standalone HTML. |

### 7.4 Infrastructure

| Component | Role |
|---|---|
| Raspberry Pi 4 (2GB+) | Primary hosting target. |
| Chromium (kiosk mode) | Displays the dashboard full-screen. |
| systemd service | Auto-starts on boot, restarts on crash. *(Planned — Phase 6b)* |
| GitHub | Version control. |
| Code Server | VS Code in the browser, for development on the Pi. |

---

## 8. Project Structure

### 8.1 Repository Layout

```
pixelpulse/
├── backend/
│   ├── main.py                  # FastAPI app entry point
│   ├── signal_engine.py         # Core signal coordinator + history buffer
│   ├── config_api.py            # REST endpoints for edit mode (read/write config)
│   ├── config.yaml              # Adapter configuration (gitignored)
│   ├── config.example.yaml      # Safe template
│   ├── layout.yaml              # City layout (safe to commit)
│   ├── layout.default.yaml      # Starter city layout (shipped with repo)
│   ├── config_loader.py         # Parses and validates both config files
│   ├── adapters/
│   │   ├── __init__.py
│   │   ├── system.py
│   │   ├── http_poll.py
│   │   ├── webhook.py
│   │   ├── shell.py
│   │   ├── file_watcher.py
│   │   ├── rss_feed.py
│   │   ├── weather.py
│   │   └── sky_driver.py
│   └── requirements.txt
│
├── frontend/
│   ├── index.html
│   ├── main.js                  # App bootstrap, WebSocket init, mode management
│   ├── signal_bus.js            # WS connection, signal distribution
│   ├── edit_mode/
│   │   ├── edit_controller.js   # Mode switch logic and animation
│   │   ├── signal_library.js    # Signal Library panel
│   │   ├── building_picker.js   # Building Picker panel
│   │   ├── valve_panel.js       # Valve configuration panel
│   │   ├── pipe_renderer.js     # Visual pipe network rendering
│   │   └── layout_serializer.js # Serializes current layout to YAML for backend
│   └── scene/
│       ├── scene_manager.js
│       ├── city/
│       │   ├── city_scene.js
│       │   ├── plot_manager.js  # Manages plot states (empty/zoned/active)
│       │   ├── buildings.js     # Building registry and base class
│       │   ├── building_types/  # One file per building type
│       │   │   ├── windmill.js
│       │   │   ├── power_station.js
│       │   │   ├── water_tower.js
│       │   │   ├── warehouse.js
│       │   │   ├── server_tower.js
│       │   │   ├── cafe.js
│       │   │   ├── construction_yard.js
│       │   │   ├── swimming_pool.js
│       │   │   ├── bank_ticker.js
│       │   │   ├── bus_stop.js
│       │   │   ├── billboard.js
│       │   │   ├── data_vault.js
│       │   │   ├── drive_in.js
│       │   │   ├── auth_gate.js
│       │   │   ├── city_park.js
│       │   │   └── dockyard.js
│       │   ├── characters.js
│       │   ├── vehicles.js
│       │   └── environment.js
│       └── shared/
│           ├── tile_map.js
│           ├── sprite_sheet.js
│           ├── focus_overlay.js  # Focus mode panel
│           └── iso_utils.js
│
├── pixelpulse_standalone.html   # Self-contained single-file build
│
├── assets/
│   ├── sprites/
│   │   ├── city_sprites.json
│   │   ├── city_sprites.png
│   │   └── raw/
│   └── audio/                   # Reserved
│
├── tools/
│   ├── render_sprites.py
│   ├── pack_sprites.py
│   └── README.md
│
├── README.md
└── .gitignore
```

### 8.2 Key File Responsibilities

**`backend/main.py`** — Entry point. Instantiates FastAPI, mounts frontend static files, registers WebSocket route, webhook routes, and the config REST API routes. Initialises the signal engine on startup.

**`backend/signal_engine.py`** — Core backend coordinator. Loads all adapters, schedules polling with exponential backoff, maintains current signal state, maintains rolling history buffer (10 min), broadcasts to WebSocket clients, and sends full state + history snapshot on new connection.

**`backend/config_api.py`** — REST API used exclusively by edit mode. Exposes endpoints to: list available signals, add/remove adapter config, read and write `layout.yaml`. All writes are atomic (write to temp file, rename).

**`frontend/edit_mode/edit_controller.js`** — Manages the mode switch animation, coordinates the opening/closing of edit mode panels, and triggers layout serialization on exit.

**`frontend/edit_mode/pipe_renderer.js`** — Renders the visual pipe network over the city canvas in edit mode. Draws connection lines from source nodes to plot connection points, highlights pipes on hover, and handles drag-and-drop wiring interactions.

**`frontend/scene/city/plot_manager.js`** — Tracks the state of every plot (empty / zoned / active), renders the appropriate visual for each state, and communicates plot changes to the building layer.

**`frontend/scene/shared/focus_overlay.js`** — Renders the focus mode panel anchored to a clicked building. Draws the sparkline from signal history data, formats the current value, and handles panel dismissal.

---

## 9. Coding Standards

### 9.1 Python (Backend)

- **Style** — PEP 8 throughout. Use ruff for linting.
- **Async** — All I/O operations must be async. No blocking calls on the main thread.
- **Type hints** — All function signatures must have type annotations.
- **Docstrings** — Every module, class, and public function gets a one-line docstring minimum.
- **Error handling** — Adapter failures must never crash the signal engine. Each adapter runs in a `try/except` loop with exponential backoff (initial 2s, max 30s).
- **Logging** — Python standard `logging` module. Default level INFO.

```python
async def poll(self) -> Optional[Signal]:
    """Poll the HTTP endpoint and return a normalized signal."""
    try:
        response = await self.client.get(self.url)
        value = self._extract(response.json())
        return Signal(id=self.id, type='gauge', value=value)
    except Exception as e:
        logger.error(f"http_poll adapter '{self.id}' failed: {e}")
        return None
```

### 9.2 JavaScript (Frontend)

- **Modules** — ES module syntax (`import`/`export`) throughout. No global variables.
- **No framework** — Vanilla JS + Pixi.js only.
- **Classes for scene objects** — Each building type, edit mode panel, and environment element is a class with `init()` and `update(delta)` methods.
- **Signal subscription pattern** — Scene objects subscribe to specific signal IDs via the signal bus. They do not read global state directly.
- **Comments** — Every class gets a JSDoc comment block.
- **Naming** — camelCase for variables/functions, PascalCase for classes, `SCREAMING_SNAKE` for constants.
- **Sprite helpers** — Use `kSprite(atlasName, targetH, fallback)` and `kRand(names[], targetH, fallback)` for Kenney atlas sprites with graceful fallback to procedural graphics.

```javascript
/** Windmill building. Accepts gauge signals. Rotation speed scales with value. */
export class Windmill {
  constructor(app, plot, style = 'classic_wood') {
    this.style = style;
    this.rotationSpeed = 0;
  }

  update(delta) {
    this.blades.rotation += this.rotationSpeed * delta;
  }

  onSignal(signal) {
    this.rotationSpeed = signal.value * MAX_ROTATION_SPEED;
  }
}
```

### 9.3 Building Type Contract

Every building type module must export a class that conforms to this interface:

```javascript
export class BuildingType {
  static portType = 'gauge';          // gauge | rate | text | event | state
  static styles = ['default'];        // list of available style keys
  static label = 'Building Name';     // display name in building picker

  constructor(app, plot, style) { }
  init() { }                          // called once after placement
  update(delta) { }                   // called every frame
  onSignal(signal) { }               // called when a new signal value arrives
  setEditMode(active) { }            // show/hide edit UI elements
  destroy() { }                       // clean up Pixi objects on removal
}
```

### 9.4 Git Conventions

- **Commit messages** — Imperative present tense: 'Add windmill animation' not 'Added windmill animation'.
- **Branch naming** — `feature/thing`, `fix/thing`, `chore/thing`.
- **Commit scope** — One logical change per commit.
- Do not commit `config.yaml` — use `config.example.yaml`.
- `layout.yaml` is safe to commit (no credentials).
- `.gitignore` includes: `__pycache__`, `.env`, `node_modules`, `*.pyc`, `config.yaml`.

---

## 10. Build Phases

### Phase 1 — Render ✅

**Goal:** Prove the visual foundation. A beautiful, animated scene with no backend.

**Delivered:**
- Pixi.js canvas fills the browser window
- Layered depth strips: skyline, hill, road1, main street, road2, mid strip, foreground
- 8 metric buildings placed and drawn with procedural graphics
- Day/night sky gradient cycles on a timer
- Traffic (cars and pedestrians) animates along both roads
- Windmill animates at fixed speed
- Scene looks intentional and pleasant at 1080p from two metres

---

### Phase 2 — Data Pipeline ✅

**Goal:** Real signals flowing from the Pi to the browser.

**Delivered:**
- FastAPI backend with uvicorn
- System adapter emits `cpu_load`, `memory_used`, `disk_used`
- WebSocket at `ws://localhost:8000/ws`
- `signal_bus.js` connects and distributes incoming signals
- Full snapshot sent to new connections on handshake
- Demo mode with oscillating signals if backend unavailable; reconnects every 3s

---

### Phase 3 — Wire It Together ✅

**Goal:** The scene reacts to real data.

**Delivered:**
- Windmill speed → `cpu_load`
- Traffic density/speed → `net_bytes_recv`
- Warehouse shutter → `disk_used`
- Power station smoke → `cpu_load`
- Server Tower load bar + blink → `cpu_load`
- Bank fill bar → `memory_used`
- Drive-in screen → `active_streams`
- Alert flash overlay on threshold breach
- Sky driver: `sky_time` drives gradient, tint, street lights
- LIVE/DEMO HUD indicator
- Building tooltips on hover
- Scene bindings from `config.yaml`

---

### Phase 4 — Generic Adapters ✅

**Goal:** Anyone can connect their own data sources.

**Delivered:**
- `http_poll`, `webhook`, `shell`, `file_watcher` adapters
- All configured via `config.yaml`
- `config.example.yaml` committed as template

---

### Phase 5a — RSS & Weather ✅

**Goal:** Text signals and ticker display.

**Delivered:**
- `rss_feed` adapter: concurrent fetch, rotating deque, emits as text signal
- `weather` adapter: Open-Meteo, IP geolocation fallback, emits as text signal
- Ticker display on bank building
- Demo mode fallback text

---

### Phase 5b — Kenney Sprite Integration ✅

**Goal:** Replace procedural decorative sprites with rendered 3D-to-2D Kenney assets.

**Delivered:**
- Blender headless render script (`tools/render_sprites.py`)
- Atlas packer (`tools/pack_sprites.py`)
- `kSprite()` and `kRand()` helpers with graceful fallback
- Kenney sprites throughout: skyline, hill row, mid strip, foreground, street furniture

---

### Phase 6 — Edit Mode & Three-Tier UI *(Next)*

**Goal:** The city is configurable through a graphical interface. The three-tier architecture is fully interactive.

**Deliverables:**
- Mode switch animation: city lifts, pipe layer slides up, edit panels appear
- Plot states: empty / zoned / active, with correct visual for each
- Signal Library panel: lists connected and available signals with live values
- Adapter configuration flow: step-by-step source addition with live preview
- Building Picker: animated previews, filtered by port type compatibility
- Style Picker: inline style selection per building
- Pipe renderer: visual pipe network over the canvas
- Valve panel: range, alert threshold, label configuration with live preview
- Edit handles: move, replace, remove buildings and pipes
- Port type icons on buildings and zoned plots
- Incompatible connection rejection (shake animation + tooltip)
- Layout serialization: edit mode exit writes `layout.yaml` via REST API
- Config API: backend endpoints for read/write of both config files
- Starter city: auto-generated on first launch from `layout.default.yaml`
- Bidirectional config: hand-edited files reflected on page reload

---

### Phase 7 — Signal History & Focus Mode *(Planned)*

**Goal:** Users can investigate specific metrics without leaving the city view.

**Deliverables:**
- Signal engine rolling history buffer (10 min per active signal)
- History buffer included in WebSocket handshake payload and incremental updates
- Focus overlay panel anchored to clicked building
- Sparkline rendered from history data
- Alert threshold marker on sparkline
- Panel dismissal on outside click or Escape

---

### Phase 8a — Extended Building Catalogue *(Planned)*

**Goal:** Expand the available building types and styles.

**Planned buildings:** Construction Yard, Swimming Pool, Dockyard, Billboard, Bus Stop, additional style variants for existing buildings.

---

### Phase 8b — Calendar / To-Do Integration *(Planned)*

**Goal:** Surface upcoming events and tasks in the scene.

**Planned deliverables:**
- Calendar adapter: local iCal or CalDAV/Google Calendar; emits as text or event signal
- To-do adapter: local task list; emits count as gauge or individual items as text
- Integration with DAKBoard data if colocated on the same Pi

---

### Phase 8c — Raspberry Pi Kiosk Setup *(Planned)*

**Goal:** PixelPulse boots and displays automatically.

**Planned deliverables:**
- `systemd` service file for auto-start and auto-restart
- Chromium kiosk launch script
- Pi-specific configuration notes
- Full setup README for fresh Raspberry Pi OS install

---

### Phase 8d — Alert Notifications *(Planned)*

**Goal:** Critical threshold breaches produce an audible notification.

**Planned deliverables:**
- Web Audio API alert tone on threshold crossing
- Optional desktop notification via Notifications API
- Configurable cooldown to prevent repeat alerts

---

## 11. Future Ideas & Parking Lot

### Additional Scene Types

- **RPG Village / Adventurer's Guild** — Heroes represent services. Quests represent jobs. A dragon appears during CPU spikes.
- **Theme Park (RCT-style)** — Rides are services. Guests are requests. Queue length is backlog.
- **Harbor / Port** — Ships are inbound connections. Cranes are disk writes. A lighthouse is the uptime beacon.

### Character Memory

Give persistent characters a state history — an uptime streak, a mood, a name. A service that keeps crashing gets a grumpy-looking character.

### Audio

Ambient city sounds that scale with activity. The `assets/audio/` directory is reserved.

### Mobile / Responsive View

A simplified view for smaller screens.

### Community Style Packs

Community-contributed building style variants as installable asset packs. No logic changes required to add new styles.

---

> **Working Title Note**
>
> "PixelPulse" is a working title. Rename at any time — update `README.md`, the systemd service name, and this document header. The architecture is not coupled to the name.
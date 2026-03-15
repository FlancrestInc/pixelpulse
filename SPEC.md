# PIXELPULSE
## Animated System Monitoring Dashboard

**Project Specification & Architecture Guide**  
Version 3.4 — March 2026

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

Transitioning between display mode and edit mode is a deliberate, animated event — not a checkbox toggle. The total transition duration is 600ms in each direction. All timings use an `ease-in-out` curve unless otherwise noted.

**Entering edit mode (600ms total):**

| Time | Event |
|---|---|
| 0ms | Sky begins dimming to 60% brightness. City render loop pauses signal-driven animations (buildings freeze). Road traffic slows to a stop. |
| 0–200ms | The entire city scene translates upward by 48px (the "lift"). |
| 100–300ms | The pipe layer fades in from below — pipes and source nodes slide up from off-screen bottom, easing to their resting positions. |
| 200–400ms | Building plots glow with a pulsing highlight to indicate interactivity. Connection port icons fade in on buildings. |
| 300–500ms | The Signal Library panel slides in from the left edge (translateX from -320px to 0). |
| 500–600ms | Edit mode is fully active. The wrench button is replaced by a "Done" button in the top-right corner. |

**Exiting edit mode (600ms total):**

| Time | Event |
|---|---|
| 0ms | Layout is serialized and sent to the backend via REST API (non-blocking — save happens in background). |
| 0–200ms | Signal Library panel slides back out to the left. Valve panels and building pickers close immediately. |
| 100–300ms | Plot highlights and port icons fade out. |
| 200–400ms | Pipe layer and source nodes slide back down off-screen. |
| 400–550ms | City scene translates back down 48px to its resting position. |
| 500–600ms | Sky brightens back to 100%. City render loop resumes signal-driven animations. "Done" button replaced by wrench icon. |

The mode switch is triggered by a persistent button — a small wrench icon (⚙) in the top-right corner of the screen in display mode, or a prominent "Done ✓" button in the same position in edit mode. The button is always visible and always clickable, even mid-transition (clicking during transition snaps immediately to the target state).

If the backend save fails on exit, a small non-blocking toast notification appears: "Layout save failed — changes may not persist." The city resumes normally regardless.

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

### 3.7 Building Animation States

Every building exists in one of four animation states at any given time. Implementers must handle all four.

| State | Condition | Visual Behavior |
|---|---|---|
| **Idle** | Building placed, pipe connected, signal value is 0.0 | Building is static. No driven animation plays. Passive environmental animations (ambient sprite loops like grass, flags, steam wisps) continue at their base rate. |
| **Active** | Building placed, pipe connected, signal value > 0.0 | Building's driven animation plays, scaled to signal value. e.g. Windmill spins faster as value increases. |
| **Alert** | Signal value exceeds the pipe's configured alert threshold | Active animation continues. A red sinusoidal pulse overlay is added on top (1.2Hz, peak `rgba(255,60,60,0.55)`). Persists until value drops below threshold. |
| **Disconnected** | Building placed, but backend is unreachable OR pipe connected to a signal that has not received a value within 2× its configured interval | Building is static. A yellow lightning bolt icon (⚡) is displayed centered above the building, matching the SimCity "no power" convention. Passive environmental animations continue. The icon disappears as soon as a valid signal value is received. |

**No-pipe state:** A building placed with no pipe connected (zoned but not wired) shows no animation and no disconnected icon — it simply sits as a static decorative element. This is distinct from "disconnected" which implies a connection was expected but failed. In edit mode, the unconnected port glows to invite wiring.

**Passive animations** are sprite-level idle loops built into the asset itself (e.g. a flag waving, smoke wisps, grass rustling). These always play regardless of signal state and are not driven by signal values. They must be implemented as looping `AnimatedSprite` frames on the sprite itself, not in the building's `update()` method.

### 3.8 Starter City

When PixelPulse is first launched with no existing layout config, a starter city is automatically generated. The starter city demonstrates the three primary display types and requires no configuration from the user.

**Starter city contents:**

| Plot | Building | Signal | Source |
|---|---|---|---|
| Center-left | Windmill | `cpu_load` | system adapter (always available) |
| Center | Water Tower | `memory_used` | system adapter (always available) |
| Right | Bus Stop Sign | `weather_text` | weather adapter (IP geolocation, no config needed) |

The starter city shows that PixelPulse is alive from the first load. Each building serves as a natural invitation: "what if I replaced this with my own data?" The city can be freely edited or cleared from edit mode.

### 3.9 Roads & Traffic

Roads run horizontally at two levels (road1 and road2). Car and pedestrian density and speed scale with `net_throughput` (derived from `net_bytes_recv`) if that signal is connected. If not connected, roads show gentle idle-state traffic. A calm network has slow, sparse traffic; a busy network has fast, dense traffic.

### 3.10 Environment

- **Day/night cycle** — The sky transitions through dawn, day, dusk, and night. Three configurable modes: `clock` (follows real wall-clock time), `cycle` (fixed-duration loop for demo), or `signal` (maps another metric to sky position). Driven by the backend `sky_driver` adapter emitting a `sky_time` gauge signal (0.0–1.0).
- **Weather** — Driven by the `weather` adapter using the Open-Meteo API (no API key required). Conditions displayed in a text building or the ticker. Optionally drives visual scene mood.
- **Alert states** — When a signal crosses its configured alert threshold, the connected building enters an alert state. The alert state persists for as long as the signal value remains above the threshold — it clears immediately when the value drops back below. Visual: a red overlay pulses on the building at 1.2Hz (0–100% opacity, sinusoidal), tinted `rgba(255, 60, 60, 0.55)` at peak. Any associated alert sound (Phase 8d) uses a separate cooldown of 60 seconds by default (configurable) to prevent rapid re-triggering — the visual continues regardless of sound cooldown.
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

#### Canvas Scaling

The Pixi.js canvas always fills the browser window. On load and on every window resize event, the renderer is resized and the scene is rescaled to match. The scene uses a **fixed internal reference resolution of 1920×1080** — all positions, sizes, and layout coordinates are defined at this resolution, then scaled uniformly to fit the actual window size. This means the scene looks correct at any aspect ratio by letterboxing or pillarboxing with a neutral background color (`#1a1a2e`) if the window aspect ratio differs from 16:9.

The resize handler debounces at 150ms to avoid thrashing the renderer on continuous drag-resize.

```javascript
// Pseudocode — resize handler
window.addEventListener('resize', debounce(() => {
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  app.renderer.resize(window.innerWidth, window.innerHeight);
  scene.scale.set(scale);
  scene.position.set(
    (window.innerWidth  - 1920 * scale) / 2,
    (window.innerHeight - 1080 * scale) / 2
  );
}, 150));
```

#### Plot Grid

Plots are fixed positions arranged in two horizontal rows within the scene.

**Default configuration:** 6 plots per row. Configurable via `plots_per_row` in `layout.yaml` (range: 4–12).

**Plot sizing:** Plot width is calculated as `1920 / (plots_per_row + 1)`, giving even spacing with margins on each side. At the default of 6 plots, each plot is approximately 274px wide at the reference resolution. At 10 plots, approximately 175px. Buildings are drawn to fill their plot width, scaling proportionally.

**Plot rows:**
- `main` row: sits between road1 and road2. Contains `plots_per_row` plots.
- `mid` row: sits below road2. Contains `floor(plots_per_row / 2)` plots, interleaved with decorative trees and street furniture.
- `ticker` row: a single full-width slot at the bottom of the scene, reserved for text-type buildings (Bank Ticker, Billboard). Optional — empty by default.

**Plot ID convention:** Plot IDs are assigned at layout load time based on row and position.

| Row | ID Format | Example (6-plot config) |
|---|---|---|
| Main row | `main_1` … `main_N` | `main_1` through `main_6` |
| Mid row | `mid_1` … `mid_N` | `mid_1` through `mid_3` |
| Ticker row | `ticker` | `ticker` |

Plot IDs are stable — `main_3` always refers to the third slot in the main row regardless of what building is placed there. If `plots_per_row` changes, existing assignments are remapped left-to-right; surplus plots are cleared.

### 3.12 Focus Mode

Clicking any active building in display mode opens a **focus overlay** — a lightweight panel anchored to the building that shows:

- Building name and current style
- Connected signal ID and label
- Current signal value as both a number and a progress bar
- A sparkline of the last 5–10 minutes of signal history
- Alert threshold marker on the sparkline

Focus mode does not enter edit mode. It is a read-only view for investigating a specific metric while keeping the full city visible. Clicking anywhere outside the panel closes it.

Focus mode requires the backend to maintain a rolling history buffer for each active signal (see Section 5.4).

### 3.13 Building Tooltips

Hovering over any active building in the browser (outside of focus mode) shows a minimal tooltip with the building name, signal label, and current value. This is distinct from focus mode — tooltips are brief and disappear on mouse-out.

### 3.14 LIVE / DEMO HUD Indicator

A small HUD indicator in the top-right corner shows `● DEMO` (amber) when running with simulated data, and switches to `● LIVE` (blue) once a WebSocket connection is established and the first `sky_time` signal is received from the backend.

### 3.15 Demo Mode & Backend Unavailability

PixelPulse degrades gracefully when the backend is unreachable.

**Full demo mode** (backend never connected): The starter city layout is rendered using simulated oscillating signals for all three starter buildings. The Signal Library is visible in edit mode but shows a "Backend unavailable — simulated data" banner. The user can still enter edit mode and interact with the UI, but adapter configuration changes cannot be saved. All buildings show their driven animations using the fake data. No disconnected icons are shown — demo mode is not a connection failure, it is an intentional fallback.

**Lost connection** (backend was connected, then dropped): The WebSocket reconnects every 3 seconds. During the disconnected period, each building that was receiving a live signal transitions to the Disconnected state (⚡ icon) after 2× its signal's configured polling interval elapses with no update. The last-received value is retained for display in tooltips and focus overlay, marked as stale with a grey tint. When the connection is restored, the ⚡ icons clear and driven animations resume from the new values.

**Edit mode during lost connection**: The user can still open edit mode and rearrange the layout. On edit mode exit, the save is queued and retried every 5 seconds until the backend responds. A persistent "Unsaved changes" indicator is shown until the save succeeds.

---

## 4. Edit Mode Interface

### 4.1 Signal Library Panel

The Signal Library is the primary panel in edit mode. It slides in from the left side of the screen when edit mode is entered. It lists all signals currently known to the system in two sections:

- **Connected & in use** — signals that are wired to at least one building plot
- **Connected & available** — signals that have been added as adapters but are not yet wired to any building

Each signal entry shows its ID, human-readable label, current live value, signal type icon (gauge/rate/text/event/state), and adapter source. Clicking a signal entry highlights the pipe(s) it is routed through on the canvas.

For signals with additional metadata — such as those sourced from the Prometheus adapter, which carry a PromQL query string, server URL, and host label — a **"Source details"** disclosure toggle is shown below the primary signal info. This is collapsed by default. Expanding it shows the metadata in a small secondary panel. This keeps the library uncluttered for simple signals while surfacing useful context for complex ones.

To route a signal to a plot, the user drags from a signal entry in the library and drops it onto a plot. This creates a pipe and zones the plot. If the plot already has a building, a valve is automatically created on the pipe with default settings.

New signals are added to the library by clicking an "Add Source" button at the bottom of the panel, which opens the adapter configuration flow.

### 4.2 Adapter Configuration Flow

Adding a new source opens a step-by-step panel (not a full-screen modal — it overlays the edit mode canvas):

1. **Choose adapter type** — system, weather, RSS feed, HTTP poll, webhook, shell, file watcher, Prometheus, or any loaded plugin
2. **Configure adapter** — type-specific form with only the required fields shown. Live preview of the signal value appears as soon as configuration is valid. For Prometheus, this step shows a PromQL query editor with a test-query button that fires against the configured server and previews the result.
3. **Name the signal(s)** — assign human-readable labels. For multi-host Prometheus queries using `label_as_suffix`, a preview of the generated signal IDs is shown.
4. **Done** — signal(s) appear in the Signal Library under "Connected & available"

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

**Standard signal object:**
```json
{
  "id": "cpu_load",
  "type": "gauge",
  "value": 0.72,
  "label": "CPU Load",
  "source": "system",
  "timestamp": 1710000000,
  "metadata": {}
}
```

The `metadata` field is optional and empty for most signals. Adapters that produce richer context (e.g. Prometheus) populate it:

**Prometheus signal metadata example:**
```json
{
  "id": "cpu_load_server1",
  "type": "gauge",
  "value": 0.61,
  "label": "CPU Load — server1",
  "source": "prometheus",
  "timestamp": 1710000000,
  "metadata": {
    "promql": "1 - avg by (instance)(rate(node_cpu_seconds_total{mode=\"idle\"}[1m]))",
    "prometheus_url": "http://localhost:9090",
    "host_label": "server1"
  }
}
```

**Signal field definitions:**

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Unique signal identifier. Lowercase, underscores only. Must be stable across restarts. |
| `type` | string | yes | One of: `gauge`, `rate`, `text`, `event`, `state` |
| `value` | number or string | yes | Numeric for gauge/rate (float); string for text/event/state |
| `label` | string | yes | Human-readable name shown in UI |
| `source` | string | yes | Adapter type that produced this signal (e.g. `system`, `prometheus`) |
| `timestamp` | integer | yes | Unix timestamp (seconds) of when the value was sampled |
| `metadata` | object | no | Adapter-specific extended info. Always an object, never null. Empty `{}` if unused. |

### 5.2 Signal Types

| Type | Value Format | Example Uses |
|---|---|---|
| `gauge` | Float 0.0 to 1.0 | CPU load, memory used, disk fill, battery level |
| `rate` | Float, events/second | HTTP requests/sec, errors/sec, packets/sec |
| `text` | String | RSS headlines, weather descriptions, status messages |
| `event` | String (event name) | `backup_completed`, `deploy_failed`, `user_registered` |
| `state` | String (enum value) | `up`, `down`, `degraded`, `warning`, `maintenance` |

Scene bindings always reference a signal by its `id`. Port type compatibility is evaluated at connection time in the edit mode UI.

### 5.3 Plugin Architecture

PixelPulse uses a **drop-in plugin model** for adapters. Any Python file placed in the `plugins/` directory that subclasses `AdapterBase` is automatically discovered and registered at startup — no code changes required. Built-in adapters follow the same contract and are loaded by the same discovery mechanism from `backend/adapters/builtin/`. There is no runtime distinction between a built-in adapter and a user-supplied plugin.

#### Adapter Base Class Contract

Every adapter — built-in or plugin — must subclass `AdapterBase` and implement the following interface:

```python
class AdapterBase:
    # Adapter type identifier used in config.yaml
    adapter_type: str = "my_adapter"

    # Optional: list of pip packages this adapter requires.
    # The signal engine checks these at load time and logs a warning
    # (with install instructions) if any are missing, rather than crashing.
    requirements: list[str] = []

    def __init__(self, config: dict) -> None:
        """Initialize from the adapter's config block."""

    async def poll(self) -> list[Signal] | None:
        """
        Called by the signal engine on each polling interval.
        Returns one or more Signal objects, or None on failure.
        Must never raise — handle all exceptions internally.
        """

    @property
    def interval(self) -> float:
        """Polling interval in seconds."""

    @property
    def signal_ids(self) -> list[str]:
        """
        List of signal IDs this adapter may emit.
        Used by the Signal Library to show available signals before the
        first poll completes.
        """
```

#### Plugin Discovery

On startup, the signal engine scans two directories in order:

1. `backend/adapters/builtin/` — first-party adapters shipped with PixelPulse
2. `plugins/` — user-supplied plugins (gitignored by default)

Any `.py` file containing a class that subclasses `AdapterBase` is registered. If two adapters declare the same `adapter_type`, the plugin directory wins (user plugins can override built-ins). Missing `requirements` are logged as warnings with suggested `pip install` commands; the adapter is skipped rather than crashing the engine.

#### Built-in Adapters

The following adapters ship with PixelPulse in `backend/adapters/builtin/`.

---

**system**

Uses `psutil` to read local machine metrics. Zero configuration beyond selecting which metrics to expose.

| Metric ID | Type | Description |
|---|---|---|
| `cpu_percent` | gauge | Overall CPU utilization (0.0–1.0) |
| `memory_used` | gauge | RAM usage (used / total) |
| `disk_used` | gauge | Disk usage for a configured mount point |
| `net_bytes_sent` | rate | Network bytes sent |
| `net_bytes_recv` | rate | Network bytes received |
| `cpu_temp` | gauge | CPU temperature (normalized to 0–100°C range) |
| `http_requests` | rate | HTTP request counter (incrementable via webhook) |
| `active_streams` | gauge | Active stream count (configurable via shell adapter) |

```yaml
- id: cpu_load
  adapter: system
  metric: cpu_percent
  interval: 2
```

---

**http_poll**

Makes an HTTP GET request on a configurable interval and extracts a value via JSONPath or regex. Supports optional transform expression, custom headers, method, and body for authenticated APIs.

```yaml
- id: gas_price
  adapter: http_poll
  url: "https://api.example.com/gas?zip=84043"
  json_path: "$.current_price"
  interval: 300
  transform: "value / 6.0"
```

---

**webhook**

Registers an HTTP POST endpoint on the PixelPulse backend. External services POST to it; the payload is mapped to a signal via a configurable template.

```yaml
- id: deploy_event
  adapter: webhook
  path: /hooks/deploy
  event_name: deploy_completed
```

---

**shell**

Runs a shell command on a configurable interval and reads stdout as a signal value.

```yaml
- id: active_streams
  adapter: shell
  command: "python3 /home/pi/scripts/jellyfin_streams.py"
  interval: 30
  type: gauge
  max_value: 10
```

---

**file_watcher**

Watches a local file and emits its value on change. Three modes: `last_float`, `last_json`, `line_count`. Handles log rotation via inode tracking.

```yaml
- id: error_rate
  adapter: file_watcher
  path: /var/log/app/errors.log
  mode: line_count
  ceiling: 100
  interval: 10
```

---

**rss_feed**

Fetches one or more RSS feeds on a configurable interval. Maintains a rotating deque of formatted headlines. Emits as `text` type. Strips HTML entities and tags.

```yaml
- id: news_ticker
  adapter: rss_feed
  feeds:
    - url: "https://feeds.bbci.co.uk/news/rss.xml"
      name: "BBC News"
  max_items: 20
  interval: 300
```

---

**weather**

Fetches current conditions from the Open-Meteo API (no API key required). Location resolved by: explicit lat/lon → city name geocoding → IP geolocation fallback → hardcoded default. WMO codes mapped to human-readable strings. Emits as `text` type.

```yaml
- id: weather_text
  adapter: weather
  units: fahrenheit
  interval: 600
```

---

**sky_driver**

Internal adapter that emits a `sky_time` signal (0.0–1.0) to drive the day/night cycle. Three modes: `clock`, `cycle`, `signal`.

```yaml
sky_driver:
  mode: clock
  cycle_minutes: 10
```

---

#### First-Party Plugin: prometheus

The Prometheus adapter ships in `plugins/builtin/prometheus.py` — it is included with the repo but treated as a plugin to keep the core adapter set minimal and illustrate the plugin model. It requires the `httpx` package (already a core dependency).

The adapter queries a Prometheus server's HTTP API (`/api/v1/query`) using PromQL. Rather than one config block per signal, a single adapter block defines the server connection and lists all queries together, batching them into a single polling loop rather than separate HTTP connections per signal.

**Basic configuration:**

```yaml
- adapter: prometheus
  url: "http://localhost:9090"
  interval: 5
  queries:
    - signal_id: cpu_load
      query: '1 - avg(rate(node_cpu_seconds_total{mode="idle"}[1m]))'
      type: gauge
      label: "CPU Load"
      max_value: 1.0

    - signal_id: memory_used
      query: '1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)'
      type: gauge
      label: "Memory Used"

    - signal_id: net_bytes_recv
      query: 'rate(node_network_receive_bytes_total{device="eth0"}[1m])'
      type: rate
      label: "Network In"
      max_value: 125000000
```

**Multi-host configuration:**

When monitoring multiple machines, use `label_as_suffix` to fan out a single query into per-host signals. The adapter reads the specified Prometheus label from each result series and appends it to the signal ID.

```yaml
- adapter: prometheus
  url: "http://localhost:9090"
  interval: 5
  queries:
    - signal_id: cpu_load
      query: '1 - avg by (instance)(rate(node_cpu_seconds_total{mode="idle",job="servers"}[1m]))'
      type: gauge
      label: "CPU Load"
      label_as_suffix: instance   # emits cpu_load_server1, cpu_load_server2, etc.
```

Each suffixed signal appears as an independent entry in the Signal Library and can be wired to its own building. The label value is appended after sanitizing to a valid signal ID character set (lowercase, underscores, no dots or colons).

**Authentication:**

Optional. Supports HTTP Basic Auth and Bearer token. Neither is required for Prometheus running on a private network.

```yaml
- adapter: prometheus
  url: "https://prometheus.example.com"
  auth:
    type: basic          # basic | bearer
    username: "user"     # basic only
    password: "pass"     # basic only
    token: "abc123"      # bearer only
  interval: 5
  queries: [ ... ]
```

**Normalization:**

Each query entry accepts an optional `max_value` field. If provided, the raw Prometheus result is divided by `max_value` to produce a 0.0–1.0 normalized gauge. If omitted, the value is passed through as-is (appropriate for queries that already return normalized values, or for `rate` type signals where normalization happens at the valve layer).

**Signal metadata:**

Prometheus-sourced signals carry additional metadata that the system adapter signals do not: the PromQL query string, the Prometheus server URL, and (for multi-host signals) the host label value. This metadata is stored on the signal object and surfaced in the Signal Library and focus overlay behind a disclosure toggle labeled "Source details" (see Section 4.1).

**Requirements:**

The `prometheus` plugin has no additional pip dependencies beyond what PixelPulse already installs. It uses `httpx` (already a core dependency) to query the Prometheus HTTP API.

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
display:
  plots_per_row: 6          # range: 4–12. Default: 6.

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

**Plot entry field definitions:**

| Field | Required | Description |
|---|---|---|
| `plot_id` | yes | Stable plot identifier (e.g. `main_1`, `mid_2`, `ticker`). Must match a valid plot position for the current `plots_per_row` value. |
| `building` | no | Building type key (e.g. `windmill`, `water_tower`). If absent, plot is empty. |
| `style` | no | Style key for the building. Defaults to the building's first listed style if absent. |
| `signal` | no | Signal ID to connect. If absent, plot is unzoned (no pipe). |
| `valve` | no | Valve configuration. Created with defaults if `signal` is set but `valve` is absent. |
| `valve.range_min` | no | Raw signal value that maps to 0.0. Default: `0.0`. |
| `valve.range_max` | no | Raw signal value that maps to 1.0. Default: `1.0`. |
| `valve.alert_threshold` | no | Normalized value (0.0–1.0) that triggers alert state. Default: `0.85`. |
| `valve.label` | no | Override display label. Defaults to the signal's own label. |

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
| httpx | Async HTTP client for `http_poll`, `weather`, and `prometheus` adapters. |
| PyYAML | Parses `config.yaml` and `layout.yaml`. |
| jsonpath-ng | Evaluates JSONPath expressions in `http_poll` adapter. |
| feedparser | Parses RSS feeds. |

> **Plugin dependencies** are declared per-adapter via the `requirements` class attribute and are not listed in the core `requirements.txt`. If a plugin requires an additional package, the signal engine logs a clear install instruction on startup rather than crashing.

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
| systemd service | Auto-starts on boot, restarts on crash. *(Planned — Phase 8c)* |
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
│   ├── plugin_loader.py         # Discovers and registers adapter plugins
│   ├── config_api.py            # REST endpoints for edit mode (read/write config)
│   ├── config.yaml              # Adapter configuration (gitignored)
│   ├── config.example.yaml      # Safe template
│   ├── layout.yaml              # City layout (safe to commit)
│   ├── layout.default.yaml      # Starter city layout (shipped with repo)
│   ├── config_loader.py         # Parses and validates both config files
│   ├── adapters/
│   │   ├── base.py              # AdapterBase class and Signal dataclass
│   │   └── builtin/             # First-party adapters (loaded as plugins)
│   │       ├── system.py
│   │       ├── http_poll.py
│   │       ├── webhook.py
│   │       ├── shell.py
│   │       ├── file_watcher.py
│   │       ├── rss_feed.py
│   │       ├── weather.py
│   │       └── sky_driver.py
│   └── requirements.txt
│
├── plugins/                     # User-supplied plugin adapters (gitignored)
│   └── builtin/
│       └── prometheus.py        # Ships with repo; treated as a plugin
│
├── frontend/
│   ├── index.html
│   ├── main.js                  # App bootstrap, WebSocket init, mode management
│   ├── signal_bus.js            # WS connection, signal distribution
│   ├── ui_utils.js              # Shared UI utilities: drag, toast, menus, positioning
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

**`backend/main.py`** — Entry point. Instantiates FastAPI, registers all routes, serves frontend files via catch-all path handler. Run with `python3 -m backend.main` from the project root, or via uvicorn directly. Includes `if __name__ == "__main__"` block for direct execution.

**`backend/signal_engine.py`** — Core backend coordinator. Delegates adapter loading to `plugin_loader`, schedules polling with exponential backoff, maintains current signal state, maintains rolling history buffer (10 min), broadcasts to WebSocket clients, and sends full state + history snapshot on new connection.

**`backend/plugin_loader.py`** — Scans `backend/adapters/builtin/` and `plugins/` for subclasses of `AdapterBase`. Registers discovered adapters by their `adapter_type`. Checks declared `requirements` against installed packages and logs warnings for missing dependencies. User plugins in `plugins/` take precedence over built-ins with the same `adapter_type`.

**`backend/adapters/base.py`** — Defines the `AdapterBase` abstract class and the `Signal` dataclass. The single source of truth for the adapter contract.

**`backend/config_api.py`** — REST API used exclusively by edit mode. Exposes endpoints to: list available signals, list loaded plugin types, add/remove adapter config, read and write `layout.yaml`. All writes are atomic (write to temp file, rename).

**`frontend/edit_mode/edit_controller.js`** — Manages the mode switch animation, coordinates the opening/closing of edit mode panels, and triggers layout serialization on exit.

**`frontend/edit_mode/pipe_renderer.js`** — Renders the visual pipe network over the city canvas in edit mode. Draws connection lines from source nodes to plot connection points, highlights pipes on hover, and handles drag-and-drop wiring interactions.

Pipes use **right-angle routing** — all segments are strictly horizontal or vertical, with 90° bends, in the style of the Pipe Dream puzzle game and circuit board traces. The router uses a simple L-shaped or Z-shaped path (one bend for L, two bends for Z) chosen to minimize overlap with other pipes. Pipes are rendered as 4px wide filled rectangles in the signal's type color (see port type color table in Section 12). Bends are rendered as small filled squares at the corner point. Hovering any segment of a pipe highlights the entire pipe in white and shows the valve config button. Active (live) pipes animate a small moving "pulse" dot travelling along the route at a fixed speed (1 full traversal per 2 seconds) to indicate data flow.

**`frontend/scene/city/plot_manager.js`** — Tracks the state of every plot (empty / zoned / active), renders the appropriate visual for each state, and communicates plot changes to the building layer.

**`frontend/scene/shared/focus_overlay.js`** — Renders the focus mode panel anchored to a clicked building. Draws the sparkline from signal history data, formats the current value, and handles panel dismissal.

---

## 9. WebSocket Message Reference

All WebSocket communication is JSON. The backend sends; the frontend listens. Messages are newline-delimited JSON objects. Each message has a `type` field that identifies its shape.

### 9.1 Handshake Payload

Sent once by the backend immediately after a client connects. Contains full current state.

```json
{
  "type": "handshake",
  "signals": {
    "cpu_load": {
      "id": "cpu_load",
      "type": "gauge",
      "value": 0.54,
      "label": "CPU Load",
      "source": "system",
      "timestamp": 1710000000,
      "metadata": {}
    }
  },
  "history": {
    "cpu_load": [
      { "value": 0.48, "timestamp": 1709999400 },
      { "value": 0.51, "timestamp": 1709999402 }
    ]
  },
  "layout": { },
  "config": { }
}
```

| Field | Description |
|---|---|
| `signals` | Map of signal ID → current Signal object for all active signals. |
| `history` | Map of signal ID → array of `{value, timestamp}` objects, oldest first. Up to 10 minutes of samples at the signal's poll interval. Only numeric signals (gauge, rate) have history entries. |
| `layout` | Full contents of `layout.yaml` as a parsed object. Used by the frontend to reconstruct the city layout without a separate REST call. |
| `config` | Subset of `config.yaml` safe to expose to the frontend: server port, sky_driver mode, signal IDs and labels. Credentials and adapter internals are never included. |

### 9.2 Signal Update

Sent whenever any signal value changes. Sent for every poll tick, not just on value change.

```json
{
  "type": "signal",
  "signal": {
    "id": "cpu_load",
    "type": "gauge",
    "value": 0.61,
    "label": "CPU Load",
    "source": "system",
    "timestamp": 1710000060,
    "metadata": {}
  }
}
```

### 9.3 Adapter Status

Sent when an adapter's health state changes — on first successful poll, on error, and on recovery.

```json
{
  "type": "adapter_status",
  "adapter_id": "cpu_load",
  "status": "ok",
  "message": null
}
```

```json
{
  "type": "adapter_status",
  "adapter_id": "news_ticker",
  "status": "error",
  "message": "Connection refused: feeds.bbci.co.uk"
}
```

| `status` value | Meaning |
|---|---|
| `ok` | Adapter polled successfully. |
| `error` | Last poll failed. `message` contains the error string. |
| `recovering` | Adapter failed but is retrying with backoff. |
| `missing_deps` | Adapter was skipped at load time due to missing `requirements`. |

The frontend uses `adapter_status` messages to drive the ⚡ disconnected icon on buildings whose signal comes from the affected adapter.

### 9.4 Layout Saved Confirmation

Sent by the backend after successfully writing `layout.yaml` in response to a REST save request.

```json
{
  "type": "layout_saved",
  "timestamp": 1710000120
}
```

If the save fails, the backend sends:

```json
{
  "type": "layout_save_failed",
  "error": "Permission denied: /backend/layout.yaml"
}
```

### 9.5 Server Info

Sent once as part of the handshake (embedded in the `config` field), and also available via REST. Not a standalone message type.

---

## 10. REST API Reference

All endpoints are served by `backend/config_api.py` under the `/api` prefix. All request and response bodies are JSON. All endpoints return HTTP 200 on success or an appropriate 4xx/5xx with a `{"error": "message"}` body on failure. Writes are atomic (write to temp file, then rename).

These endpoints are used exclusively by the edit mode frontend. They are not intended as a public API.

### 10.1 GET /api/signals

Returns all currently active signals and their latest values.

**Response:**
```json
{
  "signals": [
    {
      "id": "cpu_load",
      "type": "gauge",
      "value": 0.54,
      "label": "CPU Load",
      "source": "system",
      "timestamp": 1710000000,
      "metadata": {}
    }
  ]
}
```

### 10.2 GET /api/adapters

Returns all loaded adapter types available for configuration.

**Response:**
```json
{
  "adapters": [
    { "type": "system",     "label": "System Metrics",  "builtin": true  },
    { "type": "weather",    "label": "Weather",          "builtin": true  },
    { "type": "rss_feed",   "label": "RSS Feed",         "builtin": true  },
    { "type": "http_poll",  "label": "HTTP Poll",        "builtin": true  },
    { "type": "webhook",    "label": "Webhook",          "builtin": true  },
    { "type": "shell",      "label": "Shell Command",    "builtin": true  },
    { "type": "file_watcher","label": "File Watcher",    "builtin": true  },
    { "type": "prometheus", "label": "Prometheus",       "builtin": false }
  ]
}
```

### 10.3 POST /api/signals

Adds a new signal adapter entry to `config.yaml` and starts the adapter immediately (no restart required).

**Request body:** A valid signal config block matching the adapter's schema.
```json
{
  "id": "my_metric",
  "adapter": "http_poll",
  "url": "https://api.example.com/metric",
  "json_path": "$.value",
  "interval": 30
}
```

**Response:**
```json
{ "ok": true, "id": "my_metric" }
```

**Errors:** `400` if the config block is invalid or the ID already exists. `422` if required fields are missing for the adapter type.

### 10.4 DELETE /api/signals/{signal_id}

Removes a signal adapter from `config.yaml` and stops its polling loop. Any pipes in `layout.yaml` referencing this signal ID are also removed.

**Response:**
```json
{ "ok": true, "removed_pipes": ["main_3", "mid_1"] }
```

`removed_pipes` lists the plot IDs whose pipe was removed as a side effect.

### 10.5 GET /api/layout

Returns the current contents of `layout.yaml` as a parsed object.

**Response:**
```json
{
  "display": { "plots_per_row": 6 },
  "plots": [ { "plot_id": "main_1", "building": "windmill", "..." : "..." } ]
}
```

### 10.6 PUT /api/layout

Replaces the entire contents of `layout.yaml`. Called by the frontend on edit mode exit.

**Request body:** Full layout object in the same shape as `GET /api/layout` response.

**Response:**
```json
{ "ok": true }
```

On success, the backend also broadcasts a `layout_saved` WebSocket message to all connected clients.

**Errors:** `400` if the layout object fails validation (unknown plot IDs, unknown building types, invalid valve values). The existing `layout.yaml` is not modified on error.

### 10.7 POST /api/prometheus/test

Test-fires a PromQL query against a Prometheus server and returns the result. Used by the adapter configuration flow's "Test Query" button.

**Request body:**
```json
{
  "url": "http://localhost:9090",
  "query": "1 - avg(rate(node_cpu_seconds_total{mode=\"idle\"}[1m]))",
  "auth": { "type": "basic", "username": "user", "password": "pass" }
}
```

`auth` is optional.

**Response (success):**
```json
{ "ok": true, "value": 0.42, "raw": { "...": "full Prometheus API response" } }
```

**Response (query error):**
```json
{ "ok": false, "error": "bad_data: 1:5: parse error: unexpected identifier" }
```

**Response (connection error):**
```json
{ "ok": false, "error": "Connection refused: localhost:9090" }
```

---

## 11. Port Type Reference

### 11.1 Port Type Compatibility Matrix

This is the authoritative compatibility table. A signal type is compatible with a port type if it appears in that port's "Accepts" column. Connection attempts with incompatible types are rejected in the UI with a shake animation and tooltip.

| Port Type | Accepts Signal Types | Pipe Color | Icon |
|---|---|---|---|
| `gauge` | `gauge` | `#4fc3f7` (light blue) | Dial 🔵 |
| `rate` | `rate`, `gauge` | `#81c784` (green) | Speedometer 🟢 |
| `text` | `text` | `#ffb74d` (amber) | Scroll 🟠 |
| `event` | `event` | `#ce93d8` (purple) | Lightning ⚡ |
| `state` | `state` | `#ef9a9a` (red) | Traffic light 🔴 |

The pipe color is used for pipe rendering in edit mode. The icon appears on building connection points and on zoned plot pylons.

### 11.2 Building-to-Port Mapping

The authoritative mapping of building type keys (used in `layout.yaml`) to their port type and style keys.

| Building Key | Port Type | Style Keys |
|---|---|---|
| `windmill` | `gauge` | `classic_wood`, `modern_steel`, `rustic_stone` |
| `power_station` | `gauge` | `industrial_brick`, `concrete_modern`, `old_factory` |
| `water_tower` | `gauge` | `classic_wood_leg`, `steel_municipal`, `painted_vintage` |
| `warehouse` | `gauge` | `corrugated_steel`, `brick_loading_dock`, `timber_barn` |
| `server_tower` | `gauge` | `glass_office`, `brutalist_concrete`, `retro_mainframe` |
| `dockyard` | `gauge` | `industrial_port`, `small_marina`, `river_wharf` |
| `cafe` | `rate` | `corner_diner`, `french_bistro`, `tech_startup` |
| `construction_yard` | `rate` | `earthworks`, `high_rise_steel`, `road_crew` |
| `swimming_pool` | `rate` | `municipal_outdoor`, `rooftop_luxury`, `community_rec` |
| `bank_ticker` | `text` | `art_deco_bank`, `modern_finance`, `roadside_marquee` |
| `bus_stop` | `text` | `classic_shelter`, `minimal_post`, `retro_covered` |
| `billboard` | `text` | `classic_billboard`, `led_display`, `painted_wall` |
| `data_vault` | `event` | `secure_bunker`, `server_farm`, `underground_vault` |
| `drive_in` | `event` | `classic_50s`, `modern_multiplex`, `rooftop_cinema` |
| `auth_gate` | `state` | `security_booth`, `railway_crossing`, `castle_gate` |
| `city_park` | *(none)* | `manicured_formal`, `scrubby_urban`, `zen_garden` |

### 11.3 Building Animation Details

For each building, the specific animation behavior at each signal value level.

| Building | Signal=0.0 (Idle) | Signal=0.5 (Mid) | Signal=1.0 (Full) |
|---|---|---|---|
| Windmill | Stationary blades | Moderate spin (~1 rev/3s) | Fast spin (~1 rev/0.8s) |
| Power Station | No smoke | Moderate smoke column | Dense, fast smoke billows |
| Water Tower | Tank visually empty | Tank half-filled | Tank full, overflow drips |
| Warehouse | Shutter fully closed | Shutter half-open | Shutter fully open, activity visible |
| Server Tower | All windows dark | Half windows lit, slow blink | All windows lit, rapid blink, load bar full |
| Dockyard | No crane movement | Crane swings slowly, occasional container | Crane active, containers stacking |
| Café | Dark neon sign, no foot traffic | Sign lit, occasional pedestrian enters | Sign flashing, steady stream of pedestrians |
| Construction Yard | No movement | One crane active, occasional dig | Multiple cranes active, busy digging |
| Swimming Pool | Empty pool (no swimmers) | A few swimmers, gentle splashing | Crowded pool, active splashing |
| Bank Ticker | Ticker paused, last text frozen | Ticker scrolling at normal speed | — (text speed does not scale with signal) |
| Bus Stop | Sign blank | Sign shows current text value | — (no visual scaling, text is binary) |
| Billboard | Display blank | Display showing current text | — (no visual scaling) |
| Data Vault | No activity | — (event-driven, no midpoint state) | Truck present, unloading animation |
| Drive-In | Screen dark, no cars | — (event-driven, no midpoint state) | Screen lit, cars in lot |
| Auth Gate | Barrier down, no alarm | — (state-driven) | Barrier up (OK) or barrier down + alarm (failure state) |
| City Park | Residents stroll peacefully | — (no signal, always idle) | — |

---

## 12. Coding Standards

### 12.1 Python (Backend)

- **Style** — PEP 8 throughout. Use ruff for linting.
- **Async** — All I/O operations must be async. No blocking calls on the main thread. This is the most common plugin pitfall: a synchronous blocking call inside an `async def poll()` will stall the entire event loop and freeze all signal updates. Any blocking operation (subprocess, blocking file I/O, synchronous third-party library) must be wrapped in `asyncio.run_in_executor()`.
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

### 12.2 JavaScript (Frontend)

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

### 12.3 Building Type Contract

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

### 12.4 Writing a Plugin Adapter

A plugin is a single `.py` file dropped into the `plugins/` directory. It must define at least one class subclassing `AdapterBase`. The signal engine will discover and load it automatically on the next restart.

Minimal working example — a plugin that reads a temperature sensor:

```python
from adapters.base import AdapterBase, Signal
import logging

logger = logging.getLogger(__name__)

class TemperatureSensorAdapter(AdapterBase):
    adapter_type = "temp_sensor"
    requirements = []  # no extra packages needed

    def __init__(self, config: dict) -> None:
        self._signal_id = config["id"]
        self._path = config.get("path", "/sys/class/thermal/thermal_zone0/temp")
        self._interval = config.get("interval", 10)

    @property
    def interval(self) -> float:
        return self._interval

    @property
    def signal_ids(self) -> list[str]:
        return [self._signal_id]

    async def poll(self) -> list[Signal] | None:
        try:
            raw = int(open(self._path).read().strip()) / 1000.0
            value = min(raw / 100.0, 1.0)  # normalize to 0–1 assuming 100°C max
            return [Signal(id=self._signal_id, type="gauge", value=value,
                           label="Temperature", source="temp_sensor")]
        except Exception as e:
            logger.error(f"temp_sensor adapter failed: {e}")
            return None
```

Corresponding config entry:
```yaml
- id: cpu_temp
  adapter: temp_sensor
  path: /sys/class/thermal/thermal_zone0/temp
  interval: 10
```

Plugins that require additional packages should declare them:
```python
requirements = ["influxdb-client>=3.0"]
```
The engine will log a clear warning with the install command if the package is missing, rather than crashing.

### 12.5 Git Conventions

- **Commit messages** — Imperative present tense: 'Add windmill animation' not 'Added windmill animation'.
- **Branch naming** — `feature/thing`, `fix/thing`, `chore/thing`.
- **Commit scope** — One logical change per commit.
- Do not commit `config.yaml` — use `config.example.yaml`.
- `layout.yaml` is safe to commit (no credentials).
- `plugins/` is gitignored by default. If you want to version-control your own plugins, add them explicitly with `git add -f`.
- `.gitignore` includes: `__pycache__`, `.env`, `node_modules`, `*.pyc`, `config.yaml`, `plugins/`.

---

## 13. Build Phases

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

### Phase 5c — Plugin Architecture & Prometheus Adapter ✅

**Goal:** Refactor the adapter system into a drop-in plugin model and ship the Prometheus adapter as the first first-party plugin.

**Deliverables:**
- `AdapterBase` abstract class and `Signal` dataclass extracted to `backend/adapters/base.py`
- `plugin_loader.py`: scans `backend/adapters/builtin/` and `plugins/` for `AdapterBase` subclasses, registers by `adapter_type`, checks `requirements`, logs missing dependencies without crashing
- All existing built-in adapters migrated to `backend/adapters/builtin/` and updated to subclass `AdapterBase`
- `plugins/builtin/prometheus.py`: Prometheus HTTP API adapter with support for:
  - Multiple PromQL queries per config block (batched into one poll loop)
  - Per-query `max_value` normalization
  - `label_as_suffix` multi-host fan-out (emits `signal_id_<host>` per series)
  - Optional Basic Auth and Bearer token authentication
  - Signal metadata (PromQL query, server URL, host label) passed through to signal object
- Signal Library "Source details" disclosure toggle surfaces Prometheus metadata
- Adapter config flow updated: Prometheus step includes PromQL editor with test-query button
- `plugins/` directory added to `.gitignore`
- Plugin authoring documentation added to `README.md`

---

### Phase 6 — Edit Mode & Three-Tier UI ✅

**Goal:** The city is configurable through a graphical interface. The three-tier architecture is fully interactive.

**Delivered:**
- Mode switch animation: city lifts (48px), pipe layer slides up from bottom, Signal Library slides in from left — 600ms ease-in-out timeline
- Plot states: empty / zoned / active, with distinct visual for each; highlight progress animation on edit mode enter
- Signal Library panel: lists signals by in-use / available, live value updates, drag-to-select or click-to-select flow
- Signal compatibility mode: when connecting from building menu, compatible signals are highlighted in amber, incompatible signals dim and show "not compatible" on click
- Adapter configuration flow: 4-step wizard (adapter type → config → name → confirm) with Prometheus PromQL test-query
- Building Picker: filtered by port type compatibility; style picker inline below selected building
- Style Picker: chip UI showing all style variants for the selected building type
- Pipe renderer: animated orthogonal pipe routes over canvas overlay, pulse-dot animation on live pipes, valve ⚙ button on hover
- Valve panel: range min/max, alert threshold, label; live semicircle gauge preview with threshold marker; draggable
- Building context menu: Connect signal / Change signal / Disconnect signal / Change style / Move building / Remove building
- Move building: click-to-move flow with compatible-plot highlighting
- Incompatible connection rejection: shake animation + toast notification
- Port type icons on zoned plots
- Layout serialization: edit mode exit writes `layout.yaml` via `PUT /api/layout`
- Config API: full REST endpoints for read/write of `config.yaml` and `layout.yaml`; live adapter add/remove
- Starter city: auto-generated from `layout.default.yaml` on first launch
- Bidirectional config: hand-edited files reflected on page reload via WebSocket handshake
- Source nodes panel: slides up from bottom in edit mode showing all active signal chips
- `ui_utils.js`: shared UI utility module — `showToast`, `makeDraggable`, `positionWithin`, `dismissOnOutsideClick`, `makePanel`, `makeMenu`, `makeMenuButton`, `makeMenuDivider`
- All panels draggable; all context menus dismiss on outside click (80ms delay, canvas-click immune)

---

### Phase 6b — Building Implementations & Vehicle Traffic ✅

**Goal:** Replace placeholder building graphics with fully animated, signal-driven implementations.

**Delivered:**
- **Server Tower** — rack body with 15 LED windows blinking at load-proportional rate; colour-coded load bar (green→amber→red) at base. Three styles: `rack_classic`, `blade_modern`, `mini_tower`.
- **Warehouse** — shutter door opens proportionally to disk fill value; side fill indicator bar with colour coding. Three styles.
- **Power Station** — two striped chimneys with particle smoke system; spawn rate and particle speed scale with CPU load. Three styles.
- **Bank Ticker** — scrolling ticker tape on building facade driven by any text signal (RSS headlines, weather). Three styles.
- **Café** — awning, large window, neon sign that flickers based on request rate. Three styles.
- **Drive-In Theater** — animated screen (on when streams > 0); up to 6 parked cars appear/disappear proportionally to stream count. Three styles.
- **Data Vault** — delivery truck drives in from left on any event signal, parks at loading dock, drives away after ~4 seconds. Three styles.
- **Vehicle traffic system** (`vehicles.js`) — cars and trucks on both roads; density and speed driven by `net_bytes_recv` signal; spawns up to 24 vehicles at peak; directional (road1 left→right, road2 right→left by default).
- **Windmill blade pivot fix** — blades container positioned at hub y=-116 so rotation pivots correctly around the hub centre.
- All buildings implement the standard four animation states: `idle`, `active`, `alert` (red sinusoidal pulse), `disconnected` (⚡ icon).

**Still placeholder (Phase 8a):** `auth_gate`, `construction_yard`, `swimming_pool`, `billboard`, `city_park`, `dockyard`.

---

### Phase 6c — Bug Fixes & UI Polish ✅

**Goal:** Resolve interaction bugs discovered during first live deployment; polish the edit mode UI for everyday use.

**Delivered:**
- **Backend entrypoint fixed** — `backend/main.py` now includes `if __name__ == "__main__": uvicorn.run(...)` so the server starts with `python3 backend/main.py` as expected, without requiring an explicit uvicorn invocation.
- **Frontend static file serving fixed** — replaced the broken `/static` `StaticFiles` mount with a `/{file_path:path}` catch-all route that resolves JS modules and assets relative to the `frontend/` directory (and falls back to the project root for `assets/sprites/` etc.), preventing the `main.js 404` on initial load.
- **No-cache middleware** — `Cache-Control: no-store` header added via FastAPI middleware to prevent browsers from serving stale JS during development.
- **Pixi event propagation fixed** — `world.eventMode` was set to `'none'`, silently blocking all pointer events from reaching plot slots and buildings. Changed to `'passive'`; plot node containers also initialised as `'passive'` instead of `'none'`.
- **Pipe renderer click-through fixed** — the full-screen pipe canvas was setting `pointer-events: auto` in edit mode, eating all clicks before they reached Pixi. Changed to `pointer-events: none` permanently; hit-testing now runs on `window` mousemove/click listeners instead.
- **Building picker placeholders removed** — `listBuildingTypes()` now filters out any type still backed by `PlaceholderBuilding`, so only fully-implemented buildings appear in the picker.
- **Style picker duplication fixed** — style picker div was appended to the panel each time without clearing the previous one; fixed with a `.style-picker` class check.
- **Windmill blade pivot fixed** — blades container was positioned at `(0,0)` causing rotation to orbit the tower base; fixed by setting `this.blades.y = -116` to pivot at the hub centre.
- **Building context menu multi-click fixed** — `dismissOnOutsideClick` with `delay=0` was firing on the same click that opened the menu (Pixi `pointertap` → DOM `click` race). Default delay raised to `80ms`; canvas-origin clicks explicitly ignored in the dismiss handler.
- **`ui_utils.js` extracted** — all shared UI patterns (drag, toast, positioning, click-away, panel/menu factories) consolidated into a single module imported by all edit mode components, replacing four separate ad-hoc implementations.
- **Valve panel redesigned** — cleaner layout with a proper drag-handle title bar; semicircle gauge resized to use full panel width; percentage readout added to gauge centre; input fields have live preview on change.
- **Signal library UX improved** — cleaner card design; selected signal highlighted with green border; status bar shows clear instruction text; `_pendingPortType` tracks the required signal type when connecting from a building menu.
- **Signal compatibility highlighting** — when "Connect signal" is chosen from a building's context menu, the signal library panel border highlights amber, the status bar turns amber with the required port type, compatible signal cards are highlighted with amber border and `✓ compatible` badge, incompatible cards dim to 40% opacity with `not-allowed` cursor and show a toast explaining the mismatch on click.
- **Performance tuning** — Pixi application: antialiasing disabled, device pixel ratio capped at 1.5×, `powerPreference: 'high-performance'` set.

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

## 14. Future Ideas & Parking Lot

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

### Community Plugin Directory

A curated index of community-contributed adapter plugins — InfluxDB, Home Assistant, MQTT, Datadog, Uptime Kuma, Jellyfin, and so on. Each plugin is a single `.py` file users drop into their `plugins/` directory. The plugin authoring contract (Section 9.5) is designed to make this straightforward.

---

> **Working Title Note**
>
> "PixelPulse" is a working title. Rename at any time — update `README.md`, the systemd service name, and this document header. The architecture is not coupled to the name.
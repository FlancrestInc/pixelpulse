# PixelPulse Polished Demo Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished PixelPulse demo with a curated default city, stronger scene polish, lightweight inhabited-world moments, a clean edit-mode walkthrough, and a small regression test floor.

**Architecture:** Keep the existing FastAPI + frontend module structure intact. Organize the work into four layers: showcase composition, scene polish, inhabited-world moments, and edit-mode polish, with lightweight backend tests protecting config/layout/API behavior throughout.

**Tech Stack:** Python, FastAPI, PyYAML, httpx, pytest, vanilla ES modules, Pixi.js

---

## File Structure

### Backend and test foundation

- Modify: `backend/requirements.txt`
- Modify: `backend/config.example.yaml`
- Modify: `backend/layout.yaml`
- Modify: `backend/config_loader.py`
- Modify: `backend/config_api.py`
- Modify: `backend/signal_engine.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_config_loader.py`
- Create: `backend/tests/test_config_api.py`
- Create: `backend/tests/test_signal_engine.py`

### Showcase scene composition and polish

- Modify: `frontend/signal_bus.js`
- Modify: `frontend/scene/city/city_scene.js`
- Modify: `frontend/scene/city/environment.js`
- Modify: `frontend/scene/city/vehicles.js`
- Modify: `frontend/scene/city/buildings.js`
- Modify: `frontend/scene/city/building_types/windmill.js`
- Modify: `frontend/scene/city/building_types/power_station.js`
- Modify: `frontend/scene/city/building_types/server_tower.js`
- Modify: `frontend/scene/city/building_types/warehouse.js`
- Modify: `frontend/scene/city/building_types/water_tower.js`
- Modify: `frontend/scene/city/building_types/bank_ticker.js`
- Modify: `frontend/scene/city/building_types/bus_stop.js`
- Modify: `frontend/scene/city/building_types/cafe.js`
- Modify: `frontend/scene/city/building_types/data_vault.js`
- Modify: `frontend/scene/city/building_types/drive_in.js`

### Inhabited-world and edit-mode polish

- Modify: `frontend/scene/city/characters.js`
- Modify: `frontend/edit_mode/edit_controller.js`
- Modify: `frontend/edit_mode/signal_library.js`
- Modify: `frontend/edit_mode/pipe_renderer.js`
- Modify: `frontend/edit_mode/valve_panel.js`
- Modify: `frontend/edit_mode/layout_serializer.js`

### Docs and verification

- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-03-15-polished-demo-design.md` only if implementation requires spec clarifications
- Create: `docs/manual-testing/polished-demo-checklist.md`

---

## Chunk 1: Backend Demo Composition and Regression Floor

### Task 1: Add pytest and backend test scaffolding

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_config_loader.py`

- [ ] **Step 1: Add `pytest` to backend dependencies**

```text
fastapi
uvicorn
psutil
httpx
PyYAML
jsonpath-ng
feedparser
pytest
```

- [ ] **Step 2: Create shared test fixtures in `backend/tests/conftest.py`**

```python
from pathlib import Path
import pytest


@pytest.fixture
def temp_yaml(tmp_path: Path):
    def _write(name: str, content: str) -> Path:
        path = tmp_path / name
        path.write_text(content, encoding="utf-8")
        return path
    return _write
```

- [ ] **Step 3: Write failing config-loader tests for valid and invalid layout/config payloads**

```python
import pytest

from backend.config_loader import ConfigValidationError, load_backend_config, load_layout_config


@pytest.mark.asyncio
async def test_load_backend_config_accepts_showcase_config(temp_yaml):
    path = temp_yaml("config.yaml", """
server: {host: "0.0.0.0", port: 8000}
signals:
  - id: cpu_load
    adapter: system
""")
    data = await load_backend_config(str(path))
    assert data["signals"][0]["id"] == "cpu_load"


@pytest.mark.asyncio
async def test_load_layout_config_requires_plot_ids(temp_yaml):
    path = temp_yaml("layout.yaml", "plots:\n  - building: windmill\n")
    with pytest.raises(ConfigValidationError):
        await load_layout_config(str(path))
```

- [ ] **Step 4: Run the new tests and confirm the baseline**

Run: `python -m pytest backend/tests/test_config_loader.py -v`

Expected: failing tests if fixtures/imports/validation gaps still need implementation, then passing after the minimal scaffolding is corrected.

- [ ] **Step 5: Commit the scaffolding**

Run:

```bash
git add backend/requirements.txt backend/tests/conftest.py backend/tests/test_config_loader.py
git commit -m "test: add backend config loader coverage"
```

### Task 2: Lock the showcase config and default layout

**Files:**
- Modify: `backend/config.example.yaml`
- Modify: `backend/layout.yaml`
- Test: `backend/tests/test_config_loader.py`

- [ ] **Step 1: Write a failing test that asserts the showcase layout/config shape is valid**

```python
@pytest.mark.asyncio
async def test_repo_showcase_layout_is_valid():
    data = await load_layout_config("backend/layout.yaml")
    plot_ids = {plot["plot_id"] for plot in data["plots"]}
    assert {"main_1", "main_2", "main_3", "main_4", "main_5", "main_6", "mid_1", "mid_2", "mid_3"} <= plot_ids
```

- [ ] **Step 2: Replace the placeholder layout with the curated showcase city**

Use this target mapping in `backend/layout.yaml`:

```yaml
plots:
  - plot_id: main_1
    building: windmill
    style: classic_wood
    signal: cpu_load
  - plot_id: main_2
    building: power_station
    style: industrial_brick
    signal: memory_used
  - plot_id: main_3
    building: server_tower
    style: glass_office
    signal: cpu_load
  - plot_id: main_4
    building: warehouse
    style: corrugated_steel
    signal: disk_used
  - plot_id: main_5
    building: bank_ticker
    style: art_deco_bank
    signal: news_ticker
  - plot_id: main_6
    building: bus_stop
    style: classic_shelter
    signal: weather_text
  - plot_id: mid_1
    building: cafe
    style: corner_diner
    signal: http_requests
  - plot_id: mid_2
    building: data_vault
    style: bunker_classic
    signal: deploy_event
  - plot_id: mid_3
    building: drive_in
    style: classic_50s
    signal: active_streams
```

- [ ] **Step 3: Update `backend/config.example.yaml` so the example signals drive that layout without manual editing**

Add or normalize these signals:

```yaml
- id: deploy_event
  adapter: webhook
  path: /hooks/deploy-event
  type: event
  value_key: value
  interval: 1
```

Also ensure `cpu_load`, `memory_used`, `disk_used`, `weather_text`, `news_ticker`, `http_requests`, `active_streams`, and `sky_time` are present and named consistently with the layout.

- [ ] **Step 4: Run validation tests for config and layout**

Run: `python -m pytest backend/tests/test_config_loader.py -v`

Expected: PASS for the repo config/layout validation cases.

- [ ] **Step 5: Commit the showcase composition**

Run:

```bash
git add backend/config.example.yaml backend/layout.yaml backend/tests/test_config_loader.py
git commit -m "feat: define polished demo showcase layout"
```

### Task 3: Add API and signal-engine regression coverage for layout and handshake behavior

**Files:**
- Create: `backend/tests/test_config_api.py`
- Create: `backend/tests/test_signal_engine.py`
- Modify: `backend/config_api.py` only if tests expose gaps
- Modify: `backend/signal_engine.py` only if tests expose gaps

- [ ] **Step 1: Write failing API tests for layout round-trips**

```python
from fastapi.testclient import TestClient

from backend.main import app


def test_put_layout_persists_plots(monkeypatch, tmp_path):
    client = TestClient(app)
    payload = {"layout": {"display": {"plots_per_row": 6}, "plots": [{"plot_id": "main_1", "signal": "cpu_load"}]}}
    response = client.put("/api/layout", json=payload)
    assert response.status_code == 200
```

- [ ] **Step 2: Write failing signal-engine tests for handshake safety**

```python
from backend.signal_engine import SignalEngine


def test_safe_config_strips_sensitive_fields():
    engine = SignalEngine("backend/config.example.yaml", "backend/layout.yaml")
    engine.config = {
        "signals": [{"id": "weather_text", "adapter": "weather", "api_key": "secret", "interval": 60}],
        "server": {"port": 8000},
    }
    safe = engine._safe_config()
    assert "api_key" not in str(safe)
```

- [ ] **Step 3: Implement the minimal fixes needed for deterministic tests**

Likely changes:

- allow config/layout test paths to be monkeypatched cleanly in `backend/config_api.py`
- keep `_safe_config()` limited to id/adapter/interval/server port
- avoid importing app state that immediately starts background loops during tests

- [ ] **Step 4: Run the backend regression suite**

Run: `python -m pytest backend/tests/test_config_api.py backend/tests/test_signal_engine.py -v`

Expected: PASS with no network calls and no writes outside the temp test directory.

- [ ] **Step 5: Commit the regression floor**

Run:

```bash
git add backend/tests/test_config_api.py backend/tests/test_signal_engine.py backend/config_api.py backend/signal_engine.py backend/main.py
git commit -m "test: cover layout api and signal handshake behavior"
```

---

## Chunk 2: Scene Polish and Showcase Readability

### Task 4: Make the default city feel intentional on first load

**Files:**
- Modify: `frontend/signal_bus.js`
- Modify: `frontend/scene/city/city_scene.js`
- Modify: `frontend/scene/city/environment.js`
- Modify: `frontend/scene/city/vehicles.js`

- [ ] **Step 1: Write down the target demo-mode signal profile in code comments near the demo emitter**

Use a fixed showcase profile:

```js
{
  cpu_load:      "slow breathing oscillator with occasional peaks",
  memory_used:   "steadier, heavier plateau curve",
  disk_used:     "slow low-amplitude curve",
  http_requests: "livelier pulse for cafe activity",
  news_ticker:   "rotating headlines every 8-12s",
  weather_text:  "slower rotating local conditions",
  active_streams:"gentle medium-frequency audience curve",
  deploy_event:  "occasional pulse every 25-40s",
  sky_time:      "smooth full-day loop"
}
```

- [ ] **Step 2: Update `frontend/signal_bus.js` so demo mode emits exactly the showcase signals used by the layout**

The demo emitter should add `deploy_event` and `news_ticker`, preserve `sky_time`, and stop emitting orphan showcase-mismatched IDs.

- [ ] **Step 3: Improve scene composition behavior in `city_scene.js` and `environment.js`**

Implement:

- more deliberate initial layout application
- clearer active/alert/disconnected transitions
- smoother sky color progression
- subtle ambient motion even when buildings are idle

- [ ] **Step 4: Tune vehicle density and pacing in `vehicles.js` for ambient readability**

Target behavior:

- low traffic is still visible
- heavy traffic does not clutter the road
- spawn cadence reads cleanly from across the room

- [ ] **Step 5: Manually verify the default scene**

Run:

```bash
python backend/main.py
```

Then open `http://localhost:8000`.

Expected: the city loads into a composed, animated showcase layout in either demo or live mode, with no empty/placeholder centerpiece plot.

- [ ] **Step 6: Commit the scene-composition changes**

Run:

```bash
git add frontend/signal_bus.js frontend/scene/city/city_scene.js frontend/scene/city/environment.js frontend/scene/city/vehicles.js
git commit -m "feat: polish showcase scene composition"
```

### Task 5: Polish the showcase building set and unify animation-state handling

**Files:**
- Modify: `frontend/scene/city/buildings.js`
- Modify: `frontend/scene/city/building_types/windmill.js`
- Modify: `frontend/scene/city/building_types/power_station.js`
- Modify: `frontend/scene/city/building_types/server_tower.js`
- Modify: `frontend/scene/city/building_types/warehouse.js`
- Modify: `frontend/scene/city/building_types/water_tower.js`
- Modify: `frontend/scene/city/building_types/bank_ticker.js`
- Modify: `frontend/scene/city/building_types/bus_stop.js`
- Modify: `frontend/scene/city/building_types/cafe.js`
- Modify: `frontend/scene/city/building_types/data_vault.js`
- Modify: `frontend/scene/city/building_types/drive_in.js`

- [ ] **Step 1: Define a shared state checklist for every showcase building**

Each building should support:

- `idle`: attractive low-motion behavior
- `active`: signal-driven response
- `alert`: readable pulse or alarm treatment
- `disconnected`: obvious but tasteful degraded state

- [ ] **Step 2: Update each showcase building to meet that checklist**

Examples:

- `windmill`: idle slow rotation, active scaled rotation, alert red pulse wash, disconnected stalled blades
- `power_station`: idle light chimney smoke, active denser smoke, alert stronger stack pulse, disconnected no smoke plus warning mark
- `bank_ticker` and `bus_stop`: readable text fallback when signal is stale or absent
- `data_vault` and `drive_in`: preserve event/gauge behavior while still rendering a pleasing idle state

- [ ] **Step 3: Keep the building registry scoped to the showcase set for the default demo path**

`frontend/scene/city/buildings.js` should continue hiding placeholder building classes from the picker. Do not add placeholder classes back into the showcase flow.

- [ ] **Step 4: Manually verify each showcase building in the default layout**

Expected checks:

- no invisible or static-feeling centerpiece assets
- all buildings visibly react when their signals change
- alert/disconnected are legible without overwhelming the scene

- [ ] **Step 5: Commit the building polish**

Run:

```bash
git add frontend/scene/city/buildings.js frontend/scene/city/building_types/*.js
git commit -m "feat: polish showcase building animations"
```

---

## Chunk 3: Inhabited-World Moments and Edit-Mode Walkthrough

### Task 6: Add lightweight inhabited-world moments tied to showcase buildings

**Files:**
- Modify: `frontend/scene/city/characters.js`
- Modify: `frontend/scene/city/city_scene.js`
- Modify: `frontend/scene/city/building_types/data_vault.js`
- Modify: `frontend/scene/city/building_types/drive_in.js`
- Modify: `frontend/scene/city/building_types/cafe.js`

- [ ] **Step 1: Create a tiny character/event manager in `characters.js`**

Start with a narrow interface:

```js
export class CharacterManager {
  constructor(stage) {}
  spawnWalker({ x, y, direction, destinationId }) {}
  triggerSceneBeat(kind, payload) {}
  update(delta) {}
}
```

- [ ] **Step 2: Wire the manager into `city_scene.js`**

`CityScene` should own the manager, update it in the render loop, and expose just enough hooks for showcase building events to trigger walkers or audience moments.

- [ ] **Step 3: Add two concrete scene beats**

Implement only these:

- `data_vault` event: delivery arrival plus brief worker/walker activity
- `drive_in` / `cafe` ambient beat: a few parked or walking patrons when the signal is active

- [ ] **Step 4: Manually verify the city feels more inhabited without becoming noisy**

Expected: a few occasional, readable story moments; no constant swarming; no large CPU-heavy simulation loop.

- [ ] **Step 5: Commit the inhabited-world slice**

Run:

```bash
git add frontend/scene/city/characters.js frontend/scene/city/city_scene.js frontend/scene/city/building_types/data_vault.js frontend/scene/city/building_types/drive_in.js frontend/scene/city/building_types/cafe.js
git commit -m "feat: add lightweight inhabited-world demo moments"
```

### Task 7: Tighten the guided edit-mode walkthrough

**Files:**
- Modify: `frontend/edit_mode/edit_controller.js`
- Modify: `frontend/edit_mode/signal_library.js`
- Modify: `frontend/edit_mode/pipe_renderer.js`
- Modify: `frontend/edit_mode/valve_panel.js`
- Modify: `frontend/edit_mode/layout_serializer.js`

- [ ] **Step 1: Choose one golden-path walkthrough and encode it in the UI**

The walkthrough should reliably support:

1. enter edit mode
2. select a compatible signal
3. connect a plot
4. place or swap a building
5. tweak the valve label/threshold
6. exit edit mode and save

- [ ] **Step 2: Improve the edit-mode guidance text and feedback**

Implement:

- clearer status copy in `signal_library.js`
- stronger compatibility highlighting
- more obvious pipe hover/valve affordances
- more confidence-building save feedback in `edit_controller.js`

- [ ] **Step 3: Make layout persistence resilient for the golden path**

Use `layout_serializer.js` to ensure signal/building/valve payloads round-trip cleanly for the showcase plots, including move/remove flows.

- [ ] **Step 4: Manually run the golden-path walkthrough**

Expected:

- no dead clicks
- no confusing incompatible states
- no lost layout changes after exiting edit mode

- [ ] **Step 5: Commit the edit-mode polish**

Run:

```bash
git add frontend/edit_mode/edit_controller.js frontend/edit_mode/signal_library.js frontend/edit_mode/pipe_renderer.js frontend/edit_mode/valve_panel.js frontend/edit_mode/layout_serializer.js
git commit -m "feat: polish demo edit-mode walkthrough"
```

---

## Chunk 4: Docs, Manual QA, and Final Verification

### Task 8: Sync the README and create a manual test checklist

**Files:**
- Modify: `README.md`
- Create: `docs/manual-testing/polished-demo-checklist.md`

- [ ] **Step 1: Update README copy to match the actual polished demo**

Fix drift such as:

- auth-gate support status
- which building set is actually polished
- what demo mode includes by default
- how to run the showcase city locally

- [ ] **Step 2: Write the manual verification checklist**

Create `docs/manual-testing/polished-demo-checklist.md` with sections for:

- first load
- demo mode
- live mode
- edit-mode walkthrough
- stale/disconnected behavior
- visual polish acceptance notes

- [ ] **Step 3: Run the backend regression suite**

Run: `python -m pytest backend/tests -v`

Expected: PASS for config loader, layout API, and signal-engine coverage.

- [ ] **Step 4: Run the showcase manually**

Run:

```bash
python backend/main.py
```

Manual pass criteria:

- default city looks intentional
- demo mode is compelling
- live mode works with the example config
- edit mode completes the golden path cleanly
- no placeholder visuals appear in the showcase path

- [ ] **Step 5: Commit docs and verification updates**

Run:

```bash
git add README.md docs/manual-testing/polished-demo-checklist.md
git commit -m "docs: document polished demo workflow"
```

---

## Execution Notes

- Keep each commit small and aligned to a single task.
- Do not expand scope to placeholder buildings outside the showcase set.
- Favor idle polish and clarity over new feature breadth.
- If a frontend change risks broad refactoring, prefer a narrower scene-specific helper instead.
- If a test requires app startup, patch file paths and avoid real network access.

## Final Verification Commands

Run these before calling the milestone complete:

```bash
python -m pytest backend/tests -v
python backend/main.py
```

Then manually verify the checklist in `docs/manual-testing/polished-demo-checklist.md`.

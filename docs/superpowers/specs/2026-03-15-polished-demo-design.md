# PixelPulse Polished Demo Design

**Date:** 2026-03-15
**Source spec:** [SPEC.md](/mnt/Barnabas/data2/projects/pixelpulse/SPEC.md)
**Goal:** Define a focused, polished-demo milestone for PixelPulse that delivers the core "living pixel city" promise with minimal rough edges.

---

## 1. Demo Objective

The next milestone should optimize for a polished, dependable demo rather than broad feature coverage. The demo should show PixelPulse as an ambient animated city that is readable from across the room, enjoyable to watch when idle, and satisfying to configure in a short guided interaction.

This milestone should produce:

- One canonical showcase city layout
- A curated set of signal-to-building pairings
- A city scene that feels alive in both live mode and demo mode
- A short edit-mode walkthrough that works cleanly end to end

This milestone should not aim to complete every feature described in `SPEC.md`. Anything that does not directly improve the quality of the on-screen demo should be deferred.

---

## 2. Recommended Approach

Three approaches were considered:

### Approach A: Scene-first demo

Focus on the city as the product. Prioritize animation quality, ambient motion, event moments, readability, and one strong showcase layout. Keep edit mode polished enough for a short walkthrough.

**Why this is recommended:** This best matches the project's core promise in `SPEC.md`: ambient awareness, delight, and a toy-like city that is enjoyable to watch.

### Approach B: Edit-mode-first demo

Focus on the SimCity-style configuration loop: add source, route pipe, configure valve, place building, save layout, and return to display mode.

**Trade-off:** Strong for showing the "configured like a toy" concept, but risks leaving the city itself underwhelming.

### Approach C: Live-data-first demo

Focus on adapter breadth, backend reliability, and Raspberry Pi deployment readiness.

**Trade-off:** Useful technically, but weaker as a visual demo. It under-serves the parts of PixelPulse that make the project distinct.

**Decision:** Use Approach A, with a small amount of hardening underneath it so the demo remains dependable.

---

## 3. Demo Slice

The polished demo should be a curated vertical slice rather than a feature-complete release.

### Included in the milestone

- A single default city composition that looks intentional on first load
- A curated building set built from the already-implemented, non-placeholder building types
- Smooth day/night sky behavior and ambient vehicle motion
- Building animations that clearly reflect signal state: idle, active, alert, disconnected
- At least one or two event-like story moments that make the city feel inhabited
- A short edit-mode walkthrough:
  - add or inspect a source
  - connect a signal to a plot
  - place or swap a building
  - adjust a valve threshold or label
  - exit back to display mode
- A believable demo fallback mode that drives the same showcase layout when live data is unavailable

### Explicitly deferred

- Completing every placeholder building type
- Advanced transform chains beyond the current valve model
- Mobile responsiveness
- Multi-scene support
- Broad adapter expansion unrelated to the showcase slice
- Deep simulation systems or persistent character state

### Showcase building set

The polished demo should treat the following as the default showcase set:

- `windmill`
- `power_station`
- `server_tower`
- `warehouse`
- `water_tower`
- `bank_ticker`
- `bus_stop`
- `cafe`
- `data_vault`
- `drive_in`

These are the buildings the milestone should polish, visually tune, and rely on for the default city. Other non-placeholder buildings may remain available, but they are not required to reach polished-demo quality in this milestone.

### Showcase signal set

The default layout should be composed around a small set of legible signals:

- `cpu_load` or equivalent gauge for rotational or load-based buildings
- `memory_used` or `disk_used` for fill and capacity visuals
- `net_bytes_recv` or another traffic-like rate/gauge for ambient road activity
- `weather_text` or `news_ticker` for text buildings
- `active_streams` or a similar gauge/event-friendly signal for scene moments
- `sky_time` for day/night behavior

If live sources differ, they should still map into these visual roles so the showcase city remains readable.

---

## 4. Architecture Split

The polished demo should be organized as four workstreams layered on top of the current codebase.

### 4.1 Demo composition layer

**Purpose:** Establish one canonical city layout and signal mapping.

**Primary files:**

- `backend/layout.yaml`
- `backend/config.example.yaml`
- `backend/config.yaml` if present locally during implementation

**Responsibilities:**

- Define the showcase plot arrangement
- Pair curated signals with buildings that are already strong visually
- Ensure the default layout supports both live and demo fallback data
- Keep signal naming and layout intent centralized rather than scattered through scene code

### 4.2 Scene polish layer

**Purpose:** Make the city visually coherent, readable, and pleasing to watch.

**Primary files:**

- `frontend/scene/city/city_scene.js`
- `frontend/scene/city/environment.js`
- `frontend/scene/city/vehicles.js`
- `frontend/scene/city/building_types/*.js`

**Responsibilities:**

- Improve animation timing, pacing, and readability
- Strengthen idle behavior so the city remains interesting without alerts
- Ensure alert and disconnected states are obvious from a distance
- Eliminate placeholder visuals from the showcased path

### 4.3 Inhabited-world layer

**Purpose:** Add a small amount of convincing life to the city without building a full simulation.

**Primary files:**

- `frontend/scene/city/characters.js`
- Event-capable building modules such as `data_vault` and `drive_in`

**Responsibilities:**

- Add a lightweight character or event system with narrow scope
- Tie event moments to specific building behaviors instead of global effects
- Tell short visual stories, such as arrivals, departures, loading, or audience activity

**Boundary:** This layer should stay lightweight. It is not responsible for deep AI, persistent NPC state, or a generalized simulation engine.

### 4.4 Guided edit-mode layer

**Purpose:** Make one short configuration workflow feel clear and reliable.

**Primary files:**

- `frontend/edit_mode/edit_controller.js`
- `frontend/edit_mode/signal_library.js`
- `frontend/edit_mode/layout_serializer.js`
- `frontend/edit_mode/pipe_renderer.js`
- `frontend/edit_mode/valve_panel.js`

**Responsibilities:**

- Support one guided, glitch-free source-to-building walkthrough
- Clarify compatibility rules and wiring feedback
- Preserve layout and valve changes reliably
- Keep the transition back to display mode smooth and confidence-inspiring

**Boundary:** This milestone should polish the existing edit-mode path, not redesign the entire configuration model.

---

## 5. Data Flow

The demo should continue using the current high-level data path:

1. Backend adapters emit normalized signals.
2. The signal engine broadcasts current signal state to connected clients.
3. The signal bus manages live mode, reconnect behavior, and demo fallback behavior.
4. Layout data maps signals onto plots and buildings.
5. Scene systems interpret those signals into visual behavior.

### Demo-specific data requirements

Every showcased signal should support both:

- `Live path`: real adapter-backed updates when the backend is available
- `Demo path`: simulated fallback values that preserve the intended visual story

This prevents the demo from looking broken when real services are unavailable or partially configured.

### Signal selection guidance

For the polished demo, prefer signals that produce visually distinct, easy-to-read changes:

- `gauge`: CPU, memory, disk, stream count
- `rate`: traffic or request activity
- `text`: weather or ticker headlines
- `event`: delivery, backup, deploy, or stream-start moments
- `state`: binary or tri-state service health if the visual treatment is clear

---

## 6. Error Handling and Degradation

The demo should favor graceful degradation over hard failure.

### Expected behaviors

- If a live signal is missing, the connected building remains attractive in `idle`
- If a signal becomes stale, the existing disconnected-state behavior is used
- If layout save fails when leaving edit mode, the city still resumes and the user sees a non-blocking toast
- If an adapter is unavailable, the UI should still present a coherent scene instead of surfacing raw backend complexity in the core demo path

### Non-goals for this milestone

- Exhaustive administrative diagnostics UI
- Deep adapter debugging workflows
- Full recovery UX for every backend misconfiguration

The quality target is that the demo still looks deliberate even when parts of the live stack are absent.

---

## 7. Testing Strategy

This milestone needs a lightweight but real test floor so visual polish work does not continually break the demo.

### Priority automated coverage

- Backend config loading
- Adapter registration and safe handling of missing dependencies
- Layout serialization and round-trip save/load behavior
- Config API and layout API happy paths plus save failure handling where practical

### Priority manual QA coverage

- First-load default city appearance
- Demo mode visual quality
- Live mode signal hookup with a small known-good config
- Edit-mode walkthrough from source to plot to building to save
- Return from edit mode to display mode without broken visuals or state loss

### Test philosophy

Automated checks should protect the project from regressions in config, layout, and data plumbing. Manual QA should verify the visual experience and pacing of the showcase slice.

---

## 8. Definition of Done

The polished demo milestone is complete when all of the following are true:

- The default city loads cleanly and looks intentional with no setup
- The showcased buildings are all non-placeholder and visually coherent together
- Demo mode produces a compelling city even without a running backend
- Live mode drives the same city successfully with a small known-good config
- At least one short edit-mode walkthrough can be demonstrated without obvious glitches
- No placeholder systems appear in the showcased path
- Basic automated checks exist for config, layout, and API foundations
- Project documentation reflects the actual shipped demo behavior

---

## 9. Recommended Build Order

The implementation plan should prioritize work in this order:

1. Compose the default demo layout and curated signal set
2. Polish the core building set and scene readability
3. Add lightweight inhabited-world moments
4. Tighten the guided edit-mode walkthrough
5. Add regression protection for backend/config/layout behavior
6. Update README and demo-facing documentation to match reality

This order delivers visible demo quality early while still leaving room for stability work before the milestone is called complete.

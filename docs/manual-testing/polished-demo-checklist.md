# Polished Demo Manual Testing Checklist

## First Load

- Start the backend with `python backend/main.py`.
- Open `http://localhost:8000`.
- Confirm the default nine-plot showcase city loads without empty centerpiece plots.
- Confirm the top-right HUD shows `LIVE` when backend signals arrive and `DEMO` when the backend is unavailable.

## Demo Mode

- Stop the backend or open the standalone build.
- Confirm the city still shows the curated showcase layout.
- Confirm demo mode animates these signals visibly:
  - `cpu_load` on windmill and server tower
  - `memory_used` on power station
  - `disk_used` on warehouse
  - `news_ticker` on bank ticker
  - `weather_text` on bus stop
  - `http_requests` on cafe and road traffic
  - `active_streams` on drive-in
  - `deploy_event` on data vault

## Live Mode

- Run with `backend/config.example.yaml` copied to `backend/config.yaml`.
- Confirm the page moves from `DEMO` to `LIVE`.
- Confirm the same showcase layout is preserved in live mode.
- Confirm no signal names in the layout are missing from the example config.

## Edit-Mode Golden Path

- Enter edit mode with the `⚙` button.
- Confirm the golden-path hint appears near the lower-right corner.
- Select a signal from the Signal Library.
- Click a compatible plot and connect the signal.
- Place or swap a compatible building.
- Open the valve panel from the pipe and change the label or threshold.
- Press `Done ✓` and confirm the save toast appears.
- Reload the page and confirm the layout change persisted.

## Degraded / Offline Behavior

- Disconnect a signal source or let demo mode resume.
- Confirm disconnected buildings remain readable rather than blank.
- Confirm text buildings show a sensible fallback instead of disappearing.
- Confirm edit-mode save failure still returns the city to display mode with a visible error toast.

## Showcase Polish

- Confirm the city feels alive even while idle.
- Confirm walker moments appear occasionally near the cafe, drive-in, and data vault without becoming noisy.
- Confirm alert overlays are visible but not overwhelming.
- Confirm placeholder buildings do not appear in the default showcase layout.

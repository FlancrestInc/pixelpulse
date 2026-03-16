"""FastAPI app entry point for serving PixelPulse and runtime APIs."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse

from backend.adapters.builtin.webhook import WebhookAdapter
from backend.config_api import router as config_api_router, set_layout_event_publisher
from backend.signal_engine import SignalEngine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_DIR     = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"
CONFIG_PATH  = BASE_DIR / "backend" / "config.yaml"
LAYOUT_PATH  = BASE_DIR / "backend" / "layout.yaml"

engine = SignalEngine(config_path=str(CONFIG_PATH), layout_path=str(LAYOUT_PATH))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage SignalEngine startup and shutdown for app lifespan."""
    logger.info("Starting PixelPulse backend")
    await engine.start()
    set_layout_event_publisher(engine._broadcast)
    yield
    logger.info("Stopping PixelPulse backend")
    await engine.stop()


app = FastAPI(title="PixelPulse", lifespan=lifespan)


@app.middleware("http")
async def no_cache_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    return response


app.include_router(config_api_router)


# ── Static file serving ────────────────────────────────────────────────────────

@app.get("/")
async def index() -> FileResponse:
    """Serve the frontend entrypoint."""
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return FileResponse(str(BASE_DIR / "pixelpulse_standalone.html"))


@app.get("/{file_path:path}")
async def serve_static(file_path: str) -> FileResponse:
    """Serve frontend JS modules and project assets at their original relative paths.

    Checks frontend/ first, then falls back to the project root for
    assets/sprites/ and similar shared resources.
    """
    candidate = (FRONTEND_DIR / file_path).resolve()
    if candidate.is_file() and candidate.is_relative_to(FRONTEND_DIR):
        return FileResponse(str(candidate))

    asset_candidate = (BASE_DIR / file_path).resolve()
    if asset_candidate.is_file() and asset_candidate.is_relative_to(BASE_DIR):
        return FileResponse(str(asset_candidate))

    return JSONResponse({"detail": "Not found"}, status_code=404)


# ── WebSocket ──────────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """Handle WebSocket connections for initial handshake and live signal updates."""
    await engine.register_client(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await engine.unregister_client(websocket)


# ── Webhook ingestion ──────────────────────────────────────────────────────────

@app.post("/hooks/auth_failures")
async def auth_failures_webhook(request: Request) -> dict[str, str]:
    """
    Increment the auth_failures rolling counter.

    Accepts an optional JSON body ``{"count": N}`` to record multiple
    failures in one POST.  Defaults to 1 if body is absent or malformed.

    Example (from fail2ban action or sshd script):
        curl -s -X POST http://localhost:8000/hooks/auth_failures
        curl -s -X POST http://localhost:8000/hooks/auth_failures \\
             -H 'Content-Type: application/json' -d '{"count": 3}'
    """
    count = 1
    try:
        body = await request.json()
        count = max(1, int(body.get("count", 1)))
    except Exception:
        pass  # empty body or non-JSON is fine — default to 1

    # Find the AuthGateAdapter instance registered under the engine
    from backend.adapters.builtin.auth_gate import AuthGateAdapter
    for adapter in engine._adapters:
        if isinstance(adapter, AuthGateAdapter) and adapter._mode == "webhook":
            await adapter.record_failure(count)

    return {"status": "accepted", "count": str(count)}


@app.post("/hooks/{hook_path:path}")
async def webhook_ingest(hook_path: str, request: Request) -> dict[str, str]:
    """Ingest generic webhook payloads and route them to webhook adapters."""
    payload = await request.json()
    routed = await WebhookAdapter.dispatch_payload(
        "/" + hook_path,
        payload if isinstance(payload, dict) else {"value": payload},
    )
    return {"status": "accepted" if routed else "ignored"}


if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
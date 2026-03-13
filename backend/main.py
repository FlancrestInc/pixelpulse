"""FastAPI app entry point for serving PixelPulse and runtime APIs."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.adapters.builtin.webhook import WebhookAdapter
from backend.config_api import router as config_api_router
from backend.signal_engine import SignalEngine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"
CONFIG_PATH = BASE_DIR / "backend" / "config.yaml"
LAYOUT_PATH = BASE_DIR / "backend" / "layout.yaml"

engine = SignalEngine(config_path=str(CONFIG_PATH), layout_path=str(LAYOUT_PATH))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage SignalEngine startup and shutdown for app lifespan."""
    logger.info("Starting PixelPulse backend")
    await engine.start()
    yield
    logger.info("Stopping PixelPulse backend")
    await engine.stop()


app = FastAPI(title="PixelPulse", lifespan=lifespan)

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="frontend_static")

app.include_router(config_api_router)


@app.get("/")
async def index() -> FileResponse:
    """Serve the frontend entrypoint when available."""
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return FileResponse(BASE_DIR / "pixelpulse_standalone.html")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """Handle WebSocket connections for initial handshake and live signal updates."""
    await engine.register_client(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await engine.unregister_client(websocket)


@app.post("/hooks/{hook_path:path}")
async def webhook_ingest(hook_path: str, request: Request) -> dict[str, str]:
    """Ingest webhook payloads and route them to webhook adapters."""
    payload = await request.json()
    routed = await WebhookAdapter.dispatch_payload("/" + hook_path, payload if isinstance(payload, dict) else {"value": payload})
    return {"status": "accepted" if routed else "ignored"}

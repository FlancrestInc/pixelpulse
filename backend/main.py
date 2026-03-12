"""FastAPI app entry point for serving PixelPulse and runtime APIs."""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.signal_engine import SignalEngine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"
CONFIG_PATH = BASE_DIR / "backend" / "config.yaml"
LAYOUT_PATH = BASE_DIR / "backend" / "layout.yaml"

app = FastAPI(title="PixelPulse")
engine = SignalEngine(config_path=str(CONFIG_PATH), layout_path=str(LAYOUT_PATH))

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="frontend_static")


@app.get("/")
async def index() -> FileResponse:
    """Serve the frontend entrypoint when available."""
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return FileResponse(BASE_DIR / "pixelpulse_standalone.html")


@app.on_event("startup")
async def on_startup() -> None:
    """Start the signal engine when the FastAPI app boots."""
    logger.info("Starting PixelPulse backend")
    await engine.start()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    """Stop the signal engine when the FastAPI app shuts down."""
    logger.info("Stopping PixelPulse backend")
    await engine.stop()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """Handle WebSocket connections for initial handshake and live signal updates."""
    await engine.register_client(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await engine.unregister_client(websocket)

"""REST API endpoints for reading and writing PixelPulse configuration."""

from __future__ import annotations

import asyncio
import os
import tempfile
from pathlib import Path
from typing import Any

import httpx
import yaml
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.plugin_loader import load_adapter_classes_with_report

router = APIRouter(prefix="/api", tags=["config"])

_layout_event_publisher = None

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = BASE_DIR / "backend" / "config.yaml"
LAYOUT_PATH = BASE_DIR / "backend" / "layout.yaml"


class ConfigWriteRequest(BaseModel):
    config: dict[str, Any]


class LayoutWriteRequest(BaseModel):
    layout: dict[str, Any]


class AdapterAddRequest(BaseModel):
    adapter_config: dict[str, Any] = Field(default_factory=dict)


class PrometheusTestRequest(BaseModel):
    url: str
    query: str
    auth: dict[str, Any] | None = None


def set_layout_event_publisher(publisher) -> None:
    """Register async callback for layout save status websocket events."""
    global _layout_event_publisher
    _layout_event_publisher = publisher


@router.get("/signals")
async def get_signals() -> dict[str, Any]:
    config = await _read_yaml(CONFIG_PATH)
    signals = config.get("signals", []) if isinstance(config, dict) else []
    return {"signals": signals}


@router.get("/adapters")
async def get_adapters() -> dict[str, Any]:
    report = load_adapter_classes_with_report()
    return {
        "adapters": sorted(report.registry.keys()),
        "missing_dependencies": report.missing_dependencies,
    }


@router.get("/config")
async def get_config() -> dict[str, Any]:
    config = await _read_yaml(CONFIG_PATH)
    return {"config": config}


@router.put("/config")
async def put_config(request: ConfigWriteRequest) -> dict[str, str]:
    await _atomic_write_yaml(CONFIG_PATH, request.config)
    return {"status": "ok"}


@router.post("/config/adapters")
async def add_adapter(request: AdapterAddRequest) -> dict[str, Any]:
    config = await _read_yaml(CONFIG_PATH)
    if not isinstance(config, dict):
        raise HTTPException(status_code=400, detail="config.yaml must contain a mapping")
    signals = config.setdefault("signals", [])
    if not isinstance(signals, list):
        raise HTTPException(status_code=400, detail="config.yaml signals must be a list")
    signals.append(request.adapter_config)
    await _atomic_write_yaml(CONFIG_PATH, config)
    return {"status": "ok", "signals": signals}


@router.delete("/config/adapters/{signal_id}")
async def delete_adapter(signal_id: str) -> dict[str, Any]:
    config = await _read_yaml(CONFIG_PATH)
    if not isinstance(config, dict):
        raise HTTPException(status_code=400, detail="config.yaml must contain a mapping")
    signals = config.get("signals", [])
    if not isinstance(signals, list):
        raise HTTPException(status_code=400, detail="config.yaml signals must be a list")
    config["signals"] = [entry for entry in signals if not (isinstance(entry, dict) and entry.get("id") == signal_id)]

    layout = await _read_yaml(LAYOUT_PATH)
    if layout is None:
        layout = {"plots": []}
    if not isinstance(layout, dict):
        raise HTTPException(status_code=400, detail="layout.yaml must contain a mapping")
    plots = layout.get("plots", [])
    if not isinstance(plots, list):
        raise HTTPException(status_code=400, detail="layout.yaml plots must be a list")

    removed_pipes = [
        str(plot.get("plot_id"))
        for plot in plots
        if isinstance(plot, dict) and plot.get("signal") == signal_id and plot.get("plot_id") is not None
    ]
    layout["plots"] = [
        plot
        for plot in plots
        if not (isinstance(plot, dict) and plot.get("signal") == signal_id)
    ]

    await _atomic_write_yaml(CONFIG_PATH, config)
    await _atomic_write_yaml(LAYOUT_PATH, layout)
    return {"status": "ok", "signals": config["signals"], "removed_pipes": removed_pipes}


@router.get("/layout")
async def get_layout() -> dict[str, Any]:
    layout = await _read_yaml(LAYOUT_PATH)
    if layout is None:
        layout = {"plots": []}
    return {"layout": layout}


@router.put("/layout")
async def put_layout(request: LayoutWriteRequest) -> dict[str, str]:
    try:
        await _atomic_write_yaml(LAYOUT_PATH, request.layout)
        if _layout_event_publisher is not None:
            await _layout_event_publisher({"type": "layout_saved", "layout": request.layout})
    except Exception as exc:
        if _layout_event_publisher is not None:
            await _layout_event_publisher({"type": "layout_save_failed", "error": str(exc)})
        raise
    return {"status": "ok"}


@router.post("/prometheus/test")
async def test_prometheus_query(request: PrometheusTestRequest) -> dict[str, Any]:
    headers: dict[str, str] = {}
    auth = None
    auth_config = request.auth or {}
    auth_type = str(auth_config.get("type", "")).lower()
    if auth_type == "bearer" and auth_config.get("token"):
        headers["Authorization"] = f"Bearer {auth_config['token']}"
    if auth_type == "basic" and auth_config.get("username") is not None and auth_config.get("password") is not None:
        auth = httpx.BasicAuth(str(auth_config["username"]), str(auth_config["password"]))

    try:
        async with httpx.AsyncClient(timeout=10.0, headers=headers, auth=auth) as client:
            response = await client.get(request.url.rstrip("/") + "/api/v1/query", params={"query": request.query})
            response.raise_for_status()
        payload = response.json()
        result_list = payload.get("data", {}).get("result", [])
        value = None
        if isinstance(result_list, list) and result_list:
            first_result = result_list[0]
            if isinstance(first_result, dict):
                raw_value = first_result.get("value")
                if isinstance(raw_value, list) and len(raw_value) > 1:
                    try:
                        value = float(raw_value[1])
                    except (TypeError, ValueError):
                        value = None

        return {"ok": True, "value": value, "raw": payload}
    except Exception as exc:
        return {"ok": False, "error": f"Prometheus test query failed: {exc}"}


async def _read_yaml(path: Path) -> Any:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _read_yaml_sync, path)


def _read_yaml_sync(path: Path) -> Any:
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


async def _atomic_write_yaml(path: Path, payload: Any) -> None:
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _atomic_write_yaml_sync, path, payload)


def _atomic_write_yaml_sync(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    serialized = yaml.safe_dump(payload, sort_keys=False)
    fd, temp_path = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(serialized)
        os.replace(temp_path, path)
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)

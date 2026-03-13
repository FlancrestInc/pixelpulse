"""Builtin adapter for turning file changes into signal events."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from pathlib import Path
from typing import Any

from backend.adapters.base import AdapterBase, Signal

logger = logging.getLogger(__name__)


class FileWatcherAdapter(AdapterBase):
    """Watch local file changes and emit parsed values in configured mode."""

    adapter_type = "file_watcher"
    requirements: list[str] = []

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__(config)
        self._signal_id = str(config.get("id", "file_value"))
        self._label = str(config.get("label", self._signal_id.replace("_", " ").title()))
        self._path = Path(str(config.get("path", "")))
        self._mode = str(config.get("mode", "last_float"))
        self._interval = float(config.get("interval", 10.0))
        self._type = str(config.get("type", "gauge" if self._mode != "last_json" else "text"))
        self._ceiling = config.get("ceiling")
        self._json_key = str(config.get("json_key", "value"))
        self._last_inode: int | None = None
        self._last_mtime: float | None = None
        self._offset = 0
        self._line_count = 0

    @property
    def interval(self) -> float:
        return self._interval

    @property
    def signal_ids(self) -> list[str]:
        return [self._signal_id]

    async def poll(self) -> list[Signal] | None:
        try:
            loop = asyncio.get_running_loop()
            changed, value = await loop.run_in_executor(None, self._read_if_changed)
            if not changed:
                return []
            return [
                Signal(
                    id=self._signal_id,
                    type=self._type,  # type: ignore[arg-type]
                    value=value,
                    label=self._label,
                    source=self.adapter_type,
                    timestamp=time.time(),
                    metadata={"path": str(self._path), "mode": self._mode},
                )
            ]
        except Exception as exc:
            logger.exception("file_watcher '%s' failed: %s", self._signal_id, exc)
            return None

    def _read_if_changed(self) -> tuple[bool, float | str]:
        if not self._path.exists() or not self._path.is_file():
            raise FileNotFoundError(f"file not found: {self._path}")

        stat = self._path.stat()
        inode = getattr(stat, "st_ino", None)
        rotated = self._last_inode is not None and inode != self._last_inode
        changed = rotated or self._last_mtime is None or stat.st_mtime > self._last_mtime
        if not changed:
            return False, 0.0

        self._last_inode = inode
        self._last_mtime = stat.st_mtime

        if self._mode == "line_count":
            return True, self._read_line_count(rotated)
        if self._mode == "last_json":
            return True, self._read_last_json()
        return True, self._read_last_float()

    def _read_last_float(self) -> float:
        with self._path.open("r", encoding="utf-8", errors="ignore") as handle:
            lines = [line.strip() for line in handle.readlines() if line.strip()]
        value = float(lines[-1]) if lines else 0.0
        return self._normalize(value)

    def _read_last_json(self) -> float | str:
        with self._path.open("r", encoding="utf-8", errors="ignore") as handle:
            lines = [line.strip() for line in handle.readlines() if line.strip()]
        if not lines:
            return ""
        obj = json.loads(lines[-1])
        raw = obj.get(self._json_key, obj)
        return str(raw) if self._type in {"text", "event", "state"} else self._normalize(float(raw))

    def _read_line_count(self, rotated: bool) -> float:
        with self._path.open("r", encoding="utf-8", errors="ignore") as handle:
            if rotated:
                self._offset = 0
            handle.seek(self._offset, os.SEEK_SET)
            new_lines = handle.readlines()
            self._offset = handle.tell()
        self._line_count += len(new_lines)
        return self._normalize(float(self._line_count))

    def _normalize(self, value: float) -> float:
        if self._ceiling is None:
            return value
        ceiling = float(self._ceiling)
        if ceiling <= 0:
            return 0.0
        return min(max(value / ceiling, 0.0), 1.0)

"""Builtin adapter for parsing RSS feeds into text signals."""

from __future__ import annotations

import asyncio
import html
import logging
import re
import time
from collections import deque
from typing import Any

import feedparser
import httpx

from backend.adapters.base import AdapterBase, Signal

logger = logging.getLogger(__name__)


class RssFeedAdapter(AdapterBase):
    """Fetch one or more RSS feeds and emit rotating headline text."""

    adapter_type = "rss_feed"
    requirements = ["httpx", "feedparser"]

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__(config)
        self._signal_id = str(config.get("id", "rss_feed"))
        self._label = str(config.get("label", "RSS Feed"))
        self._interval = float(config.get("interval", 300.0))
        self._feeds = config.get("feeds", []) if isinstance(config.get("feeds"), list) else []
        self._max_items = int(config.get("max_items", 20))
        self._items: deque[str] = deque(maxlen=self._max_items)
        self._last_index = -1

    @property
    def interval(self) -> float:
        return self._interval

    @property
    def signal_ids(self) -> list[str]:
        return [self._signal_id]

    async def poll(self) -> list[Signal] | None:
        try:
            if self._feeds:
                await self._refresh_items()
            if not self._items:
                return []
            self._last_index = (self._last_index + 1) % len(self._items)
            value = list(self._items)[self._last_index]
            return [
                Signal(
                    id=self._signal_id,
                    type="text",
                    value=value,
                    label=self._label,
                    source=self.adapter_type,
                    timestamp=time.time(),
                    metadata={"feed_count": len(self._feeds)},
                )
            ]
        except Exception as exc:
            logger.exception("rss_feed '%s' failed: %s", self._signal_id, exc)
            return None

    async def _refresh_items(self) -> None:
        async with httpx.AsyncClient(timeout=15.0) as client:
            responses = await asyncio.gather(
                *(client.get(str(feed.get("url", ""))) for feed in self._feeds),
                return_exceptions=True,
            )

        collected: list[str] = []
        for feed, response in zip(self._feeds, responses):
            if isinstance(response, Exception):
                logger.warning("rss feed fetch failed for %s: %s", feed, response)
                continue
            name = str(feed.get("name", "Feed"))
            entries = await asyncio.get_running_loop().run_in_executor(None, feedparser.parse, response.text)
            for entry in entries.entries[: self._max_items]:
                title = self._clean_text(str(entry.get("title", "")))
                if title:
                    collected.append(f"[{name}] {title}")

        if collected:
            self._items.clear()
            self._items.extend(collected[: self._max_items])

    def _clean_text(self, text: str) -> str:
        decoded = html.unescape(text)
        return re.sub(r"<[^>]+>", "", decoded).strip()

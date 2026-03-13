"""Builtin adapter for fetching weather data for dashboard signals."""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from backend.adapters.base import AdapterBase, Signal

logger = logging.getLogger(__name__)

WMO = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    80: "Rain showers",
    81: "Heavy rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
}


class WeatherAdapter(AdapterBase):
    """Query Open-Meteo and emit weather conditions as text."""

    adapter_type = "weather"
    requirements = ["httpx"]

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__(config)
        self._signal_id = str(config.get("id", "weather_text"))
        self._label = str(config.get("label", "Weather"))
        self._interval = float(config.get("interval", 600.0))
        self._units = str(config.get("units", "fahrenheit")).lower()
        self._city = config.get("city")
        self._lat = config.get("lat")
        self._lon = config.get("lon")

    @property
    def interval(self) -> float:
        return self._interval

    @property
    def signal_ids(self) -> list[str]:
        return [self._signal_id]

    async def poll(self) -> list[Signal] | None:
        try:
            lat, lon, location = await self._resolve_location()
            temp_unit = "fahrenheit" if self._units.startswith("f") else "celsius"
            url = (
                "https://api.open-meteo.com/v1/forecast"
                f"?latitude={lat}&longitude={lon}&current=temperature_2m,weather_code&temperature_unit={temp_unit}"
            )
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url)
                response.raise_for_status()
            current = response.json().get("current", {})
            code = int(current.get("weather_code", -1))
            description = WMO.get(code, "Unknown")
            temp = current.get("temperature_2m")
            suffix = "°F" if temp_unit == "fahrenheit" else "°C"
            value = f"{location}: {description}, {temp}{suffix}"
            return [
                Signal(
                    id=self._signal_id,
                    type="text",
                    value=value,
                    label=self._label,
                    source=self.adapter_type,
                    timestamp=time.time(),
                    metadata={"lat": lat, "lon": lon, "wmo_code": code},
                )
            ]
        except Exception as exc:
            logger.exception("weather '%s' failed: %s", self._signal_id, exc)
            return None

    async def _resolve_location(self) -> tuple[float, float, str]:
        if self._lat is not None and self._lon is not None:
            return float(self._lat), float(self._lon), "Configured location"
        if self._city:
            return await self._geocode_city(str(self._city))
        return await self._geolocate_ip()

    async def _geocode_city(self, city: str) -> tuple[float, float, str]:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={"name": city, "count": 1, "language": "en", "format": "json"},
            )
            res.raise_for_status()
        results = res.json().get("results") or []
        if not results:
            raise ValueError(f"city not found: {city}")
        first = results[0]
        return float(first["latitude"]), float(first["longitude"]), str(first.get("name", city))

    async def _geolocate_ip(self) -> tuple[float, float, str]:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get("http://ip-api.com/json/")
                res.raise_for_status()
            data = res.json()
            lat = float(data["lat"])
            lon = float(data["lon"])
            city = str(data.get("city", "Current location"))
            return lat, lon, city
        except Exception:
            return 40.7128, -74.0060, "Default location"

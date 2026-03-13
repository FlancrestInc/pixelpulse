"""Discovers and registers adapter plugins from builtin and user paths."""

from __future__ import annotations

import importlib.util
import inspect
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from types import ModuleType
from typing import Type

from backend.adapters.base import AdapterBase

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class PluginLoadReport:
    """Collection of loaded adapters and adapters skipped for missing dependencies."""

    registry: dict[str, Type[AdapterBase]] = field(default_factory=dict)
    missing_dependencies: dict[str, list[str]] = field(default_factory=dict)


def load_adapter_classes() -> dict[str, Type[AdapterBase]]:
    """Discover adapter classes and return them keyed by adapter_type."""
    return load_adapter_classes_with_report().registry


def load_adapter_classes_with_report() -> PluginLoadReport:
    """Discover adapter classes and include load diagnostics for status reporting."""
    root = Path(__file__).resolve().parent.parent
    builtin_dir = root / "backend" / "adapters" / "builtin"
    plugin_dir = root / "plugins"

    report = PluginLoadReport()
    _load_from_directory(builtin_dir, report, source_label="builtin")
    _load_from_directory(plugin_dir, report, source_label="plugin")
    return report


def _load_from_directory(
    directory: Path,
    report: PluginLoadReport,
    source_label: str,
) -> None:
    """Load AdapterBase subclasses from all Python files in a directory."""
    if not directory.exists():
        logger.info("Adapter directory does not exist, skipping: %s", directory)
        return

    for file_path in sorted(directory.rglob("*.py")):
        if file_path.name.startswith("__"):
            continue

        module = _import_module(file_path)
        if module is None:
            continue

        for _, cls in inspect.getmembers(module, inspect.isclass):
            if cls is AdapterBase or not issubclass(cls, AdapterBase):
                continue
            if cls.__module__ != module.__name__:
                continue

            adapter_type = getattr(cls, "adapter_type", "").strip()
            if not adapter_type:
                logger.warning("Skipping adapter class without adapter_type: %s", cls.__name__)
                continue

            missing = _missing_requirements(cls)
            if missing:
                report.missing_dependencies[adapter_type] = missing
                install_hint = " ".join(missing)
                logger.warning(
                    "Skipping adapter '%s': missing dependencies %s. Install with: pip install %s",
                    adapter_type,
                    ", ".join(missing),
                    install_hint,
                )
                continue

            if adapter_type in report.registry:
                logger.info(
                    "Overriding adapter '%s' with %s implementation from %s",
                    adapter_type,
                    source_label,
                    file_path,
                )
            report.registry[adapter_type] = cls
            logger.info("Registered adapter '%s' from %s", adapter_type, file_path)


def _import_module(file_path: Path) -> ModuleType | None:
    """Import a Python module from a file path, returning None on failure."""
    module_name = f"pixelpulse_plugin_{file_path.stem}_{abs(hash(file_path))}"
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    if spec is None or spec.loader is None:
        logger.warning("Could not create import spec for %s", file_path)
        return None

    try:
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    except Exception as exc:
        logger.warning("Failed to import adapter module %s: %s", file_path, exc)
        return None


def _missing_requirements(adapter_cls: Type[AdapterBase]) -> list[str]:
    """Return missing package requirements declared on adapter class."""
    missing: list[str] = []
    for requirement in getattr(adapter_cls, "requirements", []):
        package_name = _normalize_requirement_name(requirement)
        if importlib.util.find_spec(package_name) is None:
            missing.append(requirement)
    return missing


def _normalize_requirement_name(requirement: str) -> str:
    """Extract importable package name from a pip requirement string."""
    base = re.split(r"[<>=!~]", requirement, maxsplit=1)[0]
    return base.strip().replace("-", "_")

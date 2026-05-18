"""Load and validate ESL YAML manifests."""
from __future__ import annotations
import os
from pathlib import Path
from typing import Any
import yaml


_MANIFESTS_DIR = Path(__file__).parent / "manifests"


def load_manifest(path: str | Path) -> dict[str, Any]:
    with open(path) as f:
        return yaml.safe_load(f)


def load_all_manifests() -> dict[str, dict[str, Any]]:
    """Return {entity_name: manifest_dict} for all entity and metric manifests."""
    result: dict[str, dict[str, Any]] = {}

    for kind in ("entities", "metrics"):
        kind_dir = _MANIFESTS_DIR / kind
        if not kind_dir.exists():
            continue
        for yaml_file in sorted(kind_dir.glob("*.yaml")):
            manifest = load_manifest(yaml_file)
            if "entity" in manifest:
                name = manifest["entity"]["name"]
            elif "metric" in manifest:
                name = manifest["metric"]["name"]
            else:
                continue
            result[name] = manifest

    return result


def get_entity_manifests() -> dict[str, dict[str, Any]]:
    return {
        k: v for k, v in load_all_manifests().items() if "entity" in v
    }


def get_metric_manifests() -> dict[str, dict[str, Any]]:
    return {
        k: v for k, v in load_all_manifests().items() if "metric" in v
    }

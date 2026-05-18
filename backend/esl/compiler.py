"""ESL Compiler — generates MongoDB artifacts from YAML manifests."""
from __future__ import annotations
from typing import Any
from pymongo import MongoClient
from esl.manifests import get_entity_manifests, get_metric_manifests


class ESLCompiler:
    """Compile ESL manifests into MongoDB Views and JSON Schema validators."""

    def __init__(self, client: MongoClient, db_name: str):
        self.client = client
        self.db = client[db_name]

    def generate_view_pipeline(self, entity: dict[str, Any]) -> list[dict]:
        """Build the aggregation pipeline for a MongoDB View from an entity manifest."""
        e = entity["entity"]
        pipeline: list[dict] = []

        if e.get("filter"):
            pipeline.append({"$match": e["filter"]})

        if "site" in e.get("relationships", {}):
            pipeline.append({
                "$lookup": {
                    "from": "sites",
                    "localField": "site_id",
                    "foreignField": "_id",
                    "as": "site",
                }
            })

        project: dict[str, Any] = {"_id": 1, "name": 1, "asset_type": 1,
                                    "site_id": 1, "portfolio_id": 1, "location": 1}

        for field_name, field_def in e.get("fields", {}).items():
            source = field_def.get("source", field_name)
            project[field_name] = f"${source}"

        project["site"] = {"$arrayElemAt": ["$site", 0]}
        project["_esl_entity"] = e["name"]
        project["_iec_cim_class"] = e.get("iec_cim_class", "")

        pipeline.append({"$project": project})
        return pipeline

    def generate_json_schema(self, entity: dict[str, Any]) -> dict:
        """Generate MongoDB JSON Schema validator from entity manifest."""
        e = entity["entity"]
        properties: dict[str, Any] = {}
        required: list[str] = []

        for field_name, field_def in e.get("fields", {}).items():
            prop: dict[str, Any] = {"bsonType": "double"}
            if "unit" in field_def:
                prop["description"] = field_def.get("description", "") + f" [{field_def['unit']}]"
            if "range" in field_def:
                lo, hi = field_def["range"]
                prop["minimum"] = lo
                prop["maximum"] = hi
            if "enum" in field_def:
                prop["bsonType"] = "string"
                prop["enum"] = field_def["enum"]
            properties[field_name] = prop
            if field_def.get("required"):
                required.append(field_name)

        return {
            "$jsonSchema": {
                "bsonType": "object",
                "required": required,
                "properties": properties,
            }
        }

    def deploy_views(self, dry_run: bool = False) -> list[dict]:
        """Create all entity views in MongoDB. Returns list of deployment records."""
        results = []
        for name, manifest in get_entity_manifests().items():
            e = manifest["entity"]
            pipeline = self.generate_view_pipeline(manifest)
            source_collection = e["collection"]
            view_name = name

            record = {
                "view": view_name,
                "source": source_collection,
                "pipeline_stages": len(pipeline),
                "dry_run": dry_run,
            }

            if not dry_run:
                try:
                    existing = self.db.list_collection_names()
                    if view_name in existing:
                        self.db.command("drop", view_name)
                    self.db.command(
                        "create", view_name,
                        viewOn=source_collection,
                        pipeline=pipeline,
                    )
                    record["status"] = "deployed"
                except Exception as exc:
                    record["status"] = "error"
                    record["error"] = str(exc)
            else:
                record["status"] = "dry_run"

            results.append(record)

        return results

    def get_deployment_status(self) -> list[dict]:
        """Check which ESL views are deployed in MongoDB."""
        entity_names = list(get_entity_manifests().keys())
        existing = set(self.db.list_collection_names())
        status = []
        for name in entity_names:
            deployed = name in existing
            record = {"view": name, "deployed": deployed}
            if deployed:
                try:
                    info = self.db.command("listCollections", filter={"name": name})
                    col_info = info["cursor"]["firstBatch"]
                    if col_info:
                        record["type"] = col_info[0].get("type", "unknown")
                except Exception:
                    pass
            status.append(record)
        return status

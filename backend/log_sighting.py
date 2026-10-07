import json
from datetime import datetime, timezone
from pathlib import Path

SIGHTING_PATH = Path(__file__).parent/"sightings.jsonl"

def log_sighting(species, confidence, lat=None, lon=None):
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "latitude": lat,
        "longitude": lon,
        "species_name": species,
        "confidence": confidence,
    }
    with open(SIGHTING_PATH, "a", encoding = "utf-8") as f:
        f.write(json.dumps(entry) + "\n")
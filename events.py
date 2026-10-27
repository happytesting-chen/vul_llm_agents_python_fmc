"""Local execution event recording."""
import json
from datetime import datetime, timezone
from pathlib import Path

class Events:
    def __init__(self, path, run_id):
        self.path, self.run_id = Path(path), run_id
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def emit(self, event, **fields):
        record = dict(timestamp=datetime.now(timezone.utc).isoformat(),
                      run_id=self.run_id, event=event, **fields)
        with self.path.open('a', encoding='utf-8') as f:
            f.write(json.dumps(record) + '\n')

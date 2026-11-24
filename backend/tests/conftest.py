import os
import sys
import tempfile
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

# app.core.config creates DATA_DIR on import; keep tests away from real data.
os.environ.setdefault("DATA_DIR", tempfile.mkdtemp(prefix="vibepos-test-data-"))

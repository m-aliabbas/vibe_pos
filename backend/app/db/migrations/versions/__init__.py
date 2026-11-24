"""Numbered migrations, applied once each in VERSION order.

Create a new one with:  python -m app.db.migrations new "describe the change"
Modules are imported explicitly (not discovered at runtime) so the PyInstaller
desktop build bundles them.
"""

from app.db.migrations.versions import v0001_baseline_repairs

# >>> registry (keep this list in VERSION order; `migrations new` appends here)
VERSIONS = [
    v0001_baseline_repairs,
]
# <<< registry

from pathlib import Path

from app.platform.identifiers import ApplicationId


def application_data_root(user_data_base: Path, application_id: str | ApplicationId) -> Path:
    """Return stable writable storage, preserving the legacy retail directory."""
    selected_application = ApplicationId(application_id)
    root = user_data_base / "VibePOS"
    if selected_application == ApplicationId.RETAIL:
        return root
    return root / selected_application.value

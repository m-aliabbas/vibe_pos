"""Backend-authoritative application/profile and capability platform."""

def get_active_manifest():
	from app.platform.manifests import get_active_manifest as load_active_manifest

	return load_active_manifest()

__all__ = ["get_active_manifest"]

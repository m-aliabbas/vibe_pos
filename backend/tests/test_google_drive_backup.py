from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.core.config import settings
from app.services import google_drive_backup


class _ListResult:
    def __init__(self, values: list[dict[str, object]]) -> None:
        self.values = values

    def GetList(self) -> list[dict[str, object]]:
        return self.values


class _FakeDrive:
    def __init__(self, files: list[dict[str, object]]) -> None:
        self.files = files

    def ListFile(self, query: dict[str, str]) -> _ListResult:
        if "mimeType='application/vnd.google-apps.folder'" in query["q"]:
            return _ListResult([{"id": "folder-id"}])
        return _ListResult(self.files)


class GoogleDriveBackupTests(unittest.TestCase):
    def test_encrypted_client_config_and_session_are_loaded_from_data_dir(self) -> None:
        with tempfile.TemporaryDirectory(prefix="vibepos-drive-test-") as root_value:
            root = Path(root_value)
            client_path = root / "g1.json.enc"
            client = {
                "installed": {
                    "client_id": "synthetic-client",
                    "client_secret": "synthetic-secret",
                    "auth_uri": "https://accounts.example.test/auth",
                    "token_uri": "https://accounts.example.test/token",
                    "redirect_uris": ["http://localhost:8080/"],
                }
            }
            client_path.write_bytes(
                google_drive_backup._fernet().encrypt(json.dumps(client).encode())
            )

            with patch.object(settings, "DATA_DIR", str(root / "data")):
                with patch.object(
                    settings,
                    "GOOGLE_DRIVE_CLIENT_CONFIG_ENC_PATH",
                    str(client_path),
                ):
                    loaded = google_drive_backup._load_client_config()
                    self.assertEqual(loaded["client_id"], "synthetic-client")
                    self.assertFalse(google_drive_backup.get_status()["connected"])

                    account = {
                        "display_name": "Test User",
                        "email": "test@example.test",
                    }
                    google_drive_backup._save_session(
                        "synthetic-credentials", account
                    )
                    status = google_drive_backup.get_status()
                    self.assertTrue(status["configured"])
                    self.assertTrue(status["connected"])
                    self.assertEqual(status["account"], account)

    def test_list_backups_includes_each_native_provider_format(self) -> None:
        files = [
            {
                "id": "sqlite-id",
                "title": "pos_backup_1.db",
                "createdDate": "2026-10-03T00:00:00Z",
                "fileSize": "10",
            },
            {
                "id": "postgres-id",
                "title": "pos_backup_2.dump",
                "createdDate": "2026-10-03T00:00:01Z",
                "fileSize": "20",
            },
            {
                "id": "mysql-id",
                "title": "pos_backup_3.sql",
                "createdDate": "2026-10-03T00:00:02Z",
                "fileSize": "30",
            },
            {
                "id": "ignored-id",
                "title": "notes.txt",
                "createdDate": "2026-10-03T00:00:03Z",
                "fileSize": "40",
            },
        ]
        drive = _FakeDrive(files)
        with patch.object(
            google_drive_backup,
            "_authorized_drive",
            return_value=(drive, object(), {}),
        ):
            backups = google_drive_backup.list_backups()

        self.assertEqual(
            {backup["filename"] for backup in backups},
            {"pos_backup_1.db", "pos_backup_2.dump", "pos_backup_3.sql"},
        )

    def test_oauth_settings_use_a_loopback_ip_literal(self) -> None:
        client = {
            "client_id": "synthetic-client",
            "client_secret": "synthetic-secret",
            "auth_uri": "https://accounts.example.test/auth",
            "token_uri": "https://accounts.example.test/token",
            "redirect_uris": ["http://localhost:8080/"],
        }

        auth_settings = google_drive_backup._auth_settings(client, {})

        self.assertEqual(
            auth_settings["client_config"]["redirect_uri"],
            "http://127.0.0.1:8080/",
        )

    def test_upload_rejects_non_database_artifacts_before_authentication(self) -> None:
        with tempfile.TemporaryDirectory(prefix="vibepos-drive-test-") as root_value:
            archive_path = Path(root_value) / "backup.zip"
            archive_path.write_bytes(b"not-a-native-database-backup")
            with self.assertRaisesRegex(
                google_drive_backup.GoogleDriveBackupError,
                "format is not supported",
            ):
                google_drive_backup.upload_backup(archive_path)


if __name__ == "__main__":
    unittest.main()

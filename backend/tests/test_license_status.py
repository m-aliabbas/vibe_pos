from datetime import datetime, timedelta, timezone
import unittest

from app.services.license import _days_remaining


class LicenseStatusTests(unittest.TestCase):
    def test_days_remaining_rounds_partial_days_up(self) -> None:
        now = datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc)

        self.assertEqual(_days_remaining(now + timedelta(days=4, seconds=1), now=now), 5)
        self.assertEqual(_days_remaining(now + timedelta(days=1), now=now), 1)

    def test_days_remaining_never_returns_negative_days(self) -> None:
        now = datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc)

        self.assertEqual(_days_remaining(now - timedelta(seconds=1), now=now), 0)


if __name__ == "__main__":
    unittest.main()

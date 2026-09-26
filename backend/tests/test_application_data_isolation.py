from pathlib import Path
import unittest

from app.platform.data_paths import application_data_root
from app.platform.identifiers import ApplicationId


class ApplicationDataPathTests(unittest.TestCase):
    def test_retail_keeps_the_existing_upgrade_path(self) -> None:
        base = Path('/synthetic/user-data')
        self.assertEqual(
            application_data_root(base, ApplicationId.RETAIL),
            base / 'VibePOS',
        )

    def test_independent_apps_get_distinct_writable_roots(self) -> None:
        base = Path('/synthetic/user-data')
        workshop = application_data_root(base, ApplicationId.WORKSHOP)
        restaurant = application_data_root(base, ApplicationId.RESTAURANT)
        self.assertEqual(workshop, base / 'VibePOS' / 'workshop')
        self.assertEqual(restaurant, base / 'VibePOS' / 'restaurant')
        self.assertNotEqual(workshop, restaurant)


if __name__ == '__main__':
    unittest.main()

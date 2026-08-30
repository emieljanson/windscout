import unittest
from datetime import datetime, timezone
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from build import local_installer_version, with_firmware_version


class BuildInstallerVersionTest(unittest.TestCase):
    def test_generates_a_unique_local_version_and_embeds_it_in_the_firmware(self):
        version = local_installer_version(
            None, now=datetime(2026, 8, 30, 18, 55, 42, tzinfo=timezone.utc)
        )

        self.assertEqual(version, "dev-local-20260830-185542")
        self.assertEqual(with_firmware_version([], version), [f"-DFIRMWARE_VERSION={version}"])

    def test_rejects_a_manifest_version_that_differs_from_the_embedded_version(self):
        with self.assertRaisesRegex(ValueError, "must match"):
            with_firmware_version(["-DFIRMWARE_VERSION=old-ui"], "new-ui")


if __name__ == "__main__":
    unittest.main()

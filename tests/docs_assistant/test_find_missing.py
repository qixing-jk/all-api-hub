import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from docs_assistant import find_missing


class TranslationCompletenessTests(unittest.TestCase):
    def test_missing_file_output_supports_nul_delimiter(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output_file = Path(temp_dir) / "missing.bin"
            missing_files = [Path(temp_dir) / "guide with spaces.md"]

            with (
                patch.object(find_missing, "OUTPUT_FILE", output_file),
                patch.dict(os.environ, {"MISSING_FILES_DELIMITER": "nul"}),
            ):
                find_missing.save_missing_files(missing_files)

            self.assertEqual(
                output_file.read_bytes(),
                f"{missing_files[0]}\0".encode("utf-8"),
            )

    def test_check_mode_exits_nonzero_when_a_translation_is_missing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            docs_dir = Path(temp_dir)
            (docs_dir / "guide.md").write_text("# 指南\n", encoding="utf-8")
            (docs_dir / "en").mkdir()
            (docs_dir / "en" / "guide.md").write_text("# Guide\n", encoding="utf-8")

            with (
                patch.object(find_missing, "DOCS_DIR", docs_dir),
                patch.object(find_missing, "OUTPUT_FILE", docs_dir / "missing.txt"),
                patch.object(sys, "argv", ["find_missing.py", "--check"]),
            ):
                with self.assertRaises(SystemExit) as raised:
                    find_missing.main()

        self.assertEqual(raised.exception.code, 1)

    def test_default_mode_keeps_missing_only_discovery_compatible(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            docs_dir = Path(temp_dir)
            (docs_dir / "guide.md").write_text("# 指南\n", encoding="utf-8")

            with (
                patch.object(find_missing, "DOCS_DIR", docs_dir),
                patch.object(find_missing, "OUTPUT_FILE", docs_dir / "missing.txt"),
                patch.object(sys, "argv", ["find_missing.py"]),
            ):
                with self.assertRaises(SystemExit) as raised:
                    find_missing.main()

        self.assertEqual(raised.exception.code, 0)

    def test_check_mode_exits_zero_when_all_translations_are_complete(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            docs_dir = Path(temp_dir)
            (docs_dir / "guide.md").write_text("# 指南\n", encoding="utf-8")
            for language, title in (("en", "Guide"), ("ja", "ガイド")):
                (docs_dir / language).mkdir()
                (docs_dir / language / "guide.md").write_text(
                    f"# {title}\n",
                    encoding="utf-8",
                )

            with (
                patch.object(find_missing, "DOCS_DIR", docs_dir),
                patch.object(find_missing, "OUTPUT_FILE", docs_dir / "missing.txt"),
                patch.object(sys, "argv", ["find_missing.py", "--check"]),
            ):
                with self.assertRaises(SystemExit) as raised:
                    find_missing.main()

        self.assertEqual(raised.exception.code, 0)

    def test_empty_translation_is_incomplete(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            docs_dir = Path(temp_dir)
            source_file = docs_dir / "guide.md"
            source_file.write_text("# 指南\n", encoding="utf-8")
            for language in ("en", "ja"):
                (docs_dir / language).mkdir()
                (docs_dir / language / "guide.md").write_text(
                    "" if language == "en" else "# ガイド\n",
                    encoding="utf-8",
                )

            with patch.object(find_missing, "DOCS_DIR", docs_dir):
                missing = find_missing.find_missing_translations()

        self.assertEqual(missing, [source_file])


if __name__ == "__main__":
    unittest.main()

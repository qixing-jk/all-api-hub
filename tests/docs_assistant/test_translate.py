import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("OPENAI_API_KEY", "test-key")

from docs_assistant import translate


class TranslateFailureReportingTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.docs_dir = Path(self.temp_dir.name)
        self.source_file = self.docs_dir / "guide.md"
        self.source_file.write_text("# 指南\n", encoding="utf-8")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_partial_language_failure_marks_file_as_failed(self):
        def translate_content(content, language, **kwargs):
            if language == "en":
                raise RuntimeError("translation unavailable")
            return "# ガイド\n"

        with (
            patch.object(translate, "DOCS_DIR", self.docs_dir),
            patch.object(translate, "get_source_diff", return_value=""),
            patch.object(translate, "collect_image_url_mapping", return_value={}),
            patch.object(
                translate,
                "get_repo_relative_posix_path",
                side_effect=lambda path: (
                    f"docs/docs/{path.relative_to(self.docs_dir).as_posix()}"
                ),
            ),
            patch.object(translate, "translate_content", side_effect=translate_content),
        ):
            succeeded = translate.translate_file(self.source_file)

        self.assertFalse(succeeded)
        self.assertFalse((self.docs_dir / "en" / "guide.md").exists())
        self.assertTrue((self.docs_dir / "ja" / "guide.md").exists())

    def test_skipped_language_does_not_hide_other_language_failure(self):
        existing_translation = self.docs_dir / "en" / "guide.md"
        existing_translation.parent.mkdir()
        existing_translation.write_text("# Guide\n", encoding="utf-8")

        with (
            patch.object(translate, "DOCS_DIR", self.docs_dir),
            patch.object(translate, "FORCE_TRANSLATE", False),
            patch.object(translate, "get_source_diff", return_value=""),
            patch.object(translate, "collect_image_url_mapping", return_value={}),
            patch.object(
                translate,
                "get_repo_relative_posix_path",
                side_effect=lambda path: (
                    f"docs/docs/{path.relative_to(self.docs_dir).as_posix()}"
                ),
            ),
            patch.object(
                translate,
                "translate_content",
                side_effect=RuntimeError("translation unavailable"),
            ),
        ):
            succeeded = translate.translate_file(self.source_file)

        self.assertFalse(succeeded)
        self.assertEqual(
            existing_translation.read_text(encoding="utf-8"),
            "# Guide\n",
        )
        self.assertFalse((self.docs_dir / "ja" / "guide.md").exists())

    def test_blank_api_response_is_rejected(self):
        response = SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content="   "))]
        )

        with (
            patch.object(
                translate.client.chat.completions,
                "create",
                return_value=response,
            ),
            patch.object(translate, "MAX_RETRIES", 0),
        ):
            with self.assertRaisesRegex(ValueError, "为空"):
                translate.translate_content("# 指南\n", "en")

    def test_outer_code_fence_with_blank_content_is_rejected(self):
        response = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(content="```markdown\n   \n```")
                )
            ]
        )

        with (
            patch.object(
                translate.client.chat.completions,
                "create",
                return_value=response,
            ),
            patch.object(translate, "MAX_RETRIES", 0),
        ):
            with self.assertRaisesRegex(ValueError, "为空"):
                translate.translate_content("# 指南\n", "en")

    def test_main_exits_nonzero_when_any_file_fails(self):
        with (
            patch.object(translate, "DOCS_DIR", self.docs_dir),
            patch.object(translate, "MAX_WORKERS", 1),
            patch.object(translate, "detect_manual_translations", return_value=set()),
            patch.object(translate, "translate_file", return_value=False),
            patch.object(sys, "argv", ["translate.py", str(self.source_file)]),
        ):
            with self.assertRaises(SystemExit) as raised:
                translate.main()

        self.assertEqual(raised.exception.code, 1)

    def test_manual_translation_detection_rejects_invalid_diff(self):
        failed_diff = subprocess.CompletedProcess(
            args=["git", "diff"],
            returncode=128,
            stdout="",
            stderr="bad revision",
        )

        with patch.object(translate.subprocess, "run", return_value=failed_diff):
            with self.assertRaisesRegex(RuntimeError, "bad revision"):
                translate.detect_manual_translations()

    def test_manual_translation_detection_can_be_disabled(self):
        with (
            patch.object(translate, "TRANSLATE_SKIP_MANUAL", True),
            patch.object(translate.subprocess, "run") as run_diff,
        ):
            self.assertEqual(translate.detect_manual_translations(), set())

        run_diff.assert_not_called()


if __name__ == "__main__":
    unittest.main()

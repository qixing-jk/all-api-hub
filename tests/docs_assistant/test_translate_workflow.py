import unittest
from pathlib import Path

import yaml


REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "translate-docs.yml"


class TranslationWorkflowSafetyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        workflow = yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))
        cls.steps = workflow["jobs"]["translate"]["steps"]

    def get_step(self, name):
        return next(step for step in self.steps if step.get("name") == name)

    def test_file_discovery_fails_fast_and_uses_environment_inputs(self):
        step = self.get_step("Get files to translate")

        self.assertIn("set -euo pipefail", step["run"])
        self.assertNotIn("${{", step["run"])
        self.assertEqual(
            step["env"]["TRANSLATION_MODE"],
            "${{ github.event.inputs.mode }}",
        )

    def test_translate_step_passes_nul_delimited_paths_as_an_array(self):
        step = self.get_step("Translate documents")

        self.assertIn("mapfile -d '' -t files", step["run"])
        self.assertIn('"${files[@]}"', step["run"])
        self.assertNotIn("steps.changed-files.outputs.files }}", step["run"])


if __name__ == "__main__":
    unittest.main()

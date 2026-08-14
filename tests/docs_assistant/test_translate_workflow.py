import unittest
from pathlib import Path

import yaml


REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "translate-docs.yml"
TEST_WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "test.yml"
TOOLING_CHECK_WORKFLOW_PATH = (
    REPO_ROOT / ".github" / "workflows" / "translation-tooling-check.yml"
)


def load_workflow(path):
    return yaml.load(path.read_text(encoding="utf-8"), Loader=yaml.BaseLoader)


class TranslationWorkflowSafetyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        workflow = load_workflow(WORKFLOW_PATH)
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

    def test_python_translation_tests_use_a_dedicated_pr_check(self):
        test_workflow = load_workflow(TEST_WORKFLOW_PATH)

        for event_name in ("push", "pull_request"):
            paths = test_workflow["on"][event_name]["paths"]
            self.assertIn("tests/**", paths)
            self.assertIn("!tests/docs_assistant/**", paths)
            self.assertGreater(
                paths.index("!tests/docs_assistant/**"),
                paths.index("tests/**"),
            )

        tooling_workflow = load_workflow(TOOLING_CHECK_WORKFLOW_PATH)
        pull_request_paths = tooling_workflow["on"]["pull_request"]["paths"]
        self.assertIn("docs_assistant/**", pull_request_paths)
        self.assertIn("tests/docs_assistant/**", pull_request_paths)
        self.assertIn(".github/workflows/test.yml", pull_request_paths)
        self.assertIn(".github/workflows/translate-docs.yml", pull_request_paths)
        self.assertIn(
            ".github/workflows/translation-tooling-check.yml",
            pull_request_paths,
        )
        self.assertEqual(tooling_workflow["permissions"]["contents"], "read")

        steps = tooling_workflow["jobs"]["translation-tooling"]["steps"]
        run_commands = "\n".join(step.get("run", "") for step in steps)
        self.assertIn("python -m unittest discover", run_commands)
        self.assertIn("python docs_assistant/find_missing.py --check", run_commands)


if __name__ == "__main__":
    unittest.main()

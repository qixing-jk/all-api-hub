import { execFileSync } from "node:child_process"

import { runPnpm } from "./utils/run-pnpm.mjs"

/** Inputs that can change generated permissions or this mandatory check. */
function affectsPermissions(file) {
  return (
    [
      "wxt.config.ts",
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "playwright.config.ts",
      "scripts/run-permission-warning-check.mjs",
      "e2e/extensionPermissionWarnings.spec.ts",
      "e2e/fixtures/permission-warnings-baseline.json",
      ".github/workflows/e2e-smoke.yml",
      ".github/workflows/permission-warnings.yml",
      ".husky/pre-commit",
    ].includes(file) ||
    file.startsWith("src/entrypoints/") ||
    file.startsWith("plugins/") ||
    file.startsWith("e2e/utils/") ||
    file.startsWith("e2e/setup/") ||
    file.startsWith("e2e/e2e-build-") ||
    file.startsWith("scripts/e2e-build")
  )
}

/** Preserve deletions and both sides of renames, including paths with spaces. */
function changedFiles(staged) {
  return execFileSync(
    "git",
    [
      "diff",
      ...(staged ? ["--cached"] : []),
      "--name-only",
      "--no-renames",
      "-z",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  )
    .split("\0")
    .filter(Boolean)
}

if (process.argv.includes("--staged")) {
  if (!changedFiles(true).some(affectsPermissions)) {
    console.log(
      "No staged manifest inputs changed; skipping permission warning check.",
    )
    process.exit(0)
  }
  if (changedFiles(false).some(affectsPermissions)) {
    throw new Error(
      "Permission inputs have unstaged changes. Align them with the staged version before validating its browser warnings.",
    )
  }
}

// Always compare the current default manifest. Do not inherit another E2E
// variant's extra required permissions or a stale-build bypass from the shell.
process.env.AAH_E2E_BUILD_VARIANT = "default"
process.env.AAH_SKIP_E2E_BUILD = "0"
console.log(
  "Checking native browser permission warnings (requires pnpm e2e:install).",
)
runPnpm([
  "exec",
  "playwright",
  "test",
  "e2e/extensionPermissionWarnings.spec.ts",
  "--project=chromium",
  "--workers=1",
])

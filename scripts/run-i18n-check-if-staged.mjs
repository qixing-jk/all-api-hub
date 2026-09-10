import { execFileSync } from "node:child_process"

import { runPnpm } from "./utils/run-pnpm.mjs"

const gitCommand = process.platform === "win32" ? "git.exe" : "git"

const I18N_RELEVANT_PATH_PREFIXES = ["src/locales/", "src/public/_locales/"]
const I18N_RELEVANT_PATHS = new Set([
  "i18next.config.ts",
  "package.json",
  "pnpm-lock.yaml",
  "scripts/run-i18n-check-if-staged.mjs",
  "scripts/utils/run-pnpm.mjs",
])

/**
 * Read the currently staged file paths for the pending commit.
 * @returns Normalized staged file paths using forward slashes.
 */
function getStagedFiles() {
  const output = execFileSync(
    gitCommand,
    ["diff", "--cached", "--name-only", "-z", "--no-renames"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    },
  )

  // No rename detection: both the removed input and its destination must count.
  return output.split("\0").filter(Boolean)
}

/**
 * Determine whether any staged file should trigger the i18n extract guard.
 * @param stagedFiles Normalized staged file paths.
 * @returns True when the staged set touches i18n-relevant inputs.
 */
function shouldRunI18nCheck(stagedFiles) {
  return stagedFiles.some((file) => {
    if (I18N_RELEVANT_PATHS.has(file) || /^src\/.*\.tsx?$/.test(file)) {
      return true
    }

    return I18N_RELEVANT_PATH_PREFIXES.some((prefix) => file.startsWith(prefix))
  })
}

const stagedFiles = getStagedFiles()

if (stagedFiles.length === 0) {
  console.log("⏭️  No staged files detected, skipping i18n check.")
  process.exit(0)
}

if (!shouldRunI18nCheck(stagedFiles)) {
  console.log(
    "⏭️  No i18n-relevant staged files detected, skipping i18n check.",
  )
  process.exit(0)
}

console.log("🌐 Running staged i18n extract check...")
runPnpm(["run", "i18n:extract:ci"])

console.log("🌐 Running staged i18n status check...")
runPnpm(["run", "i18n:status"])

import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  createE2eBuildInputHash,
  readE2eBuildInputPaths,
} from "../e2e/utils/e2eBuildInputs.shared.js"
import {
  getE2eExtensionDirName,
  readE2eBuildVariant,
} from "../e2e/utils/e2eBuildVariants.shared.js"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const buildVariant = readE2eBuildVariant()
const extensionDir = path.join(
  rootDir,
  ".output",
  getE2eExtensionDirName(buildVariant),
)
const metadataPath = path.join(extensionDir, ".aah-e2e-build.json")
const inputPaths = await readE2eBuildInputPaths(rootDir)
const inputHash = await createE2eBuildInputHash(rootDir, inputPaths)

run(process.execPath, [
  path.join(rootDir, "node_modules", "wxt", "bin", "wxt.mjs"),
  "build",
  "--mode",
  "test",
])

fs.mkdirSync(extensionDir, { recursive: true })
fs.writeFileSync(
  metadataPath,
  `${JSON.stringify(
    {
      version: 1,
      buildVariant,
      gitHead: getGitHead(),
      inputHash,
      inputPaths,
      builtAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
  "utf8",
)

/**
 * Runs a child process and exits with the same status when it fails.
 * @param command Executable path or command name to run.
 * @param args Command-line arguments passed to the executable.
 */
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
  })

  if (result.status !== 0) {
    if (result.error) {
      console.error(result.error)
    }
    process.exit(result.status ?? 1)
  }
}

/**
 * Reads the current Git commit hash for the repository.
 * @returns The current HEAD hash, or "unknown" outside a Git checkout.
 */
function getGitHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: rootDir,
    encoding: "utf8",
  })

  return result.status === 0 ? result.stdout.trim() : "unknown"
}

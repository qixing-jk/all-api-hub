import { spawnSync } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

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
const inputPaths = JSON.parse(
  fs.readFileSync(path.join(rootDir, "e2e", "e2e-build-inputs.json"), "utf8"),
)

if (
  !Array.isArray(inputPaths) ||
  inputPaths.some((inputPath) => typeof inputPath !== "string")
) {
  throw new Error("e2e/e2e-build-inputs.json must be an array of strings")
}

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
      inputHash: createInputHash(),
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

/**
 * Hashes all existing E2E build inputs in deterministic path order.
 * @returns SHA-256 digest for the files that feed the test extension build.
 */
function createInputHash() {
  const hash = crypto.createHash("sha256")
  const files = collectExistingFiles(inputPaths)

  for (const filePath of files) {
    const relativePath = path
      .relative(rootDir, filePath)
      .replaceAll(path.sep, "/")
    hash.update(relativePath)
    hash.update("\0")
    hash.update(fs.readFileSync(filePath))
    hash.update("\0")
  }

  return hash.digest("hex")
}

/**
 * Collects existing files under the configured input paths.
 * @param pathsToCollect Repo-relative files or directories to include.
 * @returns Sorted absolute file paths.
 */
function collectExistingFiles(pathsToCollect) {
  const files = []

  for (const inputPath of pathsToCollect) {
    const absolutePath = path.resolve(rootDir, inputPath)

    if (!fs.existsSync(absolutePath)) {
      continue
    }

    const stat = fs.statSync(absolutePath)
    if (stat.isDirectory()) {
      files.push(...collectDirectoryFiles(absolutePath))
    } else if (stat.isFile()) {
      files.push(absolutePath)
    }
  }

  return files.sort()
}

/**
 * Recursively collects files from a directory, ignoring generated dependencies.
 * @param directoryPath Absolute directory path to scan.
 * @returns Absolute file paths under the directory.
 */
function collectDirectoryFiles(directoryPath) {
  const files = []

  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") {
      continue
    }

    const entryPath = path.join(directoryPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectDirectoryFiles(entryPath))
    } else if (entry.isFile()) {
      files.push(entryPath)
    }
  }

  return files
}

import { spawnSync } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const extensionDir = path.join(rootDir, ".output", "chrome-mv3-test")
const metadataPath = path.join(extensionDir, ".aah-e2e-build.json")
const inputPaths = JSON.parse(
  fs.readFileSync(path.join(rootDir, "e2e", "e2e-build-inputs.json"), "utf8"),
)

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
 *
 * @param command
 * @param args
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
 *
 */
function getGitHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: rootDir,
    encoding: "utf8",
  })

  return result.status === 0 ? result.stdout.trim() : "unknown"
}

/**
 *
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
 *
 * @param pathsToCollect
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
 *
 * @param directoryPath
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

import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"

import { readE2eBuildVariant } from "~~/e2e/utils/e2eBuildVariants"

import {
  createE2eBuildInputHash,
  readE2eBuildInputPaths,
} from "./e2eBuildInputs.shared.js"

const execFileAsync = promisify(execFile)

const E2E_BUILD_METADATA_FILE = ".aah-e2e-build.json"

type E2eBuildMetadata = {
  version: 1
  buildVariant?: string
  gitHead: string
  inputHash: string
  inputPaths: string[]
  builtAt: string
}

type E2eBuildMetadataSnapshot = Pick<
  E2eBuildMetadata,
  "buildVariant" | "inputHash" | "inputPaths"
> & { gitHead?: string }

type E2eBuildMetadataOptions = {
  cwd?: string
  inputPaths?: readonly string[]
}

export async function createE2eBuildMetadata(
  options: E2eBuildMetadataOptions = {},
): Promise<E2eBuildMetadata> {
  const [snapshot, gitHead] = await Promise.all([
    createE2eBuildMetadataSnapshot(options),
    getGitHead(options.cwd ?? process.cwd()),
  ])

  return {
    version: 1,
    ...snapshot,
    gitHead,
    builtAt: new Date().toISOString(),
  }
}

async function createE2eBuildMetadataSnapshot(
  options: E2eBuildMetadataOptions = {},
): Promise<E2eBuildMetadataSnapshot> {
  const cwd = options.cwd ?? process.cwd()
  const inputPaths = [
    ...(options.inputPaths ?? (await readE2eBuildInputPaths(cwd))),
  ]
  const inputHash = await createE2eBuildInputHash(cwd, inputPaths)

  return {
    buildVariant: readE2eBuildVariant(),
    inputHash,
    inputPaths,
  }
}

export async function writeE2eBuildMetadata(
  extensionDir: string,
  metadata: E2eBuildMetadata,
) {
  await fs.mkdir(extensionDir, { recursive: true })
  await fs.writeFile(
    getE2eBuildMetadataPath(extensionDir),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8",
  )
}

export async function assertE2eBuildMetadataCurrent(
  extensionDir: string,
  options: E2eBuildMetadataOptions = {},
) {
  const metadataPath = getE2eBuildMetadataPath(extensionDir)
  const metadata = await readE2eBuildMetadata(metadataPath)
  const current = await createE2eBuildMetadataSnapshot({
    cwd: options.cwd,
    inputPaths: options.inputPaths,
  })

  const mismatches = getE2eBuildMetadataMismatches(metadata, current)
  if (mismatches.length > 0) {
    throw new Error(
      [
        `Stale E2E extension build at '${extensionDir}'.`,
        ...mismatches,
        "Run 'pnpm build:e2e' before running E2E tests.",
      ].join(" "),
    )
  }
}

export async function isE2eBuildCurrent(
  extensionDir: string,
  options: E2eBuildMetadataOptions = {},
) {
  try {
    await fs.access(path.join(extensionDir, "manifest.json"))
    return await isE2eBuildMetadataCurrent(extensionDir, options)
  } catch {
    return false
  }
}

export async function isE2eBuildMetadataCurrent(
  extensionDir: string,
  options: E2eBuildMetadataOptions = {},
) {
  try {
    const metadataPath = getE2eBuildMetadataPath(extensionDir)
    const metadata = await readE2eBuildMetadata(metadataPath)
    const current = await createE2eBuildMetadataSnapshot({
      cwd: options.cwd,
      inputPaths: options.inputPaths,
    })

    return getE2eBuildMetadataMismatches(metadata, current).length === 0
  } catch {
    return false
  }
}

export function getE2eBuildMetadataMismatches(
  metadata: E2eBuildMetadata,
  current: E2eBuildMetadataSnapshot,
) {
  const mismatches: string[] = []

  // gitHead records provenance; content and build configuration determine freshness.
  if ((metadata.buildVariant ?? "default") !== current.buildVariant) {
    mismatches.push(
      `Built for E2E variant ${metadata.buildVariant ?? "default"}, current variant is ${current.buildVariant}.`,
    )
  }

  if (metadata.inputHash !== current.inputHash) {
    mismatches.push("Build inputs have changed since the extension was built.")
  }

  return mismatches
}

function getE2eBuildMetadataPath(extensionDir: string) {
  return path.join(extensionDir, E2E_BUILD_METADATA_FILE)
}

async function readE2eBuildMetadata(
  metadataPath: string,
): Promise<E2eBuildMetadata> {
  let raw: string

  try {
    raw = await fs.readFile(metadataPath, "utf8")
  } catch {
    throw new Error(
      [
        `Missing E2E build metadata at '${metadataPath}'.`,
        "Run 'pnpm build:e2e' before running E2E tests.",
      ].join(" "),
    )
  }

  try {
    const parsed = JSON.parse(raw) as Partial<E2eBuildMetadata>
    if (
      parsed.version !== 1 ||
      typeof parsed.gitHead !== "string" ||
      typeof parsed.inputHash !== "string" ||
      !Array.isArray(parsed.inputPaths) ||
      parsed.inputPaths.some((item) => typeof item !== "string")
    ) {
      throw new Error(
        "metadata is missing required fields or inputPaths must contain only strings",
      )
    }

    return parsed as E2eBuildMetadata
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Invalid E2E build metadata at '${metadataPath}': ${message}`,
    )
  }
}

async function getGitHead(cwd: string) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd,
    })
    return stdout.trim()
  } catch {
    return "unknown"
  }
}

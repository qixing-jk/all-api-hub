#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs"
import path from "node:path"

import {
  createE2eBuildInputHash,
  readE2eBuildInputPaths,
} from "../e2e/utils/e2eBuildInputs.shared.js"
import {
  getE2eExtensionDirName,
  readE2eBuildVariant,
} from "../e2e/utils/e2eBuildVariants.shared.js"

// This probe runs before installing dependencies, including on a cache hit.
const variant = readE2eBuildVariant()
const directory = getE2eExtensionDirName(variant)
const extension = path.resolve(".output", directory)
const inputPaths = await readE2eBuildInputPaths(process.cwd())
const inputHash = await createE2eBuildInputHash(process.cwd(), inputPaths)
let usable = false
try {
  const metadata = JSON.parse(
    readFileSync(path.join(extension, ".aah-e2e-build.json"), "utf8"),
  )
  const manifest = JSON.parse(
    readFileSync(path.join(extension, "manifest.json"), "utf8"),
  )
  usable = Boolean(
    metadata.version === 1 &&
      typeof metadata.gitHead === "string" &&
      metadata.buildVariant === variant &&
      typeof metadata.inputHash === "string" &&
      metadata.inputHash === inputHash &&
      manifest.manifest_version === 3,
  )
} catch {
  // Missing, partial, or malformed caches are ordinary rebuilds.
}
appendFileSync(
  process.env.GITHUB_OUTPUT,
  `extension_dir=${directory}\ninput_hash=${inputHash}\nusable=${usable}\n`,
)

import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { parseEnv } from "node:util"

import { readE2eBuildVariant } from "./e2eBuildVariants.shared.js"

const ignoredDirectories = new Set(["node_modules", ".git", ".output"])
const envFiles = [
  ".env",
  ".env.local",
  ".env.test",
  ".env.test.local",
  ".env.chrome",
  ".env.chrome.local",
  ".env.test.chrome",
  ".env.test.chrome.local",
]

/** Read the current input policy; cached metadata never selects its own inputs. */
export async function readE2eBuildInputPaths(cwd) {
  const parsed = JSON.parse(
    await fs.readFile(path.resolve(cwd, "e2e/e2e-build-inputs.json"), "utf8"),
  )
  if (
    !Array.isArray(parsed) ||
    parsed.some((item) => typeof item !== "string")
  ) {
    throw new Error("e2e/e2e-build-inputs.json must be an array of strings")
  }
  return parsed
}

/** One dependency-free fingerprint for build, cache lookup and E2E freshness. */
export async function createE2eBuildInputHash(cwd, inputPaths, options = {}) {
  const env = options.env ?? process.env
  const defaults = {}
  for (const file of envFiles) {
    try {
      Object.assign(
        defaults,
        parseEnv(await fs.readFile(path.resolve(cwd, file), "utf8")),
      )
    } catch (error) {
      if (error.code !== "ENOENT") throw error
    }
  }
  const effective = {
    ...defaults,
    ...Object.fromEntries(
      Object.entries(env).filter(([, value]) => value !== undefined),
    ),
  }
  const publicEnv = Object.fromEntries(
    Object.keys(effective)
      .filter((key) => /^(VITE_|WXT_)/u.test(key))
      .sort()
      .map((key) => [key, effective[key]]),
  )
  const sourcemap = effective.AAH_BUILD_SOURCEMAP?.trim().toLowerCase()
  const hash = crypto.createHash("sha256")
  hash.update(
    JSON.stringify({
      protocol: 2,
      mode: "test",
      browser: "chrome",
      variant: readE2eBuildVariant(env),
      node: options.nodeVersion ?? process.versions.node,
      nodeEnv: effective.NODE_ENV ?? "production",
      platform: options.platform ?? process.platform,
      arch: options.arch ?? process.arch,
      sourcemap: sourcemap === "1" || sourcemap === "true",
      publicEnv,
      inputPaths: [...inputPaths].sort(),
    }),
  )
  const files = new Set()
  for (const inputPath of inputPaths)
    await collect(path.resolve(cwd, inputPath), files)
  for (const file of [...files].sort()) {
    hash.update(path.relative(cwd, file).replaceAll(path.sep, "/"))
    hash.update("\0")
    hash.update(await fs.readFile(file))
    hash.update("\0")
  }
  return hash.digest("hex")
}

async function collect(file, files, knownStat) {
  let stat = knownStat
  if (!stat) {
    try {
      stat = await fs.lstat(file)
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") return
      throw error
    }
  }
  if (stat.isSymbolicLink())
    throw new Error("E2E build inputs must not contain symlinks: " + file)
  if (stat.isFile()) files.add(file)
  else if (stat.isDirectory()) {
    for (const entry of await fs.readdir(file, { withFileTypes: true })) {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue
      await collect(path.join(file, entry.name), files, entry)
    }
  }
}

#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  filterRealSiteE2eMatrix,
  normalizeRealSiteE2eCategory,
} from "./real-site-e2e-matrix.mjs"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const firstArg = process.argv[2]

if (firstArg === "--help" || firstArg === "-h") {
  printUsage()
  process.exit(0)
}

const { category, extraPlaywrightArgs } = parseArgs(process.argv.slice(2))

if (category === "--help" || category === "-h") {
  printUsage()
  process.exit(0)
}

const normalizedCategory = normalizeRealSiteE2eCategory(category)
const entries = filterRealSiteE2eMatrix(normalizedCategory)
let shouldReuseBuild = false

for (const entry of entries) {
  console.log(`\n=== Real-site E2E: ${entry.label} ===`)
  runPnpm(
    [
      "exec",
      "playwright",
      "test",
      entry.spec,
      "--project=chromium",
      "--reporter=list",
      ...buildEntryPlaywrightArgs(entry, extraPlaywrightArgs),
    ],
    buildEntryEnv(entry, { skipBuild: shouldReuseBuild }),
  )
  shouldReuseBuild = true
}

function parseArgs(args) {
  const separatorIndex = args.indexOf("--")
  const ownArgs = separatorIndex === -1 ? args : args.slice(0, separatorIndex)
  const separatorExtraArgs =
    separatorIndex === -1 ? [] : args.slice(separatorIndex + 1)
  const [firstArg, ...restArgs] = ownArgs
  const firstArgIsPlaywrightFlag = firstArg?.startsWith("-") ?? false

  return {
    category: firstArg && !firstArgIsPlaywrightFlag ? firstArg : "all",
    extraPlaywrightArgs: [
      ...(firstArgIsPlaywrightFlag ? [firstArg, ...restArgs] : restArgs),
      ...separatorExtraArgs,
    ],
  }
}

function buildEntryPlaywrightArgs(entry, extraPlaywrightArgs) {
  if (
    entry.kind !== "managed-site" ||
    hasPlaywrightArg(extraPlaywrightArgs, "--workers")
  ) {
    return extraPlaywrightArgs
  }

  return ["--workers=1", ...extraPlaywrightArgs]
}

function hasPlaywrightArg(args, name) {
  return args.some((arg) => arg === name || arg.startsWith(`${name}=`))
}

function buildEntryEnv(entry, options = {}) {
  const env = {
    ...process.env,
    AAH_E2E_REAL_SITE_CATEGORY: entry.category,
  }

  if (options.skipBuild) {
    env.AAH_SKIP_E2E_BUILD = "1"
  }

  if (entry.kind === "managed-site" && entry.managed_site_target) {
    env.AAH_E2E_MANAGED_SITE_TARGET = entry.managed_site_target
  }

  if (entry.kind === "webdav") {
    env.AAH_E2E_WEBDAV_PROVIDER_PREFIX = entry.env_prefix
    env.AAH_E2E_WEBDAV_PROVIDER_NAME = entry.provider_name
    env.AAH_E2E_WEBDAV_ACCOUNT_PREFIX = entry.provider_account_prefix
  }

  return env
}

function runPnpm(args, env) {
  const result =
    typeof process.env.npm_execpath === "string" && process.env.npm_execpath
      ? spawnSync(process.execPath, [process.env.npm_execpath, ...args], {
          cwd: rootDir,
          env,
          stdio: "inherit",
        })
      : spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", args, {
          cwd: rootDir,
          env,
          stdio: "inherit",
        })

  if (result.status !== 0) {
    if (result.error) {
      console.error(result.error)
    }
    process.exit(result.status ?? 1)
  }
}

function printUsage() {
  console.log(`Usage:
  pnpm e2e:real-site
  pnpm e2e:real-site:account
  pnpm e2e:real-site:managed-site
  pnpm e2e:real-site:webdav
  pnpm e2e:real-site:category account -- --headed

Categories:
  all
  account
  managed-site
  webdav`)
}

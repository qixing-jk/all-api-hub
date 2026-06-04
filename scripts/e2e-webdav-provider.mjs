import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const webdavSpec = "e2e/realSite/webdavProviderFlow.spec.ts"

const providerAliases = new Map([
  [
    "nutstore",
    {
      providerPrefix: "NUTSTORE_WEBDAV",
      providerName: "Nutstore",
      accountPrefix: "nutstore",
    },
  ],
])

const { providerArg, extraPlaywrightArgs } = parseArgs(process.argv.slice(2))

if (providerArg === "--help" || providerArg === "-h") {
  printUsage()
  process.exit(0)
}

const provider = resolveProvider(providerArg)
const env = {
  ...process.env,
  AAH_E2E_WEBDAV_PROVIDER_PREFIX: provider.providerPrefix,
  AAH_E2E_WEBDAV_PROVIDER_NAME: provider.providerName,
  AAH_E2E_WEBDAV_ACCOUNT_PREFIX: provider.accountPrefix,
}

runPnpm([
  "exec",
  "playwright",
  "test",
  webdavSpec,
  "--project=chromium",
  "--reporter=list",
  ...extraPlaywrightArgs,
])

function parseArgs(args) {
  const separatorIndex = args.indexOf("--")
  const providerArgs =
    separatorIndex === -1 ? args : args.slice(0, separatorIndex)
  const extraPlaywrightArgs =
    separatorIndex === -1 ? [] : args.slice(separatorIndex + 1)

  return {
    providerArg: providerArgs[0],
    extraPlaywrightArgs,
  }
}

function resolveProvider(providerArg = "nutstore") {
  const alias = providerAliases.get(providerArg.toLowerCase())
  if (alias) {
    return alias
  }

  const providerPrefix = normalizeProviderPrefix(providerArg)
  const providerName = toTitleCase(
    providerPrefix.replace(/_?WEBDAV$/u, "").replaceAll("_", " "),
  )
  const accountPrefix = providerPrefix
    .toLowerCase()
    .replace(/_?webdav$/u, "")
    .replaceAll("_", "-")

  return {
    providerPrefix,
    providerName,
    accountPrefix,
  }
}

function normalizeProviderPrefix(providerArg) {
  if (!providerArg || providerArg.startsWith("-")) {
    printUsage()
    process.exit(1)
  }

  const providerPrefix = providerArg
    .trim()
    .replace(/[^a-zA-Z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .toUpperCase()

  if (!providerPrefix) {
    printUsage()
    process.exit(1)
  }

  return providerPrefix.endsWith("_WEBDAV")
    ? providerPrefix
    : `${providerPrefix}_WEBDAV`
}

function toTitleCase(value) {
  return value
    .toLowerCase()
    .split(/\s+/u)
    .filter(Boolean)
    .map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
    .join(" ")
}

function runPnpm(args) {
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
  pnpm e2e:real-site:webdav
  pnpm e2e:real-site:webdav nutstore
  pnpm e2e:real-site:nutstore
  pnpm e2e:real-site:webdav CUSTOM_WEBDAV -- --headed

The provider argument selects AAH_E2E_<PROVIDER>_URL, USERNAME, and PASSWORD
from .env, .env.local, or the shell environment. No argument defaults to
Nutstore.`)
}

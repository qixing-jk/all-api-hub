import fs from "node:fs"
import path from "node:path"

type LoadPlaywrightEnvFilesOptions = {
  cwd?: string
  env?: NodeJS.ProcessEnv
}

const PLAYWRIGHT_ENV_FILES = [".env", ".env.local"] as const

/**
 * Load local `.env` files for Playwright runs without introducing a new
 * dependency.
 *
 * Environment variables that already existed before loading still win over file
 * values, while `.env.local` is allowed to override `.env`.
 */
export function loadPlaywrightEnvFiles(
  options: LoadPlaywrightEnvFilesOptions = {},
) {
  const cwd = options.cwd ?? process.cwd()
  const env = options.env ?? process.env
  const protectedKeys = new Set(Object.keys(env))

  for (const fileName of PLAYWRIGHT_ENV_FILES) {
    const filePath = path.resolve(cwd, fileName)
    if (!fs.existsSync(filePath)) {
      continue
    }

    applyPlaywrightEnvFile(
      fs.readFileSync(filePath, "utf8"),
      env,
      protectedKeys,
    )
  }
}

function applyPlaywrightEnvFile(
  fileContents: string,
  env: NodeJS.ProcessEnv,
  protectedKeys: ReadonlySet<string>,
) {
  for (const line of fileContents.split(/\r?\n/u)) {
    const trimmedLine = line.trim()
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue
    }

    const separatorIndex = trimmedLine.indexOf("=")
    if (separatorIndex <= 0) {
      continue
    }

    const rawKey = trimmedLine.slice(0, separatorIndex).trim()
    if (!rawKey || protectedKeys.has(rawKey)) {
      continue
    }

    const rawValue = trimmedLine.slice(separatorIndex + 1).trim()
    env[rawKey] = stripWrappingQuotes(rawValue)
  }
}

function stripWrappingQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

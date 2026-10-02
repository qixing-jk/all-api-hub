import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseEnv } from "node:util"

const repoRoot = fileURLToPath(new URL("../../", import.meta.url))

/**
 * Load Node tooling configuration: shared local values, checkout files, then
 * the original process environment. Returns source paths without secret values.
 * WXT keeps its own mode/browser loading; shared client-visible prefixes are
 * excluded so test credentials cannot become build inputs through inheritance.
 * @param options Checkout and environment to load.
 * @returns Loaded source paths and selected shared directory.
 */
export function loadLocalEnv(options = {}) {
  const cwd = path.resolve(options.cwd ?? repoRoot)
  const env = options.env ?? process.env
  const protectedKeys = new Set(
    Object.keys(env).filter((key) => env[key] !== undefined),
  )
  const sharedEnabled = !env.CI && env.AAH_SHARED_ENV !== "0"
  const explicitDir = env.AAH_SHARED_ENV_DIR?.trim()
  const sharedDir = sharedEnabled
    ? explicitDir
      ? path.resolve(cwd, explicitDir)
      : findPrimaryWorktree(cwd)
    : null
  const sources = []
  if (sharedDir && path.relative(cwd, sharedDir) !== "") {
    sources.push({
      file: path.join(sharedDir, ".env.local"),
      shared: true,
      required: !!explicitDir,
    })
  }
  sources.push(
    { file: path.join(cwd, ".env"), shared: false, required: false },
    {
      file: path.join(cwd, ".env.local"),
      shared: false,
      required: !!explicitDir && sharedDir === cwd,
    },
  )
  if (options.envFile) {
    sources.push({
      file: path.resolve(cwd, options.envFile),
      shared: false,
      required: true,
    })
  }

  const values = {}
  const files = []
  for (const { file, shared, required } of sources) {
    let contents
    try {
      contents = readFileSync(file, "utf8")
    } catch (error) {
      if (error.code === "ENOENT" && !required) continue
      throw new Error(
        `Cannot read ${shared ? "shared " : ""}env file: ${file}`,
        { cause: error },
      )
    }
    files.push(file)
    // Node >=24 owns dotenv parsing, including quoted hashes and multiline
    // values. Deliberately no shell evaluation or variable interpolation.
    for (const [key, value] of Object.entries(parseEnv(contents))) {
      if (protectedKeys.has(key)) continue
      if (shared && /^(?:WXT_|VITE_)/u.test(key)) continue
      values[key] = value
    }
  }
  Object.assign(env, values)
  return { files, sharedDir }
}

/**
 * Find Git's primary checkout while isolating the caller's repository variables.
 * @param cwd Checkout whose worktree list should be inspected.
 * @returns Primary checkout path, or null for unavailable or bare repositories.
 */
function findPrimaryWorktree(cwd) {
  try {
    // Hooks export repository-local Git variables. Clear Git's own list before
    // using -C, so a caller's repository/index cannot redirect this lookup.
    const gitOptions = {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    }
    const gitEnv = { ...process.env }
    const localKeys = execFileSync(
      "git",
      ["rev-parse", "--local-env-vars"],
      gitOptions,
    )
    for (const key of localKeys.trim().split(/\r?\n/u)) delete gitEnv[key]
    // Git guarantees the main worktree is first. NUL output preserves spaces,
    // newlines and Windows paths; its current branch does not determine ownership.
    const output = execFileSync(
      "git",
      ["-C", cwd, "worktree", "list", "--porcelain", "-z"],
      { ...gitOptions, env: gitEnv },
    )
    const firstRecord = output.split("\0\0")[0].split("\0")
    if (firstRecord.includes("bare")) return null
    const worktree = firstRecord.find((line) => line.startsWith("worktree "))
    return worktree ? path.resolve(worktree.slice("worktree ".length)) : null
  } catch {
    // Archives, ordinary checkout copies and machines without Git remain usable.
    return null
  }
}

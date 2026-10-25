import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { isUserDataDirInUse } from "./dev-browser-identity.mjs"

/**
 * Inventory of the automation browsers and their profiles.
 *
 * Debug browsers outlive the worktrees that started them: each isolated profile
 * keeps a full Chromium user data directory (hundreds of megabytes of caches,
 * shaders and component blobs), and a forgotten instance keeps a port, a window
 * and its memory. This module reads the running processes and the profile
 * directories so the launcher can report both and reclaim what is dead.
 */

/** Directory names holding only rebuildable browser data. */
const REGENERABLE_ENTRIES = [
  "component_crx_cache",
  "ProvenanceData",
  "ProvenanceDataAllowList",
  "ProvenanceDataTensors",
  "GrShaderCache",
  "ShaderCache",
  "GPUPersistentCache",
  "BrowserMetrics",
  "DeferredBrowserMetrics",
  "Crashpad",
  "Snapshots",
  "GraphiteDawnCache",
]

/**
 * Names this tooling generates for isolated profiles. Only these are ever
 * reaped: a hand-picked name (`dev-browser-daily`, `edge-dev`) is somebody's
 * deliberate profile and is reported, never deleted.
 */
const GENERATED_PROFILE_NAME = /^dev-browser-.+-[a-f0-9]{16}$/u

/** Chromium aborts if a component cache disappears mid-start, so keep fresh ones. */
const MIN_PRUNE_AGE_MS = 24 * 60 * 60 * 1000

const DEV_PROFILE_DIR_PREFIX = "dev-browser"
/** Absolute checkout root recorded in the extension path of a mounted build. */
const OUTPUT_DIR_SUFFIX = ".output"

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"]

/** Human-readable size, at most two decimals, for launcher output. */
export function describeBytes(bytes) {
  let value = typeof bytes === "number" && Number.isFinite(bytes) ? bytes : 0
  let unit = 0
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit += 1
  }

  // Whole bytes stay whole and larger units keep at most two decimals, with the
  // trailing zero trimmed except for the `x.0` case.
  if (unit === 0) return `${Math.round(value)} ${BYTE_UNITS[unit]}`
  const text = value.toFixed(2).replace(/0$/u, "")
  return `${text} ${BYTE_UNITS[unit]}`
}

/**
 * Split a launch command line into tokens. Quotes are dropped while their
 * contents stay in the token, because Chromium writes values containing spaces
 * as `--flag="C:\Users\My Name\..."` — one token, not three.
 */
function tokenizeCommandLine(commandLine) {
  const tokens = []
  let current = ""
  let quoted = false
  let escaped = false
  for (const character of typeof commandLine === "string" ? commandLine : "") {
    if (escaped) {
      current += character
      escaped = false
      continue
    }
    if (character === "\\") {
      escaped = true
      current += character
      continue
    }
    if (character === '"') {
      quoted = !quoted
      continue
    }
    if (!quoted && /\s/u.test(character)) {
      if (current) tokens.push(current)
      current = ""
      continue
    }
    current += character
  }
  if (current) tokens.push(current)

  return tokens
}

/** Value of a repeated `--flag=value` or `--flag value` switch. */
function readFlagValues(tokens, flag) {
  const values = []
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === flag) {
      const next = tokens[index + 1]
      if (next && !next.startsWith("--")) values.push(next)
    } else if (token.startsWith(`${flag}=`)) {
      values.push(token.slice(flag.length + 1))
    }
  }

  return values
}

/**
 * What a process command line says about a debug browser, or null when it is
 * not one: a renderer child inherits the switches but serves no CDP endpoint,
 * and a browser without both a port and a profile cannot be identified.
 */
export function parseDebugBrowserProcessCommandLine(commandLine) {
  const tokens = tokenizeCommandLine(commandLine)
  if (tokens.length === 0) return null
  if (readFlagValues(tokens, "--type").length > 0) return null

  const [portValue] = readFlagValues(tokens, "--remote-debugging-port")
  const port = Number(portValue)
  if (!Number.isInteger(port) || port <= 0) return null

  const [userDataDir] = readFlagValues(tokens, "--user-data-dir")
  if (!userDataDir) return null

  return {
    port,
    userDataDir: path.resolve(userDataDir),
    extensionDirs: readFlagValues(tokens, "--load-extension").flatMap((value) =>
      value.split(path.delimiter).filter(Boolean),
    ),
  }
}

/** Browser processes launched with CDP, largest port first. */
export async function listDebugBrowserProcesses(deps = {}) {
  const readProcesses = deps.readProcesses ?? readHostProcesses
  const processes = await readProcesses()
  return processes
    .map((entry) => {
      const parsed = parseDebugBrowserProcessCommandLine(entry.commandLine)
      return parsed ? { pid: entry.pid, ...parsed } : null
    })
    .filter(Boolean)
    .sort((left, right) => left.port - right.port)
}

/** OS process list: command lines on Windows, argv elsewhere. */
async function readHostProcesses() {
  if (process.platform === "win32") {
    const script = [
      "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe' or Name='chrome.exe' or Name='brave.exe' or Name='chromium.exe'\"",
      '| ForEach-Object { "$($_.ProcessId)`t$($_.CommandLine)" }',
    ].join(" ")
    const output = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-Command", script],
      {
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: 32 * 1024 * 1024,
      },
    )
    return output
      .split(/\r?\n/u)
      .map((line) => line.split("\t"))
      .filter((parts) => parts.length === 2 && parts[1])
      .map(([pid, commandLine]) => ({ pid: Number(pid), commandLine }))
  }

  const output = execFileSync("ps", ["-A", "-o", "pid=,command="], {
    encoding: "utf8",
  })
  return output
    .split(/\r?\n/u)
    .map((line) => /^\s*(\d+)\s+(.*)$/u.exec(line))
    .filter(Boolean)
    .map((match) => ({ pid: Number(match[1]), commandLine: match[2] }))
}

/**
 * Checkout roots a profile has mounted builds from.
 *
 * Every profile directory inside the user data dir is read, not just `Default`:
 * a copied or reused profile keeps its extensions in `Profile 1`/`Profile 2`,
 * and reading only `Default` would report "no checkout ever used this" for a
 * profile that is very much in use.
 */
export function collectProfileWorktrees(profileDir) {
  return readProfileOwnership(profileDir).worktrees
}

/** Keep incomplete ownership distinct from an empty, successfully read profile. */
function readProfileOwnership(profileDir) {
  const worktrees = new Set()
  let complete = true
  let entries
  try {
    entries = fs.readdirSync(profileDir, { withFileTypes: true })
  } catch {
    return { worktrees: [], complete: false }
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name !== "Default" && !entry.name.startsWith("Profile")) continue
    let readAny = false
    for (const file of ["Secure Preferences", "Preferences"]) {
      let state
      try {
        state = readJsonFile(path.join(profileDir, entry.name, file))
      } catch {
        complete = false
        continue
      }
      if (state !== undefined) readAny = true
      const settings = state?.extensions?.settings
      if (!settings || typeof settings !== "object") continue
      for (const extension of Object.values(settings)) {
        const extensionPath = extension?.path
        if (typeof extensionPath !== "string" || !extensionPath) continue
        const outputDir = path.dirname(extensionPath)
        if (path.basename(outputDir) !== OUTPUT_DIR_SUFFIX) continue
        worktrees.add(path.dirname(outputDir))
      }
    }
    if (!readAny) complete = false
  }

  return { worktrees: [...worktrees], complete }
}

/**
 * Every debug profile on this machine with what it costs and whether anything
 * still owns it, largest first.
 *
 * `orphan` means this tooling generated the profile's name, nothing is using it,
 * and every checkout it recorded mounting is gone. A profile that is running
 * right now, the shared profile, a hand-named profile, and a profile whose
 * contents could not be read are never reported as orphaned.
 */
export function classifyDevProfiles({
  profilesBaseDir,
  runningUserDataDirs = [],
  exists = (target) => fs.existsSync(target),
} = {}) {
  const resolvedRunning = new Set(
    runningUserDataDirs.map((dir) => samePath(dir)),
  )
  const profiles = []
  for (const entry of readDirectory(profilesBaseDir)) {
    if (
      !entry.isDirectory() ||
      !entry.name.startsWith(DEV_PROFILE_DIR_PREFIX)
    ) {
      continue
    }
    const profileDir = path.join(profilesBaseDir, entry.name)
    const { worktrees, complete } = readProfileOwnership(profileDir)
    const inUse =
      resolvedRunning.has(samePath(profileDir)) ||
      isUserDataDirInUse(profileDir)
    const shared = entry.name === DEV_PROFILE_DIR_PREFIX
    const generated = GENERATED_PROFILE_NAME.test(entry.name)
    const missing = worktrees.filter((worktree) => !exists(worktree))
    profiles.push({
      name: entry.name,
      dir: profileDir,
      worktrees,
      missingWorktrees: missing,
      sizeBytes: measureDirectory(profileDir),
      inUse,
      shared,
      generated,
      // Three conditions, all required before anything may be deleted: this
      // tooling named it, nothing is using it, and it recorded checkouts that
      // have all since disappeared. An unreadable or unrecorded profile is
      // unknown, not dead.
      orphan:
        complete &&
        !inUse &&
        !shared &&
        generated &&
        worktrees.length > 0 &&
        missing.length === worktrees.length,
    })
  }

  return profiles.sort((left, right) => right.sizeBytes - left.sizeBytes)
}

/**
 * Inventory report for the launcher: the browsers running right now, what each
 * one costs on disk, and which of them nothing owns any more.
 */
export function formatDebugBrowserReport({ processes, profiles }) {
  const runningPorts = new Map(
    processes.map((process) => [samePath(process.userDataDir), process.port]),
  )
  const lines = [`🖥️  运行中的调试浏览器: ${processes.length} 个`]
  for (const process of processes) {
    const profile = profiles.find(
      (entry) => samePath(entry.dir) === samePath(process.userDataDir),
    )
    const worktrees = (profile?.worktrees ?? []).map((dir) =>
      path.basename(dir),
    )
    lines.push(
      `   :${process.port}  ${path.basename(process.userDataDir)}  PID ${process.pid}  ${
        worktrees.length > 0 ? worktrees.join(", ") : "未挂载本仓库产物"
      }${profile?.orphan ? "  ⚠️ orphan: worktree 已删除" : ""}`,
    )
  }

  const idle = profiles.filter(
    (profile) => !runningPorts.has(samePath(profile.dir)),
  )
  const reclaimable = idle.filter((profile) => profile.orphan)
  const totalBytes = profiles.reduce(
    (sum, profile) => sum + profile.sizeBytes,
    0,
  )
  lines.push(
    `💾 Profile 共 ${profiles.length} 个，占用 ${describeBytes(totalBytes)}`,
  )
  for (const profile of idle) {
    const notes = []
    if (profile.orphan) notes.push("⚠️ orphan")
    else if (profile.missingWorktrees?.length > 0)
      notes.push("⚠️ 部分 worktree 已删除")
    if (!profile.generated && !profile.shared)
      notes.push("手工命名，不自动清理")
    lines.push(
      `   ${describeBytes(profile.sizeBytes).padStart(9)}  ${profile.name}${
        notes.length > 0 ? `  ${notes.join("  ")}` : ""
      }`,
    )
  }
  lines.push(
    reclaimable.length > 0
      ? `🧹 可回收: ${reclaimable.length} 个孤立的 profile（${describeBytes(
          reclaimable.reduce((sum, profile) => sum + profile.sizeBytes, 0),
        )}），运行 --prune-profiles 删除`
      : `🧹 孤立 profile: 没有（没有可回收的整份 profile）`,
  )
  lines.push(
    [
      "ℹ️ 删除 profile 会连同其中的站点登录态与扩展数据一起删除。可恢复的部分：",
      "   账户数据 ← pnpm browser:sync，网站会话与 Local Storage ← 同上加 --cookies，",
      "   源在已登录的日常浏览器里（browser:sync --list 可列出）。",
      "   不可恢复的部分：该 profile 里的浏览历史、已装扩展、",
      "   以及任何从未同步回日常浏览器的本地数据。",
    ].join("\n"),
  )

  return lines.join("\n")
}

/**
 * What a maintenance run is allowed to do, separate from doing it.
 *
 * Reporting is always safe, so orphans are always reported. Deleting a whole
 * profile is not: it also discards the site logins and extension data the
 * profile accumulated, which no cache cleanup brings back, so it happens only
 * under the explicit switch. The cache prune applies to every closed profile
 * because a browser rebuilds those entries on its next start.
 */
export function planProfileCleanup(profiles, { pruneProfiles = false } = {}) {
  const closed = profiles.filter((profile) => !profile.inUse)
  const orphans = closed.filter((profile) => profile.orphan)

  return {
    closedProfiles: closed,
    orphans,
    deleteProfiles: pruneProfiles ? orphans : [],
    pruneCacheTargets: closed,
  }
}

/** Delete the caches a profile rebuilds on its next start, keeping its data. */
export function pruneProfileCaches(
  profileDir,
  { now = Date.now, olderThanMs = MIN_PRUNE_AGE_MS } = {},
) {
  const removed = []
  let freedBytes = 0
  for (const name of REGENERABLE_ENTRIES) {
    // Discovery is only a snapshot: the browser may have started since then.
    if (isUserDataDirInUse(profileDir)) break
    const target = path.join(profileDir, name)
    const stats = safeStat(target)
    if (!stats) continue

    const age = now() - stats.mtimeMs
    if (age < olderThanMs) continue

    const bytes = measureDirectory(target)
    if (isUserDataDirInUse(profileDir)) break
    if (!removeProfileDir(target)) continue
    freedBytes += bytes
    removed.push({ name, mtimeMs: stats.mtimeMs })
  }

  return { removed, freedBytes }
}

/** Remove a directory tree; false when it is missing or still there after. */
export function removeProfileDir(target) {
  if (!safeStat(target)) return false
  if (isUserDataDirInUse(target)) return false
  try {
    fs.rmSync(target, { recursive: true, force: true })
  } catch {
    return false
  }
  return !safeStat(target)
}

/** Size of a file or directory tree, ignoring entries that vanish mid-walk. */
function measureDirectory(target) {
  let total = 0
  const walk = (current) => {
    const stats = safeStat(current)
    if (!stats) return
    if (!stats.isDirectory()) {
      total += stats.size
      return
    }
    for (const entry of readDirectory(current)) {
      walk(path.join(current, entry.name))
    }
  }
  walk(target)
  return total
}

function readDirectory(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch (error) {
    if (error.code === "ENOENT") return undefined
    throw error
  }
}

/** Missing paths inside a profile are normal; permission errors are not. */
function safeStat(target) {
  try {
    return fs.statSync(target)
  } catch {
    return undefined
  }
}

/** Case- and separator-insensitive comparison, since paths arrive from a CLI. */
function samePath(value) {
  const resolved = path.resolve(value)
  return process.platform === "win32" ? resolved.toLowerCase() : resolved
}

/**
 * Base directory holding every dev profile, shared with the launcher.
 *
 * `AAH_DEV_PROFILES_BASE_DIR` overrides it so maintenance runs can be exercised
 * against a scratch directory instead of the real profiles.
 */
export function devProfilesBaseDir() {
  if (process.env.AAH_DEV_PROFILES_BASE_DIR) {
    return path.resolve(process.env.AAH_DEV_PROFILES_BASE_DIR)
  }
  const home = os.homedir()
  if (process.platform === "win32") {
    return path.join(
      process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"),
      "AllApiHub",
    )
  }
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "AllApiHub")
  }
  return path.join(home, ".config", "all-api-hub")
}

import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..", "..")

/** Name of the current worktree (the last path segment of the checkout). */
export const WORKTREE_NAME = path.basename(repoRoot)

const SHARED_PROFILE_NAME = "dev-browser"
const DEFAULT_CDP_PORT = 9222

/**
 * Whether the caller requested an isolated, per-worktree dev profile.
 *
 * Accepted sources, in order: the `AAH_DEV_PROFILE_PER_WORKTREE` environment
 * variable (values `1`, `true`, or any truthy value) or the `AAH_ISOLATE_PROFILE`
 * variable (`1`/`true`). A dedicated `--isolate` CLI flag in the launcher sets
 * the environment variable before calling into this module.
 */
export function isIsolatedDevProfile() {
  const flag = process.env.AAH_DEV_PROFILE_PER_WORKTREE
  if (flag !== undefined) {
    return flag !== "" && flag !== "0" && flag.toLowerCase() !== "false"
  }
  const legacy = process.env.AAH_ISOLATE_PROFILE
  return legacy === "1" || legacy === "true"
}

/**
 * Cross-platform base directory that holds all All API Hub dev profiles.
 * `${base}/dev-browser` is the shared profile; an isolated profile is named
 * `${base}/dev-browser-<worktree>` so concurrent worktrees never share state.
 */
function devProfilesBaseDir() {
  const home = os.homedir()
  const platform = os.platform()
  if (platform === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA || path.join(home, "AppData", "Local")
    return path.join(localAppData, "AllApiHub")
  } else if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", "AllApiHub")
  }
  return path.join(home, ".config", "all-api-hub")
}

/**
 * Resolve the dev browser user-data directory.
 *
 * `AAH_DEV_PROFILE_DIR` always wins (explicit override). Otherwise the return
 * is the shared profile by default, or a per-worktree isolated profile when
 * `AAH_DEV_PROFILE_PER_WORKTREE` is enabled. This is the canonical resolver:
 * launcher and sync both read the same directory so a synced profile is the
 * one the isolated browser actually uses.
 */
export function resolveDevProfileDir() {
  if (process.env.AAH_DEV_PROFILE_DIR) {
    return path.resolve(process.env.AAH_DEV_PROFILE_DIR)
  }
  const base = devProfilesBaseDir()
  if (!isIsolatedDevProfile()) {
    return path.join(base, SHARED_PROFILE_NAME)
  }
  return path.join(base, `${SHARED_PROFILE_NAME}-${WORKTREE_NAME}`)
}

/**
 * Seed isolation from a CLI flag list so every later resolution in this process
 * (profile dir and CDP port) agrees. Call this before reading either value.
 * Returns whether the flag was present.
 */
export function applyIsolateFlag(args) {
  if (Array.isArray(args) && args.includes("--isolate")) {
    process.env.AAH_DEV_PROFILE_PER_WORKTREE = "1"
    return true
  }
  return false
}

/** Stable small hash (xorshift-ish) for deriving a per-worktree CDP port. */
function worktreeHash() {
  let h = 0
  for (let i = 0; i < WORKTREE_NAME.length; i++) {
    h = (h * 31 + WORKTREE_NAME.charCodeAt(i)) >>> 0
  }
  return h
}

/**
 * Resolve the CDP port for the debug browser.
 *
 * `CDP_PORT` always wins. In an isolated profile the default is offset by the
 * worktree name so concurrent worktrees answer on distinct ports and never
 * fight over the shared 9222; the shared profile stays on 9222.
 */
export function resolveCdpPort() {
  if (process.env.CDP_PORT) {
    const port = Number(process.env.CDP_PORT)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("CDP_PORT must be an integer between 1 and 65535")
    }
    return port
  }
  if (!isIsolatedDevProfile()) {
    return DEFAULT_CDP_PORT
  }
  // Keep the shared port untouched. Explicit CDP_PORT resolves hash collisions.
  return DEFAULT_CDP_PORT + 1 + (worktreeHash() % 200)
}

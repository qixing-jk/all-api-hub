// Node config loaders (including Knip) do not resolve tsconfig path aliases.
import {
  loadLocalEnv,
  type LocalEnvOptions,
} from "../../scripts/utils/local-env.mjs"

/**
 * Load Playwright's local Node configuration using the shared worktree policy.
 * Existing shell/CI values win over checkout files and primary local defaults.
 * @param options Checkout and environment to load.
 */
export function loadPlaywrightEnvFiles(options: LocalEnvOptions = {}) {
  return loadLocalEnv(options)
}

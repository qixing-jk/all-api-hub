import { execFileSync } from "node:child_process"

/**
 * Resolve pnpm's script entry point or native executable from npm_execpath.
 * @param args pnpm arguments.
 * @param npmExecPath Entry point exported by the current package manager.
 */
export function getPnpmInvocation(
  args,
  npmExecPath = process.env.npm_execpath,
) {
  if (!npmExecPath) return null
  return /\.[cm]?js$/i.test(npmExecPath)
    ? { command: process.execPath, args: [npmExecPath, ...args] }
    : { command: npmExecPath, args }
}

/**
 * Resolve how to run pnpm, falling back to a PATH lookup when the current
 * process exports no package-manager entry point.
 * @param args pnpm arguments, never user input or Git paths.
 * @param npmExecPath Entry point exported by the current package manager.
 * @param platform Platform whose process-spawning rules apply.
 * @returns The executable and arguments to run.
 */
export function resolvePnpmInvocation(
  args,
  npmExecPath = process.env.npm_execpath,
  platform = process.platform,
) {
  const exported = getPnpmInvocation(args, npmExecPath)
  if (exported) return exported
  // Windows resolves neither a `.cmd` shim nor a bare PATH name without a shell.
  return platform === "win32"
    ? { command: "cmd.exe", args: ["/d", "/s", "/c", "pnpm", ...args] }
    : { command: "pnpm", args }
}

/**
 * Run fixed, repository-owned pnpm arguments, propagating gate failures.
 * @param args pnpm arguments, never user input or Git paths.
 */
export function runPnpm(args) {
  const invocation = resolvePnpmInvocation(args)
  execFileSync(invocation.command, invocation.args, {
    stdio: "inherit",
  })
}

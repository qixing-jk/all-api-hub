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
 * Run fixed, repository-owned pnpm arguments, propagating gate failures.
 * @param args pnpm arguments, never user input or Git paths.
 */
export function runPnpm(args) {
  const invocation = getPnpmInvocation(args)
  if (invocation) {
    execFileSync(invocation.command, invocation.args, {
      stdio: "inherit",
    })
  } else if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", `pnpm ${args.join(" ")}`], {
      stdio: "inherit",
    })
  } else {
    execFileSync("pnpm", args, { stdio: "inherit" })
  }
}

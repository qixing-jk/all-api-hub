export interface PnpmInvocation {
  command: string
  args: string[]
}

/**
 * Resolve pnpm's script entry point or native executable from npm_execpath.
 * @param args pnpm arguments, never user input or Git paths.
 * @param npmExecPath Entry point exported by the current package manager.
 * @returns The invocation to run, or null when no entry point is exported.
 */
export function getPnpmInvocation(
  args: string[],
  npmExecPath?: string,
): PnpmInvocation | null

/**
 * Resolve how to run pnpm, falling back to a PATH lookup when the current
 * process exports no package-manager entry point.
 * @param args pnpm arguments, never user input or Git paths.
 * @param npmExecPath Entry point exported by the current package manager.
 * @param platform Platform whose process-spawning rules apply.
 * @returns The executable and arguments to run.
 */
export function resolvePnpmInvocation(
  args: string[],
  npmExecPath?: string,
  platform?: NodeJS.Platform,
): PnpmInvocation

/**
 * Run fixed, repository-owned pnpm arguments, propagating gate failures.
 * @param args pnpm arguments, never user input or Git paths.
 */
export function runPnpm(args: string[]): void

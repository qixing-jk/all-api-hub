export interface PnpmInvocation {
  command: string
  args: string[]
}

/** Resolve the current package manager's executable and arguments. */
export function getPnpmInvocation(
  args: string[],
  npmExecPath?: string,
): PnpmInvocation | null

/** Run fixed, repository-owned pnpm arguments. */
export function runPnpm(args: string[]): void

export function main(
  args?: string[],
): Promise<import("./cdp/live-suites.mjs").LiveSuiteReport>
export function parseArgs(args: string[]): {
  token: string
  refreshToken: string
  organizationId: string
  suite: string
  cdpUrl: string
  siteUrl: string
  siteType: string
}

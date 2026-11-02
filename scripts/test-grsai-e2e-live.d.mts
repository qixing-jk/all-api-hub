export function main(
  args?: string[],
): Promise<import("./cdp/live-suites.mjs").LiveSuiteReport>
export function parseArgs(args: string[]): {
  siteUrl: string
  token: string
  suite: string
  cdpUrl: string
}

import type { LiveSuiteReport } from "./cdp/live-suites.mjs"

export function main(args?: string[]): Promise<LiveSuiteReport>
export function parseArgs(args: string[]): {
  siteUrl: string
  managementKey: string
  apiKey: string
  suite: string
  cdpUrl: string
  extensionPath: string
}

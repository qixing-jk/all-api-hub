import type { LiveSuiteReport } from "./cdp/live-suites.mjs"

export function main(args?: string[]): Promise<LiveSuiteReport>
export function parseArgs(args: string[]): {
  targetUrl: string
  suite: string
  cdpUrl: string
}

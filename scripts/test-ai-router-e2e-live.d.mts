import type { LiveSuiteReport } from "./cdp/live-suites.mjs"

export function main(args?: string[]): Promise<LiveSuiteReport>
export function parseArgs(args: string[]): {
  token: string
  suite: string
  cdpUrl: string
}

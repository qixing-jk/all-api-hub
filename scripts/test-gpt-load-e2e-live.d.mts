import type { LiveSuiteReport } from "./cdp/live-suites.mjs"

export function main(args?: string[]): Promise<LiveSuiteReport>
export function parseArgs(args: string[]): {
  suite: string
  cdpUrl?: string
  allowWrite: boolean
  envFile?: string
  baseUrl?: string
  managementKey?: string
  extensionId?: string
  envSources: string[]
}

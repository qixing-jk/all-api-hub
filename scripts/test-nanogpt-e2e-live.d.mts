import type { LiveSuiteReport } from "./cdp/live-suites.mjs"

export interface NanoGptRunnerOptions {
  suite:
    | "all"
    | "probe"
    | "catalog"
    | "detection"
    | "onboarding"
    | "current-tab"
  apiKey: string
  apiKeyFile?: string
  expectedUserId?: string
  cdpUrl: string
  extensionPath: string
  evidenceDir: string
}
export function parseArgs(
  args: string[],
  env?: Record<string, string | undefined>,
): NanoGptRunnerOptions
export function main(args?: string[]): Promise<LiveSuiteReport>

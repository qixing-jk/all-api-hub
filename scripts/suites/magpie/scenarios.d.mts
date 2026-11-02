import type {
  LiveSuiteEnvironment,
  LiveSuiteReport,
} from "../../cdp/live-suites.mjs"

export function runMagpieScenarios(options: {
  suite: string
  hasUpstream: boolean
  environment?: LiveSuiteEnvironment
  run(id: string): Promise<void>
}): Promise<LiveSuiteReport>

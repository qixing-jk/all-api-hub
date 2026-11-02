import type { runUiScenarios, UiScenario } from "./ui-scenarios.mjs"

export type LiveSuiteReport = Awaited<ReturnType<typeof runUiScenarios>> & {
  suite: string
  selected: string[]
  allSelected: boolean
  startedAt: string
  finishedAt: string
  reportFile: string
  environment: LiveSuiteEnvironment & { worktree: string }
}

export interface LiveSuiteEnvironment {
  cdpUrl?: string
  targetUrl?: string
  extensionId?: string
  extensionPath?: string
}

export function runLiveSuites(options: {
  suite: string
  suites: UiScenario[]
  /** Parent directory; each invocation creates a separate run directory. */
  evidenceDir?: string
  environment?: LiveSuiteEnvironment
}): Promise<LiveSuiteReport>

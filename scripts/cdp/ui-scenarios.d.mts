export declare const UI_SCENARIO_STATUSES: {
  readonly Passed: "passed"
  readonly Failed: "failed"
  readonly Blocked: "blocked"
  readonly NotSelected: "not_selected"
  readonly NotRun: "not_run"
}
export type UiScenarioStatus =
  (typeof UI_SCENARIO_STATUSES)[keyof typeof UI_SCENARIO_STATUSES]

export interface UiScenario {
  id: string
  covers: string[]
  prerequisite?(): string | undefined
  /** Throw on a failed assertion; existing { ok } flow results are also checked. */
  run(): Promise<void | { ok?: boolean; skipped?: boolean; reason?: string }>
}

export function validateUiScenarios(
  scenarios: Array<Pick<UiScenario, "id">>,
  selected: string[],
): void

export function runUiScenarios(options: {
  scenarios: UiScenario[]
  selected: string[]
  continueOnFailure?: boolean
}): Promise<{
  ok: boolean
  scenarios: Array<{
    id: string
    covers: string[]
    status: UiScenarioStatus
    durationMs: number
    reason?: string
  }>
}>

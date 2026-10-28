export interface UiScenario {
  id: string
  covers: string[]
  prerequisite?(): string | undefined
  /** Throw on a failed assertion; existing { ok } flow results are also checked. */
  run(): Promise<void | { ok: boolean }>
}

export function validateUiScenarios(
  scenarios: Array<Pick<UiScenario, "id">>,
  selected: string[],
): void

export function runUiScenarios(options: {
  scenarios: UiScenario[]
  selected: string[]
}): Promise<{
  ok: boolean
  scenarios: Array<{
    id: string
    covers: string[]
    status: "passed" | "failed" | "blocked" | "not_selected" | "not_run"
    durationMs: number
    reason?: string
  }>
}>

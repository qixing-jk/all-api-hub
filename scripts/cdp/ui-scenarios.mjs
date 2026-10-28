/** Reject invalid selection before browser navigation or other setup. */
export function validateUiScenarios(scenarios, selected) {
  const ids = new Set()
  for (const { id } of scenarios) {
    if (ids.has(id)) throw new Error(`Duplicate UI scenario: ${id}`)
    ids.add(id)
  }
  if (!selected.length) throw new Error("Select at least one UI scenario")
  for (const id of selected) {
    if (!ids.has(id)) throw new Error(`Unknown UI scenario: ${id}`)
  }
}

/** Execute selected UI scenarios and retain failures and omitted coverage. */
export async function runUiScenarios({ scenarios, selected }) {
  validateUiScenarios(scenarios, selected)
  const results = []
  let failed = false
  for (const scenario of scenarios) {
    const result = { id: scenario.id, covers: scenario.covers }
    if (!selected.includes(scenario.id)) {
      results.push({ ...result, status: "not_selected", durationMs: 0 })
      continue
    }
    if (failed) {
      results.push({
        ...result,
        status: "not_run",
        durationMs: 0,
        reason: "An earlier scenario failed",
      })
      continue
    }
    const started = performance.now()
    try {
      const reason = scenario.prerequisite?.()
      if (reason) {
        results.push({ ...result, status: "blocked", reason, durationMs: 0 })
        continue
      }
      const outcome = await scenario.run()
      if (outcome?.ok === false) {
        throw new Error(
          `UI scenario reported an unsuccessful result: ${scenario.id}`,
        )
      }
      results.push({
        ...result,
        status: "passed",
        durationMs: Math.round(performance.now() - started),
      })
    } catch (error) {
      failed = true
      results.push({
        ...result,
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - started),
      })
    }
  }
  return {
    ok: results.every(({ status }) =>
      ["passed", "not_selected"].includes(status),
    ),
    scenarios: results,
  }
}

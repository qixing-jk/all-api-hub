import { expect, it, vi } from "vitest"

import { runUiScenarios } from "~~/scripts/cdp/ui-scenarios.mjs"

it("runs only the requested UI scenario and preserves the unselected coverage", async () => {
  const ran: string[] = []
  const report = await runUiScenarios({
    selected: ["editor"],
    scenarios: [
      {
        id: "account",
        covers: ["balance.display"],
        run: async () => {
          ran.push("account")
        },
      },
      {
        id: "editor",
        covers: ["keys.fields"],
        run: async () => {
          ran.push("editor")
        },
      },
    ],
  })
  expect(ran).toEqual(["editor"])
  expect(report).toMatchObject({
    ok: true,
    scenarios: [
      { id: "account", status: "not_selected", covers: ["balance.display"] },
      { id: "editor", status: "passed", covers: ["keys.fields"] },
    ],
  })
})

it("rejects unknown scenario IDs before executing any UI action", async () => {
  const run = vi.fn(async () => {})
  await expect(
    runUiScenarios({
      scenarios: [{ id: "editor", covers: ["keys.fields"], run }],
      selected: ["editor", "typo"],
    }),
  ).rejects.toThrow("Unknown UI scenario: typo")
  expect(run).not.toHaveBeenCalled()
})

it("retains a failed assertion and marks later selected scenarios as not run", async () => {
  const later = vi.fn(async () => {})
  const report = await runUiScenarios({
    scenarios: [
      {
        id: "editor",
        covers: ["keys.fields"],
        run: async () => {
          throw new Error("native field missing")
        },
      },
      { id: "model", covers: ["models.display"], run: later },
    ],
    selected: ["editor", "model"],
  })
  expect(report).toMatchObject({
    ok: false,
    scenarios: [
      { id: "editor", status: "failed", reason: "native field missing" },
      { id: "model", status: "not_run" },
    ],
  })
  expect(later).not.toHaveBeenCalled()
})

it("records missing prerequisites as incomplete while allowing independent scenarios", async () => {
  const unavailable = vi.fn(async () => {})
  const independent = vi.fn(async () => {})
  const report = await runUiScenarios({
    scenarios: [
      {
        id: "editor",
        covers: ["keys.fields"],
        prerequisite: () => "No target account",
        run: unavailable,
      },
      { id: "options", covers: ["options.render"], run: independent },
    ],
    selected: ["editor", "options"],
  })
  expect(report).toMatchObject({
    ok: false,
    scenarios: [
      { id: "editor", status: "blocked", reason: "No target account" },
      { id: "options", status: "passed" },
    ],
  })
  expect(unavailable).not.toHaveBeenCalled()
  expect(independent).toHaveBeenCalledOnce()
})

it("rejects an empty selection or duplicate scenario definitions", async () => {
  const scenario = {
    id: "editor",
    covers: ["keys.fields"],
    run: async () => {},
  }
  await expect(
    runUiScenarios({ scenarios: [scenario], selected: [] }),
  ).rejects.toThrow("at least one")
  await expect(
    runUiScenarios({ scenarios: [scenario, scenario], selected: ["editor"] }),
  ).rejects.toThrow("Duplicate")
})

it("does not treat an existing flow's fulfilled { ok: false } as a pass", async () => {
  const report = await runUiScenarios({
    selected: ["account"],
    scenarios: [
      {
        id: "account",
        covers: ["account.card"],
        run: async () => ({ ok: false }),
      },
    ],
  })
  expect(report).toMatchObject({
    ok: false,
    scenarios: [{ id: "account", status: "failed" }],
  })
})

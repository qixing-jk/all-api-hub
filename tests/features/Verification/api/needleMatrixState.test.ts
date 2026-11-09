import { expect, it } from "vitest"

import { getNeedleMatrixState } from "~/features/Verification/api/needleMatrixState"
import { createNeedleResult } from "~~/tests/test-utils/needle"

it.each(["preparing", "inFlight"] as const)(
  "keeps a cancelled %s cell stopping until the runner settles",
  (phase) => {
    const coordinate = { targetTokens: 8192, depth: 10 }
    const result = createNeedleResult({
      reason: "running",
      [phase]: coordinate,
      cancelled: [coordinate],
    })
    expect(
      getNeedleMatrixState(result, true, [coordinate]).getCell(coordinate),
    ).toMatchObject({ state: "stopping", canStop: false })
    expect(
      getNeedleMatrixState(result, false, [coordinate]).getCell(coordinate),
    ).toMatchObject({ state: "cancelled", canStop: false })
  },
)

it("allows stopping an active cell before cancellation is requested", () => {
  const coordinate = { targetTokens: 8192, depth: 10 }
  const result = createNeedleResult({ reason: "running", inFlight: coordinate })
  expect(
    getNeedleMatrixState(result, true, [coordinate]).getCell(coordinate),
  ).toMatchObject({ state: "running", canStop: true })
})

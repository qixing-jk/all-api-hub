import { describe, expect, it } from "vitest"

import {
  collectCleanupError,
  runScenarioWithCleanup,
  throwScenarioError,
} from "~~/e2e/utils/scenarioErrors"

describe("runScenarioWithCleanup", () => {
  it("keeps the primary scenario failure before a later cleanup failure", async () => {
    const primaryError = new Error("channel creation failed")
    const cleanupError = new Error("channel cleanup failed")

    await expect(
      runScenarioWithCleanup({
        run: async () => {
          throw primaryError
        },
        finalizers: [async () => Promise.reject(cleanupError)],
        cleanupMessage: "Managed-site channel cleanup failed",
        failureMessage: "Managed-site channel scenario failed",
      }),
    ).rejects.toMatchObject({
      errors: [primaryError, cleanupError],
      message:
        "Managed-site channel scenario failed: primary=channel creation failed; cleanup=channel cleanup failed",
    })
  })
})

describe("throwScenarioError", () => {
  it("preserves both the primary failure and a later cleanup failure", () => {
    const primaryError = new Error("request observation timed out")
    const cleanupError = new Error("temporary key cleanup failed")

    expect(() =>
      throwScenarioError({
        primaryError,
        cleanupError,
        message: "Managed-site token channel status scenario failed",
      }),
    ).toThrow(
      expect.objectContaining({
        errors: [primaryError, cleanupError],
        message:
          "Managed-site token channel status scenario failed: primary=request observation timed out; cleanup=temporary key cleanup failed",
      }),
    )
  })

  it("rethrows a single primary or cleanup failure unwrapped", () => {
    const primaryError = new Error("request observation timed out")
    const cleanupError = new Error("temporary key cleanup failed")

    expect(() =>
      throwScenarioError({
        primaryError,
        cleanupError: undefined,
        message: "Managed-site token channel status scenario failed",
      }),
    ).toThrow(primaryError)
    expect(() =>
      throwScenarioError({
        primaryError: undefined,
        cleanupError,
        message: "Managed-site token channel status scenario failed",
      }),
    ).toThrow(cleanupError)
  })

  it("preserves falsy thrown values", () => {
    expect.assertions(1)

    try {
      throwScenarioError({
        primaryError: 0,
        cleanupError: undefined,
        message: "Managed-site token channel status scenario failed",
      })
    } catch (error) {
      expect(error).toBe(0)
    }
  })

  it("does not throw when neither failure occurred", () => {
    expect(() =>
      throwScenarioError({
        primaryError: undefined,
        cleanupError: undefined,
        message: "Managed-site token channel status scenario failed",
      }),
    ).not.toThrow()
  })
})

describe("collectCleanupError", () => {
  it("runs every finalizer and aggregates multiple failures", async () => {
    const calls: string[] = []
    const firstError = new Error("first cleanup failed")
    const secondError = new Error("second cleanup failed")

    const cleanupError = await collectCleanupError(
      [
        async () => {
          calls.push("first")
          throw firstError
        },
        async () => {
          calls.push("middle")
        },
        async () => {
          calls.push("last")
          throw secondError
        },
      ],
      "Scenario cleanup failed",
    )

    expect(calls).toEqual(["first", "middle", "last"])
    expect(cleanupError).toEqual(
      expect.objectContaining({
        errors: [firstError, secondError],
        message: "Scenario cleanup failed",
      }),
    )
  })

  it("returns a single failure unwrapped", async () => {
    const cleanupFailure = new Error("cleanup failed")

    await expect(
      collectCleanupError(
        [async () => Promise.reject(cleanupFailure)],
        "Scenario cleanup failed",
      ),
    ).resolves.toBe(cleanupFailure)
  })

  it("returns undefined when every finalizer succeeds", async () => {
    await expect(
      collectCleanupError([async () => undefined], "Scenario cleanup failed"),
    ).resolves.toBeUndefined()
  })
})

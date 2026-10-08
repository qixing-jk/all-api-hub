import { describe, expect, it } from "vitest"

import {
  gptLoadChannelEffect,
  runGptLoadMutation,
} from "~/services/apiAdapters/managedSites/gptLoad/gptLoadMutation"
import { GptLoadApiError } from "~/services/apiService/gptLoad"

describe("gpt-load mutation evidence", () => {
  it.each([123, Number.NaN])(
    "filters optional diagnostics without changing dispatch certainty (%s)",
    async (code) => {
      const result = await runGptLoadMutation({
        effect: gptLoadChannelEffect("resource-created"),
        execute: async () => {
          throw new GptLoadApiError("network", undefined, {
            dispatch: "dispatched",
            responseReceived: false,
            confirmedNonApplication: false,
            code,
          })
        },
      })
      expect(result.outcome).toBe("uncertain")
      if (result.outcome === "succeeded") throw new Error("unexpected success")
      expect(result.diagnostic).not.toHaveProperty("statusCode")
      if (Number.isNaN(code))
        expect(result.diagnostic).not.toHaveProperty("code")
      else expect(result.diagnostic.code).toBe(123)
    },
  )
  it.each([
    ["not-dispatched", false, true, "rejected"],
    ["dispatched", false, false, "uncertain"],
    ["dispatched", true, true, "rejected"],
    ["dispatched", true, false, "uncertain"],
  ] as const)(
    "retains dispatch evidence (%s/%s/%s)",
    async (dispatch, responseReceived, confirmedNonApplication, outcome) => {
      const error = new GptLoadApiError("failure", 503, {
        dispatch,
        responseReceived,
        confirmedNonApplication,
        code: "FAILED",
      })
      const result = await runGptLoadMutation({
        effect: gptLoadChannelEffect("resource-deleted", 1),
        execute: async () => {
          throw error
        },
      })
      expect(result).toMatchObject({
        outcome,
        diagnostic: { message: "failure", code: "FAILED", statusCode: 503 },
      })
    },
  )

  it("does not disguise programming errors as upstream failures", async () => {
    const error = new Error("invalid call")
    await expect(
      runGptLoadMutation({
        effect: gptLoadChannelEffect("resource-updated"),
        execute: async () => {
          throw error
        },
      }),
    ).rejects.toBe(error)
    await expect(
      runGptLoadMutation({
        effect: gptLoadChannelEffect("resource-updated"),
        execute: async () => {
          throw new GptLoadApiError("no evidence")
        },
      }),
    ).rejects.toThrow("no evidence")
  })

  it("retains completed writes when the final read fails", async () => {
    const result = await runGptLoadMutation({
      effect: gptLoadChannelEffect("resource-updated", 1),
      steps: [async () => undefined],
      execute: async () => {
        throw new Error("read failed")
      },
    })
    expect(result).toMatchObject({
      outcome: "partial",
      completion: "uncertain",
      confirmedEffects: [{ resourceId: "1" }],
    })
  })

  it("maps success data without disclosing transport diagnostics", async () => {
    const result = await runGptLoadMutation({
      effect: gptLoadChannelEffect("resource-created"),
      execute: async () => 4,
      successData: (value) => value * 2,
    })
    expect(result).toMatchObject({ outcome: "succeeded", data: 8 })
  })
})

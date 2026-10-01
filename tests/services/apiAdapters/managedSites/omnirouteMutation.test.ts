import { describe, expect, it } from "vitest"

import {
  omniRouteChannelEffect,
  runOmniRouteMutation,
} from "~/services/apiAdapters/managedSites/omnirouteMutation"
import { OmniRouteApiError } from "~/services/apiService/omniroute/request"
import { MANAGED_SITE_MUTATION_OUTCOMES } from "~/services/managedSites/mutations"

describe("OmniRoute mutation evidence", () => {
  it("propagates failures without transport evidence", async () => {
    const error = new Error("invalid local command")
    await expect(
      runOmniRouteMutation({
        effect: omniRouteChannelEffect("resource-created"),
        execute: async () => {
          throw error
        },
      }),
    ).rejects.toBe(error)
  })

  it.each(["NAME_CONFLICT", 42])(
    "keeps the upstream diagnostic code %s on a confirmed rejection",
    async (code) => {
      const error = new OmniRouteApiError("rejected", 409, {
        dispatch: "dispatched",
        responseReceived: true,
        confirmedNonApplication: true,
        code,
      })
      const result = await runOmniRouteMutation({
        effect: omniRouteChannelEffect("resource-created"),
        execute: async () => {
          throw error
        },
      })
      expect(result.outcome).toBe(MANAGED_SITE_MUTATION_OUTCOMES.Rejected)
      expect(result.diagnostic).toMatchObject({
        code,
        statusCode: 409,
        message: "rejected",
      })
    },
  )

  it("reports a transport failure without an HTTP response as uncertain", async () => {
    const error = new OmniRouteApiError("network lost", undefined, {
      dispatch: "dispatched",
      responseReceived: false,
      confirmedNonApplication: false,
    })
    const result = await runOmniRouteMutation({
      effect: omniRouteChannelEffect("resource-deleted", "conn-1"),
      execute: async () => {
        throw error
      },
    })
    expect(result.outcome).toBe(MANAGED_SITE_MUTATION_OUTCOMES.Uncertain)
    expect(result.diagnostic).not.toHaveProperty("statusCode")
  })
})

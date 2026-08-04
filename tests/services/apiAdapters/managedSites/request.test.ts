import { describe, expect, it } from "vitest"

import { ApiError } from "~/services/apiTransport/errors"
import { createManagedSiteMutationSequence } from "~/services/managedSites/mutations"

const config = {
  baseUrl: "https://managed.example.invalid",
  adminToken: "admin-token",
  userId: "42",
}

const effect = {
  kind: "resource-updated",
  resourceKind: "channel",
  resourceId: 7,
} as const

describe("managed-site API service mutation requests", () => {
  it("creates provider-neutral channel effects", async () => {
    const { createManagedSiteChannelEffect } = await import(
      "~/services/apiAdapters/managedSites/request"
    )

    expect(createManagedSiteChannelEffect("resource-created")).toEqual({
      kind: "resource-created",
      resourceKind: "channel",
    })
    expect(createManagedSiteChannelEffect("resource-updated", 7)).toEqual({
      kind: "resource-updated",
      resourceKind: "channel",
      resourceId: 7,
    })
  })

  it("finishes a provider-neutral mutation step", async () => {
    const { createManagedSiteChannelEffect, finishManagedSiteMutationStep } =
      await import("~/services/apiAdapters/managedSites/request")
    const sequence = createManagedSiteMutationSequence({ idempotent: false })
    const applied = sequence.beginStep()
    applied.markPossiblyDispatched()
    applied.markResponseReceived()
    applied.confirmEffect(createManagedSiteChannelEffect("resource-created"))
    applied.complete()

    expect(
      finishManagedSiteMutationStep(sequence, {
        outcome: "applied",
        data: { id: 7 },
      }),
    ).toEqual({
      outcome: "succeeded",
      data: { id: 7 },
      confirmedEffects: [{ kind: "resource-created", resourceKind: "channel" }],
    })
  })

  it("lets the provider mapper reject a response-level thrown error with its raw value", async () => {
    const raw = new ApiError("provider rejected", undefined, "/api/channel/")
    const { runManagedSiteApiServiceMutationStep } = await import(
      "~/services/apiAdapters/managedSites/request"
    )

    const result = await runManagedSiteApiServiceMutationStep({
      config,
      sequence: createManagedSiteMutationSequence({ idempotent: false }),
      effect,
      execute: async (request) => {
        request.observer?.onDispatch()
        request.observer?.onResponse()
        throw raw
      },
      classifyResponse: () => ({ outcome: "applied", data: undefined }),
      classifyResponseError: (error) => ({
        outcome: "rejected",
        diagnostic: { message: "provider rejected", raw: error },
      }),
    })

    expect(result).toEqual({
      outcome: "rejected",
      diagnostic: { message: "provider rejected", raw },
    })
  })

  it("keeps a pre-dispatch failure rejected without calling the response-error mapper", async () => {
    const raw = new DOMException("cancelled", "AbortError")
    const { runManagedSiteApiServiceMutationStep } = await import(
      "~/services/apiAdapters/managedSites/request"
    )
    let responseErrorMapped = false

    const result = await runManagedSiteApiServiceMutationStep({
      config,
      sequence: createManagedSiteMutationSequence({ idempotent: false }),
      effect,
      execute: async () => {
        throw raw
      },
      classifyResponse: () => ({ outcome: "applied", data: undefined }),
      classifyResponseError: () => {
        responseErrorMapped = true
        return {
          outcome: "rejected",
          diagnostic: { message: "unexpected" },
        }
      },
    })

    expect(result).toEqual({
      outcome: "rejected",
      diagnostic: { message: "cancelled", code: 20, raw },
    })
    expect(responseErrorMapped).toBe(false)
  })

  it("keeps a dispatched failure without a response uncertain", async () => {
    const raw = new TypeError("Failed to fetch")
    const { runManagedSiteApiServiceMutationStep } = await import(
      "~/services/apiAdapters/managedSites/request"
    )

    const result = await runManagedSiteApiServiceMutationStep({
      config,
      sequence: createManagedSiteMutationSequence({ idempotent: false }),
      effect,
      execute: async (request) => {
        request.observer?.onDispatch()
        throw raw
      },
      classifyResponse: () => ({ outcome: "applied", data: undefined }),
      classifyResponseError: () => ({
        outcome: "rejected",
        diagnostic: { message: "unexpected" },
      }),
    })

    expect(result).toEqual({
      outcome: "uncertain",
      diagnostic: { message: "Failed to fetch", raw },
    })
  })
})

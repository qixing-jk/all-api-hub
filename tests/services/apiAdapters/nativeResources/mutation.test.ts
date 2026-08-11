import { describe, expect, it, vi } from "vitest"

import {
  isApiBusinessError,
  runNativeResourceMutation,
} from "~/services/apiAdapters/nativeResources/mutation"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiTransportRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

const createRequest = (): ApiTransportRequest => ({
  auth: { authType: AuthTypeEnum.None },
  baseUrl: "https://api.example.invalid",
})

const mapFailure = (error: unknown) =>
  error instanceof Error ? error.message : "unknown"

describe("native resource mutations", () => {
  it("preserves existing lifecycle observers while returning an applied value", async () => {
    const existingObserver = {
      onDispatch: vi.fn(),
      onResponse: vi.fn(),
    }
    const result = await runNativeResourceMutation({
      request: { ...createRequest(), observer: existingObserver },
      execute: async (request) => {
        request.observer?.onDispatch()
        request.observer?.onResponse()
        return "created"
      },
      mapFailure,
    })

    expect(result).toEqual({ certainty: "applied", value: "created" })
    expect(existingObserver.onDispatch).toHaveBeenCalledOnce()
    expect(existingObserver.onResponse).toHaveBeenCalledOnce()
  })

  it("returns not-applied only when the provider explicitly classifies the failure", async () => {
    const rejection = new ApiError(
      "duplicate resource",
      409,
      "/api/resource",
      API_ERROR_CODES.BUSINESS_ERROR,
    )
    const result = await runNativeResourceMutation({
      request: createRequest(),
      execute: async () => {
        throw rejection
      },
      mapFailure,
      classifyError: (error, evidence) => {
        expect(evidence).toEqual({
          dispatched: false,
          responseReceived: false,
        })
        return isApiBusinessError(error) ? "not-applied" : undefined
      },
    })

    expect(result).toEqual({
      certainty: "not-applied",
      failure: "duplicate resource",
    })
    expect(isApiBusinessError(new Error("duplicate resource"))).toBe(false)
  })

  it("returns possibly-applied after dispatch even when no response arrives", async () => {
    const result = await runNativeResourceMutation({
      request: createRequest(),
      execute: async (request) => {
        request.observer?.onDispatch()
        throw new Error("connection closed")
      },
      mapFailure,
    })

    expect(result).toEqual({
      certainty: "possibly-applied",
      failure: "connection closed",
    })
  })

  it("honors a provider's possibly-applied classification before dispatch", async () => {
    const result = await runNativeResourceMutation({
      request: createRequest(),
      execute: async () => {
        throw new Error("ambiguous preflight")
      },
      mapFailure,
      classifyError: () => "possibly-applied",
    })

    expect(result).toEqual({
      certainty: "possibly-applied",
      failure: "ambiguous preflight",
    })
  })

  it("rethrows failures with no evidence that a mutation was dispatched", async () => {
    const failure = new Error("local validation failed")

    await expect(
      runNativeResourceMutation({
        request: createRequest(),
        execute: async () => {
          throw failure
        },
        mapFailure,
      }),
    ).rejects.toBe(failure)
  })
})

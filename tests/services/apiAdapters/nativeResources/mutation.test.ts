import { describe, expect, it, vi } from "vitest"

import {
  isApiBusinessError,
  isConfirmedRejection,
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

describe("isConfirmedRejection", () => {
  it.each([
    [409, true],
    [400, true],
    [401, true],
    [408, false],
    [499, false],
    [502, false],
    [undefined, false],
  ])("classifies a received %s answer as confirmed: %j", (status, expected) => {
    expect(
      isConfirmedRejection(
        new ApiError(
          "rejected",
          status,
          "/api/resource",
          API_ERROR_CODES.HTTP_OTHER,
        ),
      ),
    ).toBe(expected)
  })

  it("never trusts a non-ApiError value", () => {
    expect(isConfirmedRejection({ statusCode: 409 })).toBe(false)
    expect(isConfirmedRejection(undefined)).toBe(false)
  })
})

describe("native resource mutations", () => {
  it.each([408, 499, 503])(
    "keeps a %s write failure uncertain even with a business-error code",
    async (status) => {
      const result = await runNativeResourceMutation({
        request: createRequest(),
        execute: async (request) => {
          request.observer?.onDispatch()
          throw new ApiError(
            "outcome unknown",
            status,
            "/api/resource",
            API_ERROR_CODES.BUSINESS_ERROR,
          )
        },
        mapFailure,
      })
      expect(result).toEqual({
        certainty: "possibly-applied",
        failure: "outcome unknown",
      })
    },
  )

  it("does not let a readback refusal erase an accepted write", async () => {
    const result = await runNativeResourceMutation({
      request: createRequest(),
      execute: async (request) => {
        request.observer?.onDispatch()
        request.observer?.onMutationAccepted?.()
        throw new ApiError(
          "read forbidden",
          403,
          "/api/resource",
          API_ERROR_CODES.BUSINESS_ERROR,
        )
      },
      mapFailure,
    })
    expect(result).toEqual({
      certainty: "possibly-applied",
      failure: "read forbidden",
    })
  })

  it.each([
    [400, API_ERROR_CODES.HTTP_OTHER, "invalid fields"],
    [409, API_ERROR_CODES.HTTP_OTHER, "duplicate resource"],
    [200, API_ERROR_CODES.BUSINESS_ERROR, "business refusal"],
  ])(
    "handles a %s rejection without adapter classification",
    async (status, code, message) => {
      const result = await runNativeResourceMutation({
        request: createRequest(),
        execute: async (request) => {
          request.observer?.onDispatch()
          request.observer?.onResponse()
          throw new ApiError(message, status, "/api/resource", code)
        },
        mapFailure,
      })
      expect(result).toEqual({ certainty: "not-applied", failure: message })
    },
  )

  it("preserves existing lifecycle observers while returning an applied value", async () => {
    const existingObserver = {
      onDispatch: vi.fn(),
      onResponse: vi.fn(),
      onMutationAccepted: vi.fn(),
    }
    const result = await runNativeResourceMutation({
      request: { ...createRequest(), observer: existingObserver },
      execute: async (request) => {
        request.observer?.onDispatch()
        request.observer?.onResponse()
        request.observer?.onMutationAccepted?.()
        return "created"
      },
      mapFailure,
    })

    expect(result).toEqual({ certainty: "applied", value: "created" })
    expect(existingObserver.onDispatch).toHaveBeenCalledOnce()
    expect(existingObserver.onResponse).toHaveBeenCalledOnce()
    expect(existingObserver.onMutationAccepted).toHaveBeenCalledOnce()
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

  it("keeps an explicit not-applied classification after dispatch", async () => {
    const result = await runNativeResourceMutation({
      request: createRequest(),
      execute: async (request) => {
        request.observer?.onDispatch()
        request.observer?.onResponse()
        throw new ApiError(
          "duplicate resource",
          409,
          "/api/resource",
          API_ERROR_CODES.BUSINESS_ERROR,
        )
      },
      mapFailure,
      classifyError: (error, evidence) => {
        expect(evidence).toEqual({ dispatched: true, responseReceived: true })
        return isApiBusinessError(error) ? "not-applied" : undefined
      },
    })

    expect(result).toEqual({
      certainty: "not-applied",
      failure: "duplicate resource",
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

  it("returns a mapped failure when nothing was dispatched", async () => {
    const failure = new Error("local validation failed")

    await expect(
      runNativeResourceMutation({
        request: createRequest(),
        execute: async () => {
          throw failure
        },
        mapFailure,
      }),
    ).resolves.toEqual({
      certainty: "not-applied",
      failure: "local validation failed",
    })
  })
})

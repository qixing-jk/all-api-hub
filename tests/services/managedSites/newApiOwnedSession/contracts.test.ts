import { describe, expect, it } from "vitest"

import {
  isNewApiOwnedSessionRequest,
  NEW_API_OWNED_SESSION_ACTIONS,
  parseNewApiOwnedSessionRequest,
} from "~/services/managedSites/newApiOwnedSession/contracts"

const validBundle = {
  baseUrl: "https://managed.example.invalid",
  sessionId: "owned-session-placeholder",
  accessToken: "owned-token-placeholder",
  accessExpiresAt: 1_900_000_000,
}

describe("isNewApiOwnedSessionRequest", () => {
  it.each([
    NEW_API_OWNED_SESSION_ACTIONS.Capture,
    NEW_API_OWNED_SESSION_ACTIONS.Refresh,
  ])("accepts a complete %s bundle", (action) => {
    expect(isNewApiOwnedSessionRequest({ action, bundle: validBundle })).toBe(
      true,
    )
  })

  it.each(["baseUrl", "sessionId", "accessToken", "accessExpiresAt"])(
    "rejects a bundle with an invalid %s field",
    (field) => {
      expect(
        isNewApiOwnedSessionRequest({
          action: NEW_API_OWNED_SESSION_ACTIONS.Capture,
          bundle: { ...validBundle, [field]: null },
        }),
      ).toBe(false)
    },
  )

  it.each([
    ["blank base URL", { baseUrl: "   " }],
    ["non-HTTP base URL", { baseUrl: "ftp://managed.example.invalid" }],
    ["blank session ID", { sessionId: "\t" }],
    ["blank access token", { accessToken: " " }],
    ["NaN expiry", { accessExpiresAt: Number.NaN }],
    ["infinite expiry", { accessExpiresAt: Number.POSITIVE_INFINITY }],
  ])("rejects a bundle with a %s", (_description, invalidFields) => {
    expect(
      isNewApiOwnedSessionRequest({
        action: NEW_API_OWNED_SESSION_ACTIONS.Capture,
        bundle: { ...validBundle, ...invalidFields },
      }),
    ).toBe(false)
  })

  it("normalizes a valid bundle at the runtime boundary", () => {
    expect(
      parseNewApiOwnedSessionRequest({
        action: NEW_API_OWNED_SESSION_ACTIONS.Capture,
        bundle: {
          ...validBundle,
          baseUrl: " https://managed.example.invalid/dashboard/ ",
          sessionId: " owned-session-placeholder ",
          accessToken: " owned-token-placeholder ",
        },
      }),
    ).toEqual({
      action: NEW_API_OWNED_SESSION_ACTIONS.Capture,
      bundle: validBundle,
    })
  })

  it("validates optional touch SIDs and base URLs", () => {
    expect(
      isNewApiOwnedSessionRequest({
        action: NEW_API_OWNED_SESSION_ACTIONS.Touch,
        baseUrl: validBundle.baseUrl,
      }),
    ).toBe(true)
    expect(
      isNewApiOwnedSessionRequest({
        action: NEW_API_OWNED_SESSION_ACTIONS.Touch,
        baseUrl: validBundle.baseUrl,
        sessionId: 42,
      }),
    ).toBe(false)
    expect(
      isNewApiOwnedSessionRequest({
        action: NEW_API_OWNED_SESSION_ACTIONS.GetStatus,
        baseUrl: 42,
      }),
    ).toBe(false)
  })

  it("rejects an unknown owned-session action", () => {
    expect(
      parseNewApiOwnedSessionRequest({
        action: "new-api-owned-session:unknown",
        baseUrl: validBundle.baseUrl,
      }),
    ).toBeNull()
  })
})

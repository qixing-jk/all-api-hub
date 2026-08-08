import { describe, expect, it } from "vitest"

import {
  isNewApiOwnedSessionRequest,
  NEW_API_OWNED_SESSION_ACTIONS,
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
})

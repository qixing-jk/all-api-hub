import { describe, expect, it } from "vitest"

import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  INVITE_LINK_FAILURE_REASONS,
  InviteLinkError,
  normalizeInviteLinkError,
} from "~/services/inviteLinks/errors"

describe("normalizeInviteLinkError", () => {
  it.each([
    [
      new ApiError("Login required", 401, "/invite", API_ERROR_CODES.HTTP_401),
      INVITE_LINK_FAILURE_REASONS.AuthenticationRequired,
    ],
    [
      new ApiError(
        "Provider rejected the request",
        undefined,
        "/invite",
        API_ERROR_CODES.BUSINESS_ERROR,
      ),
      INVITE_LINK_FAILURE_REASONS.ProviderRejected,
    ],
    [
      new ApiError(
        "Invitations are not enabled for this account",
        403,
        "/invite",
        API_ERROR_CODES.BUSINESS_ERROR,
      ),
      INVITE_LINK_FAILURE_REASONS.ProviderRejected,
    ],
    [
      new ApiError(
        "Invalid response",
        undefined,
        "/invite",
        API_ERROR_CODES.JSON_PARSE_ERROR,
      ),
      INVITE_LINK_FAILURE_REASONS.InvalidResponse,
    ],
    [
      new ApiError(
        "Unsupported",
        404,
        "/invite",
        API_ERROR_CODES.FEATURE_UNSUPPORTED,
      ),
      INVITE_LINK_FAILURE_REASONS.Unavailable,
    ],
    [
      new ApiError("Too many requests", 429, "/invite"),
      INVITE_LINK_FAILURE_REASONS.RateLimited,
    ],
    [
      new ApiError("Timed out", 408, "/invite"),
      INVITE_LINK_FAILURE_REASONS.Timeout,
    ],
    [
      new ApiError("Server unavailable", 503, "/invite"),
      INVITE_LINK_FAILURE_REASONS.Network,
    ],
    [new TypeError("Failed to fetch"), INVITE_LINK_FAILURE_REASONS.Network],
  ])("maps structured failures to %s", (error, expectedReason) => {
    expect(normalizeInviteLinkError(error)).toMatchObject({
      reason: expectedReason,
      cause: error,
    })
  })

  it("preserves an existing invite-link failure and its cause", () => {
    const cause = new Error("Provider response omitted the invite code")
    const error = new InviteLinkError(
      INVITE_LINK_FAILURE_REASONS.InviteDataMissing,
      cause,
    )

    expect(normalizeInviteLinkError(error)).toBe(error)
  })

  it("falls back to unknown for circular cause chains", () => {
    const firstError = new Error("first") as Error & { cause?: unknown }
    const secondError = new Error("second") as Error & { cause?: unknown }
    firstError.cause = secondError
    secondError.cause = firstError

    expect(normalizeInviteLinkError(firstError)).toMatchObject({
      reason: INVITE_LINK_FAILURE_REASONS.Unknown,
      cause: firstError,
    })
  })

  it("falls back to unknown without exposing the original message as a category", () => {
    const error = new Error("deployment-specific backend detail")

    expect(normalizeInviteLinkError(error)).toMatchObject({
      reason: INVITE_LINK_FAILURE_REASONS.Unknown,
      cause: error,
    })
  })
})

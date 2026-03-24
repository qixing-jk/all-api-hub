import { describe, expect, it, vi } from "vitest"

import { getNewApiManagedVerificationErrorMessage } from "~/features/ManagedSiteVerification/errorMessages"
import { API_ERROR_CODES, ApiError } from "~/services/apiService/common/errors"

vi.mock("~/utils/i18n/core", () => ({
  t: vi.fn((key: string) => key),
}))

describe("ManagedSiteVerification errorMessages", () => {
  it("maps temp-window failures to localized browser guidance", () => {
    expect(
      getNewApiManagedVerificationErrorMessage(
        new ApiError(
          "raw browser window error",
          undefined,
          undefined,
          API_ERROR_CODES.TEMP_WINDOW_WINDOW_CREATION_UNAVAILABLE,
        ),
      ),
    ).toBe("messages:background.windowCreationUnavailable")
  })

  it("returns trimmed safe Error messages", () => {
    expect(
      getNewApiManagedVerificationErrorMessage(new Error(" invalid code ")),
    ).toBe("invalid code")
  })

  it("falls back to a stable localized message for blank Error messages", () => {
    expect(getNewApiManagedVerificationErrorMessage(new Error("   "))).toBe(
      "newApiManagedVerification:dialog.body.failure",
    )
  })

  it("falls back to a stable localized message for object-like non-Error values", () => {
    expect(
      getNewApiManagedVerificationErrorMessage({ detail: "backend exploded" }),
    ).toBe("newApiManagedVerification:dialog.body.failure")
  })
})

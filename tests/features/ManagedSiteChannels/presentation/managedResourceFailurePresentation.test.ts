import { describe, expect, it } from "vitest"

import { presentManagedResourceFailure } from "~/features/ManagedSiteChannels/presentation/managedResourceFailurePresentation"

describe("managed resource failure presentation", () => {
  it("prefers a provider message and appends its unique code", () => {
    expect(
      presentManagedResourceFailure(
        {
          code: "upstream_rejected",
          message: "Provider rejected the channel",
          upstreamCode: "channel_invalid",
        },
        { category: "Unable to save", message: "Try again." },
      ),
    ).toEqual({
      category: "Unable to save",
      message: "Provider rejected the channel (channel_invalid)",
    })
  })

  it("omits blank, duplicate, and canonical failure-code details", () => {
    expect(
      presentManagedResourceFailure(
        {
          code: "unexpected",
          message: " Refresh and try again. ",
          upstreamCode: "unexpected",
        },
        { category: "Unable to load", message: "Refresh and try again." },
      ).message,
    ).toBe("Refresh and try again.")
  })
})

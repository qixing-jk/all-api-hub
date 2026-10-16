import { describe, expect, it } from "vitest"

import { resolveTurnstileAssistPresentation } from "~/services/checkin/turnstile/assistPresentation"
import { normalizeTempWindowFallbackPreferences } from "~/services/preferences/tempWindowFallbackPreferences"

describe("Turnstile reminder channel preferences", () => {
  it("defaults to in-page reminders without system notifications", () => {
    expect(normalizeTempWindowFallbackPreferences({})).toMatchObject({
      turnstileAssistPresentation: "page",
    })
  })
  it("migrates the old foreground choice to an in-page reminder", () => {
    expect(
      normalizeTempWindowFallbackPreferences({
        turnstileAssistPresentation: "foreground",
      }),
    ).toMatchObject({ turnstileAssistPresentation: "page" })
  })
  it.each(["quiet", "page", "notify", "both"] as const)(
    "preserves %s without automatically focusing",
    (preference) => {
      expect(
        normalizeTempWindowFallbackPreferences({
          turnstileAssistPresentation: preference,
        }).turnstileAssistPresentation,
      ).toBe(preference)
      expect(
        resolveTurnstileAssistPresentation({ preference, canNotify: false })
          .focusWindow,
      ).toBe(false)
      expect(
        resolveTurnstileAssistPresentation({ preference, canNotify: true })
          .focusWindow,
      ).toBe(false)
    },
  )
})

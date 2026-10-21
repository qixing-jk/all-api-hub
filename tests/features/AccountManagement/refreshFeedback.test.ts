import { createInstance } from "i18next"
import { describe, expect, it } from "vitest"

import { getAccountRefreshFeedback } from "~/features/AccountManagement/refreshFeedback"

const resources = import.meta.glob("../../../src/locales/*/account.json", {
  eager: true,
  import: "default",
})

describe("account refresh feedback translations", () => {
  it.each(Object.entries(resources))(
    "renders the partial result and count from %s",
    async (path, resource) => {
      const language = path.split("/").at(-2)!
      const i18n = createInstance()
      await i18n.init({
        lng: language,
        fallbackLng: false,
        resources: {
          [language]: { account: resource as Record<string, unknown> },
        },
      })
      for (const count of [1, 2]) {
        const message = getAccountRefreshFeedback(
          {
            success: 2,
            failed: 0,
            refreshedCount: 2,
            checkInStatusFailedCount: count,
          },
          i18n.t,
        )
        expect(message).toContain(String(count))
        expect(message).not.toContain("account:")
        expect(message).not.toContain("{{")
      }
    },
  )
})

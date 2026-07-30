import { describe, expect, it } from "vitest"

import {
  refreshSearchControls,
  refreshSearchSections,
} from "~/features/BasicSettings/components/tabs/Refresh/Refresh.search"
import enSettings from "~/locales/en/settings.json"
import esSettings from "~/locales/es-419/settings.json"
import jaSettings from "~/locales/ja/settings.json"
import viSettings from "~/locales/vi/settings.json"
import zhCnSettings from "~/locales/zh-CN/settings.json"
import zhTwSettings from "~/locales/zh-TW/settings.json"

describe("refresh settings search definitions", () => {
  it("keeps website verification labels aligned with stable rendered targets", () => {
    expect(refreshSearchSections).toContainEqual(
      expect.objectContaining({
        id: "section:shield-settings",
        targetId: "shield-settings",
        titleKey: "settings:refresh.shieldTitle",
      }),
    )
    expect(refreshSearchControls).toContainEqual(
      expect.objectContaining({
        id: "control:shield-enabled",
        targetId: "shield-enabled",
        titleKey: "settings:refresh.shieldEnabled",
        descriptionKey: "settings:refresh.shieldDescriptionTempWindowOnly",
        keywords: expect.arrayContaining([
          "site verification",
          "automatic refresh",
          "automatic check-in",
        ]),
      }),
    )
  })

  it.each([
    {
      locale: "en",
      settings: enSettings,
    },
    {
      locale: "es-419",
      settings: esSettings,
    },
    {
      locale: "ja",
      settings: jaSettings,
    },
    {
      locale: "vi",
      settings: viSettings,
    },
    {
      locale: "zh-CN",
      settings: zhCnSettings,
    },
    {
      locale: "zh-TW",
      settings: zhTwSettings,
    },
  ])("keeps browser variants aligned in $locale", ({ settings }) => {
    expect(settings.refresh.shieldTitle).toBeTruthy()
    expect(settings.refresh.shieldEnabled).toBeTruthy()
    expect(settings.refresh.shieldEnabledDescTempWindowOnly).toBe(
      settings.refresh.shieldEnabledDescWithCookieInterceptor,
    )

    for (const permission of [
      "Cookies",
      "Web Request",
      "Web Request Blocking",
    ]) {
      expect(settings.refresh.shieldPermissionWarningTitle).toContain(
        permission,
      )
    }
  })
})

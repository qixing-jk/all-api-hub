import { describe, expect, it } from "vitest"

import { BASIC_SETTINGS_ANCHOR_TO_TAB } from "~/constants/basicSettingsTabs"
import {
  refreshSearchControls,
  refreshSearchSections,
} from "~/features/BasicSettings/components/tabs/Refresh/Refresh.search"
import { SHIELD_SETTINGS_TARGET_IDS } from "~/features/BasicSettings/components/tabs/Refresh/searchTargets"
import enSettings from "~/locales/en/settings.json"
import esSettings from "~/locales/es-419/settings.json"
import jaSettings from "~/locales/ja/settings.json"
import ptBrSettings from "~/locales/pt-BR/settings.json"
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
        descriptionKey: "settings:refresh.shieldEnabledDescTempWindowOnly",
        keywords: expect.arrayContaining(["site verification", "automatic"]),
      }),
    )
    expect(refreshSearchControls).toContainEqual(
      expect.objectContaining({
        id: "control:shield-method",
        tabId: "refresh",
        targetId: SHIELD_SETTINGS_TARGET_IDS.method,
        titleKey: "settings:refresh.shieldMethodTitle",
        descriptionKey: "settings:refresh.shieldMethodDesc",
      }),
    )
    expect(BASIC_SETTINGS_ANCHOR_TO_TAB[SHIELD_SETTINGS_TARGET_IDS.root]).toBe(
      "refresh",
    )
    expect(
      refreshSearchControls.filter((item) =>
        item.id.startsWith("control:shield-automatic-feature-"),
      ),
    ).toHaveLength(8)
  })

  it.each([
    {
      locale: "en",
      settings: enSettings,
      hintTerm: "shared window",
      methodDescription:
        "Choose how temporary pages open when a website requires verification.",
    },
    {
      locale: "es-419",
      settings: esSettings,
      hintTerm: "ventana compartida",
      methodDescription:
        "Configura cómo se abren las páginas temporales cuando un sitio web requiere verificación.",
    },
    {
      locale: "pt-BR",
      settings: ptBrSettings,
      hintTerm: "janela compartilhada",
      methodDescription:
        "Escolha como as páginas temporárias são abertas quando um site exige verificação.",
    },
    {
      locale: "ja",
      settings: jaSettings,
      hintTerm: "共有ウィンドウ",
      methodDescription:
        "ウェブサイトの確認が必要なときに、一時ページを開く方法を設定します。",
    },
    {
      locale: "vi",
      settings: viSettings,
      hintTerm: "cửa sổ dùng chung",
      methodDescription:
        "Chọn cách mở trang tạm thời khi trang web yêu cầu xác minh.",
    },
    {
      locale: "zh-CN",
      settings: zhCnSettings,
      hintTerm: "共享窗口",
      methodDescription: "设置遇到网站验证时，临时页面以哪种方式打开。",
    },
    {
      locale: "zh-TW",
      settings: zhTwSettings,
      hintTerm: "共用視窗",
      methodDescription: "設定遇到網站驗證時，臨時頁面以哪種方式開啟。",
    },
  ])(
    "keeps website verification copy aligned in $locale",
    ({ hintTerm, locale, methodDescription, settings }) => {
      const refresh = settings.refresh as Record<string, unknown>
      const methodSearchResult = refreshSearchControls.find(
        ({ id }) => id === "control:shield-method",
      )

      expect(settings.refresh.shieldTitle).toBeTruthy()
      expect(settings.refresh.shieldEnabled).toBeTruthy()
      expect(settings.refresh.shieldEnabledDescTempWindowOnly).toBe(
        settings.refresh.shieldEnabledDescWithCookieInterceptor,
      )
      expect(settings.refresh.shieldMethodDesc).toBe(methodDescription)
      expect(methodSearchResult?.keywordKeys).toEqual([
        "settings:refresh.shieldMethodAuto",
        "settings:refresh.shieldMethodHintAuto",
      ])

      for (const key of [
        "shieldMethodAuto",
        "shieldMethodComposite",
        "shieldMethodHintAuto",
        "shieldMethodTab",
        "shieldMethodWindow",
      ]) {
        expect(refresh[key], `${locale}:refresh.${key}`).toEqual(
          expect.stringMatching(/\S/),
        )
      }

      expect(settings.refresh.shieldMethodHintAuto).toContain(hintTerm)
      expect(methodSearchResult?.targetId).toBe(
        SHIELD_SETTINGS_TARGET_IDS.method,
      )

      const permissionTerms =
        locale === "pt-BR"
          ? [
              "cookies",
              "solicitações da Web",
              "bloqueio de solicitações da Web",
            ]
          : ["Cookies", "Web Request", "Web Request Blocking"]
      for (const permission of permissionTerms) {
        expect(settings.refresh.shieldPermissionWarningTitle).toContain(
          permission,
        )
      }
    },
  )
})

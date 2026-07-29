import { describe, expect, it } from "vitest"

import enAccountDialog from "~/locales/en/accountDialog.json"
import enMessages from "~/locales/en/messages.json"
import es419AccountDialog from "~/locales/es-419/accountDialog.json"
import es419Messages from "~/locales/es-419/messages.json"
import jaAccountDialog from "~/locales/ja/accountDialog.json"
import jaMessages from "~/locales/ja/messages.json"
import viAccountDialog from "~/locales/vi/accountDialog.json"
import viMessages from "~/locales/vi/messages.json"
import zhCnAccountDialog from "~/locales/zh-CN/accountDialog.json"
import zhCnMessages from "~/locales/zh-CN/messages.json"
import zhTwAccountDialog from "~/locales/zh-TW/accountDialog.json"
import zhTwMessages from "~/locales/zh-TW/messages.json"

const localeResources = [
  [
    enAccountDialog,
    enMessages,
    "Create a new Management Key on OpenRouter's Management Keys page and copy it immediately, then paste it here. Existing Management Keys cannot be revealed again.",
    "Create a new Management Key in OpenRouter and copy it immediately. Existing Management Keys cannot be revealed again.",
  ],
  [
    es419AccountDialog,
    es419Messages,
    "Crea una nueva clave de administración en la página Management Keys de OpenRouter y cópiala de inmediato; luego pégala aquí. Las claves de administración existentes no se pueden volver a mostrar.",
    "Crea una nueva clave de administración en OpenRouter y cópiala de inmediato. Las claves de administración existentes no se pueden volver a mostrar.",
  ],
  [
    jaAccountDialog,
    jaMessages,
    "OpenRouter の Management Keys ページで新しい管理キーを作成し、すぐにコピーしてここに貼り付けてください。既存の管理キーの平文は再表示できません。",
    "OpenRouter で新しい管理キーを作成し、すぐにコピーしてください。既存の管理キーの平文は再表示できません。",
  ],
  [
    viAccountDialog,
    viMessages,
    "Hãy tạo một Management Key mới trên trang Management Keys của OpenRouter và sao chép ngay, rồi dán vào đây. Không thể hiển thị lại bản rõ của Management Key đã có.",
    "Hãy tạo một Management Key mới trong OpenRouter và sao chép ngay. Không thể hiển thị lại bản rõ của Management Key đã có.",
  ],
  [
    zhCnAccountDialog,
    zhCnMessages,
    "请在 OpenRouter 的 Management Keys 页面新建管理密钥并立即复制，然后粘贴到这里。现有管理密钥的明文无法再次显示。",
    "请在 OpenRouter 中新建管理密钥并立即复制。现有管理密钥的明文无法再次显示。",
  ],
  [
    zhTwAccountDialog,
    zhTwMessages,
    "請在 OpenRouter 的 Management Keys 頁面建立新的管理金鑰並立即複製，然後貼到這裡。現有管理金鑰的明文無法再次顯示。",
    "請在 OpenRouter 中建立新的管理金鑰並立即複製。現有管理金鑰的明文無法再次顯示。",
  ],
] as const

describe("OpenRouter credential copy", () => {
  it("uses the approved user-facing Simplified Chinese guidance", () => {
    expect(zhCnAccountDialog.form.openrouterManagementKeyGuidanceTitle).toBe(
      "使用 OpenRouter 管理密钥",
    )
    expect(zhCnAccountDialog.form.openrouterManagementKeyGuidance).toBe(
      "请在 OpenRouter 的 Management Keys 页面新建管理密钥并立即复制，然后粘贴到这里。现有管理密钥的明文无法再次显示。",
    )
    expect(zhCnMessages.openrouter.managementKeyRequired).toBe(
      "请在 OpenRouter 中新建管理密钥并立即复制。现有管理密钥的明文无法再次显示。",
    )
    expect(zhCnAccountDialog.siteInfo.authMethodSelectedForSite).toBe(
      "已根据 {{siteType}} 的要求自动选择认证方式。",
    )
  })

  it.each(localeResources)(
    "keeps locked-auth and OpenRouter guidance explicit about one-time plaintext",
    (accountDialog, messages, expectedGuidance, expectedRequired) => {
      expect(accountDialog.siteInfo.authMethodSelectedForSite).toContain(
        "{{siteType}}",
      )
      expect(accountDialog.siteInfo).toHaveProperty("sub2apiHint")
      expect(
        accountDialog.form.openrouterManagementKeyGuidanceTitle,
      ).toBeTruthy()
      expect(accountDialog.form.openrouterManagementKeyGuidance).toBe(
        expectedGuidance,
      )
      expect(messages.openrouter.managementKeyRequired).toBe(expectedRequired)
    },
  )
})

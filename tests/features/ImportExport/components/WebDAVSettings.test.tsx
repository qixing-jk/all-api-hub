import { describe, expect, it } from "vitest"

import enImportExport from "~/locales/en/importExport.json"
import es419ImportExport from "~/locales/es-419/importExport.json"
import jaImportExport from "~/locales/ja/importExport.json"
import viImportExport from "~/locales/vi/importExport.json"
import zhCnImportExport from "~/locales/zh-CN/importExport.json"
import zhTwImportExport from "~/locales/zh-TW/importExport.json"

describe("WebDAV backup copy", () => {
  it("describes optional encryption and plaintext uploads in every app locale", () => {
    const resources = [
      {
        locale: "en",
        resource: enImportExport,
        optional: /Optional/i,
        disabled: /encryption is disabled/i,
        credentials: /saved credentials/i,
        guidance: /use encryption or store them securely/i,
        providerSpecificForbidden: /OpenRouter|Management Key/i,
        uploadedBackupWithCredentials:
          /uploaded backups contain saved credentials/i,
        plaintext: /plaintext/i,
      },
      {
        locale: "es-419",
        resource: es419ImportExport,
        optional: /Opcional/i,
        disabled: /cifrado está desactivado/i,
        credentials: /credenciales guardadas/i,
        guidance: /usa el cifrado o guárdalas de forma segura/i,
        providerSpecificForbidden:
          /OpenRouter|Management Key|clave de administración/i,
        uploadedBackupWithCredentials:
          /copias subidas contienen las credenciales guardadas/i,
        plaintext: /texto sin formato/i,
      },
      {
        locale: "ja",
        resource: jaImportExport,
        optional: /任意/,
        disabled: /暗号化を無効にすると/,
        credentials: /保存済み認証情報/,
        guidance: /暗号化するか.*安全に保管/,
        providerSpecificForbidden: /OpenRouter|Management Key|管理キー/i,
        uploadedBackupWithCredentials:
          /アップロードされる WebDAV バックアップには.*保存済み認証情報/,
        plaintext: /平文/,
      },
      {
        locale: "vi",
        resource: viImportExport,
        optional: /Tùy chọn/i,
        disabled: /Khi tắt mã hóa/i,
        credentials: /thông tin xác thực đã lưu/i,
        guidance: /mã hóa hoặc lưu trữ an toàn/i,
        providerSpecificForbidden: /OpenRouter|Management Key|khóa quản lý/i,
        uploadedBackupWithCredentials:
          /bản sao tải lên chứa thông tin xác thực đã lưu/i,
        plaintext: /văn bản thuần túy/i,
      },
      {
        locale: "zh-CN",
        resource: zhCnImportExport,
        optional: /可选/,
        disabled: /关闭加密后/,
        credentials: /已保存的凭据/,
        guidance: /加密或妥善保管备份/,
        providerSpecificForbidden: /OpenRouter|Management Key|管理密钥/i,
        uploadedBackupWithCredentials: /上传的备份会以明文包含已保存的凭据/,
        plaintext: /明文/,
      },
      {
        locale: "zh-TW",
        resource: zhTwImportExport,
        optional: /可選/,
        disabled: /關閉加密後/,
        credentials: /已儲存的憑證/,
        guidance: /加密或妥善保管備份/,
        providerSpecificForbidden: /OpenRouter|Management Key|管理金鑰/i,
        uploadedBackupWithCredentials: /上傳的備份會以明文包含已儲存的憑證/,
        plaintext: /明文/,
      },
    ]

    resources.forEach(
      ({
        locale,
        resource,
        optional,
        disabled,
        credentials,
        guidance,
        providerSpecificForbidden,
        uploadedBackupWithCredentials,
        plaintext,
      }) => {
        const description = resource.webdav.encryption.enableDesc
        expect(description.length, locale).toBeGreaterThan(20)
        expect(description, locale).toMatch(optional)
        expect(description, locale).toMatch(disabled)
        expect(description, locale).toMatch(credentials)
        expect(description, locale).toMatch(guidance)
        expect(description, locale).not.toMatch(providerSpecificForbidden)
        expect(description, locale).toMatch(uploadedBackupWithCredentials)
        expect(description, locale).toMatch(plaintext)
      },
    )
  })
})

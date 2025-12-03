import { t } from "i18next"
import toast from "react-hot-toast"

import type { ApiToken, DisplaySiteData } from "~/types"

interface CherryStudioExportData {
  id: string
  baseUrl: string
  apiKey: string
  name: string
}

function generateCherryStudioURL(data: CherryStudioExportData): string {
  const jsonString = JSON.stringify(data)
  // 转成 Base64（UTF-8 编码）
  const base64String = btoa(
    encodeURIComponent(jsonString).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16)),
    ),
  )
  return `cherrystudio://providers/api-keys?v=1&data=${base64String}`
}

export function OpenInCherryStudio(account: DisplaySiteData, token: ApiToken) {
  if (!account || !token) {
    toast.error(t("messages:cherryStudio.missingCredentials"))
    return
  }

  const exportData: CherryStudioExportData = {
    id: account.id,
    baseUrl: account.baseUrl,
    apiKey: token.key,
    name: account.name,
  }

  const url = generateCherryStudioURL(exportData)

  try {
    window.open(url, "_blank")
    toast.success(t("messages:cherryStudio.attemptingRedirect"))
  } catch (error) {
    console.error("无法打开 Cherry Studio URL:", error)
    toast.error(t("messages:cherryStudio.unableToOpen"))
  }
}

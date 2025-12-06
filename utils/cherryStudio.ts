import { t } from "i18next"
import toast from "react-hot-toast"

import type { ApiToken, DisplaySiteData } from "~/types"

/**
 * Shape expected by Cherry Studio import deeplink payloads.
 */
interface CherryStudioExportData {
  id: string
  baseUrl: string
  apiKey: string
  name: string
}

/**
 * Serialize Cherry Studio payload data and produce deeplink URL.
 * @param data - Provider metadata and credential bundle.
 * @returns The deeplink URL consumable by Cherry Studio.
 */
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

/**
 * Attempt to open Cherry Studio via deeplink using the provided account/token.
 * Validates prerequisites and surfaces toast feedback on both outcomes.
 * @param account Display site information used to populate provider metadata.
 * @param token API token containing the key injected into the export payload.
 */
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

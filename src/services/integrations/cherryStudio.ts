import toast from "react-hot-toast"

import type { ApiToken, DisplaySiteData } from "~/types"
import { encodeUtf8Base64 } from "~/utils/core/base64"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

/**
 * Unified logger scoped to Cherry Studio deeplink integration.
 */
const logger = createLogger("CherryStudio")

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
  const base64String = encodeUtf8Base64(jsonString)
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

  const newWindow = window.open(url, "_blank")
  if (newWindow) {
    toast.success(t("messages:cherryStudio.attemptingRedirect"))
  } else {
    logger.warn("Failed to open Cherry Studio URL")
    toast.error(t("messages:cherryStudio.unableToOpen"))
  }
}

import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import {
  Button,
  Card,
  CardItem,
  CardList,
  IconButton,
  Input,
  Link,
} from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { verifyCCHConnection } from "~/services/integrations/claudeCodeHubService"
import { showResultToast, showUpdateToast } from "~/utils/core/toastHelpers"

const CCH_API_DOC_URL = "https://cch.skydog.cc.cd/api/actions/openapi.json"

/**
 * Settings section for CCH (Claude Code Hub) base URL and auth token entries.
 * Handles local input state, visibility toggle, persistence, and connection test.
 */
export default function CCHSettings() {
  const { t } = useTranslation("settings")
  const {
    cchBaseUrl,
    cchAuthToken,
    updateCCHBaseUrl,
    updateCCHAuthToken,
    resetCCHConfig,
  } = useUserPreferencesContext()

  const [localBaseUrl, setLocalBaseUrl] = useState(cchBaseUrl)
  const [localAuthToken, setLocalAuthToken] = useState(cchAuthToken)
  const [showAuthToken, setShowAuthToken] = useState(false)
  const [isCheckingConnection, setIsCheckingConnection] = useState(false)

  useEffect(() => {
    setLocalBaseUrl(cchBaseUrl)
  }, [cchBaseUrl])

  useEffect(() => {
    setLocalAuthToken(cchAuthToken)
  }, [cchAuthToken])

  const runConnectionCheck = async (overrides?: {
    baseUrl?: string
    authToken?: string
  }) => {
    const baseUrl = overrides?.baseUrl ?? localBaseUrl
    const authToken = overrides?.authToken ?? localAuthToken

    setIsCheckingConnection(true)
    try {
      const result = await verifyCCHConnection({ baseUrl, authToken })
      return result
    } finally {
      setIsCheckingConnection(false)
    }
  }

  const runConnectionCheckWithToast = async (overrides?: {
    baseUrl?: string
    authToken?: string
  }) => {
    const result = await runConnectionCheck(overrides)
    showResultToast(result)
    return result
  }

  const handleBaseUrlChange = async (url: string) => {
    const trimmedUrl = url.trim()
    setLocalBaseUrl(trimmedUrl)

    if (trimmedUrl === cchBaseUrl.trim()) return
    const success = await updateCCHBaseUrl(trimmedUrl)
    showUpdateToast(success, t("cch.baseUrlLabel"))

    if (success && trimmedUrl && localAuthToken.trim()) {
      await runConnectionCheckWithToast({
        baseUrl: trimmedUrl,
        authToken: localAuthToken,
      })
    }
  }

  const handleAuthTokenChange = async (token: string) => {
    const trimmedToken = token.trim()
    setLocalAuthToken(trimmedToken)

    if (trimmedToken === cchAuthToken.trim()) return
    const success = await updateCCHAuthToken(trimmedToken)
    showUpdateToast(success, t("cch.authTokenLabel"))

    if (success && localBaseUrl.trim() && trimmedToken) {
      await runConnectionCheckWithToast({
        baseUrl: localBaseUrl,
        authToken: trimmedToken,
      })
    }
  }

  const handleReset = async () => {
    await resetCCHConfig()
    setLocalBaseUrl("")
    setLocalAuthToken("")
  }

  return (
    <SettingSection
      title={t("cch.title")}
      description={t("cch.description")}
    >
      <CardList>
        <CardItem
          label={t("cch.baseUrlLabel")}
          description={t("cch.baseUrlDescription")}
        >
          <div className="flex items-center gap-2">
            <Input
              type="url"
              value={localBaseUrl}
              onChange={(e) => handleBaseUrlChange(e.target.value)}
              placeholder={t("cch.baseUrlPlaceholder")}
              className="flex-1"
            />
          </div>
        </CardItem>
        <CardItem
          label={t("cch.authTokenLabel")}
          description={t("cch.authTokenDescription")}
        >
          <div className="flex items-center gap-2">
            <Input
              type={showAuthToken ? "text" : "password"}
              value={localAuthToken}
              onChange={(e) => handleAuthTokenChange(e.target.value)}
              placeholder={t("cch.authTokenPlaceholder")}
              className="flex-1"
            />
            <IconButton
              type="button"
              variant="ghost"
              onClick={() => setShowAuthToken(!showAuthToken)}
              aria-label={
                showAuthToken ? t("common:actions.hide") : t("common:actions.show")
              }
            >
              {showAuthToken ? (
                <EyeSlashIcon className="h-4 w-4" />
              ) : (
                <EyeIcon className="h-4 w-4" />
              )}
            </IconButton>
          </div>
        </CardItem>
        <CardItem>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                runConnectionCheckWithToast({
                  baseUrl: localBaseUrl,
                  authToken: localAuthToken,
                })
              }
              disabled={
                isCheckingConnection ||
                !localBaseUrl.trim() ||
                !localAuthToken.trim()
              }
              loading={isCheckingConnection}
            >
              {t("cch.actions.verifyConnection")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleReset}
            >
              {t("common:actions.reset")}
            </Button>
            <Link
              href={CCH_API_DOC_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("cch.actions.viewApiDocs")}
            </Link>
          </div>
        </CardItem>
      </CardList>
    </SettingSection>
  )
}

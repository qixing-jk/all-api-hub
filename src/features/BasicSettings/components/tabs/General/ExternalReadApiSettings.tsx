import {
  ArrowPathIcon,
  DocumentDuplicateIcon,
  TrashIcon,
} from "@heroicons/react/24/outline"
import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import {
  Button,
  Card,
  CardContent,
  CardItem,
  CardList,
  Input,
  Switch,
} from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  DEFAULT_PREFERENCES,
  type ExternalReadApiAccessToken,
} from "~/services/preferences/userPreferences"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("ExternalReadApiSettings")

/**
 *
 */
function generateTokenValue() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  const value = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")

  return `aah_${value}`
}

/**
 *
 */
function createTokenEntry(name: string): ExternalReadApiAccessToken {
  return {
    id: crypto.randomUUID(),
    name,
    token: generateTokenValue(),
    createdAt: Date.now(),
    enabled: true,
  }
}

/**
 *
 */
export default function ExternalReadApiSettings() {
  const { t } = useTranslation(["settings", "common"])
  const { preferences, updateExternalReadApi, resetExternalReadApiConfig } =
    useUserPreferencesContext()

  const [isSaving, setIsSaving] = useState(false)
  const [newTokenName, setNewTokenName] = useState("")

  const config =
    preferences.externalReadApi ?? DEFAULT_PREFERENCES.externalReadApi!

  useEffect(() => {
    if (!config.tokens.length) {
      setNewTokenName("")
    }
  }, [config.tokens.length])

  const saveSettings = async (updates: {
    enabled?: boolean
    notificationsEnabled?: boolean
    tokens?: ExternalReadApiAccessToken[]
  }) => {
    try {
      setIsSaving(true)
      const success = await updateExternalReadApi(updates)
      if (success) {
        toast.success(
          t("settings:messages.updateSuccess", {
            name: t("externalReadApi.title"),
          }),
        )
      } else {
        toast.error(t("settings:messages.saveSettingsFailed"))
      }
      return success
    } catch (error) {
      logger.error("Failed to save external read API settings", error)
      toast.error(t("settings:messages.saveSettingsFailed"))
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const handleCreateToken = async () => {
    const name = newTokenName.trim()
    if (!name) return

    const success = await saveSettings({
      tokens: [...config.tokens, createTokenEntry(name)],
    })

    if (success) {
      setNewTokenName("")
    }
  }

  const handleCopyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token)
      toast.success(t("externalReadApi.tokenCopied"))
    } catch (error) {
      logger.error("Failed to copy external access token", error)
      toast.error(t("externalReadApi.tokenCopyFailed"))
    }
  }

  const handleUpdateToken = async (
    tokenId: string,
    updater: (entry: ExternalReadApiAccessToken) => ExternalReadApiAccessToken,
  ) => {
    const nextTokens = config.tokens.map((entry) =>
      entry.id === tokenId ? updater(entry) : entry,
    )

    await saveSettings({ tokens: nextTokens })
  }

  const handleDeleteToken = async (tokenId: string) => {
    await saveSettings({
      tokens: config.tokens.filter((entry) => entry.id !== tokenId),
    })
  }

  return (
    <SettingSection
      id="external-read-api"
      title={t("externalReadApi.title")}
      description={t("externalReadApi.description")}
      onReset={resetExternalReadApiConfig}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            title={t("externalReadApi.enable")}
            description={t("externalReadApi.enableDesc")}
            rightContent={
              <Switch
                checked={config.enabled}
                onChange={(checked) => {
                  void saveSettings({ enabled: checked })
                }}
                disabled={isSaving}
              />
            }
          />
          <CardItem
            title={t("externalReadApi.notifications")}
            description={t("externalReadApi.notificationsDesc")}
            rightContent={
              <Switch
                checked={config.notificationsEnabled}
                onChange={(checked) => {
                  void saveSettings({ notificationsEnabled: checked })
                }}
                disabled={isSaving}
              />
            }
          />
        </CardList>

        <CardContent
          className="border-border dark:border-dark-bg-tertiary space-y-4 border-t"
          spacing="sm"
        >
          <div className="space-y-2">
            <div className="text-sm font-medium">
              {t("externalReadApi.tokenManagement")}
            </div>
            <div className="text-muted-foreground text-xs">
              {t("externalReadApi.tokenManagementDesc")}
            </div>

            <div className="flex gap-2">
              <Input
                value={newTokenName}
                onChange={(event) => setNewTokenName(event.target.value)}
                placeholder={t("externalReadApi.tokenNamePlaceholder")}
                disabled={isSaving}
              />
              <Button
                type="button"
                variant="outline"
                disabled={isSaving || !newTokenName.trim()}
                onClick={() => {
                  void handleCreateToken()
                }}
              >
                {t("externalReadApi.generateToken")}
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {config.tokens.length === 0 ? (
              <div className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">
                {t("externalReadApi.emptyTokens")}
              </div>
            ) : null}

            {config.tokens.map((entry) => (
              <div key={entry.id} className="space-y-3 rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="text-sm font-medium">{entry.name}</div>
                    <div className="text-muted-foreground text-xs">
                      {t("externalReadApi.tokenCreatedAt", {
                        createdAt: new Date(entry.createdAt).toLocaleString(),
                      })}
                    </div>
                  </div>
                  <Switch
                    checked={entry.enabled}
                    onChange={(checked) => {
                      void handleUpdateToken(entry.id, (current) => ({
                        ...current,
                        enabled: checked,
                      }))
                    }}
                    disabled={isSaving}
                  />
                </div>

                <Input value={entry.token} readOnly disabled={isSaving} />

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSaving}
                    onClick={() => {
                      void handleCopyToken(entry.token)
                    }}
                    leftIcon={<DocumentDuplicateIcon className="h-4 w-4" />}
                  >
                    {t("externalReadApi.copyToken")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSaving}
                    onClick={() => {
                      void handleUpdateToken(entry.id, (current) => ({
                        ...current,
                        token: generateTokenValue(),
                      }))
                    }}
                    leftIcon={<ArrowPathIcon className="h-4 w-4" />}
                  >
                    {t("externalReadApi.regenerateToken")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSaving}
                    onClick={() => {
                      void handleDeleteToken(entry.id)
                    }}
                    leftIcon={<TrashIcon className="h-4 w-4" />}
                  >
                    {t("externalReadApi.deleteToken")}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
            {t("externalReadApi.privacyWarning")}
          </div>
        </CardContent>
      </Card>
    </SettingSection>
  )
}

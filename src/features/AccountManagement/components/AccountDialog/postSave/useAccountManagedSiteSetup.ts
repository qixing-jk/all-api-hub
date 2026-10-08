import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"

import { type ManagedSiteType } from "~/constants/siteType"
import toast from "~/lib/notify"
import type { ManagedSiteMessagesKey } from "~/services/accountSiteDefinitions/contracts"
import { getManagedSiteCapabilities } from "~/services/apiAdapters/registry"
import {
  getManagedSiteConfigMissingMessage,
  getManagedSiteLabel,
  getManagedSiteMessagesKeyFromSiteType,
  getManagedSiteSettingsTarget,
} from "~/services/managedSites/utils/managedSite"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { openSettingsTabInNewTab } from "~/utils/navigation"

const logger = createLogger("AccountDialogHook")
interface ManagedSiteConfigPromptState {
  isOpen: boolean
  siteType: ManagedSiteType
  messagesKey: ManagedSiteMessagesKey
}

/** Keep setup guidance bound to the managed site that opened the prompt. */
export function useAccountManagedSiteSetup(managedSiteType: ManagedSiteType) {
  const { t } = useTranslation(["accountDialog", "settings", "messages"])
  const [managedSiteConfigPromptState, setManagedSiteConfigPrompt] =
    useState<ManagedSiteConfigPromptState | null>(null)
  const managedSiteConfigPrompt = {
    isOpen: managedSiteConfigPromptState?.isOpen ?? false,
    managedSiteType: managedSiteConfigPromptState?.siteType ?? null,
    managedSiteLabel: managedSiteConfigPromptState
      ? getManagedSiteLabel(t, managedSiteConfigPromptState.siteType)
      : "",
    missingMessage: managedSiteConfigPromptState
      ? getManagedSiteConfigMissingMessage(
          t,
          managedSiteConfigPromptState.messagesKey,
        )
      : "",
  }
  const handleManagedSiteConfigPromptClose = useCallback(() => {
    setManagedSiteConfigPrompt((prev) =>
      prev?.isOpen ? { ...prev, isOpen: false } : prev,
    )
  }, [])

  const handleOpenManagedSiteSettings = useCallback(() => {
    // Land on the provider whose prompt was shown, not on a stale preference.
    const promptedSiteType = managedSiteConfigPromptState?.siteType
    handleManagedSiteConfigPromptClose()

    const settingsTarget = getManagedSiteSettingsTarget(
      promptedSiteType ?? managedSiteType,
    )
    // The settings tab opens in the background so this account form, and the
    // popup holding it, keep their focus; name the tab so it is findable.
    void openSettingsTabInNewTab(settingsTarget.tabId, {
      ...(settingsTarget.anchor ? { anchor: settingsTarget.anchor } : {}),
      keepCurrentWindow: true,
    })
      .then(() => {
        toast.success(
          t("messages.managedSiteSettingsOpened", {
            managedSite: getManagedSiteLabel(
              t,
              promptedSiteType ?? managedSiteType,
            ),
          }),
        )
      })
      .catch((error) => {
        toast.error(
          t("messages.operationFailed", {
            error: getErrorMessage(error),
          }),
        )
        logger.error("Failed to open managed-site settings", {
          managedSiteType,
          error: getErrorMessage(error),
        })
      })
  }, [
    handleManagedSiteConfigPromptClose,
    managedSiteConfigPromptState?.siteType,
    managedSiteType,
    t,
  ])

  const ensureManagedSiteAutoConfigReady = useCallback(async () => {
    const managedSite = getManagedSiteCapabilities(managedSiteType)
    const managedConfig = await managedSite.config.get()

    if (managedConfig) {
      return true
    }

    setManagedSiteConfigPrompt({
      isOpen: true,
      siteType: managedSiteType,
      messagesKey: getManagedSiteMessagesKeyFromSiteType(managedSite.siteType),
    })

    return false
  }, [managedSiteType])

  return {
    managedSiteConfigPrompt,
    handleManagedSiteConfigPromptClose,
    handleOpenManagedSiteSettings,
    ensureManagedSiteAutoConfigReady,
  }
}

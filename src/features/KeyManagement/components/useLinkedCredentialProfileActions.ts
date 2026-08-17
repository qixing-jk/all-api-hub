import { useState } from "react"
import { useTranslation } from "react-i18next"

import { useChannelDialog } from "~/components/dialogs/ChannelDialog"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  createCliProxyExportPayload,
  createExportAccount,
  createExportRuntimeKey,
  createExportToken,
} from "~/features/ApiCredentialProfiles/utils/exportShims"
import { OpenInCherryStudio } from "~/services/integrations/cherryStudio"
import { getManagedSiteLabel } from "~/services/managedSites/utils/managedSite"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { showResultToast } from "~/utils/core/toastHelpers"

type ActiveDialog =
  | "cc-switch"
  | "cursor-plus"
  | "kilo-code"
  | "kelivo"
  | "cli-proxy"
  | "claude-code-router"
  | "verify-api"
  | "verify-cli"
  | null

export const LINKED_CREDENTIAL_PROFILE_ANALYTICS_CONTEXT = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
  surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
} as const

const logger = createLogger("LinkedCredentialProfileActions")

/** Owns complete-key integration state and side effects for a linked profile. */
export function useLinkedCredentialProfileActions(
  profile: ApiCredentialProfile,
) {
  const { t } = useTranslation(["keyManagement", "messages"])
  const {
    claudeCodeRouterApiKey,
    claudeCodeRouterBaseUrl,
    cliProxyBaseUrl,
    cliProxyManagementKey,
    managedSiteType,
    markGatewayGuidanceOnboardingCompleted,
  } = useUserPreferencesContext()
  const { openWithCredentials } = useChannelDialog()
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null)
  const exportAccount = createExportAccount(profile)
  const exportToken = createExportToken(profile)
  const cliProxyPayload = createCliProxyExportPayload(profile)

  const openDialog = (dialog: Exclude<ActiveDialog, null>) => {
    setActiveDialog(dialog)
  }
  const closeDialog = () => setActiveDialog(null)

  const handleCherryStudio = () => {
    const tracker = startProductAnalyticsAction({
      ...LINKED_CREDENTIAL_PROFILE_ANALYTICS_CONTEXT,
      actionId:
        PRODUCT_ANALYTICS_ACTION_IDS.ExportApiCredentialProfileToCherryStudio,
    })
    try {
      OpenInCherryStudio(exportAccount, exportToken)
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
    } catch (error) {
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
      showResultToast({
        success: false,
        message: t("messages:errors.operation.failed", {
          error: getErrorMessage(error, t("messages:errors.unknown")),
        }),
      })
    }
  }

  const handleCliProxy = () => {
    if (!cliProxyBaseUrl?.trim() || !cliProxyManagementKey?.trim()) {
      showResultToast({
        success: false,
        message: t("messages:cliproxy.configMissing"),
      })
      return
    }
    openDialog("cli-proxy")
  }

  const handleClaudeCodeRouter = () => {
    if (!claudeCodeRouterBaseUrl?.trim()) {
      showResultToast({
        success: false,
        message: t("messages:claudeCodeRouter.configMissing"),
      })
      return
    }
    openDialog("claude-code-router")
  }

  const handleManagedSiteImport = async () => {
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ImportManagedSiteSingleToken,
      surfaceId: LINKED_CREDENTIAL_PROFILE_ANALYTICS_CONTEXT.surfaceId,
      entrypoint: LINKED_CREDENTIAL_PROFILE_ANALYTICS_CONTEXT.entrypoint,
    })

    try {
      const result = await openWithCredentials(
        {
          name: profile.name,
          baseUrl: profile.baseUrl,
          apiKey: profile.apiKey,
        },
        (importResult) => {
          showResultToast(importResult)
          if (importResult?.success) {
            void Promise.resolve(
              markGatewayGuidanceOnboardingCompleted(),
            ).catch((error) =>
              logger.warn(
                "Failed to mark gateway guidance onboarding complete",
                error,
              ),
            )
          }
        },
      )
      tracker.complete(
        result.opened || result.deferred
          ? PRODUCT_ANALYTICS_RESULTS.Success
          : PRODUCT_ANALYTICS_RESULTS.Skipped,
      )
    } catch (error) {
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
      showResultToast({
        success: false,
        message: t("messages:errors.operation.failed", {
          error: getErrorMessage(error, t("messages:errors.unknown")),
        }),
      })
    }
  }

  return {
    activeDialog,
    claudeCodeRouterApiKey,
    claudeCodeRouterBaseUrl,
    cliProxyPayload,
    closeDialog,
    exportAccount,
    exportRuntimeKey: createExportRuntimeKey(profile),
    exportToken,
    handleCherryStudio,
    handleClaudeCodeRouter,
    handleCliProxy,
    handleManagedSiteImport,
    managedSiteLabel: getManagedSiteLabel(t, managedSiteType),
    managedSiteType,
    openDialog,
  }
}

export type LinkedCredentialProfileActionsController = ReturnType<
  typeof useLinkedCredentialProfileActions
>

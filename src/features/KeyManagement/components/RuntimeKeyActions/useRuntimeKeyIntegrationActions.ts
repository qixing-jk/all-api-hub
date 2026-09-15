import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { useChannelDialog } from "~/components/dialogs/ChannelDialog"
import { useFeatureGuidanceContext } from "~/contexts/FeatureGuidanceContext"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { collectAccountRuntimeKeySecrets } from "~/services/accounts/accountRuntimeKeys"
import type { AccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import { resolveDisplayAccountRuntimeKeySecret } from "~/services/accounts/utils/apiServiceRequest"
import { buildApiCredentialProfileName } from "~/services/apiCredentialProfiles/accountTokenProfileName"
import { OpenInCherryStudio } from "~/services/integrations/cherryStudio"
import type { KelivoProviderExportInput } from "~/services/integrations/kelivo"
import type { ManagedSiteTokenChannelStatus } from "~/services/managedSites/tokenChannelStatus"
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
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import type { DisplaySiteData } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { showResultToast } from "~/utils/feedback/operationFeedback"

const logger = createLogger("RuntimeKeyIntegrationActions")

/** Shared analytics context for opening and completing a Kelivo key export. */
export const RUNTIME_KEY_KELIVO_EXPORT_ANALYTICS_CONTEXT = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
  actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopyAccountTokenKelivoImportCode,
  surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.AccountTokenThirdPartyExportDialog,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
} as const

interface UseRuntimeKeyIntegrationActionsParams {
  account: DisplaySiteData
  enabled: boolean
  guidedManagedSiteImportRequest?: string
  managedSiteStatus?: ManagedSiteTokenChannelStatus
  onManagedSiteImportSuccess?: (
    runtimeKey: AccountRuntimeKey,
  ) => void | Promise<void>
  runtimeKey: AccountRuntimeKey
}

/** Owns third-party export and managed-site import state for one runtime key. */
export function useRuntimeKeyIntegrationActions({
  account,
  enabled,
  guidedManagedSiteImportRequest,
  managedSiteStatus,
  onManagedSiteImportSuccess,
  runtimeKey,
}: UseRuntimeKeyIntegrationActionsParams) {
  const { t } = useTranslation(["keyManagement", "settings"])
  const { managedSiteType, claudeCodeRouterBaseUrl, claudeCodeRouterApiKey } =
    useUserPreferencesContext()
  const { markGatewayGuidanceOnboardingCompleted } = useFeatureGuidanceContext()
  const { openWithAccount } = useChannelDialog()

  const [isClaudeCodeRouterOpen, setIsClaudeCodeRouterOpen] = useState(false)

  const [isCursorPlusDialogOpen, setIsCursorPlusDialogOpen] = useState(false)
  const [isKiloCodeDialogOpen, setIsKiloCodeDialogOpen] = useState(false)
  const [kelivoExportInput, setKelivoExportInput] =
    useState<KelivoProviderExportInput | null>(null)
  const [isManagedSiteImportHighlighted, setIsManagedSiteImportHighlighted] =
    useState(false)
  const managedSiteImportButtonRef = useRef<HTMLButtonElement>(null)
  const handledGuidedManagedSiteImportRequestRef = useRef<string | undefined>(
    undefined,
  )
  const kelivoExportEpochRef = useRef(0)

  useEffect(() => {
    if (enabled) {
      return
    }

    setIsClaudeCodeRouterOpen(false)

    setIsCursorPlusDialogOpen(false)
    setIsKiloCodeDialogOpen(false)
    setKelivoExportInput(null)
    setIsManagedSiteImportHighlighted(false)
  }, [enabled])

  useLayoutEffect(() => {
    kelivoExportEpochRef.current += 1
    setKelivoExportInput(null)

    return () => {
      kelivoExportEpochRef.current += 1
    }
  }, [
    account.authType,
    account.baseUrl,
    account.cookieAuthSessionCookie,
    account.id,
    account.name,
    account.siteType,
    account.token,
    account.userId,
    enabled,
    runtimeKey.accountId,
    runtimeKey.id,
    runtimeKey.secret,
    runtimeKey.label,
  ])

  useEffect(() => {
    if (
      !enabled ||
      !guidedManagedSiteImportRequest ||
      handledGuidedManagedSiteImportRequestRef.current ===
        guidedManagedSiteImportRequest
    ) {
      return
    }

    handledGuidedManagedSiteImportRequestRef.current =
      guidedManagedSiteImportRequest
    setIsManagedSiteImportHighlighted(true)
    managedSiteImportButtonRef.current?.scrollIntoView?.({
      block: "center",
      inline: "nearest",
    })
    managedSiteImportButtonRef.current?.focus()

    const timeoutId = window.setTimeout(() => {
      setIsManagedSiteImportHighlighted(false)
    }, 5000)

    return () => window.clearTimeout(timeoutId)
  }, [enabled, guidedManagedSiteImportRequest])

  const handleImportToManagedSite = async () => {
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ImportManagedSiteSingleToken,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.AccountTokenThirdPartyExportDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    try {
      const result = await openWithAccount(
        account,
        runtimeKey,
        (result) => {
          showResultToast(result)

          if (result?.success && onManagedSiteImportSuccess) {
            void Promise.resolve(onManagedSiteImportSuccess(runtimeKey)).catch(
              (error) =>
                logger.error(
                  "Managed-site import success callback failed",
                  error,
                ),
            )
          }
          if (result?.success) {
            void Promise.resolve(
              markGatewayGuidanceOnboardingCompleted(),
            ).catch((error) =>
              logger.error(
                "Failed to mark gateway guidance onboarding complete",
                error,
              ),
            )
          }
        },
        {
          managedSiteStatus,
        },
      )

      if (result.opened || result.deferred) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
        return
      }

      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
    } catch (error) {
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
      showResultToast({
        success: false,
        message: t("messages:errors.operation.failed", {
          error:
            toSanitizedErrorSummary(
              error,
              collectAccountRuntimeKeySecrets([runtimeKey]),
            ) || t("messages:errors.unknown"),
        }),
      })
    }
  }

  const handleOpenClaudeCodeRouter = () => {
    if (!claudeCodeRouterBaseUrl?.trim()) {
      showResultToast({
        success: false,
        message: t("messages:claudeCodeRouter.configMissing"),
      })
      return
    }
    setIsClaudeCodeRouterOpen(true)
  }

  const handleUseInCherry = async () => {
    const exportEpoch = kelivoExportEpochRef.current
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExportAccountTokenToCherryStudio,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.AccountTokenThirdPartyExportDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    try {
      const resolvedKey = await resolveDisplayAccountRuntimeKeySecret(
        account,
        runtimeKey,
      )
      if (kelivoExportEpochRef.current !== exportEpoch) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
        return
      }
      OpenInCherryStudio({
        providerId: account.id,
        providerName: account.name,
        baseUrl: account.baseUrl,
        apiKey: resolvedKey.secret,
      })
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
    } catch (error) {
      if (kelivoExportEpochRef.current !== exportEpoch) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
        return
      }
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
      showResultToast({
        success: false,
        message: t("messages:errors.operation.failed", {
          error:
            toSanitizedErrorSummary(
              error,
              collectAccountRuntimeKeySecrets([runtimeKey]),
            ) || t("messages:errors.unknown"),
        }),
      })
    }
  }

  const handleOpenKelivoExportDialog = async () => {
    const exportEpoch = ++kelivoExportEpochRef.current
    try {
      const resolvedKey = await resolveDisplayAccountRuntimeKeySecret(
        account,
        runtimeKey,
      )
      if (kelivoExportEpochRef.current !== exportEpoch) return

      setKelivoExportInput({
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        name: buildApiCredentialProfileName({
          accountName: account.name,
          fallbackAccountName: runtimeKey.accountName,
          tokenName: runtimeKey.label,
        }),
        baseUrl: account.baseUrl,
        apiKey: resolvedKey.secret,
      })
    } catch (error) {
      if (kelivoExportEpochRef.current !== exportEpoch) return

      const tracker = startProductAnalyticsAction(
        RUNTIME_KEY_KELIVO_EXPORT_ANALYTICS_CONTEXT,
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
      showResultToast({
        success: false,
        message: t("messages:errors.operation.failed", {
          error:
            toSanitizedErrorSummary(
              error,
              collectAccountRuntimeKeySecrets([runtimeKey]),
            ) || t("messages:errors.unknown"),
        }),
      })
    }
  }

  return {
    dialogs: {
      claudeCodeRouter: {
        apiKey: claudeCodeRouterApiKey,
        baseUrl: claudeCodeRouterBaseUrl,
        close: () => setIsClaudeCodeRouterOpen(false),
        isOpen: isClaudeCodeRouterOpen,
      },

      cursorPlus: {
        close: () => setIsCursorPlusDialogOpen(false),
        isOpen: isCursorPlusDialogOpen,
      },
      kelivo: {
        close: () => setKelivoExportInput(null),
        input: kelivoExportInput,
      },
      kiloCode: {
        close: () => setIsKiloCodeDialogOpen(false),
        isOpen: isKiloCodeDialogOpen,
      },
    },
    exportActions: {
      openCherryStudio: handleUseInCherry,
      openClaudeCodeRouter: handleOpenClaudeCodeRouter,

      openCursorPlus: () => setIsCursorPlusDialogOpen(true),
      openKelivo: handleOpenKelivoExportDialog,
      openKiloCode: () => setIsKiloCodeDialogOpen(true),
    },
    managedSiteImport: {
      buttonRef: managedSiteImportButtonRef,
      highlighted: isManagedSiteImportHighlighted,
      managedSiteLabel: getManagedSiteLabel(t, managedSiteType),
      managedSiteType,
      onImport: handleImportToManagedSite,
    },
  }
}

export type RuntimeKeyIntegrationActionsController = ReturnType<
  typeof useRuntimeKeyIntegrationActions
>

import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"

import { useFeatureGuidanceContext } from "~/contexts/FeatureGuidanceContext"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  API_CREDENTIAL_PROFILE_EXPORT_ACTIONS,
  type ApiCredentialProfileExportAction,
} from "~/features/ApiCredentialProfiles/contracts"
import type { DeeplinkExportTarget } from "~/features/CredentialExport/DeeplinkExportDialog"
import { useChannelDialog } from "~/features/ManagedSiteChannels/editor/ChannelDialog"
import { createProfileCredentialExportData } from "~/services/apiCredentialProfiles/credentialExport"
import { OpenInCherryStudio } from "~/services/integrations/cherryStudio"
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
import { assertNever } from "~/utils/core/assert"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { showResultToast } from "~/utils/feedback/operationFeedback"

const logger = createLogger("ApiCredentialProfilesController")
const apiCredentialProfilesFeature =
  PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles
const apiCredentialProfilesRefreshSurface =
  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesRowActions
const optionsEntrypoint = PRODUCT_ANALYTICS_ENTRYPOINTS.Options

/** Owns export destinations, their pending profiles and completion feedback. */
export function useApiCredentialProfileExportSession() {
  const { t } = useTranslation([
    "apiCredentialProfiles",
    "aiApiVerification",
    "common",
    "messages",
    "settings",
  ])
  const { claudeCodeRouterBaseUrl, claudeCodeRouterApiKey } =
    useUserPreferencesContext()
  const { markGatewayGuidanceOnboardingCompleted } = useFeatureGuidanceContext()
  const { openWithCredentials } = useChannelDialog()
  const [deeplinkExportProfile, setDeeplinkExportProfile] = useState<{
    target: DeeplinkExportTarget
    profile: ApiCredentialProfile
  } | null>(null)
  const [cursorPlusProfile, setCursorPlusProfile] =
    useState<ApiCredentialProfile | null>(null)
  const [kiloCodeProfile, setKiloCodeProfile] =
    useState<ApiCredentialProfile | null>(null)
  const [kelivoProfile, setKelivoProfile] =
    useState<ApiCredentialProfile | null>(null)

  const [claudeCodeRouterProfile, setClaudeCodeRouterProfile] =
    useState<ApiCredentialProfile | null>(null)

  const handleExport = useCallback(
    (
      profile: ApiCredentialProfile,
      action: ApiCredentialProfileExportAction,
    ) => {
      if (action === API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.CherryStudio) {
        const tracker = startProductAnalyticsAction({
          featureId: apiCredentialProfilesFeature,
          actionId:
            PRODUCT_ANALYTICS_ACTION_IDS.ExportApiCredentialProfileToCherryStudio,
          surfaceId: apiCredentialProfilesRefreshSurface,
          entrypoint: optionsEntrypoint,
        })

        try {
          OpenInCherryStudio(createProfileCredentialExportData(profile))
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
        } catch (error) {
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
            errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          })
          throw error
        }
        return
      }

      if (action === API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.Kelivo) {
        setKelivoProfile(profile)
        return
      }

      // Deeplink exports share their action values with DEEPLINK_EXPORT_TARGETS,
      // so the narrowed action is itself the dialog's destination.
      if (
        action === API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.CCSwitch ||
        action === API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.AiToolbox
      ) {
        setDeeplinkExportProfile({ target: action, profile })
        return
      }

      if (action === API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.CursorPlus) {
        setCursorPlusProfile(profile)
        return
      }

      if (action === API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.KiloCode) {
        setKiloCodeProfile(profile)
        return
      }

      if (action === API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.ClaudeCodeRouter) {
        if (!claudeCodeRouterBaseUrl?.trim()) {
          showResultToast({
            success: false,
            message: t("messages:claudeCodeRouter.configMissing"),
          })
          return
        }
        setClaudeCodeRouterProfile(profile)
        return
      }

      if (action === API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.ManagedSite) {
        const tracker = startProductAnalyticsAction({
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.ImportManagedSiteSingleToken,
          surfaceId: apiCredentialProfilesRefreshSurface,
          entrypoint: optionsEntrypoint,
        })

        void openWithCredentials(
          {
            name: profile.name,
            baseUrl: profile.baseUrl,
            apiKey: profile.apiKey,
            apiType: profile.apiType,
          },
          (result) => {
            showResultToast(result)
            if (result?.success) {
              void Promise.resolve(
                markGatewayGuidanceOnboardingCompleted(),
              ).catch((error) => {
                logger.warn(
                  "Failed to mark gateway guidance onboarding complete.",
                  error,
                )
              })
            }
          },
        )
          .then((result) =>
            tracker.complete(
              result?.opened || result?.deferred
                ? PRODUCT_ANALYTICS_RESULTS.Success
                : PRODUCT_ANALYTICS_RESULTS.Skipped,
            ),
          )
          .catch((error) => {
            tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
              errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
            })
            showResultToast({
              success: false,
              message: t("messages:errors.operation.failed", {
                error: getErrorMessage(error, t("messages:errors.unknown")),
              }),
            })
            logger.warn(
              "Failed to complete managed site import analytics.",
              error,
            )
          })
        return
      }

      return assertNever(action, `Unexpected export action: ${action}`)
    },
    [
      claudeCodeRouterBaseUrl,

      markGatewayGuidanceOnboardingCompleted,
      openWithCredentials,
      t,
    ],
  )

  return {
    deeplinkExportProfile,
    setDeeplinkExportProfile,
    cursorPlusProfile,
    setCursorPlusProfile,
    kiloCodeProfile,
    setKiloCodeProfile,
    kelivoProfile,
    setKelivoProfile,
    claudeCodeRouterProfile,
    setClaudeCodeRouterProfile,
    claudeCodeRouterBaseUrl,
    claudeCodeRouterApiKey,
    handleExport,
  }
}

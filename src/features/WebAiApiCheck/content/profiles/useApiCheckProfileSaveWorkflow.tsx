import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"

import { parseDatePickerTimestamp } from "~/components/ui/datePickerValue"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { type ApiCheckOpenModalDetail } from "~/features/WebAiApiCheck/content/events"
import {
  buildApiCheckAnalyticsInsights,
  contentApiCheckAnalyticsScope,
} from "~/features/WebAiApiCheck/content/modal/apiCheckModalAnalytics"
import type { ApiCheckValidationError } from "~/features/WebAiApiCheck/content/modal/apiCheckModalTypes"
import { type useApiCheckProbeRunner } from "~/features/WebAiApiCheck/content/probes/useApiCheckProbeRunner"
import { normalizeApiCheckSourceUrl } from "~/features/WebAiApiCheck/content/profiles/apiCheckSourceUrl"
import { WEB_AI_API_CHECK_TEST_IDS } from "~/features/WebAiApiCheck/content/testIds"
import toast from "~/lib/notify/content"
import {
  resolveProductAnalyticsErrorCategoryFromError,
  startProductAnalyticsAction,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import { type ApiVerificationApiType } from "~/services/verification/aiApiVerification"
import {
  createProfileModelVerificationHistoryTarget,
  createProfileVerificationHistoryTarget,
  createVerificationHistorySummary,
  verificationResultHistoryStorage,
} from "~/services/verification/verificationResultHistory"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"
import { sendRuntimeMessage } from "~/utils/browser/runtimeMessages"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("ApiCheckProfileSaveWorkflow")

/**
 * Converts an HTML date input value into a local day-level timestamp.
 */
export function parseDateInputValue(value: string): number | null {
  return parseDatePickerTimestamp(value)
}

type SaveOptions = {
  draft: {
    baseUrl: string
    apiKey: string
    apiType: ApiVerificationApiType
    trigger: ApiCheckOpenModalDetail["trigger"]
    pageUrl: string
    notes: string
    sourceUrl: string
    expiresAtInput: string
    selectedTagIds: string[]
  }
  setValidationError: (error: ApiCheckValidationError | null) => void
  recordBaseUrlHistory: (baseUrl: string) => void
  getCurrentVerificationResultsSnapshot: ReturnType<
    typeof useApiCheckProbeRunner
  >["getCurrentVerificationResultsSnapshot"]
}
/** Saves a profile and links its pre-save verification history before success feedback. */
export function useApiCheckProfileSaveWorkflow({
  draft,
  setValidationError,
  recordBaseUrlHistory,
  getCurrentVerificationResultsSnapshot,
}: SaveOptions) {
  const {
    baseUrl,
    apiKey,
    apiType,
    trigger,
    pageUrl,
    notes,
    sourceUrl,
    expiresAtInput,
    selectedTagIds,
  } = draft
  const { t } = useTranslation(["webAiApiCheck", "common", "aiApiVerification"])
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const canSaveProfile = !!baseUrl.trim() && !!apiKey.trim() && !isSavingProfile

  const persistPreSaveVerificationHistory = useCallback(
    async (profileId: string) => {
      const snapshot = getCurrentVerificationResultsSnapshot()
      if (!snapshot) return

      const target = snapshot.modelId
        ? createProfileModelVerificationHistoryTarget(
            profileId,
            snapshot.modelId,
          )
        : createProfileVerificationHistoryTarget(profileId)
      if (!target) return

      const summary = createVerificationHistorySummary({
        target,
        apiType: snapshot.apiType,
        results: snapshot.results,
        preferredModelId: snapshot.modelId,
      })
      if (!summary) return

      try {
        await verificationResultHistoryStorage.upsertLatestSummary(summary)
      } catch (error) {
        logger.error("Failed to persist pre-save verification history", {
          error,
        })
      }
    },
    [getCurrentVerificationResultsSnapshot],
  )

  const handleSaveProfile = async () => {
    const tracker = startProductAnalyticsAction({
      ...contentApiCheckAnalyticsScope,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CreateApiCredentialProfile,
    })

    setValidationError(null)

    const trimmedBaseUrl = baseUrl.trim()
    const trimmedApiKey = apiKey.trim()

    if (!trimmedBaseUrl || !trimmedApiKey) {
      setValidationError("missing-credentials")
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
        insights: buildApiCheckAnalyticsInsights(apiType, trigger),
      })
      return
    }
    recordBaseUrlHistory(trimmedBaseUrl)

    const trimmedNotes = notes.trim()
    const normalizedSourceUrl = normalizeApiCheckSourceUrl(sourceUrl)
    const expiresAt = parseDateInputValue(expiresAtInput)

    setIsSavingProfile(true)
    try {
      const response = await sendWebAiApiCheckMessage(
        WebAiApiCheckMessageTypes.SaveProfile,
        {
          apiType,
          baseUrl: trimmedBaseUrl,
          apiKey: trimmedApiKey,
          pageUrl: pageUrl || window.location.href,
          ...(selectedTagIds.length > 0 ? { tagIds: selectedTagIds } : {}),
          ...(trimmedNotes ? { notes: trimmedNotes } : {}),
          ...(normalizedSourceUrl ? { sourceUrl: normalizedSourceUrl } : {}),
          ...(expiresAt !== null ? { expiresAt } : {}),
        },
      )

      if (response?.success) {
        await persistPreSaveVerificationHistory(response.profileId)

        toast.success(
          (toastInstance) => (
            <div className="gap-y-density-2 flex min-w-0 items-center gap-x-2">
              <span className="min-w-0 flex-1 truncate">
                {t("webAiApiCheck:modal.messages.savedToProfiles", {
                  name: typeof response.name === "string" ? response.name : "",
                })}
              </span>
              <button
                type="button"
                data-testid={
                  WEB_AI_API_CHECK_TEST_IDS.openApiProfilesToastButton
                }
                className="bg-primary text-primary-foreground hover:bg-primary/90 py-density-1 min-h-(--density-control-xs) shrink-0 rounded-md px-2 text-xs font-medium"
                onClick={() => {
                  void sendRuntimeMessage({
                    action: RuntimeActionIds.OpenSettingsApiCredentialProfiles,
                  }).catch(() => {})
                  toast.dismiss(toastInstance.id)
                }}
              >
                {t("webAiApiCheck:modal.actions.openApiProfiles")}
              </button>
            </div>
          ),
          { duration: 8000 },
        )
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
          insights: buildApiCheckAnalyticsInsights(apiType, trigger),
        })
      } else {
        toast.error(
          response?.error ||
            t("webAiApiCheck:modal.errors.saveToProfilesFailed"),
        )
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory:
            response?.errorCategory ??
            PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: buildApiCheckAnalyticsInsights(apiType, trigger),
        })
      }
    } catch (error) {
      toast.error(t("webAiApiCheck:modal.errors.saveToProfilesFailed"))
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: resolveProductAnalyticsErrorCategoryFromError(error),
        insights: buildApiCheckAnalyticsInsights(apiType, trigger),
      })
    } finally {
      setIsSavingProfile(false)
    }
  }
  return { canSaveProfile, isSavingProfile, saveProfile: handleSaveProfile }
}

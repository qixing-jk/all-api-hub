import { useId } from "react"
import { useTranslation } from "react-i18next"

import { SearchableSelect } from "~/components/ui"
import { getSelectFetchResult } from "~/components/ui/SelectFetchFeedback"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "~/features/ApiCredentialProfiles/testIds"
import { type useProfileVerification } from "~/features/ApiCredentialProfiles/verification/useProfileVerification"
import { buildProbeState } from "~/features/Verification/api/probeState"
import { VerificationConfigSection } from "~/features/Verification/api/VerificationConfigSection"
import { VerificationModeSelect } from "~/features/Verification/api/VerificationMode"
import {
  VerificationRequestProfileEnhancement,
  VerificationRequestProfileHint,
  VerificationRequestProfileSelect,
} from "~/features/Verification/api/VerificationRequestProfile"
import {
  API_TYPES,
  API_VERIFICATION_REQUEST_PROFILES,
  MODEL_TEST_MODALITIES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"
import { getApiVerificationApiTypeLabel } from "~/services/verification/aiApiVerification/i18n"

/** Connection controls; workspace layout and result rows stay with the dialog. */
export function ProfileVerificationConfiguration({
  controller,
}: {
  controller: Pick<
    ReturnType<typeof useProfileVerification>,
    | "isRunning"
    | "apiType"
    | "setApiType"
    | "modelId"
    | "setModelId"
    | "verificationMode"
    | "setVerificationMode"
    | "requestProfile"
    | "showRequestProfileHint"
    | "setRequestProfile"
    | "requestProfileEnhanced"
    | "setRequestProfileEnhanced"
    | "modelOptions"
    | "setModelOptions"
    | "isFetchingModels"
    | "setFetchModelsDiagnostic"
    | "fetchModelsError"
    | "fetchedModelCount"
    | "replaceProbes"
    | "setPersistedSummary"
    | "isAnyProbeRunning"
    | "canClose"
    | "hasApiTypeOverride"
    | "savedApiTypeLabel"
    | "fetchModels"
    | "modelModality"
    | "tools"
  >
}) {
  const { t } = useTranslation(["aiApiVerification", "apiCredentialProfiles"])
  const {
    isRunning,
    apiType,
    setApiType,
    modelId,
    setModelId,
    verificationMode,
    setVerificationMode,
    requestProfile,
    showRequestProfileHint,
    setRequestProfile,
    requestProfileEnhanced,
    setRequestProfileEnhanced,
    modelOptions,
    setModelOptions,
    isFetchingModels,
    setFetchModelsDiagnostic,
    fetchModelsError,
    fetchedModelCount,
    replaceProbes,
    setPersistedSummary,
    isAnyProbeRunning,
    canClose,
    hasApiTypeOverride,
    savedApiTypeLabel,
    fetchModels,
    modelModality,
    tools,
  } = controller
  const overrideHintId = useId()
  return (
    <div className="space-y-density-3">
      <VerificationConfigSection
        running={isRunning || isAnyProbeRunning || tools.isRunning}
      >
        <div className="grid grid-cols-1 gap-3">
          <div>
            <VerificationRequestProfileSelect
              value={requestProfile}
              apiType={apiType}
              onChange={setRequestProfile}
              disabled={!canClose}
            />
          </div>

          <div className="space-y-density-1-5">
            <div className="flex items-center gap-x-2 gap-y-density-2">
              <div className="text-xs text-muted-foreground">
                {t("aiApiVerification:verifyDialog.meta.apiType")}
              </div>
            </div>
            <SearchableSelect
              aria-label={t("aiApiVerification:verifyDialog.meta.apiType")}
              options={Object.values(API_TYPES).map((value) => ({
                value,
                label: getApiVerificationApiTypeLabel(t, value),
              }))}
              aria-describedby={hasApiTypeOverride ? overrideHintId : undefined}
              value={apiType}
              onChange={(value) => {
                const nextApiType = value as ApiVerificationApiType
                setApiType(nextApiType)
                setModelOptions([])
                setFetchModelsDiagnostic(null)
                setPersistedSummary(null)
                replaceProbes(buildProbeState(nextApiType, null, modelModality))
                void fetchModels(nextApiType)
              }}
              disabled={!canClose}
            />
            {hasApiTypeOverride && (
              <p
                id={overrideHintId}
                className="text-xs text-muted-foreground"
                role="note"
              >
                {t("apiCredentialProfiles:verify.override.description", {
                  savedApiType: savedApiTypeLabel,
                })}
              </p>
            )}
          </div>

          <div className="space-y-density-1-5">
            <div className="flex items-center">
              <div className="text-xs text-muted-foreground">
                {t("aiApiVerification:verifyDialog.meta.model")}
              </div>
            </div>

            <SearchableSelect
              aria-label={t("aiApiVerification:verifyDialog.meta.model")}
              data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.verifyModelId}
              options={modelOptions.map((id) => ({
                value: id,
                label: id,
              }))}
              value={modelId}
              onChange={(value) => {
                setModelId(value)
                setPersistedSummary(null)
              }}
              placeholder={t(
                "apiCredentialProfiles:verify.modelPickerPlaceholder",
              )}
              loading={isFetchingModels}
              onRetryFetch={() => void fetchModels(apiType)}
              retryFetchDisabled={!canClose}
              fetchResult={getSelectFetchResult(
                fetchModelsError,
                fetchedModelCount,
              )}
              allowCustomValue
              disabled={!canClose}
            />
          </div>

          {modelModality === MODEL_TEST_MODALITIES.Text ? (
            <VerificationModeSelect
              value={verificationMode}
              onChange={setVerificationMode}
              disabled={!canClose}
            />
          ) : null}

          {(modelModality === MODEL_TEST_MODALITIES.Image ||
            modelModality === MODEL_TEST_MODALITIES.Video) && (
            <div className="col-span-full rounded-md border border-warning-border bg-warning-soft px-3 py-density-2 text-xs text-warning-soft-foreground">
              {modelModality === MODEL_TEST_MODALITIES.Image
                ? t("aiApiVerification:verifyDialog.modalityNotice.image")
                : t("aiApiVerification:verifyDialog.modalityNotice.video")}
            </div>
          )}
        </div>
        {requestProfile !== API_VERIFICATION_REQUEST_PROFILES.Default && (
          <div className="mt-density-3">
            <VerificationRequestProfileEnhancement
              value={requestProfileEnhanced}
              onChange={setRequestProfileEnhanced}
              disabled={!canClose}
            />
          </div>
        )}
      </VerificationConfigSection>
      {showRequestProfileHint && (
        <VerificationRequestProfileHint profile={requestProfile} />
      )}
    </div>
  )
}

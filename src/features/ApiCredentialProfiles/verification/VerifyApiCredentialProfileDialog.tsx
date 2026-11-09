import { useId } from "react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import {
  ActionGroup,
  Button,
  BUTTON_LOADING_BEHAVIORS,
  SearchableSelect,
} from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import { getSelectFetchResult } from "~/components/ui/SelectFetchFeedback"
import {
  API_CREDENTIAL_PROFILES_TEST_IDS,
  getApiCredentialProfileVerifyProbeTestId,
} from "~/features/ApiCredentialProfiles/testIds"
import {
  useProfileVerification,
  type VerifyApiCredentialProfileDialogProps,
} from "~/features/ApiCredentialProfiles/verification/useProfileVerification"
import { buildProbeState } from "~/features/Verification/api/probeState"
import { getVerificationProbeSummary } from "~/features/Verification/api/probeSummary"
import { VERIFICATION_SOURCE_KINDS } from "~/features/Verification/api/types"
import {
  VerificationConfigSection,
  VerificationDialogHeader,
  VerificationSourceSubtitle,
  VerificationTestSection,
} from "~/features/Verification/api/VerificationLayout"
import { VerificationModeSelect } from "~/features/Verification/api/VerificationMode"
import { VerificationProbeRow } from "~/features/Verification/api/VerificationProbeRow"
import {
  VerificationRequestProfileEnhancement,
  VerificationRequestProfileHint,
  VerificationRequestProfileSelect,
} from "~/features/Verification/api/VerificationRequestProfile"
import { VerificationToolsPanel } from "~/features/Verification/api/VerificationToolsPanel"
import { cn } from "~/lib/utils"
import {
  API_TYPES,
  API_VERIFICATION_REQUEST_PROFILES,
  MODEL_TEST_MODALITIES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"
import {
  getApiVerificationApiTypeLabel,
  getApiVerificationProbeLabel,
} from "~/services/verification/aiApiVerification/i18n"

/** Render the feature through its state and command owner. */
export function VerifyApiCredentialProfileDialog(
  props: VerifyApiCredentialProfileDialogProps,
) {
  const overrideHintId = useId()
  const { isOpen, onClose, profile } = props
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
    isPersisting,
    activeProbeIds,
    historyTarget,
    probes,
    replaceProbes,
    persistedSummary,
    setPersistedSummary,
    isAnyProbeRunning,
    canClose,
    hasApiTypeOverride,
    savedApiTypeLabel,
    fetchModels,
    clearHistory,
    runSingleProbe,
    stopProbe,
    stopRun,
    runAll,
    modelModality,
    tools,
  } = useProfileVerification(props)
  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        {historyTarget ? (
          <Button variant="outline" onClick={clearHistory} disabled={!canClose}>
            {t("aiApiVerification:verifyDialog.history.clear")}
          </Button>
        ) : null}
      </div>
      <ActionGroup className="ml-auto">
        <Button
          variant="secondary"
          onClick={onClose}
          disabled={!canClose}
          data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.verifyDialogCloseButton}
        >
          {t("aiApiVerification:verifyDialog.actions.close")}
        </Button>
        <Tooltip
          anchorAsChild
          content={t("aiApiVerification:verifyDialog.actions.runAllHint")}
        >
          <Button
            variant={isRunning ? "secondary" : "default"}
            onClick={isRunning ? stopRun : runAll}
            disabled={
              !isRunning && (isPersisting || isAnyProbeRunning || !profile)
            }
            loading={isRunning}
            loadingBehavior={BUTTON_LOADING_BEHAVIORS.Interactive}
          >
            {isRunning
              ? t("aiApiVerification:verifyDialog.actions.stop")
              : t("aiApiVerification:verifyDialog.actions.runAll")}
          </Button>
        </Tooltip>
      </ActionGroup>
    </div>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={canClose ? onClose : () => {}}
      headerTestId="verification-header"
      header={
        <VerificationDialogHeader
          title={t("aiApiVerification:verifyDialog.title")}
          subtitle={
            profile ? (
              <VerificationSourceSubtitle
                sourceKind={VERIFICATION_SOURCE_KINDS.Profile}
                baseUrl={profile.baseUrl}
                name={profile.name}
              />
            ) : null
          }
          historySummary={historyTarget ? persistedSummary : undefined}
        />
      }
      footer={footer}
      size="xl"
      panelClassName="max-w-6xl [&>[data-slot=modal-body]]:py-density-4"
      closeOnEsc={canClose}
      closeOnBackdropClick={canClose}
    >
      {!profile ? null : (
        <div className="space-y-density-3 sm:space-y-density-4">
          <div className="space-y-density-3">
            <VerificationConfigSection>
              <div
                className={cn(
                  "gap-y-density-2 sm:gap-y-density-3 grid grid-cols-1 gap-x-3 sm:grid-cols-2",
                  modelModality === MODEL_TEST_MODALITIES.Text
                    ? "lg:grid-cols-4"
                    : "lg:grid-cols-3",
                )}
              >
                <div>
                  <VerificationRequestProfileSelect
                    value={requestProfile}
                    apiType={apiType}
                    onChange={setRequestProfile}
                    disabled={!canClose}
                  />
                </div>

                <div className="space-y-density-1-5">
                  <div className="gap-y-density-2 flex items-center gap-x-2">
                    <div className="text-muted-foreground text-xs">
                      {t("aiApiVerification:verifyDialog.meta.apiType")}
                    </div>
                  </div>
                  <SearchableSelect
                    aria-label={t(
                      "aiApiVerification:verifyDialog.meta.apiType",
                    )}
                    options={Object.values(API_TYPES).map((value) => ({
                      value,
                      label: getApiVerificationApiTypeLabel(t, value),
                    }))}
                    aria-describedby={
                      hasApiTypeOverride ? overrideHintId : undefined
                    }
                    value={apiType}
                    onChange={(value) => {
                      const nextApiType = value as ApiVerificationApiType
                      setApiType(nextApiType)
                      setModelOptions([])
                      setFetchModelsDiagnostic(null)
                      setPersistedSummary(null)
                      replaceProbes(
                        buildProbeState(nextApiType, null, modelModality),
                      )
                      void fetchModels(nextApiType)
                    }}
                    disabled={!canClose}
                  />
                  {hasApiTypeOverride && (
                    <p
                      id={overrideHintId}
                      className="text-muted-foreground text-xs"
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
                    <div className="text-muted-foreground text-xs">
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
                  <div className="border-warning-border bg-warning-soft text-warning-soft-foreground py-density-2 col-span-full rounded-md border px-3 text-xs">
                    {modelModality === MODEL_TEST_MODALITIES.Image
                      ? t("aiApiVerification:verifyDialog.modalityNotice.image")
                      : t(
                          "aiApiVerification:verifyDialog.modalityNotice.video",
                        )}
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
          <VerificationTestSection
            tools={<VerificationToolsPanel controller={tools} />}
          >
            {probes.map((probe) => {
              const result = probe.result
              const isDisabledForModel =
                probe.definition.requiresModelId && !modelId.trim()
              // The row is interruptible only while it owns an abortable
              // request; the persistence that follows is busy but not stoppable.
              const canStopProbe = probe.isRunning
              const isProbePersisting =
                !canStopProbe && activeProbeIds.has(probe.definition.id)
              const probeActionLabel = canStopProbe
                ? t("aiApiVerification:verifyDialog.actions.stop")
                : isProbePersisting
                  ? t("aiApiVerification:verifyDialog.actions.running")
                  : probe.attempts > 0
                    ? t("aiApiVerification:verifyDialog.actions.retry")
                    : t("aiApiVerification:verifyDialog.actions.runOne")

              const resultSummary = isDisabledForModel
                ? t("aiApiVerification:verifyDialog.requiresModelId")
                : getVerificationProbeSummary(t, probe.definition.id, result)

              return (
                <div
                  key={probe.definition.id}
                  data-testid={getApiCredentialProfileVerifyProbeTestId(
                    probe.definition.id,
                  )}
                >
                  <VerificationProbeRow
                    historical={probe.historical}
                    isRunning={probe.isRunning}
                    controller={tools}
                    probeId={probe.definition.id}
                    result={result}
                    summary={resultSummary}
                    runButtonProps={{
                      onClick: () => {
                        if (canStopProbe) {
                          stopProbe(probe.definition.id)
                          return
                        }
                        void runSingleProbe(probe.definition.id)
                      },
                      "data-testid":
                        API_CREDENTIAL_PROFILES_TEST_IDS.verifyProbeRunButton,
                      loadingBehavior: canStopProbe
                        ? BUTTON_LOADING_BEHAVIORS.Interactive
                        : BUTTON_LOADING_BEHAVIORS.Disabled,
                      loading: canStopProbe || isProbePersisting,
                      "aria-label": canStopProbe
                        ? t(
                            "aiApiVerification:verifyDialog.actions.stopProbe",
                            {
                              probe: getApiVerificationProbeLabel(
                                t,
                                probe.definition.id,
                              ),
                            },
                          )
                        : undefined,
                      disabled:
                        isRunning ||
                        isProbePersisting ||
                        (!canStopProbe && (isDisabledForModel || !profile)),
                      children: probeActionLabel,
                    }}
                  />
                </div>
              )
            })}
          </VerificationTestSection>
        </div>
      )}
    </Modal>
  )
}

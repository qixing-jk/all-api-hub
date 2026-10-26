import { useTranslation } from "react-i18next"

import {
  ActionGroup,
  Alert,
  Badge,
  Button,
  BUTTON_LOADING_BEHAVIORS,
  SearchableSelect,
} from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import {
  API_CREDENTIAL_PROFILES_TEST_IDS,
  getApiCredentialProfileVerifyProbeTestId,
} from "~/features/ApiCredentialProfiles/testIds"
import {
  useProfileVerification,
  type VerifyApiCredentialProfileDialogProps,
} from "~/features/ApiCredentialProfiles/verification/useProfileVerification"
import { buildProbeState } from "~/features/Verification/api/probeState"
import { ProbeStatusBadge } from "~/features/Verification/api/ProbeStatusBadge"
import {
  VerificationConfigSection,
  VerificationDialogHeader,
  VerificationSourceSubtitle,
  VerificationTestSection,
} from "~/features/Verification/api/VerificationLayout"
import { VerificationModeSelect } from "~/features/Verification/api/VerificationMode"
import { VerificationProbeDetails } from "~/features/Verification/api/VerificationProbeDetails"
import { VerificationRequestProfileSelect } from "~/features/Verification/api/VerificationRequestProfile"
import { VerificationRunButton } from "~/features/Verification/api/VerificationRunButton"
import { VerificationTestLabel } from "~/features/Verification/api/VerificationTestLabel"
import { VerificationToolsPanel } from "~/features/Verification/api/VerificationToolsPanel"
import {
  API_TYPES,
  API_VERIFICATION_PROBE_STATUSES,
  MODEL_TEST_MODALITIES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"
import {
  getApiVerificationApiTypeLabel,
  getApiVerificationProbeLabel,
  translateApiVerificationSummary,
} from "~/services/verification/aiApiVerification/i18n"

/** Render the feature through its state and command owner. */
export function VerifyApiCredentialProfileDialog(
  props: VerifyApiCredentialProfileDialogProps,
) {
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
    setRequestProfile,
    requestProfileEnhanced,
    setRequestProfileEnhanced,
    modelOptions,
    setModelOptions,
    isFetchingModels,
    setFetchModelsDiagnostic,
    fetchModelsError,
    isPersisting,
    activeProbeId,
    historyTarget,
    probes,
    replaceProbes,
    persistedSummary,
    setPersistedSummary,
    isAnyProbeRunning,
    canClose,
    hasAnyResult,
    hasApiTypeOverride,
    savedApiTypeLabel,
    currentApiTypeLabel,
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
    <div className="gap-y-density-2 flex flex-col gap-x-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        {historyTarget ? (
          <Button variant="outline" onClick={clearHistory} disabled={!canClose}>
            {t("aiApiVerification:verifyDialog.history.clear")}
          </Button>
        ) : null}
      </div>
      <ActionGroup>
        <Button
          variant="secondary"
          onClick={onClose}
          disabled={!canClose}
          data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.verifyDialogCloseButton}
        >
          {t("aiApiVerification:verifyDialog.actions.close")}
        </Button>
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
            : t("aiApiVerification:verifyDialog.actions.run")}
        </Button>
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
                baseUrl={profile.baseUrl}
                name={profile.name}
              />
            ) : null
          }
          historySummary={historyTarget ? persistedSummary : undefined}
        />
      }
      footer={footer}
      size="lg"
      closeOnEsc={canClose}
      closeOnBackdropClick={canClose}
    >
      {!profile ? null : (
        <div className="space-y-density-6">
          <div className="space-y-density-3">
            <VerificationConfigSection>
              <div className="gap-y-density-3 grid grid-cols-1 gap-x-3 sm:grid-cols-2">
                <div className="space-y-density-1-5">
                  <div className="gap-y-density-2 flex min-h-(--density-control-tight) items-center gap-x-2">
                    <div className="text-muted-foreground text-xs">
                      {t("aiApiVerification:verifyDialog.meta.apiType")}
                    </div>
                    {hasApiTypeOverride ? (
                      <Badge variant="warning" size="sm">
                        {t("apiCredentialProfiles:verify.override.badge")}
                      </Badge>
                    ) : null}
                  </div>
                  <SearchableSelect
                    aria-label={t(
                      "aiApiVerification:verifyDialog.meta.apiType",
                    )}
                    options={[
                      {
                        value: API_TYPES.OPENAI_COMPATIBLE,
                        label: getApiVerificationApiTypeLabel(
                          t,
                          API_TYPES.OPENAI_COMPATIBLE,
                        ),
                      },
                      {
                        value: API_TYPES.OPENAI,
                        label: getApiVerificationApiTypeLabel(
                          t,
                          API_TYPES.OPENAI,
                        ),
                      },
                      {
                        value: API_TYPES.ANTHROPIC,
                        label: getApiVerificationApiTypeLabel(
                          t,
                          API_TYPES.ANTHROPIC,
                        ),
                      },
                      {
                        value: API_TYPES.GOOGLE,
                        label: getApiVerificationApiTypeLabel(
                          t,
                          API_TYPES.GOOGLE,
                        ),
                      },
                    ]}
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
                </div>

                <div className="space-y-density-1-5">
                  <div className="flex min-h-(--density-control-tight) items-center">
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
                    allowCustomValue
                    disabled={!canClose}
                  />

                  {fetchModelsError ? (
                    <div className="text-destructive-text text-xs">
                      {fetchModelsError}
                    </div>
                  ) : null}
                </div>

                {modelModality === MODEL_TEST_MODALITIES.Text ? (
                  <VerificationModeSelect
                    value={verificationMode}
                    onChange={setVerificationMode}
                    disabled={!canClose}
                    labelRowClassName="min-h-(--density-control-tight)"
                  />
                ) : null}

                <div>
                  <VerificationRequestProfileSelect
                    value={requestProfile}
                    enhanced={requestProfileEnhanced}
                    onEnhancedChange={setRequestProfileEnhanced}
                    onChange={setRequestProfile}
                    disabled={!canClose}
                    labelRowClassName="min-h-(--density-control-tight)"
                  />
                </div>

                {(modelModality === MODEL_TEST_MODALITIES.Image ||
                  modelModality === MODEL_TEST_MODALITIES.Video) && (
                  <div className="border-warning-border bg-warning-soft text-warning-soft-foreground py-density-2 rounded-md border px-3 text-xs sm:col-span-2">
                    {modelModality === MODEL_TEST_MODALITIES.Image
                      ? t("aiApiVerification:verifyDialog.modalityNotice.image")
                      : t(
                          "aiApiVerification:verifyDialog.modalityNotice.video",
                        )}
                  </div>
                )}
              </div>
            </VerificationConfigSection>

            {hasApiTypeOverride ? (
              <Alert
                variant="warning"
                title={t("apiCredentialProfiles:verify.override.title")}
                description={t(
                  "apiCredentialProfiles:verify.override.description",
                  {
                    savedApiType: savedApiTypeLabel,
                    currentApiType: currentApiTypeLabel,
                  },
                )}
              />
            ) : null}

            {!hasAnyResult && (
              <div className="dark:text-secondary-foreground text-muted-foreground text-sm">
                {t("apiCredentialProfiles:verify.idleHint")}
              </div>
            )}
          </div>
          <VerificationTestSection>
            {probes.map((probe) => {
              const result = probe.result
              const isDisabledForModel =
                probe.definition.requiresModelId && !modelId.trim()
              // The row is interruptible only while it owns an abortable
              // request; the persistence that follows is busy but not stoppable.
              const canStopProbe = probe.isRunning
              const isProbePersisting =
                !canStopProbe && activeProbeId === probe.definition.id
              const probeActionLabel = canStopProbe
                ? t("aiApiVerification:verifyDialog.actions.stop")
                : isProbePersisting
                  ? t("aiApiVerification:verifyDialog.actions.running")
                  : probe.attempts > 0
                    ? t("aiApiVerification:verifyDialog.actions.retry")
                    : t("aiApiVerification:verifyDialog.actions.runOne")

              const resultSummary = isDisabledForModel
                ? t("aiApiVerification:verifyDialog.requiresModelId")
                : result?.summaryKey
                  ? translateApiVerificationSummary(
                      t,
                      result.summaryKey,
                      result.summaryParams,
                    ) ?? result.summary
                  : result?.status ===
                      API_VERIFICATION_PROBE_STATUSES.Unsupported
                    ? t(
                        "aiApiVerification:verifyDialog.unsupportedProbeForApiType",
                        {
                          probe: getApiVerificationProbeLabel(
                            t,
                            probe.definition.id,
                          ),
                        },
                      )
                    : result
                      ? result.summary
                      : t("aiApiVerification:verifyDialog.notRunYet")

              return (
                <div
                  key={probe.definition.id}
                  data-testid={getApiCredentialProfileVerifyProbeTestId(
                    probe.definition.id,
                  )}
                >
                  <VerificationProbeDetails
                    controller={tools}
                    probeId={probe.definition.id}
                    result={result}
                    heading={
                      <div className="min-w-0 flex-1">
                        <div className="gap-y-density-1 flex min-w-0 flex-wrap items-center gap-x-2">
                          <div className="text-foreground min-w-0 truncate text-sm font-medium">
                            <VerificationTestLabel testId={probe.definition.id}>
                              {getApiVerificationProbeLabel(
                                t,
                                probe.definition.id,
                              )}
                            </VerificationTestLabel>
                          </div>

                          <div className="gap-y-density-2 flex items-center gap-x-2">
                            {result ? (
                              <ProbeStatusBadge result={result} />
                            ) : (
                              <Badge variant="outline" size="sm">
                                {t(
                                  "aiApiVerification:verifyDialog.status.pending",
                                )}
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="dark:text-secondary-foreground text-muted-foreground mt-density-1 text-xs">
                          {resultSummary}
                        </div>
                      </div>
                    }
                    action={
                      <VerificationRunButton
                        onClick={() => {
                          if (canStopProbe) {
                            stopProbe(probe.definition.id)
                            return
                          }
                          void runSingleProbe(probe.definition.id)
                        }}
                        data-testid={
                          API_CREDENTIAL_PROFILES_TEST_IDS.verifyProbeRunButton
                        }
                        loadingBehavior={
                          canStopProbe
                            ? BUTTON_LOADING_BEHAVIORS.Interactive
                            : BUTTON_LOADING_BEHAVIORS.Disabled
                        }
                        loading={canStopProbe || isProbePersisting}
                        aria-label={
                          canStopProbe
                            ? t(
                                "aiApiVerification:verifyDialog.actions.stopProbe",
                                {
                                  probe: getApiVerificationProbeLabel(
                                    t,
                                    probe.definition.id,
                                  ),
                                },
                              )
                            : undefined
                        }
                        disabled={
                          isRunning ||
                          isPersisting ||
                          (!canStopProbe &&
                            (isAnyProbeRunning ||
                              isDisabledForModel ||
                              !profile))
                        }
                      >
                        {probeActionLabel}
                      </VerificationRunButton>
                    }
                  />
                </div>
              )
            })}
            <VerificationToolsPanel controller={tools} />
          </VerificationTestSection>
        </div>
      )}
    </Modal>
  )
}

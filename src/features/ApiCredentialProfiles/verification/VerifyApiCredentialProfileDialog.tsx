import { useTranslation } from "react-i18next"

import { buildProbeState } from "~/components/dialogs/VerifyApiDialog/probeState"
import { ProbeStatusBadge } from "~/components/dialogs/VerifyApiDialog/ProbeStatusBadge"
import {
  formatLatency,
  safeJsonStringify,
} from "~/components/dialogs/VerifyApiDialog/utils"
import { VerificationHistorySummary } from "~/components/dialogs/VerifyApiDialog/VerificationHistorySummary"
import { VerificationModeSelect } from "~/components/dialogs/VerifyApiDialog/VerificationMode"
import {
  ActionGroup,
  Alert,
  Badge,
  Button,
  BUTTON_LOADING_BEHAVIORS,
  CollapsibleSection,
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
import {
  API_TYPES,
  API_VERIFICATION_PROBE_STATUSES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"
import {
  getApiVerificationApiTypeLabel,
  getApiVerificationProbeLabel,
  translateApiVerificationSummary,
} from "~/services/verification/aiApiVerification/i18n"

/** Render the feature through its state and command owner. */
export function VerifyApiCredentialProfileDialog({
  isOpen,
  onClose,
  profile,
  initialModelId,
}: VerifyApiCredentialProfileDialogProps) {
  const { t } = useTranslation(["aiApiVerification", "apiCredentialProfiles"])
  const {
    isRunning,
    apiType,
    setApiType,
    modelId,
    setModelId,
    verificationMode,
    setVerificationMode,
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
    header,
    fetchModels,
    clearHistory,
    runSingleProbe,
    stopProbe,
    stopRun,
    runAll,
  } = useProfileVerification({ isOpen, onClose, profile, initialModelId })
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
      header={header}
      footer={footer}
      size="lg"
      closeOnEsc={canClose}
      closeOnBackdropClick={canClose}
    >
      {!profile ? null : (
        <div className="space-y-density-3">
          {historyTarget ? (
            <div className="dark:border-border border-border-subtle gap-y-density-2 py-density-3 flex flex-wrap items-center gap-x-2 rounded-md border px-3 text-sm">
              <VerificationHistorySummary summary={persistedSummary} />
            </div>
          ) : null}

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
                aria-label={t("aiApiVerification:verifyDialog.meta.apiType")}
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
                    label: getApiVerificationApiTypeLabel(t, API_TYPES.OPENAI),
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
                    label: getApiVerificationApiTypeLabel(t, API_TYPES.GOOGLE),
                  },
                ]}
                value={apiType}
                onChange={(value) => {
                  const nextApiType = value as ApiVerificationApiType
                  setApiType(nextApiType)
                  setModelOptions([])
                  setFetchModelsDiagnostic(null)
                  setPersistedSummary(null)
                  replaceProbes(buildProbeState(nextApiType))
                  void fetchModels(nextApiType)
                }}
                disabled={!canClose}
              />
            </div>

            <VerificationModeSelect
              value={verificationMode}
              onChange={setVerificationMode}
              disabled={!canClose}
              labelRowClassName="min-h-(--density-control-tight)"
            />

            <div className="space-y-density-1-5 sm:col-span-2">
              <div className="flex min-h-(--density-control-tight) items-center">
                <div className="text-muted-foreground text-xs">
                  {t("aiApiVerification:verifyDialog.meta.model")}
                </div>
              </div>

              <SearchableSelect
                aria-label={t("aiApiVerification:verifyDialog.meta.model")}
                data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.verifyModelId}
                options={modelOptions.map((id) => ({ value: id, label: id }))}
                value={modelId}
                onChange={(value) => {
                  setModelId(value)
                  setPersistedSummary(null)
                }}
                placeholder={
                  isFetchingModels
                    ? t("apiCredentialProfiles:verify.fetchingModels")
                    : t("apiCredentialProfiles:verify.modelPickerPlaceholder")
                }
                allowCustomValue
                disabled={!canClose}
              />

              {fetchModelsError ? (
                <div className="text-destructive-text text-xs">
                  {fetchModelsError}
                </div>
              ) : null}
            </div>
          </div>

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

          <Alert variant="warning">
            <p>{t("aiApiVerification:verifyDialog.warning")}</p>
          </Alert>

          <div className="space-y-density-2">
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
                  className="dark:border-border border-border-subtle py-density-3 rounded-md border px-3"
                >
                  <div className="gap-y-density-2 flex items-start justify-between gap-x-2">
                    <div className="min-w-0 flex-1">
                      <div className="gap-y-density-1 flex min-w-0 flex-wrap items-center gap-x-2">
                        <div className="text-foreground min-w-0 truncate text-sm font-medium">
                          {getApiVerificationProbeLabel(t, probe.definition.id)}
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
                          <div className="text-muted-foreground text-xs">
                            {result ? formatLatency(result.latencyMs) : "-"}
                          </div>
                        </div>
                      </div>

                      <div className="dark:text-secondary-foreground text-muted-foreground mt-density-1 text-xs">
                        {resultSummary}
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="secondary"
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
                          (isAnyProbeRunning || isDisabledForModel || !profile))
                      }
                    >
                      {probeActionLabel}
                    </Button>
                  </div>

                  {result &&
                    (result.input !== undefined ||
                      result.output !== undefined) && (
                      <div className="mt-density-3 space-y-density-2">
                        {result.input !== undefined && (
                          <CollapsibleSection
                            title={t(
                              "aiApiVerification:verifyDialog.details.input",
                            )}
                          >
                            <pre className="text-secondary-foreground overflow-auto text-xs break-words whitespace-pre-wrap">
                              {safeJsonStringify(result.input)}
                            </pre>
                          </CollapsibleSection>
                        )}
                        {result.output !== undefined && (
                          <CollapsibleSection
                            title={t(
                              "aiApiVerification:verifyDialog.details.output",
                            )}
                          >
                            <pre className="text-secondary-foreground overflow-auto text-xs break-words whitespace-pre-wrap">
                              {safeJsonStringify(result.output)}
                            </pre>
                          </CollapsibleSection>
                        )}
                      </div>
                    )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Modal>
  )
}

import { useTranslation } from "react-i18next"

import {
  ActionGroup,
  Alert,
  Badge,
  Button,
  BUTTON_LOADING_BEHAVIORS,
  Input,
  SearchableSelect,
} from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import { ProbeStatusBadge } from "~/features/Verification/api/ProbeStatusBadge"
import type { VerifyApiDialogProps } from "~/features/Verification/api/types"
import { useVerifyApiDialogViewModel } from "~/features/Verification/api/useVerifyApiDialogViewModel"
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
import type { ApiVerificationApiType } from "~/services/verification/aiApiVerification"
import {
  API_TYPES,
  API_VERIFICATION_PROBE_STATUSES,
  MODEL_TEST_MODALITIES,
} from "~/services/verification/aiApiVerification"
import {
  getApiVerificationApiTypeLabel,
  getApiVerificationProbeLabel,
  translateApiVerificationSummary,
} from "~/services/verification/aiApiVerification/i18n"

/**
 * Modal dialog that runs API verification for a selected runtime key + model.
 */
export function VerifyApiDialog(props: VerifyApiDialogProps) {
  const {
    isOpen,
    onClose,
    account,
    initialModelId,
    initialSupportedEndpointTypes,
    modelEnableGroups,
    onManageModelKey,
  } = props
  const { t } = useTranslation("aiApiVerification")

  const {
    isRunning,
    isLoadingRuntimeKeys,
    accountRuntimeKeys,
    selectedRuntimeKeyId,
    setSelectedRuntimeKeyId,
    apiType,
    setApiType,
    modelId,
    setModelId,
    verificationMode,
    setVerificationMode,
    requestProfile,
    requestProfileEnhanced,
    setRequestProfileEnhanced,
    setRequestProfile,
    historyTarget,
    probes,
    persistedSummary,
    selectedRuntimeKey,
    compatibleRuntimeKeyIds,
    selectedRuntimeKeyIsCompatible,
    runtimeKeyCompatibilityHint,
    tokenModelHint,
    canClose,
    hasAnyResult,
    clearHistory,
    canRunAll,
    runAll,
    stopRun,
    stopProbe,
    runSingleProbe,
    modelModality,
    tools,
  } = useVerifyApiDialogViewModel({
    isOpen,
    account,
    initialModelId,
    initialSupportedEndpointTypes,
    modelEnableGroups,
  })

  const runtimeKeyPlaceholder = isLoadingRuntimeKeys
    ? t("verifyDialog.loadingRuntimeKeysHint")
    : t("verifyDialog.meta.runtimeKeyPlaceholder")

  const footer = (
    <div className="gap-y-density-2 flex flex-col gap-x-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        {historyTarget ? (
          <Button variant="outline" onClick={clearHistory} disabled={!canClose}>
            {t("verifyDialog.history.clear")}
          </Button>
        ) : null}
      </div>
      <ActionGroup>
        <Button variant="secondary" onClick={onClose} disabled={!canClose}>
          {t("verifyDialog.actions.close")}
        </Button>
        <Button
          variant={isRunning ? "secondary" : "default"}
          onClick={isRunning ? stopRun : runAll}
          disabled={!isRunning && (isLoadingRuntimeKeys || !canRunAll)}
          loading={isRunning}
          loadingBehavior={BUTTON_LOADING_BEHAVIORS.Interactive}
        >
          {isRunning
            ? t("verifyDialog.actions.stop")
            : t("verifyDialog.actions.run")}
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
          title={t("verifyDialog.title")}
          subtitle={
            <VerificationSourceSubtitle
              baseUrl={account.baseUrl}
              name={account.name}
            />
          }
          historySummary={historyTarget ? persistedSummary : undefined}
        />
      }
      footer={footer}
      size="lg"
      closeOnEsc={canClose}
      closeOnBackdropClick={canClose}
    >
      <div className="space-y-density-6">
        <div className="space-y-density-3">
          <VerificationConfigSection>
            <div className="gap-y-density-3 grid grid-cols-1 gap-x-3 sm:grid-cols-2">
              <div className="space-y-density-1-5">
                <div className="text-muted-foreground text-xs">
                  {t("verifyDialog.meta.runtimeKey")}
                </div>
                <SearchableSelect
                  options={[
                    {
                      value: "",
                      label: runtimeKeyPlaceholder,
                    },
                    ...accountRuntimeKeys.map((runtimeKey) => {
                      const isCompatible = compatibleRuntimeKeyIds.has(
                        runtimeKey.id,
                      )
                      return {
                        value: runtimeKey.id,
                        label: runtimeKey.label,
                        disabled: !isCompatible,
                        suffix: isCompatible ? undefined : (
                          <span className="text-faint-foreground text-xs">
                            {t("verifyDialog.meta.runtimeKeyIncompatible")}
                          </span>
                        ),
                      }
                    }),
                  ]}
                  aria-label={t("verifyDialog.meta.runtimeKey")}
                  value={isLoadingRuntimeKeys ? "" : selectedRuntimeKeyId}
                  onChange={setSelectedRuntimeKeyId}
                  loading={isLoadingRuntimeKeys}
                  disabled={isLoadingRuntimeKeys}
                  placeholder={runtimeKeyPlaceholder}
                />
                {runtimeKeyCompatibilityHint ? (
                  <div className="space-y-density-1-5">
                    <div className="text-destructive-text text-xs" role="alert">
                      {runtimeKeyCompatibilityHint}
                    </div>
                    {onManageModelKey ? (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto min-h-0 px-0 py-0 text-xs"
                        onClick={onManageModelKey}
                      >
                        {t("verifyDialog.actions.manageModelKey")}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="space-y-density-1-5">
                <div className="text-muted-foreground text-xs">
                  {t("verifyDialog.meta.apiType")}
                </div>
                <SearchableSelect
                  options={[
                    // Keep a fixed display order for the supported API types.
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
                  aria-label={t("verifyDialog.meta.apiType")}
                  value={apiType}
                  onChange={(value) =>
                    setApiType(value as ApiVerificationApiType)
                  }
                  disabled={isRunning}
                  placeholder={t("verifyDialog.meta.apiTypePlaceholder")}
                />
              </div>

              <div className="space-y-density-1-5 sm:col-span-2">
                <div className="text-muted-foreground text-xs">
                  {t("verifyDialog.meta.model")}
                </div>
                <Input
                  className="bg-card"
                  aria-label={t("verifyDialog.meta.model")}
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  placeholder={t("verifyDialog.meta.modelPlaceholder")}
                  disabled={isRunning}
                />
              </div>

              {modelModality === MODEL_TEST_MODALITIES.Text && (
                <VerificationModeSelect
                  value={verificationMode}
                  onChange={setVerificationMode}
                  disabled={!canClose}
                />
              )}

              <div>
                <VerificationRequestProfileSelect
                  value={requestProfile}
                  enhanced={requestProfileEnhanced}
                  onEnhancedChange={setRequestProfileEnhanced}
                  onChange={setRequestProfile}
                  disabled={!canClose}
                />
              </div>
            </div>
          </VerificationConfigSection>

          {(modelModality === MODEL_TEST_MODALITIES.Image ||
            modelModality === MODEL_TEST_MODALITIES.Video) && (
            <Alert variant="info">
              <p>
                {modelModality === MODEL_TEST_MODALITIES.Image
                  ? t("verifyDialog.modalityNotice.image")
                  : t("verifyDialog.modalityNotice.video")}
              </p>
            </Alert>
          )}

          {!hasAnyResult && (
            <div className="dark:text-secondary-foreground text-muted-foreground text-sm">
              {t("verifyDialog.idleHint")}
            </div>
          )}
        </div>
        <VerificationTestSection>
          {probes.map((probe) => {
            const result = probe.result
            const isDisabledForModel =
              probe.definition.requiresModelId &&
              !modelId.trim() &&
              !tokenModelHint
            const resultSummary = isDisabledForModel
              ? t("verifyDialog.requiresModelId")
              : result?.summaryKey
                ? translateApiVerificationSummary(
                    t,
                    result.summaryKey,
                    result.summaryParams,
                  ) ?? result.summary
                : result?.status === API_VERIFICATION_PROBE_STATUSES.Unsupported
                  ? t("verifyDialog.unsupportedProbeForApiType", {
                      probe: getApiVerificationProbeLabel(
                        t,
                        probe.definition.id,
                      ),
                    })
                  : result
                    ? result.summary
                    : t("verifyDialog.notRunYet")
            return (
              <div
                key={probe.definition.id}
                data-testid={`verify-probe-${probe.definition.id}`}
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
                              {t("verifyDialog.status.pending")}
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
                      onClick={() =>
                        probe.isRunning
                          ? stopProbe(probe.definition.id)
                          : runSingleProbe(probe.definition.id)
                      }
                      loading={probe.isRunning}
                      loadingBehavior={BUTTON_LOADING_BEHAVIORS.Interactive}
                      aria-label={
                        probe.isRunning
                          ? t("verifyDialog.actions.stopProbe", {
                              probe: getApiVerificationProbeLabel(
                                t,
                                probe.definition.id,
                              ),
                            })
                          : undefined
                      }
                      disabled={
                        isRunning ||
                        isLoadingRuntimeKeys ||
                        (!probe.isRunning &&
                          (!selectedRuntimeKey ||
                            !selectedRuntimeKeyIsCompatible ||
                            isDisabledForModel))
                      }
                    >
                      {probe.isRunning
                        ? t("verifyDialog.actions.stop")
                        : probe.attempts > 0
                          ? t("verifyDialog.actions.retry")
                          : t("verifyDialog.actions.runOne")}
                    </VerificationRunButton>
                  }
                />
              </div>
            )
          })}
          <VerificationToolsPanel controller={tools} />
        </VerificationTestSection>
      </div>
    </Modal>
  )
}

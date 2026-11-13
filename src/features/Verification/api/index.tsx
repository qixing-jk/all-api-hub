import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { ActionGroup, Button, BUTTON_LOADING_BEHAVIORS } from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import { getVerificationProbeSummary } from "~/features/Verification/api/probeSummary"
import type { VerifyApiDialogProps } from "~/features/Verification/api/types"
import { VERIFICATION_SOURCE_KINDS } from "~/features/Verification/api/types"
import { useVerifyApiDialogViewModel } from "~/features/Verification/api/useVerifyApiDialogViewModel"
import {
  VerificationDialogHeader,
  VerificationSourceSubtitle,
} from "~/features/Verification/api/VerificationDialogHeader"
import { VerificationTestSection } from "~/features/Verification/api/VerificationLayout"
import { VerificationProbeRow } from "~/features/Verification/api/VerificationProbeRow"
import { VerificationRunAllButton } from "~/features/Verification/api/VerificationRunAllButton"
import { VerificationToolsPanel } from "~/features/Verification/api/VerificationToolsPanel"
import { API_VERIFICATION_PROBE_IDS } from "~/services/verification/aiApiVerification"
import { getApiVerificationProbeLabel } from "~/services/verification/aiApiVerification/i18n"

import { AccountVerificationConfiguration } from "./AccountVerificationConfiguration"

/**
 * Modal dialog that runs API verification for a selected runtime key + model.
 */
export function VerifyApiDialog(props: VerifyApiDialogProps) {
  const {
    isOpen,
    onClose,
    account,
    initialRequestProfile,
    initialModelId,
    initialSupportedEndpointTypes,
    modelEnableGroups,
    onManageModelKey,
  } = props
  const { t } = useTranslation("aiApiVerification")

  const controller = useVerifyApiDialogViewModel({
    isOpen,
    account,
    initialModelId,
    initialRequestProfile,
    initialSupportedEndpointTypes,
    modelEnableGroups,
  })
  const {
    isRunning,
    isLoadingRuntimeKeys,
    runtimeKeysLoadFailed,
    reloadRuntimeKeys,
    modelId,
    setModelId,
    historyTarget,
    probes,
    persistedSummary,
    selectedRuntimeKey,
    selectedRuntimeKeyIsCompatible,
    runtimeKeyCompatibilityHint,
    tokenModelHint,
    canClose,
    clearHistory,
    canRunAll,
    concurrency,
    runAll,
    stopRun,
    stopProbe,
    runSingleProbe,
    tools,
  } = controller

  const modelsProbe = probes.find(
    (probe) => probe.definition.id === API_VERIFICATION_PROBE_IDS.Models,
  )
  const probeModels = useMemo(() => {
    if (
      modelsProbe?.result?.output &&
      typeof modelsProbe.result.output === "object" &&
      "modelIdsPreview" in modelsProbe.result.output &&
      Array.isArray(modelsProbe.result.output.modelIdsPreview)
    ) {
      return modelsProbe.result.output.modelIdsPreview.filter(
        (id): id is string => typeof id === "string",
      )
    }
    return []
  }, [modelsProbe?.result?.output])

  const suggestedModelOptions = useMemo(() => {
    const set = new Set<string>()
    const options: Array<{ value: string; label: string; group?: string }> = []

    const addModel = (id: string | undefined, group?: string) => {
      const trimmed = id?.trim()
      if (!trimmed || set.has(trimmed)) return
      set.add(trimmed)
      options.push({ value: trimmed, label: trimmed, group })
    }

    if (modelId) addModel(modelId)
    if (initialModelId) addModel(initialModelId)
    if (tokenModelHint) addModel(tokenModelHint)

    for (const id of selectedRuntimeKey?.modelAccess.suggestedModelIds ?? []) {
      addModel(
        id,
        t("verifyDialog.modelSelector.suggestedModels", {
          defaultValue: "Suggested Models",
        }),
      )
    }

    for (const id of probeModels) {
      addModel(
        id,
        t("verifyDialog.modelSelector.discoveredModels", {
          defaultValue: "Discovered Models",
        }),
      )
    }

    return options
  }, [
    modelId,
    initialModelId,
    tokenModelHint,
    selectedRuntimeKey?.modelAccess.suggestedModelIds,
    probeModels,
    t,
  ])

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        {historyTarget ? (
          <Button variant="outline" onClick={clearHistory} disabled={!canClose}>
            {t("verifyDialog.history.clear")}
          </Button>
        ) : null}
      </div>
      <ActionGroup className="ml-auto">
        <Button
          variant="secondary"
          onClick={onClose}
          disabled={!canClose}
          className="hidden min-[52rem]:inline-flex"
        >
          {t("verifyDialog.actions.close")}
        </Button>
        <VerificationRunAllButton
          isRunning={isRunning}
          disabled={!isRunning && (isLoadingRuntimeKeys || !canRunAll)}
          concurrency={concurrency}
          onRun={runAll}
          onStop={stopRun}
        />
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
              sourceKind={VERIFICATION_SOURCE_KINDS.Account}
              baseUrl={account.baseUrl}
              name={account.name}
            />
          }
          historySummary={historyTarget ? persistedSummary : undefined}
        />
      }
      footer={footer}
      size="xl"
      panelClassName="verification-dialog max-w-[100rem] [&>[data-slot=modal-body]]:p-0"
      closeOnEsc={canClose}
      closeOnBackdropClick={canClose}
    >
      <div className="space-y-density-3 sm:space-y-density-4">
        <VerificationTestSection
          configurationWarning={
            isLoadingRuntimeKeys ? undefined : runtimeKeysLoadFailed ? (
              <div className="flex flex-wrap items-center gap-2">
                <span>{t("verifyDialog.errors.loadRuntimeKeysFailed")}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void reloadRuntimeKeys()}
                  disabled={!canClose}
                >
                  {t("verifyDialog.actions.retry")}
                </Button>
              </div>
            ) : (
              (runtimeKeyCompatibilityHint ??
              (!selectedRuntimeKey
                ? t("verifyDialog.requiresRuntimeKey")
                : undefined))
            )
          }
          running={isRunning}
          model={{
            modelId,
            onModelChange: setModelId,
            options: suggestedModelOptions,
            disabled: !canClose || isLoadingRuntimeKeys,
          }}
          configuration={
            <AccountVerificationConfiguration
              controller={controller}
              account={account}
              onManageModelKey={onManageModelKey}
            />
          }
          tools={<VerificationToolsPanel controller={tools} />}
        >
          {probes.map((probe) => {
            const result = probe.result
            const isDisabledForModel =
              probe.definition.requiresModelId &&
              !modelId.trim() &&
              !tokenModelHint
            const resultSummary = isDisabledForModel
              ? t("verifyDialog.requiresModelId")
              : getVerificationProbeSummary(t, probe.definition.id, result)
            return (
              <div
                key={probe.definition.id}
                data-testid={`verify-probe-${probe.definition.id}`}
              >
                <VerificationProbeRow
                  progress={probe.progress}
                  startedAt={probe.startedAt}
                  historical={probe.historical}
                  isRunning={probe.isRunning}
                  controller={tools}
                  probeId={probe.definition.id}
                  result={result}
                  summary={resultSummary}
                  runButtonProps={{
                    onClick: () =>
                      probe.isRunning
                        ? stopProbe(probe.definition.id)
                        : runSingleProbe(probe.definition.id),
                    loading: probe.isRunning,
                    loadingBehavior: BUTTON_LOADING_BEHAVIORS.Interactive,
                    "aria-label": probe.isRunning
                      ? t("verifyDialog.actions.stopProbe", {
                          probe: getApiVerificationProbeLabel(
                            t,
                            probe.definition.id,
                          ),
                        })
                      : undefined,
                    disabled:
                      isRunning ||
                      isLoadingRuntimeKeys ||
                      (!probe.isRunning &&
                        (!selectedRuntimeKey ||
                          !selectedRuntimeKeyIsCompatible ||
                          isDisabledForModel)),
                    children: probe.isRunning
                      ? t("verifyDialog.actions.stop")
                      : probe.attempts > 0
                        ? t("verifyDialog.actions.retry")
                        : t("verifyDialog.actions.runOne"),
                  }}
                />
              </div>
            )
          })}
        </VerificationTestSection>
      </div>
    </Modal>
  )
}

import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { ProbeStatusBadge } from "~/components/dialogs/VerifyApiDialog/ProbeStatusBadge"
import { VerificationHistorySummary } from "~/components/dialogs/VerifyApiDialog/VerificationHistorySummary"
import {
  ActionGroup,
  Alert,
  Badge,
  Button,
  BUTTON_LOADING_BEHAVIORS,
  CollapsibleSection,
  Heading5,
  Input,
  SearchableSelect,
} from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import type { ApiVerificationApiType } from "~/services/verification/aiApiVerification"
import {
  API_TYPES,
  API_VERIFICATION_PROBE_STATUSES,
} from "~/services/verification/aiApiVerification"
import {
  getApiVerificationApiTypeLabel,
  getApiVerificationProbeLabel,
  translateApiVerificationSummary,
} from "~/services/verification/aiApiVerification/i18n"

import type { VerifyApiDialogProps } from "./types"
import { useVerifyApiDialogViewModel } from "./useVerifyApiDialogViewModel"
import { formatLatency, safeJsonStringify } from "./utils"
import { VerificationModeSelect } from "./VerificationMode"

/**
 * Modal dialog that runs API verification for a selected runtime key + model.
 */
export function VerifyApiDialog(props: VerifyApiDialogProps) {
  const {
    isOpen,
    onClose,
    account,
    initialModelId,
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
  } = useVerifyApiDialogViewModel({
    isOpen,
    account,
    initialModelId,
    modelEnableGroups,
  })

  const header = useMemo(() => {
    return (
      <div className="min-w-0">
        <Heading5 className="truncate">{t("verifyDialog.title")}</Heading5>
        <div className="text-muted-foreground mt-density-1 truncate text-xs">
          {account.baseUrl} · {account.name}
        </div>
      </div>
    )
  }, [account.baseUrl, account.name, t])

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
      header={header}
      footer={footer}
      size="lg"
      closeOnEsc={canClose}
      closeOnBackdropClick={canClose}
    >
      <div className="space-y-density-3">
        {historyTarget ? (
          <div className="dark:border-border border-border-subtle gap-y-density-2 py-density-3 flex flex-wrap items-center gap-x-2 rounded-md border px-3 text-sm">
            <VerificationHistorySummary summary={persistedSummary} />
          </div>
        ) : null}

        <div className="gap-y-density-3 grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          <div className="space-y-density-1-5">
            <div className="text-muted-foreground text-xs">
              {t("verifyDialog.meta.runtimeKey")}
            </div>
            <SearchableSelect
              options={[
                {
                  value: "",
                  label: t("verifyDialog.meta.runtimeKeyPlaceholder"),
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
              value={selectedRuntimeKeyId}
              onChange={setSelectedRuntimeKeyId}
              disabled={isLoadingRuntimeKeys}
              placeholder={t("verifyDialog.meta.runtimeKeyPlaceholder")}
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
                  label: getApiVerificationApiTypeLabel(t, API_TYPES.OPENAI),
                },
                {
                  value: API_TYPES.ANTHROPIC,
                  label: getApiVerificationApiTypeLabel(t, API_TYPES.ANTHROPIC),
                },
                {
                  value: API_TYPES.GOOGLE,
                  label: getApiVerificationApiTypeLabel(t, API_TYPES.GOOGLE),
                },
              ]}
              value={apiType}
              onChange={(value) => setApiType(value as ApiVerificationApiType)}
              disabled={isRunning}
              placeholder={t("verifyDialog.meta.apiTypePlaceholder")}
            />
          </div>

          <VerificationModeSelect
            value={verificationMode}
            onChange={setVerificationMode}
            disabled={!canClose}
          />

          <div className="space-y-density-1-5">
            <div className="text-muted-foreground text-xs">
              {t("verifyDialog.meta.model")}
            </div>
            <Input
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder={t("verifyDialog.meta.modelPlaceholder")}
              disabled={isRunning}
            />
          </div>
        </div>

        {!hasAnyResult && (
          <div className="dark:text-secondary-foreground text-muted-foreground text-sm">
            {isLoadingRuntimeKeys
              ? t("verifyDialog.loadingRuntimeKeysHint")
              : t("verifyDialog.idleHint")}
          </div>
        )}

        <Alert variant="warning">
          <p>{t("verifyDialog.warning")}</p>
        </Alert>

        <div className="space-y-density-2">
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
                            {t("verifyDialog.status.pending")}
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
                  </Button>
                </div>

                {result &&
                  (result.input !== undefined ||
                    result.output !== undefined) && (
                    <div className="mt-density-3 space-y-density-2">
                      {result.input !== undefined && (
                        <CollapsibleSection
                          title={t("verifyDialog.details.input")}
                        >
                          <pre className="text-secondary-foreground overflow-auto text-xs break-words whitespace-pre-wrap">
                            {safeJsonStringify(result.input)}
                          </pre>
                        </CollapsibleSection>
                      )}
                      {result.output !== undefined && (
                        <CollapsibleSection
                          title={t("verifyDialog.details.output")}
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
    </Modal>
  )
}

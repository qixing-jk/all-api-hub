import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import {
  VerificationModeBadge,
  VerificationModeSelect,
} from "~/components/dialogs/VerifyApiDialog/VerificationMode"
import { ToolStatusBadge } from "~/components/dialogs/VerifyCliSupportDialog/ToolStatusBadge"
import type { VerifyCliSupportDialogProps } from "~/components/dialogs/VerifyCliSupportDialog/types"
import {
  formatLatency,
  safeJsonStringify,
} from "~/components/dialogs/VerifyCliSupportDialog/utils"
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
import { isSelectableAccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import {
  getCliSupportToolLabel,
  translateCliSupportSummary,
} from "~/services/verification/cliSupportVerification/i18n"

import { useCliSupportVerification } from "./hooks/useCliSupportVerification"

/** CLI verification view for an account runtime key or a saved profile. */
export function VerifyCliSupportDialog(props: VerifyCliSupportDialogProps) {
  const { isOpen, onClose } = props
  const { t } = useTranslation("cliSupportVerification")
  const {
    isProfileSource,
    sourceBaseUrl,
    sourceName,
    modelId,
    setModelId,
    verificationMode,
    setVerificationMode,
    isRunning,
    isLoadingRuntimeKeys,
    accountRuntimeKeys,
    selectedRuntimeKeyId,
    setSelectedRuntimeKeyId,
    isLoadingModels,
    fetchModelsError,
    tools,
    hasRunnableSource,
    modelOptions,
    tokenModelHint,
    resolvedModelId,
    canClose,
    hasAnyResult,
    stopSingleTool,
    runSingleToolCheck,
    runAll,
    stopRun,
    canRunAll,
  } = useCliSupportVerification(props)
  const header = useMemo(() => {
    return (
      <div className="min-w-0">
        <Heading5 className="truncate">{t("verifyDialog.title")}</Heading5>
        <div className="text-muted-foreground mt-density-1 truncate text-xs">
          {sourceBaseUrl} · {sourceName}
        </div>
      </div>
    )
  }, [sourceBaseUrl, sourceName, t])

  const footer = (
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
        <div className="gap-y-density-3 grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          {!isProfileSource && (
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
                  ...accountRuntimeKeys.map((runtimeKey) => ({
                    value: runtimeKey.id,
                    label: runtimeKey.label,
                    disabled: !isSelectableAccountRuntimeKey(runtimeKey),
                  })),
                ]}
                value={selectedRuntimeKeyId}
                onChange={setSelectedRuntimeKeyId}
                disabled={isLoadingRuntimeKeys}
                placeholder={t("verifyDialog.meta.runtimeKeyPlaceholder")}
                data-testid="verify-cli-runtime-key-id"
              />
            </div>
          )}

          <VerificationModeSelect
            value={verificationMode}
            onChange={setVerificationMode}
            disabled={!canClose}
          />

          <div
            className={
              isProfileSource
                ? "space-y-density-1-5"
                : "space-y-density-1-5 sm:col-span-2"
            }
          >
            <div className="text-muted-foreground text-xs">
              {t("verifyDialog.meta.model")}
            </div>
            {isProfileSource ? (
              <>
                <SearchableSelect
                  aria-label={t("verifyDialog.meta.model")}
                  data-testid="verify-cli-model-id"
                  options={modelOptions.map((id) => ({ value: id, label: id }))}
                  value={modelId}
                  onChange={setModelId}
                  placeholder={
                    isLoadingModels
                      ? t("verifyDialog.loadingModelsHint")
                      : t("verifyDialog.modelPickerPlaceholder")
                  }
                  allowCustomValue
                  disabled={isRunning}
                />
                {fetchModelsError ? (
                  <div className="text-destructive-text text-xs">
                    {fetchModelsError}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <Input
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  placeholder={t("verifyDialog.meta.modelPlaceholder")}
                  disabled={isRunning}
                />
                {tokenModelHint && !modelId.trim() && (
                  <div className="text-muted-foreground text-xs">
                    {t("verifyDialog.modelHint", {
                      modelId: tokenModelHint,
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {!hasAnyResult && (
          <div className="dark:text-secondary-foreground text-muted-foreground text-sm">
            {isProfileSource
              ? isLoadingModels
                ? t("verifyDialog.loadingModelsHint")
                : t("verifyDialog.profileIdleHint")
              : isLoadingRuntimeKeys
                ? t("verifyDialog.loadingRuntimeKeysHint")
                : t("verifyDialog.idleHint")}
          </div>
        )}

        <Alert variant="warning">
          <p>{t("verifyDialog.warning")}</p>
        </Alert>

        <div className="space-y-density-2">
          {tools.map((tool) => {
            const result = tool.result
            const isDisabledForModel = !resolvedModelId.trim()
            const stopTool = () => stopSingleTool(tool.toolId)
            const runSingleTool = () => runSingleToolCheck(tool.toolId)

            const resultSummary = isDisabledForModel
              ? t("verifyDialog.requiresModelId")
              : result?.summaryKey
                ? translateCliSupportSummary(
                    t,
                    result.summaryKey,
                    result.summaryParams,
                  ) ?? result.summary
                : result
                  ? result.summary
                  : t("verifyDialog.notRunYet")

            return (
              <div
                key={tool.toolId}
                data-testid={`verify-cli-${tool.toolId}`}
                className="dark:border-border border-border-subtle py-density-3 rounded-md border px-3"
              >
                <div className="gap-y-density-2 flex items-start justify-between gap-x-2">
                  <div className="min-w-0 flex-1">
                    <div className="gap-y-density-1 flex min-w-0 flex-wrap items-center gap-x-2">
                      <div className="text-foreground min-w-0 truncate text-sm font-medium">
                        {getCliSupportToolLabel(t, tool.toolId)}
                      </div>

                      <div className="gap-y-density-2 flex flex-wrap items-center gap-x-2">
                        {result ? (
                          <>
                            <ToolStatusBadge result={result} />
                            <VerificationModeBadge mode={result.mode} />
                          </>
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
                    onClick={tool.isRunning ? stopTool : runSingleTool}
                    loading={tool.isRunning}
                    loadingBehavior={BUTTON_LOADING_BEHAVIORS.Interactive}
                    aria-label={
                      tool.isRunning
                        ? t("verifyDialog.actions.stopTool", {
                            tool: getCliSupportToolLabel(t, tool.toolId),
                          })
                        : undefined
                    }
                    disabled={
                      isRunning ||
                      isLoadingRuntimeKeys ||
                      (!tool.isRunning &&
                        (!hasRunnableSource || isDisabledForModel))
                    }
                  >
                    {tool.isRunning
                      ? t("verifyDialog.actions.stop")
                      : tool.attempts > 0
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

import { useTranslation } from "react-i18next"

import {
  ActionGroup,
  Badge,
  Button,
  BUTTON_LOADING_BEHAVIORS,
  Input,
  SearchableSelect,
} from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import {
  VerificationConfigSection,
  VerificationDialogHeader,
  VerificationSourceSubtitle,
  VerificationTestSection,
} from "~/features/Verification/api/VerificationLayout"
import { VerificationModeSelect } from "~/features/Verification/api/VerificationMode"
import { VerificationProbeDetails } from "~/features/Verification/api/VerificationProbeDetails"
import {
  VerificationRequestProfileBadge,
  VerificationRequestProfileEnhancement,
} from "~/features/Verification/api/VerificationRequestProfile"
import { VerificationRunButton } from "~/features/Verification/api/VerificationRunButton"
import { VerificationTestLabel } from "~/features/Verification/api/VerificationTestLabel"
import { VerificationToolsPanel } from "~/features/Verification/api/VerificationToolsPanel"
import { useCliSupportVerification } from "~/features/Verification/cli/hooks/useCliSupportVerification"
import { ToolStatusBadge } from "~/features/Verification/cli/ToolStatusBadge"
import type { VerifyCliSupportDialogProps } from "~/features/Verification/cli/types"
import { isSelectableAccountRuntimeKey } from "~/services/accounts/keys/accountRuntimeKeys"
import {
  getCliSupportToolLabel,
  translateCliSupportSummary,
} from "~/services/verification/cliSupportVerification/i18n"

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
    requestProfileEnhanced,
    setRequestProfileEnhanced,
    hasAnyResult,
    stopSingleTool,
    runSingleToolCheck,
    runAll,
    stopRun,
    sharedTools,
    canRunAll,
  } = useCliSupportVerification(props)
  const runtimeKeyPlaceholder = isLoadingRuntimeKeys
    ? t("verifyDialog.loadingRuntimeKeysHint")
    : t("verifyDialog.meta.runtimeKeyPlaceholder")

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
      headerTestId="verification-header"
      header={
        <VerificationDialogHeader
          title={t("verifyDialog.title")}
          subtitle={
            <VerificationSourceSubtitle
              baseUrl={sourceBaseUrl}
              name={sourceName}
            />
          }
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
              {!isProfileSource && (
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
                      ...accountRuntimeKeys.map((runtimeKey) => ({
                        value: runtimeKey.id,
                        label: runtimeKey.label,
                        disabled: !isSelectableAccountRuntimeKey(runtimeKey),
                      })),
                    ]}
                    value={isLoadingRuntimeKeys ? "" : selectedRuntimeKeyId}
                    onChange={setSelectedRuntimeKeyId}
                    loading={isLoadingRuntimeKeys}
                    disabled={isLoadingRuntimeKeys}
                    placeholder={runtimeKeyPlaceholder}
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
                      options={modelOptions.map((id) => ({
                        value: id,
                        label: id,
                      }))}
                      value={modelId}
                      onChange={setModelId}
                      placeholder={t("verifyDialog.modelPickerPlaceholder")}
                      loading={isLoadingModels}
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
                      className="bg-card"
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

            <VerificationRequestProfileEnhancement
              value={requestProfileEnhanced}
              onChange={setRequestProfileEnhanced}
              disabled={!canClose}
            />
          </VerificationConfigSection>

          {!hasAnyResult && (
            <div className="dark:text-secondary-foreground text-muted-foreground text-sm">
              {isProfileSource
                ? isLoadingModels
                  ? t("verifyDialog.loadingModelsHint")
                  : t("verifyDialog.profileIdleHint")
                : t("verifyDialog.idleHint")}
            </div>
          )}
        </div>
        <VerificationTestSection>
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
              <div key={tool.toolId} data-testid={`verify-cli-${tool.toolId}`}>
                <VerificationProbeDetails
                  result={result}
                  heading={
                    <div className="min-w-0 flex-1">
                      <div className="gap-y-density-1 flex min-w-0 flex-wrap items-center gap-x-2">
                        <div className="text-foreground min-w-0 truncate text-sm font-medium">
                          <VerificationTestLabel testId={tool.toolId}>
                            {getCliSupportToolLabel(t, tool.toolId)}
                          </VerificationTestLabel>
                        </div>

                        <div className="gap-y-density-2 flex flex-wrap items-center gap-x-2">
                          {result ? (
                            <>
                              <ToolStatusBadge result={result} />
                              {result.requestProfileEnhanced && (
                                <VerificationRequestProfileBadge
                                  profile={result.requestProfile}
                                  enhanced
                                />
                              )}
                            </>
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
                    </VerificationRunButton>
                  }
                />
              </div>
            )
          })}
          <VerificationToolsPanel controller={sharedTools} />
        </VerificationTestSection>
      </div>
    </Modal>
  )
}

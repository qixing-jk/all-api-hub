import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import {
  ActionGroup,
  Alert,
  Button,
  BUTTON_LOADING_BEHAVIORS,
  Input,
  SearchableSelect,
} from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import { getVerificationProbeSummary } from "~/features/Verification/api/probeSummary"
import { VERIFICATION_SOURCE_KINDS } from "~/features/Verification/api/types"
import type { VerifyApiDialogProps } from "~/features/Verification/api/types"
import { useVerifyApiDialogViewModel } from "~/features/Verification/api/useVerifyApiDialogViewModel"
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
  getInventorySecretAvailability,
  INVENTORY_SECRET_AVAILABILITIES,
} from "~/services/apiAdapters/contracts/inventorySecret"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import type { ApiVerificationApiType } from "~/services/verification/aiApiVerification"
import {
  API_TYPES,
  API_VERIFICATION_REQUEST_PROFILES,
  MODEL_TEST_MODALITIES,
} from "~/services/verification/aiApiVerification"
import {
  getApiVerificationApiTypeLabel,
  getApiVerificationProbeLabel,
} from "~/services/verification/aiApiVerification/i18n"

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
    showRequestProfileHint,
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
    initialRequestProfile,
    initialSupportedEndpointTypes,
    modelEnableGroups,
  })

  const runtimeKeyPlaceholder = isLoadingRuntimeKeys
    ? t("verifyDialog.loadingRuntimeKeysHint")
    : t("verifyDialog.meta.runtimeKeyPlaceholder")
  const keyResources = getSiteTypeCapabilities(account.siteType).account
    ?.keyResourceManagement
  const usesAssociatedCredential =
    keyResources &&
    getInventorySecretAvailability(keyResources) !==
      INVENTORY_SECRET_AVAILABILITIES.Recoverable &&
    !selectedRuntimeKey?.secret.trim()

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
        <Button variant="secondary" onClick={onClose} disabled={!canClose}>
          {t("verifyDialog.actions.close")}
        </Button>
        <Tooltip anchorAsChild content={t("verifyDialog.actions.runAllHint")}>
          <Button
            variant={isRunning ? "secondary" : "default"}
            onClick={isRunning ? stopRun : runAll}
            disabled={!isRunning && (isLoadingRuntimeKeys || !canRunAll)}
            loading={isRunning}
            loadingBehavior={BUTTON_LOADING_BEHAVIORS.Interactive}
          >
            {isRunning
              ? t("verifyDialog.actions.stop")
              : t("verifyDialog.actions.runAll")}
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
      panelClassName="max-w-6xl [&>[data-slot=modal-body]]:py-density-4"
      closeOnEsc={canClose}
      closeOnBackdropClick={canClose}
    >
      <div className="space-y-density-3 sm:space-y-density-4">
        <div className="space-y-density-3">
          <VerificationConfigSection>
            <div
              className={cn(
                "gap-y-density-2 sm:gap-y-density-3 grid grid-cols-1 gap-x-3 sm:grid-cols-2",
                modelModality === MODEL_TEST_MODALITIES.Text
                  ? "lg:grid-cols-[1fr_1fr_1.2fr_0.8fr_1.4fr]"
                  : "lg:grid-cols-[1fr_1fr_1.2fr_1.4fr]",
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
                <div className="text-muted-foreground text-xs">
                  {t("verifyDialog.meta.apiType")}
                </div>
                <SearchableSelect
                  options={Object.values(API_TYPES).map((value) => ({
                    value,
                    label: getApiVerificationApiTypeLabel(t, value),
                  }))}
                  aria-label={t("verifyDialog.meta.apiType")}
                  value={apiType}
                  onChange={(value) =>
                    setApiType(value as ApiVerificationApiType)
                  }
                  disabled={!canClose}
                  placeholder={t("verifyDialog.meta.apiTypePlaceholder")}
                />
              </div>

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
                {runtimeKeyCompatibilityHint || usesAssociatedCredential ? (
                  <div className="space-y-density-1-5">
                    {runtimeKeyCompatibilityHint && (
                      <div
                        className="text-destructive-text text-xs"
                        role="alert"
                      >
                        {runtimeKeyCompatibilityHint}
                      </div>
                    )}
                    {usesAssociatedCredential && (
                      <p className="text-muted-foreground text-xs" role="note">
                        {t("verifyDialog.associatedCredentialHint")}
                      </p>
                    )}
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

              {modelModality === MODEL_TEST_MODALITIES.Text && (
                <VerificationModeSelect
                  value={verificationMode}
                  onChange={setVerificationMode}
                  disabled={!canClose}
                />
              )}
              <div className="space-y-density-1-5 sm:col-span-2 lg:col-span-1">
                <div className="text-muted-foreground text-xs">
                  {t("verifyDialog.meta.model")}
                </div>
                <Input
                  className="bg-card"
                  aria-label={t("verifyDialog.meta.model")}
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  placeholder={t("verifyDialog.meta.modelPlaceholder")}
                  disabled={isRunning || tools.isRunning}
                />
              </div>
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
        </div>
        <VerificationTestSection
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

import { useTranslation } from "react-i18next"

import { Alert, Button, Input, SearchableSelect } from "~/components/ui"
import type { VerifyApiDialogProps } from "~/features/Verification/api/types"
import { type useVerifyApiDialogViewModel } from "~/features/Verification/api/useVerifyApiDialogViewModel"
import { VerificationConfigSection } from "~/features/Verification/api/VerificationConfigSection"
import { VerificationModeSelect } from "~/features/Verification/api/VerificationMode"
import {
  VerificationRequestProfileEnhancement,
  VerificationRequestProfileHint,
  VerificationRequestProfileSelect,
} from "~/features/Verification/api/VerificationRequestProfile"
import {
  getInventorySecretAvailability,
  INVENTORY_SECRET_AVAILABILITIES,
} from "~/services/apiAdapters/contracts/inventorySecret"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import {
  API_TYPES,
  API_VERIFICATION_REQUEST_PROFILES,
  MODEL_TEST_MODALITIES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"
import { getApiVerificationApiTypeLabel } from "~/services/verification/aiApiVerification/i18n"

/** Connection controls; workspace layout and result rows stay with the dialog. */
export function AccountVerificationConfiguration({
  controller,
  account,
  onManageModelKey,
}: {
  controller: Pick<
    ReturnType<typeof useVerifyApiDialogViewModel>,
    | "isRunning"
    | "isLoadingRuntimeKeys"
    | "accountRuntimeKeys"
    | "selectedRuntimeKeyId"
    | "setSelectedRuntimeKeyId"
    | "apiType"
    | "setApiType"
    | "modelId"
    | "setModelId"
    | "verificationMode"
    | "setVerificationMode"
    | "requestProfile"
    | "showRequestProfileHint"
    | "requestProfileEnhanced"
    | "setRequestProfileEnhanced"
    | "setRequestProfile"
    | "probes"
    | "selectedRuntimeKey"
    | "compatibleRuntimeKeyIds"
    | "runtimeKeyCompatibilityHint"
    | "canClose"
    | "modelModality"
    | "tools"
  >
  account: VerifyApiDialogProps["account"]
  onManageModelKey?: VerifyApiDialogProps["onManageModelKey"]
}) {
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
    probes,
    selectedRuntimeKey,
    compatibleRuntimeKeyIds,
    runtimeKeyCompatibilityHint,
    canClose,
    modelModality,
    tools,
  } = controller
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

  return (
    <div className="space-y-density-3">
      <VerificationConfigSection
        running={
          isRunning ||
          tools.isRunning ||
          probes.some((probe) => probe.isRunning)
        }
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
            <div className="text-xs text-muted-foreground">
              {t("verifyDialog.meta.apiType")}
            </div>
            <SearchableSelect
              options={Object.values(API_TYPES).map((value) => ({
                value,
                label: getApiVerificationApiTypeLabel(t, value),
              }))}
              aria-label={t("verifyDialog.meta.apiType")}
              value={apiType}
              onChange={(value) => setApiType(value as ApiVerificationApiType)}
              disabled={!canClose}
              placeholder={t("verifyDialog.meta.apiTypePlaceholder")}
            />
          </div>

          <div className="space-y-density-1-5">
            <div className="text-xs text-muted-foreground">
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
                      <span className="text-xs text-faint-foreground">
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
            {runtimeKeyCompatibilityHint ||
            usesAssociatedCredential ||
            (!isLoadingRuntimeKeys && !selectedRuntimeKey) ? (
              <div className="space-y-density-1-5">
                {usesAssociatedCredential && (
                  <p className="text-xs text-muted-foreground" role="note">
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
          <div className="space-y-density-1-5">
            <div className="text-xs text-muted-foreground">
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
  )
}

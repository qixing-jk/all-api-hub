import { ArrowPathIcon, CpuChipIcon } from "@heroicons/react/24/outline"
import { useId } from "react"
import { useTranslation } from "react-i18next"

import {
  Alert,
  Button,
  EmptyState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  WorkflowTransitionButton,
} from "~/components/ui"
import type { AccountFallbackControls } from "~/features/ModelList/hooks/useModelData"
import {
  MODEL_MANAGEMENT_SOURCE_KINDS,
  type ModelManagementSource,
} from "~/features/ModelList/modelManagementSources"
import type { DisplaySiteData } from "~/types"
import { openSiteSupportRequestPage } from "~/utils/navigation"

interface StatusIndicatorProps {
  selectedSource: ModelManagementSource | null
  isLoading: boolean
  dataFormatError: boolean
  loadErrorMessage: string | null
  currentAccount: DisplaySiteData | undefined
  loadPricingData: () => void
  accountFallback: AccountFallbackControls | null
  unsupportedSource: boolean
}

/**
 * Displays loading or error feedback for model pricing fetch status.
 * @param props Component props.
 * @param props.selectedSource Currently selected source.
 * @param props.isLoading Whether pricing data is loading.
 * @param props.dataFormatError Flag indicating invalid data format.
 * @param props.loadErrorMessage Current load error message, if any.
 * @param props.currentAccount Account details for navigation links.
 * @param props.loadPricingData Retry handler.
 * @param props.accountFallback Transient account-key fallback controls for the current account.
 * @param props.unsupportedSource Whether the selected source has no model-list route.
 * @returns Status UI for loading/error or null when idle.
 */
export function StatusIndicator({
  selectedSource,
  isLoading,
  dataFormatError,
  loadErrorMessage,
  currentAccount,
  loadPricingData,
  accountFallback,
  unsupportedSource,
}: StatusIndicatorProps) {
  const { t } = useTranslation("modelList")
  const fallbackRuntimeKeySelectId = `model-list-fallback-runtime-key-${useId()}`
  if (!selectedSource) {
    return (
      <EmptyState
        icon={<CpuChipIcon className="h-12 w-12" />}
        title={t("pleaseSelectFirst")}
      />
    )
  }

  if (isLoading) {
    return (
      <div className="py-12 text-center">
        <Spinner size="lg" className="mx-auto mb-4" />
        <p className="dark:text-dark-text-secondary text-sm text-gray-500">
          {t("status.loading")}
        </p>
      </div>
    )
  }

  if (
    unsupportedSource &&
    selectedSource.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT &&
    currentAccount
  ) {
    const handleRequestSiteSupport = () => {
      void openSiteSupportRequestPage({
        siteUrl: currentAccount.baseUrl,
        errorType: "model_list_unsupported",
        errorMessage: `Model list is not implemented for ${currentAccount.siteType}`,
      })
    }

    return (
      <EmptyState
        icon={<CpuChipIcon className="h-12 w-12" />}
        title={t("status.unsupportedSourceTitle")}
        description={t("status.unsupportedSourceDescription")}
        action={{
          label: t("status.requestSiteSupport"),
          onClick: handleRequestSiteSupport,
        }}
      />
    )
  }

  const isKeyScopedStatus =
    selectedSource.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT &&
    accountFallback?.statusScope === "runtime-key" &&
    accountFallback?.isAvailable === true &&
    !accountFallback.isActive

  const renderAccountFallbackSection = () => {
    if (!currentAccount || !accountFallback?.isAvailable) {
      return null
    }

    const requiresExplicitSelection = accountFallback.runtimeKeys.length > 1
    const canLoadWithSelectedKey =
      !accountFallback.isLoadingRuntimeKeys &&
      !accountFallback.isLoadingCatalog &&
      (!requiresExplicitSelection ||
        accountFallback.selectedRuntimeKeyId !== null)

    return (
      <div className="dark:border-dark-bg-tertiary mt-4 space-y-4 border-t border-gray-200 pt-4">
        <div>
          <h4 className="dark:text-dark-text-primary text-sm font-semibold text-gray-900">
            {isKeyScopedStatus
              ? t("status.runtimeKeyScopedCatalogFallbackTitle")
              : t("status.fallback.title")}
          </h4>
          <p className="dark:text-dark-text-secondary mt-1 text-sm text-gray-600">
            {isKeyScopedStatus
              ? t("status.runtimeKeyScopedCatalogFallbackDescription")
              : t("status.fallback.description")}
          </p>
        </div>

        {accountFallback.runtimeKeyLoadErrorMessage ? (
          <Alert
            variant="destructive"
            title={t("status.fallback.runtimeKeysLoadFailedTitle")}
            description={accountFallback.runtimeKeyLoadErrorMessage}
          >
            <div className="mt-3">
              <Button
                variant="secondary"
                onClick={accountFallback.loadRuntimeKeys}
                loading={accountFallback.isLoadingRuntimeKeys}
                leftIcon={
                  !accountFallback.isLoadingRuntimeKeys && (
                    <ArrowPathIcon className="h-4 w-4" />
                  )
                }
              >
                {t("status.fallback.reloadKeys")}
              </Button>
            </div>
          </Alert>
        ) : null}

        {!accountFallback.hasLoadedRuntimeKeys &&
        !accountFallback.runtimeKeyLoadErrorMessage ? (
          <div className="flex items-center gap-3 py-1">
            <Spinner size="sm" />
            <p className="dark:text-dark-text-secondary text-sm text-gray-600">
              {t("status.fallback.loadingKeys")}
            </p>
          </div>
        ) : null}

        {accountFallback.hasLoadedRuntimeKeys &&
        accountFallback.runtimeKeys.length === 0 ? (
          <Alert
            variant="info"
            title={t("status.fallback.noKeysTitle")}
            description={t("status.fallback.noKeysDescription")}
          >
            <div className="mt-3">
              <Button
                variant="secondary"
                onClick={accountFallback.loadRuntimeKeys}
                loading={accountFallback.isLoadingRuntimeKeys}
                leftIcon={
                  !accountFallback.isLoadingRuntimeKeys && (
                    <ArrowPathIcon className="h-4 w-4" />
                  )
                }
              >
                {t("status.fallback.reloadKeys")}
              </Button>
            </div>
          </Alert>
        ) : null}

        {accountFallback.runtimeKeys.length > 0 ? (
          <div className="space-y-3">
            <div>
              <label
                htmlFor={fallbackRuntimeKeySelectId}
                className="dark:text-dark-text-secondary text-sm font-medium text-gray-700"
              >
                {t("status.fallback.selectLabel")}
              </label>
              <div className="mt-2">
                <Select
                  value={
                    accountFallback.selectedRuntimeKeyId === null
                      ? ""
                      : accountFallback.selectedRuntimeKeyId
                  }
                  onValueChange={(value) =>
                    accountFallback.setSelectedRuntimeKeyId(value || null)
                  }
                  disabled={
                    accountFallback.isLoadingRuntimeKeys ||
                    accountFallback.isLoadingCatalog
                  }
                >
                  <SelectTrigger
                    id={fallbackRuntimeKeySelectId}
                    aria-label={t("status.fallback.selectLabel")}
                  >
                    <SelectValue
                      placeholder={t("status.fallback.selectPlaceholder")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {accountFallback.runtimeKeys.map((runtimeKey) => (
                      <SelectItem key={runtimeKey.id} value={runtimeKey.id}>
                        {runtimeKey.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {requiresExplicitSelection &&
              accountFallback.selectedRuntimeKeyId === null ? (
                <p className="dark:text-dark-text-tertiary mt-2 text-sm text-gray-500">
                  {t("status.fallback.selectHint")}
                </p>
              ) : null}
            </div>

            {accountFallback.catalogLoadErrorMessage ? (
              <Alert
                variant="destructive"
                title={t("status.fallback.catalogLoadFailedTitle")}
                description={accountFallback.catalogLoadErrorMessage}
              />
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                onClick={accountFallback.loadCatalog}
                loading={accountFallback.isLoadingCatalog}
                disabled={!canLoadWithSelectedKey}
              >
                {accountFallback.catalogLoadErrorMessage
                  ? t("status.fallback.retryLoadWithKey")
                  : t("status.fallback.loadWithKey")}
              </Button>
              <Button
                variant="secondary"
                onClick={accountFallback.loadRuntimeKeys}
                loading={accountFallback.isLoadingRuntimeKeys}
                disabled={accountFallback.isLoadingCatalog}
                leftIcon={
                  !accountFallback.isLoadingRuntimeKeys && (
                    <ArrowPathIcon className="h-4 w-4" />
                  )
                }
              >
                {t("status.fallback.reloadKeys")}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  if (isKeyScopedStatus) {
    return (
      <Alert
        variant="info"
        className="mb-6"
        title={t("status.runtimeKeyScopedCatalogTitle")}
        description={t("status.runtimeKeyScopedCatalogDescription")}
        aria-live="polite"
      >
        {renderAccountFallbackSection()}
      </Alert>
    )
  }

  if (loadErrorMessage) {
    return (
      <Alert
        variant="destructive"
        className="mb-6"
        title={
          selectedSource.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE
            ? t("status.profileLoadFailedTitle")
            : t("status.genericLoadFailedTitle")
        }
        description={loadErrorMessage}
      >
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Button
            variant="secondary"
            onClick={loadPricingData}
            leftIcon={<ArrowPathIcon className="h-4 w-4" />}
          >
            {t("status.retryLoad")}
          </Button>
        </div>
        {selectedSource.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
          ? renderAccountFallbackSection()
          : null}
      </Alert>
    )
  }

  if (dataFormatError && currentAccount) {
    return (
      <Alert variant="warning" className="mb-6">
        <div>
          <h3 className="mb-2 text-lg font-medium">
            {t("status.incompatibleFormat")}
          </h3>
          <p className="mb-4 text-sm">{t("status.incompatibleDesc")}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <WorkflowTransitionButton
              variant="warning"
              onClick={() =>
                window.open(`${currentAccount.baseUrl}/pricing`, "_blank")
              }
            >
              {t("status.goToSitePricing")}
            </WorkflowTransitionButton>
            <Button
              variant="secondary"
              onClick={loadPricingData}
              leftIcon={<ArrowPathIcon className="h-4 w-4" />}
            >
              {t("status.retryLoad")}
            </Button>
          </div>
        </div>
      </Alert>
    )
  }

  return null
}

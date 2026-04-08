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
import type { ModelManagementSource } from "~/features/ModelList/modelManagementSources"
import type { DisplaySiteData } from "~/types"

interface StatusIndicatorProps {
  selectedSource: ModelManagementSource | null
  isLoading: boolean
  dataFormatError: boolean
  loadErrorMessage: string | null
  currentAccount: DisplaySiteData | undefined
  loadPricingData: () => void
  accountFallback: AccountFallbackControls | null
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
}: StatusIndicatorProps) {
  const { t } = useTranslation("modelList")
  const fallbackTokenSelectId = `model-list-fallback-token-${useId()}`
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

  const renderAccountFallbackSection = () => {
    if (!currentAccount || !accountFallback?.isAvailable) {
      return null
    }

    const requiresExplicitSelection = accountFallback.tokens.length > 1
    const canLoadWithSelectedKey =
      !accountFallback.isLoadingTokens &&
      !accountFallback.isLoadingCatalog &&
      (!requiresExplicitSelection || accountFallback.selectedTokenId !== null)

    return (
      <div className="dark:border-dark-bg-tertiary mt-4 space-y-4 border-t border-red-100 pt-4">
        <div>
          <h4 className="dark:text-dark-text-primary text-sm font-semibold text-gray-900">
            {t("status.fallback.title")}
          </h4>
          <p className="dark:text-dark-text-secondary mt-1 text-sm text-gray-600">
            {t("status.fallback.description")}
          </p>
        </div>

        {accountFallback.tokenLoadErrorMessage ? (
          <Alert
            variant="destructive"
            title={t("status.fallback.tokensLoadFailedTitle")}
            description={accountFallback.tokenLoadErrorMessage}
          >
            <div className="mt-3">
              <Button
                variant="secondary"
                onClick={accountFallback.loadTokens}
                loading={accountFallback.isLoadingTokens}
                leftIcon={
                  !accountFallback.isLoadingTokens && (
                    <ArrowPathIcon className="h-4 w-4" />
                  )
                }
              >
                {t("status.fallback.reloadKeys")}
              </Button>
            </div>
          </Alert>
        ) : null}

        {!accountFallback.hasLoadedTokens &&
        !accountFallback.tokenLoadErrorMessage ? (
          <div className="flex items-center gap-3 py-1">
            <Spinner size="sm" />
            <p className="dark:text-dark-text-secondary text-sm text-gray-600">
              {t("status.fallback.loadingKeys")}
            </p>
          </div>
        ) : null}

        {accountFallback.hasLoadedTokens &&
        accountFallback.tokens.length === 0 ? (
          <Alert
            variant="info"
            title={t("status.fallback.noKeysTitle")}
            description={t("status.fallback.noKeysDescription")}
          >
            <div className="mt-3">
              <Button
                variant="secondary"
                onClick={accountFallback.loadTokens}
                loading={accountFallback.isLoadingTokens}
                leftIcon={
                  !accountFallback.isLoadingTokens && (
                    <ArrowPathIcon className="h-4 w-4" />
                  )
                }
              >
                {t("status.fallback.reloadKeys")}
              </Button>
            </div>
          </Alert>
        ) : null}

        {accountFallback.tokens.length > 0 ? (
          <div className="space-y-3">
            <div>
              <label
                htmlFor={fallbackTokenSelectId}
                className="dark:text-dark-text-secondary text-sm font-medium text-gray-700"
              >
                {t("status.fallback.selectLabel")}
              </label>
              <div className="mt-2">
                <Select
                  value={
                    accountFallback.selectedTokenId === null
                      ? ""
                      : String(accountFallback.selectedTokenId)
                  }
                  onValueChange={(value) =>
                    accountFallback.setSelectedTokenId(Number(value))
                  }
                  disabled={
                    accountFallback.isLoadingTokens ||
                    accountFallback.isLoadingCatalog
                  }
                >
                  <SelectTrigger
                    id={fallbackTokenSelectId}
                    aria-label={t("status.fallback.selectLabel")}
                  >
                    <SelectValue
                      placeholder={t("status.fallback.selectPlaceholder")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {accountFallback.tokens.map((token) => (
                      <SelectItem key={token.id} value={String(token.id)}>
                        {token.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {requiresExplicitSelection &&
              accountFallback.selectedTokenId === null ? (
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
                onClick={accountFallback.loadTokens}
                loading={accountFallback.isLoadingTokens}
                disabled={accountFallback.isLoadingCatalog}
                leftIcon={
                  !accountFallback.isLoadingTokens && (
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

  if (loadErrorMessage) {
    return (
      <Alert
        variant="destructive"
        className="mb-6"
        title={
          selectedSource.kind === "profile"
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
        {selectedSource.kind === "account"
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

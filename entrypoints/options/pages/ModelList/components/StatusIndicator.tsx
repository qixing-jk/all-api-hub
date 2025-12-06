import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CpuChipIcon,
} from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Alert, Button, EmptyState, Spinner } from "~/components/ui"
import type { DisplaySiteData } from "~/types"

interface StatusIndicatorProps {
  selectedAccount: string
  isLoading: boolean
  dataFormatError: boolean
  currentAccount: DisplaySiteData | undefined
  loadPricingData: () => void
}

/**
 * Displays loading or error feedback for model pricing fetch status.
 * @param props Component props.
 * @param props.selectedAccount Currently selected account id.
 * @param props.isLoading Whether pricing data is loading.
 * @param props.dataFormatError Flag indicating invalid data format.
 * @param props.currentAccount Account details for navigation links.
 * @param props.loadPricingData Retry handler.
 * @returns Status UI for loading/error or null when idle.
 */
export function StatusIndicator({
  selectedAccount,
  isLoading,
  dataFormatError,
  currentAccount,
  loadPricingData,
}: StatusIndicatorProps) {
  const { t } = useTranslation("modelList")
  if (!selectedAccount) {
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

  if (dataFormatError && currentAccount) {
    return (
      <Alert variant="warning" className="mb-6">
        <div>
          <h3 className="mb-2 text-lg font-medium">
            {t("status.incompatibleFormat")}
          </h3>
          <p className="mb-4 text-sm">{t("status.incompatibleDesc")}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              variant="warning"
              onClick={() =>
                window.open(`${currentAccount.baseUrl}/pricing`, "_blank")
              }
              rightIcon={<ArrowTopRightOnSquareIcon className="h-4 w-4" />}
            >
              {t("status.goToSitePricing")}
            </Button>
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

import { RefreshCw } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Alert, Button } from "~/components/ui"
import type { PersonalizedCatalogFallbackControls } from "~/features/ModelList/hooks/useModelData"
import { MODEL_LIST_TEST_IDS } from "~/features/ModelList/testIds"

interface PersonalizedCatalogFallbackNoticeProps {
  fallback: PersonalizedCatalogFallbackControls
}

/** Discloses provider-wide fallback scope while personalized data is retried. */
export function PersonalizedCatalogFallbackNotice({
  fallback,
}: PersonalizedCatalogFallbackNoticeProps) {
  const { t } = useTranslation("modelList")
  const [isRetrying, setIsRetrying] = useState(false)

  const handleRetry = async () => {
    setIsRetrying(true)
    try {
      await fallback.retry()
    } finally {
      setIsRetrying(false)
    }
  }

  return (
    <Alert
      variant="warning"
      className="mb-6"
      title={t("personalizedCatalogFallback.title")}
      description={fallback.message}
      aria-live="polite"
    >
      <div className="mt-3">
        <Button
          data-testid={MODEL_LIST_TEST_IDS.retryPersonalizedCatalogButton}
          variant="secondary"
          onClick={handleRetry}
          loading={isRetrying}
          leftIcon={<RefreshCw className="h-4 w-4" />}
        >
          {isRetrying
            ? t("personalizedCatalogFallback.retrying")
            : t("personalizedCatalogFallback.retry")}
        </Button>
      </div>
    </Alert>
  )
}

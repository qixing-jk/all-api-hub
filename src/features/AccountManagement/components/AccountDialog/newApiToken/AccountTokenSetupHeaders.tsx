import { ArrowLeft, ArrowRight } from "lucide-react"
import type { Ref } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"

/** Header for the subpage that verifies and creates a token. */
export function NewApiTokenCreationHeader({
  title,
  siteUrl,
  siteName,
  headingRef,
  busy,
  onBack,
}: {
  title: string
  siteUrl: string
  siteName: string
  headingRef: Ref<HTMLHeadingElement>
  busy: boolean
  onBack: () => void
}) {
  const { t } = useTranslation("accountDialog")
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={t("tokenCreation.backToAccount")}
        disabled={busy}
        onClick={onBack}
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
      </Button>
      <div className="min-w-0">
        <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold">
          {title}
        </h2>
        <p className="truncate text-sm text-muted-foreground" title={siteUrl}>
          {siteName || siteUrl}
        </p>
      </div>
    </div>
  )
}

/** Header for detected accounts that only require a management token. */
export function CompactTokenEntryHeader({
  title,
  details,
  onOpenFullForm,
}: {
  title: string
  details: string
  onOpenFullForm: () => void
}) {
  const { t } = useTranslation("accountDialog")
  return (
    <div className="w-full min-w-0 pr-7">
      <h2 className="text-lg font-semibold wrap-anywhere">{title}</h2>
      <div className="mt-1 flex flex-wrap items-center gap-x-3">
        <p
          role="status"
          className="min-w-0 flex-1 basis-48 text-xs wrap-anywhere text-muted-foreground"
          data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectErrorMessage}
        >
          {details
            ? t("validation.detectedAccountDetails", {
                details: details,
              })
            : t("validation.detectedAccount")}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="-mr-2 ml-auto max-w-full whitespace-normal text-muted-foreground"
          rightIcon={<ArrowRight aria-hidden="true" className="size-3" />}
          onClick={onOpenFullForm}
        >
          {t("validation.openFullForm")}
        </Button>
      </div>
    </div>
  )
}

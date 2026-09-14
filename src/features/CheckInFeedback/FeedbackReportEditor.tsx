import { ChevronDown } from "lucide-react"
import { useTranslation } from "react-i18next"

import { FormField, Textarea } from "~/components/ui"

import { FeedbackReportPreview } from "./FeedbackReportPreview"

/** Keeps preview, diagnostic editing and manual copying in native disclosures. */
export function FeedbackReportEditor({
  id,
  report,
  details,
  setDetails,
  clues,
  setClues,
  scanning,
  previewOpen,
  setPreviewOpen,
  rawOpen,
  setRawOpen,
}: {
  id: string
  report: string
  details: string
  setDetails: (value: string) => void
  clues: string
  setClues: (value: string) => void
  scanning: boolean
  previewOpen: boolean
  setPreviewOpen: (value: boolean) => void
  rawOpen: boolean
  setRawOpen: (value: boolean) => void
}) {
  const { t } = useTranslation("accountDialog")
  return (
    <details
      open={previewOpen}
      onToggle={(event) => setPreviewOpen(event.currentTarget.open)}
      className="group corners-concentric border-border rounded-lg border [--corner-inset:1px]"
    >
      <summary className="hover:bg-surface-subtle focus-visible:outline-ring dark:hover:bg-card/50 flex cursor-pointer list-none items-center justify-between gap-2 rounded-[var(--corner-inner-radius)] px-4 py-3 text-sm font-medium group-open:rounded-b-none focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
        {t("checkInFeedback.preview")}
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-border space-y-4 border-t p-4">
        <FeedbackReportPreview content={report} />
        <details className="border-border border-t pt-3">
          <summary className="cursor-pointer text-xs font-medium">
            {t("checkInFeedback.editReport")}
          </summary>
          <div className="mt-3 space-y-3">
            <FormField
              label={t("checkInFeedback.details")}
              htmlFor={`${id}-details`}
            >
              <Textarea
                id={`${id}-details`}
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                rows={6}
                className="font-mono text-xs"
              />
            </FormField>
            <FormField
              label={t("checkInFeedback.clues")}
              htmlFor={`${id}-clues`}
            >
              <Textarea
                id={`${id}-clues`}
                value={clues}
                readOnly={scanning}
                placeholder={
                  scanning ? t("checkInFeedback.scanning") : undefined
                }
                onChange={(event) => setClues(event.target.value)}
                rows={4}
                className="font-mono text-xs"
              />
            </FormField>
          </div>
        </details>
        <details
          open={rawOpen}
          onToggle={(event) => setRawOpen(event.currentTarget.open)}
          className="border-border border-t pt-3"
        >
          <summary className="cursor-pointer text-xs font-medium">
            {t("checkInFeedback.fullReport")}
          </summary>
          <div className="mt-3">
            <FormField
              label={t("checkInFeedback.fullReport")}
              labelClassName="sr-only"
              htmlFor={`${id}-report`}
            >
              <Textarea
                id={`${id}-report`}
                value={report}
                readOnly
                rows={6}
                className="font-mono text-xs"
              />
            </FormField>
          </div>
        </details>
      </div>
    </details>
  )
}

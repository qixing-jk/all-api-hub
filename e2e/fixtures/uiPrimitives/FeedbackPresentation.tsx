import React from "react"

import { InlineMessage, NoticeActionButton } from "~/components/ui"
import { FeedbackFormFooter } from "~/features/CheckInFeedback/FeedbackFormFooter"
import { SUBMISSION_FEEDBACK } from "~/features/CheckInFeedback/submissionFeedback"
import { Footer as PricingFooter } from "~/features/ModelList/presentation/Footer"

/** Actual presentation consumers with deterministic report-sharing results. */
export function FeedbackPresentation() {
  const [copied, setCopied] = React.useState(false)
  return (
    <>
      <section aria-label="Report sharing" className="space-y-3">
        <h2 className="text-base font-medium">签到反馈</h2>
        <FeedbackFormFooter
          needsCopy
          onClose={() => undefined}
          submission={{
            feedback: copied
              ? SUBMISSION_FEEDBACK.COPIED
              : SUBMISSION_FEEDBACK.COPY_FAILED,
            opening: false,
            manualCopy: true,
            previewOpen: true,
            rawOpen: true,
            setPreviewOpen: () => undefined,
            setRawOpen: () => undefined,
            copy: async () => {
              setCopied(true)
              return true
            },
            open: async () => undefined,
          }}
        />
      </section>
      <section aria-label="Pricing guidance">
        <PricingFooter />
      </section>
    </>
  )
}

/** Exercise wrapping, custom/absent icons and pending inline actions with real styles. */
export function InlineFeedbackExamples() {
  const [pending, setPending] = React.useState(true)
  const [retried, setRetried] = React.useState(false)
  return (
    <section aria-label="Inline feedback" className="space-y-3">
      <InlineMessage tone="warning" size="sm" aria-label="Retry feedback">
        <p>
          The previous execution record could not be loaded; the rest of the
          information is still available.{" "}
          <NoticeActionButton
            disabled={pending}
            onClick={() => setRetried(true)}
          >
            Retry loading execution history
          </NoticeActionButton>
        </p>
      </InlineMessage>
      <InlineMessage tone="success">
        <p>Copied. Paste the report into the issue.</p>
      </InlineMessage>
      <InlineMessage tone="destructive" role="alert">
        <p>Saving failed. Your edited values remain available.</p>
      </InlineMessage>
      <InlineMessage role="note" icon={null}>
        This static guidance has no icon.
      </InlineMessage>
      <InlineMessage
        role="note"
        icon={
          <span className="size-4" aria-hidden>
            i
          </span>
        }
      >
        <p>A custom icon uses the same first-line alignment.</p>
      </InlineMessage>
      <NoticeActionButton onClick={() => setPending(false)}>
        Finish loading
      </NoticeActionButton>
      {retried && <p role="status">Retry requested</p>}
    </section>
  )
}

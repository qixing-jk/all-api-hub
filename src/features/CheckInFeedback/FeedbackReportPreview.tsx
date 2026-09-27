import { MarkdownContent } from "~/components/MarkdownContent"

/** Shows the outgoing report while retaining readable literal diagnostics. */
export function FeedbackReportPreview({ content }: { content: string }) {
  return (
    <MarkdownContent
      content={content}
      data-testid="checkin-feedback-preview"
      className="[&_details]:my-density-3 [&_summary]:py-density-1 [&_summary]:focus-visible:outline-ring [&_pre]:break-all [&_pre]:whitespace-pre-wrap [&_summary]:cursor-pointer [&_summary]:font-medium [&_summary]:focus-visible:outline-2 [&_table]:table-fixed [&_td]:break-words"
    />
  )
}

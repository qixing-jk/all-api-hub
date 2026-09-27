import { MarkdownContent } from "~/components/MarkdownContent"

/** Present site announcements using the same readable typography as local reports. */
export function AnnouncementMarkdown({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  if (!content.trim()) return null
  return <MarkdownContent content={content} className={className} breaks />
}

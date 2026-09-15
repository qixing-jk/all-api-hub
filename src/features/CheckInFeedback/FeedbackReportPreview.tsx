import DOMPurify from "dompurify"
import { marked } from "marked"
import { useLayoutEffect, useRef } from "react"

/** Shows the exact outgoing Markdown with safe, readable GitHub-style disclosures. */
export function FeedbackReportPreview({ content }: { content: string }) {
  const previewRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const preview = previewRef.current
    if (!preview) return
    const openSections = new Map(
      Array.from(preview.querySelectorAll("details"), (section) => [
        section.querySelector("summary")?.textContent ?? "",
        section.open,
      ]),
    )
    const active = document.activeElement
    const focusedSummary =
      active instanceof HTMLElement && preview.contains(active)
        ? active.closest("summary")?.textContent
        : null
    const template = document.createElement("template")
    template.innerHTML = DOMPurify.sanitize(
      marked.parse(content, { gfm: true, async: false }),
    )
    template.content.querySelectorAll("a").forEach((link) => {
      link.setAttribute("target", "_blank")
      link.setAttribute("rel", "noopener noreferrer")
    })
    template.content.querySelectorAll("details").forEach((section) => {
      const key = section.querySelector("summary")?.textContent ?? ""
      if (openSections.has(key)) section.open = openSections.get(key)!
    })
    // React owns the container; this sanitized subtree keeps native disclosure
    // interaction intact and is replaced only when the outgoing report changes.
    preview.replaceChildren(template.content)
    if (focusedSummary) {
      Array.from(preview.querySelectorAll("summary"))
        .find((summary) => summary.textContent === focusedSummary)
        ?.focus()
    }
  }, [content])

  return (
    <div
      data-testid="checkin-feedback-preview"
      ref={previewRef}
      className="text-secondary-foreground [&_a]:text-theme-600 dark:[&_a]:text-theme-400 [&_pre]:bg-surface-subtle dark:[&_pre]:bg-background [&_summary]:focus-visible:outline-ring [&_td]:border-border-subtle [&_th]:border-border-subtle [&_th]:text-muted-foreground [&_details]:my-density-3 [&_h2]:mt-density-5 [&_h2]:mb-density-2 [&_p]:my-density-2 [&_pre]:mt-density-3 [&_pre]:py-density-3 [&_summary]:py-density-1 [&_table]:my-density-3 [&_td]:py-density-2 [&_th]:py-density-2 max-w-none text-sm leading-6 break-words [&_a]:underline [&_h2]:text-sm [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:rounded-md [&_pre]:px-3 [&_pre]:text-xs [&_pre]:leading-5 [&_pre]:break-all [&_pre]:whitespace-pre-wrap [&_summary]:cursor-pointer [&_summary]:text-sm [&_summary]:font-medium [&_summary]:focus-visible:outline-2 [&_table]:w-full [&_table]:table-fixed [&_table]:border-collapse [&_table]:text-xs [&_td]:border-b [&_td]:px-3 [&_td]:align-top [&_td]:break-words [&_th]:w-2/5 [&_th]:border-b [&_th]:text-left [&_th]:align-top [&_th]:font-medium [&_ul]:list-disc [&_ul]:pl-5 [&>:first-child]:mt-0"
    />
  )
}

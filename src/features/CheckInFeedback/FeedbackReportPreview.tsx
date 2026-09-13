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
      className="max-w-none text-sm leading-6 break-words text-gray-700 dark:text-gray-200 [&_a]:text-blue-600 [&_a]:underline dark:[&_a]:text-blue-400 [&_details]:my-3 [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:mt-3 [&_pre]:rounded-md [&_pre]:bg-gray-50 [&_pre]:p-3 [&_pre]:text-xs [&_pre]:leading-5 [&_pre]:break-all [&_pre]:whitespace-pre-wrap dark:[&_pre]:bg-gray-900 [&_summary]:cursor-pointer [&_summary]:py-1 [&_summary]:text-sm [&_summary]:font-medium [&_summary]:focus-visible:outline-2 [&_summary]:focus-visible:outline-blue-500 [&_table]:my-3 [&_table]:w-full [&_table]:table-fixed [&_table]:border-collapse [&_table]:text-xs [&_td]:border-b [&_td]:border-gray-100 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_td]:break-words dark:[&_td]:border-gray-800 [&_th]:w-2/5 [&_th]:border-b [&_th]:border-gray-100 [&_th]:py-2 [&_th]:text-left [&_th]:align-top [&_th]:font-medium [&_th]:text-gray-500 dark:[&_th]:border-gray-800 dark:[&_th]:text-gray-400 [&_ul]:list-disc [&_ul]:pl-5 [&>:first-child]:mt-0"
    />
  )
}

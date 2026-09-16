import DOMPurify from "dompurify"
import { marked } from "marked"
import { useLayoutEffect, useRef, type ComponentPropsWithoutRef } from "react"

import { cn } from "~/lib/utils"

type MarkdownContentProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "children" | "content" | "dangerouslySetInnerHTML"
> & {
  content: string
  breaks?: boolean
}

/** Render content structure with application typography, preserving open disclosures. */
export function MarkdownContent({
  content,
  breaks = false,
  className,
  ...props
}: MarkdownContentProps) {
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
    const fragment = DOMPurify.sanitize(
      marked.parse(content, { gfm: true, async: false, breaks }),
      {
        RETURN_DOM_FRAGMENT: true,
        // Text content and semantic HTML survive; document styling belongs to us.
        FORBID_ATTR: ["style", "class", "id", "size", "face", "color"],
        FORBID_TAGS: ["font", "style", "link"],
      },
    )
    fragment.querySelectorAll("a").forEach((link) => {
      link.setAttribute("target", "_blank")
      link.setAttribute("rel", "noopener noreferrer")
    })
    fragment.querySelectorAll("details").forEach((section) => {
      const key = section.querySelector("summary")?.textContent ?? ""
      if (openSections.has(key)) section.open = openSections.get(key)!
    })
    preview.replaceChildren(fragment)
    if (focusedSummary) {
      Array.from(preview.querySelectorAll("summary"))
        .find((summary) => summary.textContent === focusedSummary)
        ?.focus()
    }
  }, [content, breaks])

  return (
    <div
      {...props}
      ref={previewRef}
      className={cn(
        "app-markdown prose prose-sm max-w-none text-sm wrap-anywhere",
        "prose-headings:mt-density-4 prose-headings:mb-density-3 prose-headings:font-semibold",
        "prose-p:my-density-2 prose-ul:my-density-2 prose-ol:my-density-2",
        "prose-blockquote:my-density-3 prose-pre:my-density-3",
        "[&>:first-child]:mt-0 [&>:last-child]:mb-0",
        className,
      )}
    />
  )
}

import DOMPurify from "dompurify"
import { marked } from "marked"
import { useMemo } from "react"

import { cn } from "~/lib/utils"

interface AnnouncementMarkdownProps {
  content: string
  className?: string
}

/**
 * Normalizes announcement links after sanitization so Markdown and raw HTML
 * links share the same external navigation behavior.
 */
function forceLinksToOpenInNewTab(html: string) {
  const template = document.createElement("template")
  template.innerHTML = html

  template.content.querySelectorAll("a").forEach((link) => {
    link.setAttribute("target", "_blank")
    link.setAttribute("rel", "noopener noreferrer")
  })

  return template.innerHTML
}

/**
 * Renders site-provided announcement Markdown while keeping raw HTML sanitized.
 */
export function AnnouncementMarkdown({
  content,
  className,
}: AnnouncementMarkdownProps) {
  const html = useMemo(() => {
    if (!content.trim()) {
      return ""
    }

    const parsed = marked.parse(content, {
      breaks: true,
      gfm: true,
      async: false,
    })

    if (typeof parsed !== "string") {
      return ""
    }

    return forceLinksToOpenInNewTab(DOMPurify.sanitize(parsed))
  }, [content])

  if (!html) {
    return null
  }

  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-200",
        "prose-headings:mb-3 prose-headings:font-semibold prose-headings:text-gray-900 dark:prose-headings:text-white",
        "prose-p:my-2 prose-p:leading-7",
        "prose-a:text-blue-600 hover:prose-a:text-blue-700 dark:prose-a:text-blue-400 dark:hover:prose-a:text-blue-300",
        "prose-strong:text-gray-900 dark:prose-strong:text-white",
        "prose-code:rounded prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-sm dark:prose-code:bg-white/10",
        "prose-pre:border prose-pre:border-gray-200 prose-pre:bg-gray-900 prose-pre:text-gray-100 dark:prose-pre:border-white/10",
        "prose-blockquote:border-l-blue-400 prose-blockquote:text-gray-600 dark:prose-blockquote:text-gray-300",
        "prose-ul:my-2 prose-ol:my-2",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

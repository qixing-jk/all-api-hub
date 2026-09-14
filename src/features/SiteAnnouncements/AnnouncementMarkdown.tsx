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
        "prose prose-sm dark:prose-invert text-secondary-foreground max-w-none",
        "prose-headings:mb-3 prose-headings:font-semibold prose-headings:text-foreground",
        "prose-p:my-2 prose-p:leading-7",
        "prose-a:text-theme-600 hover:prose-a:text-theme-700 dark:prose-a:text-theme-400 dark:hover:prose-a:text-theme-300",
        "prose-strong:text-foreground",
        "prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-sm dark:prose-code:bg-foreground/10",
        "prose-pre:border prose-pre:border-border prose-pre:bg-surface-inverse prose-pre:text-inverse-foreground dark:prose-pre:border-foreground/10",
        "prose-blockquote:border-l-theme-400 prose-blockquote:text-muted-foreground dark:prose-blockquote:text-secondary-foreground",
        "prose-ul:my-2 prose-ol:my-2",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

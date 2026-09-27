import type { HighlightFragment } from "~/features/AccountManagement/hooks/useAccountSearch"

/**
 * Renders highlighted fragments (such as search matches) with mark elements while preserving non-highlighted text.
 * Falls back to provided string when no highlight fragments exist.
 */
export function SiteInfoHighlightedText({
  fragments,
  fallback,
}: {
  fragments?: HighlightFragment[]
  fallback: string
}) {
  if (!fragments || fragments.length === 0) {
    return fallback
  }

  return fragments.map((fragment, index) =>
    fragment.highlighted ? (
      <mark
        key={`${fragment.text}-${index}`}
        className="text-primary-soft-foreground bg-primary-soft rounded px-0.5"
      >
        {fragment.text}
      </mark>
    ) : (
      <span key={`${fragment.text}-${index}`}>{fragment.text}</span>
    ),
  )
}

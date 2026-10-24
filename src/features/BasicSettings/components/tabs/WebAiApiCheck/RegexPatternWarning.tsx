const MAX_VISIBLE_PATTERNS = 10

/**
 * Renders invalid RegExp patterns in the settings panels.
 */
export function RegexPatternWarning({
  invalid,
  title,
  more,
}: {
  invalid: string[]
  title: string
  more: string
}) {
  if (invalid.length === 0) return null

  return (
    <div className="border-warning-border bg-warning-soft text-warning-soft-foreground py-density-3 rounded-md border px-3 text-xs">
      <div className="font-medium">{title}</div>
      <ul className="mt-density-1 list-disc space-y-0.5 pl-4">
        {invalid.slice(0, MAX_VISIBLE_PATTERNS).map((pattern) => (
          <li key={pattern}>
            <code className="font-mono">{pattern}</code>
          </li>
        ))}
      </ul>
      {invalid.length > MAX_VISIBLE_PATTERNS ? (
        <div className="mt-density-1">{more}</div>
      ) : null}
    </div>
  )
}

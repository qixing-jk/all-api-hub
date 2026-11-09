const TOKEN_DISPLAY_UNITS = { Kilo: 1024, Mega: 1048576 } as const

/** Long-context test lengths use binary units; exact counts remain in details. */
export function formatContextTokens(tokens: number) {
  if (tokens >= TOKEN_DISPLAY_UNITS.Mega)
    return `${(tokens / TOKEN_DISPLAY_UNITS.Mega).toFixed(1).replace(/\.0$/, "")}M`
  if (tokens >= TOKEN_DISPLAY_UNITS.Kilo)
    return `${(tokens / TOKEN_DISPLAY_UNITS.Kilo).toFixed(1).replace(/\.0$/, "")}K`
  return tokens.toLocaleString()
}

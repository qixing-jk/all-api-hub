/**
 * Returns theme-aware styles for toast notifications based on the resolved theme.
 */
export function getThemeAwareToastStyles(resolvedTheme?: string) {
  if (resolvedTheme === "dark") {
    return {
      background: "#1e293b",
      color: "#f1f5f9",
      border: "1px solid #334155",
    }
  }

  return {
    background: "#fff",
    color: "#363636",
    border: "1px solid #e5e7eb",
  }
}

/**
 * Library-rendered notifications resolve the same live roles as other popovers.
 */
export function getThemeAwareToastStyles() {
  return {
    background: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
  }
}

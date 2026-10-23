/** Preserve the requested scroll behavior unless the user prefers reduced motion. */
export function resolveNavigationScrollBehavior(
  behavior: ScrollBehavior = "smooth",
): ScrollBehavior {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? "instant"
    : behavior
}

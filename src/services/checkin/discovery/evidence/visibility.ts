/** Ignore detached or explicitly hidden verification UI, including ancestors. */
export function isCheckInElementShown(element: Element): boolean {
  if (!element.isConnected) return false
  for (let node: Element | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node)
    if (
      node.hasAttribute("hidden") ||
      node.getAttribute("aria-hidden") === "true" ||
      (node.tagName === "DIALOG" && !node.hasAttribute("open")) ||
      style.display === "none" ||
      style.visibility === "hidden"
    )
      return false
  }
  return true
}

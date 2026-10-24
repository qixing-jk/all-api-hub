import { isHttpUrl } from "~/utils/core/urlParsing"

/** Include HTTP link targets from the selection without scanning the whole page. */
export function getApiCheckSelectedText(): string {
  const selection = window.getSelection()
  const text = selection?.toString().trim() || ""
  if (!text || !selection) return text

  const urls = new Set<string>()
  const addLink = (link: Element) => {
    const href = link.getAttribute("href")
    if (!href) return
    try {
      const url = new URL(href, document.baseURI).href
      if (isHttpUrl(url) && !text.includes(url)) urls.add(url)
    } catch {
      // Invalid page links must not interrupt selection detection.
    }
  }

  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index)
    if (range.collapsed) continue
    range.cloneContents().querySelectorAll("a[href]").forEach(addLink)
    // A range entirely inside a link does not clone its ancestor anchor.
    const ancestor = range.commonAncestorContainer
    const element =
      ancestor instanceof Element ? ancestor : ancestor.parentElement
    const enclosingLink = element?.closest("a[href]")
    if (enclosingLink) addLink(enclosingLink)
  }

  return [text, ...urls].join("\n")
}

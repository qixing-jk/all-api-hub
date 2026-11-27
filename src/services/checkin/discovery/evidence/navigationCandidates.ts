import { normalizeCheckInPagePath } from "~/services/checkin/autoCheckin/configuration/nativePagePath"

import type { CheckInNavigationEvidence } from "./scanTypes"
import { isCheckInElementShown } from "./visibility"

const MAX_NAVIGATION_LINKS = 300

const CHECK_IN_NAVIGATION_LABEL =
  /签到|簽到|打卡|福利|check[\s_-]*in|daily|reward|welfare/i

/** Identifies an existing scroll target in this document while preserving router fragments. */
function linksToDocumentAnchor(document: Document, current: URL, url: URL) {
  if (
    url.pathname !== current.pathname ||
    url.search !== current.search ||
    !url.hash ||
    /^#!?\//.test(url.hash)
  )
    return false
  const fragment = url.hash.slice(1)
  let anchor = fragment
  try {
    anchor = decodeURIComponent(fragment)
  } catch {
    // A literal percent character can be part of an anchor ID.
  }
  return (
    document.getElementById(anchor) !== null ||
    Array.from(document.getElementsByName(anchor)).some(
      (element) => element.localName === "a",
    )
  )
}

/** Read navigable same-site check-in links; never guess URLs or invoke handlers. */
export function collectNativeCheckInPageCandidates(
  document: Document,
): CheckInNavigationEvidence {
  const current = new URL(document.location.href)
  const paths = new Set<string>()
  const links = document.querySelectorAll<HTMLAnchorElement>("a[href]")
  if (links.length > MAX_NAVIGATION_LINKS)
    return { candidates: [], candidatesComplete: false }
  for (const link of links) {
    if (!isCheckInElementShown(link)) continue
    if (
      !CHECK_IN_NAVIGATION_LABEL.test(
        `${link.textContent ?? ""} ${link.getAttribute("aria-label") ?? ""} ${link.getAttribute("href") ?? ""}`,
      )
    )
      continue
    try {
      const url = new URL(link.href, current)
      const path = `${url.pathname}${url.search}${url.hash}`
      if (
        url.origin !== current.origin ||
        url.username ||
        url.password ||
        url.href === current.href ||
        linksToDocumentAnchor(document, current, url) ||
        /^\/api(?:\/|$)/i.test(url.pathname) ||
        !normalizeCheckInPagePath(path)
      )
        continue
      paths.add(path)
    } catch {
      /* Malformed links are not page candidates. */
    }
  }
  return { candidates: [...paths] }
}

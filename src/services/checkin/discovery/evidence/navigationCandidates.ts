import { normalizeCheckInPagePath } from "~/services/checkin/autoCheckin/configuration/nativePagePath"

import type { CheckInNavigationEvidence } from "./scanTypes"
import { isCheckInElementShown } from "./visibility"

const MAX_NAVIGATION_LINKS = 300

const CHECK_IN_NAVIGATION_LABEL =
  /签到|簽到|打卡|福利|check[\s_-]*in|daily|reward|welfare/i

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

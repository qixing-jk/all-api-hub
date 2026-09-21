import { GITHUB_REPO_NAME, GITHUB_REPO_OWNER } from "~/constants/about"

/** How a GitHub URL relates to the All API Hub repository page. */
export const ALL_API_HUB_REPO_PAGE_KINDS = {
  /** `github.com/<owner>/<repo>`: the page carrying the star toggle. */
  Root: "root",
  /** A subpage such as `/issues` or `/releases`. */
  Subpage: "subpage",
} as const

export type AllApiHubRepoPageKind =
  (typeof ALL_API_HUB_REPO_PAGE_KINDS)[keyof typeof ALL_API_HUB_REPO_PAGE_KINDS]

const REPO_PAGE_PATH = `/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`

/**
 * Classifies a URL against the All API Hub repository page. Returns `null` for
 * non-string input, unparsable URLs, and any other host.
 *
 * Callers need two different tolerances. The background trusts star reports
 * from any repository page, while star detection only observes the root page:
 * a star toggle on a subpage belongs to whatever repository that page displays.
 */
export function classifyAllApiHubRepoPageUrl(
  url: unknown,
): AllApiHubRepoPageKind | null {
  if (typeof url !== "string") {
    return null
  }

  try {
    const parsed = new URL(url)
    if (parsed.hostname !== "github.com") {
      return null
    }

    if (parsed.pathname === REPO_PAGE_PATH) {
      return ALL_API_HUB_REPO_PAGE_KINDS.Root
    }

    return parsed.pathname.startsWith(`${REPO_PAGE_PATH}/`)
      ? ALL_API_HUB_REPO_PAGE_KINDS.Subpage
      : null
  } catch {
    return null
  }
}

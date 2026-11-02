/**
 * Resolves the GitHub repository star state from the live repo page DOM.
 *
 * Detection runs only against the All API Hub repository page and only reads
 * the star control's own state. GitHub renders the star toggle client-side,
 * so callers must tolerate a `null` (unknown) result and retry.
 */

export const GITHUB_REPO_STAR_STATES = {
  Starred: "starred",
  NotStarred: "not_starred",
} as const
export type GitHubRepoStarState =
  (typeof GITHUB_REPO_STAR_STATES)[keyof typeof GITHUB_REPO_STAR_STATES]

/** Matches star/unstar form actions such as `/owner/repo/star` or `/unstar`. */
const STAR_FORM_ACTION_PATTERN = /(?:^|\/)(unstar|star)\/?(?:$|\?|#)/

/**
 * Reads the logged-in star toggle state. Returns `null` when the control has
 * not hydrated yet or the viewer is not signed in to GitHub.
 */
export function resolveGitHubRepoStarState(
  root: ParentNode,
): GitHubRepoStarState | null {
  const toggles = root.querySelectorAll<HTMLButtonElement>(
    "button[aria-pressed]",
  )
  for (const toggle of toggles) {
    const label = `${toggle.getAttribute("aria-label") ?? ""} ${toggle.textContent ?? ""}`
    if (!/star/i.test(label)) {
      continue
    }

    const pressed = toggle.getAttribute("aria-pressed")
    if (pressed === "true") {
      return GITHUB_REPO_STAR_STATES.Starred
    }
    if (pressed === "false") {
      return GITHUB_REPO_STAR_STATES.NotStarred
    }
  }

  // Fallback for logged-in viewers: the server-rendered form posts to
  // `/unstar` when the viewer already starred the repository.
  const forms = root.querySelectorAll<HTMLFormElement>("form[action]")
  for (const form of forms) {
    const action = form.getAttribute("action") ?? ""
    const match = STAR_FORM_ACTION_PATTERN.exec(action)
    if (!match) {
      continue
    }

    return match[1] === "unstar"
      ? GITHUB_REPO_STAR_STATES.Starred
      : GITHUB_REPO_STAR_STATES.NotStarred
  }

  return null
}

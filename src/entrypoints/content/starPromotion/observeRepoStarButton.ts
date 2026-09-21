import { RuntimeActionIds } from "~/constants/runtimeActions"
import { resolveGitHubRepoStarState } from "~/services/starPromotion/githubStarButton"
import {
  ALL_API_HUB_REPO_PAGE_KINDS,
  classifyAllApiHubRepoPageUrl,
} from "~/services/starPromotion/repoPage"
import { sendRuntimeActionMessage } from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to the repository star detection content module.
 */
const logger = createLogger("StarPromotionContent")

/** Stop watching for a resolvable star state after this long. */
const OBSERVATION_TIMEOUT_MS = 30_000
/** GitHub hydrates the star toggle client-side; this keeps rechecks affordable. */
const POLL_INTERVAL_MS = 1_000

/**
 * Returns whether the current page is the All API Hub repository root, so star
 * detection never observes unrelated GitHub browsing.
 */
function isAllApiHubRepoPage(): boolean {
  return (
    classifyAllApiHubRepoPageUrl(window.location.href) ===
    ALL_API_HUB_REPO_PAGE_KINDS.Root
  )
}

/**
 * Watches the repository page for a resolvable star state and reports each
 * change to the background. Unknown states stay unreported (fail-open); once
 * detection reports a starred state, the background suppresses every star
 * prompt permanently.
 */
export function setupStarPromotionContent(): () => void {
  if (!isAllApiHubRepoPage()) {
    return () => {}
  }

  let disposed = false
  let lastReportedState: "starred" | "not_starred" | null = null

  const reportState = (state: "starred" | "not_starred") => {
    void sendRuntimeActionMessage<{ success: boolean }>({
      action: RuntimeActionIds.ContentStarPromotionReport,
      starred: state === "starred",
    })
      .then((response) => {
        if (response?.success === true) {
          lastReportedState = state
          return
        }
        logger.debug("Star state report was not acknowledged")
      })
      .catch((error) => {
        logger.debug("Star state report failed", {
          error: error instanceof Error ? error.message : String(error),
        })
      })
  }

  const evaluate = () => {
    if (disposed) {
      return
    }

    const state = resolveGitHubRepoStarState(document)
    if (!state || state === lastReportedState) {
      return
    }

    reportState(state)
  }

  const observer = new MutationObserver(evaluate)
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["aria-pressed", "action"],
  })

  const pollTimer = window.setInterval(evaluate, POLL_INTERVAL_MS)
  const timeoutTimer = window.setTimeout(() => {
    if (disposed) return
    window.clearInterval(pollTimer)
  }, OBSERVATION_TIMEOUT_MS)

  void evaluate()

  return () => {
    disposed = true
    observer.disconnect()
    window.clearInterval(pollTimer)
    window.clearTimeout(timeoutTimer)
  }
}

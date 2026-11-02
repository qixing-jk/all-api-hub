import { REPO_URL } from "~/constants/about"
import { createTab } from "~/utils/browser/tabs"
import { createLogger } from "~/utils/core/logger"

import { starPromotionState } from "./state"

const logger = createLogger("StarPromotionRepository")
let opening: Promise<boolean> | undefined

/** A browser handoff defers the invitation; it does not confirm a star. */
export function openStarPromotionRepository(): Promise<boolean> {
  if (opening) return opening
  opening = openRepository().finally(() => {
    opening = undefined
  })
  return opening
}

/** Opens the repository once, retaining a successful handoff if deferral fails. */
async function openRepository(): Promise<boolean> {
  try {
    await createTab(REPO_URL, true)
  } catch (error) {
    logger.warn("Failed to open repository", error)
    return false
  }
  try {
    await starPromotionState.deferThresholdPrompt()
  } catch (error) {
    logger.warn("Failed to defer invitation after opening repository", error)
  }
  return true
}

import { REPO_URL } from "~/constants/about"
import { createTab } from "~/utils/browser/tabs"
import { createLogger } from "~/utils/core/logger"

import { starPromotionState } from "./state"

const logger = createLogger("StarPromotionRepository")

/** A browser handoff defers the invitation; it does not confirm a star. */
export async function openStarPromotionRepository(): Promise<boolean> {
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

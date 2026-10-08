import { browserApiLogger as logger } from "~/utils/browser/browserEnvironment"
import { getErrorMessage } from "~/utils/core/error"

export type BrowserBookmarkTreeNode = browser.bookmarks.BookmarkTreeNode

export type BrowserBookmarkTreeReadResult =
  | {
      success: true
      tree: BrowserBookmarkTreeNode[]
    }
  | {
      success: false
      reason: "unavailable" | "read_failed"
    }

/**
 * Reads the full native browser bookmark tree without exposing browser APIs to UI code.
 */
export async function getBrowserBookmarkTree(): Promise<BrowserBookmarkTreeReadResult> {
  const getTree = (globalThis as any).browser?.bookmarks?.getTree as
    | (() => Promise<BrowserBookmarkTreeNode[]>)
    | undefined

  if (typeof getTree !== "function") {
    return { success: false, reason: "unavailable" }
  }

  try {
    return {
      success: true,
      tree: await getTree(),
    }
  } catch (error) {
    logger.warn("bookmarks.getTree failed", {
      error: getErrorMessage(error),
    })
    return { success: false, reason: "read_failed" }
  }
}

import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { BodySmall, Caption } from "~/components/ui"
import { UI_CONSTANTS } from "~/constants/ui"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"

import { AnimatedStatValue } from "./AnimatedStatValue"

/**
 * Popup bookmark statistics summary for the Bookmarks view.
 */
export default function BookmarkStatsSection() {
  const { t } = useTranslation(["bookmark", "common"])
  const { bookmarks, pinnedAccountIds, isInitialLoad } = useAccountDataContext()
  const [, setTick] = useState(0)

  useEffect(() => {
    const timer = setInterval(
      () => setTick((tick) => tick + 1),
      UI_CONSTANTS.UPDATE_INTERVAL,
    )
    return () => clearInterval(timer)
  }, [])

  const bookmarkIdSet = useMemo(() => {
    return new Set(bookmarks.map((bookmark) => bookmark.id))
  }, [bookmarks])

  const pinnedBookmarksCount = useMemo(() => {
    if (!pinnedAccountIds || pinnedAccountIds.length === 0) return 0
    return pinnedAccountIds.filter((id) => bookmarkIdSet.has(id)).length
  }, [bookmarkIdSet, pinnedAccountIds])

  const usedTagsCount = useMemo(() => {
    const tagIds = new Set<string>()
    for (const bookmark of bookmarks) {
      for (const id of bookmark.tagIds || []) {
        if (id) tagIds.add(id)
      }
    }
    return tagIds.size
  }, [bookmarks])

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <BodySmall className="font-medium">
            {t("bookmark:stats.totalBookmarks")}
          </BodySmall>
          <AnimatedStatValue
            value={bookmarks.length}
            isInitialLoad={isInitialLoad}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Caption className="font-medium">
              {t("bookmark:stats.pinnedBookmarks")}
            </Caption>
            <AnimatedStatValue
              value={pinnedBookmarksCount}
              size="md"
              isInitialLoad={isInitialLoad}
            />
          </div>
          <div className="space-y-1">
            <Caption className="font-medium">
              {t("bookmark:stats.usedTags")}
            </Caption>
            <AnimatedStatValue
              value={usedTagsCount}
              size="md"
              isInitialLoad={isInitialLoad}
            />
          </div>
        </div>
      </div>
    </>
  )
}

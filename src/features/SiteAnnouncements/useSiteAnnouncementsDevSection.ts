import { ListPlus, ListX, Plus, TriangleAlert } from "lucide-react"
import { useCallback, useMemo, useState } from "react"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import type { DevPanelInfoRow, DevPanelSection } from "~/features/DevPanel"
import toast from "~/lib/notify"
import { SiteAnnouncementsMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { getRuntimeMessageToastMessage } from "~/services/runtimeMessaging/result"
import {
  isSiteAnnouncementDevFixtureSiteKey,
  SITE_ANNOUNCEMENT_DEV_FIXTURE_SITE_KEY_PREFIX,
  SITE_ANNOUNCEMENTS_LIMITS,
} from "~/services/siteAnnouncements/constants"
import type { SiteAnnouncementsDevSeedRequest } from "~/services/siteAnnouncements/devFixtures"
import { sendSiteAnnouncementsMessage } from "~/services/siteAnnouncements/messaging"
import {
  SITE_ANNOUNCEMENT_STATUS,
  type SiteAnnouncementRecord,
  type SiteAnnouncementSiteState,
} from "~/types/siteAnnouncements"
import { getErrorMessage } from "~/utils/core/error"

import { SITE_ANNOUNCEMENTS_VIRTUALIZATION_THRESHOLD } from "./components/SiteAnnouncementsList"

interface SiteAnnouncementsDevSectionOptions {
  /** Records currently rendered by the page, used to report fixture counts. */
  records: SiteAnnouncementRecord[]
  /** Site states currently rendered by the page, used to report fixture counts. */
  status: SiteAnnouncementSiteState[]
  /** Reloads the page snapshot after a fixture change. */
  refreshData: () => Promise<unknown>
}

/**
 * Announcement fixture controls for the dev panel, registered by the
 * announcements page itself.
 *
 * The page is where a full cache is hard to reach by hand: records only arrive
 * from polling real sites, and a site needing attention only appears once one
 * of those sites fails. These actions seed and clear both shapes as fixture
 * sites, so the bounded list and the aggregate issues notice can be exercised
 * without touching real cached announcements.
 */
export function useSiteAnnouncementsDevSection({
  records,
  status,
  refreshData,
}: SiteAnnouncementsDevSectionOptions): DevPanelSection {
  const [pendingAction, setPendingAction] = useState<string | null>(null)

  const runFixtureAction = useCallback(
    async (
      actionId: string,
      request: SiteAnnouncementsDevSeedRequest | undefined,
    ) => {
      const label = request === undefined ? "Cleared" : "Seeded"
      setPendingAction(actionId)
      try {
        const response =
          request === undefined
            ? await sendSiteAnnouncementsMessage(
                SiteAnnouncementsMessageTypes.DebugClearFixtures,
              )
            : await sendSiteAnnouncementsMessage(
                SiteAnnouncementsMessageTypes.DebugSeedFixtures,
                request,
              )

        if (!response.success) {
          toast.error(
            getRuntimeMessageToastMessage(response) ??
              "Dev: announcement fixture action failed",
          )
          return
        }

        toast.success(
          `Dev: ${label} ${response.data.records} fixture record(s) across ${response.data.sites} fixture site(s)`,
        )
        await refreshData()
      } catch (error) {
        toast.error(getErrorMessage(error))
      } finally {
        setPendingAction(null)
      }
    },
    [refreshData],
  )

  return useMemo(() => {
    const fixtureRecords = records.filter((record) =>
      isSiteAnnouncementDevFixtureSiteKey(record.siteKey),
    )
    const fixtureSites = status.filter((site) =>
      isSiteAnnouncementDevFixtureSiteKey(site.siteKey),
    )
    const failedSites = status.filter(
      (site) => site.status === SITE_ANNOUNCEMENT_STATUS.Error,
    )
    const unsupportedSites = status.filter(
      (site) => site.status === SITE_ANNOUNCEMENT_STATUS.Unsupported,
    )

    const rows: DevPanelInfoRow[] = [
      {
        id: "records",
        label: "Cached records",
        value: `${records.length}`,
        tone: "runtime",
        hint:
          records.length > SITE_ANNOUNCEMENTS_VIRTUALIZATION_THRESHOLD
            ? `Windowed list over ${SITE_ANNOUNCEMENTS_VIRTUALIZATION_THRESHOLD} records`
            : `Plain DOM list up to ${SITE_ANNOUNCEMENTS_VIRTUALIZATION_THRESHOLD} records`,
      },
      {
        id: "fixtures",
        label: "Fixture sites / records",
        value: `${fixtureSites.length} / ${fixtureRecords.length}`,
        tone: "runtime",
        hint: "Clearing fixtures keeps every real cached announcement.",
      },
      {
        id: "issues",
        label: "Sites needing attention",
        value: `${failedSites.length} failed, ${unsupportedSites.length} unsupported`,
        tone: "runtime",
      },
    ]

    const isPending = pendingAction !== null

    return {
      id: "site-announcements-fixtures",
      title: "Site announcements",
      pages: [MENU_ITEM_IDS.SITE_ANNOUNCEMENTS],
      icon: ListPlus,
      description: `Fixtures are cached as ${SITE_ANNOUNCEMENT_DEV_FIXTURE_SITE_KEY_PREFIX} sites, spread over 3 sites because the store caps ${SITE_ANNOUNCEMENTS_LIMITS.recordsPerSite} records per site.`,
      collapsible: true,
      rows,
      actions: [
        {
          id: "seed-25",
          label: "Dev: Seed 25 announcements",
          icon: Plus,
          loading: pendingAction === "seed-25",
          disabled: isPending,
          run: () => runFixtureAction("seed-25", { announcementCount: 25 }),
        },
        {
          id: "seed-200",
          label: "Dev: Seed 200 announcements",
          icon: Plus,
          loading: pendingAction === "seed-200",
          disabled: isPending,
          run: () => runFixtureAction("seed-200", { announcementCount: 200 }),
        },
        {
          id: "seed-issues",
          label: "Dev: Seed 20 failed + 2 unsupported sites",
          icon: TriangleAlert,
          loading: pendingAction === "seed-issues",
          disabled: isPending,
          run: () =>
            runFixtureAction("seed-issues", {
              failedSiteCount: 20,
              unsupportedSiteCount: 2,
            }),
        },
        {
          id: "clear",
          label: "Dev: Clear announcement fixtures",
          icon: ListX,
          loading: pendingAction === "clear",
          disabled: isPending,
          run: () => runFixtureAction("clear", undefined),
        },
      ],
    }
  }, [pendingAction, records, runFixtureAction, status])
}

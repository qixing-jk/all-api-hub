import { fireEvent, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { DevPanelSection } from "~/features/DevPanel"
import { useSiteAnnouncementsDevSection } from "~/features/SiteAnnouncements/useSiteAnnouncementsDevSection"
import toast from "~/lib/notify"
import { SiteAnnouncementsMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { sendSiteAnnouncementsMessage } from "~/services/siteAnnouncements/messaging"
import {
  SITE_ANNOUNCEMENT_STATUS,
  type SiteAnnouncementRecord,
  type SiteAnnouncementSiteState,
} from "~/types/siteAnnouncements"
import { render } from "~~/tests/test-utils/render"

vi.mock("~/services/siteAnnouncements/messaging", () => ({
  sendSiteAnnouncementsMessage: vi.fn(),
}))

vi.mock("~/lib/notify", () => {
  const toastMock = Object.assign(vi.fn(), {
    dismiss: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(() => "toast-id"),
    success: vi.fn(),
  })
  return { default: toastMock }
})

const FIXTURE_SITE_KEY =
  "dev-fixture:new-api:https://dev-fixture-alpha.example.invalid"
const REAL_SITE_KEY = "notice:new-api:https://example.invalid"

function createRecord(siteKey: string, id: string): SiteAnnouncementRecord {
  return {
    id,
    siteKey,
    siteName: "Example",
    siteType: "new-api",
    baseUrl: "https://example.invalid",
    accountId: "account-1",
    providerId: "common",
    title: `Notice ${id}`,
    content: "Body",
    fingerprint: id,
    firstSeenAt: 1,
    lastSeenAt: 1,
    read: false,
  }
}

function createSite(
  siteKey: string,
  status: (typeof SITE_ANNOUNCEMENT_STATUS)[keyof typeof SITE_ANNOUNCEMENT_STATUS],
): SiteAnnouncementSiteState {
  return {
    siteKey,
    siteName: "Example",
    siteType: "new-api",
    baseUrl: "https://example.invalid",
    accountId: "account-1",
    providerId: "common",
    status,
    records: [],
  }
}

function SectionHarness(props: {
  records: SiteAnnouncementRecord[]
  status: SiteAnnouncementSiteState[]
  refreshData: () => Promise<unknown>
}) {
  const section: DevPanelSection = useSiteAnnouncementsDevSection(props)

  return (
    <div>
      {section.rows?.map((row) => (
        <div key={row.id} data-testid={`row-${row.id}`}>
          <span>{row.label}</span>
          <span>{row.value}</span>
          {row.hint ? <span>{row.hint}</span> : null}
        </div>
      ))}
      {section.actions.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={() => void action.run()}
          disabled={action.disabled}
          aria-busy={action.loading || undefined}
        >
          {action.label}
        </button>
      ))}
    </div>
  )
}

const RENDER_OPTIONS = {
  withReleaseUpdateStatusProvider: false,
  withUserPreferencesProvider: false,
  withThemeProvider: false,
} as const

function renderSection(
  overrides: {
    records?: SiteAnnouncementRecord[]
    status?: SiteAnnouncementSiteState[]
  } = {},
) {
  const refreshData = vi.fn().mockResolvedValue(undefined)

  render(
    <SectionHarness
      records={overrides.records ?? []}
      status={overrides.status ?? []}
      refreshData={refreshData}
    />,
    RENDER_OPTIONS,
  )

  return { refreshData }
}

describe("site announcements dev section", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sendSiteAnnouncementsMessage).mockResolvedValue({
      success: true,
      data: { sites: 3, records: 200 },
    })
  })

  it("seeds a long announcement list and refreshes the page", async () => {
    const { refreshData } = renderSection()

    fireEvent.click(
      screen.getByRole("button", { name: "Dev: Seed 200 announcements" }),
    )

    await waitFor(() => {
      expect(sendSiteAnnouncementsMessage).toHaveBeenCalledWith(
        SiteAnnouncementsMessageTypes.DebugSeedFixtures,
        { announcementCount: 200 },
      )
    })
    await waitFor(() => {
      expect(refreshData).toHaveBeenCalled()
    })
    expect(vi.mocked(toast.success)).toHaveBeenCalled()
  })

  it("seeds the failed and unsupported site statuses the page reports", async () => {
    renderSection()

    fireEvent.click(
      screen.getByRole("button", {
        name: "Dev: Seed 20 failed + 2 unsupported sites",
      }),
    )

    await waitFor(() => {
      expect(sendSiteAnnouncementsMessage).toHaveBeenCalledWith(
        SiteAnnouncementsMessageTypes.DebugSeedFixtures,
        { failedSiteCount: 20, unsupportedSiteCount: 2 },
      )
    })
  })

  it("clears fixture announcements through the runtime message", async () => {
    vi.mocked(sendSiteAnnouncementsMessage).mockResolvedValue({
      success: true,
      data: { sites: 6, records: 25 },
    })
    const { refreshData } = renderSection()

    fireEvent.click(
      screen.getByRole("button", {
        name: "Dev: Clear announcement fixtures",
      }),
    )

    await waitFor(() => {
      expect(sendSiteAnnouncementsMessage).toHaveBeenCalledWith(
        SiteAnnouncementsMessageTypes.DebugClearFixtures,
      )
    })
    await waitFor(() => {
      expect(refreshData).toHaveBeenCalled()
    })
  })

  it("reports the backend message when a fixture action fails", async () => {
    vi.mocked(sendSiteAnnouncementsMessage).mockResolvedValue({
      success: false,
      error: "Debug action unavailable",
    })
    const { refreshData } = renderSection()

    fireEvent.click(
      screen.getByRole("button", { name: "Dev: Seed 200 announcements" }),
    )

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        "Debug action unavailable",
      )
    })
    expect(refreshData).not.toHaveBeenCalled()
  })

  it("reports fixture counts, list mode, and site issues", () => {
    renderSection({
      records: [
        createRecord(FIXTURE_SITE_KEY, "fixture-1"),
        createRecord(REAL_SITE_KEY, "real-1"),
      ],
      status: [
        createSite(FIXTURE_SITE_KEY, SITE_ANNOUNCEMENT_STATUS.Success),
        createSite(REAL_SITE_KEY, SITE_ANNOUNCEMENT_STATUS.Error),
        createSite(
          "notice:new-api:https://other.invalid",
          SITE_ANNOUNCEMENT_STATUS.Unsupported,
        ),
      ],
    })

    expect(screen.getByTestId("row-records")).toHaveTextContent("2")
    expect(screen.getByTestId("row-records")).toHaveTextContent(
      "Plain DOM list",
    )
    expect(screen.getByTestId("row-fixtures")).toHaveTextContent("1 / 1")
    expect(screen.getByTestId("row-issues")).toHaveTextContent(
      "1 failed, 1 unsupported",
    )
  })

  it("reports a windowed list once the cache passes the virtualization threshold", () => {
    renderSection({
      records: Array.from({ length: 21 }, (_, index) =>
        createRecord(REAL_SITE_KEY, `real-${index}`),
      ),
    })

    expect(screen.getByTestId("row-records")).toHaveTextContent("Windowed list")
  })
})

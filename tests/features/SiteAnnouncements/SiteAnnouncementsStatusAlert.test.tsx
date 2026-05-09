import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { SiteAnnouncementsStatusAlert } from "~/features/SiteAnnouncements/components/SiteAnnouncementsStatusAlert"
import { testI18n } from "~~/tests/test-utils/i18n"
import { render, screen } from "~~/tests/test-utils/render"

const baseStatus = {
  siteKey: "site-1",
  siteName: "Example",
  siteType: SITE_TYPES.NEW_API,
  baseUrl: "https://example.com",
  accountId: "account-1",
  providerId: "common" as const,
  records: [],
}

describe("SiteAnnouncementsStatusAlert", () => {
  testI18n.addResource(
    "en",
    "siteAnnouncements",
    "status.failed",
    "Failure: {{error}}",
  )

  it("renders nothing for successful checks", () => {
    const { container } = render(
      <SiteAnnouncementsStatusAlert
        status={{ ...baseStatus, status: "success", lastCheckedAt: 1 }}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it("renders the unsupported message when no announcement endpoint is available", async () => {
    render(
      <SiteAnnouncementsStatusAlert
        status={{ ...baseStatus, status: "unsupported", lastCheckedAt: 1 }}
      />,
    )

    expect(
      await screen.findByText(/siteAnnouncements:status\.unsupportedTitle/),
    ).toBeInTheDocument()
    expect(
      screen.getByText("siteAnnouncements:status.unsupported"),
    ).toBeInTheDocument()
  })

  it("renders the failure message and timestamp for errored checks", async () => {
    render(
      <SiteAnnouncementsStatusAlert
        status={{
          ...baseStatus,
          status: "error",
          lastCheckedAt: Date.UTC(2026, 4, 8, 0, 0, 0),
          lastError: "timeout",
        }}
      />,
    )

    expect(
      await screen.findByText(/siteAnnouncements:status\.failedTitle/),
    ).toBeInTheDocument()
    expect(screen.getByText("Failure: timeout")).toBeInTheDocument()
    expect(
      screen.getByText(/siteAnnouncements:status\.lastChecked/),
    ).toBeInTheDocument()
  })

  it("falls back to a placeholder error detail when the failure reason is missing", async () => {
    render(
      <SiteAnnouncementsStatusAlert
        status={{
          ...baseStatus,
          status: "error",
          lastCheckedAt: Date.UTC(2026, 4, 8, 0, 0, 0),
        }}
      />,
    )

    expect(
      await screen.findByText(/siteAnnouncements:status\.failedTitle/),
    ).toBeInTheDocument()
    expect(screen.getByText("Failure: -")).toBeInTheDocument()
  })
})

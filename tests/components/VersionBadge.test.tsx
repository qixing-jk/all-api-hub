import { describe, expect, it, vi } from "vitest"

import { VersionBadge } from "~/components/VersionBadge"
import { render, screen } from "~~/tests/test-utils/render"

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: { version?: string }) => {
        switch (key) {
          case "releaseUpdate.versionBadge.changelogAriaLabel":
            return `changelog for v${options?.version}`
          case "releaseUpdate.versionBadge.updateAvailableAriaLabel":
            return `update available for v${options?.version}`
          default:
            return key
        }
      },
    }),
  }
})

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    getManifest: vi.fn(() => ({
      manifest_version: 3,
      version: "0.0.0",
      optional_permissions: [],
    })),
  }
})

vi.mock("~/utils/navigation/docsLinks", () => ({
  getDocsChangelogUrl: vi.fn(),
}))

vi.mock("~/contexts/ReleaseUpdateStatusContext", () => ({
  useReleaseUpdateStatus: vi.fn(() => ({
    status: null,
    isLoading: false,
    isChecking: false,
    error: null,
    refresh: vi.fn(),
    checkNow: vi.fn(),
  })),
}))

describe("VersionBadge", () => {
  it("renders current version and links to changelog", async () => {
    const { getManifest } = await import("~/utils/browser/browserApi")
    const { getDocsChangelogUrl } = await import("~/utils/navigation/docsLinks")

    vi.mocked(getManifest).mockReturnValue({ version: "1.2.3" } as any)
    vi.mocked(getDocsChangelogUrl).mockReturnValue(
      "https://example.com/changelog.html#_1-2-3",
    )

    render(<VersionBadge />, { withReleaseUpdateStatusProvider: false })

    const link = await screen.findByRole("link", {
      name: "changelog for v1.2.3",
    })
    expect(link).toHaveAttribute(
      "href",
      "https://example.com/changelog.html#_1-2-3",
    )
  })

  it("renders nothing when version is missing", async () => {
    const { getManifest } = await import("~/utils/browser/browserApi")

    vi.mocked(getManifest).mockReturnValue({} as any)

    render(<VersionBadge />, { withReleaseUpdateStatusProvider: false })

    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("links to the latest release and shows a marker when an update is available", async () => {
    const { getManifest } = await import("~/utils/browser/browserApi")
    const { useReleaseUpdateStatus } = await import(
      "~/contexts/ReleaseUpdateStatusContext"
    )

    vi.mocked(getManifest).mockReturnValue({ version: "1.2.3" } as any)
    vi.mocked(useReleaseUpdateStatus).mockReturnValue({
      status: {
        eligible: true,
        reason: "chromium-development",
        currentVersion: "1.2.3",
        latestVersion: "1.3.0",
        updateAvailable: true,
        releaseUrl: "https://github.com/qixing-jk/all-api-hub/releases/latest",
        checkedAt: 0,
        lastError: null,
      },
      isLoading: false,
      isChecking: false,
      error: null,
      refresh: vi.fn(),
      checkNow: vi.fn(),
    })

    render(<VersionBadge />, { withReleaseUpdateStatusProvider: false })

    const link = await screen.findByRole("link", {
      name: "update available for v1.2.3",
    })
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/qixing-jk/all-api-hub/releases/latest",
    )
  })

  it("uses the translated aria label while keeping the visible version compact", async () => {
    const { getManifest } = await import("~/utils/browser/browserApi")
    const { getDocsChangelogUrl } = await import("~/utils/navigation/docsLinks")
    const { useReleaseUpdateStatus } = await import(
      "~/contexts/ReleaseUpdateStatusContext"
    )

    vi.mocked(getManifest).mockReturnValue({ version: "2.0.0" } as any)
    vi.mocked(getDocsChangelogUrl).mockReturnValue(
      "https://example.com/changelog.html#_2-0-0",
    )
    vi.mocked(useReleaseUpdateStatus).mockReturnValue({
      status: null,
      isLoading: false,
      isChecking: false,
      error: null,
      refresh: vi.fn(),
      checkNow: vi.fn(),
    })

    render(<VersionBadge />, { withReleaseUpdateStatusProvider: false })

    expect(
      await screen.findByRole("link", { name: "changelog for v2.0.0" }),
    ).toHaveTextContent("v2.0.0")
  })
})

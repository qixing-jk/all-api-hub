import { describe, expect, it, vi } from "vitest"

import { VersionBadge } from "~/components/VersionBadge"
import { render, screen } from "~/tests/test-utils/render"

vi.mock("~/utils/browserApi", () => ({
  getManifest: vi.fn(),
}))

vi.mock("~/utils/docsLinks", () => ({
  getDocsChangelogUrl: vi.fn(),
}))

describe("VersionBadge", () => {
  it("renders current version and links to changelog", async () => {
    const { getManifest } = await import("~/utils/browserApi")
    const { getDocsChangelogUrl } = await import("~/utils/docsLinks")

    vi.mocked(getManifest).mockReturnValue({ version: "1.2.3" } as any)
    vi.mocked(getDocsChangelogUrl).mockReturnValue(
      "https://example.com/changelog.html#_1-2-3",
    )

    render(<VersionBadge />)

    const link = await screen.findByRole("link", { name: "v1.2.3 changelog" })
    expect(link).toHaveAttribute(
      "href",
      "https://example.com/changelog.html#_1-2-3",
    )
  })

  it("renders nothing when version is missing", async () => {
    const { getManifest } = await import("~/utils/browserApi")

    vi.mocked(getManifest).mockReturnValue({} as any)

    render(<VersionBadge />)

    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })
})

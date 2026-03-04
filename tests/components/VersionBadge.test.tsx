import { describe, expect, it, vi } from "vitest"

import { VersionBadge } from "~/src/components/VersionBadge"
import { render, screen } from "~/tests/test-utils/render"

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/src/utils/browser/browserApi")>()
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

describe("VersionBadge", () => {
  it("renders current version and links to changelog", async () => {
    const { getManifest } = await import("~/src/utils/browser/browserApi")
    const { getDocsChangelogUrl } = await import(
      "~/src/utils/navigation/docsLinks"
    )

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
    const { getManifest } = await import("~/src/utils/browser/browserApi")

    vi.mocked(getManifest).mockReturnValue({} as any)

    render(<VersionBadge />)

    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })
})

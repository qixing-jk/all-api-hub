import { describe, expect, it, vi } from "vitest"

import { NEW_API } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import ManagedSiteChannels from "~/entrypoints/options/pages/ManagedSiteChannels"
import { getManagedSiteService } from "~/services/managedSites/managedSiteService"
import { fireEvent, render, screen, waitFor } from "~/tests/test-utils/render"
import { sendRuntimeMessage } from "~/utils/browserApi"
import { navigateWithinOptionsPage } from "~/utils/navigation"

vi.mock("~/utils/browserApi", async (importActual) => {
  const actual = (await importActual()) as any
  return { ...actual, sendRuntimeMessage: vi.fn() }
})

vi.mock("~/services/managedSites/managedSiteService", () => ({
  getManagedSiteService: vi.fn(),
}))

vi.mock("~/contexts/UserPreferencesContext", async (importActual) => {
  const actual = (await importActual()) as any
  return { ...actual, useUserPreferencesContext: vi.fn() }
})

vi.mock("~/utils/navigation", async (importActual) => {
  const actual = (await importActual()) as any
  return { ...actual, navigateWithinOptionsPage: vi.fn() }
})

vi.mock("react-hot-toast", () => ({
  default: {
    dismiss: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    success: vi.fn(),
  },
}))

describe("ManagedSiteChannels", () => {
  const mockChannels = (channels: any[]) => {
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      managedSiteType: NEW_API,
    } as any)

    vi.mocked(getManagedSiteService).mockResolvedValue({
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
    } as any)

    vi.mocked(sendRuntimeMessage).mockResolvedValue({
      success: true,
      data: { items: channels },
    } as any)
  }

  it("syncs routeParams.search into the search box and filters rows", async () => {
    mockChannels([
      { id: 1, name: "Alpha", base_url: "https://site-a.example" },
      { id: 2, name: "Beta", base_url: "https://site-b.example" },
    ])

    render(<ManagedSiteChannels routeParams={{ search: "site-a" }} />)

    await screen.findByText("Alpha")

    const input = screen.getByRole("textbox") as HTMLInputElement
    expect(input.value).toBe("site-a")

    await waitFor(() => {
      expect(screen.queryByText("Beta")).not.toBeInTheDocument()
    })
  })

  it("renders base_url as a clickable link", async () => {
    mockChannels([{ id: 1, name: "Alpha", base_url: "https://click.me" }])

    render(<ManagedSiteChannels />)

    await screen.findByText("Alpha")

    const link = screen.getByRole("link", { name: "https://click.me" })
    expect(link.getAttribute("href")).toMatch(/^https:\/\/click\.me\/?$/)
  })

  it("updates the options URL search param when the search input changes", async () => {
    mockChannels([{ id: 1, name: "Alpha", base_url: "https://example.com" }])

    render(<ManagedSiteChannels routeParams={{}} />)

    await screen.findByText("Alpha")

    const input = screen.getByRole("textbox") as HTMLInputElement
    fireEvent.change(input, { target: { value: "foo" } })

    await waitFor(() => {
      expect(navigateWithinOptionsPage).toHaveBeenCalledWith(
        "#managedSiteChannels",
        { search: "foo" },
      )
    })
  })
})

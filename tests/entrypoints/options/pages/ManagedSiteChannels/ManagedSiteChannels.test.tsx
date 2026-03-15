import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ChannelDialogContainer } from "~/components/dialogs/ChannelDialog"
import { NEW_API } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import ManagedSiteChannels from "~/entrypoints/options/pages/ManagedSiteChannels"
import { getManagedSiteService } from "~/services/managedSites/managedSiteService"
import { fetchNewApiChannelKey } from "~/services/managedSites/providers/newApiSession"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { navigateWithinOptionsPage } from "~/utils/navigation"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"

vi.mock("~/utils/browser/browserApi", async (importActual) => {
  const actual = (await importActual()) as any
  return { ...actual, sendRuntimeMessage: vi.fn() }
})

vi.mock("~/services/managedSites/managedSiteService", () => ({
  getManagedSiteService: vi.fn(),
}))

vi.mock(
  "~/services/managedSites/providers/newApiSession",
  async (importActual) => {
    const actual = (await importActual()) as any
    return {
      ...actual,
      fetchNewApiChannelKey: vi.fn(),
    }
  },
)

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

const waitForRowText = (text: string) =>
  waitFor(() => expect(screen.getByText(text)).toBeInTheDocument(), {
    timeout: 3000,
  })

describe("ManagedSiteChannels", () => {
  const mockChannels = (channels: any[]) => {
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      managedSiteType: NEW_API,
      newApiBaseUrl: "https://admin.example",
      newApiUserId: "1",
      newApiUsername: "admin",
      newApiPassword: "secret-password",
      newApiTotpSecret: "JBSWY3DPEHPK3PXP",
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

    await waitForRowText("Alpha")

    const input = screen.getByRole("textbox") as HTMLInputElement
    expect(input.value).toBe("site-a")

    await waitFor(() => {
      expect(screen.queryByText("Beta")).not.toBeInTheDocument()
    })
  })

  it("renders base_url as a clickable link", async () => {
    mockChannels([{ id: 1, name: "Alpha", base_url: "https://click.me" }])

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")

    const link = screen.getByRole("link", { name: "https://click.me" })
    expect(link.getAttribute("href")).toMatch(/^https:\/\/click\.me\/?$/)
  })

  it("updates the options URL search param when the search input changes", async () => {
    mockChannels([{ id: 1, name: "Alpha", base_url: "https://example.com" }])

    render(<ManagedSiteChannels routeParams={{}} />)

    await waitForRowText("Alpha")

    const input = screen.getByRole("textbox") as HTMLInputElement
    fireEvent.change(input, { target: { value: "foo" } })

    await waitFor(() => {
      expect(navigateWithinOptionsPage).toHaveBeenCalledWith(
        "#managedSiteChannels",
        { search: "foo" },
      )
    })
  })

  it("loads the real channel key from the edit dialog", async () => {
    const user = userEvent.setup()
    mockChannels([
      {
        id: 208,
        name: "Alpha",
        base_url: "https://example.com",
        type: 1,
        models: "gpt-4o",
        group: "default",
        status: 1,
        priority: 0,
        weight: 0,
        key: "",
      },
    ])
    vi.mocked(fetchNewApiChannelKey).mockResolvedValue("sk-real-channel-key")

    render(
      <>
        <ManagedSiteChannels />
        <ChannelDialogContainer />
      </>,
    )

    await waitForRowText("Alpha")

    const row = screen.getByText("Alpha").closest("tr")
    expect(row).toBeTruthy()
    const rowButtons = within(row!).getAllByRole("button")
    await user.click(rowButtons[rowButtons.length - 1]!)

    const editItem = await screen.findByText(
      "managedSiteChannels:table.rowActions.edit",
    )
    await user.click(editItem)

    const loadRealKeyButton = await screen.findByRole("button", {
      name: "channelDialog:actions.loadRealKey",
    })
    await user.click(loadRealKeyButton)

    await waitFor(() => {
      expect(fetchNewApiChannelKey).toHaveBeenCalledWith({
        baseUrl: "https://admin.example",
        userId: "1",
        channelId: 208,
      })
    })

    expect(screen.getByDisplayValue("sk-real-channel-key")).toBeInTheDocument()
  })
})

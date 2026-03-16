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
    let resolveRealKey: ((key: string) => void) | undefined
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
    vi.mocked(fetchNewApiChannelKey).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRealKey = resolve
        }),
    )

    render(
      <>
        <ManagedSiteChannels />
        <ChannelDialogContainer />
      </>,
    )

    await waitForRowText("Alpha")

    const row = screen.getByText("Alpha").closest("tr")
    expect(row).toBeTruthy()
    await user.click(
      within(row!).getByRole("button", {
        name: "managedSiteChannels:table.columns.actions",
      }),
    )

    const editItem = await screen.findByRole("menuitem", {
      name: "managedSiteChannels:table.rowActions.edit",
    })
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

    expect(
      screen.getByRole("button", {
        name: "channelDialog:actions.loadingRealKey",
      }),
    ).toBeDisabled()

    resolveRealKey?.("sk-real-channel-key")

    await waitFor(() => {
      expect(
        screen.getByDisplayValue("sk-real-channel-key"),
      ).toBeInTheDocument()
    })
  })

  it("ignores stale real-key responses after reopening the dialog for another channel", async () => {
    const user = userEvent.setup()
    let resolveFirstRealKey: ((key: string) => void) | undefined

    mockChannels([
      {
        id: 208,
        name: "Alpha",
        base_url: "https://example.com/alpha",
        type: 1,
        models: "gpt-4o",
        group: "default",
        status: 1,
        priority: 0,
        weight: 0,
        key: "",
      },
      {
        id: 209,
        name: "Beta",
        base_url: "https://example.com/beta",
        type: 1,
        models: "gpt-4o-mini",
        group: "default",
        status: 1,
        priority: 0,
        weight: 0,
        key: "",
      },
    ])

    vi.mocked(fetchNewApiChannelKey).mockImplementation(({ channelId }) => {
      if (channelId === 208) {
        return new Promise((resolve) => {
          resolveFirstRealKey = resolve
        })
      }

      return Promise.resolve("sk-beta-channel-key")
    })

    render(
      <>
        <ManagedSiteChannels />
        <ChannelDialogContainer />
      </>,
    )

    await waitForRowText("Alpha")
    await waitForRowText("Beta")

    const alphaRow = screen.getByText("Alpha").closest("tr")
    expect(alphaRow).toBeTruthy()
    await user.click(
      within(alphaRow!).getByRole("button", {
        name: "managedSiteChannels:table.columns.actions",
      }),
    )

    await user.click(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.edit",
      }),
    )

    await user.click(
      await screen.findByRole("button", {
        name: "channelDialog:actions.loadRealKey",
      }),
    )

    await waitFor(() => {
      expect(fetchNewApiChannelKey).toHaveBeenCalledWith({
        baseUrl: "https://admin.example",
        userId: "1",
        channelId: 208,
      })
    })

    await user.click(
      screen.getByRole("button", {
        name: "common:actions.cancel",
      }),
    )

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    const betaRow = screen.getByText("Beta").closest("tr")
    expect(betaRow).toBeTruthy()
    await user.click(
      within(betaRow!).getByRole("button", {
        name: "managedSiteChannels:table.columns.actions",
      }),
    )

    await user.click(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.edit",
      }),
    )

    resolveFirstRealKey?.("sk-stale-alpha-key")

    const keyInput = await screen.findByPlaceholderText(
      "channelDialog:fields.key.placeholder",
    )

    await waitFor(() => {
      expect(keyInput).toHaveValue("")
      expect(
        screen.queryByDisplayValue("sk-stale-alpha-key"),
      ).not.toBeInTheDocument()
    })
  })
})

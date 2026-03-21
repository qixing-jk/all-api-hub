import userEvent from "@testing-library/user-event"
import toast from "react-hot-toast"
import { describe, expect, it, vi } from "vitest"

import { ChannelDialogContainer } from "~/components/dialogs/ChannelDialog"
import { DONE_HUB, NEW_API, VELOERA } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import ManagedSiteChannels from "~/entrypoints/options/pages/ManagedSiteChannels"
import {
  getManagedSiteService,
  getManagedSiteServiceForType,
} from "~/services/managedSites/managedSiteService"
import {
  ensureNewApiManagedSession,
  fetchNewApiChannelKey,
  isNewApiVerifiedSessionActive,
  NEW_API_MANAGED_SESSION_STATUSES,
} from "~/services/managedSites/providers/newApiSession"
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
  getManagedSiteServiceForType: vi.fn(),
}))

vi.mock(
  "~/services/managedSites/providers/newApiSession",
  async (importActual) => {
    const actual = (await importActual()) as any
    return {
      ...actual,
      ensureNewApiManagedSession: vi.fn(),
      fetchNewApiChannelKey: vi.fn(),
      isNewApiVerifiedSessionActive: vi.fn(),
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
  const buildPreferences = (options?: {
    managedSiteType?: string
    withMigrationTarget?: boolean
  }) => {
    const managedSiteType = options?.managedSiteType ?? NEW_API

    return {
      managedSiteType,
      newApi: {
        baseUrl: "https://admin.example",
        adminToken: "new-api-token",
        userId: "1",
        username: "admin",
        password: "secret-password",
        totpSecret: "JBSWY3DPEHPK3PXP",
      },
      doneHub:
        options?.withMigrationTarget || managedSiteType === DONE_HUB
          ? {
              baseUrl: "https://donehub.example",
              adminToken: "donehub-token",
              userId: "9",
            }
          : {
              baseUrl: "",
              adminToken: "",
              userId: "",
            },
      veloera:
        managedSiteType === VELOERA
          ? {
              baseUrl: "https://veloera.example",
              adminToken: "veloera-token",
              userId: "5",
            }
          : {
              baseUrl: "",
              adminToken: "",
              userId: "",
            },
      octopus: {
        baseUrl: "",
        username: "",
        password: "",
      },
    }
  }

  const mockChannels = (
    channels: any[],
    options?: {
      managedSiteType?: string
      messagesKey?: string
      withMigrationTarget?: boolean
      fetchChannelSecretKey?: (...args: unknown[]) => Promise<string>
    },
  ) => {
    const managedSiteType = options?.managedSiteType ?? NEW_API
    const messagesKey =
      options?.messagesKey ??
      (managedSiteType === DONE_HUB
        ? "donehub"
        : managedSiteType === VELOERA
          ? "veloera"
          : "newapi")
    const preferences = buildPreferences({
      managedSiteType,
      withMigrationTarget: options?.withMigrationTarget,
    })

    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences,
      managedSiteType,
      newApiBaseUrl: preferences.newApi.baseUrl,
      newApiUserId: preferences.newApi.userId,
      newApiUsername: preferences.newApi.username,
      newApiPassword: preferences.newApi.password,
      newApiTotpSecret: preferences.newApi.totpSecret,
    } as any)

    vi.mocked(getManagedSiteService).mockResolvedValue({
      siteType: managedSiteType,
      messagesKey,
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      fetchChannelSecretKey: options?.fetchChannelSecretKey,
    } as any)

    vi.mocked(sendRuntimeMessage).mockResolvedValue({
      success: true,
      data: { items: channels },
    } as any)

    vi.mocked(isNewApiVerifiedSessionActive).mockReturnValue(true)
    vi.mocked(ensureNewApiManagedSession).mockResolvedValue({
      status: NEW_API_MANAGED_SESSION_STATUSES.VERIFIED,
      methods: {
        twoFactorEnabled: true,
        passkeyEnabled: false,
      },
    } as any)

    vi.mocked(getManagedSiteServiceForType).mockReturnValue({
      siteType: DONE_HUB,
      messagesKey: "donehub",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://donehub.example",
        token: "donehub-token",
        userId: "9",
      }),
      buildChannelPayload: vi.fn((draft: any) => ({
        mode: "single",
        channel: {
          name: draft.name,
          key: draft.key,
        },
      })),
      createChannel: vi.fn().mockResolvedValue({
        success: true,
        message: "ok",
      }),
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

  it.each([
    [DONE_HUB, "donehub"],
    [VELOERA, "veloera"],
  ])(
    "loads the real channel key from the edit dialog for %s",
    async (managedSiteType, messagesKey) => {
      const user = userEvent.setup()
      const fetchChannelSecretKey = vi
        .fn()
        .mockResolvedValue("sk-real-channel-key")

      mockChannels(
        [
          {
            id: 308,
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
        ],
        {
          managedSiteType,
          messagesKey,
          fetchChannelSecretKey,
        },
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
        expect(fetchChannelSecretKey).toHaveBeenCalledWith(
          "https://admin.example",
          "t",
          "1",
          308,
        )
      })

      await waitFor(() => {
        expect(
          screen.getByDisplayValue("sk-real-channel-key"),
        ).toBeInTheDocument()
      })
    },
  )

  it("shows the migration entry and explains when no target is configured", async () => {
    const user = userEvent.setup()
    mockChannels(
      [{ id: 1, name: "Alpha", base_url: "https://example.com", key: "k" }],
      { withMigrationTarget: false },
    )

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")

    const entry = screen.getByRole("button", {
      name: "managedSiteChannels:toolbar.enterMigrationMode",
    })
    expect(entry).toBeInTheDocument()

    await user.click(entry)

    expect(toast.error).toHaveBeenCalledWith(
      "managedSiteChannels:migration.alerts.noTargets.description",
    )
  })

  it("reveals migration controls only after entering migration mode", async () => {
    const user = userEvent.setup()

    mockChannels(
      [
        { id: 1, name: "Alpha", base_url: "https://alpha.example", key: "a" },
        { id: 2, name: "Beta", base_url: "https://beta.example", key: "b" },
      ],
      { withMigrationTarget: true },
    )

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")
    await waitForRowText("Beta")

    expect(
      screen.queryByRole("button", {
        name: "managedSiteChannels:toolbar.migrateSelected",
      }),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.enterMigrationMode",
      }),
    )

    expect(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.exitMigrationMode",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.migrateSelected",
      }),
    ).toBeInTheDocument()

    const betaRow = screen.getByText("Beta").closest("tr")
    expect(betaRow).toBeTruthy()
    await user.click(
      within(betaRow!).getByRole("button", {
        name: "managedSiteChannels:table.columns.actions",
      }),
    )

    await user.click(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.migrate",
      }),
    )

    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).getByText("managedSiteChannels:migration.title"),
    ).toBeInTheDocument()
    expect(within(dialog).getByText("Beta")).toBeInTheDocument()
  })

  it("uses filtered rows for migrate filtered and shows an execution summary", async () => {
    const user = userEvent.setup()

    mockChannels(
      [
        {
          id: 1,
          name: "Alpha",
          base_url: "https://site-a.example",
          key: "alpha-key",
          type: 1,
          models: "gpt-4o",
          group: "default",
          status: 1,
          priority: 0,
          weight: 0,
        },
        {
          id: 2,
          name: "Beta",
          base_url: "https://site-b.example",
          key: "beta-key",
          type: 1,
          models: "gpt-4o-mini",
          group: "default",
          status: 1,
          priority: 0,
          weight: 0,
        },
      ],
      { withMigrationTarget: true },
    )

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")
    await waitForRowText("Beta")

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "site-a" },
    })

    await waitFor(() => {
      expect(screen.queryByText("Beta")).not.toBeInTheDocument()
    })

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.enterMigrationMode",
      }),
    )

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.migrateFiltered",
      }),
    )

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Alpha")).toBeInTheDocument()
    expect(within(dialog).queryByText("Beta")).not.toBeInTheDocument()

    await user.click(
      within(dialog).getByRole("button", {
        name: "managedSiteChannels:migration.actions.start",
      }),
    )

    await user.click(
      await screen.findByRole("button", {
        name: "managedSiteChannels:migration.confirm.confirm",
      }),
    )

    await waitFor(() => {
      expect(
        within(dialog).getByText("managedSiteChannels:migration.results.title"),
      ).toBeInTheDocument()
    })

    expect(getManagedSiteServiceForType).toHaveBeenCalledWith("done-hub")
  })
})

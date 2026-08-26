import "./managedSiteChannelsMocks"

import userEvent from "@testing-library/user-event"
import { renderToStaticMarkup } from "react-dom/server"
import toast from "react-hot-toast"
import { describe, expect, it, vi } from "vitest"

import { ChannelDialogProvider } from "~/components/dialogs/ChannelDialog"
import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import {
  attachChannelFilterResourceRef,
  isChannelRowLike,
  default as ManagedSiteChannels,
  upsertChannelRow,
} from "~/features/ManagedSiteChannels/ManagedSiteChannels"
import { accountStorage } from "~/services/accounts/accountStorage"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { getManagedSiteService } from "~/services/managedSites/managedSiteService"
import { sendModelSyncMessage } from "~/services/models/modelSync/messaging"
import {
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_MANAGED_SITE_TYPES,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import { createManagedUpstreamResourceRef } from "~/types/managedUpstreamResource"
import {
  navigateWithinOptionsPage,
  openSettingsTab,
  pushWithinOptionsPage,
} from "~/utils/navigation"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"

import { mockCompleteProductAnalyticsAction } from "./managedSiteChannelsMocks"
import {
  buildChannelListData,
  buildCompleteChannelRow,
  buildPreferences,
  markGatewayGuidanceOnboardingCompletedMock,
  mockChannels,
  mockMutablePreferencesContext,
  setupManagedSiteChannelsTest,
  setupStaleChannelResponseAfterSiteSwitch,
  waitForChannelsRefreshIdle,
  waitForRowText,
} from "./managedSiteChannelsTestSupport"

describe("ManagedSiteChannels", () => {
  setupManagedSiteChannelsTest()

  it("accepts only table-ready mutation channel rows", () => {
    const completeRow = buildCompleteChannelRow()

    expect(isChannelRowLike(null)).toBe(false)
    expect(isChannelRowLike("channel")).toBe(false)
    expect(isChannelRowLike(completeRow)).toBe(true)
    expect(isChannelRowLike({ ...completeRow, type: "openai" })).toBe(true)

    for (const field of ["id", "status", "priority", "weight"]) {
      expect(
        isChannelRowLike({
          ...completeRow,
          [field]: undefined,
        }),
      ).toBe(false)
    }

    for (const field of ["name", "key", "base_url", "models", "group"]) {
      expect(
        isChannelRowLike({
          ...completeRow,
          [field]: undefined,
        }),
      ).toBe(false)
    }
  })

  it("inserts and replaces mutation channel rows by id", () => {
    const alphaResourceRef = createManagedUpstreamResourceRef({
      managedSiteType: SITE_TYPES.NEW_API,
      scopeKey: "https://managed.example.invalid",
      resourceId: 1,
    })
    const alpha = buildCompleteChannelRow({
      id: 1,
      name: "Alpha",
      resourceRef: alphaResourceRef,
    })
    const beta = buildCompleteChannelRow({
      id: 2,
      name: "Beta",
    })
    const alphaEdited = buildCompleteChannelRow({
      id: 1,
      name: "Alpha Edited",
    })

    expect(upsertChannelRow([alpha], beta)).toEqual([beta, alpha])
    expect(upsertChannelRow([alpha], alphaEdited)).toEqual([
      {
        ...alphaEdited,
        resourceRef: alphaResourceRef,
      },
    ])
  })

  it("attaches resource refs to newly inserted mutation rows before upsert", () => {
    const created = buildCompleteChannelRow({
      id: 3,
      name: "Created",
    })
    const attached = attachChannelFilterResourceRef({
      channel: created,
      managedSiteType: SITE_TYPES.NEW_API,
      baseUrl: " https://managed.example.invalid/admin ",
    })

    expect(upsertChannelRow([], attached)).toEqual([
      expect.objectContaining({
        id: 3,
        resourceRef: {
          managedSiteType: SITE_TYPES.NEW_API,
          scopeKey: "https://managed.example.invalid",
          resourceId: "3",
        },
      }),
    ])
  })

  it("leaves mutation rows unreferenced when the resource scope is unavailable", () => {
    const created = buildCompleteChannelRow({
      id: 3,
      name: "Created",
    })

    expect(
      attachChannelFilterResourceRef({
        channel: created,
        managedSiteType: SITE_TYPES.NEW_API,
        baseUrl: " ",
      }),
    ).toBe(created)
  })

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

  it("shows the no-channel empty state when the managed site has no channels", async () => {
    mockChannels([])

    render(<ManagedSiteChannels />)

    await waitForChannelsRefreshIdle()

    expect(
      screen.getByText("managedSiteChannels:gatewayGuidance.empty.title"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("managedSiteChannels:table.emptyFiltered"),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "managedSiteChannels:gatewayGuidance.empty.importFromAccountKey",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "managedSiteChannels:gatewayGuidance.empty.importFromApiKeyLibrary",
      }),
    ).toBeInTheDocument()
  })

  it("does not render gateway empty actions before the initial channel load starts", () => {
    mockChannels([])

    const initialMarkup = renderToStaticMarkup(
      <ChannelDialogProvider>
        <ManagedSiteChannels />
      </ChannelDialogProvider>,
    )

    expect(initialMarkup).not.toContain(
      "managedSiteChannels:gatewayGuidance.empty.importFromAccountKey",
    )
    expect(initialMarkup).not.toContain(
      "managedSiteChannels:gatewayGuidance.empty.importFromApiKeyLibrary",
    )
  })

  it("shows filtered guidance without credential source actions when an empty channel list has a route search", async () => {
    mockChannels([])

    render(<ManagedSiteChannels routeParams={{ search: "missing" }} />)

    expect(
      await screen.findByText("managedSiteChannels:table.emptyFiltered"),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", {
        name: "managedSiteChannels:gatewayGuidance.empty.importFromAccountKey",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "managedSiteChannels:gatewayGuidance.empty.importFromApiKeyLibrary",
      }),
    ).not.toBeInTheDocument()
  })

  it("shows the filtered empty state when a search term matches no channels", async () => {
    mockChannels([
      { id: 1, name: "Alpha", base_url: "https://site-a.example" },
      { id: 2, name: "Beta", base_url: "https://site-b.example" },
    ])

    render(<ManagedSiteChannels routeParams={{ search: "gamma" }} />)

    await waitForChannelsRefreshIdle()

    const input = screen.getByRole("textbox") as HTMLInputElement
    expect(input.value).toBe("gamma")
    expect(
      screen.getByText("managedSiteChannels:table.emptyFiltered"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("managedSiteChannels:table.emptyNoChannels"),
    ).not.toBeInTheDocument()
  })

  it("shows the filtered empty state when a route channel id matches no channels", async () => {
    mockChannels([{ id: 1, name: "Alpha", base_url: "https://site-a.example" }])

    render(<ManagedSiteChannels routeParams={{ channelId: "999" }} />)

    await waitForChannelsRefreshIdle()

    const input = screen.getByRole("textbox") as HTMLInputElement
    expect(input.value).toBe("999")
    expect(
      screen.getByText("managedSiteChannels:table.emptyFiltered"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("managedSiteChannels:table.emptyNoChannels"),
    ).not.toBeInTheDocument()
  })

  it("opens managed-site settings from the title shortcut", async () => {
    mockChannels([{ id: 1, name: "Alpha", base_url: "https://site-a.example" }])

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")

    fireEvent.click(
      screen.getByRole("button", { name: "common:labels.settings" }),
    )

    expect(openSettingsTab).toHaveBeenCalledWith("managedSite", {
      anchor: "managed-site-selector",
      preserveHistory: true,
    })
  })

  it("pushes configured empty channel lists to both credential source workflows", async () => {
    const user = userEvent.setup()

    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([
      {
        id: "account-1",
        disabled: false,
        siteType: "new-api",
        baseUrl: "https://account.example.invalid",
        authType: "access_token",
        userId: "user-1",
        token: "test-token",
      },
      { id: "disabled-account", disabled: true },
    ] as any)
    mockChannels([])

    render(<ManagedSiteChannels />)

    expect(
      await screen.findByText(
        "managedSiteChannels:gatewayGuidance.empty.title",
      ),
    ).toBeVisible()
    expect(
      screen.getByText("managedSiteChannels:gatewayGuidance.empty.description"),
    ).toBeVisible()

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:gatewayGuidance.empty.importFromAccountKey",
      }),
    )

    await waitFor(() => {
      expect(pushWithinOptionsPage).toHaveBeenNthCalledWith(1, "#keys", {
        accountId: "account-1",
        guidedImport: "managedSite",
      })
    })

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:gatewayGuidance.empty.importFromApiKeyLibrary",
      }),
    )

    expect(pushWithinOptionsPage).toHaveBeenNthCalledWith(
      2,
      "#apiCredentialProfiles",
      { guidedImport: "managedSite" },
    )
    expect(pushWithinOptionsPage).toHaveBeenCalledTimes(2)
  })

  it("makes API credential import primary when only profile sources are available", async () => {
    const user = userEvent.setup()

    vi.mocked(apiCredentialProfilesStorage.listProfiles).mockResolvedValue([
      { id: "profile-1" },
    ] as any)
    mockChannels([])

    render(<ManagedSiteChannels />)

    const actions = await screen.findAllByRole("button", {
      name: /managedSiteChannels:gatewayGuidance\.empty\.importFrom/,
    })

    expect(actions.map((action) => action.textContent)).toEqual([
      "managedSiteChannels:gatewayGuidance.empty.importFromApiKeyLibrary",
      "managedSiteChannels:gatewayGuidance.empty.importFromAccountKey",
    ])

    await user.click(actions[0])

    expect(pushWithinOptionsPage).toHaveBeenCalledWith(
      "#apiCredentialProfiles",
      { guidedImport: "managedSite" },
    )
  })

  it("does not render gateway import actions while source inventory is loading", async () => {
    vi.mocked(accountStorage.getAllAccounts).mockImplementation(
      () => new Promise(() => {}),
    )
    vi.mocked(apiCredentialProfilesStorage.listProfiles).mockImplementation(
      () => new Promise(() => {}),
    )
    mockChannels([])

    render(<ManagedSiteChannels />)

    expect(
      await screen.findByText(
        "managedSiteChannels:gatewayGuidance.empty.title",
      ),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", {
        name: /managedSiteChannels:gatewayGuidance\.empty\.importFrom/,
      }),
    ).not.toBeInTheDocument()
  })

  it("keeps API credential import primary when account inventory fails", async () => {
    vi.mocked(accountStorage.getAllAccounts).mockRejectedValue(
      new Error("account inventory unavailable"),
    )
    vi.mocked(apiCredentialProfilesStorage.listProfiles).mockResolvedValue([
      { id: "profile-1" },
    ] as any)
    mockChannels([])

    render(<ManagedSiteChannels />)

    const actions = await screen.findAllByRole("button", {
      name: /managedSiteChannels:gatewayGuidance\.empty\.importFrom/,
    })

    expect(actions[0]).toHaveTextContent(
      "managedSiteChannels:gatewayGuidance.empty.importFromApiKeyLibrary",
    )
  })

  it("keeps account Key import available when API credential inventory fails", async () => {
    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([
      {
        id: "account-1",
        disabled: false,
        siteType: "new-api",
        baseUrl: "https://account.example.invalid",
        authType: "access_token",
        userId: "user-1",
        token: "test-token",
      },
    ] as any)
    vi.mocked(apiCredentialProfilesStorage.listProfiles).mockRejectedValue(
      new Error("API credential inventory unavailable"),
    )
    mockChannels([])

    render(<ManagedSiteChannels />)

    const actions = await screen.findAllByRole("button", {
      name: /managedSiteChannels:gatewayGuidance\.empty\.importFrom/,
    })

    expect(actions[0]).toHaveTextContent(
      "managedSiteChannels:gatewayGuidance.empty.importFromAccountKey",
    )
  })

  it("keeps account Key import primary when an account source is available", async () => {
    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([
      {
        id: "account-1",
        disabled: false,
        siteType: "new-api",
        baseUrl: "https://account.example.invalid",
        authType: "access_token",
        userId: "user-1",
        token: "test-token",
      },
    ] as any)
    vi.mocked(apiCredentialProfilesStorage.listProfiles).mockResolvedValue([
      { id: "profile-1" },
    ] as any)
    mockChannels([])

    render(<ManagedSiteChannels />)

    const actions = await screen.findAllByRole("button", {
      name: /managedSiteChannels:gatewayGuidance\.empty\.importFrom/,
    })

    expect(actions.map((action) => action.textContent)).toEqual([
      "managedSiteChannels:gatewayGuidance.empty.importFromAccountKey",
      "managedSiteChannels:gatewayGuidance.empty.importFromApiKeyLibrary",
    ])
  })

  it("shows filtered guidance without credential source actions when loaded channels do not match filters", async () => {
    mockChannels([{ id: 1, name: "Alpha", base_url: "https://site-a.example" }])

    render(<ManagedSiteChannels routeParams={{ search: "missing" }} />)

    expect(
      await screen.findByText("managedSiteChannels:table.emptyFiltered"),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", {
        name: "managedSiteChannels:gatewayGuidance.empty.importFromAccountKey",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "managedSiteChannels:gatewayGuidance.empty.importFromApiKeyLibrary",
      }),
    ).not.toBeInTheDocument()
  })

  it("uses routeParams.channelId to focus a channel and restores the full list when cleared", async () => {
    mockChannels([
      { id: 1, name: "Alpha", base_url: "https://site-a.example" },
      { id: 21, name: "Twenty One", base_url: "https://site-b.example" },
    ])

    render(<ManagedSiteChannels routeParams={{ channelId: "21" }} />)

    await waitForRowText("Twenty One")

    const input = screen.getByRole("textbox") as HTMLInputElement
    expect(input.value).toBe("21")

    await waitFor(() => {
      expect(screen.queryByText("Alpha")).not.toBeInTheDocument()
    })

    fireEvent.change(input, { target: { value: "" } })

    await waitFor(() => {
      expect(screen.getByText("Alpha")).toBeInTheDocument()
      expect(navigateWithinOptionsPage).toHaveBeenCalledWith(
        "#managedSiteChannels",
        {},
      )
    })
  })

  it("sorts channels by id descending by default", async () => {
    mockChannels([
      { id: 1, name: "Alpha", base_url: "https://alpha.example" },
      { id: 3, name: "Gamma", base_url: "https://gamma.example" },
      { id: 2, name: "Beta", base_url: "https://beta.example" },
    ])

    const { container } = render(<ManagedSiteChannels />)

    await waitForRowText("Gamma")

    const rows = Array.from(container.querySelectorAll("tbody tr"))
    const channelNames = ["Alpha", "Beta", "Gamma"]
    const names = rows.map(
      (row) =>
        channelNames.find((name) =>
          within(row as HTMLElement).queryByText(name),
        ) ?? null,
    )

    expect(names).toEqual(["Gamma", "Beta", "Alpha"])

    await userEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:table.columns.id",
      }),
    )

    const ascendingRows = Array.from(container.querySelectorAll("tbody tr"))
    const ascendingNames = ascendingRows.map(
      (row) =>
        channelNames.find((name) =>
          within(row as HTMLElement).queryByText(name),
        ) ?? null,
    )

    expect(ascendingNames).toEqual(["Alpha", "Beta", "Gamma"])
  })

  it("loads channels through the managed-site service without using model-sync list messaging", async () => {
    const service = mockChannels([
      { id: 1, name: "Alpha", base_url: "https://alpha.example" },
    ])

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")

    expect(service.listChannels).toHaveBeenCalledWith(
      {
        baseUrl: "https://admin.example",
        adminToken: "t",
        userId: "1",
      },
      { signal: expect.any(AbortSignal) },
    )
    expect(sendModelSyncMessage).not.toHaveBeenCalledWith(
      "modelSync:listChannels",
    )
  })

  it("keeps loaded channels visible when recording onboarding completion fails", async () => {
    markGatewayGuidanceOnboardingCompletedMock.mockRejectedValueOnce(
      new Error("preferences unavailable"),
    )
    mockChannels([
      { id: 1, name: "Alpha", base_url: "https://alpha.example.invalid" },
    ])

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")
    await waitFor(() => {
      expect(markGatewayGuidanceOnboardingCompletedMock).toHaveBeenCalledTimes(
        1,
      )
    })
    expect(screen.getByText("Alpha")).toBeVisible()
  })

  it("reloads the channel list when the managed site type changes", async () => {
    let currentManagedSiteType: ManagedSiteType = SITE_TYPES.NEW_API
    let currentPreferences = buildPreferences({
      managedSiteType: currentManagedSiteType,
      withMigrationTarget: true,
    })
    let resolveDoneHubChannels:
      | ((value: {
          items: Array<{
            id: number
            name: string
            base_url: string
          }>
        }) => void)
      | undefined
    const listChannels = vi
      .fn()
      .mockResolvedValueOnce(
        buildChannelListData([
          { id: 1, name: "Alpha", base_url: "https://site-a.example" },
        ]),
      )
      .mockImplementationOnce(
        () =>
          new Promise<any>((resolve) => {
            resolveDoneHubChannels = resolve
          }),
      )

    mockMutablePreferencesContext(() => ({
      preferences: currentPreferences,
      managedSiteType: currentManagedSiteType,
      extras: { updateManagedSiteType: vi.fn().mockResolvedValue(true) },
    }))

    vi.mocked(getManagedSiteService).mockImplementation(
      async () =>
        ({
          siteType: currentManagedSiteType,
          messagesKey:
            currentManagedSiteType === SITE_TYPES.DONE_HUB
              ? "donehub"
              : "newapi",
          getConfig: vi.fn().mockResolvedValue({
            baseUrl:
              currentManagedSiteType === SITE_TYPES.DONE_HUB
                ? "https://donehub.example"
                : "https://admin.example",
            token: "token",
            userId: "1",
          }),
          listChannels,
        }) as any,
    )

    const { rerender } = render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")

    currentManagedSiteType = SITE_TYPES.DONE_HUB
    currentPreferences = buildPreferences({
      managedSiteType: currentManagedSiteType,
      withMigrationTarget: true,
    })

    rerender(<ManagedSiteChannels />)

    await waitFor(() => {
      expect(listChannels).toHaveBeenCalledTimes(2)
      expect(screen.queryByText("Alpha")).not.toBeInTheDocument()
      expect(
        screen.getByText("managedSiteChannels:table.loading"),
      ).toBeInTheDocument()
    })

    resolveDoneHubChannels?.({
      items: [{ id: 2, name: "Beta", base_url: "https://site-b.example" }],
    })

    await waitFor(() => {
      expect(screen.getByText("Beta")).toBeInTheDocument()
      expect(screen.queryByText("Alpha")).not.toBeInTheDocument()
    })
  })

  it("ignores a rejected request from the previous managed site after switching types", async () => {
    const harness = await setupStaleChannelResponseAfterSiteSwitch()
    harness.staleResponse.reject(new Error("Old site request failed"))

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Cancelled,
        {
          insights: {
            failureReason:
              PRODUCT_ANALYTICS_FAILURE_REASONS.StaleResponseIgnored,
            managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
          },
        },
      )
      expect(
        screen.queryByText("managedSiteChannels:alerts.loadError.title"),
      ).not.toBeInTheDocument()
    })
    expect(screen.getByText("Beta")).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
  })
})

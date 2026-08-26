import "./managedSiteChannelsMocks"

import userEvent from "@testing-library/user-event"
import toast from "react-hot-toast"
import { describe, expect, it, vi } from "vitest"

import { ChannelDialogContainer } from "~/components/dialogs/ChannelDialog"
import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import { ChannelType } from "~/constants"
import { SITE_TYPES } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import ManagedSiteChannels from "~/features/ManagedSiteChannels/ManagedSiteChannels"
import { sendModelSyncMessage } from "~/services/models/modelSync/messaging"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { createTab } from "~/utils/browser/browserApi"
import { openSettingsTab } from "~/utils/navigation"
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"

import { mockResolveManagedUpstreamResourceCapabilities } from "./managedSiteChannelsMocks"
import {
  buildChannelListData,
  buildCompleteChannelRow,
  buildPreferences,
  ChannelDialogSuccessProbe,
  expectManagedSiteChannelActionTracked,
  fillAndSubmitChannelDialog,
  markGatewayGuidanceOnboardingCompletedMock,
  mockChannels,
  mockNewApiServiceWithCreate,
  openRowActionsMenu,
  setupManagedSiteChannelsTest,
  succeededChannelUpdate,
  waitForChannelsRefreshIdle,
  waitForRowText,
} from "./managedSiteChannelsTestSupport"

describe("ManagedSiteChannels", () => {
  setupManagedSiteChannelsTest()

  it("tracks opening the create channel dialog from the toolbar", async () => {
    const user = userEvent.setup()

    mockChannels([])

    render(
      <>
        <ManagedSiteChannels />
        <ChannelDialogContainer />
      </>,
    )

    await waitForChannelsRefreshIdle()

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.addChannel",
      }),
    )

    expectManagedSiteChannelActionTracked(
      PRODUCT_ANALYTICS_ACTION_IDS.CreateManagedSiteChannel,
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
    )
    expect(
      await screen.findByText("channelDialog:title.add"),
    ).toBeInTheDocument()
  })

  it("refreshes instead of upserting incomplete mutation channel rows", async () => {
    const user = userEvent.setup()
    const createChannel = vi.fn().mockResolvedValue({
      outcome: "succeeded",
      data: {
        id: 9,
        name: "Created Channel",
        base_url: "https://created.example",
      },
      confirmedEffects: [
        {
          kind: "resource-created",
          resourceKind: "channel",
          resourceId: 9,
        },
      ],
    })

    mockChannels([])
    const service = mockNewApiServiceWithCreate(createChannel, [
      [],
      [
        {
          ...buildCompleteChannelRow(),
        },
      ],
    ])

    render(
      <>
        <ManagedSiteChannels />
        <ChannelDialogContainer />
      </>,
    )

    await waitForChannelsRefreshIdle()
    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.addChannel",
      }),
    )
    await fillAndSubmitChannelDialog(user, { name: "Created Channel" })

    await waitForRowText("Created Channel")
    expect(service.listChannels).toHaveBeenCalledTimes(2)
  })

  it("upserts complete create responses without a follow-up refresh", async () => {
    const user = userEvent.setup()
    const createChannel = vi.fn().mockResolvedValue({
      outcome: "succeeded",
      data: buildCompleteChannelRow({
        id: 11,
        name: "Direct Create",
        status: 2,
      }),
      confirmedEffects: [
        {
          kind: "resource-created",
          resourceKind: "channel",
          resourceId: 11,
        },
      ],
    })

    mockChannels([])
    const service = mockNewApiServiceWithCreate(createChannel)

    render(
      <>
        <ManagedSiteChannels />
        <ChannelDialogContainer />
      </>,
    )

    await waitForChannelsRefreshIdle()
    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.addChannel",
      }),
    )
    await fillAndSubmitChannelDialog(user, { name: "Direct Create" })

    await waitForRowText("Direct Create")
    expect(
      screen.getByText("managedSiteChannels:statusLabels.manualPause"),
    ).toBeInTheDocument()
    expect(service.listChannels).toHaveBeenCalledTimes(1)
  })

  it("refreshes when create responses do not include row data", async () => {
    const user = userEvent.setup()
    const createChannel = vi.fn().mockResolvedValue({
      outcome: "succeeded",
      data: null,
      confirmedEffects: [
        {
          kind: "resource-created",
          resourceKind: "channel",
        },
      ],
    })

    mockChannels([])
    const service = mockNewApiServiceWithCreate(createChannel, [
      [],
      [buildCompleteChannelRow({ name: "Refresh Create" })],
    ])

    render(
      <>
        <ManagedSiteChannels />
        <ChannelDialogContainer />
      </>,
    )

    await waitForChannelsRefreshIdle()
    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.addChannel",
      }),
    )
    await fillAndSubmitChannelDialog(user, { name: "Refresh Create" })

    await waitForRowText("Refresh Create")
    expect(service.listChannels).toHaveBeenCalledTimes(2)
  })

  it("upserts complete edit responses without a follow-up refresh", async () => {
    const user = userEvent.setup()
    const editedChannel = buildCompleteChannelRow({
      id: 21,
      name: "Alpha Edited",
      base_url: "https://alpha-edited.example",
      status: 2,
    })

    mockChannels([
      buildCompleteChannelRow({
        id: 21,
        name: "Alpha",
        base_url: "https://alpha.example",
      }),
    ])

    render(
      <>
        <ManagedSiteChannels />
        <ChannelDialogContainer />
        <ChannelDialogSuccessProbe
          result={{
            success: true,
            message: "ok",
            data: editedChannel,
          }}
        />
      </>,
    )

    await waitForRowText("Alpha")
    const row = screen.getByText("Alpha").closest("tr")
    expect(row).toBeTruthy()

    await openRowActionsMenu(row!, user)
    await user.click(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.edit",
      }),
    )
    await screen.findByText("channelDialog:title.edit")
    await user.click(
      screen.getByRole("button", {
        name: "apply dialog success",
      }),
    )

    await waitForRowText("Alpha Edited")
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument()
    expect(screen.getByText("https://alpha-edited.example")).toBeInTheDocument()
    expect(sendModelSyncMessage).not.toHaveBeenCalled()
  })

  it("opens New API channel edits through the resource detail path", async () => {
    const user = userEvent.setup()
    const row = buildCompleteChannelRow({
      id: 41,
      name: "Alpha",
      key: "sk-********",
      base_url: "https://alpha.example.invalid",
      models: "gpt-4o",
      group: "default",
    })
    const detail = {
      summary: {
        ref: {
          managedSiteType: SITE_TYPES.NEW_API,
          scopeKey: "https://admin.example",
          resourceId: "41",
        },
        displayName: "Alpha Detail",
        nativeKind: "channel",
        status: "enabled",
        secretState: "masked",
        capabilities: { canUpdate: true },
      },
      native: {
        ...row,
        name: "Alpha Detail",
        model_mapping: '{"gpt-4o":"mapped-gpt-4o"}',
      },
    } as const
    const getDetail = vi.fn().mockResolvedValue(detail)
    const resourceUpdate = vi
      .fn()
      .mockResolvedValue(succeededChannelUpdate(41, null))
    const updateChannel = vi
      .fn()
      .mockResolvedValue(succeededChannelUpdate(41, null))
    const service = mockChannels([row])
    service.updateChannel = updateChannel
    mockResolveManagedUpstreamResourceCapabilities.mockReturnValue({
      supported: true,
      siteType: SITE_TYPES.NEW_API,
      capabilities: {
        items: {
          getDetail,
          update: resourceUpdate,
        },
        drafts: {
          prepareEditDraft: vi.fn(() => ({
            name: "Alpha Detail",
            type: ChannelType.OpenAI,
            key: "sk-********",
            base_url: "https://alpha.example.invalid",
            models: ["gpt-4o"],
            groups: ["default"],
            priority: 0,
            weight: 0,
            status: 1,
          })),
          describeFields: vi.fn(() => [
            { name: "name", label: "Name", type: "text", required: true },
          ]),
          validateDraft: vi.fn(() => ({ valid: true, errors: [] })),
        },
      },
    })

    render(
      <>
        <ManagedSiteChannels />
        <ChannelDialogContainer />
      </>,
    )

    await waitForRowText("Alpha")
    const alphaRow = screen.getByText("Alpha").closest("tr")
    expect(alphaRow).toBeTruthy()
    await openRowActionsMenu(alphaRow!, user)
    await user.click(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.edit",
      }),
    )

    await waitFor(() => {
      expect(getDetail).toHaveBeenCalledWith(
        {
          baseUrl: "https://admin.example",
          adminToken: "t",
          userId: "1",
        },
        detail.summary.ref,
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput)).toHaveValue(
        "Alpha Detail",
      )
    })
    await user.click(screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton))

    await waitFor(() => {
      expect(resourceUpdate).toHaveBeenCalledWith(
        {
          baseUrl: "https://admin.example",
          adminToken: "t",
          userId: "1",
        },
        detail,
        expect.objectContaining({
          name: "Alpha Detail",
          key: "sk-********",
        }),
      )
    })
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "managedSiteChannels:toasts.channelUpdated",
      )
    })
    expect(updateChannel).not.toHaveBeenCalled()
  })

  it("keeps the latest resource edit when an earlier config load resolves late", async () => {
    const user = userEvent.setup()
    const alpha = buildCompleteChannelRow({
      id: 51,
      name: "Alpha",
      key: "sk-********",
    })
    const beta = buildCompleteChannelRow({
      id: 52,
      name: "Beta",
      key: "sk-********",
    })
    const config = {
      baseUrl: "https://admin.example",
      adminToken: "t",
      userId: "1",
    }
    let resolveAlphaConfig: (value: typeof config) => void = () => {}
    const service = mockChannels([alpha, beta])
    service.getConfig = vi
      .fn()
      .mockResolvedValueOnce(config)
      .mockImplementationOnce(
        () =>
          new Promise<typeof config>((resolve) => {
            resolveAlphaConfig = resolve
          }),
      )
      .mockResolvedValue(config)

    const getDetail = vi.fn(
      async (_config: unknown, ref: { resourceId: string }) => {
        const channel = ref.resourceId === "51" ? alpha : beta
        return {
          summary: {
            ref,
            displayName: `${channel.name} Detail`,
            nativeKind: "channel",
            status: "enabled",
            secretState: "masked",
            capabilities: { canUpdate: true },
          },
          native: {
            ...channel,
            name: `${channel.name} Detail`,
          },
        }
      },
    )
    mockResolveManagedUpstreamResourceCapabilities.mockReturnValue({
      supported: true,
      siteType: SITE_TYPES.NEW_API,
      capabilities: {
        items: {
          getDetail,
          update: vi.fn(),
        },
        drafts: {
          prepareEditDraft: vi.fn((detail) => ({
            name: detail.native.name,
            type: detail.native.type,
            key: detail.native.key,
            base_url: detail.native.base_url,
            models: detail.native.models.split(","),
            groups: detail.native.group.split(","),
            priority: detail.native.priority,
            weight: detail.native.weight,
            status: detail.native.status,
          })),
          describeFields: vi.fn(() => [
            { name: "name", label: "Name", type: "text", required: true },
          ]),
          validateDraft: vi.fn(() => ({ valid: true, errors: [] })),
        },
      },
    })

    render(
      <>
        <ManagedSiteChannels />
        <ChannelDialogContainer />
      </>,
    )

    await waitForRowText("Alpha")
    await openRowActionsMenu(screen.getByText("Alpha").closest("tr")!, user)
    await user.click(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.edit",
      }),
    )
    await waitFor(() => {
      expect(service.getConfig).toHaveBeenCalledTimes(2)
    })

    await openRowActionsMenu(screen.getByText("Beta").closest("tr")!, user)
    await user.click(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.edit",
      }),
    )

    await waitFor(() => {
      expect(screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput)).toHaveValue(
        "Beta Detail",
      )
    })

    await act(async () => {
      resolveAlphaConfig(config)
    })

    await waitFor(() => {
      expect(screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput)).toHaveValue(
        "Beta Detail",
      )
      expect(getDetail).not.toHaveBeenCalledWith(
        config,
        expect.objectContaining({ resourceId: "51" }),
      )
    })
  })

  it("keeps the create dialog open when an earlier edit config load resolves late", async () => {
    const user = userEvent.setup()
    const alpha = buildCompleteChannelRow({
      id: 51,
      name: "Alpha",
      key: "sk-********",
    })
    const config = {
      baseUrl: "https://admin.example",
      adminToken: "t",
      userId: "1",
    }
    let resolveAlphaConfig: (value: typeof config) => void = () => {}
    const service = mockChannels([alpha])
    service.getConfig = vi
      .fn()
      .mockResolvedValueOnce(config)
      .mockImplementationOnce(
        () =>
          new Promise<typeof config>((resolve) => {
            resolveAlphaConfig = resolve
          }),
      )

    const getDetail = vi.fn()
    mockResolveManagedUpstreamResourceCapabilities.mockReturnValue({
      supported: true,
      siteType: SITE_TYPES.NEW_API,
      capabilities: {
        items: {
          getDetail,
          update: vi.fn(),
        },
        drafts: {
          prepareEditDraft: vi.fn(),
          describeFields: vi.fn(() => [
            { name: "name", label: "Name", type: "text", required: true },
          ]),
          validateDraft: vi.fn(() => ({ valid: true, errors: [] })),
        },
      },
    })

    render(
      <>
        <ManagedSiteChannels />
        <ChannelDialogContainer />
      </>,
    )

    await waitForRowText("Alpha")
    await openRowActionsMenu(screen.getByText("Alpha").closest("tr")!, user)
    await user.click(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.edit",
      }),
    )
    await waitFor(() => {
      expect(service.getConfig).toHaveBeenCalledTimes(2)
    })

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.addChannel",
      }),
    )
    expect(await screen.findByText("channelDialog:title.add")).toBeVisible()

    await act(async () => {
      resolveAlphaConfig(config)
    })

    await waitFor(() => {
      expect(screen.getByText("channelDialog:title.add")).toBeVisible()
      expect(getDetail).not.toHaveBeenCalled()
    })
  })

  it("opens Veloera channel edits through the resource detail path when its core slice is migrated", async () => {
    const user = userEvent.setup()
    const row = buildCompleteChannelRow({
      id: 42,
      name: "Veloera Alpha",
      key: "sk-********",
      base_url: "https://veloera-alpha.example.invalid",
      models: "gpt-4o",
      group: "default",
    })
    const detail = {
      summary: {
        ref: {
          managedSiteType: SITE_TYPES.VELOERA,
          scopeKey: "https://veloera.example",
          resourceId: "42",
        },
        displayName: "Veloera Alpha Detail",
        nativeKind: "channel",
        status: "enabled",
        secretState: "masked",
        capabilities: { canUpdate: true },
      },
      native: {
        ...row,
        name: "Veloera Alpha Detail",
        model_mapping: '{"gpt-4o":"veloera-gpt-4o"}',
      },
    } as const
    const getDetail = vi.fn().mockResolvedValue(detail)
    const resourceUpdate = vi
      .fn()
      .mockResolvedValue(succeededChannelUpdate(42, null))
    const updateChannel = vi
      .fn()
      .mockResolvedValue(succeededChannelUpdate(42, null))
    const service = mockChannels([row], {
      managedSiteType: SITE_TYPES.VELOERA,
      messagesKey: "veloera",
    })
    service.getConfig = vi.fn().mockResolvedValue({
      baseUrl: "https://veloera.example",
      adminToken: "veloera-token",
      userId: "5",
    })
    service.updateChannel = updateChannel
    mockResolveManagedUpstreamResourceCapabilities.mockReturnValue({
      supported: true,
      siteType: SITE_TYPES.VELOERA,
      capabilities: {
        items: {
          getDetail,
          update: resourceUpdate,
        },
        drafts: {
          prepareEditDraft: vi.fn(() => ({
            name: "Veloera Alpha Detail",
            type: ChannelType.OpenAI,
            key: "sk-********",
            base_url: "https://veloera-alpha.example.invalid",
            models: ["gpt-4o"],
            groups: ["default"],
            priority: 0,
            weight: 0,
            status: 1,
          })),
          describeFields: vi.fn(() => [
            { name: "name", label: "Name", type: "text", required: true },
          ]),
          validateDraft: vi.fn(() => ({ valid: true, errors: [] })),
        },
      },
    })

    render(
      <>
        <ManagedSiteChannels />
        <ChannelDialogContainer />
      </>,
    )

    await waitForRowText("Veloera Alpha")
    const rowElement = screen.getByText("Veloera Alpha").closest("tr")
    expect(rowElement).toBeTruthy()
    await openRowActionsMenu(rowElement!, user)
    await user.click(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.edit",
      }),
    )

    await waitFor(() => {
      expect(getDetail).toHaveBeenCalledWith(
        {
          baseUrl: "https://veloera.example",
          adminToken: "veloera-token",
          userId: "5",
        },
        detail.summary.ref,
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput)).toHaveValue(
        "Veloera Alpha Detail",
      )
    })
    await user.click(screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton))

    await waitFor(() => {
      expect(resourceUpdate).toHaveBeenCalledWith(
        {
          baseUrl: "https://veloera.example",
          adminToken: "veloera-token",
          userId: "5",
        },
        detail,
        expect.objectContaining({
          name: "Veloera Alpha Detail",
          key: "sk-********",
        }),
      )
    })
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "managedSiteChannels:toasts.channelUpdated",
      )
    })
    expect(updateChannel).not.toHaveBeenCalled()
  })

  it("keeps unmigrated managed-site edits on the legacy channel update path", async () => {
    const user = userEvent.setup()
    const row = buildCompleteChannelRow({
      id: 51,
      name: "Legacy Channel",
      key: "sk-********",
      base_url: "https://legacy.example.invalid",
      models: "gpt-4o",
      group: "default",
    })
    const getDetail = vi.fn()
    const updateChannel = vi
      .fn()
      .mockResolvedValue(succeededChannelUpdate(51, row))
    const service = mockChannels([row], {
      managedSiteType: SITE_TYPES.DONE_HUB,
      messagesKey: "donehub",
    })
    service.updateChannel = updateChannel
    mockResolveManagedUpstreamResourceCapabilities.mockReturnValue({
      supported: false,
      siteType: SITE_TYPES.DONE_HUB,
      reason: "core-slice-disabled",
    })

    render(
      <>
        <ManagedSiteChannels />
        <ChannelDialogContainer />
      </>,
    )

    await waitForRowText("Legacy Channel")
    const legacyRow = screen.getByText("Legacy Channel").closest("tr")
    expect(legacyRow).toBeTruthy()
    await openRowActionsMenu(legacyRow!, user)
    await user.click(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.edit",
      }),
    )
    await screen.findByText("channelDialog:title.edit")
    await user.click(screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton))

    await waitFor(() => {
      expect(updateChannel).toHaveBeenCalledWith(
        {
          baseUrl: "https://admin.example",
          adminToken: "t",
          userId: "1",
        },
        expect.objectContaining({ id: 51 }),
      )
    })
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "managedSiteChannels:toasts.channelUpdated",
      )
    })
    expect(getDetail).not.toHaveBeenCalled()
  })

  it("keeps row selection attached to the same channel after an accepted refresh renames and reorders rows", async () => {
    const user = userEvent.setup()
    let resolveRefresh: ((value: { items: any[] }) => void) | undefined

    const service = mockChannels([])
    service.listChannels
      .mockResolvedValueOnce(
        buildChannelListData([
          { id: 1, name: "Alpha", base_url: "https://alpha.example" },
          { id: 2, name: "Beta", base_url: "https://beta.example" },
        ]),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRefresh = resolve as typeof resolveRefresh
          }) as any,
      )

    render(<ManagedSiteChannels />)

    await waitForRowText("Beta")
    await waitForChannelsRefreshIdle()

    const betaRow = screen.getByText("Beta").closest("tr")
    expect(betaRow).toBeTruthy()

    await user.click(
      within(betaRow!).getByRole("checkbox", {
        name: "managedSiteChannels:table.selectRow",
      }),
    )

    await waitFor(() => {
      const currentBetaRow = screen.getByText("Beta").closest("tr")
      expect(currentBetaRow).toBeTruthy()
      expect(
        within(currentBetaRow!).getByRole("checkbox", {
          name: "managedSiteChannels:table.selectRow",
        }),
      ).toBeChecked()
    })

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.refresh",
      }),
    )

    resolveRefresh?.({
      items: [
        {
          id: 2,
          name: "Renamed Beta",
          base_url: "https://beta.example",
        },
        { id: 3, name: "Gamma", base_url: "https://gamma.example" },
      ],
    })

    await waitForRowText("Gamma")

    const refreshedBetaRow = screen.getByText("Renamed Beta").closest("tr")
    const gammaRow = screen.getByText("Gamma").closest("tr")
    expect(refreshedBetaRow).toBeTruthy()
    expect(gammaRow).toBeTruthy()

    expect(
      within(refreshedBetaRow!).getByRole("checkbox", {
        name: "managedSiteChannels:table.selectRow",
      }),
    ).toBeChecked()
    expect(
      within(gammaRow!).getByRole("checkbox", {
        name: "managedSiteChannels:table.selectRow",
      }),
    ).not.toBeChecked()
  })

  it("clears disappeared row selections only after an accepted refresh", async () => {
    const user = userEvent.setup()
    const service = mockChannels([])
    service.listChannels
      .mockResolvedValueOnce(
        buildChannelListData([
          { id: 1, name: "Alpha", base_url: "https://alpha.example" },
        ]),
      )
      .mockResolvedValueOnce(
        buildChannelListData([
          { id: 2, name: "Beta", base_url: "https://beta.example" },
        ]),
      )
      .mockResolvedValueOnce(
        buildChannelListData([
          { id: 1, name: "Alpha returned", base_url: "https://alpha.example" },
        ]),
      )

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")
    await waitForChannelsRefreshIdle()
    await user.click(
      screen.getByRole("checkbox", {
        name: "managedSiteChannels:table.selectRow",
      }),
    )
    expect(
      screen.getByRole("checkbox", {
        name: "managedSiteChannels:table.selectRow",
      }),
    ).toBeChecked()

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.refresh",
      }),
    )
    await waitForRowText("Beta")
    await waitForChannelsRefreshIdle()

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.refresh",
      }),
    )
    await waitForRowText("Alpha returned")

    expect(
      screen.getByRole("checkbox", {
        name: "managedSiteChannels:table.selectRow",
      }),
    ).not.toBeChecked()
  })

  it("shows config recovery without source-import guidance when configuration is missing", async () => {
    const preferences = buildPreferences({
      managedSiteType: SITE_TYPES.NEW_API,
    })
    preferences.newApi = {
      ...preferences.newApi,
      baseUrl: "",
      adminToken: "",
      userId: "",
    }

    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences,
      managedSiteType: SITE_TYPES.NEW_API,
      newApiBaseUrl: preferences.newApi.baseUrl,
      newApiUserId: preferences.newApi.userId,
      newApiUsername: preferences.newApi.username,
      newApiPassword: preferences.newApi.password,
      newApiTotpSecret: preferences.newApi.totpSecret,
      markGatewayGuidanceOnboardingCompleted:
        markGatewayGuidanceOnboardingCompletedMock,
    } as any)

    render(<ManagedSiteChannels />)

    const configDescription = await screen.findByText(
      "messages:newapi.configMissing",
    )
    const settingsAction = screen.getByRole("button", {
      name: "common:actions.goToSettings",
    })
    expect(
      screen.getByText("common:status.configurationRequired"),
    ).toBeInTheDocument()
    expect(configDescription).toBeInTheDocument()
    expect(
      screen.queryByText(
        "managedSiteChannels:gatewayGuidance.empty.description",
      ),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(
        "managedSiteChannels:gatewayGuidance.unconfiguredValueDescription",
      ),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", {
        name: "managedSiteChannels:gatewayGuidance.empty.importFromAccountKey",
      }),
    ).not.toBeInTheDocument()
    expect(sendModelSyncMessage).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()

    fireEvent.click(settingsAction)

    expect(openSettingsTab).toHaveBeenCalledWith("managedSite", {
      preserveHistory: true,
    })
  })

  it("keeps settings first and opens the configured gateway channel console", async () => {
    mockChannels([])
    render(<ManagedSiteChannels />)

    await screen.findByText("managedSiteChannels:gatewayGuidance.empty.title")

    const settingsAction = screen.getByRole("button", {
      name: "common:labels.settings",
    })
    const channelConsoleAction = screen.getByRole("button", {
      name: "managedSiteChannels:gatewayGuidance.openChannelConsole",
    })

    expect(
      settingsAction.compareDocumentPosition(channelConsoleAction) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    fireEvent.click(channelConsoleAction)
    expect(createTab).toHaveBeenCalledWith(
      "https://admin.example/channels",
      true,
    )

    const tokenConsoleAction = screen.getByRole("link", {
      name: "managedSiteChannels:gatewayGuidance.openTokenConsole",
    })
    expect(document.body).toHaveTextContent(
      "managedSiteChannels:gatewayGuidance.clientHint",
    )
    expect(tokenConsoleAction).toHaveAttribute(
      "href",
      "https://admin.example/keys",
    )
    expect(tokenConsoleAction).toHaveAttribute("target", "_blank")
  })
})

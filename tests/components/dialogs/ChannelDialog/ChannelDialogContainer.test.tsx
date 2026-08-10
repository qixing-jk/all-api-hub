import userEvent from "@testing-library/user-event"
import { useEffect } from "react"
import { describe, expect, it, vi } from "vitest"

import {
  ChannelDialogContainer,
  ChannelDialogProvider,
  useChannelDialogContext,
} from "~/components/dialogs/ChannelDialog"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"
import { buildCompleteTodayStatsAvailability } from "~~/tests/test-utils/accountTodayStats"
import { act, render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  addTokenDialogPropsMock,
  channelDialogPropsMock,
  nativeDialogPropsMock,
} = vi.hoisted(() => ({
  addTokenDialogPropsMock: vi.fn(),
  channelDialogPropsMock: vi.fn(),
  nativeDialogPropsMock: vi.fn(),
}))

vi.mock("~/components/dialogs/ChannelDialog/components/ChannelDialog", () => ({
  ChannelDialog: (props: { isOpen: boolean }) => {
    channelDialogPropsMock(props)
    return <div data-testid="mock-channel-dialog" />
  },
}))

vi.mock(
  "~/features/ManagedSiteChannels/components/ManagedResourceCreateDialog",
  () => ({
    ManagedResourceCreateDialog: (props: {
      isOpen: boolean
      onCloseComplete: () => void
    }) => {
      nativeDialogPropsMock(props)
      return props.isOpen ? <div data-testid="mock-native-dialog" /> : null
    },
  }),
)

vi.mock("~/features/TokenProvisioning/components/AddTokenDialog", () => ({
  default: (props: {
    isOpen: boolean
    createPrefill?: Record<string, unknown>
    prefillNotice?: string
  }) => {
    addTokenDialogPropsMock(props)

    if (!props.isOpen) return null

    return (
      <div data-testid="mock-add-token-dialog">
        {props.prefillNotice ? <div>{props.prefillNotice}</div> : null}
      </div>
    )
  },
}))

const buildDisplaySiteData = (): DisplaySiteData => ({
  id: "account-id",
  name: "Account",
  username: "user",
  balance: { USD: 0, CNY: 0 },
  todayConsumption: { USD: 0, CNY: 0 },
  todayIncome: { USD: 0, CNY: 0 },
  todayTokens: { upload: 0, download: 0 },
  todayStatsAvailability: buildCompleteTodayStatsAvailability(),
  health: { status: SiteHealthStatus.Healthy },
  siteType: "sub2api",
  baseUrl: "https://example.invalid",
  token: "access-token",
  userId: "1",
  authType: AuthTypeEnum.AccessToken,
  checkIn: {
    automaticExecutionEnabled: false,
    methodKnowledge: { methods: {} },
    selection: { mode: "automatic" as const },
  },
})

function OpenDefaultTokenQuickCreateDialog({
  allowedGroups,
}: {
  allowedGroups: string[]
}) {
  const { openDefaultTokenQuickCreateDialog } = useChannelDialogContext()

  useEffect(() => {
    openDefaultTokenQuickCreateDialog({
      account: buildDisplaySiteData(),
      allowedGroups,
      notice: "Choose a group",
    })
  }, [allowedGroups, openDefaultTokenQuickCreateDialog])

  return null
}

function OpenNativeCreateDialog() {
  const { openNativeCreateDialog } = useChannelDialogContext()

  useEffect(() => {
    openNativeCreateDialog({
      nativeCreate: {
        siteType: SITE_TYPES.AXON_HUB,
        kind: MANAGED_RESOURCE_KINDS.Channel,
        editor: {
          fields: [],
          initialValues: { name: "Imported channel" },
          validate: () => ({ valid: true }),
          submit: vi.fn(),
        },
        showModelPrefillWarning: true,
        advisoryWarning: null,
      },
    })
  }, [openNativeCreateDialog])

  return null
}

function NativeDialogLifecycleProbe() {
  const { state, closeDialog, openNativeCreateDialog } =
    useChannelDialogContext()

  const openReplacementNativeDialog = () => {
    openNativeCreateDialog({
      nativeCreate: {
        siteType: SITE_TYPES.AXON_HUB,
        kind: MANAGED_RESOURCE_KINDS.Channel,
        editor: {
          fields: [],
          initialValues: { name: "Replacement channel" },
          validate: () => ({ valid: true }),
          submit: vi.fn(),
        },
        showModelPrefillWarning: false,
        advisoryWarning: null,
      },
    })
  }

  return (
    <>
      <button type="button" onClick={closeDialog}>
        Close native dialog
      </button>
      <button type="button" onClick={openReplacementNativeDialog}>
        Open replacement native dialog
      </button>
      <span data-testid="native-dialog-state">
        {state.nativeCreate ? "retained" : "cleared"}
      </span>
      <span data-testid="native-dialog-name">
        {String(state.nativeCreate?.editor.initialValues.name ?? "")}
      </span>
    </>
  )
}

describe("ChannelDialogContainer", () => {
  it("renders AddTokenDialog with default-token prefill for non-empty allowed groups", async () => {
    addTokenDialogPropsMock.mockReset()

    render(
      <ChannelDialogProvider>
        <OpenDefaultTokenQuickCreateDialog allowedGroups={["vip"]} />
        <ChannelDialogContainer />
      </ChannelDialogProvider>,
    )

    expect(await screen.findByTestId("mock-add-token-dialog")).toBeVisible()
    expect(await screen.findByText("Choose a group")).toBeVisible()

    await waitFor(() => {
      expect(addTokenDialogPropsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          isOpen: true,
          createPrefill: {
            modelId: "",
            defaultName: "vip group (auto)",
            group: "vip",
            allowedGroups: ["vip"],
          },
          prefillNotice: "Choose a group",
        }),
      )
    })
  })

  it("does not render AddTokenDialog when allowed groups are empty", async () => {
    addTokenDialogPropsMock.mockReset()

    render(
      <ChannelDialogProvider>
        <OpenDefaultTokenQuickCreateDialog allowedGroups={[]} />
        <ChannelDialogContainer />
      </ChannelDialogProvider>,
    )

    await waitFor(() => {
      expect(addTokenDialogPropsMock).not.toHaveBeenCalled()
    })
    expect(
      screen.queryByTestId("mock-add-token-dialog"),
    ).not.toBeInTheDocument()
  })

  it("renders a native create dialog instead of opening the legacy channel dialog", async () => {
    channelDialogPropsMock.mockReset()
    nativeDialogPropsMock.mockReset()

    render(
      <ChannelDialogProvider>
        <OpenNativeCreateDialog />
        <ChannelDialogContainer />
      </ChannelDialogProvider>,
    )

    expect(await screen.findByTestId("mock-native-dialog")).toBeVisible()
    await waitFor(() => {
      expect(channelDialogPropsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ isOpen: false }),
      )
      expect(nativeDialogPropsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          isOpen: true,
          siteType: SITE_TYPES.AXON_HUB,
          kind: MANAGED_RESOURCE_KINDS.Channel,
          editor: expect.objectContaining({
            initialValues: { name: "Imported channel" },
          }),
          showModelPrefillWarning: true,
        }),
      )
    })
  })

  it("clears native editor state only after its close lifecycle completes", async () => {
    const user = userEvent.setup()
    nativeDialogPropsMock.mockReset()

    render(
      <ChannelDialogProvider>
        <OpenNativeCreateDialog />
        <NativeDialogLifecycleProbe />
        <ChannelDialogContainer />
      </ChannelDialogProvider>,
    )

    expect(await screen.findByTestId("mock-native-dialog")).toBeVisible()
    expect(screen.getByTestId("native-dialog-state")).toHaveTextContent(
      "retained",
    )

    await user.click(
      screen.getByRole("button", { name: "Close native dialog" }),
    )
    await waitFor(() => {
      expect(nativeDialogPropsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ isOpen: false }),
      )
    })
    expect(screen.queryByTestId("mock-native-dialog")).toBeNull()
    expect(screen.getByTestId("native-dialog-state")).toHaveTextContent(
      "retained",
    )

    const closedDialogProps = nativeDialogPropsMock.mock.lastCall?.[0] as {
      onCloseComplete: () => void
    }
    act(() => closedDialogProps.onCloseComplete())

    await waitFor(() => {
      expect(screen.getByTestId("native-dialog-state")).toHaveTextContent(
        "cleared",
      )
    })
  })

  it("does not let an older close completion clear a newer native editor", async () => {
    const user = userEvent.setup()
    nativeDialogPropsMock.mockReset()

    render(
      <ChannelDialogProvider>
        <OpenNativeCreateDialog />
        <NativeDialogLifecycleProbe />
        <ChannelDialogContainer />
      </ChannelDialogProvider>,
    )

    expect(await screen.findByTestId("mock-native-dialog")).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "Close native dialog" }),
    )
    await waitFor(() => {
      expect(nativeDialogPropsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ isOpen: false }),
      )
    })
    const firstClosedDialogProps = nativeDialogPropsMock.mock.lastCall?.[0] as {
      onCloseComplete: () => void
    }

    await user.click(
      screen.getByRole("button", { name: "Open replacement native dialog" }),
    )
    expect(await screen.findByTestId("mock-native-dialog")).toBeVisible()
    expect(screen.getByTestId("native-dialog-name")).toHaveTextContent(
      "Replacement channel",
    )
    await user.click(
      screen.getByRole("button", { name: "Close native dialog" }),
    )
    await waitFor(() => {
      expect(nativeDialogPropsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          isOpen: false,
          editor: expect.objectContaining({
            initialValues: { name: "Replacement channel" },
          }),
        }),
      )
    })
    const replacementClosedDialogProps = nativeDialogPropsMock.mock
      .lastCall?.[0] as { onCloseComplete: () => void }

    act(() => firstClosedDialogProps.onCloseComplete())
    expect(screen.getByTestId("native-dialog-state")).toHaveTextContent(
      "retained",
    )
    expect(screen.getByTestId("native-dialog-name")).toHaveTextContent(
      "Replacement channel",
    )

    act(() => replacementClosedDialogProps.onCloseComplete())
    await waitFor(() => {
      expect(screen.getByTestId("native-dialog-state")).toHaveTextContent(
        "cleared",
      )
    })
  })
})

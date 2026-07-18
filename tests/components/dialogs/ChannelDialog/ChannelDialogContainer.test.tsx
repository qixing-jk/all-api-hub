import { useEffect } from "react"
import { describe, expect, it, vi } from "vitest"

import {
  ChannelDialogContainer,
  ChannelDialogProvider,
  useChannelDialogContext,
} from "~/components/dialogs/ChannelDialog"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"
import { buildCompleteTodayStatsAvailability } from "~~/tests/test-utils/accountTodayStats"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const addTokenDialogPropsMock = vi.hoisted(() => vi.fn())

vi.mock("~/components/dialogs/ChannelDialog/components/ChannelDialog", () => ({
  ChannelDialog: () => <div data-testid="mock-channel-dialog" />,
}))

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
  checkIn: { enableDetection: false },
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
})

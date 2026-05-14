import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsActionId,
  type ProductAnalyticsFeatureId,
} from "~/services/productAnalytics/events"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/UserPreferencesContext")>()
  return {
    ...actual,
    UserPreferencesProvider: ({ children }: { children: ReactNode }) =>
      children,
    useUserPreferencesContext: () => ({
      themeMode: "system",
      updateThemeMode: vi.fn().mockResolvedValue(true),
    }),
  }
})

// Shared mocks to control account data and capture bulk check-in clicks.
let displayDataMock: any[] = []
const handleOpenExternalCheckInsMock = vi.fn()
const trackProductAnalyticsActionStartedMock = vi.hoisted(() => vi.fn())

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    displayData: displayDataMock,
  }),
}))

vi.mock("~/features/AccountManagement/hooks/AccountActionsContext", () => ({
  useAccountActionsContext: () => ({
    handleOpenExternalCheckIns: handleOpenExternalCheckInsMock,
  }),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionStarted: (...args: any[]) =>
    trackProductAnalyticsActionStartedMock(...args),
}))

afterEach(() => {
  vi.restoreAllMocks()
  displayDataMock = []
  handleOpenExternalCheckInsMock.mockReset()
  trackProductAnalyticsActionStartedMock.mockReset()
})

const expectPopupAction = ({
  featureId,
  actionId,
  surfaceId = PRODUCT_ANALYTICS_SURFACE_IDS.PopupActionBar,
}: {
  featureId: ProductAnalyticsFeatureId
  actionId: ProductAnalyticsActionId
  surfaceId?: (typeof PRODUCT_ANALYTICS_SURFACE_IDS)[keyof typeof PRODUCT_ANALYTICS_SURFACE_IDS]
}) => {
  expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith({
    featureId,
    actionId,
    surfaceId,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
  })
}

describe("popup ActionButtons", () => {
  it("tracks the account primary action with popup action bar metadata", async () => {
    const onPrimaryAction = vi.fn()
    const { default: ActionButtons } = await import(
      "~/entrypoints/popup/components/ActionButtons"
    )
    render(
      <ActionButtons
        primaryActionLabel="addAccount"
        onPrimaryAction={onPrimaryAction}
        primaryAnalyticsAction={{
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenCreateAccountDialog,
        }}
      />,
    )

    fireEvent.click(await screen.findByRole("button", { name: "addAccount" }))

    expect(onPrimaryAction).toHaveBeenCalledTimes(1)
    expectPopupAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenCreateAccountDialog,
    })
  })

  it("opens auto check-in page and triggers run when quick check-in button clicked", async () => {
    vi.resetModules()
    const navigation = await import("~/utils/navigation")
    const openAutoCheckinPageSpy = vi
      .spyOn(navigation, "openAutoCheckinPage")
      .mockImplementation(vi.fn() as any)

    const { default: ActionButtons } = await import(
      "~/entrypoints/popup/components/ActionButtons"
    )
    render(
      <ActionButtons
        primaryActionLabel="addAccount"
        onPrimaryAction={vi.fn()}
      />,
    )

    const quickCheckinButton = await screen.findByRole("button", {
      name: "ui:navigation.autoCheckinRunNow",
    })

    fireEvent.click(quickCheckinButton)

    expect(openAutoCheckinPageSpy).toHaveBeenCalledWith({ runNow: "true" })
    expectPopupAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunPopupQuickCheckin,
    })
  })

  it("tracks popup navigation shortcuts from the action bar", async () => {
    vi.resetModules()
    const navigation = await import("~/utils/navigation")
    vi.spyOn(navigation, "openKeysPage").mockImplementation(vi.fn() as any)
    vi.spyOn(navigation, "openModelsPage").mockImplementation(vi.fn() as any)

    const { default: ActionButtons } = await import(
      "~/entrypoints/popup/components/ActionButtons"
    )
    render(
      <ActionButtons
        primaryActionLabel="addAccount"
        onPrimaryAction={vi.fn()}
      />,
    )

    fireEvent.click(
      await screen.findByRole("button", { name: "ui:navigation.keys" }),
    )
    expectPopupAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenPopupKeyManagement,
    })

    fireEvent.click(
      await screen.findByRole("button", { name: "ui:navigation.models" }),
    )
    expectPopupAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenPopupModelManagement,
    })
  })

  it("hides external check-in button when no custom check-in URLs exist", async () => {
    const { default: ActionButtons } = await import(
      "~/entrypoints/popup/components/ActionButtons"
    )
    render(
      <ActionButtons
        primaryActionLabel="addAccount"
        onPrimaryAction={vi.fn()}
      />,
    )

    expect(
      screen.queryByRole("button", {
        name: "ui:navigation.externalCheckinAll",
      }),
    ).toBeNull()
  })

  it("opens external check-ins with default unchecked-only mode", async () => {
    displayDataMock = [
      {
        id: "a1",
        checkIn: { customCheckIn: { url: "https://checkin.a1" } },
      },
    ]
    const { default: ActionButtons } = await import(
      "~/entrypoints/popup/components/ActionButtons"
    )
    render(
      <ActionButtons
        primaryActionLabel="addAccount"
        onPrimaryAction={vi.fn()}
      />,
    )

    const externalButton = await screen.findByRole("button", {
      name: "ui:navigation.externalCheckinAll",
    })

    fireEvent.click(externalButton)

    expect(handleOpenExternalCheckInsMock).toHaveBeenCalledWith(
      displayDataMock,
      {
        openAll: false,
        openInNewWindow: false,
        analyticsContext: {
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenPopupExternalCheckIns,
          surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.PopupActionBar,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
        },
      },
    )
    expect(trackProductAnalyticsActionStartedMock).not.toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenPopupExternalCheckIns,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.PopupActionBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
    })
  })

  it("opens all external check-ins on ctrl/cmd click", async () => {
    displayDataMock = [
      {
        id: "a1",
        checkIn: { customCheckIn: { url: "https://checkin.a1" } },
      },
      {
        id: "a2",
        checkIn: { customCheckIn: { url: "https://checkin.a2" } },
      },
    ]
    const { default: ActionButtons } = await import(
      "~/entrypoints/popup/components/ActionButtons"
    )
    render(
      <ActionButtons
        primaryActionLabel="addAccount"
        onPrimaryAction={vi.fn()}
      />,
    )

    const externalButton = await screen.findByRole("button", {
      name: "ui:navigation.externalCheckinAll",
    })

    fireEvent.click(externalButton, { ctrlKey: true })

    expect(handleOpenExternalCheckInsMock).toHaveBeenCalledWith(
      displayDataMock,
      {
        openAll: true,
        openInNewWindow: false,
        analyticsContext: {
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenPopupExternalCheckIns,
          surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.PopupActionBar,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
        },
      },
    )
  })

  it("opens external check-ins in a new window on shift click", async () => {
    displayDataMock = [
      {
        id: "a1",
        checkIn: { customCheckIn: { url: "https://checkin.a1" } },
      },
    ]
    const { default: ActionButtons } = await import(
      "~/entrypoints/popup/components/ActionButtons"
    )
    render(
      <ActionButtons
        primaryActionLabel="addAccount"
        onPrimaryAction={vi.fn()}
      />,
    )

    const externalButton = await screen.findByRole("button", {
      name: "ui:navigation.externalCheckinAll",
    })

    fireEvent.click(externalButton, { shiftKey: true })

    expect(handleOpenExternalCheckInsMock).toHaveBeenCalledWith(
      displayDataMock,
      {
        openAll: false,
        openInNewWindow: true,
        analyticsContext: {
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenPopupExternalCheckIns,
          surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.PopupActionBar,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
        },
      },
    )
  })

  it("supports ctrl/cmd + shift together for external check-ins", async () => {
    displayDataMock = [
      {
        id: "a1",
        checkIn: { customCheckIn: { url: "https://checkin.a1" } },
      },
      {
        id: "a2",
        checkIn: { customCheckIn: { url: "https://checkin.a2" } },
      },
    ]
    const { default: ActionButtons } = await import(
      "~/entrypoints/popup/components/ActionButtons"
    )
    render(
      <ActionButtons
        primaryActionLabel="addAccount"
        onPrimaryAction={vi.fn()}
      />,
    )

    const externalButton = await screen.findByRole("button", {
      name: "ui:navigation.externalCheckinAll",
    })

    fireEvent.click(externalButton, { ctrlKey: true, shiftKey: true })

    expect(handleOpenExternalCheckInsMock).toHaveBeenCalledWith(
      displayDataMock,
      {
        openAll: true,
        openInNewWindow: true,
        analyticsContext: {
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenPopupExternalCheckIns,
          surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.PopupActionBar,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
        },
      },
    )
  })
})

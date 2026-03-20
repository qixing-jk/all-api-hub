import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import BasicSettings from "~/features/BasicSettings/BasicSettings"
import { render, screen } from "~~/tests/test-utils/render"

const { mockedUseUserPreferencesContext } = vi.hoisted(() => ({
  mockedUseUserPreferencesContext: vi.fn(),
}))

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    (await importOriginal()) as typeof import("~/contexts/UserPreferencesContext")

  return {
    ...actual,
    UserPreferencesProvider: ({ children }: { children: ReactNode }) =>
      children,
    useUserPreferencesContext: () => mockedUseUserPreferencesContext(),
  }
})

vi.mock("~/components/PageHeader", () => ({
  PageHeader: ({
    title,
    description,
  }: {
    title: string
    description: string
  }) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  ),
}))

vi.mock("~/hooks/useHorizontalScrollControls", () => ({
  useHorizontalScrollControls: () => ({
    scrollRef: { current: null },
    canScrollLeft: false,
    canScrollRight: false,
    scrollLeft: vi.fn(),
    scrollRight: vi.fn(),
    scrollChildIntoCenter: vi.fn(),
  }),
}))

vi.mock("~/features/BasicSettings/components/shared/LoadingSkeleton", () => ({
  default: () => <div data-testid="loading-skeleton" />,
}))

vi.mock(
  "~/features/BasicSettings/components/dialogs/PermissionOnboardingDialog",
  () => ({
    PermissionOnboardingDialog: () => (
      <div data-testid="permission-onboarding" />
    ),
  }),
)

vi.mock("~/features/BasicSettings/components/tabs/General/GeneralTab", () => ({
  default: () => <div data-testid="general-tab-content" />,
}))

vi.mock(
  "~/features/BasicSettings/components/tabs/AccountManagement/AccountManagementTab",
  () => ({
    default: () => <div data-testid="account-management-tab-content" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/Refresh/AutoRefreshTab",
  () => ({
    default: () => <div data-testid="refresh-tab-content" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/CheckinRedeem/CheckinRedeemTab",
  () => ({
    default: () => <div data-testid="checkin-redeem-tab-content" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/BalanceHistory/BalanceHistoryTab",
  () => ({
    default: () => <div data-testid="balance-history-tab-content" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/UsageHistorySync/UsageHistorySyncTab",
  () => ({
    default: () => <div data-testid="account-usage-tab-content" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/WebAiApiCheck/WebAiApiCheckTab",
  () => ({
    default: () => <div data-testid="web-ai-api-check-tab-content" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/ManagedSite/ManagedSiteTab",
  () => ({
    default: () => <div data-testid="managed-site-tab-content" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/CliProxy/CliProxyTab",
  () => ({
    default: () => <div data-testid="cli-proxy-tab-content" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/ClaudeCodeRouter/ClaudeCodeRouterTab",
  () => ({
    default: () => <div data-testid="claude-code-router-tab-content" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/Permissions/PermissionsTab",
  () => ({
    default: () => <div data-testid="permissions-tab-content" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/DataBackup/DataBackupTab",
  () => ({
    default: () => <div data-testid="data-backup-tab-content" />,
  }),
)

describe("BasicSettings tab mounting", () => {
  beforeEach(() => {
    mockedUseUserPreferencesContext.mockReset()
    mockedUseUserPreferencesContext.mockReturnValue({
      isLoading: false,
    })
    window.history.replaceState(null, "", "/")
  })

  it("mounts only the active tab until a tab is visited", async () => {
    const user = userEvent.setup()

    render(<BasicSettings />)

    expect(screen.getByTestId("general-tab-content")).toBeInTheDocument()
    expect(
      screen.queryByTestId("managed-site-tab-content"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId("data-backup-tab-content"),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("tab", { name: "settings:tabs.managedSite" }),
    )

    expect(
      await screen.findByTestId("managed-site-tab-content"),
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId("data-backup-tab-content"),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole("tab", { name: "settings:tabs.general" }))

    expect(screen.getByTestId("general-tab-content")).toBeInTheDocument()
    expect(screen.getByTestId("managed-site-tab-content")).toBeInTheDocument()
    expect(
      screen.queryByTestId("data-backup-tab-content"),
    ).not.toBeInTheDocument()
  })
})

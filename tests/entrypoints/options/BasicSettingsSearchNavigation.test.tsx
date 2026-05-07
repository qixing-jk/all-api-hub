import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import BasicSettings from "~/features/BasicSettings/BasicSettings"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

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
  PageHeader: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock("~/features/BasicSettings/components/shared/LoadingSkeleton", () => ({
  default: () => <div data-testid="loading-skeleton" />,
}))

vi.mock(
  "~/features/BasicSettings/components/dialogs/PermissionOnboardingDialog",
  () => ({
    PermissionOnboardingDialog: () => null,
  }),
)

vi.mock("~/features/BasicSettings/components/tabs/General/GeneralTab", () => ({
  default: () => <div id="display-currency-unit">general content</div>,
}))

vi.mock(
  "~/features/BasicSettings/components/tabs/AccountManagement/AccountManagementTab",
  () => ({
    default: () => <div>account management</div>,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/Refresh/AutoRefreshTab",
  () => ({
    default: () => <div>refresh</div>,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/CheckinRedeem/CheckinRedeemTab",
  () => ({
    default: () => <div>checkin</div>,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/BalanceHistory/BalanceHistoryTab",
  () => ({
    default: () => <div>history</div>,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/UsageHistorySync/UsageHistorySyncTab",
  () => ({
    default: () => <div>usage</div>,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/WebAiApiCheck/WebAiApiCheckTab",
  () => ({
    default: () => <div>api check</div>,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/ManagedSite/ManagedSiteTab",
  () => ({
    default: () => <div>managed site</div>,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/CliProxy/CliProxyTab",
  () => ({
    default: () => <div>cli proxy</div>,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/ClaudeCodeRouter/ClaudeCodeRouterTab",
  () => ({
    default: () => <div>router</div>,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/Permissions/PermissionsTab",
  () => ({
    default: () => <div>permissions</div>,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/DataBackup/DataBackupTab",
  () => ({
    default: () => <div>backup</div>,
  }),
)

describe("BasicSettings search navigation", () => {
  beforeEach(() => {
    mockedUseUserPreferencesContext.mockReset()
    mockedUseUserPreferencesContext.mockReturnValue({
      isLoading: false,
    })
    window.history.replaceState(
      null,
      "",
      "/options.html?tab=general&anchor=display-currency-unit&highlight=display-currency-unit#basic",
    )
  })

  it("consumes the one-shot highlight param after scrolling to the target", async () => {
    render(<BasicSettings />, { withReleaseUpdateStatusProvider: false })

    await waitFor(() => {
      expect(window.location.search).not.toContain("highlight=")
    })

    expect(screen.getByText("general content")).toBeInTheDocument()
  })

  it("clears the highlight param when the target element is missing", async () => {
    window.history.replaceState(
      null,
      "",
      "/options.html?tab=general&anchor=display-currency-unit&highlight=missing-target#basic",
    )

    render(<BasicSettings />, { withReleaseUpdateStatusProvider: false })

    await waitFor(() => {
      expect(window.location.search).not.toContain("highlight=")
    })

    expect(screen.getByText("general content")).toBeInTheDocument()
  })
})

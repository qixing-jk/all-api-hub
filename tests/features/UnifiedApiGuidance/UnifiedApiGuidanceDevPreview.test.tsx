import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentPropsWithoutRef, ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { OptionsOverviewViewModel } from "~/features/OptionsOverview/types"
import {
  buildUnifiedApiGuidancePreviewScenarioTestId,
  UNIFIED_API_GUIDANCE_TEST_IDS,
} from "~/features/UnifiedApiGuidance/testIds"
import UnifiedApiGuidanceDevPreview from "~/features/UnifiedApiGuidance/UnifiedApiGuidanceDevPreview"

interface PreviewDataState {
  isLoading: boolean
  error: string | null
  reload: () => void
  viewModel: Pick<
    OptionsOverviewViewModel,
    "unifiedApiGuidance" | "unifiedApiGuidanceDiagnostics"
  > | null
}

const { optionsOverviewDataState } = vi.hoisted(() => ({
  optionsOverviewDataState: {
    isLoading: false,
    error: null as string | null,
    reload: vi.fn(),
    viewModel: {
      unifiedApiGuidance: {
        status: "ready_to_import",
        sourceKind: "profile",
        modelSyncSupported: true,
        steps: [
          { id: "source", state: "completed" },
          { id: "gateway_settings", state: "completed" },
          { id: "gateway_channel", state: "current" },
          { id: "client_access", state: "upcoming" },
        ],
        primaryAction: {
          kind: "open_api_credential_profiles",
          target: { menuItemId: "apiCredentialProfiles" },
        },
        secondaryActions: [],
        optionalActions: [],
      },
      unifiedApiGuidanceDiagnostics: {
        enabledAccountCount: 0,
        keyAccessibleAccountCount: 0,
        profileCount: 2,
        gatewayConfigured: true,
      },
    },
  } as PreviewDataState,
}))

const getCurrentStateQueries = () =>
  within(screen.getByTestId(UNIFIED_API_GUIDANCE_TEST_IDS.currentPreviewState))

const getScenarioQueries = (scenarioId: string) =>
  within(
    screen.getByTestId(
      buildUnifiedApiGuidancePreviewScenarioTestId(scenarioId),
    ),
  )

const readyViewModel = optionsOverviewDataState.viewModel

vi.mock("~/features/OptionsOverview/useOptionsOverviewData", () => ({
  useOptionsOverviewData: () => optionsOverviewDataState,
}))

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  }
})

vi.mock("~/components/PageHeader", () => ({
  PageHeader: ({
    title,
    description,
  }: {
    title: ReactNode
    description?: ReactNode
  }) => (
    <header>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </header>
  ),
}))

vi.mock("~/components/ui", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Button: ({
    children,
    rightIcon: _rightIcon,
    ...props
  }: ComponentPropsWithoutRef<"button"> & { rightIcon?: ReactNode }) => (
    <button {...props}>{children}</button>
  ),
  Card: ({ children, ...props }: ComponentPropsWithoutRef<"section">) => (
    <section {...props}>{children}</section>
  ),
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}))

describe("UnifiedApiGuidanceDevPreview", () => {
  beforeEach(() => {
    optionsOverviewDataState.isLoading = false
    optionsOverviewDataState.error = null
    optionsOverviewDataState.viewModel = readyViewModel
  })

  it("labels the current user guidance state before fixture scenarios", () => {
    render(<UnifiedApiGuidanceDevPreview />)

    const currentQueries = getCurrentStateQueries()

    expect(currentQueries.getByText("ready_to_import")).toBeInTheDocument()
    expect(currentQueries.getByText("profile")).toBeInTheDocument()
    expect(currentQueries.getByText("profileCount: 2")).toBeInTheDocument()
    expect(
      currentQueries.getByText("gatewayConfigured: true"),
    ).toBeInTheDocument()
    expect(
      currentQueries.getByText(
        "primary: open_api_credential_profiles -> apiCredentialProfiles",
      ),
    ).toBeInTheDocument()
    expect(
      currentQueries.getByText(
        "Matched fixture: Gateway configured with API credentials",
      ),
    ).toBeInTheDocument()
  })

  it("navigates from the current user state to the matched fixture", async () => {
    const scrollIntoView = vi.fn()
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView
    render(<UnifiedApiGuidanceDevPreview />)

    await userEvent.click(
      screen.getByRole("button", {
        name: "Jump to matched fixture",
      }),
    )

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    })
  })

  it("shows the importable-source gap with reason, inputs, and CTA targets", async () => {
    render(<UnifiedApiGuidanceDevPreview />)

    expect(
      screen.getByRole("heading", { name: "Unified API guidance preview" }),
    ).toBeInTheDocument()
    const scenarioQueries = getScenarioQueries("needs-importable-source")

    expect(
      scenarioQueries.getByText("needs_importable_source"),
    ).toBeInTheDocument()
    expect(
      scenarioQueries.getByText(
        "Accounts exist, but none has a key-management capability that can expose an importable key.",
      ),
    ).toBeInTheDocument()
    expect(
      scenarioQueries.getByText("enabledAccountCount: 1"),
    ).toBeInTheDocument()
    expect(
      scenarioQueries.getByText("keyAccessibleAccountCount: 0"),
    ).toBeInTheDocument()
    expect(scenarioQueries.getByText("profileCount: 0")).toBeInTheDocument()
    expect(
      scenarioQueries.getByText(
        "primary: add_api_credential -> apiCredentialProfiles",
      ),
    ).toBeInTheDocument()
    expect(
      scenarioQueries.getByRole("heading", {
        name: "API credential surface",
      }),
    ).toBeInTheDocument()
    expect(
      scenarioQueries.getByRole("button", {
        name: "apiCredentialProfiles:unifiedApiGuidance.actions.addApiCredential",
      }),
    ).toBeInTheDocument()

    await userEvent.click(
      scenarioQueries.getByRole("button", {
        name: "apiCredentialProfiles:unifiedApiGuidance.actions.addApiCredential",
      }),
    )
    expect(
      screen.getByText(
        "needs-importable-source:apiCredentialProfiles:add_api_credential -> apiCredentialProfiles",
      ),
    ).toBeInTheDocument()
  })

  it("shows the API credential guidance setup transition", async () => {
    render(<UnifiedApiGuidanceDevPreview />)

    const scenarioQueries = getScenarioQueries("profile-needs-managed-site")

    expect(
      scenarioQueries.getByText(
        "apiCredentialProfiles:unifiedApiGuidance.description.needs_managed_site",
      ),
    ).toBeInTheDocument()
    expect(
      scenarioQueries.getByRole("button", {
        name: "apiCredentialProfiles:unifiedApiGuidance.actions.configureManagedSite",
      }),
    ).toBeInTheDocument()

    await userEvent.click(
      scenarioQueries.getByRole("button", {
        name: "apiCredentialProfiles:unifiedApiGuidance.actions.configureManagedSite",
      }),
    )
    expect(
      screen.getByText(
        /profile-needs-managed-site:apiCredentialProfiles:configure_managed_site/,
      ),
    ).toBeInTheDocument()
  })

  it("records the ready API credential next-step action", async () => {
    render(<UnifiedApiGuidanceDevPreview />)

    const scenarioQueries = getScenarioQueries("ready-profile")
    await userEvent.click(
      scenarioQueries.getByRole("button", {
        name: "apiCredentialProfiles:unifiedApiGuidance.actions.addFirstChannel",
      }),
    )

    expect(
      screen.getByText(
        "ready-profile:apiCredentialProfiles:manage_channels -> managedSiteChannels",
      ),
    ).toBeInTheDocument()

    await userEvent.click(
      scenarioQueries.getByRole("button", {
        name: "apiCredentialProfiles:unifiedApiGuidance.dismissForSession",
      }),
    )
    await userEvent.click(
      scenarioQueries.getByRole("button", {
        name: "apiCredentialProfiles:unifiedApiGuidance.permanentlyDismiss",
      }),
    )
    expect(
      scenarioQueries.getByRole("heading", {
        name: "Gateway configured with API credentials",
      }),
    ).toBeInTheDocument()
  })

  it("shows the completed gateway-channel transition without claiming client setup is complete", () => {
    render(<UnifiedApiGuidanceDevPreview />)

    const scenarioQueries = getScenarioQueries("has-gateway-channels")

    expect(
      scenarioQueries.getAllByText("has_gateway_channels").length,
    ).toBeGreaterThan(0)
    expect(
      scenarioQueries.getByText(
        "primary: manage_channels -> managedSiteChannels",
      ),
    ).toBeInTheDocument()
    expect(
      scenarioQueries.getAllByText(
        "optionsOverview:unifiedApiGuidance.stepper.states.current",
      ).length,
    ).toBeGreaterThan(0)
  })

  it("shows a neutral unavailable state when current guidance cannot be computed", () => {
    optionsOverviewDataState.viewModel = null

    render(<UnifiedApiGuidanceDevPreview />)

    expect(
      getCurrentStateQueries().getByText(
        "Current guidance is unavailable. Reload the page to try again.",
      ),
    ).toBeInTheDocument()
  })

  it("shows the live loading state without claiming guidance is unavailable", () => {
    optionsOverviewDataState.isLoading = true
    optionsOverviewDataState.viewModel = null

    render(<UnifiedApiGuidanceDevPreview />)

    const currentState = getCurrentStateQueries()
    expect(
      currentState.getByText("Loading current guidance state..."),
    ).toBeInTheDocument()
    expect(
      currentState.queryByText(
        "Current guidance is unavailable. Reload the page to try again.",
      ),
    ).not.toBeInTheDocument()
  })

  it("shows the live load error without claiming guidance is unavailable", () => {
    optionsOverviewDataState.error = "Profile storage unavailable"
    optionsOverviewDataState.viewModel = null

    render(<UnifiedApiGuidanceDevPreview />)

    const currentState = getCurrentStateQueries()
    expect(
      currentState.getByText(
        "Failed to load current guidance state: Profile storage unavailable",
      ),
    ).toBeInTheDocument()
    expect(
      currentState.queryByText(
        "Current guidance is unavailable. Reload the page to try again.",
      ),
    ).not.toBeInTheDocument()
  })

  it("labels the closest fixture when the live state has no exact fixture", () => {
    optionsOverviewDataState.viewModel = {
      ...readyViewModel!,
      unifiedApiGuidance: {
        ...readyViewModel!.unifiedApiGuidance!,
        status: "has_gateway_channels",
        sourceKind: "both",
        primaryAction: {
          kind: "manage_channels",
          target: { menuItemId: "managedSiteChannels" },
        },
      },
    }

    render(<UnifiedApiGuidanceDevPreview />)

    expect(
      getCurrentStateQueries().getByText(
        "Closest fixture: Gateway channel onboarding completed",
      ),
    ).toBeInTheDocument()
  })

  it.each([
    [
      "needs_sources",
      "Current data has no import source yet: add an account or API credential first.",
    ],
    [
      "needs_importable_source",
      "Current accounts exist, but none can expose a key that can be imported into the gateway.",
    ],
    [
      "needs_managed_site",
      "Current sources can provide keys, but the self-hosted gateway settings are incomplete.",
    ],
  ] as const)("explains the live %s state", (status, reason) => {
    optionsOverviewDataState.viewModel = {
      ...readyViewModel!,
      unifiedApiGuidance: {
        ...readyViewModel!.unifiedApiGuidance!,
        status,
      },
    }

    render(<UnifiedApiGuidanceDevPreview />)

    expect(getCurrentStateQueries().getByText(reason)).toBeInTheDocument()
  })

  it("records fixture actions with their scenario, surface, and target", async () => {
    render(<UnifiedApiGuidanceDevPreview />)

    const scenarioQueries = getScenarioQueries("needs-sources")
    await userEvent.click(
      scenarioQueries.getByRole("button", {
        name: "optionsOverview:unifiedApiGuidance.actions.addAccount",
      }),
    )

    expect(
      screen.getByText(
        "needs-sources:optionsOverview:add_account -> account?action=add",
      ),
    ).toBeInTheDocument()
  })
})

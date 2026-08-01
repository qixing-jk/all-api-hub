import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  buildUnifiedApiGuidanceModel,
  UNIFIED_API_GUIDANCE_ACTION_KINDS,
  UNIFIED_API_GUIDANCE_SURFACES,
  UNIFIED_API_GUIDANCE_TEST_IDS,
  UnifiedApiGuidanceCard,
  UnifiedApiGuidanceUnavailableCard,
  type UnifiedApiGuidanceAction,
  type UnifiedApiGuidanceSurface,
} from "~/features/UnifiedApiGuidance"
import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import { render, screen } from "~~/tests/test-utils/render"

const basePreferences: UserPreferences = {
  ...DEFAULT_PREFERENCES,
  lastUpdated: 1,
}

const configuredNewApiPreferences: UserPreferences = {
  ...basePreferences,
  newApi: {
    ...basePreferences.newApi,
    baseUrl: "https://managed.example.invalid",
    adminToken: "redacted-admin-token",
    userId: "1",
  },
}

describe("UnifiedApiGuidanceCard", () => {
  it("renders guidance notes and dispatches the primary action", async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    const model = buildUnifiedApiGuidanceModel({
      enabledAccountCount: 1,
      keyAccessibleAccountCount: 1,
      profileCount: 1,
      preferences: configuredNewApiPreferences,
      managedSiteType: SITE_TYPES.NEW_API,
    })

    renderCard(model, onAction)

    expect(
      screen.getByText("optionsOverview:unifiedApiGuidance.headline"),
    ).toBeVisible()
    expect(
      screen.getByRole("list", {
        name: "optionsOverview:unifiedApiGuidance.stepper.label",
      }),
    ).toBeVisible()
    expect(screen.getAllByRole("listitem")).toHaveLength(4)
    expect(
      screen.getByText(
        "optionsOverview:unifiedApiGuidance.stepper.steps.gatewayChannel.title",
      ),
    ).toHaveAttribute("aria-current", "step")
    expect(
      screen.getAllByText(
        "optionsOverview:unifiedApiGuidance.stepper.states.completed",
      ),
    ).toHaveLength(2)
    expect(
      screen.getByText(
        "optionsOverview:unifiedApiGuidance.stepper.states.current",
      ),
    ).toBeVisible()
    expect(
      screen.getByText(
        "optionsOverview:unifiedApiGuidance.stepper.states.upcoming",
      ),
    ).toBeVisible()
    expect(
      screen.getByTestId(UNIFIED_API_GUIDANCE_TEST_IDS.primaryAction),
    ).toHaveAccessibleName(
      "optionsOverview:unifiedApiGuidance.actions.addGatewayChannel",
    )

    await user.click(
      screen.getByRole("button", {
        name: "optionsOverview:unifiedApiGuidance.actions.addGatewayChannel",
      }),
    )

    expect(onAction).toHaveBeenCalledWith(model.primaryAction)
    expect(model.primaryAction.kind).toBe(
      UNIFIED_API_GUIDANCE_ACTION_KINDS.AddGatewayChannel,
    )
  })

  it("omits model-sync copy when no optional action is available", () => {
    const model = buildUnifiedApiGuidanceModel({
      enabledAccountCount: 0,
      keyAccessibleAccountCount: 0,
      profileCount: 0,
      preferences: basePreferences,
      managedSiteType: SITE_TYPES.NEW_API,
    })

    renderCard(model)

    expect(
      screen.queryByText(
        "optionsOverview:unifiedApiGuidance.modelSyncOptional",
      ),
    ).not.toBeInTheDocument()
  })

  it("uses the requested surface for reusable guidance copy", () => {
    const model = buildUnifiedApiGuidanceModel({
      enabledAccountCount: 1,
      keyAccessibleAccountCount: 1,
      profileCount: 1,
      preferences: configuredNewApiPreferences,
      managedSiteType: SITE_TYPES.NEW_API,
    })

    renderCard(model, vi.fn(), UNIFIED_API_GUIDANCE_SURFACES.Account)

    expect(
      screen.getByText("account:unifiedApiGuidance.headline"),
    ).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: "account:unifiedApiGuidance.actions.addGatewayChannel",
      }),
    ).toBeVisible()
    expect(
      screen.queryByText("optionsOverview:unifiedApiGuidance.headline"),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole("list")).not.toBeInTheDocument()
    expect(
      screen.getByText("account:unifiedApiGuidance.boundaryNote"),
    ).toBeVisible()
  })

  it("keeps retry focus while marking an in-progress setup check busy", async () => {
    const onRetry = vi.fn()
    const { rerender } = render(
      <UnifiedApiGuidanceUnavailableCard
        isRetrying={false}
        onRetry={onRetry}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )
    const retryButton = screen.getByRole("button", {
      name: "optionsOverview:unifiedApiGuidance.unavailable.retry",
    })
    retryButton.focus()

    rerender(<UnifiedApiGuidanceUnavailableCard isRetrying onRetry={onRetry} />)

    expect(retryButton).toHaveFocus()
    expect(retryButton).toHaveAttribute("aria-busy", "true")
    expect(retryButton).toHaveAttribute("aria-disabled", "true")
    expect(retryButton).not.toBeDisabled()
  })
})

function renderCard(
  model: ReturnType<typeof buildUnifiedApiGuidanceModel>,
  onAction: (action: UnifiedApiGuidanceAction) => void = vi.fn(),
  surface: UnifiedApiGuidanceSurface = UNIFIED_API_GUIDANCE_SURFACES.OptionsOverview,
) {
  return render(
    <UnifiedApiGuidanceCard
      model={model}
      surface={surface}
      onAction={onAction}
    />,
    {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    },
  )
}

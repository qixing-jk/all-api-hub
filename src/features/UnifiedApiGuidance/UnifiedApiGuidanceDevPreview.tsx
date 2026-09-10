import { useMemo, useState } from "react"

import { DEV_OPTIONS_MENU_ITEM_ICONS } from "~/components/icons/optionsPageIcons"
import { PageHeader } from "~/components/PageHeader"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui"
import { DEV_MENU_ITEM_IDS } from "~/constants/devOptionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import {
  ApiCredentialGatewayGuidance,
  buildApiCredentialGatewayGuidanceModel,
} from "~/features/ApiCredentialProfiles/ApiCredentialProfiles"
import type { OptionsOverviewUnifiedApiGuidanceDiagnostics } from "~/features/OptionsOverview/types"
import { useOptionsOverviewData } from "~/features/OptionsOverview/useOptionsOverviewData"
import {
  createEmptyFeatureGuidanceState,
  type FeatureGuidanceState,
} from "~/services/featureGuidance/featureGuidanceState"
import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import { assertNever } from "~/utils/core/assert"

import {
  UNIFIED_API_GUIDANCE_SURFACES,
  type UnifiedApiGuidanceSurface,
} from "./i18n"
import {
  buildUnifiedApiGuidanceModel,
  type UnifiedApiGuidanceAction,
  type UnifiedApiGuidanceModel,
} from "./model"
import {
  buildUnifiedApiGuidancePreviewScenarioTestId,
  UNIFIED_API_GUIDANCE_TEST_IDS,
} from "./testIds"
import { UnifiedApiGuidanceCard } from "./UnifiedApiGuidanceCard"

interface GuidancePreviewScenario {
  id: string
  label: string
  reason: string
  input: GuidancePreviewScenarioInput
}

interface GuidancePreviewScenarioInput
  extends OptionsOverviewUnifiedApiGuidanceDiagnostics {
  preferences: UserPreferences
  guidanceState: FeatureGuidanceState
}

interface PreviewScenarioModel {
  scenario: GuidancePreviewScenario
  model: UnifiedApiGuidanceModel
}

type GuidancePreviewSurface =
  | UnifiedApiGuidanceSurface
  | "apiCredentialProfiles"

interface MatchedPreviewScenario {
  scenario: GuidancePreviewScenario
  exact: boolean
}

const configuredGatewayPreferences: UserPreferences = {
  ...DEFAULT_PREFERENCES,
  lastUpdated: 1,
  newApi: {
    ...DEFAULT_PREFERENCES.newApi,
    baseUrl: "https://managed.example.invalid",
    adminToken: "redacted-admin-token",
    userId: "1",
  },
}

const baseGuidanceState = createEmptyFeatureGuidanceState()

const completedGatewayGuidanceState: FeatureGuidanceState = {
  ...createEmptyFeatureGuidanceState(),
  gatewayGuidance: {
    dismissedAtBySurface: {},
    onboardingCompletedAt: 1,
  },
}

const basePreferences: UserPreferences = {
  ...DEFAULT_PREFERENCES,
  lastUpdated: 1,
}

const previewScenarios: GuidancePreviewScenario[] = [
  {
    id: "needs-sources",
    label: "No source inventory",
    reason: "No accounts or saved API credentials exist yet.",
    input: {
      enabledAccountCount: 0,
      keyAccessibleAccountCount: 0,
      profileCount: 0,
      gatewayConfigured: false,
      preferences: basePreferences,
      guidanceState: baseGuidanceState,
    },
  },
  {
    id: "needs-importable-source",
    label: "Account exists without key-management capability",
    reason:
      "Accounts exist, but none has a key-management capability that can expose an importable key.",
    input: {
      enabledAccountCount: 1,
      keyAccessibleAccountCount: 0,
      profileCount: 0,
      gatewayConfigured: true,
      preferences: configuredGatewayPreferences,
      guidanceState: baseGuidanceState,
    },
  },
  {
    id: "profile-needs-managed-site",
    label: "API credential exists before gateway setup",
    reason:
      "Saved API credentials exist, but the self-hosted gateway settings are missing.",
    input: {
      enabledAccountCount: 0,
      keyAccessibleAccountCount: 0,
      profileCount: 1,
      gatewayConfigured: false,
      preferences: basePreferences,
      guidanceState: baseGuidanceState,
    },
  },
  {
    id: "needs-managed-site",
    label: "Source exists before gateway setup",
    reason:
      "At least one source can expose a key, but gateway admin settings are missing.",
    input: {
      enabledAccountCount: 1,
      keyAccessibleAccountCount: 1,
      profileCount: 0,
      gatewayConfigured: false,
      preferences: basePreferences,
      guidanceState: baseGuidanceState,
    },
  },
  {
    id: "ready-account",
    label: "Gateway configured with account keys",
    reason:
      "Gateway settings are saved and an account can expose an importable key.",
    input: {
      enabledAccountCount: 1,
      keyAccessibleAccountCount: 1,
      profileCount: 0,
      gatewayConfigured: true,
      preferences: configuredGatewayPreferences,
      guidanceState: baseGuidanceState,
    },
  },
  {
    id: "ready-profile",
    label: "Gateway configured with API credentials",
    reason:
      "Gateway settings are saved and API credentials are available for import.",
    input: {
      enabledAccountCount: 0,
      keyAccessibleAccountCount: 0,
      profileCount: 1,
      gatewayConfigured: true,
      preferences: configuredGatewayPreferences,
      guidanceState: baseGuidanceState,
    },
  },
  {
    id: "has-gateway-channels",
    label: "Gateway channel onboarding completed",
    reason:
      "A gateway channel was created or imported before; current channel health and client access still need confirmation.",
    input: {
      enabledAccountCount: 1,
      keyAccessibleAccountCount: 1,
      profileCount: 0,
      gatewayConfigured: true,
      preferences: configuredGatewayPreferences,
      guidanceState: completedGatewayGuidanceState,
    },
  },
]

const buildScenarioModel = (
  scenario: GuidancePreviewScenario,
): PreviewScenarioModel => {
  const modelInput = {
    ...scenario.input,
    managedSiteType: SITE_TYPES.NEW_API,
  }

  return {
    scenario,
    model: buildUnifiedApiGuidanceModel(modelInput),
  }
}

const buildApiCredentialScenarioModel = (scenario: GuidancePreviewScenario) =>
  buildApiCredentialGatewayGuidanceModel(
    scenario.input.profileCount,
    scenario.input.preferences,
    scenario.input.guidanceState,
    SITE_TYPES.NEW_API,
  )

const formatTarget = (action: UnifiedApiGuidanceAction) => {
  const params = action.target.params
  const paramText =
    params && Object.keys(params).length > 0
      ? `?${new URLSearchParams(
          Object.entries(params).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        ).toString()}`
      : ""

  return `${action.kind} -> ${action.target.menuItemId}${paramText}`
}

const formatActionList = (actions: readonly UnifiedApiGuidanceAction[]) =>
  actions.length > 0 ? actions.map(formatTarget).join(", ") : "none"

const PAGE_ICON =
  DEV_OPTIONS_MENU_ITEM_ICONS[DEV_MENU_ITEM_IDS.UNIFIED_API_GUIDANCE_PREVIEW]

const buildScenarioElementId = (scenarioId: string) =>
  `unified-api-guidance-preview-${scenarioId}`

const findMatchedScenario = (
  model: UnifiedApiGuidanceModel,
  scenarioModels: readonly PreviewScenarioModel[],
): MatchedPreviewScenario | undefined => {
  const exact = scenarioModels.find(
    (scenarioModel) =>
      scenarioModel.model.status === model.status &&
      scenarioModel.model.sourceKind === model.sourceKind,
  )

  if (exact) {
    return { scenario: exact.scenario, exact: true }
  }

  const closest = scenarioModels.find(
    (scenarioModel) => scenarioModel.model.status === model.status,
  )
  return closest ? { scenario: closest.scenario, exact: false } : undefined
}

const getCurrentStateReason = (model: UnifiedApiGuidanceModel) => {
  switch (model.status) {
    case "needs_sources":
      return "Current data has no import source yet: add an account or API credential first."
    case "needs_importable_source":
      return "Current accounts exist, but none can expose a key that can be imported into the gateway."
    case "needs_managed_site":
      return "Current sources can provide keys, but the self-hosted gateway settings are incomplete."
    case "ready_to_import":
      return "Current data can be imported into the configured self-hosted gateway."
    case "has_gateway_channels":
      return "A gateway channel was created or imported before; confirm current channel health and client access in the gateway."
    default:
      return assertNever(
        model.status,
        `Unexpected guidance status: ${model.status}`,
      )
  }
}

/**
 * Dev-only page for visually inspecting unified API guidance state transitions.
 */
export default function UnifiedApiGuidanceDevPreview() {
  const { isLoading, error, viewModel } = useOptionsOverviewData()
  const scenarioModels = useMemo(
    () => previewScenarios.map(buildScenarioModel),
    [],
  )
  const matchedScenario = viewModel?.unifiedApiGuidance
    ? findMatchedScenario(viewModel.unifiedApiGuidance, scenarioModels)
    : undefined
  const [lastAction, setLastAction] = useState<string>("none")

  const handleAction = (
    surface: GuidancePreviewSurface,
    scenario: GuidancePreviewScenario,
    action: UnifiedApiGuidanceAction,
  ) => {
    setLastAction(`${scenario.id}:${surface}:${formatTarget(action)}`)
  }

  return (
    <div className="p-6">
      <PageHeader
        icon={PAGE_ICON}
        title="Unified API guidance preview"
        description="Dev-only fixture view for checking guidance status, copy, reasons, and CTA targets without changing account data."
      />

      <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200">
        <span className="font-medium">Last action:</span> {lastAction}
      </div>

      <CurrentStatePreview
        error={error}
        isLoading={isLoading}
        model={viewModel?.unifiedApiGuidance}
        diagnostics={viewModel?.unifiedApiGuidanceDiagnostics}
        matchedScenario={matchedScenario}
      />

      <div className="space-y-6">
        {scenarioModels.map(({ scenario, model }) => (
          <ScenarioPreview
            key={scenario.id}
            scenario={scenario}
            model={model}
            onAction={handleAction}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Shows the user's live guidance state before the static fixture matrix.
 */
function CurrentStatePreview({
  isLoading,
  error,
  model,
  diagnostics,
  matchedScenario,
}: {
  isLoading: boolean
  error: string | null
  model?: UnifiedApiGuidanceModel | null
  diagnostics?: OptionsOverviewUnifiedApiGuidanceDiagnostics
  matchedScenario?: MatchedPreviewScenario
}) {
  const handleJumpToMatchedScenario = () => {
    if (!matchedScenario) return

    document
      .getElementById(buildScenarioElementId(matchedScenario.scenario.id))
      ?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <Card
      className="mb-6 border-blue-200 bg-blue-50/60 dark:border-blue-900/50 dark:bg-blue-950/10"
      data-testid={UNIFIED_API_GUIDANCE_TEST_IDS.currentPreviewState}
    >
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Current user state</CardTitle>
            <CardDescription>
              Computed from the current stored accounts, saved API credentials,
              and self-hosted gateway settings.
            </CardDescription>
          </div>
          {model ? (
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{model.status}</Badge>
              <Badge variant="outline">{model.sourceKind}</Badge>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && !model ? (
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Loading current guidance state...
          </div>
        ) : null}
        {error ? (
          <div className="text-sm text-red-600 dark:text-red-300">
            Failed to load current guidance state: {error}
          </div>
        ) : null}
        {!isLoading && !error && !model ? (
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Current guidance is unavailable. Reload the page to try again.
          </div>
        ) : null}
        {model && diagnostics ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]">
            <GuidanceDiagnostics diagnostics={diagnostics} model={model} />
            <div className="space-y-3 rounded-md border border-blue-100 bg-white/80 p-3 text-sm leading-6 text-slate-700 dark:border-blue-900/40 dark:bg-white/[0.03] dark:text-slate-200">
              <div>{getCurrentStateReason(model)}</div>
              {matchedScenario ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="font-medium text-slate-900 dark:text-white">
                    {matchedScenario.exact
                      ? "Matched fixture"
                      : "Closest fixture"}
                    : {matchedScenario.scenario.label}
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleJumpToMatchedScenario}
                  >
                    Jump to matched fixture
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

/**
 * Renders one fixture state with diagnostics and surface previews.
 */
function ScenarioPreview({
  scenario,
  model,
  onAction,
}: {
  scenario: GuidancePreviewScenario
  model: UnifiedApiGuidanceModel
  onAction: (
    surface: GuidancePreviewSurface,
    scenario: GuidancePreviewScenario,
    action: UnifiedApiGuidanceAction,
  ) => void
}) {
  return (
    <div
      id={buildScenarioElementId(scenario.id)}
      data-testid={buildUnifiedApiGuidancePreviewScenarioTestId(scenario.id)}
    >
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>{scenario.label}</CardTitle>
              <CardDescription>{scenario.reason}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{model.status}</Badge>
              <Badge variant="outline">{model.sourceKind}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 xl:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]">
            <ScenarioDiagnostics scenario={scenario} model={model} />

            <div className="grid min-w-0 gap-4">
              <SurfacePreview
                title="Overview surface"
                surface={UNIFIED_API_GUIDANCE_SURFACES.OptionsOverview}
                model={model}
                scenario={scenario}
                onAction={onAction}
              />
              <SurfacePreview
                title="Account surface"
                surface={UNIFIED_API_GUIDANCE_SURFACES.Account}
                model={model}
                scenario={scenario}
                onAction={onAction}
              />
              <ApiCredentialSurfacePreview
                scenario={scenario}
                model={buildApiCredentialScenarioModel(scenario)}
                onAction={onAction}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Shows the fixture input and derived guidance model for debugging.
 */
function ScenarioDiagnostics({
  scenario,
  model,
}: {
  scenario: GuidancePreviewScenario
  model: UnifiedApiGuidanceModel
}) {
  const diagnostics = {
    enabledAccountCount: scenario.input.enabledAccountCount,
    keyAccessibleAccountCount: scenario.input.keyAccessibleAccountCount,
    profileCount: scenario.input.profileCount,
    gatewayConfigured: scenario.input.gatewayConfigured,
  }

  return <GuidanceDiagnostics diagnostics={diagnostics} model={model} />
}

/**
 * Shows the input counts and derived guidance model for debugging.
 */
function GuidanceDiagnostics({
  diagnostics,
  model,
}: {
  diagnostics: OptionsOverviewUnifiedApiGuidanceDiagnostics
  model: UnifiedApiGuidanceModel
}) {
  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3 text-sm dark:border-white/10 dark:bg-white/[0.03]">
      <div>
        <div className="mb-1 text-xs font-medium text-slate-500 uppercase">
          Input
        </div>
        <div className="space-y-1 font-mono text-xs">
          <div>enabledAccountCount: {diagnostics.enabledAccountCount}</div>
          <div>
            keyAccessibleAccountCount: {diagnostics.keyAccessibleAccountCount}
          </div>
          <div>profileCount: {diagnostics.profileCount}</div>
          <div>gatewayConfigured: {String(diagnostics.gatewayConfigured)}</div>
        </div>
      </div>

      <div>
        <div className="mb-1 text-xs font-medium text-slate-500 uppercase">
          Model
        </div>
        <div className="space-y-1 font-mono text-xs">
          <div>status: {model.status}</div>
          <div>sourceKind: {model.sourceKind}</div>
          <div>primary: {formatTarget(model.primaryAction)}</div>
          <div>secondary: {formatActionList(model.secondaryActions)}</div>
          <div>optional: {formatActionList(model.optionalActions)}</div>
          <div>
            steps:{" "}
            {model.steps.map((step) => `${step.id}:${step.state}`).join(", ")}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Renders the real guidance card for one product surface.
 */
function SurfacePreview({
  title,
  surface,
  model,
  scenario,
  onAction,
}: {
  title: string
  surface: UnifiedApiGuidanceSurface
  model: UnifiedApiGuidanceModel
  scenario: GuidancePreviewScenario
  onAction: (
    surface: GuidancePreviewSurface,
    scenario: GuidancePreviewScenario,
    action: UnifiedApiGuidanceAction,
  ) => void
}) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {title}
        </h3>
        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400">
          {scenario.id}:{surface}
        </span>
      </div>
      <UnifiedApiGuidanceCard
        model={model}
        surface={surface}
        onAction={(action) => onAction(surface, scenario, action)}
      />
    </div>
  )
}

/**
 * Renders the API credential page's dedicated gateway guidance surface.
 */
function ApiCredentialSurfacePreview({
  scenario,
  model,
  onAction,
}: {
  scenario: GuidancePreviewScenario
  model: UnifiedApiGuidanceModel
  onAction: (
    surface: GuidancePreviewSurface,
    scenario: GuidancePreviewScenario,
    action: UnifiedApiGuidanceAction,
  ) => void
}) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          API credential surface
        </h3>
        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400">
          {scenario.id}:apiCredentialProfiles
        </span>
      </div>
      <ApiCredentialGatewayGuidance
        model={model}
        onAddApiCredential={() =>
          onAction("apiCredentialProfiles", scenario, model.primaryAction)
        }
        onShowImportEntry={() =>
          onAction("apiCredentialProfiles", scenario, model.primaryAction)
        }
        onAction={(action) =>
          onAction("apiCredentialProfiles", scenario, action)
        }
        onDismissForSession={() => {
          /* Dev preview only. */
        }}
        onRequestPermanentDismiss={() => {
          /* Dev preview only. */
        }}
      />
    </div>
  )
}

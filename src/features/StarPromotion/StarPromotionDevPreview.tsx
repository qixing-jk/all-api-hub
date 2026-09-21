import { useEffect, useMemo, useState } from "react"

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
import {
  addCheckinSuccessesOnState,
  completeStarPromotionOnState,
  createDefaultStarPromotionState,
  deferThresholdPromptOnState,
  shouldShowThresholdPromptOnState,
  STAR_PROMOTION_DEFERRAL_COOLDOWN_MS,
  STAR_PROMOTION_INITIAL_ACCOUNT_THRESHOLD,
  STAR_PROMOTION_INITIAL_THRESHOLD,
  type StarPromotionState,
} from "~/services/starPromotion/contracts"
import { starPromotionState } from "~/services/starPromotion/state"

import {
  StarPromotionCardView,
  useStarPromotionCardLabels,
} from "./StarPromotionCardView"

export const STAR_PROMOTION_DEV_PREVIEW_TEST_IDS = {
  page: "star-promotion-dev-preview",
  currentState: "star-promotion-dev-preview-current-state",
  scenario: (scenarioId: string) =>
    `star-promotion-dev-preview-scenario-${scenarioId}`,
} as const

/**
 * Fixed clock for fixture scenarios so the deferral cooldown windows are
 * deterministic regardless of when the page is opened.
 */
const SCENARIO_NOW = 1_700_000_000_000
const AFTER_COOLDOWN_NOW =
  SCENARIO_NOW + STAR_PROMOTION_DEFERRAL_COOLDOWN_MS + 1

interface StarPromotionPreviewScenario {
  id: string
  label: string
  reason: string
  state: StarPromotionState
  /** Live managed-account count the gate should compare against. */
  accountCount: number
  /** Clock used when evaluating the gate. */
  now: number
}

const baseState = createDefaultStarPromotionState()

const deferredAtInitialThreshold = deferThresholdPromptOnState(
  addCheckinSuccessesOnState(baseState, STAR_PROMOTION_INITIAL_THRESHOLD),
  { now: SCENARIO_NOW, accountCount: 2 },
)

const previewScenarios: StarPromotionPreviewScenario[] = [
  {
    id: "fresh-install",
    label: "Fresh install below both thresholds",
    reason: `No check-ins recorded and fewer than ${STAR_PROMOTION_INITIAL_ACCOUNT_THRESHOLD} accounts.`,
    state: baseState,
    accountCount: STAR_PROMOTION_INITIAL_ACCOUNT_THRESHOLD - 1,
    now: SCENARIO_NOW,
  },
  {
    id: "checkin-threshold",
    label: "Check-in threshold reached",
    reason: `${STAR_PROMOTION_INITIAL_THRESHOLD} successful check-ins accrued since the baseline.`,
    state: addCheckinSuccessesOnState(
      baseState,
      STAR_PROMOTION_INITIAL_THRESHOLD,
    ),
    accountCount: 1,
    now: SCENARIO_NOW,
  },
  {
    id: "account-threshold",
    label: "Account threshold reached",
    reason: `Exactly ${STAR_PROMOTION_INITIAL_ACCOUNT_THRESHOLD} accounts on a fresh install, before any deferral has raised the bar.`,
    state: baseState,
    accountCount: STAR_PROMOTION_INITIAL_ACCOUNT_THRESHOLD,
    now: SCENARIO_NOW,
  },
  {
    id: "existing-user-backlog",
    label: "Existing user with an account backlog",
    reason:
      "A long-time user installing the feature with 30 accounts qualifies immediately: the account baseline defaults to 0.",
    state: baseState,
    accountCount: 30,
    now: SCENARIO_NOW,
  },
  {
    id: "deferred-cooldown-active",
    label: "Deferred, cooldown still active",
    reason:
      'The user chose "not now" (or closed the card). Both thresholds doubled and the account baseline reset, so the cooldown suppresses it even though accounts still exceed the old bar.',
    state: deferredAtInitialThreshold,
    accountCount: 2,
    now: SCENARIO_NOW,
  },
  {
    id: "deferred-cooldown-expired",
    label: "Deferred, cooldown expired",
    reason:
      "After the cooldown the doubled thresholds must be earned again: no new check-ins and no new accounts, so the card stays hidden.",
    state: deferredAtInitialThreshold,
    accountCount: 2,
    now: AFTER_COOLDOWN_NOW,
  },
  {
    id: "deferred-then-earned",
    label: "Deferred, then earned again",
    reason:
      "One additional account on top of the reset baseline re-qualifies at the doubled threshold, without climbing back over the old peak.",
    state: {
      ...deferredAtInitialThreshold,
      baselineAccountCount: 2,
    },
    accountCount: 2 + STAR_PROMOTION_INITIAL_ACCOUNT_THRESHOLD * 2,
    now: AFTER_COOLDOWN_NOW,
  },
  {
    id: "completed",
    label: "Completed (starred or confirmed)",
    reason:
      "Terminal state: every CTA surface stays suppressed forever, regardless of thresholds.",
    state: completeStarPromotionOnState(
      addCheckinSuccessesOnState(baseState, 500),
    ),
    accountCount: 40,
    now: AFTER_COOLDOWN_NOW,
  },
]

const PAGE_ICON =
  DEV_OPTIONS_MENU_ITEM_ICONS[DEV_MENU_ITEM_IDS.STAR_PROMOTION_PREVIEW]

/**
 * Dev-only page for visually inspecting the star promotion card states.
 *
 * The fixture matrix drives the real pure transitions and gate function, so it
 * doubles as a readable specification of when the promotion appears; its
 * actions only record what was clicked. The current-device card below reads the
 * stored promotion state, and its reset control clears it.
 */
export default function StarPromotionDevPreview() {
  const labels = useStarPromotionCardLabels()
  const [lastAction, setLastAction] = useState("none")

  const scenarioViews = useMemo(
    () =>
      previewScenarios.map((scenario) => ({
        scenario,
        visible: shouldShowThresholdPromptOnState(scenario.state, {
          now: scenario.now,
          accountCount: scenario.accountCount,
        }),
      })),
    [],
  )

  const renderCard = (scenario: StarPromotionPreviewScenario) => (
    <StarPromotionCardView
      headingId={`star-promotion-heading-${scenario.id}`}
      {...labels}
      onStar={() => setLastAction(`${scenario.id}:star`)}
      onAlreadyStarred={() => setLastAction(`${scenario.id}:already-starred`)}
      onDefer={() => setLastAction(`${scenario.id}:defer`)}
    />
  )

  return (
    <div
      className="py-density-6 px-6"
      data-testid={STAR_PROMOTION_DEV_PREVIEW_TEST_IDS.page}
    >
      <PageHeader
        icon={PAGE_ICON}
        title="Star promotion preview"
        description="Dev-only fixture view for the persistent GitHub star card. Actions are inert: they only record what was clicked and never touch stored promotion state."
      />

      <div className="border-border bg-surface-subtle text-secondary-foreground dark:border-foreground/10 dark:bg-foreground/[0.04] mb-density-4 py-density-3 rounded-md border px-4 text-sm">
        <span className="font-medium">Last action:</span> {lastAction}
      </div>

      <CurrentPromotionState />

      <div className="space-y-density-6">
        {scenarioViews.map(({ scenario, visible }) => (
          <div
            key={scenario.id}
            data-testid={STAR_PROMOTION_DEV_PREVIEW_TEST_IDS.scenario(
              scenario.id,
            )}
          >
            <Card>
              <CardHeader>
                <div className="gap-y-density-3 flex flex-col gap-x-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <CardTitle>{scenario.label}</CardTitle>
                    <CardDescription>{scenario.reason}</CardDescription>
                  </div>
                  <Badge variant={visible ? "secondary" : "outline"}>
                    {visible ? "card visible" : "card hidden"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="gap-y-density-4 grid gap-x-4 xl:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]">
                  <ScenarioDiagnostics scenario={scenario} />
                  <div className="min-w-0">
                    {visible ? (
                      renderCard(scenario)
                    ) : (
                      <div className="border-border text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center text-sm">
                        No card is rendered in this state.
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Shows the live stored promotion state and the gate result for this device.
 */
function CurrentPromotionState() {
  const [state, setState] = useState<StarPromotionState | null>(null)
  const [isDue, setIsDue] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [nextState, due] = await Promise.all([
        starPromotionState.getState(),
        starPromotionState.isThresholdPromptDue(),
      ])
      if (cancelled) return
      setState(nextState)
      setIsDue(due)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Card
      className="border-theme-200 bg-theme-50/60 dark:border-theme-900/50 dark:bg-theme-950/10 mb-density-6"
      data-testid={STAR_PROMOTION_DEV_PREVIEW_TEST_IDS.currentState}
    >
      <CardHeader>
        <CardTitle>Current device state</CardTitle>
        <CardDescription>
          Read from stored promotion state and the live managed-account count.
          This is the same evaluation the Overview card performs.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state ? (
          <div className="space-y-density-3 text-sm">
            <div className="gap-y-density-2 flex flex-wrap gap-x-2">
              <Badge variant={isDue ? "secondary" : "outline"}>
                {isDue ? "card would show" : "card would stay hidden"}
              </Badge>
              <Badge variant="secondary">status: {state.status}</Badge>
              <Badge variant="outline">
                check-ins: {state.lifetimeCheckinSuccesses} / threshold{" "}
                {state.nextThreshold}
              </Badge>
              <Badge variant="outline">
                accounts: {state.baselineAccountCount} baseline / +
                {state.nextAccountThreshold} needed
              </Badge>
            </div>
            <div className="text-muted-foreground font-mono text-xs">
              <div>
                baselineCheckinSuccesses: {state.baselineCheckinSuccesses}
              </div>
              <div>
                deferredUntil:{" "}
                {state.deferredUntil
                  ? new Date(state.deferredUntil).toISOString()
                  : "none"}
              </div>
            </div>
            <StarPromotionDevPreviewResetButton />
          </div>
        ) : (
          <div className="text-muted-foreground text-sm">
            Loading current promotion state…
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Shows the fixture inputs and derived gate inputs for debugging.
 */
function ScenarioDiagnostics({
  scenario,
}: {
  scenario: StarPromotionPreviewScenario
}) {
  const { state } = scenario

  return (
    <div className="border-border bg-card dark:border-foreground/10 dark:bg-foreground/[0.03] space-y-density-3 py-density-3 rounded-md border px-3 text-sm">
      <div>
        <div className="text-muted-foreground mb-density-1 text-xs font-medium uppercase">
          Input
        </div>
        <div className="space-y-density-1 font-mono text-xs">
          <div>accountCount: {scenario.accountCount}</div>
          <div>now: {new Date(scenario.now).toISOString()}</div>
        </div>
      </div>
      <div>
        <div className="text-muted-foreground mb-density-1 text-xs font-medium uppercase">
          State
        </div>
        <div className="space-y-density-1 font-mono text-xs">
          <div>status: {state.status}</div>
          <div>
            checkins: {state.lifetimeCheckinSuccesses} -{" "}
            {state.baselineCheckinSuccesses} &gt;= {state.nextThreshold}
          </div>
          <div>
            accounts: {scenario.accountCount} - {state.baselineAccountCount}{" "}
            &gt;= {state.nextAccountThreshold}
          </div>
          <div>deferredUntil: {state.deferredUntil ?? "none"}</div>
        </div>
      </div>
    </div>
  )
}

/**
 * Standalone reset control so the preview page can restore a clean state
 * without opening the dev panel.
 */
function StarPromotionDevPreviewResetButton() {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void starPromotionState.reset()}
    >
      Reset stored star promotion state
    </Button>
  )
}

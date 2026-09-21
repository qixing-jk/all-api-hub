import { FlaskConical, RefreshCw, RotateCcw, Star, Zap } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { DEV_MENU_ITEM_IDS } from "~/constants/devOptionsMenuIds"
import toast from "~/lib/notify"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import {
  resolveAccountBaseline,
  STAR_PROMOTION_INITIAL_ACCOUNT_THRESHOLD,
  STAR_PROMOTION_INITIAL_THRESHOLD,
  STAR_PROMOTION_STATUSES,
  type StarPromotionState,
} from "~/services/starPromotion/contracts"
import { starPromotionState } from "~/services/starPromotion/state"
import { getErrorMessage } from "~/utils/core/error"
import { navigateWithinOptionsPage } from "~/utils/navigation"

import type { DevPanelInfoRow, DevPanelSection } from "../types"

type PendingAction = "reset" | "seed" | "defer" | "complete" | null

/**
 * Star promotion debugging: jump to the fixture preview page, reset the stored
 * promotion state, and force the value signals so the Overview card can be
 * exercised live. The rows refresh whenever the panel opens and after every
 * action, so they always describe what the real card will evaluate.
 */
export function useStarPromotionDevSection(
  isPanelOpen: boolean,
): DevPanelSection {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [state, setState] = useState<StarPromotionState | null>(null)
  const [accountCount, setAccountCount] = useState<number | null>(null)

  const refreshState = useCallback(async () => {
    const [nextState, accounts] = await Promise.all([
      starPromotionState.getState(),
      accountQueries
        .getAllAccounts()
        .then((accounts) => accounts.length)
        .catch(() => null),
    ])
    setState(nextState)
    setAccountCount(accounts)
  }, [])

  useEffect(() => {
    if (isPanelOpen) {
      void refreshState()
    }
  }, [isPanelOpen, refreshState])

  const runAction = useCallback(
    async (action: PendingAction, run: () => Promise<void>) => {
      setPendingAction(action)
      try {
        await run()
        await refreshState()
      } catch (error) {
        toast.error(
          `Dev: star promotion action failed: ${getErrorMessage(error)}`,
        )
      } finally {
        setPendingAction(null)
      }
    },
    [refreshState],
  )

  const handleReset = useCallback(
    () => runAction("reset", () => starPromotionState.reset()),
    [runAction],
  )

  const handleSeedCheckins = useCallback(
    () =>
      runAction("seed", async () => {
        // A clean slate plus exactly the initial threshold trips the check-in
        // signal regardless of how many real accounts exist.
        await starPromotionState.reset()
        await starPromotionState.addCheckinSuccesses(
          STAR_PROMOTION_INITIAL_THRESHOLD,
        )
      }),
    [runAction],
  )

  const handleDefer = useCallback(
    () => runAction("defer", () => starPromotionState.deferThresholdPrompt()),
    [runAction],
  )

  const handleComplete = useCallback(
    () => runAction("complete", () => starPromotionState.markCompleted()),
    [runAction],
  )

  const handleReload = useCallback(() => {
    // The options page reads its data once on mount (no storage listeners), so
    // a reload is how every value on it — including this card — becomes fresh.
    window.location.reload()
  }, [])

  return useMemo(() => {
    const rows: DevPanelInfoRow[] = state
      ? [
          {
            id: "status",
            label: "Status",
            value: state.status,
            tone: "runtime",
          },
          {
            id: "checkins",
            label: "Check-ins",
            value: `${state.lifetimeCheckinSuccesses - state.baselineCheckinSuccesses} / ${state.nextThreshold}`,
            tone: "runtime",
            hint: "Successful check-ins since the baseline vs the current threshold.",
          },
          {
            id: "accounts",
            label: "Accounts",
            value:
              accountCount === null
                ? null
                : `${accountCount - resolveAccountBaseline(state, accountCount)} / ${state.nextAccountThreshold}`,
            tone: "runtime",
            hint: "Accounts added since the baseline vs the current threshold.",
          },
          {
            id: "deferred",
            label: "Deferred until",
            value: state.deferredUntil
              ? new Date(state.deferredUntil).toLocaleString()
              : null,
            tone: "runtime",
          },
        ]
      : []

    return {
      id: "star-promotion",
      title: "Star promotion",
      icon: Star,
      description: `Initial thresholds: ${STAR_PROMOTION_INITIAL_THRESHOLD} check-ins or ${STAR_PROMOTION_INITIAL_ACCOUNT_THRESHOLD} accounts since the baseline. State changes apply the next time Overview loads, so reload after seeding.`,
      collapsible: true,
      defaultCollapsed: state?.status === STAR_PROMOTION_STATUSES.Completed,
      summary: state?.status ?? undefined,
      surfaces: ["options"],
      rows,
      actions: [
        {
          id: "open-preview",
          label: "Open star promotion preview",
          icon: FlaskConical,
          run: () =>
            void navigateWithinOptionsPage(
              `#${DEV_MENU_ITEM_IDS.STAR_PROMOTION_PREVIEW}`,
            ),
        },
        {
          id: "seed-checkins",
          label: "Dev: Seed check-in threshold",
          icon: Zap,
          loading: pendingAction === "seed",
          disabled: pendingAction !== null,
          run: handleSeedCheckins,
        },
        {
          id: "simulate-defer",
          label: "Dev: Simulate deferral",
          loading: pendingAction === "defer",
          disabled: pendingAction !== null,
          run: handleDefer,
        },
        {
          id: "simulate-complete",
          label: "Dev: Mark completed",
          loading: pendingAction === "complete",
          disabled: pendingAction !== null,
          run: handleComplete,
        },
        {
          id: "reset",
          label: "Dev: Reset state",
          icon: RotateCcw,
          loading: pendingAction === "reset",
          disabled: pendingAction !== null,
          run: handleReset,
        },
        {
          id: "reload",
          label: "Dev: Reload page to apply",
          icon: RefreshCw,
          run: handleReload,
        },
      ],
    }
  }, [
    accountCount,
    handleComplete,
    handleDefer,
    handleReload,
    handleReset,
    handleSeedCheckins,
    pendingAction,
    state,
  ])
}

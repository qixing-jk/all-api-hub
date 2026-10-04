import { CalendarCheck2, FlaskConical, Plus, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import toast from "~/lib/notify"

import {
  addDevCheckInFixtureAccounts,
  addDevFixtureAccounts,
  clearDevFixtureAccounts,
  countDevFixtureAccounts,
} from "../fixtureAccounts"
import type { DevPanelSection } from "../types"

/**
 * Local fixture-account management for the dev panel. The count refreshes
 * whenever the panel opens so it reflects changes made on other surfaces.
 */
export function useFixtureAccountsDevSection(
  isPanelOpen: boolean,
): DevPanelSection {
  const [fixtureCount, setFixtureCount] = useState<number | null>(null)
  const [pendingAction, setPendingAction] = useState<"add" | "clear" | null>(
    null,
  )

  const refreshCount = useCallback(async () => {
    setFixtureCount(await countDevFixtureAccounts())
  }, [])

  useEffect(() => {
    if (isPanelOpen) {
      void refreshCount()
    }
  }, [isPanelOpen, refreshCount])

  const handleAdd = useCallback(
    async (count?: number) => {
      setPendingAction("add")
      try {
        const added =
          count === undefined
            ? await addDevCheckInFixtureAccounts()
            : await addDevFixtureAccounts(count)
        toast.success(
          count === undefined
            ? `Dev: added ${added} check-in scenario account(s)`
            : `Dev: added ${added} fixture account(s)`,
        )
        await refreshCount()
      } catch (error) {
        toast.error(
          `Dev: failed to add fixture accounts: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      } finally {
        setPendingAction(null)
      }
    },
    [refreshCount],
  )

  const handleClear = useCallback(async () => {
    setPendingAction("clear")
    try {
      const deletedCount = await clearDevFixtureAccounts()
      toast.success(`Dev: removed ${deletedCount} fixture account(s)`)
      await refreshCount()
    } catch (error) {
      toast.error(
        `Dev: failed to clear fixture accounts: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    } finally {
      setPendingAction(null)
    }
  }, [refreshCount])

  return useMemo(
    () => ({
      id: "fixture-accounts",
      title: "Fixture accounts",
      icon: FlaskConical,
      description:
        "Add check-in scenarios, refresh the page, then redetect from an account's More menu or Auto Check-in's Readiness tab. Multiple methods opens the real chooser; selecting a method keeps it on the next retry. Add fresh scenarios to test again. Automatic check-in stays off. Clear removes all registered fixture accounts.",
      pages: [
        MENU_ITEM_IDS.ACCOUNT,
        MENU_ITEM_IDS.OVERVIEW,
        MENU_ITEM_IDS.AUTO_CHECKIN,
      ],
      surfaces: ["options"],
      actions: [
        {
          id: "add-checkin-scenarios",
          label: "Dev: Add check-in discovery scenarios",
          icon: CalendarCheck2,
          loading: pendingAction === "add",
          disabled: pendingAction !== null,
          run: () => handleAdd(),
        },
        {
          id: "add-five",
          label: "Dev: Add 5 fixture accounts",
          icon: Plus,
          loading: pendingAction === "add",
          disabled: pendingAction !== null,
          run: () => handleAdd(5),
        },
        {
          id: "add-one",
          label: "Dev: Add 1 fixture account",
          icon: Plus,
          loading: pendingAction === "add",
          disabled: pendingAction !== null,
          run: () => handleAdd(1),
        },
        {
          id: "clear",
          label:
            fixtureCount === null
              ? "Dev: Clear fixture accounts"
              : `Dev: Clear fixture accounts (${fixtureCount})`,
          icon: Trash2,
          loading: pendingAction === "clear",
          disabled: pendingAction !== null || fixtureCount === 0,
          run: handleClear,
        },
      ],
    }),
    [fixtureCount, handleAdd, handleClear, pendingAction],
  )
}

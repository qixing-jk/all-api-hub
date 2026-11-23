import {
  CalendarCheck2,
  ListPlus,
  Plus,
  Trash2,
  Users,
  Wallet,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { DEV_FINANCIAL_FIXTURE_KINDS } from "~/features/DevPanel/fixtureScenarioKinds"
import toast from "~/lib/notify"
import { replaceWithinOptionsPage } from "~/utils/navigation/optionsPage"

import {
  addDevCheckInFixtureAccounts,
  addDevFinancialFixtureAccounts,
  addDevFixtureAccounts,
  clearDevFixtureAccounts,
  countDevFixtureAccounts,
} from "../fixtureAccounts"
import type { DevPanelSection } from "../types"

const DEV_FIXTURE_ACCOUNT_KINDS = {
  Basic: "basic",
  Checkin: "checkin",
  Balance: "balance",
  SiteBalance: "site-balance",
  SiteStates: "site-states",
} as const

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
    async (
      kind: (typeof DEV_FIXTURE_ACCOUNT_KINDS)[keyof typeof DEV_FIXTURE_ACCOUNT_KINDS],
      count = 1,
    ) => {
      setPendingAction("add")
      try {
        const added =
          kind === DEV_FIXTURE_ACCOUNT_KINDS.SiteStates
            ? await addDevFinancialFixtureAccounts(
                DEV_FINANCIAL_FIXTURE_KINDS.SiteStates,
              )
            : kind === DEV_FIXTURE_ACCOUNT_KINDS.SiteBalance
              ? await addDevFinancialFixtureAccounts(
                  DEV_FINANCIAL_FIXTURE_KINDS.SiteTypes,
                )
              : kind === DEV_FIXTURE_ACCOUNT_KINDS.Balance
                ? await addDevFinancialFixtureAccounts()
                : kind === DEV_FIXTURE_ACCOUNT_KINDS.Checkin
                  ? await addDevCheckInFixtureAccounts()
                  : await addDevFixtureAccounts(count)
        toast.success(
          kind === DEV_FIXTURE_ACCOUNT_KINDS.Balance
            ? `Dev: added ${added} balance scenario account(s)`
            : kind === DEV_FIXTURE_ACCOUNT_KINDS.Checkin
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
        await refreshCount()
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
      icon: Users,
      description:
        "Add local balance/plan examples, then View account list to reload saved data. Includes zero, negative, multiple assets, vouchers, restricted, stale and missing amounts. For check-in scenarios, refresh then redetect from More or Readiness; method selection persists. Automatic check-in stays off. Clear removes registered fixtures only.",
      pages: [
        MENU_ITEM_IDS.ACCOUNT,
        MENU_ITEM_IDS.OVERVIEW,
        MENU_ITEM_IDS.AUTO_CHECKIN,
      ],
      surfaces: ["options"],
      actions: [
        {
          id: "add-site-state-scenarios",
          label: "Dev: Add native zero, missing and stale scenarios",
          icon: Wallet,
          loading: pendingAction === "add",
          disabled: pendingAction !== null,
          run: () => handleAdd(DEV_FIXTURE_ACCOUNT_KINDS.SiteStates),
        },
        {
          id: "add-site-balance-scenarios",
          label: "Dev: Add native site balance scenarios",
          icon: Wallet,
          loading: pendingAction === "add",
          disabled: pendingAction !== null,
          run: () => handleAdd(DEV_FIXTURE_ACCOUNT_KINDS.SiteBalance),
        },
        {
          id: "add-balance-scenarios",
          label: "Dev: Add balance and plan scenarios",
          icon: Wallet,
          loading: pendingAction === "add",
          disabled: pendingAction !== null,
          run: () => handleAdd(DEV_FIXTURE_ACCOUNT_KINDS.Balance),
        },
        {
          id: "view-accounts",
          label: "Dev: View account list",
          icon: Users,
          disabled: pendingAction !== null,
          run: () => {
            replaceWithinOptionsPage(`#${MENU_ITEM_IDS.ACCOUNT}`)
            window.location.reload()
          },
        },
        {
          id: "add-checkin-scenarios",
          label: "Dev: Add check-in discovery scenarios",
          icon: CalendarCheck2,
          loading: pendingAction === "add",
          disabled: pendingAction !== null,
          run: () => handleAdd(DEV_FIXTURE_ACCOUNT_KINDS.Checkin),
        },
        {
          id: "add-five",
          label: "Dev: Add 5 fixture accounts",
          icon: ListPlus,
          loading: pendingAction === "add",
          disabled: pendingAction !== null,
          run: () => handleAdd(DEV_FIXTURE_ACCOUNT_KINDS.Basic, 5),
        },
        {
          id: "add-one",
          label: "Dev: Add 1 fixture account",
          icon: Plus,
          loading: pendingAction === "add",
          disabled: pendingAction !== null,
          run: () => handleAdd(DEV_FIXTURE_ACCOUNT_KINDS.Basic, 1),
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

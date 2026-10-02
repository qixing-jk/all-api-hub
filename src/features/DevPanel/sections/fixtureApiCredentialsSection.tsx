import { KeyRound, Plus, Sparkles, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import toast from "~/lib/notify"
import { getErrorMessage } from "~/utils/core/error"

import {
  addDevAllowanceFixtures,
  addDevFixtureApiCredentials,
  clearDevFixtureApiCredentials,
  countDevFixtureApiCredentials,
} from "../fixtureApiCredentials"
import type { DevPanelSection } from "../types"

type FixtureAction = "add" | "allowance" | "clear"

/** Expose local credential fixture actions only on the credential page. */
export function useFixtureApiCredentialsDevSection(
  isPanelOpen: boolean,
): DevPanelSection {
  const [fixtureCount, setFixtureCount] = useState<number | null>(null)
  const [pendingAction, setPendingAction] = useState<FixtureAction | null>(null)

  const refreshCount = useCallback(async () => {
    try {
      setFixtureCount(await countDevFixtureApiCredentials())
    } catch (error) {
      toast.error(
        `Dev: failed to count fixture credentials: ${getErrorMessage(error)}`,
      )
    }
  }, [])

  useEffect(() => {
    if (isPanelOpen) void refreshCount()
  }, [isPanelOpen, refreshCount])

  const run = useCallback(
    async (action: FixtureAction, count = 0) => {
      setPendingAction(action)
      try {
        const changed =
          action === "allowance"
            ? await addDevAllowanceFixtures()
            : action === "add"
              ? await addDevFixtureApiCredentials(count)
              : await clearDevFixtureApiCredentials()
        const verb =
          action === "clear"
            ? "removed"
            : action === "allowance"
              ? "seeded"
              : "added"
        toast.success(`Dev: ${verb} ${changed} fixture credential(s)`)
        await refreshCount()
      } catch (error) {
        toast.error(
          `Dev: failed to ${action} fixture credentials: ${getErrorMessage(error)}`,
        )
        await refreshCount()
      } finally {
        setPendingAction(null)
      }
    },
    [refreshCount],
  )

  return useMemo(
    () => ({
      id: "fixture-api-credentials",
      title: "Fixture API credentials",
      icon: KeyRound,
      description:
        "Local sample credentials with unreachable endpoints. Use them to test endpoint groups and credential cards. The allowance fixtures seed one credential per remaining-allowance state; refreshing a credential in the library replaces its snapshot, and re-running restores it.",
      pages: [MENU_ITEM_IDS.API_CREDENTIAL_PROFILES],
      surfaces: ["options"],
      actions: [
        {
          id: "add-allowance",
          label: "Dev: Add allowance fixtures",
          icon: Sparkles,
          loading: pendingAction === "allowance",
          disabled: pendingAction !== null,
          run: () => run("allowance"),
        },
        {
          id: "add-five",
          label: "Dev: Add 5 fixture credentials",
          icon: Plus,
          loading: pendingAction === "add",
          disabled: pendingAction !== null,
          run: () => run("add", 5),
        },
        {
          id: "add-one",
          label: "Dev: Add 1 fixture credential",
          icon: Plus,
          loading: pendingAction === "add",
          disabled: pendingAction !== null,
          run: () => run("add", 1),
        },
        {
          id: "clear",
          label:
            fixtureCount === null
              ? "Dev: Clear fixture credentials"
              : `Dev: Clear fixture credentials (${fixtureCount})`,
          icon: Trash2,
          loading: pendingAction === "clear",
          disabled: pendingAction !== null || fixtureCount === 0,
          run: () => run("clear"),
        },
      ],
    }),
    [fixtureCount, pendingAction, run],
  )
}

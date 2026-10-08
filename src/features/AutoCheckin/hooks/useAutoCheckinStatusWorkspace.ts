import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { loginProviderEvidence } from "~/services/accountLogin/providerEvidence"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { refreshAutoCheckinAccountSnapshots } from "~/services/checkin/autoCheckin/accountSnapshot"
import { isAutomaticCheckInConfiguredForAccount } from "~/services/checkin/autoCheckin/inspection"
import { sendAutoCheckinMessage } from "~/services/checkin/autoCheckin/messaging"
import { AutoCheckinMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import {
  siteTypeObservations,
  type SiteTypeMismatchMap,
} from "~/services/siteDetection/siteTypeObservations"
import type { DisplaySiteData, SiteAccount } from "~/types"
import { type AutoCheckinStatus } from "~/types/autoCheckin"
import { onRuntimeMessage } from "~/utils/browser/runtimeMessages"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("AutoCheckinStatusWorkspace")
/**
 * Loads the saved accounts and the setup state derived from them, for empty-state
 * guidance and for the site-type advice the results table names.
 */
async function loadAutoCheckinAccountSetup(): Promise<{
  state: "ready" | "no_accounts" | "no_detection_accounts" | null
  accounts: SiteAccount[]
}> {
  try {
    const accounts = await accountQueries.getAllAccounts()
    const enabledAccounts = accounts.filter(
      (account) => account.disabled !== true,
    )

    if (enabledAccounts.length === 0) {
      return { state: "no_accounts", accounts }
    }

    const state = enabledAccounts.some((account) =>
      isAutomaticCheckInConfiguredForAccount({
        config: account.checkIn,
        siteType: account.site_type,
        siteUrl: account.site_url,
        accountDisabled: account.disabled,
      }),
    )
      ? "ready"
      : "no_detection_accounts"

    return { state, accounts }
  } catch (error) {
    logger.warn("Failed to load accounts for auto check-in empty state", error)
    return { state: null, accounts: [] }
  }
}
/** Owns accepted status snapshots and the account display facts they reference. */
export function useAutoCheckinStatusWorkspace(autoCheckinEnabled: boolean) {
  const [status, setStatus] = useState<AutoCheckinStatus | null>(null)
  const [siteTypeMismatches, setSiteTypeMismatches] =
    useState<SiteTypeMismatchMap>({})
  /**
   * Each account's own USD-to-CNY rate, so a reported reward can be shown in
   * the display currency. Accounts missing here are ones this page could not
   * load; their reward stays hidden rather than converted with a guessed rate.
   */
  const [exchangeRateByAccountId, setExchangeRateByAccountId] = useState<
    Record<string, number>
  >({})
  const [accountSetupState, setAccountSetupState] = useState<
    "ready" | "no_accounts" | "no_detection_accounts" | null
  >(null)
  const [isLoading, setIsLoading] = useState(true)
  const [accountInfoById, setAccountInfoById] = useState<
    Record<string, DisplaySiteData>
  >({})
  const activeStatusLoadCountRef = useRef(0)
  const latestStatusLoadIdRef = useRef(0)
  const attemptedAccountInfoIdsRef = useRef<Set<string>>(new Set())

  const loadStatus = useCallback(async () => {
    const loadId = latestStatusLoadIdRef.current + 1
    latestStatusLoadIdRef.current = loadId
    activeStatusLoadCountRef.current += 1

    try {
      setIsLoading(true)
      const [response, accountSetup, providerEvidence] = await Promise.all([
        sendAutoCheckinMessage(AutoCheckinMessageTypes.GetStatus),
        loadAutoCheckinAccountSetup(),
        loginProviderEvidence.readAll(),
      ])
      // Read through the account, so an observation a later site-type edit
      // retired is not named on a result row.
      const siteTypeMismatches = await siteTypeObservations.readForAccounts(
        accountSetup.accounts.map((account) => ({
          id: account.id,
          siteType: account.site_type,
        })),
      )

      let displayStatus = response.success ? response.data : null
      if (import.meta.env.DEV && response.success) {
        const { appendDevCheckInFixtureSnapshots } = await import(
          "~/services/checkin/autoCheckin/devDiscoveryFixtures"
        )
        const snapshots = await appendDevCheckInFixtureSnapshots(
          displayStatus?.accountsSnapshot ?? [],
          accountSetup.accounts,
        )
        if (snapshots.length)
          displayStatus = { ...displayStatus, accountsSnapshot: snapshots }
      }

      if (loadId === latestStatusLoadIdRef.current) {
        setAccountSetupState(accountSetup.state)
        setSiteTypeMismatches(siteTypeMismatches)
        setExchangeRateByAccountId(
          Object.fromEntries(
            accountSetup.accounts.map((account) => [
              account.id,
              account.exchange_rate,
            ]),
          ),
        )

        if (response.success) {
          setStatus(
            displayStatus
              ? {
                  ...displayStatus,
                  accountsSnapshot: refreshAutoCheckinAccountSnapshots(
                    displayStatus.accountsSnapshot ?? [],
                    accountSetup.accounts,
                    providerEvidence,
                    autoCheckinEnabled,
                  ),
                }
              : displayStatus,
          )
        }
      }

      if (response.success) {
        return response.data as AutoCheckinStatus
      }
    } catch (error) {
      logger.error("Failed to load status", error)
    } finally {
      activeStatusLoadCountRef.current -= 1
      if (activeStatusLoadCountRef.current === 0) {
        setIsLoading(false)
      }
    }

    return null
  }, [autoCheckinEnabled])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  useEffect(() => {
    return onRuntimeMessage((message) => {
      if (message?.action === RuntimeActionIds.AutoCheckinRunCompleted) {
        void loadStatus()
      }
    })
  }, [loadStatus])

  const accountResultIds = useMemo(
    () =>
      Object.values(status?.perAccount ?? {}).map((result) => result.accountId),
    [status?.perAccount],
  )
  const resolveAutoCheckinAccount = useCallback(
    async (
      accountId: string,
      options?: { includeDisabled?: boolean },
    ): Promise<DisplaySiteData> => {
      const response = await sendAutoCheckinMessage(
        AutoCheckinMessageTypes.GetAccountInfo,
        {
          accountId,
          ...(typeof options?.includeDisabled !== "undefined"
            ? { includeDisabled: options.includeDisabled }
            : {}),
        },
      )

      if (!response.success) {
        throw new Error(response.error || "Unknown error")
      }

      const displayData = response.data as DisplaySiteData | undefined
      if (!displayData) {
        throw new Error("Account info not found")
      }

      setAccountInfoById((prev) =>
        prev[accountId] === displayData
          ? prev
          : {
              ...prev,
              [accountId]: displayData,
            },
      )
      return displayData
    },
    [],
  )

  useEffect(() => {
    const missingAccountIds = accountResultIds.filter(
      (accountId) =>
        !accountInfoById[accountId] &&
        !attemptedAccountInfoIdsRef.current.has(accountId),
    )

    if (!missingAccountIds.length) {
      return
    }

    let cancelled = false
    // A failed display lookup must not be retried on every status update.
    // Explicit account actions still perform their own fresh lookup.
    for (const accountId of missingAccountIds) {
      attemptedAccountInfoIdsRef.current.add(accountId)
    }

    void Promise.allSettled(
      missingAccountIds.map((accountId) =>
        resolveAutoCheckinAccount(accountId, { includeDisabled: true }),
      ),
    ).then((results) => {
      if (cancelled) return

      const loadedAccounts = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      )

      if (!loadedAccounts.length) {
        return
      }

      setAccountInfoById((prev) => ({
        ...prev,
        ...Object.fromEntries(
          loadedAccounts.map((account) => [account.id, account]),
        ),
      }))
    })

    return () => {
      cancelled = true
    }
  }, [accountInfoById, accountResultIds, resolveAutoCheckinAccount])

  return {
    status,
    siteTypeMismatches,
    exchangeRateByAccountId,
    accountSetupState,
    isLoading,
    accountInfoById,
    loadStatus,
    resolveAutoCheckinAccount,
  }
}

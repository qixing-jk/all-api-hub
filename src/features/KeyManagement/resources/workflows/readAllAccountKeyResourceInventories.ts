import type { OpenResourceSession } from "~/features/KeyManagement/resources/workflows/accountKeyResourceControllerTypes"
import {
  ALL_ACCOUNT_CONCURRENCY,
  awaitAbortable,
  groupAccountsByOrigin,
} from "~/features/KeyManagement/resources/workflows/accountKeyResourceWorkflowSupport"
import type {
  AccountKeyResourceFacts,
  AccountKeyScope,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { collectAccountKeyResourceInventory } from "~/services/apiAdapters/nativeResources/accountKeyResourceInventory"
import { mapSettledWithConcurrency } from "~/services/apiAdapters/nativeResources/concurrency"
import type { DisplaySiteData } from "~/types"

type AccountInventory = {
  rows: AccountKeyResourceFacts[]
  scope: AccountKeyScope | null
}

/** Read default scopes with bounded origin concurrency, reporting each account independently. */
export async function readAllAccountKeyResourceInventories({
  accounts,
  search,
  signal,
  openSession,
  onSettled,
}: {
  accounts: DisplaySiteData[]
  search: string
  signal: AbortSignal
  openSession: OpenResourceSession
  onSettled: (
    account: DisplaySiteData,
    result: PromiseSettledResult<AccountInventory>,
  ) => void
}) {
  const readAccount = async (
    account: DisplaySiteData,
  ): Promise<AccountInventory> => {
    const session = await openSession(account, signal)
    if (!session) return { rows: [], scope: null }
    const scope = await awaitAbortable(
      session.resolveDefaultScope({ signal }),
      signal,
    )
    const collection = await awaitAbortable(
      session.openCollection(scope.scopeKey, { signal }),
      signal,
    )
    const rows = await collectAccountKeyResourceInventory(collection, {
      search,
      signal,
    })
    return { rows, scope }
  }

  const groups = groupAccountsByOrigin(accounts)
  const settled = await mapSettledWithConcurrency(
    groups,
    ALL_ACCOUNT_CONCURRENCY,
    async (group) => {
      for (const account of group) {
        const [result] = await Promise.allSettled([readAccount(account)])
        onSettled(account, result)
      }
    },
  )
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") return
    groups[index]?.forEach((account) =>
      onSettled(account, { status: "rejected", reason: result.reason }),
    )
  })
}

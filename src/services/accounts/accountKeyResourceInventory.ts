import {
  createDisplayAccountApiContext,
  type DisplayAccountApiSnapshot,
} from "~/services/accounts/utils/apiServiceRequest"
import type {
  AccountKeyResourceFacts,
  AccountKeyScope,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { collectAccountKeyResourceInventory } from "~/services/apiAdapters/nativeResources/accountKeyResourceInventory"

type DisplayAccountKeyResourceInventory = {
  scope: AccountKeyScope
  items: readonly AccountKeyResourceFacts[]
}

/**
 * Opens an account's native key-resource boundary and reads its default scope.
 * Editor and mutation capabilities deliberately remain outside this interface.
 */
export async function fetchDisplayAccountKeyResourceInventory(
  account: DisplayAccountApiSnapshot & { name?: string },
  options: { signal?: AbortSignal } = {},
): Promise<DisplayAccountKeyResourceInventory> {
  const { accountKeyResources, request } =
    createDisplayAccountApiContext(account)

  if (!accountKeyResources) {
    throw new Error("Account key resource inventory is not supported")
  }

  const operationOptions = { signal: options.signal }
  const session = await accountKeyResources.open(
    {
      account: {
        id: account.id,
        name: account.name,
        siteType: account.siteType,
      },
      request,
    },
    operationOptions,
  )
  const scope = await session.resolveDefaultScope(operationOptions)
  const collection = await session.openCollection(
    scope.scopeKey,
    operationOptions,
  )
  const items = await collectAccountKeyResourceInventory(collection, options)

  return { scope, items }
}

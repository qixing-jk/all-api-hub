import {
  createDisplayAccountApiContext,
  type DisplayAccountApiSnapshot,
} from "~/services/accounts/utils/apiServiceRequest"
import type {
  AccountKeyResourceFacts,
  AccountKeyScope,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  awaitAbortableAccountKeyResourceOperation,
  collectAccountKeyResourceInventory,
} from "~/services/apiAdapters/nativeResources/accountKeyResourceInventory"

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
  const session = await awaitAbortableAccountKeyResourceOperation(
    () =>
      accountKeyResources.open(
        {
          account: {
            id: account.id,
            name: account.name,
            siteType: account.siteType,
          },
          request,
        },
        operationOptions,
      ),
    options.signal,
  )
  const scope = await awaitAbortableAccountKeyResourceOperation(
    () => session.resolveDefaultScope(operationOptions),
    options.signal,
  )
  const collection = await awaitAbortableAccountKeyResourceOperation(
    () => session.openCollection(scope.scopeKey, operationOptions),
    options.signal,
  )
  const items = await collectAccountKeyResourceInventory(collection, options)

  return { scope, items }
}

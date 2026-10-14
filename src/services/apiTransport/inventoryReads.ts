import type { ApiOperationContext } from "~/services/apiTransport/operationContext"
import {
  SharedRead,
  sharePendingConfigRead,
  type ScheduledReadOptions,
} from "~/services/apiTransport/requestScheduling"

/** Owned by one read-only operation; never reused for mutation admission. */
export type InventoryReadCache = Map<object, Map<string, SharedRead<unknown>>>

export type InventoryReadOptions = ScheduledReadOptions & {
  inventoryCache?: InventoryReadCache
  operationContext?: ApiOperationContext
}

/** Retains successful full inventories within a batch, sharing only pending reads otherwise. */
export function shareInventoryRead<TConfig extends object, TResult>(
  execute: (
    config: TConfig,
    options: Required<ScheduledReadOptions>,
  ) => Promise<TResult>,
) {
  const readPending = sharePendingConfigRead(execute)
  const owner = {}
  return async (
    config: TConfig,
    options: InventoryReadOptions = {},
  ): Promise<TResult> => {
    const cache =
      options.operationContext?.inventoryReads ?? options.inventoryCache
    if (!cache) return readPending(config, options)
    options.signal?.throwIfAborted()
    let reads = cache.get(owner)
    if (!reads) {
      reads = new Map()
      cache.set(owner, reads)
    }
    // Keep paths, credentials and all other connection values isolated.
    const key = JSON.stringify(
      Object.entries(config).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    )
    let read = reads.get(key) as SharedRead<TResult> | undefined
    if (!read || read.signal.aborted) {
      const retainedReads = reads
      const created = new SharedRead<TResult>(async (sharedOptions) => {
        try {
          return await execute(config, sharedOptions)
        } catch (error) {
          if (retainedReads.get(key) === created) retainedReads.delete(key)
          throw error
        }
      })
      reads.set(key, created)
      read = created
    }
    return read.read(options)
  }
}

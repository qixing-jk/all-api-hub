import type { InventoryReadCache } from "~/services/apiTransport/inventoryReads"

/** Authentication and inventory lifetimes are independent within one caller-owned operation. */
export interface ApiOperationContext {
  inventoryReads: InventoryReadCache
  sessions: object
}

/** A new operation never inherits another operation's successful reads or authentication. */
export function createApiOperationContext(): ApiOperationContext {
  return { inventoryReads: new Map(), sessions: {} }
}

/** Each provider owns its values; the common layer only isolates configuration and lifetime. */
export function createOperationScopedValue<TConfig extends object, TValue>(
  create: (config: TConfig) => TValue,
  keyOf: (config: TConfig) => string,
) {
  const valuesByOwner = new WeakMap<object, Map<string, TValue>>()
  return (config: TConfig, owner?: object): TValue => {
    if (!owner) return create(config)
    let values = valuesByOwner.get(owner)
    if (!values) {
      values = new Map()
      valuesByOwner.set(owner, values)
    }
    const key = keyOf(config)
    if (values.has(key)) return values.get(key)!
    const value = create(config)
    values.set(key, value)
    return value
  }
}

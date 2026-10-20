import type { AccountNativeBalance } from "~/types"

/**
 * Legacy monetary features assume one fungible balance and matching cashflows.
 * Native assets, including scoped USD allowances, do not satisfy that contract.
 */
export function supportsMonetaryBalance(
  nativeBalance: AccountNativeBalance | undefined,
): boolean {
  return nativeBalance === undefined
}

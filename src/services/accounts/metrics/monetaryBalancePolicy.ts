import type { AccountNativeBalance } from "~/types"

/**
 * Legacy monetary features assume one fungible balance and matching cashflows.
 * Native assets, including scoped USD allowances, do not satisfy that contract.
 * USD_XNO keeps quota denominated exclusively in USD; its separate XNO amount
 * is displayed without entering monetary totals or history.
 */
export function supportsMonetaryBalance(
  nativeBalance: AccountNativeBalance | undefined,
  balanceUnavailable?: boolean,
): boolean {
  return (
    balanceUnavailable !== true &&
    (nativeBalance === undefined || nativeBalance.unit === "USD_XNO")
  )
}

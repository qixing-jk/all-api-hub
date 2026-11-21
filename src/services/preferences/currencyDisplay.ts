import { CURRENCY_DISPLAY_MODES } from "~/constants/money"
import type { CurrencyDisplay, CurrencyType } from "~/types"

/** Original mode leaves native amounts intact; older preferences inherit their currency. */
export function getDisplayCurrency(
  currencyDisplay: CurrencyDisplay | undefined,
  currencyType: CurrencyType,
): CurrencyType | undefined {
  return currencyDisplay === CURRENCY_DISPLAY_MODES.Original
    ? undefined
    : (currencyDisplay ?? currencyType)
}

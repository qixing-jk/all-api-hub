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

/** Original mode preserves the saved reference currency on both persistence and UI updates. */
export function getCurrencyDisplayUpdates(currencyDisplay: CurrencyDisplay): {
  currencyDisplay: CurrencyDisplay
  currencyType?: CurrencyType
} {
  return {
    currencyDisplay,
    ...(currencyDisplay === CURRENCY_DISPLAY_MODES.Original
      ? {}
      : { currencyType: currencyDisplay }),
  }
}

/** The overview cycles through the same three modes offered by settings. */
export function getNextCurrencyDisplay(
  currencyDisplay: CurrencyDisplay,
): CurrencyDisplay {
  return currencyDisplay === CURRENCY_DISPLAY_MODES.Original
    ? CURRENCY_DISPLAY_MODES.USD
    : currencyDisplay === CURRENCY_DISPLAY_MODES.USD
      ? CURRENCY_DISPLAY_MODES.CNY
      : CURRENCY_DISPLAY_MODES.Original
}

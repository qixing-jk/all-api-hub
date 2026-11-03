import type { CalculatedModelItem } from "~/features/ModelList/presentation/modelListItems"
import {
  getModelBillingMode,
  MODEL_LIST_BILLING_MODES,
} from "~/features/ModelList/pricing/billingModes"
import { QUOTE_UNITS } from "~/services/modelPricing/pricingConstants"

export interface PriceComparisonDisplayGroup {
  unit?: string
  key: string
  modelName: string
  quotaType: number
  comparableItems: CalculatedModelItem[]
  notComparedItems: CalculatedModelItem[]
}

export const MODEL_DISPLAY_ENTRY_KINDS = {
  MODEL: "model",
  PRICE_COMPARISON_GROUP: "price-comparison-group",
} as const

export type ModelDisplayEntry =
  | { kind: typeof MODEL_DISPLAY_ENTRY_KINDS.MODEL; item: CalculatedModelItem }
  | {
      kind: typeof MODEL_DISPLAY_ENTRY_KINDS.PRICE_COMPARISON_GROUP
      group: PriceComparisonDisplayGroup
    }

/** Groups comparable model identities while keeping billing modes separate. */
export function createPriceComparisonDisplayGroups(
  models: CalculatedModelItem[],
): PriceComparisonDisplayGroup[] {
  const groups = new Map<string, PriceComparisonDisplayGroup>()

  models.forEach((item) => {
    const billingMode = getModelBillingMode(item.model.quota_type)
    const unit =
      item.calculatedPrice.quote?.unit ??
      (billingMode === MODEL_LIST_BILLING_MODES.TOKEN_BASED
        ? QUOTE_UNITS.MILLION_SELECTED_TOKENS
        : QUOTE_UNITS.REQUEST)
    const key = JSON.stringify([
      item.comparableModelIdentity.key,
      billingMode,
      unit,
    ])
    const group = groups.get(key) ?? {
      key,
      unit,
      modelName: item.comparableModelIdentity.displayName,
      quotaType: item.model.quota_type,
      comparableItems: [],
      notComparedItems: [],
    }

    if (item.isPriceComparable) {
      group.comparableItems.push(item)
    } else {
      group.notComparedItems.push(item)
    }
    groups.set(key, group)
  })

  return Array.from(groups.values())
}

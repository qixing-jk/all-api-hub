import { type UserPreferences } from "~/services/preferences/preferencesSchema"
import {
  type PRODUCT_ANALYTICS_EVENTS,
  type ProductAnalyticsEntrypoint,
  type ProductAnalyticsEventPayload,
} from "~/services/productAnalytics/contracts"

export type SettingChangedPayload = ProductAnalyticsEventPayload<
  typeof PRODUCT_ANALYTICS_EVENTS.SettingChanged
>

/** Limit count facts to finite non-negative integers. */
export function normalizeNonNegativeInteger(value: number): number {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 0
    ? value
    : 0
}

/** Round finite non-negative durations to whole minutes. */
export function normalizeNonNegativeMinutes(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : 0
}

/** Report whether a connection field is present without emitting its contents. */
export function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0
}

/** One reviewed settings projection includes its patch triggers and safe output facts. */
export type SettingsSnapshotProjection = {
  keys: readonly (keyof UserPreferences)[]
  build: (
    preferences: UserPreferences,
    entrypoint: ProductAnalyticsEntrypoint,
  ) => SettingChangedPayload
}

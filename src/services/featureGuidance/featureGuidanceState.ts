import { Storage } from "@plasmohq/storage"

import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { createLogger } from "~/utils/core/logger"
import { isPlainObject } from "~/utils/core/object"

const logger = createLogger("FeatureGuidanceState")

export const FEATURE_GUIDANCE_SCHEMA_VERSION = 1 as const

export const PRODUCT_TOUR_VARIANTS = {
  Expanded: "expanded",
  Compact: "compact",
} as const

export type ProductTourVariant =
  (typeof PRODUCT_TOUR_VARIANTS)[keyof typeof PRODUCT_TOUR_VARIANTS]

export const PRODUCT_TOUR_OUTCOMES = {
  Completed: "completed",
  Dismissed: "dismissed",
} as const

export type ProductTourOutcome =
  (typeof PRODUCT_TOUR_OUTCOMES)[keyof typeof PRODUCT_TOUR_OUTCOMES]

export const GATEWAY_GUIDANCE_SURFACES = {
  Account: "account",
  ApiCredentialProfiles: "apiCredentialProfiles",
} as const

export type GatewayGuidanceSurface =
  (typeof GATEWAY_GUIDANCE_SURFACES)[keyof typeof GATEWAY_GUIDANCE_SURFACES]

export interface ProductTourHandledState {
  handledVersion: number
  outcome: ProductTourOutcome
  handledAt: number
}

export interface GatewayGuidanceState {
  onboardingCompletedAt?: number
  dismissedAtBySurface: Partial<Record<GatewayGuidanceSurface, number>>
}

export interface FeatureGuidanceState {
  schemaVersion: typeof FEATURE_GUIDANCE_SCHEMA_VERSION
  productTour: Partial<Record<ProductTourVariant, ProductTourHandledState>>
  gatewayGuidance: GatewayGuidanceState
}

/** Creates an isolated empty state for a new extension profile. */
export function createEmptyFeatureGuidanceState(): FeatureGuidanceState {
  return {
    schemaVersion: FEATURE_GUIDANCE_SCHEMA_VERSION,
    productTour: {},
    gatewayGuidance: {
      dismissedAtBySurface: {},
    },
  }
}

/** Accepts only finite positive timestamps and version numbers. */
function readFinitePositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined
}

/** Reads a valid persisted product-tour outcome from an unknown value. */
function sanitizeProductTourHandledState(
  value: unknown,
): ProductTourHandledState | undefined {
  if (!isPlainObject(value)) return undefined

  const handledVersion = readFinitePositiveNumber(value.handledVersion)
  const handledAt = readFinitePositiveNumber(value.handledAt)
  const outcome = Object.values(PRODUCT_TOUR_OUTCOMES).includes(
    value.outcome as ProductTourOutcome,
  )
    ? (value.outcome as ProductTourOutcome)
    : undefined

  if (!handledVersion || !handledAt || !outcome) return undefined

  return {
    handledVersion,
    outcome,
    handledAt,
  }
}

/** Reads valid gateway-guidance timestamps from an unknown value. */
function sanitizeGatewayGuidanceState(value: unknown): GatewayGuidanceState {
  const state: GatewayGuidanceState = { dismissedAtBySurface: {} }
  if (!isPlainObject(value)) return state

  const onboardingCompletedAt = readFinitePositiveNumber(
    value.onboardingCompletedAt,
  )
  if (onboardingCompletedAt) {
    state.onboardingCompletedAt = onboardingCompletedAt
  }

  if (isPlainObject(value.dismissedAtBySurface)) {
    for (const surface of Object.values(GATEWAY_GUIDANCE_SURFACES)) {
      const dismissedAt = readFinitePositiveNumber(
        value.dismissedAtBySurface[surface],
      )
      if (dismissedAt) {
        state.dismissedAtBySurface[surface] = dismissedAt
      }
    }
  }

  return state
}

/** Sanitizes imported or persisted experience state at its storage boundary. */
function sanitizeFeatureGuidanceState(value: unknown): FeatureGuidanceState {
  const state = createEmptyFeatureGuidanceState()
  if (!isPlainObject(value)) return state

  if (isPlainObject(value.productTour)) {
    for (const variant of Object.values(PRODUCT_TOUR_VARIANTS)) {
      const handled = sanitizeProductTourHandledState(
        value.productTour[variant],
      )
      if (handled) state.productTour[variant] = handled
    }
  }

  state.gatewayGuidance = sanitizeGatewayGuidanceState(value.gatewayGuidance)
  return state
}

/** Returns the newest available timestamp. */
function mergeOptionalTimestamp(left?: number, right?: number) {
  if (left === undefined) return right
  if (right === undefined) return left
  return Math.max(left, right)
}

/** Resolves the non-regressing handled state for one tour variant. */
function mergeProductTourHandledState(
  left?: ProductTourHandledState,
  right?: ProductTourHandledState,
): ProductTourHandledState | undefined {
  if (!left) return right
  if (!right) return left
  if (left.handledVersion !== right.handledVersion) {
    return left.handledVersion > right.handledVersion ? left : right
  }

  return {
    handledVersion: left.handledVersion,
    outcome:
      left.outcome === PRODUCT_TOUR_OUTCOMES.Completed ||
      right.outcome === PRODUCT_TOUR_OUTCOMES.Completed
        ? PRODUCT_TOUR_OUTCOMES.Completed
        : PRODUCT_TOUR_OUTCOMES.Dismissed,
    handledAt: Math.max(left.handledAt, right.handledAt),
  }
}

/** Merges synchronized history without allowing an older snapshot to regress it. */
export function mergeFeatureGuidanceStates(
  leftValue: unknown,
  rightValue: unknown,
): FeatureGuidanceState {
  const left = sanitizeFeatureGuidanceState(leftValue)
  const right = sanitizeFeatureGuidanceState(rightValue)
  const merged = createEmptyFeatureGuidanceState()

  for (const variant of Object.values(PRODUCT_TOUR_VARIANTS)) {
    const handled = mergeProductTourHandledState(
      left.productTour[variant],
      right.productTour[variant],
    )
    if (handled) merged.productTour[variant] = handled
  }

  merged.gatewayGuidance.onboardingCompletedAt = mergeOptionalTimestamp(
    left.gatewayGuidance.onboardingCompletedAt,
    right.gatewayGuidance.onboardingCompletedAt,
  )
  for (const surface of Object.values(GATEWAY_GUIDANCE_SURFACES)) {
    const dismissedAt = mergeOptionalTimestamp(
      left.gatewayGuidance.dismissedAtBySurface[surface],
      right.gatewayGuidance.dismissedAtBySurface[surface],
    )
    if (dismissedAt) {
      merged.gatewayGuidance.dismissedAtBySurface[surface] = dismissedAt
    }
  }

  return merged
}

type FeatureGuidanceStateListener = (state: FeatureGuidanceState) => void

export class FeatureGuidanceStateService {
  private storage = new Storage({ area: "local" })
  private preferencesStorage = new Storage({ area: "local" })

  private async readStoredState(): Promise<FeatureGuidanceState> {
    const stored = await this.storage.get(STORAGE_KEYS.FEATURE_GUIDANCE_STATE)
    return sanitizeFeatureGuidanceState(stored)
  }

  private async mergeStoredState(
    incoming: unknown,
  ): Promise<FeatureGuidanceState> {
    return withExtensionStorageWriteLock(
      STORAGE_LOCKS.FEATURE_GUIDANCE,
      async () => {
        const merged = mergeFeatureGuidanceStates(
          await this.readStoredState(),
          incoming,
        )
        await this.storage.set(STORAGE_KEYS.FEATURE_GUIDANCE_STATE, merged)
        return merged
      },
    )
  }

  /**
   * Moves released gateway-guidance history out of the legacy preference blob.
   * Product Tour was not released with that shape, so its draft state is removed.
   */
  async ensureLegacyPreferenceMigration(): Promise<void> {
    await withExtensionStorageWriteLock(
      STORAGE_LOCKS.USER_PREFERENCES,
      async () => {
        const raw: unknown = await this.preferencesStorage.get(
          STORAGE_KEYS.USER_PREFERENCES,
        )
        if (!isPlainObject(raw)) return

        const hasLegacyGateway = Object.prototype.hasOwnProperty.call(
          raw,
          "gatewayGuidance",
        )
        const hasDraftProductTour = Object.prototype.hasOwnProperty.call(
          raw,
          "productTour",
        )
        if (!hasLegacyGateway && !hasDraftProductTour) return

        if (hasLegacyGateway) {
          await this.mergeStoredState({
            gatewayGuidance: raw.gatewayGuidance,
          })
        }

        const nextPreferences = { ...raw }
        delete nextPreferences.gatewayGuidance
        delete nextPreferences.productTour
        await this.preferencesStorage.set(
          STORAGE_KEYS.USER_PREFERENCES,
          nextPreferences,
        )
      },
    )
  }

  async getState(): Promise<FeatureGuidanceState> {
    try {
      await this.ensureLegacyPreferenceMigration()
      return await this.readStoredState()
    } catch (error) {
      logger.warn("Failed to load feature guidance state", error)
      return createEmptyFeatureGuidanceState()
    }
  }

  async mergeState(incoming: unknown): Promise<FeatureGuidanceState> {
    await this.ensureLegacyPreferenceMigration()
    return this.mergeStoredState(incoming)
  }

  async markProductTourHandled(
    variant: ProductTourVariant,
    version: number,
    outcome: ProductTourOutcome,
    handledAt = Date.now(),
  ): Promise<FeatureGuidanceState> {
    return this.mergeState({
      productTour: {
        [variant]: {
          handledVersion: version,
          outcome,
          handledAt,
        },
      },
    })
  }

  async markGatewayGuidanceOnboardingCompleted(
    completedAt = Date.now(),
  ): Promise<FeatureGuidanceState> {
    return this.mergeState({
      gatewayGuidance: { onboardingCompletedAt: completedAt },
    })
  }

  async dismissGatewayGuidanceSurface(
    surface: GatewayGuidanceSurface,
    dismissedAt = Date.now(),
  ): Promise<FeatureGuidanceState> {
    return this.mergeState({
      gatewayGuidance: {
        dismissedAtBySurface: { [surface]: dismissedAt },
      },
    })
  }

  /** Subscribes to guidance-state changes from other extension contexts. */
  watchState(listener: FeatureGuidanceStateListener): () => void {
    const callbacks = {
      [STORAGE_KEYS.FEATURE_GUIDANCE_STATE]: (change) => {
        listener(sanitizeFeatureGuidanceState(change.newValue))
      },
    } satisfies Parameters<typeof this.storage.watch>[0]

    if (!this.storage.watch(callbacks)) return () => {}
    return () => this.storage.unwatch(callbacks)
  }
}

export const featureGuidanceState = new FeatureGuidanceStateService()

import type { AccountSiteType } from "~/constants/siteType"

import type { AutoCheckinProvider } from "."

/**
 * Persisted backup and synchronization contracts. Protocol splits add a new
 * ID instead of renaming an existing value.
 */
export const AUTO_CHECKIN_METHOD_IDS = {
  NewApiDailyCheckIn: "new-api:daily-checkin",
  VeloeraDailyCheckIn: "veloera:daily-checkin",
  WongGongyiDailyCheckIn: "wong-gongyi:daily-checkin",
  AnyrouterDailyCheckIn: "anyrouter:daily-checkin",
  VoApiV2DailyCheckIn: "voapi-v2:daily-checkin",
} as const

export type CheckInMethodId =
  (typeof AUTO_CHECKIN_METHOD_IDS)[keyof typeof AUTO_CHECKIN_METHOD_IDS]

const CHECK_IN_METHOD_ID_SET = new Set<string>(
  Object.values(AUTO_CHECKIN_METHOD_IDS),
)

/** Returns whether a persisted value names a registered check-in method. */
export function isCheckInMethodId(value: unknown): value is CheckInMethodId {
  return typeof value === "string" && CHECK_IN_METHOD_ID_SET.has(value)
}

// Only these providers may bridge pre-registry behavior without protocol detection.
const PRE_REGISTRY_AUTO_CHECKIN_METHOD_IDS = [
  AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn,
  AUTO_CHECKIN_METHOD_IDS.VeloeraDailyCheckIn,
  AUTO_CHECKIN_METHOD_IDS.WongGongyiDailyCheckIn,
  AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn,
  AUTO_CHECKIN_METHOD_IDS.VoApiV2DailyCheckIn,
] as const

type PreRegistryAutoCheckinMethodId =
  (typeof PRE_REGISTRY_AUTO_CHECKIN_METHOD_IDS)[number]

declare const unknownPersistedCheckInMethodId: unique symbol

type UnknownPersistedCheckInMethodId = string & {
  readonly [unknownPersistedCheckInMethodId]: true
}

export type PersistedCheckInMethodId =
  | CheckInMethodId
  | UnknownPersistedCheckInMethodId

const MAX_PERSISTED_CHECK_IN_METHOD_ID_LENGTH = 128
const PERSISTED_CHECK_IN_METHOD_ID_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Decode a storage-safe namespaced method ID without requiring it to be
 * registered by the current build.
 */
export function decodePersistedCheckInMethodId(
  value: unknown,
): PersistedCheckInMethodId | null {
  if (
    typeof value !== "string" ||
    value.length > MAX_PERSISTED_CHECK_IN_METHOD_ID_LENGTH ||
    !PERSISTED_CHECK_IN_METHOD_ID_PATTERN.test(value)
  ) {
    return null
  }

  return value as PersistedCheckInMethodId
}

interface AutoCheckinMethodRegistrationBase {
  readonly id: CheckInMethodId
  /** Static candidate filter only; never proof that a deployment supports the method. */
  readonly siteTypes: readonly AccountSiteType[]
  readonly provider: AutoCheckinProvider
}

export type AutoCheckinMethodRegistration = AutoCheckinMethodRegistrationBase &
  (
    | {
        readonly id: PreRegistryAutoCheckinMethodId
        /** Pure metadata used to migrate the former siteType-to-provider map. */
        readonly legacy: {
          readonly siteTypes: readonly AccountSiteType[]
        }
        /** Preserves new-account behavior for pre-registry providers only. */
        readonly newAccountCompatibility?: {
          readonly siteTypes: readonly AccountSiteType[]
        }
      }
    | {
        readonly id: CheckInMethodId
        readonly legacy?: undefined
        readonly newAccountCompatibility?: never
      }
  )

export interface AutoCheckinMethodRegistry {
  readonly registrations: readonly AutoCheckinMethodRegistration[]
  getCandidates(
    siteType: AccountSiteType,
  ): readonly AutoCheckinMethodRegistration[]
  /** Resolve executable code only when the ID is registered by this build. */
  resolveById(
    id: PersistedCheckInMethodId,
  ): AutoCheckinMethodRegistration | null
  getLegacyRegistrations(
    siteType: AccountSiteType,
  ): readonly AutoCheckinMethodRegistration[]
  getNewAccountCompatibleRegistrations(
    siteType: AccountSiteType,
  ): readonly AutoCheckinMethodRegistration[]
}

interface AutoCheckinMethodRegistryOptions {
  readonly requiredLegacySiteTypes?: readonly AccountSiteType[]
}

/**
 * Build and validate an ordered auto check-in method registry.
 */
export function createAutoCheckinMethodRegistry(
  registrations: readonly AutoCheckinMethodRegistration[],
  options: AutoCheckinMethodRegistryOptions = {},
): AutoCheckinMethodRegistry {
  const preRegistryMethodIds = new Set<string>(
    PRE_REGISTRY_AUTO_CHECKIN_METHOD_IDS,
  )
  const methodIds = new Set<CheckInMethodId>()
  for (const registration of registrations) {
    const registrationId = registration.id
    if (registration.siteTypes.length === 0) {
      throw new Error(
        `Auto check-in method has no candidate site types: ${registrationId}`,
      )
    }
    if (
      (registration.legacy || registration.newAccountCompatibility) &&
      !preRegistryMethodIds.has(registrationId)
    ) {
      throw new Error(
        `Legacy and new-account compatibility metadata are reserved for pre-registry methods: ${registrationId}`,
      )
    }
    if (!isCheckInMethodId(registrationId)) {
      throw new Error(
        `Auto check-in method ID is not declared in AUTO_CHECKIN_METHOD_IDS: ${registrationId}`,
      )
    }
    if (registration.newAccountCompatibility && !registration.legacy) {
      throw new Error(
        `New-account compatibility requires legacy provider metadata: ${registrationId}`,
      )
    }
    for (const siteType of registration.legacy?.siteTypes ?? []) {
      if (!registration.siteTypes.includes(siteType)) {
        throw new Error(
          `Legacy site type is not a candidate for auto check-in method: ${registration.id} -> ${siteType}`,
        )
      }
    }
    for (const siteType of registration.newAccountCompatibility?.siteTypes ??
      []) {
      if (!registration.legacy?.siteTypes.includes(siteType)) {
        throw new Error(
          `New-account compatibility site type is not covered by legacy behavior: ${registration.id} -> ${siteType}`,
        )
      }
    }
    if (methodIds.has(registrationId)) {
      throw new Error(`Duplicate auto check-in method ID: ${registrationId}`)
    }
    methodIds.add(registrationId)
  }

  for (const siteType of options.requiredLegacySiteTypes ?? []) {
    const registrationCount = registrations.filter((registration) =>
      registration.legacy?.siteTypes.includes(siteType),
    ).length
    if (registrationCount !== 1) {
      throw new Error(
        `Expected exactly one legacy auto check-in provider for site type: ${siteType}; found ${registrationCount}`,
      )
    }
  }

  return {
    registrations,
    getCandidates: (siteType) =>
      registrations.filter((registration) =>
        registration.siteTypes.includes(siteType),
      ),
    resolveById: (id) =>
      registrations.find((registration) => registration.id === id) ?? null,
    getLegacyRegistrations: (siteType) =>
      registrations.filter((registration) =>
        registration.legacy?.siteTypes.includes(siteType),
      ),
    getNewAccountCompatibleRegistrations: (siteType) =>
      registrations.filter((registration) =>
        registration.newAccountCompatibility?.siteTypes.includes(siteType),
      ),
  }
}

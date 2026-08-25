import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type { CheckInMethodId, PersistedCheckInMethodId } from "~/types/checkIn"

import type { AutoCheckinProvider } from "./contracts"

/** Frozen migration boundary; future method IDs must not be added here. */
const PRE_REGISTRY_AUTO_CHECKIN_METHOD_IDS = [
  AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn,
  AUTO_CHECKIN_METHOD_IDS.VeloeraDailyCheckIn,
  AUTO_CHECKIN_METHOD_IDS.WongGongyiDailyCheckIn,
  AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn,
  AUTO_CHECKIN_METHOD_IDS.VoApiV2DailyCheckIn,
] as const satisfies readonly CheckInMethodId[]

const CHECK_IN_METHOD_ID_SET = new Set<string>(
  Object.values(AUTO_CHECKIN_METHOD_IDS),
)

/** Returns whether a persisted value names a registered check-in method. */
export function isCheckInMethodId(value: unknown): value is CheckInMethodId {
  return typeof value === "string" && CHECK_IN_METHOD_ID_SET.has(value)
}

interface AutoCheckinMethodDefinitionBase {
  readonly id: CheckInMethodId
  readonly siteTypes: readonly AccountSiteType[]
}

/**
 * Candidate support and pre-registry compatibility are separate decisions.
 * New methods participate in discovery without inheriting migration behavior.
 */
export type AutoCheckinMethodDefinition = AutoCheckinMethodDefinitionBase &
  (
    | {
        readonly legacy: true
        readonly newAccountCompatibility: boolean
      }
    | {
        readonly legacy: false
        readonly newAccountCompatibility: false
      }
  )

interface AutoCheckinMethodMetadata {
  readonly candidateSiteTypes: Partial<
    Record<CheckInMethodId, readonly AccountSiteType[]>
  >
  readonly legacySiteTypes: Partial<
    Record<CheckInMethodId, readonly AccountSiteType[]>
  >
  readonly newAccountCompatibilitySiteTypes: Partial<
    Record<CheckInMethodId, readonly AccountSiteType[]>
  >
}

/** Builds pure method projections without importing executable providers. */
export function createAutoCheckinMethodMetadata(
  definitions: readonly AutoCheckinMethodDefinition[],
  options: {
    readonly preRegistryMethodIds?: readonly CheckInMethodId[]
  } = {},
): AutoCheckinMethodMetadata {
  const candidateSiteTypes: AutoCheckinMethodMetadata["candidateSiteTypes"] = {}
  const legacySiteTypes: AutoCheckinMethodMetadata["legacySiteTypes"] = {}
  const newAccountCompatibilitySiteTypes: AutoCheckinMethodMetadata["newAccountCompatibilitySiteTypes"] =
    {}
  const methodIds = new Set<CheckInMethodId>()
  const legacyCounts = new Map<AccountSiteType, number>()
  const preRegistryMethodIds = options.preRegistryMethodIds
    ? new Set(options.preRegistryMethodIds)
    : null

  for (const definition of definitions) {
    const legacy = Boolean(definition.legacy)
    const newAccountCompatibility = Boolean(definition.newAccountCompatibility)
    if (!isCheckInMethodId(definition.id)) {
      throw new Error(
        `Auto check-in method ID is not declared in AUTO_CHECKIN_METHOD_IDS: ${definition.id}`,
      )
    }
    if (methodIds.has(definition.id)) {
      throw new Error(`Duplicate auto check-in method ID: ${definition.id}`)
    }
    if (definition.siteTypes.length === 0) {
      throw new Error(
        `Auto check-in method has no candidate site types: ${definition.id}`,
      )
    }
    if (newAccountCompatibility && !legacy) {
      throw new Error(
        `New-account compatibility requires legacy method metadata: ${definition.id}`,
      )
    }
    if (
      legacy &&
      preRegistryMethodIds &&
      !preRegistryMethodIds.has(definition.id)
    ) {
      throw new Error(
        `Legacy method metadata is reserved for pre-registry methods: ${definition.id}`,
      )
    }

    methodIds.add(definition.id)
    candidateSiteTypes[definition.id] = definition.siteTypes
    if (!legacy) continue

    legacySiteTypes[definition.id] = definition.siteTypes
    for (const siteType of definition.siteTypes) {
      legacyCounts.set(siteType, (legacyCounts.get(siteType) ?? 0) + 1)
    }
    if (newAccountCompatibility) {
      newAccountCompatibilitySiteTypes[definition.id] = definition.siteTypes
    }
  }

  for (const methodId of preRegistryMethodIds ?? []) {
    if (!legacySiteTypes[methodId]) {
      throw new Error(
        `Pre-registry auto check-in method is missing legacy metadata: ${methodId}`,
      )
    }
  }

  for (const [siteType, count] of legacyCounts) {
    if (count !== 1) {
      throw new Error(
        `Expected exactly one legacy auto check-in method for site type: ${siteType}; found ${count}`,
      )
    }
  }

  return {
    candidateSiteTypes,
    legacySiteTypes,
    newAccountCompatibilitySiteTypes,
  }
}

/** All method definitions, including post-registry discovery candidates. */
export const AUTO_CHECKIN_METHOD_DEFINITIONS = {
  [AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn]: {
    id: AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn,
    siteTypes: [SITE_TYPES.ANYROUTER],
    legacy: true,
    newAccountCompatibility: true,
  },
  [AUTO_CHECKIN_METHOD_IDS.VeloeraDailyCheckIn]: {
    id: AUTO_CHECKIN_METHOD_IDS.VeloeraDailyCheckIn,
    siteTypes: [SITE_TYPES.VELOERA],
    legacy: true,
    newAccountCompatibility: true,
  },
  [AUTO_CHECKIN_METHOD_IDS.WongGongyiDailyCheckIn]: {
    id: AUTO_CHECKIN_METHOD_IDS.WongGongyiDailyCheckIn,
    siteTypes: [SITE_TYPES.WONG_GONGYI],
    legacy: true,
    newAccountCompatibility: true,
  },
  [AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn]: {
    id: AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn,
    siteTypes: [SITE_TYPES.NEW_API, SITE_TYPES.MODELFLARE],
    legacy: true,
    newAccountCompatibility: true,
  },
  [AUTO_CHECKIN_METHOD_IDS.VoApiV2DailyCheckIn]: {
    id: AUTO_CHECKIN_METHOD_IDS.VoApiV2DailyCheckIn,
    siteTypes: [SITE_TYPES.VO_API_V2],
    legacy: true,
    newAccountCompatibility: true,
  },
  [AUTO_CHECKIN_METHOD_IDS.Sub2ApiProDailyCheckIn]: {
    id: AUTO_CHECKIN_METHOD_IDS.Sub2ApiProDailyCheckIn,
    siteTypes: [SITE_TYPES.SUB2API],
    legacy: false,
    newAccountCompatibility: false,
  },
} as const satisfies Record<CheckInMethodId, AutoCheckinMethodDefinition>

const AUTO_CHECKIN_METHOD_METADATA = createAutoCheckinMethodMetadata(
  Object.values(AUTO_CHECKIN_METHOD_DEFINITIONS),
  { preRegistryMethodIds: PRE_REGISTRY_AUTO_CHECKIN_METHOD_IDS },
)

/** Pure candidate metadata; safe for projections and migrations to import. */
const CHECK_IN_METHOD_SITE_TYPES =
  AUTO_CHECKIN_METHOD_METADATA.candidateSiteTypes

/** Methods whose V6 accounts may be migrated without running discovery. */
export const LEGACY_AUTO_CHECKIN_METHOD_SITE_TYPES =
  AUTO_CHECKIN_METHOD_METADATA.legacySiteTypes

/** Methods allowed to bridge an existing support result for a new account. */
const NEW_ACCOUNT_COMPATIBILITY_METHOD_SITE_TYPES =
  AUTO_CHECKIN_METHOD_METADATA.newAccountCompatibilitySiteTypes

const getMethodIdsForSiteType = (
  methodSiteTypes: Partial<Record<CheckInMethodId, readonly AccountSiteType[]>>,
  siteType: AccountSiteType,
): CheckInMethodId[] =>
  (
    Object.entries(methodSiteTypes) as Array<
      [CheckInMethodId, readonly AccountSiteType[]]
    >
  )
    .filter(([, siteTypes]) => siteTypes.includes(siteType))
    .map(([methodId]) => methodId)

/** Resolves candidate method IDs without importing executable provider modules. */
export function getAutoCheckinCandidateMethodIds(
  siteType: AccountSiteType,
): CheckInMethodId[] {
  return getMethodIdsForSiteType(CHECK_IN_METHOD_SITE_TYPES, siteType)
}

/** Resolves the pre-registry method IDs used by the V6 migration. */
export function getLegacyAutoCheckinMethodIds(
  siteType: AccountSiteType,
): CheckInMethodId[] {
  return getMethodIdsForSiteType(
    LEGACY_AUTO_CHECKIN_METHOD_SITE_TYPES,
    siteType,
  )
}

/** Resolves methods eligible for the temporary new-account support bridge. */
export function getNewAccountCompatibilityMethodIds(
  siteType: AccountSiteType,
): CheckInMethodId[] {
  return getMethodIdsForSiteType(
    NEW_ACCOUNT_COMPATIBILITY_METHOD_SITE_TYPES,
    siteType,
  )
}

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

export interface AutoCheckinMethodRegistration {
  readonly id: CheckInMethodId
  /** Static candidate filter only; never proof that a deployment supports the method. */
  readonly siteTypes: readonly AccountSiteType[]
  readonly provider: AutoCheckinProvider
  /** Existing-provider bridge used until a strict read-only probe is ready. */
  readonly compatibilityRegistration?: boolean
}

export interface AutoCheckinMethodRegistry {
  readonly registrations: readonly AutoCheckinMethodRegistration[]
  getCandidates(
    siteType: AccountSiteType,
  ): readonly AutoCheckinMethodRegistration[]
  /** Resolve executable code only when the ID is registered by this build. */
  resolveById(
    id: PersistedCheckInMethodId,
  ): AutoCheckinMethodRegistration | null
}

/**
 * Build and validate an ordered auto check-in method registry.
 */
export function createAutoCheckinMethodRegistry(
  registrations: readonly AutoCheckinMethodRegistration[],
): AutoCheckinMethodRegistry {
  const methodIds = new Set<CheckInMethodId>()
  for (const registration of registrations) {
    const registrationId = registration.id
    if (registration.siteTypes.length === 0) {
      throw new Error(
        `Auto check-in method has no candidate site types: ${registrationId}`,
      )
    }
    if (!isCheckInMethodId(registrationId)) {
      throw new Error(
        `Auto check-in method ID is not declared in AUTO_CHECKIN_METHOD_IDS: ${registrationId}`,
      )
    }
    if (methodIds.has(registrationId)) {
      throw new Error(`Duplicate auto check-in method ID: ${registrationId}`)
    }
    methodIds.add(registrationId)
  }

  return {
    registrations,
    getCandidates: (siteType) =>
      registrations.filter((registration) =>
        registration.siteTypes.includes(siteType),
      ),
    resolveById: (id) =>
      registrations.find((registration) => registration.id === id) ?? null,
  }
}

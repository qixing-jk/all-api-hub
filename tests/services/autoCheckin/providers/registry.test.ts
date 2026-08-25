import { describe, expect, it } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import { anyrouterProvider } from "~/services/checkin/autoCheckin/providers/anyrouter"
import { newApiProvider } from "~/services/checkin/autoCheckin/providers/newApi"
import {
  createAutoCheckinMethodMetadata,
  createAutoCheckinMethodRegistry,
  decodePersistedCheckInMethodId,
  getAutoCheckinCandidateMethodIds,
  getLegacyAutoCheckinMethodIds,
  getNewAccountCompatibilityMethodIds,
} from "~/services/checkin/autoCheckin/providers/registry"
import type {
  AutoCheckinMethodDefinition,
  AutoCheckinMethodRegistration,
} from "~/services/checkin/autoCheckin/providers/registry"
import { sub2ApiProvider } from "~/services/checkin/autoCheckin/providers/sub2api"
import { veloeraProvider } from "~/services/checkin/autoCheckin/providers/veloera"
import { voApiV2Provider } from "~/services/checkin/autoCheckin/providers/voapiV2"
import { wongGongyiProvider } from "~/services/checkin/autoCheckin/providers/wong"
import type { CheckInMethodId } from "~/types/checkIn"

const registrationFor = (
  id: CheckInMethodId,
): AutoCheckinMethodRegistration => {
  const registration = autoCheckinMethodRegistry.resolveById(id)
  if (!registration) {
    throw new Error(`Missing test registration: ${id}`)
  }
  return registration
}

const getAnyrouterRegistration = () =>
  registrationFor(AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn)

describe("autoCheckinMethodRegistry", () => {
  it("registers stable identities without changing legacy method mapping", () => {
    const registrationContracts = autoCheckinMethodRegistry.registrations.map(
      ({ id, siteTypes, provider }) => ({
        id,
        candidateSiteTypes: siteTypes,
        provider,
      }),
    )

    expect(registrationContracts).toHaveLength(6)
    expect(registrationContracts).toEqual(
      expect.arrayContaining([
        {
          id: "anyrouter:daily-checkin",
          candidateSiteTypes: [SITE_TYPES.ANYROUTER],
          provider: anyrouterProvider,
        },
        {
          id: "veloera:daily-checkin",
          candidateSiteTypes: [SITE_TYPES.VELOERA],
          provider: veloeraProvider,
        },
        {
          id: "wong-gongyi:daily-checkin",
          candidateSiteTypes: [SITE_TYPES.WONG_GONGYI],
          provider: wongGongyiProvider,
        },
        {
          id: "new-api:daily-checkin",
          candidateSiteTypes: [SITE_TYPES.NEW_API, SITE_TYPES.MODELFLARE],
          provider: newApiProvider,
        },
        {
          id: "voapi-v2:daily-checkin",
          candidateSiteTypes: [SITE_TYPES.VO_API_V2],
          provider: voApiV2Provider,
        },
        {
          id: "sub2api-pro:daily-checkin",
          candidateSiteTypes: [SITE_TYPES.SUB2API],
          provider: sub2ApiProvider,
        },
      ]),
    )

    expect(getLegacyAutoCheckinMethodIds(SITE_TYPES.NEW_API)).toEqual([
      AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn,
    ])
    expect(getLegacyAutoCheckinMethodIds(SITE_TYPES.ONE_API)).toEqual([])
  })

  it("exposes only safe read-only status operations", () => {
    expect(anyrouterProvider.getStatus).toBeUndefined()
    expect(anyrouterProvider.detect).toBeUndefined()
    expect(newApiProvider.getStatus).toBeTypeOf("function")
    expect(newApiProvider.detect).toBeTypeOf("function")
    expect(veloeraProvider.getStatus).toBeTypeOf("function")
    expect(veloeraProvider.detect).toBeTypeOf("function")
    expect(wongGongyiProvider.getStatus).toBeTypeOf("function")
    expect(wongGongyiProvider.detect).toBeTypeOf("function")
    expect(voApiV2Provider.getStatus).toBeTypeOf("function")
    expect(voApiV2Provider.detect).toBeTypeOf("function")
  })

  it("keeps newly introduced candidates outside legacy and new-account compatibility", () => {
    const metadata = createAutoCheckinMethodMetadata([
      {
        id: AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn,
        siteTypes: [SITE_TYPES.NEW_API],
        legacy: true,
        newAccountCompatibility: true,
      },
      {
        id: AUTO_CHECKIN_METHOD_IDS.VeloeraDailyCheckIn,
        siteTypes: [SITE_TYPES.NEW_API],
        legacy: false,
        newAccountCompatibility: false,
      },
    ])

    expect(metadata.candidateSiteTypes).toEqual({
      [AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn]: [SITE_TYPES.NEW_API],
      [AUTO_CHECKIN_METHOD_IDS.VeloeraDailyCheckIn]: [SITE_TYPES.NEW_API],
    })
    expect(metadata.legacySiteTypes).toEqual({
      [AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn]: [SITE_TYPES.NEW_API],
    })
    expect(metadata.newAccountCompatibilitySiteTypes).toEqual({
      [AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn]: [SITE_TYPES.NEW_API],
    })
  })

  it("enumerates every candidate in declaration order and resolves execution by ID", () => {
    const anyrouterRegistration = getAnyrouterRegistration()
    const veloeraRegistration = registrationFor(
      AUTO_CHECKIN_METHOD_IDS.VeloeraDailyCheckIn,
    )
    const registry = createAutoCheckinMethodRegistry([
      {
        id: anyrouterRegistration.id,
        siteTypes: [SITE_TYPES.NEW_API],
        provider: anyrouterRegistration.provider,
      },
      {
        id: veloeraRegistration.id,
        siteTypes: [SITE_TYPES.NEW_API],
        provider: veloeraRegistration.provider,
      },
    ])

    expect(
      registry
        .getCandidates(SITE_TYPES.NEW_API)
        .map((registration) => registration.id),
    ).toEqual([
      AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn,
      AUTO_CHECKIN_METHOD_IDS.VeloeraDailyCheckIn,
    ])
    expect(
      registry.resolveById(AUTO_CHECKIN_METHOD_IDS.VeloeraDailyCheckIn),
    ).toMatchObject({ provider: veloeraProvider })
  })

  it("enumerates only pre-existing providers through the new-account compatibility bridge", () => {
    expect(getNewAccountCompatibilityMethodIds(SITE_TYPES.ANYROUTER)).toEqual([
      "anyrouter:daily-checkin",
    ])
    expect(getNewAccountCompatibilityMethodIds(SITE_TYPES.SUB2API)).toEqual([])
  })

  it("registers Sub2API as a discovery-only candidate without a legacy bridge", () => {
    expect(getAutoCheckinCandidateMethodIds(SITE_TYPES.SUB2API)).toEqual([
      AUTO_CHECKIN_METHOD_IDS.Sub2ApiProDailyCheckIn,
    ])
    expect(getLegacyAutoCheckinMethodIds(SITE_TYPES.SUB2API)).toEqual([])
    expect(getNewAccountCompatibilityMethodIds(SITE_TYPES.SUB2API)).toEqual([])
    const registration = registrationFor(
      AUTO_CHECKIN_METHOD_IDS.Sub2ApiProDailyCheckIn,
    )
    expect(registration.compatibilityRegistration).toBe(false)
    expect(sub2ApiProvider.getStatus).toBeTypeOf("function")
    expect(sub2ApiProvider.detect).toBeTypeOf("function")
  })

  it("rejects duplicate method IDs deterministically", () => {
    const registration = getAnyrouterRegistration()

    expect(() =>
      createAutoCheckinMethodRegistry([registration, registration]),
    ).toThrowError(
      `Duplicate auto check-in method ID: ${AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn}`,
    )
  })

  it("rejects registrations without candidate Account Site Types", () => {
    const registration = getAnyrouterRegistration()

    expect(() =>
      createAutoCheckinMethodRegistry([
        {
          ...registration,
          siteTypes: [],
        },
      ]),
    ).toThrowError(
      `Auto check-in method has no candidate site types: ${registration.id}`,
    )
  })

  it("limits new-account compatibility metadata to legacy definitions", () => {
    expect(() =>
      createAutoCheckinMethodMetadata([
        {
          id: AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn,
          siteTypes: [SITE_TYPES.ANYROUTER],
          legacy: false,
          newAccountCompatibility: true,
        } as unknown as AutoCheckinMethodDefinition,
      ]),
    ).toThrowError(
      `New-account compatibility requires legacy method metadata: ${AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn}`,
    )
  })

  it("reserves legacy metadata for the frozen pre-registry method set", () => {
    expect(() =>
      createAutoCheckinMethodMetadata(
        [
          {
            id: AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn,
            siteTypes: [SITE_TYPES.ANYROUTER],
            legacy: true,
            newAccountCompatibility: true,
          },
          {
            id: AUTO_CHECKIN_METHOD_IDS.VeloeraDailyCheckIn,
            siteTypes: [SITE_TYPES.VELOERA],
            legacy: true,
            newAccountCompatibility: true,
          },
        ],
        {
          preRegistryMethodIds: [AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn],
        },
      ),
    ).toThrowError(
      `Legacy method metadata is reserved for pre-registry methods: ${AUTO_CHECKIN_METHOD_IDS.VeloeraDailyCheckIn}`,
    )
  })

  it("requires every frozen pre-registry method to keep legacy metadata", () => {
    expect(() =>
      createAutoCheckinMethodMetadata(
        [
          {
            id: AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn,
            siteTypes: [SITE_TYPES.ANYROUTER],
            legacy: false,
            newAccountCompatibility: false,
          },
        ],
        {
          preRegistryMethodIds: [AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn],
        },
      ),
    ).toThrowError(
      `Pre-registry auto check-in method is missing legacy metadata: ${AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn}`,
    )
  })

  it("requires exactly one legacy method for each compatibility site type", () => {
    expect(() =>
      createAutoCheckinMethodMetadata([
        {
          id: AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn,
          siteTypes: [SITE_TYPES.NEW_API],
          legacy: true,
          newAccountCompatibility: true,
        },
        {
          id: AUTO_CHECKIN_METHOD_IDS.VeloeraDailyCheckIn,
          siteTypes: [SITE_TYPES.NEW_API],
          legacy: true,
          newAccountCompatibility: true,
        },
      ]),
    ).toThrowError(
      `Expected exactly one legacy auto check-in method for site type: ${SITE_TYPES.NEW_API}; found 2`,
    )
  })

  it("round-trips safe unknown persisted IDs without making them executable", () => {
    const unknownId = decodePersistedCheckInMethodId(
      "future-protocol:daily-checkin",
    )

    expect(unknownId).toBe("future-protocol:daily-checkin")
    expect(autoCheckinMethodRegistry.resolveById(unknownId!)).toBeNull()
    expect(
      autoCheckinMethodRegistry.resolveById(
        decodePersistedCheckInMethodId("new-api:daily-checkin")!,
      )?.provider,
    ).toBe(newApiProvider)
    expect(decodePersistedCheckInMethodId("__proto__")).toBeNull()
    expect(decodePersistedCheckInMethodId("not-namespaced")).toBeNull()
    expect(decodePersistedCheckInMethodId("Future:daily-checkin")).toBeNull()
    expect(
      decodePersistedCheckInMethodId(`future:${"a".repeat(122)}`),
    ).toBeNull()
  })
})

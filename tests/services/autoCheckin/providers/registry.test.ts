import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  AUTO_CHECKIN_METHOD_IDS,
  autoCheckinMethodRegistry,
  createAutoCheckinMethodRegistry,
  decodePersistedCheckInMethodId,
  resolveAutoCheckinProvider,
  type AutoCheckinMethodRegistration,
} from "~/services/checkin/autoCheckin/providers"
import { anyrouterProvider } from "~/services/checkin/autoCheckin/providers/anyrouter"
import { newApiProvider } from "~/services/checkin/autoCheckin/providers/newApi"
import { veloeraProvider } from "~/services/checkin/autoCheckin/providers/veloera"
import { voApiV2Provider } from "~/services/checkin/autoCheckin/providers/voapiV2"
import { wongGongyiProvider } from "~/services/checkin/autoCheckin/providers/wong"
import type { SiteAccount } from "~/types"

const accountFor = (siteType: SiteAccount["site_type"]) =>
  ({
    id: `account-${siteType}`,
    site_url: "https://example.invalid",
    site_type: siteType,
  }) as SiteAccount

describe("autoCheckinMethodRegistry", () => {
  it("registers stable identities without changing legacy provider resolution", () => {
    const registrationContracts = autoCheckinMethodRegistry.registrations.map(
      ({ id, siteTypes, legacy, newAccountCompatibility, provider }) => ({
        id,
        candidateSiteTypes: siteTypes,
        legacySiteTypes: legacy?.siteTypes,
        compatibilitySiteTypes: newAccountCompatibility?.siteTypes,
        provider,
      }),
    )

    expect(registrationContracts).toHaveLength(5)
    expect(registrationContracts).toEqual(
      expect.arrayContaining([
        {
          id: "anyrouter:daily-checkin",
          candidateSiteTypes: [SITE_TYPES.ANYROUTER],
          legacySiteTypes: [SITE_TYPES.ANYROUTER],
          compatibilitySiteTypes: [SITE_TYPES.ANYROUTER],
          provider: anyrouterProvider,
        },
        {
          id: "veloera:daily-checkin",
          candidateSiteTypes: [SITE_TYPES.VELOERA],
          legacySiteTypes: [SITE_TYPES.VELOERA],
          compatibilitySiteTypes: [SITE_TYPES.VELOERA],
          provider: veloeraProvider,
        },
        {
          id: "wong-gongyi:daily-checkin",
          candidateSiteTypes: [SITE_TYPES.WONG_GONGYI],
          legacySiteTypes: [SITE_TYPES.WONG_GONGYI],
          compatibilitySiteTypes: [SITE_TYPES.WONG_GONGYI],
          provider: wongGongyiProvider,
        },
        {
          id: "new-api:daily-checkin",
          candidateSiteTypes: [SITE_TYPES.NEW_API, SITE_TYPES.MODELFLARE],
          legacySiteTypes: [SITE_TYPES.NEW_API, SITE_TYPES.MODELFLARE],
          compatibilitySiteTypes: [
            SITE_TYPES.NEW_API,
            SITE_TYPES.MODELFLARE,
          ],
          provider: newApiProvider,
        },
        {
          id: "voapi-v2:daily-checkin",
          candidateSiteTypes: [SITE_TYPES.VO_API_V2],
          legacySiteTypes: [SITE_TYPES.VO_API_V2],
          compatibilitySiteTypes: [SITE_TYPES.VO_API_V2],
          provider: voApiV2Provider,
        },
      ]),
    )

    expect(resolveAutoCheckinProvider(accountFor(SITE_TYPES.ANYROUTER))).toBe(
      anyrouterProvider,
    )
    expect(resolveAutoCheckinProvider(accountFor(SITE_TYPES.VELOERA))).toBe(
      veloeraProvider,
    )
    expect(resolveAutoCheckinProvider(accountFor(SITE_TYPES.WONG_GONGYI))).toBe(
      wongGongyiProvider,
    )
    expect(resolveAutoCheckinProvider(accountFor(SITE_TYPES.NEW_API))).toBe(
      newApiProvider,
    )
    expect(resolveAutoCheckinProvider(accountFor(SITE_TYPES.MODELFLARE))).toBe(
      newApiProvider,
    )
    expect(resolveAutoCheckinProvider(accountFor(SITE_TYPES.VO_API_V2))).toBe(
      voApiV2Provider,
    )
    expect(
      resolveAutoCheckinProvider(accountFor(SITE_TYPES.ONE_API)),
    ).toBeNull()
  })

  it("enumerates every candidate in declaration order and resolves execution by ID", () => {
    const [anyrouterRegistration, veloeraRegistration] =
      autoCheckinMethodRegistry.registrations
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
    expect(
      autoCheckinMethodRegistry
        .getNewAccountCompatibleRegistrations(SITE_TYPES.ANYROUTER)
        .map(({ id }) => id),
    ).toEqual(["anyrouter:daily-checkin"])
    expect(
      autoCheckinMethodRegistry.getNewAccountCompatibleRegistrations(
        SITE_TYPES.SUB2API,
      ),
    ).toEqual([])
  })

  it("rejects duplicate method IDs deterministically", () => {
    const [registration] = autoCheckinMethodRegistry.registrations

    expect(() =>
      createAutoCheckinMethodRegistry([registration, registration]),
    ).toThrowError(
      `Duplicate auto check-in method ID: ${AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn}`,
    )
  })

  it("rejects registrations without candidate Account Site Types", () => {
    const [registration] = autoCheckinMethodRegistry.registrations

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

  it("rejects incomplete legacy provider coverage", () => {
    const [registration] = autoCheckinMethodRegistry.registrations

    expect(() =>
      createAutoCheckinMethodRegistry([registration], {
        requiredLegacySiteTypes: [SITE_TYPES.ANYROUTER, SITE_TYPES.VELOERA],
      }),
    ).toThrowError(
      "Expected exactly one legacy auto check-in provider for site type: Veloera; found 0",
    )
  })

  it("limits new-account compatibility metadata to legacy providers", () => {
    const [registration] = autoCheckinMethodRegistry.registrations

    expect(() =>
      createAutoCheckinMethodRegistry([
        {
          ...registration,
          legacy: undefined,
        } as unknown as AutoCheckinMethodRegistration,
      ]),
    ).toThrowError(
      `New-account compatibility requires legacy provider metadata: ${registration.id}`,
    )
  })

  it("does not admit a new method through compatibility metadata", () => {
    const [registration] = autoCheckinMethodRegistry.registrations

    expect(() =>
      createAutoCheckinMethodRegistry([
        {
          ...registration,
          id: "future-protocol:daily-checkin",
        } as unknown as AutoCheckinMethodRegistration,
      ]),
    ).toThrowError(
      "Legacy and new-account compatibility metadata are reserved for pre-registry methods: future-protocol:daily-checkin",
    )
  })

  it("does not let compatibility metadata expand legacy provider behavior", () => {
    const [registration] = autoCheckinMethodRegistry.registrations

    expect(() =>
      createAutoCheckinMethodRegistry([
        {
          ...registration,
          siteTypes: [SITE_TYPES.ANYROUTER, SITE_TYPES.NEW_API],
          newAccountCompatibility: { siteTypes: [SITE_TYPES.NEW_API] },
        } as AutoCheckinMethodRegistration,
      ]),
    ).toThrowError(
      `New-account compatibility site type is not covered by legacy behavior: ${registration.id} -> ${SITE_TYPES.NEW_API}`,
    )
  })

  it("requires legacy metadata to refer to declared candidates", () => {
    const [registration] = autoCheckinMethodRegistry.registrations

    expect(() =>
      createAutoCheckinMethodRegistry([
        {
          ...registration,
          siteTypes: [SITE_TYPES.NEW_API],
        },
      ]),
    ).toThrowError(
      `Legacy site type is not a candidate for auto check-in method: ${registration.id} -> ${SITE_TYPES.ANYROUTER}`,
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

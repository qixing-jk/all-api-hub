import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  buildLegacyKeyResourceCardPresentation,
  isKeyResourceBatchSelectable,
  isKeyResourceExportable,
} from "~/features/KeyManagement/presentation/legacyKeyResourceCard"
import {
  buildDisplayAccountTokenRuntimeKey,
  type AccountTokenRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import {
  createAccount,
  createToken,
} from "~~/tests/utils/keyManagementFactories"

const t = ((key: string) => key) as TFunction

describe("buildLegacyKeyResourceCardPresentation", () => {
  it("keeps group and usage prominent while placing creation after last use", () => {
    const runtimeKey = buildDisplayAccountTokenRuntimeKey(
      createAccount({ siteType: SITE_TYPES.NEW_API }),
      createToken({
        group: "default",
        note: "note",
        model_limits_enabled: false,
        model_limits: "ignored-model",
        models: "model-c",
        allow_ips: "192.0.2.10",
        accessed_time: 1700000000,
      }),
    )

    const presentation = buildLegacyKeyResourceCardPresentation(runtimeKey, t)

    expect(presentation.summaryFacts.map(({ id }) => id)).toEqual([
      "group",
      "used-quota",
      "remaining-quota",
      "expires-at",
    ])
    expect(presentation.contextFact).toEqual(presentation.summaryFacts[0])
    expect(presentation.detailFacts.map(({ id }) => id)).toEqual([
      "quota-policy",
      "last-used-at",
      "created-at",
      "note",
      "models",
      "ip-limits",
    ])
    expect(
      presentation.detailFacts.find(({ id }) => id === "quota-policy")?.value,
    ).toBe("keyManagement:keyDetails.limitedQuota")
    expect(
      presentation.detailFacts.find(({ id }) => id === "models")?.label,
    ).toBe("keyManagement:keyDetails.models")
    expect(
      presentation.detailFacts.find(({ id }) => id === "ip-limits")?.label,
    ).toBe("keyManagement:keyDetails.ipLimits")
    expect(
      presentation.detailFacts.find(({ id }) => id === "models")?.value,
    ).toBe("model-c")
    expect(presentation.statusLabel).toBe("common:status.enabled")
    expect(presentation.actions).toMatchObject({
      copySecret: true,
      revealSecret: true,
      verifySecret: true,
      exportSecret: true,
      edit: true,
      delete: true,
      batchSelect: true,
    })
    expect(presentation.maskedLabel).not.toContain(runtimeKey.secret)
    expect(isKeyResourceBatchSelectable(runtimeKey)).toBe(true)
    expect(isKeyResourceExportable(runtimeKey)).toBe(true)
  })

  it("keeps AIHubMix metadata and mutations but removes stored-secret actions", () => {
    const runtimeKey = buildDisplayAccountTokenRuntimeKey(
      createAccount({ siteType: SITE_TYPES.AIHUBMIX }),
      createToken({ models: "model-a", allow_ips: "*" }),
    )

    const presentation = buildLegacyKeyResourceCardPresentation(runtimeKey, t)

    expect(presentation.detailFacts.map(({ id }) => id)).toEqual([
      "quota-policy",
      "created-at",
      "models",
      "ip-limits",
    ])
    expect(presentation.summaryFacts.map(({ id }) => id)).toEqual([
      "used-quota",
      "remaining-quota",
      "expires-at",
    ])
    expect(presentation.contextFact).toBeUndefined()
    expect(presentation.secretAvailabilityMessage).toBe(
      "keyManagement:keyDetails.createResponseOnlySecret",
    )
    expect(presentation.actions).toEqual({
      copySecret: false,
      revealSecret: false,
      verifySecret: false,
      exportSecret: false,
      edit: true,
      delete: true,
      batchSelect: false,
    })
    expect(isKeyResourceBatchSelectable(runtimeKey)).toBe(false)
    expect(isKeyResourceExportable(runtimeKey)).toBe(false)
  })

  it("prefers explicit model limits when the token enables them", () => {
    const presentation = buildLegacyKeyResourceCardPresentation(
      buildDisplayAccountTokenRuntimeKey(
        createAccount({ siteType: SITE_TYPES.NEW_API }),
        createToken({
          model_limits_enabled: true,
          model_limits: "model-limited",
          models: "model-default",
        }),
      ),
      t,
    )

    expect(
      presentation.detailFacts.find(({ id }) => id === "models")?.value,
    ).toBe("model-limited")
  })

  it("omits blank optional metadata without dropping required safe facts", () => {
    const presentation = buildLegacyKeyResourceCardPresentation(
      buildDisplayAccountTokenRuntimeKey(
        createAccount({ siteType: SITE_TYPES.AIHUBMIX }),
        createToken({ models: "", allow_ips: "" }),
      ),
      t,
    )

    expect(presentation.detailFacts.map(({ id }) => id)).toEqual([
      "quota-policy",
      "created-at",
    ])
  })

  it.each([
    SITE_TYPES.NEW_API,
    SITE_TYPES.VELOERA,
    SITE_TYPES.ANYROUTER,
    SITE_TYPES.RIX_API,
  ])("shows an empty %s group as following the account group", (siteType) => {
    const presentation = buildLegacyKeyResourceCardPresentation(
      buildDisplayAccountTokenRuntimeKey(
        createAccount({ siteType }),
        createToken({ group: "" }),
      ),
      t,
    )

    expect(presentation.summaryFacts.find(({ id }) => id === "group")).toEqual({
      id: "group",
      label: "keyManagement:keyDetails.group",
      value: "keyManagement:keyDetails.followsAccountGroup",
    })
    expect(presentation.detailFacts.some(({ id }) => id === "group")).toBe(
      false,
    )
  })

  it("distinguishes an ungrouped Sub2API key from an unavailable group name", () => {
    const ungrouped = buildLegacyKeyResourceCardPresentation(
      buildDisplayAccountTokenRuntimeKey(
        createAccount({ siteType: SITE_TYPES.SUB2API }),
        createToken({ group: "", sub2api_group_id: undefined }),
      ),
      t,
    )
    const unavailable = buildLegacyKeyResourceCardPresentation(
      buildDisplayAccountTokenRuntimeKey(
        createAccount({ siteType: SITE_TYPES.SUB2API }),
        createToken({ group: "", sub2api_group_id: 42 }),
      ),
      t,
    )

    expect(ungrouped.summaryFacts.find(({ id }) => id === "group")?.value).toBe(
      "keyManagement:keyDetails.ungrouped",
    )
    expect(
      unavailable.summaryFacts.find(({ id }) => id === "group")?.value,
    ).toBe("common:labels.notAvailable")
  })

  it("shows a missing VoAPI v2 group as unavailable", () => {
    const presentation = buildLegacyKeyResourceCardPresentation(
      buildDisplayAccountTokenRuntimeKey(
        createAccount({ siteType: SITE_TYPES.VO_API_V2 }),
        createToken({ group: "" }),
      ),
      t,
    )

    expect(
      presentation.summaryFacts.find(({ id }) => id === "group")?.value,
    ).toBe("common:labels.notAvailable")
  })

  it.each([SITE_TYPES.ONE_API, SITE_TYPES.AIHUBMIX])(
    "suppresses key-level group metadata for %s",
    (siteType) => {
      const presentation = buildLegacyKeyResourceCardPresentation(
        buildDisplayAccountTokenRuntimeKey(
          createAccount({ siteType }),
          createToken({ group: "fixture-only" }),
        ),
        t,
      )

      expect(presentation.summaryFacts.some(({ id }) => id === "group")).toBe(
        false,
      )
      expect(presentation.detailFacts.some(({ id }) => id === "group")).toBe(
        false,
      )
    },
  )

  it.each([
    SITE_TYPES.ONE_HUB,
    SITE_TYPES.DONE_HUB,
    SITE_TYPES.V_API,
    SITE_TYPES.VO_API,
    SITE_TYPES.SUPER_API,
    SITE_TYPES.NEO_API,
    SITE_TYPES.WONG_GONGYI,
    SITE_TYPES.UNKNOWN,
  ])("shows an empty %s group as following the account group", (siteType) => {
    const presentation = buildLegacyKeyResourceCardPresentation(
      buildDisplayAccountTokenRuntimeKey(
        createAccount({ siteType }),
        createToken({ group: "" }),
      ),
      t,
    )

    expect(
      presentation.summaryFacts.find(({ id }) => id === "group")?.value,
    ).toBe("keyManagement:keyDetails.followsAccountGroup")
  })

  it.each([
    SITE_TYPES.ONE_HUB,
    SITE_TYPES.DONE_HUB,
    SITE_TYPES.V_API,
    SITE_TYPES.VO_API,
    SITE_TYPES.SUPER_API,
    SITE_TYPES.NEO_API,
    SITE_TYPES.WONG_GONGYI,
    SITE_TYPES.UNKNOWN,
  ])(
    "shows a named %s group in the summary without duplication",
    (siteType) => {
      const presentation = buildLegacyKeyResourceCardPresentation(
        buildDisplayAccountTokenRuntimeKey(
          createAccount({ siteType }),
          createToken({ group: "  provider-group  " }),
        ),
        t,
      )

      expect(
        presentation.summaryFacts.find(({ id }) => id === "group"),
      ).toEqual({
        id: "group",
        label: "keyManagement:keyDetails.group",
        value: "provider-group",
      })
      expect(presentation.detailFacts.some(({ id }) => id === "group")).toBe(
        false,
      )
    },
  )

  it("presents unlimited quota as a policy instead of remaining quota", () => {
    const presentation = buildLegacyKeyResourceCardPresentation(
      buildDisplayAccountTokenRuntimeKey(
        createAccount({ siteType: SITE_TYPES.NEW_API }),
        createToken({ unlimited_quota: true, remain_quota: 123456 }),
      ),
      t,
    )

    expect(
      presentation.detailFacts.find(({ id }) => id === "quota-policy")?.value,
    ).toBe("keyManagement:dialog.unlimitedQuota")
  })

  it("keeps negative remaining quota consistent without making used quota unlimited", () => {
    const presentation = buildLegacyKeyResourceCardPresentation(
      buildDisplayAccountTokenRuntimeKey(
        createAccount({ siteType: SITE_TYPES.NEW_API }),
        createToken({
          remain_quota: -1,
          unlimited_quota: false,
          used_quota: -1,
        }),
      ),
      t,
    )

    expect(
      presentation.detailFacts.find(({ id }) => id === "quota-policy")?.value,
    ).toBe("keyManagement:dialog.unlimitedQuota")
    expect(
      presentation.summaryFacts.find(({ id }) => id === "remaining-quota")
        ?.value,
    ).toBe("keyManagement:dialog.unlimitedQuota")
    expect(
      presentation.summaryFacts.find(({ id }) => id === "used-quota")?.value,
    ).not.toBe("keyManagement:dialog.unlimitedQuota")
  })

  it("uses current-state labels for active, inactive, and unknown keys", () => {
    const account = createAccount({ siteType: SITE_TYPES.NEW_API })

    expect(
      buildLegacyKeyResourceCardPresentation(
        buildDisplayAccountTokenRuntimeKey(account, createToken({ status: 1 })),
        t,
      ).statusLabel,
    ).toBe("common:status.enabled")
    expect(
      buildLegacyKeyResourceCardPresentation(
        buildDisplayAccountTokenRuntimeKey(account, createToken({ status: 2 })),
        t,
      ).statusLabel,
    ).toBe("common:status.disabled")
    expect(
      buildLegacyKeyResourceCardPresentation(
        buildDisplayAccountTokenRuntimeKey(account, createToken({ status: 3 })),
        t,
      ).statusLabel,
    ).toBe("common:labels.unknown")
  })

  it("uses metadata fallbacks for creation and last-used timestamps", () => {
    const presentation = buildLegacyKeyResourceCardPresentation(
      buildDisplayAccountTokenRuntimeKey(
        createAccount({ siteType: SITE_TYPES.NEW_API }),
        createToken({ created_time: 0, accessed_time: 1700000000 }),
      ),
      t,
    )

    expect(
      presentation.detailFacts.find(({ id }) => id === "created-at")?.value,
    ).toBe("common:labels.notAvailable")
    expect(
      presentation.detailFacts.find(({ id }) => id === "last-used-at")?.value,
    ).not.toBe("keyManagement:keyDetails.neverExpires")
  })

  it("does not grant stored-secret actions when key management is unavailable", () => {
    const runtimeKey = {
      ...buildDisplayAccountTokenRuntimeKey(
        createAccount({ siteType: SITE_TYPES.NEW_API }),
        createToken({}),
      ),
      siteType: "unknown-site-type",
    } as unknown as AccountTokenRuntimeKey

    const presentation = buildLegacyKeyResourceCardPresentation(runtimeKey, t)

    expect(presentation.actions).toMatchObject({
      copySecret: false,
      revealSecret: false,
      verifySecret: false,
      exportSecret: false,
      edit: true,
      delete: true,
      batchSelect: false,
    })
    expect(presentation.secretAvailabilityMessage).toBe(
      "keyManagement:keyDetails.secretUnavailable",
    )
  })
})

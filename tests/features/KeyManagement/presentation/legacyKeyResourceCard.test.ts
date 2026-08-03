import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  buildLegacyKeyResourceCardPresentation,
  isKeyResourceBatchSelectable,
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
  it("keeps recoverable legacy actions and limits the summary to four facts", () => {
    const runtimeKey = buildDisplayAccountTokenRuntimeKey(
      createAccount({ siteType: SITE_TYPES.NEW_API }),
      createToken({
        group: "default",
        note: "note",
        model_limits_enabled: false,
        model_limits: "ignored-model",
        models: "model-c",
        allow_ips: "192.0.2.10",
      }),
    )

    const presentation = buildLegacyKeyResourceCardPresentation(runtimeKey, t)

    expect(presentation.summaryFacts.map(({ id }) => id)).toEqual([
      "remaining-quota",
      "used-quota",
      "expires-at",
    ])
    expect(presentation.detailFacts.map(({ id }) => id)).toEqual([
      "created-at",
      "quota-policy",
      "note",
      "group",
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
  })

  it("keeps AIHubMix metadata and mutations but removes stored-secret actions", () => {
    const runtimeKey = buildDisplayAccountTokenRuntimeKey(
      createAccount({ siteType: SITE_TYPES.AIHUBMIX }),
      createToken({ group: "vip", models: "model-a", allow_ips: "*" }),
    )

    const presentation = buildLegacyKeyResourceCardPresentation(runtimeKey, t)

    expect(presentation.detailFacts.map(({ id }) => id)).toEqual([
      "created-at",
      "quota-policy",
      "group",
      "models",
      "ip-limits",
    ])
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
  })

  it("omits blank optional metadata without dropping required safe facts", () => {
    const presentation = buildLegacyKeyResourceCardPresentation(
      buildDisplayAccountTokenRuntimeKey(
        createAccount({ siteType: SITE_TYPES.AIHUBMIX }),
        createToken({ group: "", models: "", allow_ips: "" }),
      ),
      t,
    )

    expect(presentation.detailFacts.map(({ id }) => id)).toEqual([
      "created-at",
      "quota-policy",
    ])
  })

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

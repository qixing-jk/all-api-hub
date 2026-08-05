import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  collectManagedConfigSecrets,
  collectManagedResourceSecrets,
  getManagedSiteAdminConfigForType,
  getManagedSiteConfigMissingMessage,
  getManagedSiteContext,
  getManagedSiteLabelKey,
  getManagedSiteMessagesKeyFromSiteType,
  getManagedSiteNoChannelsToSyncMessage,
  getManagedSiteTargetOptions,
  hasUsableManagedSiteChannelKey,
  mergeManagedResourceSecretCollections,
  needsManagedSiteChannelKeyResolution,
  supportsManagedSiteBaseUrlChannelLookup,
} from "~/services/managedSites/utils/managedSite"

const translate = (key: string) => key

describe("managedSite utils", () => {
  it("merges secret collections immutably with dedupe and incomplete dominance", () => {
    const first = Object.freeze({
      knownSecrets: Object.freeze(["secret-a", "secret-b"]),
      complete: true,
    })
    const second = Object.freeze({
      knownSecrets: Object.freeze(["secret-b", "secret-c"]),
      complete: false,
    })

    const merged = mergeManagedResourceSecretCollections(first, second)

    expect(merged).toEqual({
      knownSecrets: ["secret-a", "secret-b", "secret-c"],
      complete: false,
    })
    expect(Object.isFrozen(merged)).toBe(true)
    expect(Object.isFrozen(merged.knownSecrets)).toBe(true)
    expect(first.knownSecrets).toEqual(["secret-a", "secret-b"])
    expect(second.knownSecrets).toEqual(["secret-b", "secret-c"])
  })

  it("collects provider secrets from each runtime config shape", () => {
    expect(
      collectManagedConfigSecrets({
        baseUrl: "https://new-api.example.com",
        adminToken: "admin-token",
        userId: "1",
      }),
    ).toEqual(["admin-token"])
    expect(
      collectManagedConfigSecrets({
        baseUrl: "https://octopus.example.com",
        username: "admin",
        password: "octopus-password",
      }),
    ).toEqual(["octopus-password"])
    expect(
      collectManagedConfigSecrets({
        baseUrl: "https://token-config.example.com",
        token: "runtime-token",
        userId: "1",
      } as any),
    ).toEqual(["runtime-token"])
    expect(
      collectManagedConfigSecrets({
        baseUrl: "https://mixed-config.example.com",
        token: "runtime-token",
        adminToken: "admin-token",
        userId: "1",
      } as any),
    ).toEqual(["runtime-token", "admin-token"])
  })

  it("collects preserved Octopus header proxy and parameter override values", () => {
    const headerValue = "octopus-header-secret-placeholder"
    const channelProxy = "http://proxy-user:proxy-pass@example.invalid:8080"
    const paramOverride = '{"api_key":"octopus-param-secret-placeholder"}'

    const collection = collectManagedResourceSecrets({
      custom_header: [
        { header_key: "X-Example-Key", header_value: headerValue },
      ],
      channel_proxy: channelProxy,
      param_override: paramOverride,
    })

    expect(collection.knownSecrets).toEqual(
      expect.arrayContaining([headerValue, channelProxy, paramOverride]),
    )
    expect(collection.complete).toBe(true)
  })

  it("collects Axon header and body override operation values only in their operation collections", () => {
    const headerOverrideValue = "axon-header-secret-placeholder"
    const bodyOverrideValue = "axon-body-secret-placeholder"
    const publicDisplayValue = "public-display-value"

    const collection = collectManagedResourceSecrets({
      settings: {
        headerOverrideOperations: [
          { op: "set", path: "/X-Example-Key", value: headerOverrideValue },
        ],
        bodyOverrideOperations: [
          { op: "set", path: "/api_key", value: bodyOverrideValue },
        ],
      },
      presentation: { value: publicDisplayValue },
    })

    expect(collection.knownSecrets).toEqual(
      expect.arrayContaining([headerOverrideValue, bodyOverrideValue]),
    )
    expect(collection.knownSecrets).not.toContain(publicDisplayValue)
    expect(collection.complete).toBe(true)
  })

  it("does not escalate a cyclic Axon override back-reference into public value fields", () => {
    const headerOverrideValue = "axon-cyclic-header-secret-placeholder"
    const bodyOverrideValue = "axon-cyclic-body-secret-placeholder"
    const publicDisplayValue = "public-display-value"
    const headerOperation: Record<string, unknown> = {
      op: "set",
      path: "/X-Example-Key",
      value: headerOverrideValue,
    }
    const resource = {
      settings: {
        headerOverrideOperations: [headerOperation],
        bodyOverrideOperations: [
          { op: "set", path: "/api_key", value: bodyOverrideValue },
        ],
      },
      presentation: { value: publicDisplayValue },
    }
    headerOperation.resource = resource

    const collection = collectManagedResourceSecrets(resource)

    expect(collection.knownSecrets).toEqual(
      expect.arrayContaining([headerOverrideValue, bodyOverrideValue]),
    )
    expect(collection.knownSecrets).not.toContain(publicDisplayValue)
    expect(collection.complete).toBe(true)
  })

  it("does not invoke throwing getters while collecting resource secrets", () => {
    let getterCalls = 0
    const resource = Object.defineProperty(
      { token: "data-property-secret-placeholder" },
      "password",
      {
        enumerable: true,
        get() {
          getterCalls += 1
          throw new Error("accessor must not run")
        },
      },
    )

    let collection = collectManagedResourceSecrets()
    expect(() => {
      collection = collectManagedResourceSecrets(resource)
    }).not.toThrow()
    expect(getterCalls).toBe(0)
    expect(collection.knownSecrets).toEqual([
      "data-property-secret-placeholder",
    ])
    expect(collection.complete).toBe(false)
  })

  it("does not let throwing proxy inspection traps escape", () => {
    const throwingOwnKeys = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("ownKeys trap failed")
        },
      },
    )
    const throwingDescriptor = new Proxy(
      {},
      {
        ownKeys() {
          return ["token"]
        },
        getOwnPropertyDescriptor() {
          throw new Error("descriptor trap failed")
        },
      },
    )

    let collection = collectManagedResourceSecrets()
    expect(() => {
      collection = collectManagedResourceSecrets(
        throwingOwnKeys,
        throwingDescriptor,
      )
    }).not.toThrow()
    expect(collection.knownSecrets).toEqual([])
    expect(collection.complete).toBe(false)
  })

  it("terminates safely on very deep resource graphs", () => {
    const resource: Record<string, unknown> = {
      token: "shallow-secret-placeholder",
    }
    let cursor = resource
    for (let depth = 0; depth < 20_000; depth += 1) {
      const next: Record<string, unknown> = {}
      cursor.next = next
      cursor = next
    }
    cursor.token = "over-depth-secret-placeholder"

    let collection = collectManagedResourceSecrets()
    expect(() => {
      collection = collectManagedResourceSecrets(resource)
    }).not.toThrow()
    expect(collection.knownSecrets).toEqual(["shallow-secret-placeholder"])
    expect(collection.complete).toBe(false)
  })

  it("bounds oversized wide graphs by property, node, and collection budgets", () => {
    let descriptorInspections = 0
    const propertyKeys = Array.from(
      { length: 50_100 },
      (_, index) => `field-${index}`,
    )
    const oversizedProperties = new Proxy(
      {},
      {
        ownKeys() {
          return propertyKeys
        },
        getOwnPropertyDescriptor(_target, property) {
          descriptorInspections += 1
          return {
            configurable: true,
            enumerable: true,
            value: property,
            writable: true,
          }
        },
      },
    )

    const propertyBounded = collectManagedResourceSecrets(oversizedProperties)
    expect(descriptorInspections).toBe(50_000)
    expect(propertyBounded.complete).toBe(false)

    let visitedChildren = 0
    const children = Array.from(
      { length: 10_100 },
      () =>
        new Proxy(
          {},
          {
            ownKeys() {
              visitedChildren += 1
              return []
            },
          },
        ),
    )
    const nodeBounded = collectManagedResourceSecrets({ children })
    expect(visitedChildren).toBe(9_998)
    expect(nodeBounded.complete).toBe(false)

    const stringCountCandidate = Object.fromEntries(
      Array.from({ length: 1_100 }, (_, index) => [
        `token-${index}`,
        `secret-${index}`,
      ]),
    )
    const countBounded = collectManagedResourceSecrets(stringCountCandidate)

    expect(countBounded.knownSecrets).toHaveLength(1_024)
    expect(countBounded.knownSecrets).not.toContain("secret-1099")
    expect(countBounded.complete).toBe(false)

    const codeUnitCandidate = Object.fromEntries(
      Array.from({ length: 900 }, (_, index) => [
        `token-${index}`,
        `${index}`.padEnd(300, "x"),
      ]),
    )
    const codeUnitBounded = collectManagedResourceSecrets(codeUnitCandidate)

    expect(
      codeUnitBounded.knownSecrets.reduce(
        (total, value) => total + value.length,
        0,
      ),
    ).toBe(261_900)
    expect(codeUnitBounded.knownSecrets).not.toContain(
      `${899}`.padEnd(300, "x"),
    )
    expect(codeUnitBounded.complete).toBe(false)
  })

  it("does not invoke accessor indices in arrays", () => {
    let accessorCalls = 0
    const values = ["array-data-secret-placeholder"]
    Object.defineProperty(values, "1", {
      enumerable: true,
      get() {
        accessorCalls += 1
        throw new Error("array accessor must not run")
      },
    })

    let collection = collectManagedResourceSecrets()
    expect(() => {
      collection = collectManagedResourceSecrets({ token: values })
    }).not.toThrow()
    expect(accessorCalls).toBe(0)
    expect(collection.knownSecrets).toEqual(["array-data-secret-placeholder"])
    expect(collection.complete).toBe(false)
  })

  it("defaults managed-site context to new-api when managedSiteType is missing", () => {
    const prefs = {
      newApi: {
        baseUrl: "https://new-api.example.com",
        adminToken: "token",
        userId: "1",
      },
    }

    expect(getManagedSiteContext(prefs as any)).toEqual({
      siteType: SITE_TYPES.NEW_API,
      messagesKey: "newapi",
    })
  })

  it("returns label and message keys for each managed-site type", () => {
    expect(getManagedSiteLabelKey(SITE_TYPES.OCTOPUS)).toBe(
      "settings:managedSite.octopus",
    )
    expect(getManagedSiteLabelKey(SITE_TYPES.AXON_HUB)).toBe(
      "settings:managedSite.axonHub",
    )
    expect(getManagedSiteLabelKey(SITE_TYPES.CLAUDE_CODE_HUB)).toBe(
      "settings:managedSite.claudeCodeHub",
    )
    expect(getManagedSiteLabelKey(SITE_TYPES.DONE_HUB)).toBe(
      "settings:managedSite.doneHub",
    )
    expect(getManagedSiteLabelKey(SITE_TYPES.VELOERA)).toBe(
      "settings:managedSite.veloera",
    )
    expect(getManagedSiteLabelKey(SITE_TYPES.NEW_API)).toBe(
      "settings:managedSite.newApi",
    )

    expect(getManagedSiteMessagesKeyFromSiteType(SITE_TYPES.OCTOPUS)).toBe(
      "octopus",
    )
    expect(getManagedSiteMessagesKeyFromSiteType(SITE_TYPES.AXON_HUB)).toBe(
      "axonhub",
    )
    expect(
      getManagedSiteMessagesKeyFromSiteType(SITE_TYPES.CLAUDE_CODE_HUB),
    ).toBe("claudecodehub")
    expect(getManagedSiteMessagesKeyFromSiteType(SITE_TYPES.DONE_HUB)).toBe(
      "donehub",
    )
    expect(getManagedSiteMessagesKeyFromSiteType(SITE_TYPES.VELOERA)).toBe(
      "veloera",
    )
    expect(getManagedSiteMessagesKeyFromSiteType(SITE_TYPES.NEW_API)).toBe(
      "newapi",
    )
  })

  it("validates octopus admin config separately from legacy token-based configs", () => {
    const prefs = {
      octopus: {
        baseUrl: "https://octopus.example.com",
        username: "admin",
        password: "secret",
      },
      veloera: {
        baseUrl: "https://veloera.example.com",
        adminToken: "admin-token",
        userId: "42",
      },
      doneHub: {
        baseUrl: "",
        adminToken: "",
        userId: "",
      },
      axonHub: {
        baseUrl: "https://axonhub.example.com",
        email: "admin@example.com",
        password: "secret",
      },
      claudeCodeHub: {
        baseUrl: "https://cch.example.com",
        adminToken: "admin-token",
      },
    }

    expect(
      getManagedSiteAdminConfigForType(prefs as any, SITE_TYPES.OCTOPUS),
    ).toEqual({
      baseUrl: "https://octopus.example.com",
      adminToken: "",
      userId: "admin",
    })
    expect(
      getManagedSiteAdminConfigForType(prefs as any, SITE_TYPES.VELOERA),
    ).toEqual({
      baseUrl: "https://veloera.example.com",
      adminToken: "admin-token",
      userId: "42",
    })
    expect(
      getManagedSiteAdminConfigForType(prefs as any, SITE_TYPES.AXON_HUB),
    ).toEqual({
      baseUrl: "https://axonhub.example.com",
      adminToken: "secret",
      userId: "admin@example.com",
    })
    expect(
      getManagedSiteAdminConfigForType(
        prefs as any,
        SITE_TYPES.CLAUDE_CODE_HUB,
      ),
    ).toEqual({
      baseUrl: "https://cch.example.com",
      adminToken: "admin-token",
      userId: "admin",
    })
    expect(
      getManagedSiteAdminConfigForType(prefs as any, SITE_TYPES.DONE_HUB),
    ).toBeNull()
    expect(
      getManagedSiteAdminConfigForType(
        {
          octopus: {
            baseUrl: "https://octopus.example.com",
            username: "",
            password: "",
          },
        } as any,
        SITE_TYPES.OCTOPUS,
      ),
    ).toBeNull()
    expect(
      getManagedSiteAdminConfigForType(
        {
          claudeCodeHub: {
            baseUrl: "",
            adminToken: "admin-token",
          },
        } as any,
        SITE_TYPES.CLAUDE_CODE_HUB,
      ),
    ).toBeNull()
    expect(
      getManagedSiteAdminConfigForType(
        {
          claudeCodeHub: {
            baseUrl: "https://cch.example.com",
            adminToken: "",
          },
        } as any,
        SITE_TYPES.CLAUDE_CODE_HUB,
      ),
    ).toBeNull()
  })

  it("builds managed-site target options and respects exclusions", () => {
    const prefs = {
      newApi: {
        baseUrl: "https://new-api.example.com",
        adminToken: "new-api-token",
        userId: "1",
      },
      veloera: {
        baseUrl: "https://veloera.example.com",
        adminToken: "veloera-token",
        userId: "2",
      },
      doneHub: {
        baseUrl: "",
        adminToken: "",
        userId: "",
      },
      octopus: {
        baseUrl: "https://octopus.example.com",
        username: "admin",
        password: "secret",
      },
      axonHub: {
        baseUrl: "https://axonhub.example.com",
        email: "admin@example.com",
        password: "secret",
      },
      claudeCodeHub: {
        baseUrl: "https://cch.example.com",
        adminToken: "cch-token",
      },
    }

    const options = getManagedSiteTargetOptions(prefs as any, {
      excludeSiteTypes: [SITE_TYPES.VELOERA],
    })

    expect(options.map((item) => item.siteType)).toEqual([
      SITE_TYPES.NEW_API,
      SITE_TYPES.OCTOPUS,
      SITE_TYPES.AXON_HUB,
      SITE_TYPES.CLAUDE_CODE_HUB,
    ])
  })

  it("offers complete AxonHub config as a managed-site migration target and respects exclusions", () => {
    const prefs = {
      axonHub: {
        baseUrl: "https://axonhub.example.com",
        email: "admin@example.com",
        password: "secret",
      },
    }

    expect(getManagedSiteTargetOptions(prefs as any)).toEqual([
      expect.objectContaining({
        siteType: SITE_TYPES.AXON_HUB,
        labelKey: "settings:managedSite.axonHub",
        messagesKey: "axonhub",
        config: {
          baseUrl: "https://axonhub.example.com",
          adminToken: "secret",
          userId: "admin@example.com",
        },
      }),
    ])
    expect(
      getManagedSiteTargetOptions(prefs as any, {
        excludeSiteTypes: [SITE_TYPES.AXON_HUB],
      }),
    ).toEqual([])
  })

  it("does not offer incomplete AxonHub config as a managed-site migration target", () => {
    const prefs = {
      axonHub: {
        baseUrl: "https://axonhub.example.com",
        email: "admin@example.com",
        password: "",
      },
    }

    expect(getManagedSiteTargetOptions(prefs as any)).toEqual([])
  })

  it("offers complete Claude Code Hub config as a managed-site migration target and respects exclusions", () => {
    const prefs = {
      claudeCodeHub: {
        baseUrl: "https://cch.example.com",
        adminToken: "admin-token",
      },
    }

    expect(getManagedSiteTargetOptions(prefs as any)).toEqual([
      expect.objectContaining({
        siteType: SITE_TYPES.CLAUDE_CODE_HUB,
        labelKey: "settings:managedSite.claudeCodeHub",
        messagesKey: "claudecodehub",
        config: {
          baseUrl: "https://cch.example.com",
          adminToken: "admin-token",
          userId: "admin",
        },
      }),
    ])
    expect(
      getManagedSiteTargetOptions(prefs as any, {
        excludeSiteTypes: [SITE_TYPES.CLAUDE_CODE_HUB],
      }),
    ).toEqual([])
  })

  it("does not offer incomplete Claude Code Hub config as a managed-site migration target", () => {
    const prefs = {
      claudeCodeHub: {
        baseUrl: "https://cch.example.com",
        adminToken: "",
      },
    }

    expect(getManagedSiteTargetOptions(prefs as any)).toEqual([])
  })

  it("detects when a managed-site key is directly usable", () => {
    expect(hasUsableManagedSiteChannelKey("sk-live-secret")).toBe(true)
    expect(hasUsableManagedSiteChannelKey("  sk-live-secret  ")).toBe(true)
    expect(hasUsableManagedSiteChannelKey("sk-mask***")).toBe(false)
    expect(hasUsableManagedSiteChannelKey("   ")).toBe(false)

    expect(needsManagedSiteChannelKeyResolution("sk-mask***")).toBe(true)
    expect(needsManagedSiteChannelKeyResolution(undefined)).toBe(true)
    expect(needsManagedSiteChannelKeyResolution("sk-live-secret")).toBe(false)
  })

  it("returns provider-specific translation keys and base-url lookup support", () => {
    expect(
      getManagedSiteConfigMissingMessage(translate as any, "donehub"),
    ).toBe("messages:donehub.configMissing")
    expect(
      getManagedSiteConfigMissingMessage(translate as any, "veloera"),
    ).toBe("messages:veloera.configMissing")
    expect(
      getManagedSiteConfigMissingMessage(translate as any, "octopus"),
    ).toBe("messages:octopus.configMissing")
    expect(
      getManagedSiteConfigMissingMessage(translate as any, "axonhub"),
    ).toBe("messages:axonhub.configMissing")
    expect(
      getManagedSiteConfigMissingMessage(translate as any, "claudecodehub"),
    ).toBe("messages:claudecodehub.configMissing")
    expect(getManagedSiteConfigMissingMessage(translate as any, "newapi")).toBe(
      "messages:newapi.configMissing",
    )

    expect(
      getManagedSiteNoChannelsToSyncMessage(translate as any, "donehub"),
    ).toBe("messages:donehub.noChannelsToSync")
    expect(
      getManagedSiteNoChannelsToSyncMessage(translate as any, "veloera"),
    ).toBe("messages:veloera.noChannelsToSync")
    expect(
      getManagedSiteNoChannelsToSyncMessage(translate as any, "octopus"),
    ).toBe("messages:octopus.noChannelsToSync")
    expect(
      getManagedSiteNoChannelsToSyncMessage(translate as any, "axonhub"),
    ).toBe("messages:axonhub.noChannelsToSync")
    expect(
      getManagedSiteNoChannelsToSyncMessage(translate as any, "claudecodehub"),
    ).toBe("messages:claudecodehub.noChannelsToSync")
    expect(
      getManagedSiteNoChannelsToSyncMessage(translate as any, "newapi"),
    ).toBe("messages:newapi.noChannelsToSync")

    expect(supportsManagedSiteBaseUrlChannelLookup(SITE_TYPES.VELOERA)).toBe(
      false,
    )
    expect(
      supportsManagedSiteBaseUrlChannelLookup(SITE_TYPES.CLAUDE_CODE_HUB),
    ).toBe(true)
    expect(supportsManagedSiteBaseUrlChannelLookup(SITE_TYPES.NEW_API)).toBe(
      true,
    )
  })
})

import { describe, expect, it } from "vitest"

import {
  collectManagedConfigSecrets,
  collectManagedResourceSecrets,
  mergeManagedResourceSecretCollections,
} from "~/services/managedSites/utils/resourceSecrets"

describe("managed resource secrets", () => {
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
    expect(descriptorInspections).toBeGreaterThan(0)
    expect(descriptorInspections).toBeLessThanOrEqual(50_000)
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
    expect(visitedChildren).toBeGreaterThan(0)
    expect(visitedChildren).toBeLessThanOrEqual(10_000)
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
})

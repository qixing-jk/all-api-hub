import { describe, expect, it } from "vitest"

import {
  isRequestyManagementKeyActionParams,
  normalizeRequestyManagementKeyName,
  readRequestyCreatedKey,
  readRequestyDefaultGroupId,
  REQUESTY_PROVISIONING_FAILURE_REASONS,
} from "~/services/apiAdapters/requesty/keys/managementKeyPageContract"

describe("normalizeRequestyManagementKeyName", () => {
  it("collapses whitespace and trims", () => {
    expect(normalizeRequestyManagementKeyName("  All   API Hub  ")).toBe(
      "All API Hub",
    )
  })

  it("falls back to a default for an empty name", () => {
    expect(normalizeRequestyManagementKeyName("   ")).toBe("All API Hub")
  })

  it("bounds the name to the provider limit", () => {
    expect(normalizeRequestyManagementKeyName("x".repeat(200))).toHaveLength(96)
  })
})

describe("readRequestyDefaultGroupId", () => {
  it("reads the org default group the create route requires", () => {
    expect(
      readRequestyDefaultGroupId({
        org: {
          id: "org_1",
          default_group_id: "20899a25-dd03-4ae9-9e5d-3ca9cc141d53",
        },
      }),
    ).toBe("20899a25-dd03-4ae9-9e5d-3ca9cc141d53")
  })

  it("returns null when the org payload is unusable", () => {
    expect(readRequestyDefaultGroupId(null)).toBeNull()
    expect(readRequestyDefaultGroupId({ org: {} })).toBeNull()
    expect(readRequestyDefaultGroupId({})).toBeNull()
  })
})

describe("readRequestyCreatedKey", () => {
  it("reads the one-time plaintext and key id", () => {
    expect(
      readRequestyCreatedKey({
        api_key_id: "56f5559e-a209-4d68-8748-b242c4c4cdff",
        api_key: "rqsty-sk-plaintext",
      }),
    ).toEqual({
      keyId: "56f5559e-a209-4d68-8748-b242c4c4cdff",
      accessToken: "rqsty-sk-plaintext",
    })
  })

  it("rejects a response without the plaintext", () => {
    expect(readRequestyCreatedKey({ api_key_id: "id-only" })).toBeNull()
    expect(readRequestyCreatedKey({ api_key: "plaintext-only" })).toBeNull()
    expect(readRequestyCreatedKey(undefined)).toBeNull()
  })
})

describe("isRequestyManagementKeyActionParams", () => {
  it("accepts the narrow create shape", () => {
    expect(
      isRequestyManagementKeyActionParams({
        requestId: "request-1",
        operation: { kind: "create", name: "All API Hub" },
      }),
    ).toBe(true)
  })

  it("rejects missing or malformed fields", () => {
    expect(isRequestyManagementKeyActionParams(null)).toBe(false)
    expect(isRequestyManagementKeyActionParams({})).toBe(false)
    expect(
      isRequestyManagementKeyActionParams({
        requestId: "",
        operation: { kind: "create", name: "x" },
      }),
    ).toBe(false)
    expect(
      isRequestyManagementKeyActionParams({
        requestId: "request-1",
        operation: { kind: "delete", name: "x" },
      }),
    ).toBe(false)
    expect(
      isRequestyManagementKeyActionParams({
        requestId: "request-1",
        operation: { kind: "create", name: "" },
      }),
    ).toBe(false)
  })
})

describe("failure reasons", () => {
  it("names the fallback causes the form can display", () => {
    expect(Object.values(REQUESTY_PROVISIONING_FAILURE_REASONS)).toEqual([
      "session_unavailable",
      "organization_unavailable",
      "create_rejected",
      "plaintext_missing",
    ])
  })
})

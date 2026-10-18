import { describe, expect, it } from "vitest"

import { createSub2ApiKeyEditor } from "~/services/apiAdapters/sub2api/keys/keyResourceEditor"
import type { Sub2ApiNativeKey } from "~/services/apiService/sub2api/type"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

const request = {} as ApiServiceRequest

const groups = [
  { id: 19, displayName: "group-a", description: "group-a", ratio: 0.3 },
  { id: 21, displayName: "group-b", description: "group-b", ratio: 0.4 },
] as const

const nativeKey = (
  overrides: Partial<Sub2ApiNativeKey> = {},
): Sub2ApiNativeKey => ({
  id: 7,
  key: "sk-example",
  name: "Example key",
  status: "active",
  quota: 0,
  quota_used: 0,
  expires_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ip_whitelist: [],
  group_id: 19,
  group_name: "group-a",
  ...overrides,
})

describe("sub2api key editor create payload", () => {
  it("omits an empty ip whitelist from the create payload", () => {
    const editor = createSub2ApiKeyEditor(request, undefined, undefined, [
      ...groups,
    ])

    const command = editor.buildCommand({
      ...editor.initialValues,
      name: "New key",
      group_id: "19",
      ip_whitelist: "",
    })

    expect(command.create).toEqual({
      name: "New key",
      group_id: 19,
      quota: 0,
    })
    expect("ip_whitelist" in command.create).toBe(false)
  })

  it("keeps a populated ip whitelist in the create payload", () => {
    const editor = createSub2ApiKeyEditor(request, undefined, undefined, [
      ...groups,
    ])

    const command = editor.buildCommand({
      ...editor.initialValues,
      name: "New key",
      group_id: "19",
      ip_whitelist: "203.0.113.7\n198.51.100.4",
    })

    expect(command.create.ip_whitelist).toEqual(["203.0.113.7", "198.51.100.4"])
  })

  it("keeps the editable ip whitelist so clearing an existing one still round-trips", () => {
    const editor = createSub2ApiKeyEditor(
      request,
      nativeKey({ ip_whitelist: ["203.0.113.7"] }),
    )

    const command = editor.buildCommand({
      ...editor.initialValues,
      ip_whitelist: "",
    })

    expect(command.values.ip_whitelist).toEqual([])
  })
})

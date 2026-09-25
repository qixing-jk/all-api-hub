import { describe, expect, it } from "vitest"

import type { RightCodeChannelInfo } from "~/services/apiAdapters/rightcode/channels"
import { createRightCodeKeyEditor } from "~/services/apiAdapters/rightcode/keyResourceEditor"
import type { RightCodeApiKey } from "~/services/apiService/rightcode/type"

const channels: RightCodeChannelInfo[] = [
  {
    id: 1,
    name: "Codex",
    prefix: "/codex",
    protocol: "responses",
    copyWithV1: true,
    models: ["gpt-5.5"],
  },
  {
    id: 2,
    name: "Claude 官方渠道",
    prefix: "/claude",
    protocol: "messages",
    copyWithV1: false,
    models: ["claude-sonnet-5"],
  },
]

const key = (overrides: Partial<RightCodeApiKey> = {}): RightCodeApiKey => ({
  id: 11,
  key: "sk-example00000000000000000000000001",
  name: "Example key",
  bound_upstream_id: 1,
  quota_limit: null,
  used_quota: 0,
  expired_at: null,
  is_active: true,
  allowed_prefixes: null,
  allowed_models: [],
  allow_wallet: true,
  allowed_item_ids: null,
  ...overrides,
})

describe("rightCodeKeyEditor", () => {
  it("requires a channel when creating a key", () => {
    const editor = createRightCodeKeyEditor({ channels })

    expect(
      editor.validate({ ...editor.initialValues, channel: "" }),
    ).toMatchObject({ valid: false })

    expect(
      editor.validate({
        ...editor.initialValues,
        name: "Key",
        channel: "2",
      }),
    ).toEqual({ valid: true })
  })

  it("offers the selected channel's models", async () => {
    const editor = createRightCodeKeyEditor({ channels })

    await expect(
      editor.loadOptions?.("models", { channel: "2" }, undefined),
    ).resolves.toEqual([
      { value: "claude-sonnet-5", displayLabel: "claude-sonnet-5" },
    ])
  })

  it("does not offer a channel switch for a legacy prefix key", () => {
    const editor = createRightCodeKeyEditor({
      channels,
      key: key({ bound_upstream_id: null, allowed_prefixes: ["/claude"] }),
    })

    expect(editor.fields.map(({ fieldId }) => fieldId)).not.toContain("channel")
    const command = editor.buildCommand({
      ...editor.initialValues,
      name: "Legacy",
    })
    // The binding must not be invented for a key that never had one.
    expect(command.values.channelId).toBeNull()
    expect(command.values.allowedModels).toEqual([])
  })

  it("serializes expiry as the space-free local format the deployment accepts", () => {
    const editor = createRightCodeKeyEditor({ channels, key: key() })

    const command = editor.buildCommand({
      ...editor.initialValues,
      name: "Expiring",
      channel: "1",
      expires_at: new Date(2027, 0, 1, 8, 30, 15).toISOString(),
    })

    expect(command.values.expiresAt).toBe("2027-01-01T08:30:15")
  })

  it("refuses to clear an expiry the deployment cannot clear", () => {
    const editor = createRightCodeKeyEditor({
      channels,
      key: key({ expired_at: "2027-01-01T00:00:00" }),
    })

    expect(
      editor.validate({ ...editor.initialValues, name: "Key", expires_at: "" }),
    ).toMatchObject({ valid: false })

    // A key without an expiry can still be given one later.
    const permanent = createRightCodeKeyEditor({ channels, key: key() })
    expect(
      permanent.validate({
        ...permanent.initialValues,
        name: "Key",
        expires_at: "",
      }),
    ).toEqual({ valid: true })
  })

  it("treats an empty quota as unlimited rather than zero", () => {
    const editor = createRightCodeKeyEditor({ channels, key: key() })

    const command = editor.buildCommand({
      ...editor.initialValues,
      name: "Key",
      channel: "1",
      unlimited_quota: true,
      quotaUsd: 12,
    })

    expect(command.values.quotaLimit).toBeNull()

    const capped = editor.buildCommand({
      ...editor.initialValues,
      name: "Key",
      channel: "1",
      unlimited_quota: false,
      quotaUsd: 12,
    })
    expect(capped.values.quotaLimit).toBe(12)
  })
})

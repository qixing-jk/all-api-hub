import { describe, expect, it } from "vitest"

import { magpieDisplayFacts } from "~/services/apiAdapters/managedResources/magpie/displayFacts"
import {
  magpieEditor,
  magpieImportProjection,
} from "~/services/apiAdapters/managedResources/magpie/editorProjection"
import type { MagpieProvider } from "~/services/apiService/magpie/providers"
import { buildMagpieProviderSavePayload } from "~/services/apiService/magpie/providerUpdate"

const original: MagpieProvider = {
  id: "relay",
  name: "Relay",
  chat: "https://relay.test/v1",
  responses: "https://responses.test/v1",
  anthropic: "https://claude.test",
  gemini: "",
  key: { set: true, masked: "sk-***", optional: false },
  off: false,
  chosen: ["model-a"],
  models: [{ id: "model-a" }, { id: "model-b" }],
  headers: { "X-Tenant": "tenant" },
  fallback: ["backup/model"],
  routing: "rotate",
  affinity: "cache",
  contexts: { "model-a": 1234 },
  proxy: "socks5://localhost:1080",
  preset: "",
  searches: true,
}

describe("Magpie native provider editing", () => {
  it("restores the native API selection and changes it without clearing other protocols", () => {
    const editor = magpieEditor({ ...original, baseAPI: "responses" })
    expect(editor.initialValues.baseAPI).toBe("responses")
    expect(editor.buildCommand(editor.initialValues).fields).toEqual({})
    expect(
      editor.buildCommand({ ...editor.initialValues, baseAPI: "anthropic" })
        .fields,
    ).toEqual({ baseAPI: "anthropic" })
  })

  it("requires the selected type's address and identifies errors on hidden protocols", () => {
    const editor = magpieEditor(original)
    expect(
      editor.validate({ ...editor.initialValues, baseAPI: "gemini" }),
    ).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([{ fieldId: "gemini", code: "required" }]),
    })
    expect(
      editor.validate({ ...editor.initialValues, responses: "not-a-url" }),
    ).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        { fieldId: "baseAPI", code: "inconsistent_value" },
      ]),
    })
  })

  it("keeps an unsupported native API type and its address intact on unrelated edits", () => {
    const detail = {
      ...original,
      chat: "",
      responses: "",
      anthropic: "",
      baseAPI: "decide",
      decide: "https://decision.test",
    }
    const editor = magpieEditor(detail)
    expect(editor.initialValues.baseAPI).toBe("decide")
    expect(
      editor.buildCommand({ ...editor.initialValues, name: "Renamed" }).fields,
    ).toEqual({ name: "Renamed" })
    expect(
      buildMagpieProviderSavePayload(detail, { name: "Renamed" }),
    ).toMatchObject({ baseAPI: "decide", decide: "https://decision.test" })
  })

  it.each(["chat", "responses", "anthropic", "gemini"])(
    "selects %s when importing that protocol",
    (protocol) => {
      const values = magpieImportProjection({
        kind: "managed-channel-import",
        notes: "",
        name: "Imported",
        channelType: protocol,
        baseUrl: "https://relay.test/v1",
        credential: "key",
        models: [],
        enabled: true,
      })
      expect(values.baseAPI).toBe(protocol)
    },
  )
  it("edits common native settings and resets numeric overrides explicitly", () => {
    const editor = magpieEditor({
      ...original,
      modelsURL: "https://relay.test/catalog/models?region=us",
      catalog: "openai, anthropic",
      balanceURL: "https://relay.test/balance?key={key}",
      balancePath: "data.balance / 500000",
      maxConcurrency: 3,
      maxRPM: 60,
      priceRate: 0.8,
    })
    expect(editor.initialValues).toMatchObject({
      modelsURL: "https://relay.test/catalog/models?region=us",
      catalog: "openai, anthropic",
      balanceURL: "https://relay.test/balance?key={key}",
      balancePath: "data.balance / 500000",
      maxConcurrency: 3,
      maxRPM: 60,
      priceRate: 0.8,
    })
    expect(editor.buildCommand(editor.initialValues).fields).toEqual({})
    expect(
      editor.buildCommand({
        ...editor.initialValues,
        modelsURL: " https://relay.test/other/models ",
        catalog: " deepseek ",
        balanceURL: "",
        balancePath: "",
        maxConcurrency: "",
        maxRPM: "",
        priceRate: "",
      }).fields,
    ).toEqual({
      modelsURL: "https://relay.test/other/models",
      catalog: "deepseek",
      balanceURL: "",
      balancePath: "",
      maxConcurrency: null,
      maxRPM: 0,
      priceRate: 0,
    })
  })

  it.each([
    ["modelsURL", "file:///models"],
    ["balanceURL", "https://user:password@relay.test/balance"],
    ["maxConcurrency", -1],
    ["maxConcurrency", 1.5],
    ["maxConcurrency", 1001],
    ["maxRPM", 10001],
    ["maxRPM", Number.NaN],
    ["priceRate", 1000.5],
    ["priceRate", 0.1234],
  ])("rejects invalid %s setting %s", (field, value) => {
    const editor = magpieEditor(original)
    expect(
      editor.validate({ ...editor.initialValues, [field]: value }),
    ).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        { fieldId: field, code: "invalid_value" },
      ]),
    })
  })

  it("does not block unrelated edits on unrecognized saved settings", () => {
    const editor = magpieEditor({ ...original, maxRPM: 20000 })
    expect(
      editor.buildCommand({ ...editor.initialValues, name: "Renamed" }).fields,
    ).toEqual({ name: "Renamed" })
  })

  it("keeps preset-owned catalog and balance endpoints read-only", () => {
    const editor = magpieEditor({
      ...original,
      preset: "openai",
      modelsURL: "https://preset.test/models",
    })
    for (const fieldId of ["modelsURL", "catalog", "balanceURL", "balancePath"])
      expect(
        editor.fields.find((field) => field.fieldId === fieldId)?.readOnly,
      ).toBe(true)
    expect(
      editor.buildCommand({
        ...editor.initialValues,
        name: "Renamed",
        modelsURL: "",
        catalog: "changed",
      }).fields,
    ).toEqual({ name: "Renamed" })
  })

  it("leaves server-owned fields out of ordinary saves", () => {
    const payload = buildMagpieProviderSavePayload(
      {
        ...original,
        maxConcurrency: 3,
        queueLimit: 20,
        queueWait: 40,
        maxRPM: 60,
        priceRate: 0.8,
        outputs: { "model-a": 4096 },
        compacts: { "model-a": 64000 },
        accountProxies: { second: "direct" },
        balanceToken: { set: true, masked: "***" },
        keyList: [{ id: "second", masked: "***", active: false, on: true }],
      },
      { name: "Renamed" },
    )
    for (const field of [
      "maxConcurrency",
      "queueLimit",
      "queueWait",
      "maxRPM",
      "priceRate",
      "outputs",
      "compacts",
      "accountProxies",
      "balanceToken",
      "keyList",
    ])
      expect(payload).not.toHaveProperty(field)
  })

  it("identifies a missing endpoint separately from a malformed URL", () => {
    const editor = magpieEditor()
    expect(editor.validate(editor.initialValues)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([{ fieldId: "chat", code: "required" }]),
    })
  })

  it("shows only exposed models when the provider uses its automatic catalog", () => {
    const facts = magpieDisplayFacts(
      {
        ...original,
        chosen: [],
        models: [
          { id: "active", on: true },
          { id: "hidden", on: false },
        ],
      },
      {
        siteType: "magpie",
        kind: "channel",
        scopeKey: "http://test",
        resourceId: "relay",
      },
    )
    expect(
      facts.fields.find((field) => field.fieldId === "supportedModels"),
    ).toMatchObject({ value: ["active"] })
  })
  it("saves model selections as normalized IDs and can restore automatic discovery", () => {
    const editor = magpieEditor(original)
    expect(editor.initialValues.supportedModels).toEqual(["model-a"])
    expect(
      editor.buildCommand({
        ...editor.initialValues,
        supportedModels: [" model-b ", "model-b", "custom"],
      }).fields.models,
    ).toEqual(["model-b", "custom"])
    expect(
      editor.buildCommand({ ...editor.initialValues, supportedModels: [] })
        .fields.models,
    ).toEqual([])
    expect(
      editor.buildCommand({
        ...editor.initialValues,
        supportedModels: ["model-a"],
      }).fields,
    ).toEqual({})
  })
  it("offers model workflows for API providers while keeping subscriptions read-only", () => {
    const ref = {
      siteType: "magpie" as const,
      kind: "channel" as const,
      scopeKey: "http://test",
      resourceId: original.id,
    }
    expect(magpieDisplayFacts(original, ref).actions?.channel).toMatchObject({
      channelType: "chat",
      canSyncModels: true,
      canOpenModelSync: true,
      canConfigureModelFilters: true,
    })
    expect(
      magpieDisplayFacts({ ...original, account: {} }, ref).actions?.channel,
    ).toBeUndefined()
  })

  it("does not let a primary-key replacement silently append a native key pool", () => {
    const editor = magpieEditor(original)
    expect(
      editor.validate({
        ...editor.initialValues,
        key: { kind: "replace", value: "sk-first;sk-second" },
      }).valid,
    ).toBe(false)
  })

  it("rejects unknown secret intents and preserves a disabled import seed", () => {
    const editor = magpieEditor(original)
    expect(
      editor.validate({
        ...editor.initialValues,
        key: { kind: "unexpected" },
      } as any).valid,
    ).toBe(false)
    expect(
      magpieImportProjection({
        kind: "managed-channel-import",
        name: "Disabled",
        channelType: "chat",
        baseUrl: "https://test.invalid/v1",
        credential: "sk-test",
        models: [],
        notes: "",
        enabled: false,
      }).status,
    ).toBe("disabled")
  })

  it("edits the name without sending masked keys or converting discovered models into saved picks", () => {
    const editor = magpieEditor(original)
    const command = editor.buildCommand({
      ...editor.initialValues,
      name: "Renamed",
    })
    const payload = buildMagpieProviderSavePayload(original, command.fields)
    expect(payload).toMatchObject({
      name: "Renamed",
      models: ["model-a"],
      responses: original.responses,
      anthropic: original.anthropic,
      headers: original.headers,
      fallback: original.fallback,
      routing: "rotate",
      affinity: "cache",
      contexts: original.contexts,
      proxy: original.proxy,
      searches: true,
    })
    expect(payload).not.toHaveProperty("key")
    expect(payload).not.toHaveProperty("keyList")
    expect(payload).not.toHaveProperty("off")
  })

  it("keeps edits narrow so a fresh read can preserve changes made after opening the editor", () => {
    const editor = magpieEditor(original)
    const command = editor.buildCommand({
      ...editor.initialValues,
      name: "Renamed",
    })
    expect(command.fields).toEqual({ name: "Renamed" })
    const payload = buildMagpieProviderSavePayload(
      { ...original, headers: { "X-New": "value" } },
      command.fields,
    )
    expect(payload.headers).toEqual({ "X-New": "value" })
  })

  it("rejects clearing a primary key because an empty key means keep upstream", () => {
    const editor = magpieEditor(original)
    expect(
      editor.validate({ ...editor.initialValues, key: { kind: "clear" } })
        .valid,
    ).toBe(false)
  })

  it("imports an Anthropic source only into the native Anthropic endpoint", () => {
    const projection = magpieImportProjection({
      kind: "managed-channel-import",
      name: "Claude",
      channelType: "anthropic",
      baseUrl: "https://claude.test",
      credential: "sk-import",
      models: ["claude-test"],
      enabled: true,
      notes: "",
    })
    expect(projection).toMatchObject({
      name: "Claude",
      anthropic: "https://claude.test",
      chat: "",
      key: { kind: "replace", value: "sk-import" },
    })
    expect(magpieEditor().validate(projection).valid).toBe(true)
  })
})

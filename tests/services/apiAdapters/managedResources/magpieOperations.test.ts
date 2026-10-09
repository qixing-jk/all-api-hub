import { beforeEach, describe, expect, it, vi } from "vitest"

import { ManagedResourceError } from "~/services/apiAdapters/contracts/managedResourceNative"
import { magpieManagedResourceRegistration } from "~/services/apiAdapters/managedResources/magpie"
import {
  createMagpieResource,
  deleteMagpieResource,
  updateMagpieResource,
} from "~/services/apiAdapters/managedResources/magpie/mutations"
import { magpieNativeEditor } from "~/services/apiAdapters/managedResources/magpie/nativeEditor"
import { magpieFailure } from "~/services/apiAdapters/managedResources/magpie/nativeRuntime"
import { magpieKeyFingerprint } from "~/services/apiService/magpie/keyIdentity"
import * as providers from "~/services/apiService/magpie/providers"
import { MagpieApiError } from "~/services/apiService/magpie/request"
import { getManagedSiteRuntimeConfigForType } from "~/services/managedSites/configuration/runtimeConfig"

const config = { baseUrl: "http://magpie.test:3430", webKey: "test-web-key" }
vi.mock("~/services/apiService/magpie/providers", async (importOriginal) => ({
  ...(await importOriginal<typeof providers>()),
  listMagpieProviders: vi.fn(),
  saveMagpieProvider: vi.fn(),
  deleteMagpieProvider: vi.fn(),
  setMagpieProviderEnabled: vi.fn(),
  readMagpieProviderKey: vi.fn(),
  discoverMagpieModels: vi.fn(),
  mutateMagpieProviderKey: vi.fn(),
}))
vi.mock("~/services/managedSites/configuration/runtimeConfig", () => ({
  getManagedSiteRuntimeConfigForType: vi.fn(async () => ({
    siteType: "magpie",
    config,
  })),
}))

const fixture = (
  overrides: Partial<providers.MagpieProvider> = {},
): providers.MagpieProvider => ({
  id: "relay",
  name: "Relay",
  chat: "https://relay.test/v1",
  responses: "",
  anthropic: "",
  key: { set: true, masked: "sk-***", optional: false },
  chosen: ["m1"],
  models: [{ id: "m1" }],
  off: false,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(providers.listMagpieProviders).mockResolvedValue([fixture()])
})

describe("Magpie native mutation outcomes", () => {
  it("confirms each added key setting and removal from native readback", async () => {
    const ref = await magpieKeyFingerprint("sk-new")
    let current = fixture({
      keyList: [
        { id: "primary", active: true, on: true, masked: "***" },
        { id: "old", active: false, on: true, masked: "***" },
      ],
    })
    vi.mocked(providers.listMagpieProviders).mockResolvedValue([current])
    vi.mocked(providers.mutateMagpieProviderKey).mockImplementation(
      async (_config, action, payload) => {
        const keys =
          action === "add"
            ? [
                ...current.keyList!,
                {
                  id: ref,
                  active: false,
                  on: true,
                  masked: "***",
                  name: payload.name,
                  protocol: payload.protocol,
                },
              ]
            : action === "remove"
              ? current.keyList!.filter((key) => key.id !== payload.ref)
              : current.keyList!.map((key) =>
                  key.id !== payload.ref
                    ? key
                    : {
                        ...key,
                        ...(action === "protocol"
                          ? { protocol: payload.protocol }
                          : {}),
                        ...(action === "weight"
                          ? { weight: payload.weight }
                          : {}),
                        ...(action === "off" ? { on: false } : {}),
                      },
                )
        current = { ...current, keyList: keys }
        return [current]
      },
    )
    const result = await updateMagpieResource(config, current, {
      fields: {},
      keyPool: {
        add: [
          {
            key: "sk-new",
            name: "New",
            protocol: "chat",
            weight: 4,
            on: false,
          },
        ],
        update: [{ ref: "primary", protocol: "responses" }],
        remove: ["old"],
      },
    })
    expect(result.outcome).toBe("succeeded")
    expect(current.keyList).toEqual([
      expect.objectContaining({
        id: "primary",
        protocol: "responses",
        on: true,
      }),
      expect.objectContaining({
        id: ref,
        name: "New",
        protocol: "chat",
        weight: 4,
        on: false,
      }),
    ])
    expect(providers.mutateMagpieProviderKey).toHaveBeenCalledTimes(5)
    expect(providers.saveMagpieProvider).not.toHaveBeenCalled()
  })
  it.each([
    [
      new ManagedResourceError({ code: "resource_changed" }),
      "resource_changed",
    ],
    [new DOMException("cancelled", "AbortError"), "aborted"],
    [new MagpieApiError("auth", 401, false, true), "authentication_failed"],
    [new MagpieApiError("forbidden", 403, true, true), "permission_denied"],
    [new MagpieApiError("gone", 404, true, true), "not_found"],
    [new MagpieApiError("offline", 503, true, false), "unavailable"],
    [new Error("opaque internal error"), "unexpected"],
  ])("maps native failures to recovery actions (%s)", (error, code) => {
    expect(magpieFailure(error)).toMatchObject({ code })
    if (!(error instanceof MagpieApiError))
      expect(magpieFailure(error)).not.toHaveProperty("message")
  })

  it("requires configuration before opening the native workspace", async () => {
    vi.mocked(getManagedSiteRuntimeConfigForType).mockResolvedValueOnce(null)
    await expect(
      magpieManagedResourceRegistration.open(),
    ).rejects.toMatchObject({ failure: { code: "configuration_required" } })
  })

  it("refuses saved pool edits during creation and duplicate primary replacement before writes", async () => {
    await expect(
      createMagpieResource(config, {
        fields: {},
        keyPool: {
          add: [],
          update: [{ ref: "saved", name: "No" }],
          remove: [],
        },
      }),
    ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
    const duplicate = await magpieKeyFingerprint("sk-already-saved")
    vi.mocked(providers.listMagpieProviders).mockResolvedValue([
      fixture({
        keyList: [{ id: duplicate, active: false, on: true, masked: "***" }],
      }),
    ])
    await expect(
      updateMagpieResource(config, fixture(), {
        fields: { key: "sk-already-saved" },
      }),
    ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
    expect(providers.saveMagpieProvider).not.toHaveBeenCalled()
  })

  it("uses preset-owned discovery settings instead of editable catalog overrides", async () => {
    const detail = fixture({
      preset: "openai",
      modelsURL: "https://native.test/models",
      catalog: "native",
    })
    const editor = magpieNativeEditor(config, detail)
    vi.mocked(providers.readMagpieProviderKey).mockResolvedValue("sk-primary")
    vi.mocked(providers.discoverMagpieModels).mockResolvedValue(["m1"])
    expect(
      await editor.loadOptions!("supportedModels", editor.initialValues),
    ).toBeDefined()
    expect(providers.discoverMagpieModels).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        modelsURL: detail.modelsURL,
        catalog: "native",
      }),
      undefined,
    )
  })
  it("reveals only the matching primary pool key and rejects a changed primary", async () => {
    const ref = await magpieKeyFingerprint("sk-primary")
    const editor = magpieNativeEditor(
      config,
      fixture({
        keyList: [
          { id: ref, active: true, on: true, masked: "sk-***" },
          { id: "secondary", active: false, on: true, masked: "sk-***" },
        ],
      }),
    )
    vi.mocked(providers.readMagpieProviderKey).mockResolvedValue("sk-primary")
    await expect(editor.loadSecret!(`keyPool:${ref}`)).resolves.toBe(
      "sk-primary",
    )
    await expect(editor.loadSecret!("keyPool:secondary")).rejects.toMatchObject(
      { failure: { code: "validation_failed" } },
    )
    expect(providers.readMagpieProviderKey).toHaveBeenCalledTimes(1)
    vi.mocked(providers.readMagpieProviderKey).mockResolvedValue("sk-promoted")
    await expect(editor.loadSecret!(`keyPool:${ref}`)).rejects.toMatchObject({
      failure: { code: "resource_changed" },
    })
  })
  it("accepts an unchanged submission without dispatching any mutation", async () => {
    expect(
      await updateMagpieResource(config, fixture(), { fields: {} }),
    ).toMatchObject({
      outcome: "succeeded",
      confirmedEffects: [],
    })
    expect(providers.saveMagpieProvider).not.toHaveBeenCalled()
    expect(providers.mutateMagpieProviderKey).not.toHaveBeenCalled()
    expect(providers.setMagpieProviderEnabled).not.toHaveBeenCalled()
  })

  it("rejects primary replacement if native edits promoted a different key", async () => {
    vi.mocked(providers.listMagpieProviders).mockResolvedValue([
      fixture({
        keyList: [{ id: "promoted", active: true, on: true, masked: "***" }],
      }),
    ])
    await expect(
      updateMagpieResource(config, fixture(), {
        fields: { name: "Renamed", key: "new-key" },
        primaryKeyRef: "old-primary",
      }),
    ).rejects.toMatchObject({ failure: { code: "resource_changed" } })
    expect(providers.saveMagpieProvider).not.toHaveBeenCalled()
  })

  it("retains confirmed key steps and never replays an unconfirmed action", async () => {
    const current = fixture({
      keyList: [
        { id: "primary", active: true, on: true, masked: "***" },
        {
          id: "backup",
          active: false,
          on: false,
          masked: "***",
          name: "Backup",
        },
      ],
    })
    const renamed = {
      ...current,
      keyList: current.keyList!.map((key) =>
        key.id === "backup" ? { ...key, name: "Renamed" } : key,
      ),
    }
    vi.mocked(providers.listMagpieProviders).mockResolvedValue([current])
    // Rename confirms, but enabling returns an inventory that still says off.
    vi.mocked(providers.mutateMagpieProviderKey).mockResolvedValue([renamed])
    expect(
      await updateMagpieResource(config, current, {
        fields: {},
        keyPool: {
          add: [],
          remove: [],
          update: [{ ref: "backup", name: "Renamed", on: true }],
        },
      }),
    ).toMatchObject({
      outcome: "partial",
      confirmedEffects: [{ kind: "resource-updated" }],
    })
    expect(providers.mutateMagpieProviderKey).toHaveBeenCalledTimes(2)
    expect(providers.saveMagpieProvider).not.toHaveBeenCalled()
  })

  it("preserves primary key metadata when replacing its secret", async () => {
    const current = fixture({
      keyList: [
        {
          id: "primary",
          active: true,
          on: true,
          masked: "***",
          name: "Main",
          protocol: "anthropic",
          weight: 7,
        },
      ],
    })
    vi.mocked(providers.listMagpieProviders).mockResolvedValue([current])
    vi.mocked(providers.saveMagpieProvider).mockResolvedValue([current])
    await updateMagpieResource(config, current, {
      fields: { key: "replacement" },
      primaryKeyRef: "primary",
    })
    expect(providers.saveMagpieProvider).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        key: "replacement",
        keyName: "Main",
        keyProtocol: "anthropic",
        keyWeight: 7,
      }),
      undefined,
    )
  })
  it("updates one key by fingerprint without rewriting the provider or unrelated keys", async () => {
    const keyList = [
      { id: "primary", active: true, on: true, masked: "***a", name: "Main" },
      {
        id: "backup",
        active: false,
        on: false,
        masked: "***b",
        name: "Backup",
        protocol: "anthropic",
        weight: 7,
      },
      {
        id: "concurrent",
        active: false,
        on: true,
        masked: "***c",
        name: "Added elsewhere",
      },
    ]
    const fresh = fixture({
      keyList,
      accountProxies: { backup: "direct" },
      accountModels: { backup: ["special"] },
    })
    vi.mocked(providers.listMagpieProviders).mockResolvedValue([fresh])
    vi.mocked(providers.mutateMagpieProviderKey).mockResolvedValue([
      {
        ...fresh,
        keyList: keyList.map((key) =>
          key.id === "backup" ? { ...key, name: "Renamed" } : key,
        ),
      },
    ])
    const result = await updateMagpieResource(config, fixture(), {
      fields: {},
      keyPool: {
        add: [],
        remove: [],
        update: [{ ref: "backup", name: "Renamed" }],
      },
    })
    expect(result.outcome).toBe("succeeded")
    expect(providers.mutateMagpieProviderKey).toHaveBeenCalledWith(
      config,
      "rename",
      { id: "relay", ref: "backup", name: "Renamed" },
      undefined,
    )
    expect(providers.saveMagpieProvider).not.toHaveBeenCalled()
  })

  it("refuses stale key targets before saving any unrelated form edits", async () => {
    vi.mocked(providers.listMagpieProviders).mockResolvedValue([
      fixture({
        keyList: [{ id: "primary", active: true, on: true, masked: "***" }],
      }),
    ])
    await expect(
      updateMagpieResource(config, fixture(), {
        fields: { name: "Renamed" },
        keyPool: { add: [], update: [], remove: ["missing"] },
      }),
    ).rejects.toMatchObject({ failure: { code: "resource_changed" } })
    expect(providers.saveMagpieProvider).not.toHaveBeenCalled()
    expect(providers.mutateMagpieProviderKey).not.toHaveBeenCalled()
  })

  it("retains a created provider when its later key addition fails, without replaying it", async () => {
    vi.mocked(providers.saveMagpieProvider).mockImplementation(
      async (_, payload) => [
        fixture({
          id: String(payload.id),
          keyList: [{ id: "primary", active: true, on: true, masked: "***" }],
        }),
      ],
    )
    vi.mocked(providers.mutateMagpieProviderKey).mockRejectedValue(
      new MagpieApiError("rejected", 403, true, true),
    )
    const result = await createMagpieResource(config, {
      fields: { name: "New", key: "sk-primary" },
      keyPool: {
        add: [
          { key: "sk-extra", name: "Extra", protocol: "", weight: 1, on: true },
        ],
        update: [],
        remove: [],
      },
    })
    expect(result.outcome).toBe("partial")
    expect(providers.saveMagpieProvider).toHaveBeenCalledTimes(1)
    expect(providers.mutateMagpieProviderKey).toHaveBeenCalledTimes(1)
  })
  it("discovers editor models using draft endpoints, headers and the saved key without saving", async () => {
    const session = await magpieManagedResourceRegistration.open()
    const page = await session.list()
    const editor = await session.openEditEditor(page.items[0]!.ref)
    vi.mocked(providers.readMagpieProviderKey).mockResolvedValue("saved-key")
    vi.mocked(providers.discoverMagpieModels).mockResolvedValue(["new-model"])
    const result = await editor.loadOptions?.("supportedModels", {
      ...editor.initialValues,
      name: "",
      chat: "https://draft.test/v1",
      proxy: "direct",
      headers: '{"X-Tenant":"team"}',
      modelsURL: "https://draft.test/catalog/models?region=us",
      catalog: "openai, anthropic",
    })
    expect(result).toEqual([{ value: "new-model" }])
    expect(providers.discoverMagpieModels).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        chat: "https://draft.test/v1",
        key: "saved-key",
        proxy: "direct",
        headers: { "X-Tenant": "team" },
        modelsURL: "https://draft.test/catalog/models?region=us",
        catalog: "openai, anthropic",
      }),
      undefined,
    )
    expect(providers.saveMagpieProvider).not.toHaveBeenCalled()
  })

  it("uses a replacement key for discovery and rejects invalid drafts before any request", async () => {
    const session = await magpieManagedResourceRegistration.open()
    const editor = await session.openCreateEditor()
    vi.mocked(providers.discoverMagpieModels).mockResolvedValue([])
    const values = {
      ...editor.initialValues,
      anthropic: "https://claude.test",
      baseAPI: "anthropic",
      key: { kind: "replace" as const, value: "new-key" },
    }
    expect(await editor.loadOptions!("supportedModels", values)).toEqual([])
    expect(providers.discoverMagpieModels).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        anthropic: "https://claude.test",
        key: "new-key",
      }),
      undefined,
    )
    expect(providers.readMagpieProviderKey).not.toHaveBeenCalled()
    vi.mocked(providers.discoverMagpieModels).mockClear()
    await expect(
      editor.loadOptions!("supportedModels", {
        ...values,
        headers: '[["", "unfinished"]]',
      }),
    ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
    expect(providers.discoverMagpieModels).not.toHaveBeenCalled()
  })

  it("discovers models for an existing keyless provider without trying to reveal a missing key", async () => {
    vi.mocked(providers.listMagpieProviders).mockResolvedValue([
      fixture({ key: { set: false, optional: true, masked: "" } }),
    ])
    const session = await magpieManagedResourceRegistration.open()
    const page = await session.list()
    const editor = await session.openEditEditor(page.items[0]!.ref)
    vi.mocked(providers.discoverMagpieModels).mockResolvedValue(["local-model"])
    await editor.loadOptions!("supportedModels", editor.initialValues)
    expect(providers.readMagpieProviderKey).not.toHaveBeenCalled()
    expect(providers.discoverMagpieModels).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ key: "" }),
      undefined,
    )
  })
  it("retains a created resource when cancellation happens before the second step dispatches", async () => {
    vi.mocked(providers.saveMagpieProvider).mockImplementation(
      async (_, payload) => [fixture({ id: String(payload.id) })],
    )
    vi.mocked(providers.setMagpieProviderEnabled).mockRejectedValue(
      new DOMException("Aborted", "AbortError"),
    )
    expect(
      await createMagpieResource(config, {
        fields: { name: "New" },
        enabled: false,
      }),
    ).toMatchObject({
      outcome: "partial",
      completion: "rejected",
      confirmedEffects: [{ kind: "resource-created" }],
    })
  })

  it("requires a status readback matching the requested disabled state", async () => {
    vi.mocked(providers.setMagpieProviderEnabled).mockResolvedValue([
      fixture({ off: false }),
    ])
    expect(
      await updateMagpieResource(config, fixture(), {
        fields: {},
        enabled: false,
      }),
    ).toMatchObject({ outcome: "uncertain" })
  })

  it("creates under a unique id and confirms the saved provider before disabling it", async () => {
    vi.mocked(providers.saveMagpieProvider).mockImplementation(
      async (_, payload) => [fixture({ id: String(payload.id) })],
    )
    vi.mocked(providers.setMagpieProviderEnabled).mockImplementation(
      async (_, id) => [fixture({ id, off: true })],
    )
    const result = await createMagpieResource(config, {
      fields: { name: "New", key: "test-key" },
      enabled: false,
    })
    expect(result).toMatchObject({
      outcome: "succeeded",
      data: { off: true },
      confirmedEffects: [
        { kind: "resource-created" },
        { kind: "status-updated" },
      ],
    })
    expect(providers.saveMagpieProvider).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        new: true,
        id: expect.stringMatching(/^aah-/),
      }),
      undefined,
    )
  })

  it("reports the already-created provider if disabling is rejected", async () => {
    vi.mocked(providers.saveMagpieProvider).mockImplementation(
      async (_, payload) => [fixture({ id: String(payload.id) })],
    )
    vi.mocked(providers.setMagpieProviderEnabled).mockRejectedValue(
      new MagpieApiError("rejected", 401, true, true),
    )
    expect(
      await createMagpieResource(config, {
        fields: { name: "New" },
        enabled: false,
      }),
    ).toMatchObject({
      outcome: "partial",
      completion: "rejected",
      confirmedEffects: [{ kind: "resource-created" }],
    })
    expect(providers.saveMagpieProvider).toHaveBeenCalledTimes(1)
  })

  it.each([400, undefined])(
    "never replays a possibly applied save (%s)",
    async (status) => {
      vi.mocked(providers.saveMagpieProvider).mockRejectedValue(
        new MagpieApiError("lost", status, true, false),
      )
      expect(
        await createMagpieResource(config, { fields: { name: "New" } }),
      ).toMatchObject({ outcome: "uncertain" })
      expect(providers.saveMagpieProvider).toHaveBeenCalledTimes(1)
    },
  )

  it("requires its exact saved id instead of accepting an arbitrary returned row", async () => {
    vi.mocked(providers.saveMagpieProvider).mockResolvedValue([fixture()])
    expect(
      await createMagpieResource(config, { fields: { name: "New" } }),
    ).toMatchObject({ outcome: "uncertain" })
  })

  it("preserves a concurrent native edit and never submits a masked key", async () => {
    const fresh = fixture({
      headers: { "X-Current": "keep" },
      chosen: ["new-model"],
      responses: "https://response.test/v1",
      modelsURL: "https://fresh.test/models",
      balanceURL: "https://fresh.test/balance?key={key}",
      balancePath: "data.balance",
      catalog: "deepseek",
      fallback: ["backup/model"],
      contexts: { m1: 128000 },
      unlisted: true,
      searches: true,
      unredacted: true,
    })
    vi.mocked(providers.listMagpieProviders).mockResolvedValue([fresh])
    vi.mocked(providers.saveMagpieProvider).mockResolvedValue([
      fixture({ ...fresh, name: "Renamed" }),
    ])
    expect(
      await updateMagpieResource(config, fixture(), {
        fields: { name: "Renamed" },
      }),
    ).toMatchObject({ outcome: "succeeded" })
    const payload = vi.mocked(providers.saveMagpieProvider).mock.calls[0]![1]
    expect(payload).toMatchObject({
      name: "Renamed",
      models: ["new-model"],
      headers: fresh.headers,
      responses: fresh.responses,
      modelsURL: fresh.modelsURL,
      balanceURL: fresh.balanceURL,
      balancePath: fresh.balancePath,
      catalog: fresh.catalog,
      fallback: fresh.fallback,
      contexts: fresh.contexts,
      unlisted: true,
      searches: true,
      unredacted: true,
    })
    expect(payload).not.toHaveProperty("key")
  })

  it("changes status through the native toggle without rewriting the provider", async () => {
    vi.mocked(providers.setMagpieProviderEnabled).mockResolvedValue([
      fixture({ off: true }),
    ])
    expect(
      await updateMagpieResource(config, fixture(), {
        fields: {},
        enabled: false,
      }),
    ).toMatchObject({ outcome: "succeeded" })
    expect(providers.saveMagpieProvider).not.toHaveBeenCalled()
  })

  it("only confirms deletion after the selected id disappears", async () => {
    vi.mocked(providers.deleteMagpieProvider)
      .mockResolvedValueOnce([fixture()])
      .mockResolvedValueOnce([])
    expect(await deleteMagpieResource(config, "relay")).toMatchObject({
      outcome: "uncertain",
    })
    expect(await deleteMagpieResource(config, "relay")).toMatchObject({
      outcome: "succeeded",
    })
  })

  it("refuses API-key writes to subscription-owned providers", async () => {
    vi.mocked(providers.listMagpieProviders).mockResolvedValue([
      fixture({ account: { agent: "codex" } }),
    ])
    await expect(
      updateMagpieResource(config, fixture(), { fields: { name: "No" } }),
    ).rejects.toMatchObject({ failure: { code: "permission_denied" } })
    await expect(deleteMagpieResource(config, "relay")).rejects.toMatchObject({
      failure: { code: "permission_denied" },
    })
    expect(providers.saveMagpieProvider).not.toHaveBeenCalled()
    expect(providers.deleteMagpieProvider).not.toHaveBeenCalled()
  })

  it("rejects a different deployment scope before reading its provider", async () => {
    const workspace = await magpieManagedResourceRegistration.open()
    await expect(
      workspace.get({
        siteType: "magpie",
        kind: "channel",
        scopeKey: "http://other.test",
        resourceId: "relay",
      }),
    ).rejects.toBeDefined()
    expect(providers.listMagpieProviders).not.toHaveBeenCalled()
  })
})

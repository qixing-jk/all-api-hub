import { afterEach, expect, it, vi } from "vitest"

import { magpieManagedResourceRegistration } from "~/services/apiAdapters/managedResources/magpie"
import { magpieKeyFingerprint } from "~/services/apiService/magpie/keyIdentity"

vi.mock("~/services/managedSites/configuration/runtimeConfig", () => ({
  getManagedSiteRuntimeConfigForType: vi.fn(async () => ({
    siteType: "magpie",
    config: { baseUrl: "http://magpie.test", webKey: "web-key" },
  })),
}))

afterEach(() => vi.unstubAllGlobals())

it.each([
  ["https://other.test/v1", "https://relay.test/v1"],
  ["invalid-address", "also-invalid"],
])(
  "refuses an existing target whose fresh endpoint cannot match the import (%s)",
  async (currentUrl, importUrl) => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("?k=")) return Response.json({})
      expect(url.endsWith("/api/providers")).toBe(true)
      return Response.json({
        providers: [
          {
            id: "existing",
            name: "Coding",
            chat: currentUrl,
            responses: "",
            anthropic: "",
            chosen: null,
            models: [],
            off: false,
            key: { set: true, masked: "***", optional: false },
            keyList: [],
          },
        ],
      })
    })
    vi.stubGlobal("fetch", fetchMock)
    const workspace = await magpieManagedResourceRegistration.open()
    await expect(
      workspace.appendImportCredentials!(
        {
          siteType: "magpie",
          kind: "channel",
          scopeKey: "http://magpie.test",
          resourceId: "existing",
        },
        {
          kind: "managed-channel-import",
          name: "New",
          channelType: "chat",
          baseUrl: importUrl,
          credential: "key-new",
          models: [],
          enabled: true,
          notes: "",
        },
      ),
    ).rejects.toMatchObject({ failure: { code: "resource_changed" } })
    expect(
      fetchMock.mock.calls.every(
        ([url]) => url.includes("?k=") || url.endsWith("/api/providers"),
      ),
    ).toBe(true)
  },
)

it("appends missing keys to an existing provider without saving or replacing its configuration", async () => {
  const oldId = await magpieKeyFingerprint("key-existing")
  const provider = {
    id: "existing",
    name: "Coding group",
    chat: "https://relay.test/v1",
    responses: "",
    anthropic: "",
    chosen: null,
    models: [],
    off: true,
    key: { set: true, masked: "***", optional: false },
    keyList: [{ id: oldId, masked: "***", active: true, on: true, weight: 7 }],
    headers: { "X-Tenant": "keep" },
  }
  const fetchMock = vi.fn(async (url: string, options: RequestInit) => {
    if (url.includes("?k=")) return Response.json({})
    if (url.endsWith("/api/keys/add")) {
      const payload = JSON.parse(String(options.body))
      expect(payload.id).toBe("existing")
      provider.keyList.push({
        id: await magpieKeyFingerprint(payload.key),
        masked: "***",
        active: false,
        on: true,
        weight: 1,
      })
    } else expect(url.endsWith("/api/providers")).toBe(true)
    return Response.json({ providers: [provider] })
  })
  vi.stubGlobal("fetch", fetchMock)
  const workspace = await magpieManagedResourceRegistration.open()
  expect(
    await workspace.appendImportCredentials!(
      {
        siteType: "magpie",
        kind: "channel",
        scopeKey: "http://magpie.test",
        resourceId: "existing",
      },
      {
        kind: "managed-channel-import",
        name: "New name",
        channelType: "chat",
        baseUrl: "https://relay.test/v1",
        credential: "key-existing",
        credentials: ["key-existing", "key-new"],
        models: ["new-model"],
        enabled: true,
        notes: "replace",
      },
    ),
  ).toMatchObject({ outcome: "succeeded" })
  expect(provider).toMatchObject({
    id: "existing",
    name: "Coding group",
    chosen: null,
    off: true,
    headers: { "X-Tenant": "keep" },
  })
  expect(provider.keyList).toHaveLength(2)
  expect(provider.keyList[0]).toMatchObject({
    id: oldId,
    active: true,
    weight: 7,
  })
  expect(
    fetchMock.mock.calls.filter(([url]) => url.endsWith("/api/keys/add")),
  ).toHaveLength(1)
  // Fresh replay sees both native identities and must not change their metadata.
  await workspace.appendImportCredentials!(
    {
      siteType: "magpie",
      kind: "channel",
      scopeKey: "http://magpie.test",
      resourceId: "existing",
    },
    {
      kind: "managed-channel-import",
      name: "New name",
      channelType: "chat",
      baseUrl: "https://relay.test/v1",
      credential: "key-existing",
      credentials: ["key-existing", "key-new"],
      models: ["new-model"],
      enabled: true,
      notes: "replace",
    },
  )
  expect(
    fetchMock.mock.calls.filter(([url]) => url.endsWith("/api/keys/add")),
  ).toHaveLength(1)
  expect(provider.keyList[0]?.weight).toBe(7)
})

it("opens one provider editor with all imported keys and native routing defaults", async () => {
  const workspace = await magpieManagedResourceRegistration.open()
  const editor = await workspace.openCreateEditor({
    seed: {
      kind: "managed-channel-import",
      name: "Same site",
      channelType: "chat",
      credential: "key-first",
      credentials: ["key-first", "key-second"],
      baseUrl: "https://relay.test/v1",
      models: ["m1"],
      enabled: true,
      notes: "",
    },
  })
  expect(editor.initialValues.keyPool).toMatchObject({
    kind: "secret-list",
    entries: [
      { secret: { kind: "replace", value: "key-first" } },
      { secret: { kind: "replace", value: "key-second" } },
    ],
  })
  expect(editor.validate(editor.initialValues)).toMatchObject({ valid: true })
})

it("shares authentication across two native imports and their final inventory refresh", async () => {
  const providers: unknown[] = []
  const fetchMock = vi.fn(async (url: string, options: RequestInit) => {
    if (url.includes("?k=")) return Response.json({})
    if (url.endsWith("/api/provider/save")) {
      const payload = JSON.parse(String(options.body))
      providers.push({
        id: payload.id,
        name: payload.name,
        chat: payload.chat,
        responses: "",
        anthropic: "",
        key: { set: true, masked: "***", optional: false },
        chosen: payload.chosen ?? [],
        models: [],
        off: false,
      })
    }
    return Response.json({ providers })
  })
  vi.stubGlobal("fetch", fetchMock)
  const workspace = await magpieManagedResourceRegistration.open()
  for (const name of ["First", "Second"]) {
    const editor = await workspace.openCreateEditor({
      seed: {
        kind: "managed-channel-import",
        name,
        channelType: "chat",
        credential: `key-${name}`,
        baseUrl: "https://relay.test/v1",
        models: ["m1"],
        enabled: true,
        notes: "",
      },
    })
    expect(await editor.submit(editor.initialValues)).toMatchObject({
      outcome: "succeeded",
    })
  }
  expect((await workspace.list()).items).toHaveLength(2)
  expect(
    fetchMock.mock.calls.filter(([url]) => url.includes("?k=")),
  ).toHaveLength(1)
})

import { afterEach, expect, it, vi } from "vitest"

import { magpieManagedResourceRegistration } from "~/services/apiAdapters/managedResources/magpie"

vi.mock("~/services/managedSites/configuration/runtimeConfig", () => ({
  getManagedSiteRuntimeConfigForType: vi.fn(async () => ({
    siteType: "magpie",
    config: { baseUrl: "http://magpie.test", webKey: "web-key" },
  })),
}))

afterEach(() => vi.unstubAllGlobals())

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

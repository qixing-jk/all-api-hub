import { webcrypto } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ResourceSecretListValue } from "~/services/apiAdapters/contracts/resourceNative"
import { cliProxyApiManagedResourceRegistration } from "~/services/apiAdapters/managedResources/cliProxyApi"
import {
  cliProxyApiManagementUrl,
  type CliProxyApiProvider,
  type CliProxyApiProviderKind,
} from "~/services/apiService/cliProxyApi"

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    getPreferences: async () => ({
      cliProxyApi: {
        baseUrl: "http://localhost:8317/proxy/v0/management",
        adminToken: "management-secret",
      },
    }),
  },
}))

let inventory: Record<CliProxyApiProviderKind, CliProxyApiProvider[]>
let writes: { method: string; kind: string; body: unknown }[]
const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto)
  inventory = {
    "openai-compatibility": [
      {
        name: "Primary",
        "base-url": "https://upstream.example/v1",
        "api-key-entries": [
          {
            "api-key": "upstream-secret",
            "proxy-url": "socks5://localhost:1080",
          },
        ],
        models: [{ name: "model", alias: "alias", context: 123 }],
        headers: { "X-Example": "keep" },
        disabled: true,
        priority: 9,
      },
    ],
    "codex-api-key": [],
    "claude-api-key": [],
    "gemini-api-key": [],
    "vertex-api-key": [],
    "xai-api-key": [],
    "interactions-api-key": [],
  }
  writes = []
  fetchMock
    .mockReset()
    .mockImplementation(async (input: URL, init: RequestInit) => {
      const url = new URL(input)
      expect(url.pathname).toMatch(/^\/proxy\/v0\/management\//)
      expect(init.headers).toMatchObject({
        Authorization: "Bearer management-secret",
      })
      expect(init.redirect).toBe("error")
      const kind = url.pathname.split("/").at(-1) as CliProxyApiProviderKind
      const method = init.method ?? "GET"
      const body = init.body ? JSON.parse(String(init.body)) : undefined
      if (method === "GET")
        return Response.json({ [kind]: structuredClone(inventory[kind]) })
      writes.push({ method, kind, body })
      if (method === "PUT") inventory[kind] = body
      if (method === "PATCH")
        inventory[kind][body.index] = {
          ...inventory[kind][body.index],
          ...body.value,
        }
      if (method === "DELETE")
        inventory[kind].splice(Number(url.searchParams.get("index")), 1)
      return Response.json({ status: "ok" })
    })
  vi.stubGlobal("fetch", fetchMock)
})

const workspace = () => cliProxyApiManagedResourceRegistration.open()

describe("CLIProxyAPI native managed resources", () => {
  it("removes selected credentials while preserving retained native metadata", async () => {
    const entry = inventory["openai-compatibility"][0]
    entry["api-key-entries"]!.push({
      "api-key": "retained-secret",
      "proxy-url": "http://retained.example",
      weight: 7,
    })
    const api = await workspace()
    const target = (await api.list()).items[0].ref
    const cleanup = await api.openKeyCleanup!(target)
    expect(cleanup.keys).toEqual(["upstream-secret", "retained-secret"])
    await cleanup.remove([0])
    expect(inventory["openai-compatibility"][0]).toEqual({
      ...entry,
      "api-key-entries": [
        {
          "api-key": "retained-secret",
          "proxy-url": "http://retained.example",
          weight: 7,
        },
      ],
    })
  })
  it.each([
    ["type", "unsupported"],
    ["name", ""],
    ["baseURL", ""],
    ["baseURL", "invalid-url"],
    ["baseURL", "file:///tmp/model"],
    ["supportedModels", "model=alias=duplicate"],
    ["headers", "missing-colon"],
    ["credentials", "invalid-list"],
  ])("rejects invalid %s before an import can write", async (field, value) => {
    const editor = await (await workspace()).openCreateEditor()
    const values = {
      ...editor.initialValues,
      name: "Provider",
      baseURL: "https://upstream.example",
      credentials: { kind: "secret-list" as const, entries: [] },
      [field]: value,
    }
    expect(editor.validate(values)).toMatchObject({
      valid: false,
      issues: [{ fieldId: field }],
    })
    expect(writes).toEqual([])
  })

  it.each([400, 401, 403, 404, 500])(
    "maps HTTP %s into a controlled list failure",
    async (status) => {
      fetchMock.mockResolvedValueOnce(
        new Response("sensitive-backend-body", { status }),
      )
      await expect((await workspace()).list()).rejects.toMatchObject({
        failure: {
          code: (
            {
              400: "upstream_rejected",
              401: "authentication_failed",
              403: "permission_denied",
              404: "not_found",
              500: "unavailable",
            } as Record<number, string>
          )[status],
        },
      })
      expect(writes).toEqual([])
    },
  )

  it("detects duplicate creation without changing existing providers", async () => {
    const view = await workspace()
    const editor = await view.openCreateEditor()
    const result = await editor.submit({
      ...editor.initialValues,
      name: "Primary",
      baseURL: "https://upstream.example/v1",
      credentials: { kind: "secret-list", entries: [] },
    })
    expect(result).toMatchObject({ outcome: "rejected" })
    expect(writes).toEqual([])
  })

  it("rejects secret access after a provider disappears or becomes ambiguous", async () => {
    const view = await workspace()
    const ref = (await view.list()).items[0].ref
    inventory["openai-compatibility"].push(
      structuredClone(inventory["openai-compatibility"][0]),
    )
    await expect(view.openEditEditor(ref)).rejects.toMatchObject({
      failure: { code: "validation_failed" },
    })
    inventory["openai-compatibility"] = []
    await expect(view.openEditEditor(ref)).rejects.toMatchObject({
      failure: { code: "not_found" },
    })
    expect(writes).toEqual([])
  })

  it("rejects a provider changed between the editor read and the final pre-write inventory", async () => {
    const view = await workspace()
    const editor = await view.openEditEditor((await view.list()).items[0].ref)
    const original = fetchMock.getMockImplementation()!
    let reads = 0
    fetchMock.mockImplementation((input, init) => {
      if (init.method === undefined || init.method === "GET") {
        reads++
        if (reads === 2)
          inventory["openai-compatibility"][0].headers = {
            "X-Remote": "changed",
          }
      }
      return original(input, init)
    })
    expect(
      await editor.submit({ ...editor.initialValues, name: "Renamed" }),
    ).toMatchObject({
      outcome: "rejected",
      diagnostic: { code: "resource_changed" },
    })
    expect(writes).toEqual([])
  })

  it("reports an unpersisted create as uncertain despite an acknowledgment", async () => {
    const editor = await (await workspace()).openCreateEditor()
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((input, init) =>
      init.method === "PUT"
        ? Promise.resolve(Response.json({ status: "ok" }))
        : original(input, init),
    )
    expect(
      await editor.submit({
        ...editor.initialValues,
        name: "New",
        baseURL: "https://new.example",
        credentials: { kind: "secret-list", entries: [] },
      }),
    ).toMatchObject({ outcome: "uncertain" })
  })

  it.each([400, 500])(
    "distinguishes a rejected write from an uncertain HTTP %s outcome",
    async (status) => {
      const view = await workspace()
      const editor = await view.openEditEditor((await view.list()).items[0].ref)
      const original = fetchMock.getMockImplementation()!
      fetchMock.mockImplementation((input, init) =>
        init.method === "PATCH"
          ? Promise.resolve(new Response("private", { status }))
          : original(input, init),
      )
      expect(
        await editor.submit({ ...editor.initialValues, name: "Renamed" }),
      ).toMatchObject({ outcome: status === 400 ? "rejected" : "uncertain" })
    },
  )

  it("loads a native key and toggles native exclusion while retaining explicit model exclusions", async () => {
    inventory["codex-api-key"] = [
      {
        "api-key": "native-key",
        "base-url": "https://upstream.example",
        "excluded-models": ["excluded"],
      },
    ]
    const view = await workspace()
    const row = (await view.list()).items.find((item) =>
      item.ref.resourceId.startsWith("codex-api-key:"),
    )!
    const editor = await view.openEditEditor(row.ref)
    expect(await editor.loadSecret?.("key")).toBe("native-key")
    expect(
      await editor.submit({ ...editor.initialValues, status: false }),
    ).toMatchObject({ outcome: "succeeded" })
    expect(inventory["codex-api-key"][0]["excluded-models"]).toEqual([
      "excluded",
      "*",
    ])
  })
  it("accepts deployment roots and released management URLs with reverse-proxy prefixes", () => {
    expect(cliProxyApiManagementUrl("http://localhost:8317").href).toBe(
      "http://localhost:8317/v0/management",
    )
    expect(cliProxyApiManagementUrl("http://localhost:8317/proxy").href).toBe(
      "http://localhost:8317/proxy/v0/management",
    )
    expect(
      cliProxyApiManagementUrl("http://localhost:8317/proxy/v0/management/")
        .href,
    ).toBe("http://localhost:8317/proxy/v0/management")
  })

  it("lists safe facts and edits one provider without discarding native settings", async () => {
    const view = await workspace()
    const page = await view.list()
    expect(page.items).toHaveLength(1)
    expect(JSON.stringify(page)).not.toContain("upstream-secret")
    expect(page.items[0].status).toBe("disabled")
    const editor = await view.openEditEditor(page.items[0].ref)
    expect(editor.initialValues.key).toEqual({ kind: "unchanged" })
    const result = await editor.submit({
      ...editor.initialValues,
      name: "Renamed",
    })
    expect(result.outcome).toBe("succeeded")
    expect(inventory["openai-compatibility"][0]).toMatchObject({
      name: "Renamed",
      disabled: true,
      priority: 9,
      headers: { "X-Example": "keep" },
      "api-key-entries": [
        {
          "api-key": "upstream-secret",
          "proxy-url": "socks5://localhost:1080",
        },
      ],
      models: [{ context: 123 }],
    })
  })

  it("rejects stale editors before any mutation", async () => {
    const view = await workspace()
    const editor = await view.openEditEditor((await view.list()).items[0].ref)
    inventory["openai-compatibility"][0].priority = 10
    const result = await editor.submit({
      ...editor.initialValues,
      name: "Changed",
    })
    expect(result.outcome).toBe("rejected")
    expect(writes).toHaveLength(0)
  })

  it("finds the same resource after an unrelated list reorder", async () => {
    const view = await workspace()
    const ref = (await view.list()).items[0].ref
    inventory["openai-compatibility"].unshift({
      name: "Other",
      "base-url": "https://other.example",
      "api-key-entries": [],
    })
    fetchMock.mockClear()
    const result = await view.delete(ref)
    expect(
      fetchMock.mock.calls.map(([, init]) => init.method ?? "GET"),
    ).toEqual(["GET", "DELETE", "GET"])
    expect(result.outcome).toBe("succeeded")
    expect(inventory["openai-compatibility"].map((item) => item.name)).toEqual([
      "Other",
    ])
  })

  it("uses PUT for Gemini model replacement and retains other entries", async () => {
    inventory["gemini-api-key"] = [
      { "api-key": "gemini-secret", models: [{ name: "old" }] },
      { "api-key": "other-secret" },
    ]
    const view = await workspace()
    const item = (await view.list()).items.find((item) =>
      item.ref.resourceId.startsWith("gemini-api-key:"),
    )!
    const editor = await view.openEditEditor(item.ref)
    expect(
      (
        await editor.submit({
          ...editor.initialValues,
          supportedModels: "new = alias",
        })
      ).outcome,
    ).toBe("succeeded")
    expect(writes[0].method).toBe("PUT")
    expect(inventory["gemini-api-key"]).toHaveLength(2)
    expect(inventory["gemini-api-key"][0].models).toEqual([
      { name: "new", alias: "alias" },
    ])
  })

  it("creates from the shared managed import seed", async () => {
    const view = await workspace()
    const editor = await view.openCreateEditor({
      seed: {
        kind: "managed-channel-import",
        name: "New",
        channelType: "codex-api-key",
        credential: "new-secret",
        baseUrl: "https://codex.example",
        models: ["model"],
        enabled: true,
        orderingWeight: 1,
        priority: 0,
        notes: "",
      },
    })
    expect((await editor.submit(editor.initialValues)).outcome).toBe(
      "succeeded",
    )
    expect(inventory["codex-api-key"][0]["api-key"]).toBe("new-secret")
  })

  it("reports an uncertain write when the reply is lost", async () => {
    const view = await workspace()
    const editor = await view.openEditEditor((await view.list()).items[0].ref)
    const normal = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url, init) => {
      if (init.method !== "GET") throw new TypeError("network error")
      return normal(url, init)
    })
    expect(
      (await editor.submit({ ...editor.initialValues, name: "Changed" }))
        .outcome,
    ).toBe("uncertain")
  })

  it("rejects malformed inventory instead of treating it as an empty collection", async () => {
    fetchMock.mockResolvedValue(Response.json({ unrelated: [] }))
    await expect((await workspace()).list()).rejects.toMatchObject({
      failure: { code: "unavailable" },
    })
    expect(writes).toHaveLength(0)
  })

  it("keeps older deployments usable when later provider endpoints are absent", async () => {
    const normal = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url, init) => {
      if (/\/(vertex|xai|interactions)-api-key$/.test(String(url)))
        return new Response(null, { status: 404 })
      return normal(url, init)
    })
    expect((await (await workspace()).list()).items).toHaveLength(1)
  })

  it("does not hide authentication failures on later provider endpoints", async () => {
    const normal = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).endsWith("/xai-api-key"))
        return new Response(null, { status: 401 })
      return normal(url, init)
    })
    await expect((await workspace()).list()).rejects.toMatchObject({
      failure: { code: "authentication_failed" },
    })
  })

  it("does not report success when a backend ignores an edit", async () => {
    const view = await workspace()
    const editor = await view.openEditEditor((await view.list()).items[0].ref)
    const normal = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url, init) =>
      init.method === "PATCH"
        ? Response.json({ status: "ok" })
        : normal(url, init),
    )
    expect(
      (
        await editor.submit({
          ...editor.initialValues,
          supportedModels: "replacement",
        })
      ).outcome,
    ).toBe("uncertain")
  })
})

describe("CLIProxyAPI multiple credentials", () => {
  const open = async () => {
    inventory["openai-compatibility"][0]["api-key-entries"] = [
      {
        "api-key": "first-secret",
        "proxy-url": "socks5://localhost:1080",
        weight: 4,
        extension: { preserve: true },
      },
      {
        "api-key": "second-secret",
        "proxy-url": "http://localhost:1081",
        weight: -1,
      },
      { "api-key": "third-secret", weight: 2 },
    ]
    const view = await workspace()
    return view.openEditEditor((await view.list()).items[0].ref)
  }

  it("keeps saved keys out of projections and reveals only the requested row", async () => {
    const editor = await open()
    expect(
      JSON.stringify({ fields: editor.fields, values: editor.initialValues }),
    ).not.toContain("first-secret")
    expect(JSON.stringify(editor.initialValues)).not.toContain("second-secret")
    expect(await editor.loadSecret!("credentials:saved-0")).toBe("first-secret")
    expect(await editor.loadSecret!("credentials:saved-1")).toBe(
      "second-secret",
    )
    await expect(
      editor.loadSecret!("credentials:saved-99"),
    ).rejects.toBeDefined()
    await expect(editor.loadSecret!("key")).rejects.toBeDefined()
    expect(writes).toHaveLength(0)
  })

  it("rotates, adds, removes and reorders independent rows while preserving untouched fields", async () => {
    const editor = await open()
    const value = editor.initialValues.credentials as ResourceSecretListValue
    const result = await editor.submit({
      ...editor.initialValues,
      credentials: {
        kind: "secret-list",
        entries: [
          value.entries[1],
          {
            ...value.entries[0],
            secret: { kind: "replace", value: "rotated" },
            fields: { proxy_url: "http://localhost:8080", weight: "" },
          },
          {
            id: "added",
            secret: { kind: "replace", value: "new-secret" },
            fields: { proxy_url: "socks5h://localhost:1082", weight: "3" },
          },
        ],
      },
    })
    expect(result.outcome).toBe("succeeded")
    expect(inventory["openai-compatibility"][0]["api-key-entries"]).toEqual([
      {
        "api-key": "second-secret",
        "proxy-url": "http://localhost:1081",
        weight: -1,
      },
      {
        "api-key": "rotated",
        "proxy-url": "http://localhost:8080",
        extension: { preserve: true },
      },
      {
        "api-key": "new-secret",
        "proxy-url": "socks5h://localhost:1082",
        weight: 3,
      },
    ])
    expect(writes).toHaveLength(1)
    expect(writes[0].method).toBe("PATCH")
  })

  it("preserves all per-key fields during an unrelated edit", async () => {
    const editor = await open()
    const original = structuredClone(
      inventory["openai-compatibility"][0]["api-key-entries"],
    )
    expect(
      (await editor.submit({ ...editor.initialValues, name: "Renamed" }))
        .outcome,
    ).toBe("succeeded")
    expect(inventory["openai-compatibility"][0]["api-key-entries"]).toEqual(
      original,
    )
  })

  it.each([
    "duplicate-id",
    "unknown-saved",
    "empty-key",
    "invalid-proxy",
    "malformed-proxy",
    "cleared-key",
    "fractional-weight",
    "excess-weight",
  ])("rejects %s before writing", async (invalidCase) => {
    const editor = await open()
    const value = structuredClone(
      editor.initialValues.credentials,
    ) as ResourceSecretListValue
    const row = { ...value.entries[0], fields: { ...value.entries[0].fields } }
    let entries = [row]
    if (invalidCase === "duplicate-id") entries = [row, row]
    if (invalidCase === "unknown-saved") row.id = "unknown"
    if (invalidCase === "empty-key")
      row.secret = { kind: "replace", value: " " }
    if (invalidCase === "invalid-proxy") row.fields.proxy_url = "file:///tmp"
    if (invalidCase === "malformed-proxy") row.fields.proxy_url = "not a URL"
    if (invalidCase === "cleared-key") row.secret = { kind: "clear" }
    if (invalidCase === "fractional-weight") row.fields.weight = "1.5"
    if (invalidCase === "excess-weight") row.fields.weight = "1000001"
    expect(
      (
        await editor.submit({
          ...editor.initialValues,
          credentials: { kind: "secret-list", entries },
        })
      ).outcome,
    ).toBe("rejected")
    expect(writes).toHaveLength(0)
  })

  it("rejects stale row edits when another client changes the credential collection", async () => {
    const editor = await open()
    inventory["openai-compatibility"][0]["api-key-entries"]!.reverse()
    expect(
      (await editor.submit({ ...editor.initialValues, name: "Changed" }))
        .outcome,
    ).toBe("rejected")
    expect(writes).toHaveLength(0)
  })

  it("allows an empty credential list for an anonymous OpenAI-compatible upstream", async () => {
    const editor = await open()
    expect(
      (
        await editor.submit({
          ...editor.initialValues,
          credentials: { kind: "secret-list", entries: [] },
        })
      ).outcome,
    ).toBe("succeeded")
    expect(inventory["openai-compatibility"][0]["api-key-entries"]).toEqual([])
  })

  it("creates multiple credentials through the native create editor", async () => {
    const editor = await (await workspace()).openCreateEditor()
    const result = await editor.submit({
      ...editor.initialValues,
      name: "Multiple",
      baseURL: "https://multiple.example",
      credentials: {
        kind: "secret-list",
        entries: [
          {
            id: "a",
            secret: { kind: "replace", value: "key-a" },
            fields: { weight: "0" },
          },
          {
            id: "b",
            secret: { kind: "replace", value: "key-b" },
            fields: { proxy_url: "http://localhost:9999" },
          },
        ],
      },
    })
    expect(result.outcome).toBe("succeeded")
    expect(
      inventory["openai-compatibility"].at(-1)?.["api-key-entries"],
    ).toEqual([
      { "api-key": "key-a", "proxy-url": "", weight: 0 },
      { "api-key": "key-b", "proxy-url": "http://localhost:9999" },
    ])
  })
})

describe("CLIProxyAPI native management round trips", () => {
  it("reads an upstream provider whose optional models are null", async () => {
    inventory["openai-compatibility"][0].models =
      null as unknown as CliProxyApiProvider["models"]
    const view = await workspace()
    const page = await view.list()
    expect(page.items).toHaveLength(1)
    const editor = await view.openEditEditor(page.items[0].ref)
    expect(editor.initialValues.supportedModels).toBe("")
  })

  it("reports a stale edit as a controlled rejection code before any write", async () => {
    const view = await workspace()
    const editor = await view.openEditEditor((await view.list()).items[0].ref)
    inventory["openai-compatibility"][0]["api-key-entries"]![0].weight = 9
    const result = await editor.submit({
      ...editor.initialValues,
      name: "Changed",
    })
    expect(result.outcome).toBe("rejected")
    if (result.outcome === "rejected")
      expect(result.diagnostic.code).toBe("resource_changed")
    expect(writes).toHaveLength(0)
  })
})

it("rejects a stale draft and reloads native configuration with empty optional fields", async () => {
  const view = await workspace()
  const editor = await view.openEditEditor((await view.list()).items[0].ref)
  Object.assign(inventory["openai-compatibility"][0], {
    models: null,
    headers: null,
    "excluded-models": null,
  })
  inventory["openai-compatibility"][0]["api-key-entries"]![0].weight = 9
  const result = await editor.submit({
    ...editor.initialValues,
    name: "Must not overwrite",
  })
  expect(result.outcome).toBe("rejected")
  expect(writes).toHaveLength(0)
  const refreshed = await workspace()
  const page = await refreshed.list()
  expect(page.items).toHaveLength(1)
  const latest = await refreshed.openEditEditor(page.items[0].ref)
  expect(latest.initialValues.name).toBe("Primary")
  expect(latest.initialValues.supportedModels).toBe("")
  expect(
    (latest.initialValues.credentials as ResourceSecretListValue).entries[0]
      .fields.weight,
  ).toBe("9")
})

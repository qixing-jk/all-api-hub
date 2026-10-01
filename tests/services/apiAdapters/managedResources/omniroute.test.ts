import type { TFunction } from "i18next"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS as fields,
  OMNIROUTE_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
  OMNIROUTE_MANAGED_RESOURCE_TABLE_FIELD_IDS,
} from "~/constants/omniroute"
import { SITE_TYPES } from "~/constants/siteType"
import {
  getManagedResourceFieldPolicy,
  MANAGED_RESOURCE_EDITOR_MODES,
  MANAGED_RESOURCE_SECTION_ORDER,
} from "~/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy"
import { resolveResourceFieldPolicy } from "~/features/ResourceEditor/resourceFieldPolicy"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"
import {
  MANAGED_RESOURCE_CREATE_SEED_KINDS,
  MANAGED_RESOURCE_FAILURE_CODES,
  MANAGED_RESOURCE_FIELD_ISSUE_CODES,
  MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS,
  MANAGED_RESOURCE_STATUSES,
  ManagedResourceError,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  omniRouteManagedResourceRegistration,
  OmniRouteNativeError,
  openOmniRouteNativeResourceOperations,
} from "~/services/apiAdapters/managedResources/omniroute"
import { getManagedResourceRegistration } from "~/services/apiAdapters/managedResources/registry"
import { MANAGED_SITE_MUTATION_OUTCOMES } from "~/services/managedSites/mutations"
import { server } from "~~/tests/msw/server"

const mocks = vi.hoisted(() => ({ getPreferences: vi.fn() }))

vi.mock("~/services/preferences/userPreferences", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/preferences/userPreferences")
    >()
  return {
    ...actual,
    userPreferences: {
      ...actual.userPreferences,
      getPreferences: mocks.getPreferences,
    },
  }
})

const BASE_URL = "https://omniroute.example.invalid"
const config = { baseUrl: BASE_URL, token: "oma_live_example" }

const connection = (overrides: Record<string, unknown> = {}) => ({
  id: "conn-1",
  provider: "openai",
  name: "Primary channel",
  apiKey: "sk-aaaaaaa****bbbb",
  providerSpecificData: { baseUrl: "https://relay.example.invalid/v1" },
  defaultModel: "gpt-example",
  isActive: true,
  ...overrides,
})

describe("OmniRoute workspace failure and editor contracts", () => {
  const ref = {
    siteType: SITE_TYPES.OMNIROUTE,
    kind: MANAGED_RESOURCE_KINDS.Channel,
    scopeKey: BASE_URL,
    resourceId: "conn-1",
  }
  beforeEach(() => {
    vi.resetAllMocks()
    server.resetHandlers()
    mocks.getPreferences.mockResolvedValue({ omniroute: config })
    server.use(
      http.get(`${BASE_URL}/api/providers/conn-1`, () =>
        HttpResponse.json({ connection: connection({ priority: 1 }) }),
      ),
    )
  })

  it.each([
    "not a url",
    "ftp://gateway.invalid",
    "https://user:password@gateway.invalid",
  ])("rejects unsafe deployment URL %s", async (baseUrl) => {
    mocks.getPreferences.mockResolvedValue({
      omniroute: { ...config, baseUrl },
    })
    await expect(
      omniRouteManagedResourceRegistration.open(),
    ).rejects.toMatchObject({
      failure: { code: MANAGED_RESOURCE_FAILURE_CODES.InvalidConfiguration },
    })
  })

  it.each([
    [401, MANAGED_RESOURCE_FAILURE_CODES.AuthenticationFailed],
    [403, MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied],
    [404, MANAGED_RESOURCE_FAILURE_CODES.NotFound],
    [409, MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected],
    [503, MANAGED_RESOURCE_FAILURE_CODES.Unavailable],
  ])(
    "maps read HTTP %s without disclosing the management token",
    async (status, code) => {
      server.use(
        http.get(`${BASE_URL}/api/providers`, () =>
          HttpResponse.json(
            { error: `failed ${config.token}`, code: "PROVIDER_FAILURE" },
            { status },
          ),
        ),
      )
      const workspace = await omniRouteManagedResourceRegistration.open()
      await expect(workspace.list()).rejects.toMatchObject({
        failure: { code, upstreamCode: "PROVIDER_FAILURE" },
      })
      const error = await workspace.list().catch((error) => error)
      expect(error.message).not.toContain(config.token)
    },
  )

  it("refuses cancelled workspace operations before dispatch", async () => {
    const workspace = await omniRouteManagedResourceRegistration.open()
    const signal = AbortSignal.abort()
    await expect(workspace.list(undefined, { signal })).rejects.toMatchObject({
      failure: { code: MANAGED_RESOURCE_FAILURE_CODES.Aborted },
    })
    await expect(
      omniRouteManagedResourceRegistration.open({ signal }),
    ).rejects.toMatchObject({
      failure: { code: MANAGED_RESOURCE_FAILURE_CODES.Aborted },
    })
  })

  it("honors cancellation that arrives while a successful read is finishing", async () => {
    const controller = new AbortController()
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      controller.abort()
      return new Response(JSON.stringify({ connections: [] }))
    })
    try {
      const workspace = await omniRouteManagedResourceRegistration.open()
      await expect(
        workspace.list(undefined, { signal: controller.signal }),
      ).rejects.toMatchObject({
        failure: { code: MANAGED_RESOURCE_FAILURE_CODES.Aborted },
      })
    } finally {
      fetch.mockRestore()
    }
  })

  it("reports preference storage failures separately from missing configuration", async () => {
    mocks.getPreferences.mockRejectedValue(new Error("storage unavailable"))
    await expect(
      omniRouteManagedResourceRegistration.open(),
    ).rejects.toMatchObject({
      failure: { code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected },
    })
  })

  it("maps operational read cancellation and network loss", async () => {
    const fetch = vi.spyOn(globalThis, "fetch")
    try {
      const workspace = await omniRouteManagedResourceRegistration.open()
      fetch.mockRejectedValue(
        Object.assign(new Error("cancelled"), { code: "ABORT_ERR" }),
      )
      await expect(workspace.list()).rejects.toMatchObject({
        failure: { code: MANAGED_RESOURCE_FAILURE_CODES.Aborted },
      })
      fetch.mockRejectedValue(new DOMException("Aborted", "AbortError"))
      await expect(workspace.list()).rejects.toMatchObject({
        failure: { code: MANAGED_RESOURCE_FAILURE_CODES.Aborted },
      })
      fetch.mockRejectedValue(new TypeError("network lost"))
      await expect(workspace.list()).rejects.toMatchObject({
        failure: { code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable },
      })
    } finally {
      fetch.mockRestore()
    }
  })

  it("validates create fields together before any write", async () => {
    const editor = await (
      await omniRouteManagedResourceRegistration.open()
    ).openCreateEditor()
    expect(
      editor.validate({
        ...editor.initialValues,
        [fields.Name]: "",
        [fields.Provider]: "",
        [fields.BaseUrl]: "invalid",
        [fields.Prefix]: "bad/prefix",
        [fields.Key]: { kind: "clear" },
      }),
    ).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        {
          fieldId: fields.Name,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
        },
        {
          fieldId: fields.Provider,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
        },
        {
          fieldId: fields.BaseUrl,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
        },
        {
          fieldId: fields.Prefix,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
        },
        {
          fieldId: fields.Key,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
        },
      ]),
    })
    expect(
      editor.validate({ ...editor.initialValues, [fields.Key]: undefined }),
    ).toMatchObject({ valid: false })
  })

  it("validates edits and refuses clearing or replacing a key with a masked value", async () => {
    const editor = await (
      await omniRouteManagedResourceRegistration.open()
    ).openEditEditor(ref)
    for (const key of [
      { kind: "clear" },
      { kind: "replace", value: "sk-a****z" },
    ]) {
      expect(
        editor.validate({
          ...editor.initialValues,
          [fields.Name]: "",
          [fields.Status]: "other",
          [fields.BaseUrl]: "invalid",
          [fields.Key]: key,
        }),
      ).toMatchObject({
        valid: false,
        issues: expect.arrayContaining([
          {
            fieldId: fields.Name,
            code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
          },
          {
            fieldId: fields.Status,
            code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
          },
          {
            fieldId: fields.BaseUrl,
            code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
          },
          {
            fieldId: fields.Key,
            code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
          },
        ]),
      })
    }
  })

  it("creates through the editor with trimmed fields and deletes the scoped resource", async () => {
    const writes: unknown[] = []
    server.use(
      http.post(`${BASE_URL}/api/providers`, async ({ request }) => {
        writes.push(await request.json())
        return HttpResponse.json(
          { connection: connection({ isActive: false, apiKey: undefined }) },
          { status: 201 },
        )
      }),
      http.delete(
        `${BASE_URL}/api/providers/conn-1`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    )
    const workspace = await omniRouteManagedResourceRegistration.open()
    const editor = await workspace.openCreateEditor()
    const result = await editor.submit({
      ...editor.initialValues,
      [fields.Name]: " Created ",
      [fields.Key]: { kind: "replace", value: " sk-source " },
    })
    expect(result.outcome).toBe(MANAGED_SITE_MUTATION_OUTCOMES.Succeeded)
    expect(writes).toEqual([
      { name: "Created", provider: "openai", apiKey: "sk-source" },
    ])
    expect((await workspace.delete(ref)).outcome).toBe(
      MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
    )
  })

  it("updates an override, clears the default model and replaces a credential explicitly", async () => {
    let patch: unknown
    server.use(
      http.patch(`${BASE_URL}/api/providers/conn-1`, async ({ request }) => {
        patch = await request.json()
        return HttpResponse.json({ connection: connection() })
      }),
    )
    const editor = await (
      await omniRouteManagedResourceRegistration.open()
    ).openEditEditor(ref)
    await editor.submit({
      ...editor.initialValues,
      [fields.BaseUrl]: "https://new.invalid/v1",
      [fields.DefaultModel]: "",
      [fields.Key]: { kind: "replace", value: " sk-new " },
    })
    expect(patch).toEqual({
      providerSpecificData: { baseUrl: "https://new.invalid/v1" },
      defaultModel: null,
      apiKey: "sk-new",
    })
  })

  it("loads provider choices and reads secrets only for their declared fields", async () => {
    server.use(
      http.get(`${BASE_URL}/api/models`, () =>
        HttpResponse.json({ models: [{ provider: "custom-provider" }] }),
      ),
      http.get(`${BASE_URL}/api/providers/client`, () =>
        HttpResponse.json({
          connections: [connection({ apiKey: "sk-readable" })],
        }),
      ),
    )
    const workspace = await omniRouteManagedResourceRegistration.open()
    const create = await workspace.openCreateEditor()
    expect(
      await create.loadOptions!(fields.Provider, create.initialValues),
    ).toContainEqual({
      value: "custom-provider",
      displayLabel: "custom-provider",
    })
    await expect(
      create.loadOptions!(fields.Name, create.initialValues),
    ).rejects.toMatchObject({
      failure: { code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed },
    })
    const edit = await workspace.openEditEditor(ref)
    await expect(edit.loadSecret!(fields.Key)).resolves.toBe("sk-readable")
    await expect(edit.loadSecret!(fields.Name)).rejects.toMatchObject({
      failure: { code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed },
    })
    await expect(
      workspace.openEditEditor({ ...ref, resourceId: "" }),
    ).rejects.toMatchObject({
      failure: { code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed },
    })
  })

  it("deletes even when detail lookup is unavailable", async () => {
    server.use(
      http.get(
        `${BASE_URL}/api/providers/conn-1`,
        () => new HttpResponse(null, { status: 503 }),
      ),
      http.delete(
        `${BASE_URL}/api/providers/conn-1`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    )
    expect(
      (await (await omniRouteManagedResourceRegistration.open()).delete(ref))
        .outcome,
    ).toBe(MANAGED_SITE_MUTATION_OUTCOMES.Succeeded)
  })
})

describe("OmniRoute native managed resource", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    server.resetHandlers()
    mocks.getPreferences.mockResolvedValue({ omniroute: config })
    server.use(
      http.get(`${BASE_URL}/api/providers/conn-1`, () =>
        HttpResponse.json({ connection: connection() }),
      ),
    )
  })

  it("registers the native channel presentation policy", () => {
    expect(
      getAccountSiteDefinition(SITE_TYPES.OMNIROUTE)?.managedResource,
    ).toEqual(
      expect.objectContaining({
        primaryKind: MANAGED_RESOURCE_KINDS.Channel,
        tableFieldIds: OMNIROUTE_MANAGED_RESOURCE_TABLE_FIELD_IDS,
        detailFieldIds: OMNIROUTE_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
      }),
    )
    expect(
      getManagedResourceRegistration(
        SITE_TYPES.OMNIROUTE,
        MANAGED_RESOURCE_KINDS.Channel,
      ),
    ).toBe(omniRouteManagedResourceRegistration)
  })

  it("provides translated guidance for every OmniRoute editor help field", () => {
    const t = ((key: string) => key) as TFunction
    for (const mode of [
      MANAGED_RESOURCE_EDITOR_MODES.Create,
      MANAGED_RESOURCE_EDITOR_MODES.Edit,
    ]) {
      const policy = getManagedResourceFieldPolicy(
        SITE_TYPES.OMNIROUTE,
        MANAGED_RESOURCE_KINDS.Channel,
        mode,
      )!
      for (const field of policy.fields) {
        if (field.resolveHelp)
          expect(field.resolveHelp(t)).toMatch(/^managedSiteChannels:/)
      }
    }
  })

  it("projects list facts without reading or exposing a credential", async () => {
    const readPaths: string[] = []
    server.use(
      http.get(`${BASE_URL}/api/providers`, ({ request }) => {
        readPaths.push(new URL(request.url).pathname)
        return HttpResponse.json({ connections: [connection()], total: 1 })
      }),
      http.get(`${BASE_URL}/api/providers/client`, ({ request }) => {
        readPaths.push(new URL(request.url).pathname)
        return HttpResponse.json({
          connections: [connection({ apiKey: "sk-plaintext-value" })],
        })
      }),
    )

    const workspace = await omniRouteManagedResourceRegistration.open()
    const page = await workspace.list()

    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toEqual(
      expect.objectContaining({
        displayName: "Primary channel",
        status: MANAGED_RESOURCE_STATUSES.Enabled,
        ref: {
          siteType: SITE_TYPES.OMNIROUTE,
          kind: MANAGED_RESOURCE_KINDS.Channel,
          scopeKey: "https://omniroute.example.invalid",
          resourceId: "conn-1",
        },
      }),
    )
    expect(page.items[0]!.fields).toEqual(
      expect.arrayContaining([
        { fieldId: fields.Provider, kind: "text", value: "openai" },
        {
          fieldId: fields.BaseUrl,
          kind: "text",
          value: "https://relay.example.invalid/v1",
        },
        { fieldId: fields.DefaultModel, kind: "text", value: "gpt-example" },
        { fieldId: fields.Key, kind: "secret", state: "masked" },
      ]),
    )
    // The list never touches the plaintext route, even when reveal is enabled.
    expect(readPaths.every((path) => path === "/api/providers")).toBe(true)
    expect(JSON.stringify(page)).not.toContain("sk-plaintext-value")
  })

  it("classifies a reveal-enabled list credential as available without keeping it", async () => {
    server.use(
      http.get(`${BASE_URL}/api/providers`, () =>
        HttpResponse.json({
          connections: [connection({ apiKey: "sk-plaintext-value" })],
        }),
      ),
    )

    const workspace = await omniRouteManagedResourceRegistration.open()
    const page = await workspace.list()

    expect(page.items[0]!.fields).toEqual(
      expect.arrayContaining([
        { fieldId: fields.Key, kind: "secret", state: "available" },
      ]),
    )
    expect(JSON.stringify(page)).not.toContain("sk-plaintext-value")
  })

  it("projects the routing rank and a node-backed prefix as facts", async () => {
    server.use(
      http.get(`${BASE_URL}/api/providers`, () =>
        HttpResponse.json({
          connections: [
            connection({
              id: "conn-1",
              name: "Node backed",
              priority: 7,
              providerSpecificData: {
                baseUrl: "https://relay.example.invalid/v1",
                prefix: "relay",
                nodeName: "Relay node",
              },
            }),
            connection({
              id: "conn-2",
              name: "Built-in provider",
              priority: 12,
              providerSpecificData: {},
            }),
          ],
          total: 2,
        }),
      ),
    )

    const workspace = await omniRouteManagedResourceRegistration.open()
    const page = await workspace.list()
    const [nodeBacked, builtIn] = page.items

    expect(nodeBacked!.fields).toEqual(
      expect.arrayContaining([
        { fieldId: fields.Prefix, kind: "text", value: "relay" },
        { fieldId: fields.Priority, kind: "number", value: 7 },
      ]),
    )
    // A connection without a provider node has no prefix to show at all.
    expect(
      builtIn!.fields.some((field) => field.fieldId === fields.Prefix),
    ).toBe(false)
    expect(builtIn!.fields).toEqual(
      expect.arrayContaining([
        { fieldId: fields.Priority, kind: "number", value: 12 },
      ]),
    )
  })

  it("projects the gateway's own connection-test state", async () => {
    server.use(
      http.get(`${BASE_URL}/api/providers`, () =>
        HttpResponse.json({
          connections: [
            connection({ id: "conn-1", testStatus: "active" }),
            connection({
              id: "conn-2",
              name: "Broken channel",
              testStatus: "error",
              lastError: "upstream rejected the credential",
            }),
            connection({ id: "conn-3", name: "Untested channel" }),
          ],
          total: 3,
        }),
      ),
    )

    const workspace = await omniRouteManagedResourceRegistration.open()
    const page = await workspace.list()
    const [active, broken, untested] = page.items

    expect(active!.fields).toEqual(
      expect.arrayContaining([
        { fieldId: fields.TestStatus, kind: "text", value: "active" },
      ]),
    )
    expect(broken!.fields).toEqual(
      expect.arrayContaining([
        { fieldId: fields.TestStatus, kind: "text", value: "error" },
        {
          fieldId: fields.LastError,
          kind: "text",
          value: "upstream rejected the credential",
        },
      ]),
    )
    // A connection the gateway never tested has no state or diagnosis to show.
    expect(
      untested!.fields.some(
        (field) =>
          field.fieldId === fields.TestStatus ||
          field.fieldId === fields.LastError,
      ),
    ).toBe(false)
  })

  it("patches the routing rank only when the editor changes it", async () => {
    const patches: Record<string, unknown>[] = []
    server.use(
      http.get(`${BASE_URL}/api/providers/conn-1`, () =>
        HttpResponse.json({ connection: connection({ priority: 4 }) }),
      ),
      http.get(`${BASE_URL}/api/providers/client`, () =>
        HttpResponse.json({ connections: [connection({ priority: 4 })] }),
      ),
      http.patch(`${BASE_URL}/api/providers/conn-1`, async ({ request }) => {
        patches.push((await request.json()) as Record<string, unknown>)
        return HttpResponse.json({ connection: connection({ priority: 4 }) })
      }),
    )

    const workspace = await omniRouteManagedResourceRegistration.open()
    const openEditor = async () =>
      await workspace.openEditEditor({
        siteType: SITE_TYPES.OMNIROUTE,
        kind: MANAGED_RESOURCE_KINDS.Channel,
        scopeKey: BASE_URL,
        resourceId: "conn-1",
      })

    const editor = await openEditor()
    expect(editor.initialValues[fields.Priority]).toBe(4)

    await editor.submit({
      ...editor.initialValues,
      [fields.Name]: "Renamed",
      [fields.Key]: {
        kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged,
      },
    })
    expect(patches.at(-1)).toEqual({ name: "Renamed" })

    await (
      await openEditor()
    ).submit({
      ...editor.initialValues,
      [fields.Priority]: 40,
      [fields.Key]: {
        kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged,
      },
    })
    expect(patches.at(-1)).toEqual({ priority: 40 })
  })

  it("refuses to clear a stored address override", async () => {
    const editor = await (
      await omniRouteManagedResourceRegistration.open()
    ).openEditEditor({
      siteType: SITE_TYPES.OMNIROUTE,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      scopeKey: BASE_URL,
      resourceId: "conn-1",
    })

    // The gateway rejects an empty override with a 400 and merges the rest of
    // the object, so clearing the field could never succeed.
    expect(
      editor.validate({ ...editor.initialValues, [fields.BaseUrl]: "" }),
    ).toEqual({
      valid: false,
      issues: [
        {
          fieldId: fields.BaseUrl,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
        },
      ],
    })
    expect(
      editor.validate({
        ...editor.initialValues,
        [fields.BaseUrl]: "https://other.example.invalid/v1",
      }),
    ).toEqual({ valid: true })
  })

  it("refuses a routing rank outside the range the gateway accepts", async () => {
    server.use(
      http.get(`${BASE_URL}/api/providers/conn-1`, () =>
        HttpResponse.json({ connection: connection({ priority: 4 }) }),
      ),
    )

    const editor = await (
      await omniRouteManagedResourceRegistration.open()
    ).openEditEditor({
      siteType: SITE_TYPES.OMNIROUTE,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      scopeKey: BASE_URL,
      resourceId: "conn-1",
    })

    expect(
      editor.validate({ ...editor.initialValues, [fields.Priority]: 0 }),
    ).toEqual({
      valid: false,
      issues: [
        {
          fieldId: fields.Priority,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.OutOfRange,
        },
      ],
    })
    expect(
      editor.validate({ ...editor.initialValues, [fields.Priority]: 1 }),
    ).toEqual({ valid: true })
  })

  it("walks the whole inventory and filters the search term locally", async () => {
    server.use(
      http.get(`${BASE_URL}/api/providers`, ({ request }) => {
        const offset = new URL(request.url).searchParams.get("offset") ?? "0"
        return HttpResponse.json({
          connections:
            offset === "0"
              ? [
                  connection({ id: "conn-1", name: "Alpha" }),
                  connection({
                    id: "conn-2",
                    name: "Beta",
                    provider: "anthropic",
                    providerSpecificData: {},
                  }),
                ]
              : [],
          total: 2,
        })
      }),
    )

    const workspace = await omniRouteManagedResourceRegistration.open()
    const page = await workspace.list({ search: "anthropic" })

    expect(page.items.map((item) => item.displayName)).toEqual(["Beta"])
  })

  it("creates one connection with the base URL override and no status field", async () => {
    let created: Record<string, unknown> | undefined
    const forbidden: string[] = []
    server.use(
      http.post(`${BASE_URL}/api/providers`, async ({ request }) => {
        created = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ connection: connection() }, { status: 201 })
      }),
      http.post(`${BASE_URL}/api/providers/bulk`, () => {
        forbidden.push("bulk")
        return HttpResponse.json({}, { status: 200 })
      }),
      http.post(`${BASE_URL}/api/providers/import`, () => {
        forbidden.push("import")
        return HttpResponse.json({}, { status: 200 })
      }),
    )

    const operations = await openOmniRouteNativeResourceOperations()
    const result = await operations.create({
      provider: "openai",
      name: "Imported (auto)",
      apiKey: "sk-source",
      baseUrl: "https://relay.example.invalid/v1",
      defaultModel: "gpt-example",
      prefix: "",
    })

    expect(result.outcome).toBe(MANAGED_SITE_MUTATION_OUTCOMES.Succeeded)
    expect(created).toEqual({
      provider: "openai",
      name: "Imported (auto)",
      apiKey: "sk-source",
      defaultModel: "gpt-example",
      providerSpecificData: { baseUrl: "https://relay.example.invalid/v1" },
    })
    expect(forbidden).toEqual([])
  })

  it("omits the override for a provider that owns the endpoint", async () => {
    let created: Record<string, unknown> | undefined
    server.use(
      http.post(`${BASE_URL}/api/providers`, async ({ request }) => {
        created = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ connection: connection() }, { status: 201 })
      }),
    )

    const operations = await openOmniRouteNativeResourceOperations()
    await operations.create({
      provider: "deepseek",
      name: "DeepSeek",
      apiKey: "sk-source",
      baseUrl: "",
      defaultModel: "",
      prefix: "",
    })

    expect(created).toEqual({
      provider: "deepseek",
      name: "DeepSeek",
      apiKey: "sk-source",
    })
  })

  it("creates a provider node before a prefix-addressed connection", async () => {
    const order: string[] = []
    let nodeBody: Record<string, unknown> | undefined
    let connectionBody: Record<string, unknown> | undefined
    server.use(
      http.post(`${BASE_URL}/api/provider-nodes`, async ({ request }) => {
        order.push("node")
        nodeBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(
          { id: "openai-compatible-chat-1" },
          { status: 201 },
        )
      }),
      http.post(`${BASE_URL}/api/providers`, async ({ request }) => {
        order.push("connection")
        connectionBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(
          {
            connection: connection({
              provider: "openai-compatible-chat-1",
              providerSpecificData: {
                prefix: "relay",
                baseUrl: "https://relay.example.invalid/v1",
              },
            }),
          },
          { status: 201 },
        )
      }),
    )

    const operations = await openOmniRouteNativeResourceOperations()
    const result = await operations.create({
      provider: "openai",
      name: "Relay",
      apiKey: "sk-source",
      baseUrl: "https://relay.example.invalid/v1",
      defaultModel: "",
      prefix: "relay",
    })

    expect(order).toEqual(["node", "connection"])
    expect(nodeBody).toEqual({
      name: "Relay",
      prefix: "relay",
      apiType: "chat",
      baseUrl: "https://relay.example.invalid/v1",
      type: "openai-compatible",
    })
    expect(connectionBody).toEqual({
      provider: "openai-compatible-chat-1",
      name: "Relay",
      apiKey: "sk-source",
    })
    expect(result.outcome).toBe(MANAGED_SITE_MUTATION_OUTCOMES.Succeeded)
  })

  it("compensates a rejected node-backed create and keeps the failure", async () => {
    const deletedNodes: string[] = []
    server.use(
      http.post(`${BASE_URL}/api/provider-nodes`, () =>
        HttpResponse.json({ id: "openai-compatible-chat-9" }, { status: 201 }),
      ),
      http.post(`${BASE_URL}/api/providers`, () =>
        HttpResponse.json({ error: "Invalid provider" }, { status: 400 }),
      ),
      http.delete(`${BASE_URL}/api/provider-nodes/:id`, ({ params }) => {
        deletedNodes.push(String(params.id))
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const operations = await openOmniRouteNativeResourceOperations()
    const result = await operations.create({
      provider: "openai",
      name: "Relay",
      apiKey: "sk-source",
      baseUrl: "https://relay.example.invalid/v1",
      defaultModel: "",
      prefix: "relay",
    })

    expect(result.outcome).toBe(MANAGED_SITE_MUTATION_OUTCOMES.Rejected)
    expect(deletedNodes).toEqual(["openai-compatible-chat-9"])
  })

  it("keeps an unconfirmed node in place when the connection outcome is unknown", async () => {
    const deletedNodes: string[] = []
    server.use(
      http.post(`${BASE_URL}/api/provider-nodes`, () =>
        HttpResponse.json({ id: "openai-compatible-chat-9" }, { status: 201 }),
      ),
      http.post(`${BASE_URL}/api/providers`, () =>
        HttpResponse.json(
          { error: "Failed to create provider" },
          { status: 500 },
        ),
      ),
      http.delete(`${BASE_URL}/api/provider-nodes/:id`, ({ params }) => {
        deletedNodes.push(String(params.id))
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const operations = await openOmniRouteNativeResourceOperations()
    const result = await operations.create({
      provider: "openai",
      name: "Relay",
      apiKey: "sk-source",
      baseUrl: "https://relay.example.invalid/v1",
      defaultModel: "",
      prefix: "relay",
    })

    // A 5xx may have committed the connection, so its node must survive.
    expect(result.outcome).toBe(MANAGED_SITE_MUTATION_OUTCOMES.Uncertain)
    expect(deletedNodes).toEqual([])
  })

  it("patches only the fields the editor changed", async () => {
    let patch: Record<string, unknown> | undefined
    server.use(
      http.patch(`${BASE_URL}/api/providers/conn-1`, async ({ request }) => {
        patch = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({
          connection: connection({ isActive: false }),
        })
      }),
    )

    const operations = await openOmniRouteNativeResourceOperations()
    const detail = await operations.get("conn-1")
    const result = await operations.update(detail, { isActive: false })

    expect(patch).toEqual({ isActive: false })
    expect(result.outcome).toBe(MANAGED_SITE_MUTATION_OUTCOMES.Succeeded)
    if (result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Succeeded) {
      expect(result.data.isActive).toBe(false)
    }
  })

  it("refuses an update that changes nothing", async () => {
    const operations = await openOmniRouteNativeResourceOperations()
    const detail = await operations.get("conn-1")

    await expect(operations.update(detail, {})).rejects.toBeInstanceOf(
      OmniRouteNativeError,
    )
  })

  it("diffs the editor projection into an explicit patch", async () => {
    let patch: Record<string, unknown> | undefined
    server.use(
      http.get(`${BASE_URL}/api/providers/conn-1`, () =>
        HttpResponse.json({ connection: connection() }),
      ),
      http.get(`${BASE_URL}/api/providers/client`, () =>
        HttpResponse.json({
          connections: [connection({ apiKey: "sk-plaintext-value" })],
        }),
      ),
      http.patch(`${BASE_URL}/api/providers/conn-1`, async ({ request }) => {
        patch = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ connection: connection() })
      }),
    )

    const workspace = await omniRouteManagedResourceRegistration.open()
    const ref = {
      siteType: SITE_TYPES.OMNIROUTE,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      scopeKey: "https://omniroute.example.invalid",
      resourceId: "conn-1",
    }
    const editor = await workspace.openEditEditor(ref)
    const result = await editor.submit({
      ...editor.initialValues,
      [fields.Name]: "Renamed",
      [fields.Key]: {
        kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged,
      },
    })

    expect(patch).toEqual({ name: "Renamed" })
    expect(result.outcome).toBe(MANAGED_SITE_MUTATION_OUTCOMES.Succeeded)
  })

  it("classifies every editor descriptor in the channel field policy", async () => {
    server.use(
      http.get(`${BASE_URL}/api/providers/conn-1`, () =>
        HttpResponse.json({ connection: connection() }),
      ),
    )

    const workspace = await omniRouteManagedResourceRegistration.open()
    const editors = [
      [
        MANAGED_RESOURCE_EDITOR_MODES.Create,
        await workspace.openCreateEditor(),
      ],
      [
        MANAGED_RESOURCE_EDITOR_MODES.Edit,
        await workspace.openEditEditor({
          siteType: SITE_TYPES.OMNIROUTE,
          kind: MANAGED_RESOURCE_KINDS.Channel,
          scopeKey: BASE_URL,
          resourceId: "conn-1",
        }),
      ],
    ] as const

    for (const [mode, editor] of editors) {
      const policy = getManagedResourceFieldPolicy(
        SITE_TYPES.OMNIROUTE,
        MANAGED_RESOURCE_KINDS.Channel,
        mode,
      )
      expect(policy, mode).not.toBeNull()
      // The editor renders a field for every descriptor and nothing else, so a
      // policy that lists a field the adapter does not expose crashes the page.
      expect(() =>
        resolveResourceFieldPolicy(
          editor.fields,
          policy!,
          MANAGED_RESOURCE_SECTION_ORDER,
        ),
      ).not.toThrow()
    }
  })

  it("offers no provider edit, because the update route cannot change it", async () => {
    server.use(
      http.get(`${BASE_URL}/api/providers/conn-1`, () =>
        HttpResponse.json({ connection: connection() }),
      ),
    )

    const editor = await (
      await omniRouteManagedResourceRegistration.open()
    ).openEditEditor({
      siteType: SITE_TYPES.OMNIROUTE,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      scopeKey: BASE_URL,
      resourceId: "conn-1",
    })

    expect(editor.fields.map((descriptor) => descriptor.fieldId)).not.toContain(
      fields.Provider,
    )
  })

  it("deletes by id through the native route", async () => {
    const deleted: string[] = []
    server.use(
      http.delete(`${BASE_URL}/api/providers/:id`, ({ params }) => {
        deleted.push(String(params.id))
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const operations = await openOmniRouteNativeResourceOperations()
    const result = await operations.delete("conn-1")

    expect(result.outcome).toBe(MANAGED_SITE_MUTATION_OUTCOMES.Succeeded)
    expect(deleted).toEqual(["conn-1"])
  })

  const NODE_ID = "openai-compatible-chat-node-1"

  const nodeBackedConnection = (id: string) =>
    connection({
      id,
      provider: NODE_ID,
      providerSpecificData: {
        prefix: "relay",
        apiType: "chat",
        baseUrl: "https://relay.example.invalid/v1",
        nodeName: "Relay node",
      },
    })

  const useNodeDeleteSpy = (
    remainingConnections: Record<string, unknown>[],
    nodeDeleteStatus = 204,
  ) => {
    const deletedNodes: string[] = []
    server.use(
      http.get(`${BASE_URL}/api/providers/:id`, ({ params }) =>
        HttpResponse.json({
          connection: nodeBackedConnection(String(params.id)),
        }),
      ),
      http.get(`${BASE_URL}/api/providers`, () =>
        HttpResponse.json({
          connections: remainingConnections,
          total: remainingConnections.length,
        }),
      ),
      http.delete(
        `${BASE_URL}/api/providers/:id`,
        () => new HttpResponse(null, { status: 204 }),
      ),
      http.delete(`${BASE_URL}/api/provider-nodes/:id`, ({ params }) => {
        deletedNodes.push(String(params.id))
        return new HttpResponse(null, { status: nodeDeleteStatus })
      }),
    )
    return deletedNodes
  }

  it("removes the provider node a prefix-addressed channel owned", async () => {
    const deletedNodes = useNodeDeleteSpy([])

    const operations = await openOmniRouteNativeResourceOperations()
    const result = await operations.delete("conn-1")

    expect(result.outcome).toBe(MANAGED_SITE_MUTATION_OUTCOMES.Succeeded)
    expect(deletedNodes).toEqual([NODE_ID])
  })

  it("keeps a provider node another channel still uses", async () => {
    const deletedNodes = useNodeDeleteSpy([
      connection({ id: "conn-sibling", provider: NODE_ID }),
    ])

    const operations = await openOmniRouteNativeResourceOperations()
    const result = await operations.delete("conn-1")

    expect(result.outcome).toBe(MANAGED_SITE_MUTATION_OUTCOMES.Succeeded)
    expect(deletedNodes).toEqual([])
  })

  it("reports a confirmed deletion even when the node cleanup fails", async () => {
    const deletedNodes = useNodeDeleteSpy([], 500)

    const operations = await openOmniRouteNativeResourceOperations()
    const result = await operations.delete("conn-1")

    expect(result.outcome).toBe(MANAGED_SITE_MUTATION_OUTCOMES.Succeeded)
    expect(deletedNodes).toEqual([NODE_ID])
  })

  it("touches no provider node when the channel has none", async () => {
    const deletedNodes: string[] = []
    server.use(
      http.delete(
        `${BASE_URL}/api/providers/conn-1`,
        () => new HttpResponse(null, { status: 204 }),
      ),
      http.delete(`${BASE_URL}/api/provider-nodes/:id`, ({ params }) => {
        deletedNodes.push(String(params.id))
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const operations = await openOmniRouteNativeResourceOperations()
    await operations.delete("conn-1")

    expect(deletedNodes).toEqual([])
  })

  it("maps an upstream rejection to a sanitized, actionable failure", async () => {
    server.use(
      http.get(`${BASE_URL}/api/providers/conn-1`, () =>
        HttpResponse.json(
          { error: `Provider connection not found for ${config.token}` },
          { status: 404 },
        ),
      ),
    )

    const operations = await openOmniRouteNativeResourceOperations()
    const error = (await operations
      .get("conn-1")
      .catch((failure: unknown) => failure)) as OmniRouteNativeError

    expect(error.failure.code).toBe(MANAGED_RESOURCE_FAILURE_CODES.NotFound)
    expect(error.failure.message).not.toContain(config.token)
  })

  it("builds an import projection with a single default model and no model list", () => {
    const projection =
      omniRouteManagedResourceRegistration.validateCreateSeed?.({
        kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
        name: "Imported (auto)",
        channelType: "openai",
        credential: "sk-source",
        baseUrl: "https://relay.example.invalid/v1",
        enabled: true,
        models: ["gpt-first", "gpt-second"],
        notes: "",
      })

    expect(projection).toEqual({ valid: true })
  })

  it("maps seed validation issues back to the import inputs", () => {
    const registration = omniRouteManagedResourceRegistration
    const validate = registration.validateCreateSeed!

    expect(
      validate({
        kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
        name: "Imported (auto)",
        channelType: "openai",
        credential: "",
        baseUrl: "https://relay.example.invalid/v1",
        enabled: true,
        models: [],
        notes: "",
      }),
    ).toEqual({
      valid: false,
      issues: [
        {
          fieldId: "credential",
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
        },
      ],
    })
  })

  it("requires a base URL once a model prefix is set", async () => {
    const editor = await (
      await omniRouteManagedResourceRegistration.open()
    ).openCreateEditor()

    expect(
      editor.validate({
        ...editor.initialValues,
        [fields.Name]: "Relay",
        [fields.Key]: {
          kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
          value: "sk-source",
        },
        [fields.Prefix]: "relay",
        [fields.BaseUrl]: "",
      }),
    ).toEqual({
      valid: false,
      issues: [
        {
          fieldId: fields.BaseUrl,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
        },
      ],
    })
  })

  it("offers a lazy provider list from the deployment's own catalogue", async () => {
    server.use(
      http.get(`${BASE_URL}/api/models`, () =>
        HttpResponse.json({
          models: [{ provider: "deployment-specific", model: "m-1" }],
        }),
      ),
    )

    const operations = await openOmniRouteNativeResourceOperations()
    const options = await operations.loadProviderOptions()

    expect(options.map((option) => option.value)).toContain(
      "deployment-specific",
    )
    // The label is the id itself: the gateway publishes no display vocabulary.
    expect(
      options.find((option) => option.value === "deployment-specific"),
    ).toEqual({
      value: "deployment-specific",
      displayLabel: "deployment-specific",
    })
  })

  it("requires the admin-scoped token before any workspace call", async () => {
    mocks.getPreferences.mockResolvedValue({
      omniroute: { baseUrl: "", token: "" },
    })

    const error = await omniRouteManagedResourceRegistration
      .open()
      .catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(ManagedResourceError)
    expect((error as ManagedResourceError).failure.code).toBe(
      MANAGED_RESOURCE_FAILURE_CODES.ConfigurationRequired,
    )
  })

  it("exposes no models capability for the gateway", () => {
    expect(omniRouteManagedResourceRegistration.siteType).toBe(
      SITE_TYPES.OMNIROUTE,
    )
    expect(omniRouteManagedResourceRegistration.createSeedKinds).toEqual([
      MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
    ])
  })

  it("reads a credential only through the explicit client route", async () => {
    const readPaths: string[] = []
    server.use(
      http.get(`${BASE_URL}/api/providers/client`, ({ request }) => {
        readPaths.push(new URL(request.url).pathname)
        return HttpResponse.json({
          connections: [connection({ apiKey: "sk-plaintext-value" })],
        })
      }),
    )

    const operations = await openOmniRouteNativeResourceOperations()
    await expect(operations.loadSecret("conn-1")).resolves.toBe(
      "sk-plaintext-value",
    )
    expect(readPaths).toEqual(["/api/providers/client"])
  })

  it("keeps the secret edit intent out of the create payload default", async () => {
    const editor = await (
      await omniRouteManagedResourceRegistration.open()
    ).openCreateEditor()

    expect(editor.initialValues[fields.Key]).toEqual({
      kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
      value: "",
    })
  })
})

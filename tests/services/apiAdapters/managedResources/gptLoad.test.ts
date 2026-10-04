import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS as fields } from "~/constants/gptLoad"
import { SITE_TYPES } from "~/constants/siteType"
import {
  adaptManagedCredentialPolicy,
  getManagedResourceFieldPolicy,
  MANAGED_RESOURCE_EDITOR_MODES,
  MANAGED_RESOURCE_SECTION_ORDER,
} from "~/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy"
import { resolveResourceFieldPolicy } from "~/features/ResourceEditor/resourceFieldPolicy"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  MANAGED_RESOURCE_CREATE_SEED_KINDS,
  type EditableResourceProjection,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  openGptLoadNativeResourceOperations,
  type GptLoadGroupEditorCommand,
} from "~/services/apiAdapters/managedResources/gptLoad"
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

const BASE_URL = "https://gpt-load.example.invalid"
const config = { baseUrl: BASE_URL, managementKey: "auth-key-example" }

const envelope = (data: unknown) =>
  HttpResponse.json({ code: 0, message: "ok", data })

const groupRow = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: "Primary",
  channel_id: "openai_compatible",
  channel_name: "OpenAI Compatible",
  params: { base_url: "https://relay.example.invalid/v1" },
  enabled: true,
  status: "available",
  price_multiplier: "1",
  model_names: ["gpt-example"],
  credential_counts: { total: 2, available: 2 },
  ...overrides,
})

const registration = () =>
  getManagedResourceRegistration(
    SITE_TYPES.GPT_LOAD,
    MANAGED_RESOURCE_KINDS.Channel,
  )!

describe("gpt-load native workspace", () => {
  it.each([
    [401, "authentication_failed"],
    [423, "authentication_failed"],
    [403, "permission_denied"],
    [404, "not_found"],
    [409, "upstream_rejected"],
    [422, "upstream_rejected"],
    [500, "unavailable"],
  ])("maps inventory errors to native failures (%s)", async (status, code) => {
    server.use(
      http.get(`${BASE_URL}/api/modern/groups`, () =>
        HttpResponse.json(
          { code: "FAILED", message: "auth-key-example denied" },
          { status },
        ),
      ),
      http.get(`${BASE_URL}/api/groups`, () =>
        HttpResponse.json({ code: "FAILED" }, { status }),
      ),
    )
    const workspace = await registration().open()
    await expect(workspace.list()).rejects.toMatchObject({ failure: { code } })
  })

  it.each([
    "ftp://server.invalid",
    "https://user:pass@server.invalid",
    "not a url",
  ])("rejects invalid deployment addresses (%s)", async (baseUrl) => {
    mocks.getPreferences.mockResolvedValue({ gptLoad: { ...config, baseUrl } })
    await expect(registration().open()).rejects.toMatchObject({
      failure: { code: "invalid_configuration" },
    })
  })

  it("requires configuration and honors pre-dispatch cancellation", async () => {
    mocks.getPreferences.mockResolvedValue({})
    await expect(registration().open()).rejects.toMatchObject({
      failure: { code: "configuration_required" },
    })
    const controller = new AbortController()
    controller.abort()
    await expect(
      openGptLoadNativeResourceOperations({ signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" })
  })

  it("filters secret-free inventory by endpoint, name and model", async () => {
    server.use(
      http.get(`${BASE_URL}/api/modern/groups`, () =>
        envelope({
          items: [
            groupRow({ weight: 5, enabled: false }),
            groupRow({ id: 2, name: "Other", model_names: [] }),
          ],
        }),
      ),
    )
    const workspace = await registration().open()
    for (const search of ["primary", "gpt-example"]) {
      const result = await workspace.list({ search })
      expect(result.items).toHaveLength(1)
      expect(result.items[0]).toMatchObject({
        displayName: "Primary",
        status: "disabled",
      })
    }
    expect((await workspace.list({ search: "absent" })).items).toEqual([])
  })

  it("validates required create fields and loads authoritative drivers", async () => {
    server.use(
      http.get(`${BASE_URL}/api/channels`, () =>
        envelope({
          items: [
            { channel_id: "openai", name: "OpenAI" },
            { channel_id: "custom" },
          ],
        }),
      ),
    )
    const workspace = await registration().open()
    const editor = await workspace.openCreateEditor()
    expect(
      await editor.validate({
        ...editor.initialValues,
        [fields.Provider]: "",
        [fields.BaseUrl]: "ftp://bad",
      }),
    ).toMatchObject({ valid: false })
    expect(
      await editor.loadOptions!(fields.Provider, editor.initialValues),
    ).toMatchObject([{ value: "openai" }, { value: "custom" }])
    await expect(
      editor.loadOptions!("unknown", editor.initialValues),
    ).rejects.toBeTruthy()
    await expect(
      workspace.openEditEditor({
        siteType: SITE_TYPES.GPT_LOAD,
        kind: MANAGED_RESOURCE_KINDS.Channel,
        scopeKey: BASE_URL,
        resourceId: "bad",
      }),
    ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
  })

  it("never creates a native group without a credential", async () => {
    const ops = await openGptLoadNativeResourceOperations()
    await expect(
      ops.create({
        name: "Empty",
        channelId: "openai",
        baseUrl: "",
        models: [],
        priceMultiplier: "1",
      }),
    ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
  })

  it("supports masked editor metadata, explicit reveal and all editable settings", async () => {
    let settings = groupRow({ weight_manual: 10 })
    let models = ["gpt-example"]
    const writes: string[] = []
    server.use(
      http.get(`${BASE_URL}/api/groups/1/settings`, () => envelope(settings)),
      http.get(`${BASE_URL}/api/groups/1/models`, () =>
        envelope({ items: models.map((id) => ({ id })) }),
      ),
      http.get(`${BASE_URL}/api/groups/1/credentials`, () =>
        envelope({
          items: [
            {
              credential_id: 11,
              mask: "sk-plain",
              effective_status: "available",
            },
          ],
        }),
      ),
      http.post(`${BASE_URL}/api/groups/1/credentials/11/reveal`, () =>
        envelope({ credential: { api_key: "sk-revealed" } }),
      ),
      http.get(`${BASE_URL}/api/models`, () =>
        envelope({ items: [{ client_model: "gpt-new" }] }),
      ),
      http.put(`${BASE_URL}/api/groups/1/settings`, async ({ request }) => {
        settings = { ...settings, ...((await request.json()) as object) }
        writes.push("settings")
        return envelope(settings)
      }),
      http.put(`${BASE_URL}/api/groups/1/models`, async ({ request }) => {
        models = (
          (await request.json()) as { models: { id: string }[] }
        ).models.map((row) => row.id)
        writes.push("models")
        return envelope({})
      }),
    )
    const workspace = await registration().open()
    const ref = {
      siteType: SITE_TYPES.GPT_LOAD,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      scopeKey: BASE_URL,
      resourceId: "1",
    }
    const editor = await workspace.openEditEditor(ref)
    expect(
      await editor.validate({
        ...editor.initialValues,
        [fields.Name]: "",
        [fields.Status]: "invalid",
        [fields.BaseUrl]: "http://user:pass@bad.invalid",
      }),
    ).toMatchObject({ valid: false })
    expect(
      await editor.loadOptions!(fields.Models, editor.initialValues),
    ).toMatchObject([{ value: "gpt-new" }])
    await expect(
      editor.loadOptions!(fields.Provider, editor.initialValues),
    ).rejects.toBeTruthy()
    const ops = await openGptLoadNativeResourceOperations()
    expect(await ops.loadSecret(1)).toEqual([
      { id: "11", key: "sk-revealed", fields: {} },
    ])
    expect(await editor.loadSecret!(`${fields.Key}:11`)).toBe("sk-revealed")
    const result = await editor.submit({
      ...editor.initialValues,
      [fields.Name]: "Updated",
      [fields.Status]: "disabled",
      [fields.BaseUrl]: "",
      [fields.Models]: ["gpt-new"],
      [fields.Weight]: 20,
      [fields.PriceMultiplier]: "2",
    })
    expect(result).toMatchObject({ outcome: "succeeded" })
    expect(settings).toMatchObject({
      name: "Updated",
      params: {},
      enabled: false,
      price_multiplier: "2",
      weight_manual: 20,
    })
    expect(writes).toEqual(["settings", "models"])
    const reopened = await workspace.openEditEditor(ref)
    expect(reopened.initialValues[fields.Status]).toBe("disabled")
  })

  it("replaces a saved credential by importing before deleting its old ID", async () => {
    const writes: string[] = []
    server.use(
      http.get(`${BASE_URL}/api/groups/1/settings`, () => envelope(groupRow())),
      http.get(`${BASE_URL}/api/groups/1/models`, () =>
        envelope({ items: [] }),
      ),
      http.get(`${BASE_URL}/api/groups/1/credentials`, () =>
        envelope({ items: [{ credential_id: 11 }] }),
      ),
      http.post(`${BASE_URL}/api/groups/1/credentials/import`, () => {
        writes.push("import")
        return envelope({})
      }),
      http.delete(`${BASE_URL}/api/groups/1/credentials/11`, () => {
        writes.push("delete")
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const ops = await openGptLoadNativeResourceOperations()
    const detail = await ops.get(1)
    const result = await ops.update(detail, {
      name: "Primary",
      channelId: detail.group.channelId,
      baseUrl: detail.group.baseUrl,
      priceMultiplier: "1",
      weight: null,
      models: [],
      credentialPatch: {
        baseline: "",
        entries: [
          {
            id: "11",
            fields: {},
            secret: { kind: "replace", value: "sk-new" },
          },
        ],
      },
    })
    expect(result.outcome).toBe("succeeded")
    expect(writes).toEqual(["import", "delete"])
  })

  it("maps cancellation during a reveal and stops the remaining pool", async () => {
    const controller = new AbortController()
    const laterReveal = vi.fn()
    server.use(
      http.get(`${BASE_URL}/api/groups/1/credentials`, () =>
        envelope({ items: [{ credential_id: 11 }, { credential_id: 12 }] }),
      ),
      http.post(`${BASE_URL}/api/groups/1/credentials/11/reveal`, () => {
        controller.abort()
        return envelope({ credential: { api_key: "sk-first" } })
      }),
      http.post(`${BASE_URL}/api/groups/1/credentials/12/reveal`, laterReveal),
    )
    const ops = await openGptLoadNativeResourceOperations()
    await expect(
      ops.loadSecret(1, { signal: controller.signal }),
    ).rejects.toMatchObject({ failure: { code: "aborted" } })
    expect(laterReveal).not.toHaveBeenCalled()
  })

  it("rejects unsupported and absent scalar credential intents", async () => {
    const workspace = await registration().open()
    const editor = await workspace.openCreateEditor()
    for (const key of [undefined, { kind: "clear" }, { kind: "unknown" }]) {
      expect(
        await editor.validate({
          ...editor.initialValues,
          [fields.Key]: key,
        } as EditableResourceProjection),
      ).toMatchObject({ valid: false })
    }
  })
  it("returns refreshed facts after sequenced edits", async () => {
    let name = "Primary"
    const writes: string[] = []
    server.use(
      http.get(`${BASE_URL}/api/groups/1/settings`, () =>
        envelope(groupRow({ name })),
      ),
      http.get(`${BASE_URL}/api/groups/1/models`, () =>
        envelope({ items: [] }),
      ),
      http.get(`${BASE_URL}/api/groups/1/credentials`, () =>
        envelope({ items: [] }),
      ),
      http.put(`${BASE_URL}/api/groups/1/settings`, async ({ request }) => {
        name = ((await request.json()) as { name: string }).name
        writes.push("settings")
        return envelope({})
      }),
    )
    const ops = await openGptLoadNativeResourceOperations()
    const detail = await ops.get(1)
    const command: GptLoadGroupEditorCommand = {
      name: "Updated",
      channelId: detail.group.channelId,
      baseUrl: detail.group.baseUrl,
      models: [],
      priceMultiplier: "1",
      weight: null,
    }
    const result = await ops.update(detail, command)
    expect(result).toMatchObject({
      outcome: "succeeded",
      data: { group: { name: "Updated" } },
    })
    expect(writes).toEqual(["settings"])
  })

  it("reports partial application and stops later writes after a credential delete fails", async () => {
    const writes: string[] = []
    server.use(
      http.get(`${BASE_URL}/api/groups/1/settings`, () => envelope(groupRow())),
      http.get(`${BASE_URL}/api/groups/1/models`, () =>
        envelope({ items: [] }),
      ),
      http.get(`${BASE_URL}/api/groups/1/credentials`, () =>
        envelope({
          items: [
            { credential_id: 12, mask: "****", effective_status: "available" },
          ],
        }),
      ),
      http.post(`${BASE_URL}/api/groups/1/credentials/import`, () => {
        writes.push("import")
        return envelope({})
      }),
      http.delete(`${BASE_URL}/api/groups/1/credentials/12`, () => {
        writes.push("delete")
        return HttpResponse.json(
          { code: "FAILED", message: "failed" },
          { status: 500 },
        )
      }),
      http.put(`${BASE_URL}/api/groups/1/models`, () => {
        writes.push("models")
        return envelope({})
      }),
    )
    const ops = await openGptLoadNativeResourceOperations()
    const detail = await ops.get(1)
    const result = await ops.update(detail, {
      name: detail.group.name,
      channelId: detail.group.channelId,
      baseUrl: detail.group.baseUrl,
      priceMultiplier: "1",
      weight: null,
      models: ["new-model"],
      credentialPatch: {
        baseline: "",
        entries: [
          {
            id: "new",
            fields: {},
            secret: { kind: "replace", value: "sk-new" },
          },
        ],
      },
    })
    expect(result).toMatchObject({
      outcome: "partial",
      completion: "uncertain",
      confirmedEffects: [{ kind: "resource-updated", resourceId: "1" }],
    })
    expect(writes).toEqual(["import", "delete"])
  })
  beforeEach(() => {
    vi.resetAllMocks()
    server.resetHandlers()
    mocks.getPreferences.mockResolvedValue({ gptLoad: config })
  })

  it("registers a native channel workspace", () => {
    expect(registration()).toBeTruthy()
  })

  it("keeps the create editor inside its declared field policy", async () => {
    // The dialog resolves the policy against the editor's descriptors, and a
    // policy that classifies a field the editor does not declare throws
    // "resource field policy mismatch" and crashes the options page. Every
    // classified id must therefore be a real descriptor of this mode.
    const workspace = await registration().open()
    const editor = await workspace.openCreateEditor()

    // Mirrors the dialog: the credential policy is adapted for the descriptor
    // shape first, then resolved against the editor's own descriptors.
    const policy = adaptManagedCredentialPolicy(
      editor.fields,
      getManagedResourceFieldPolicy(
        SITE_TYPES.GPT_LOAD,
        MANAGED_RESOURCE_KINDS.Channel,
        MANAGED_RESOURCE_EDITOR_MODES.Create,
      )!,
    )
    expect(() =>
      resolveResourceFieldPolicy(
        editor.fields,
        policy,
        MANAGED_RESOURCE_SECTION_ORDER,
      ),
    ).not.toThrow()
  })

  it("lists groups without ever exposing a credential value", async () => {
    server.use(
      // The flat inventory route is read first; it is the only one that carries
      // the group's model names and resolved endpoint.
      http.get(`${BASE_URL}/api/modern/groups`, () =>
        envelope({
          items: [
            groupRow({
              endpoint: "https://relay.example.invalid/v1",
              model_names: ["gpt-4o", "gpt-4o-mini"],
            }),
          ],
        }),
      ),
    )

    const workspace = await registration().open()
    const page = await workspace.list()

    expect(page.items).toHaveLength(1)
    const facts = page.items[0]!
    expect(facts.displayName).toBe("Primary")
    const baseUrlFact = facts.fields.find(
      (fact) => fact.fieldId === fields.BaseUrl,
    )
    expect(baseUrlFact).toMatchObject({
      value: "https://relay.example.invalid/v1",
    })
    const keyFact = facts.fields.find((fact) => fact.fieldId === fields.Key)
    expect(keyFact).toMatchObject({ kind: "secret", state: "masked" })
    const modelsFact = facts.fields.find(
      (fact) => fact.fieldId === fields.Models,
    )
    expect(modelsFact).toMatchObject({
      kind: "list",
      value: ["gpt-4o", "gpt-4o-mini"],
    })
  })

  it("creates a group with every typed key in one request", async () => {
    let seenBody: unknown
    server.use(
      http.post(`${BASE_URL}/api/groups`, async ({ request }) => {
        seenBody = await request.json()
        return envelope({
          group_id: 9,
          group_name: "Imported",
          credentials_added: 2,
          credentials_duplicated: 0,
        })
      }),
    )

    const workspace = await registration().open()
    const editor = await workspace.openCreateEditor({
      seed: {
        kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
        name: "Imported",
        channelType: "openai_compatible",
        credential: "sk-first",
        baseUrl: "https://relay.example.invalid/v1",
        enabled: true,
        models: ["gpt-example"],
        notes: "",
      },
    })

    const values: EditableResourceProjection = {
      ...editor.initialValues,
      [fields.Name]: "Imported",
      [fields.Provider]: "openai_compatible",
      [fields.BaseUrl]: "https://relay.example.invalid/v1",
      [fields.Models]: ["gpt-example"],
      [fields.PriceMultiplier]: "1",
      [fields.Key]: {
        kind: "secret-list",
        entries: [
          {
            id: "new",
            fields: {},
            secret: { kind: "replace", value: "sk-first" },
          },
          {
            id: "new-2",
            fields: {},
            secret: { kind: "replace", value: "sk-second" },
          },
        ],
      },
    }

    const result = await editor.submit(values)
    expect(result.outcome).toBe(MANAGED_SITE_MUTATION_OUTCOMES.Succeeded)
    expect(seenBody).toMatchObject({
      name: "Imported",
      channel_id: "openai_compatible",
      params: { base_url: "https://relay.example.invalid/v1" },
      credentials: "sk-first\nsk-second",
    })
  })

  it("sources model options from the catalogue, not other groups' lists", async () => {
    // The editor must offer the gateway's own model vocabulary. Reading other
    // groups' `model_names` would leak one group's custom list into another
    // group's editor, so the catalogue route is the only allowed source.
    const seenPaths: string[] = []
    server.use(
      http.get(`${BASE_URL}/api/models`, ({ request }) => {
        seenPaths.push(new URL(request.url).pathname)
        return envelope({
          items: [{ client_model: "gpt-4o" }, { client_model: "gpt-4o-mini" }],
        })
      }),
    )

    const workspace = await registration().open()
    const editor = await workspace.openCreateEditor()
    const options = await editor.loadOptions!(
      fields.Models,
      editor.initialValues,
    )

    expect(options.map((option) => option.value)).toEqual([
      "gpt-4o",
      "gpt-4o-mini",
    ])
    expect(seenPaths).toEqual(["/api/models"])
  })

  it("imports replaced keys and deletes removed ones on edit", async () => {
    const imported: unknown[] = []
    const deleted: string[] = []
    server.use(
      http.get(`${BASE_URL}/api/groups/1/settings`, () =>
        envelope({
          name: "Primary",
          channel_id: "openai_compatible",
          params: { base_url: "https://relay.example.invalid/v1" },
          enabled: true,
          price_multiplier: "1",
        }),
      ),
      http.get(`${BASE_URL}/api/groups/1/models`, () =>
        envelope({ items: [{ id: "gpt-example" }] }),
      ),
      http.get(`${BASE_URL}/api/groups/1/credentials`, () =>
        envelope({
          items: [
            {
              credential_id: 11,
              mask: "sk-a****1111",
              effective_status: "available",
            },
            {
              credential_id: 12,
              mask: "sk-b****2222",
              effective_status: "available",
            },
          ],
        }),
      ),
      http.post(
        `${BASE_URL}/api/groups/1/credentials/import`,
        async ({ request }) => {
          imported.push(await request.json())
          return envelope({ group_id: 1, credentials_added: 1 })
        },
      ),
      http.delete(`${BASE_URL}/api/groups/1/credentials/12`, () => {
        deleted.push("12")
        return new HttpResponse(null, { status: 204 })
      }),
      http.put(`${BASE_URL}/api/groups/1/settings`, () =>
        envelope({ name: "Primary" }),
      ),
    )

    const workspace = await registration().open()
    const ref = {
      siteType: SITE_TYPES.GPT_LOAD,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      scopeKey: BASE_URL,
      resourceId: "1",
    }
    const editor = await workspace.openEditEditor(ref)

    // The edit dialog resolves the same policy against this mode's descriptors.
    // Mirrors the dialog: the credential policy is adapted for the descriptor
    // shape first, then resolved against the editor's own descriptors.
    const policy = adaptManagedCredentialPolicy(
      editor.fields,
      getManagedResourceFieldPolicy(
        SITE_TYPES.GPT_LOAD,
        MANAGED_RESOURCE_KINDS.Channel,
        MANAGED_RESOURCE_EDITOR_MODES.Edit,
      )!,
    )
    expect(() =>
      resolveResourceFieldPolicy(
        editor.fields,
        policy,
        MANAGED_RESOURCE_SECTION_ORDER,
      ),
    ).not.toThrow()

    const values: EditableResourceProjection = {
      ...editor.initialValues,
      // Row 11 keeps its credential; row 12 is dropped; a new row is added.
      [fields.Key]: {
        kind: "secret-list",
        entries: [
          { id: "11", fields: {}, secret: { kind: "unchanged" } },
          {
            id: "new",
            fields: {},
            secret: { kind: "replace", value: "sk-new" },
          },
        ],
      },
    }

    const result = await editor.submit(values)
    expect(result.outcome).toBe(MANAGED_SITE_MUTATION_OUTCOMES.Succeeded)
    expect(imported).toEqual([{ credentials: "sk-new" }])
    expect(deleted).toEqual(["12"])
  })

  it("deletes a group with an empty JSON body", async () => {
    let seenMethod = ""
    server.use(
      http.delete(`${BASE_URL}/api/groups/4`, ({ request }) => {
        seenMethod = request.method
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const workspace = await registration().open()
    const result = await workspace.delete({
      siteType: SITE_TYPES.GPT_LOAD,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      scopeKey: BASE_URL,
      resourceId: "4",
    })
    expect(seenMethod).toBe("DELETE")
    expect(result.outcome).toBe(MANAGED_SITE_MUTATION_OUTCOMES.Succeeded)
  })
})

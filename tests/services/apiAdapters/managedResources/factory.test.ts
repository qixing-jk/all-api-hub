import { describe, expect, expectTypeOf, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  MANAGED_RESOURCE_CREATE_SEED_KINDS,
  MANAGED_RESOURCE_FAILURE_CODES,
  MANAGED_RESOURCE_FIELD_ISSUE_CODES,
  ManagedResourceError,
  type EditableResourceProjection,
  type ManagedResourceRef,
  type ManagedResourceRegistration,
  type ManagedResourceWorkspace,
  type ResourceDisplayFacts,
  type ResourceEditor,
  type ResourceFailure,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { RESOURCE_FIELD_TYPES } from "~/services/apiAdapters/contracts/resourceNative"
import {
  defineNativeResourceKind,
  type NativeResourceKindDefinition,
} from "~/services/apiAdapters/managedResources/factory"
import {
  MANAGED_SITE_MUTATION_COMPLETIONS,
  MANAGED_SITE_MUTATION_EFFECT_KINDS,
  MANAGED_SITE_MUTATION_OUTCOMES,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations"

type TestConfig = { scope: string }
type TestLocator = { tenant: string; route: string }
type TestListItem = {
  locator: TestLocator
  name: string
  enabled: boolean
}
type TestDetail = {
  id: TestLocator
  name: string
  secret: string
  settings: { visible: string; hidden: string }
}
type TestCreateCommand = { name: string }
type TestUpdateCommand = { name: string; visible: string }
type TestFailure = "aborted" | "denied" | "not-found" | "unavailable"

const testEffect = (
  kind:
    | typeof MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated
    | typeof MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceUpdated
    | typeof MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceDeleted,
) => ({
  kind,
  resourceKind: MANAGED_RESOURCE_KINDS.Channel,
  resourceId: encodeLocator(TEST_LOCATOR),
})

const succeeded = <T>(
  data: T,
  kind:
    | typeof MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated
    | typeof MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceUpdated
    | typeof MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceDeleted,
): ManagedSiteMutationResult<T> => ({
  outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
  data,
  confirmedEffects: [testEffect(kind)],
})

const rejected = (failure: TestFailure, message: string = failure) =>
  ({
    outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
    diagnostic: { message, raw: failure },
  }) as const

const encodeLocator = (locator: TestLocator) =>
  `${encodeURIComponent(locator.tenant)}/${encodeURIComponent(locator.route)}`

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

type TestDefinition = NativeResourceKindDefinition<
  TestConfig,
  TestLocator,
  TestListItem,
  TestDetail,
  TestCreateCommand,
  TestUpdateCommand
>

const TEST_LOCATOR: TestLocator = {
  tenant: "tenant/example",
  route: "opaque:id/alpha",
}

const TEST_DETAIL: TestDetail = {
  id: TEST_LOCATOR,
  name: "Example channel",
  secret: "native-only-secret",
  settings: { visible: "shown", hidden: "preserve-me" },
}

const OTHER_LOCATOR: TestLocator = {
  tenant: "other-tenant",
  route: "other-route",
}

const OTHER_DETAIL: TestDetail = {
  ...TEST_DETAIL,
  id: OTHER_LOCATOR,
  name: "Other channel",
}

const toRef = (
  resourceId = encodeLocator(TEST_LOCATOR),
): ManagedResourceRef => ({
  siteType: SITE_TYPES.AXON_HUB,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  scopeKey: "scope-a",
  resourceId,
})

const mapTestFailure = (error: unknown): ResourceFailure => {
  switch (error) {
    case "aborted":
      return { code: MANAGED_RESOURCE_FAILURE_CODES.Aborted }
    case "denied":
      return { code: MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied }
    case "not-found":
      return { code: MANAGED_RESOURCE_FAILURE_CODES.NotFound }
    case "unavailable":
      return { code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable }
    default:
      return { code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected }
  }
}

const createHarness = (overrides: Partial<TestDefinition> = {}) => {
  const definition: TestDefinition = {
    siteType: SITE_TYPES.AXON_HUB,
    kind: MANAGED_RESOURCE_KINDS.Channel,
    capabilities: { canSearch: true },
    openConfig: vi.fn<TestDefinition["openConfig"]>(async () => ({
      scope: "scope-a",
    })),
    scopeKey: vi.fn<TestDefinition["scopeKey"]>((config) => config.scope),
    encodeLocator: vi.fn<TestDefinition["encodeLocator"]>(encodeLocator),
    decodeLocator: vi.fn<TestDefinition["decodeLocator"]>((resourceId) => {
      const [tenant, route] = resourceId.split("/")
      if (!tenant || !route) throw "unavailable"
      return {
        tenant: decodeURIComponent(tenant),
        route: decodeURIComponent(route),
      }
    }),
    locatorFromListItem: vi.fn<TestDefinition["locatorFromListItem"]>(
      (item) => item.locator,
    ),
    locatorFromDetail: vi.fn<TestDefinition["locatorFromDetail"]>(
      (detail) => detail.id,
    ),
    list: vi.fn<TestDefinition["list"]>(async () => ({
      items: [
        {
          locator: TEST_LOCATOR,
          name: TEST_DETAIL.name,
          enabled: true,
        },
      ],
    })),
    get: vi.fn<TestDefinition["get"]>(async () => TEST_DETAIL),
    toListFacts: vi.fn<TestDefinition["toListFacts"]>((item, ref) => ({
      ref,
      displayName: item.name,
      status: item.enabled ? "enabled" : "disabled",
      fields: [{ fieldId: "enabled", kind: "boolean", value: item.enabled }],
      actions: { canUpdate: true, canDelete: true },
    })),
    toDetailFacts: vi.fn<TestDefinition["toDetailFacts"]>((detail, ref) => ({
      ref,
      displayName: detail.name,
      status: "enabled",
      fields: [
        { fieldId: "visible", kind: "text", value: detail.settings.visible },
        { fieldId: "secret", kind: "secret", state: "available" },
      ],
      actions: { canUpdate: true, canDelete: true },
    })),
    createEditor: vi.fn<TestDefinition["createEditor"]>(async () => ({
      fields: [{ fieldId: "name", type: "text", required: true }],
      initialValues: { name: "" },
      validate: (values) =>
        typeof values.name === "string" && values.name.length > 0
          ? { valid: true }
          : {
              valid: false,
              issues: [
                {
                  fieldId: "name",
                  code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
                },
              ],
            },
      buildCommand: (values) => ({ name: String(values.name) }),
    })),
    editEditor: vi.fn<TestDefinition["editEditor"]>((_config, detail) => ({
      fields: [
        { fieldId: "name", type: "text", required: true },
        { fieldId: "visible", type: "text" },
      ],
      initialValues: {
        name: detail.name,
        visible: detail.settings.visible,
      },
      validate: (values) =>
        typeof values.name === "string" && values.name.length > 0
          ? { valid: true }
          : {
              valid: false,
              issues: [
                {
                  fieldId: "name",
                  code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
                },
              ],
            },
      buildCommand: (values) => ({
        name: String(values.name),
        visible: String(values.visible),
      }),
    })),
    create: vi.fn<TestDefinition["create"]>(async (_config, command) => ({
      ...succeeded(
        { ...TEST_DETAIL, name: command.name },
        MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated,
      ),
    })),
    update: vi.fn<TestDefinition["update"]>(async (_config, detail, command) =>
      succeeded(
        {
          ...detail,
          name: command.name,
          settings: { ...detail.settings, visible: command.visible },
        },
        MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceUpdated,
      ),
    ),
    delete: vi.fn<TestDefinition["delete"]>(async () =>
      succeeded(undefined, MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceDeleted),
    ),
    mapFailure: vi.fn<TestDefinition["mapFailure"]>(mapTestFailure),
    ...overrides,
  }

  return {
    definition,
    registration: defineNativeResourceKind(definition),
  }
}

const captureManagedError = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(ManagedResourceError)
    const managedError = error as ManagedResourceError
    expect(Object.values(MANAGED_RESOURCE_FAILURE_CODES)).toContain(
      managedError.failure.code,
    )
    return managedError
  }
  throw new Error("Expected a controlled managed-resource failure")
}

describe("defineNativeResourceKind", () => {
  it("keeps unchanged managed editor descriptors compatible with neutral contracts", async () => {
    const { registration } = createHarness()
    const editor = await (await registration.open()).openCreateEditor()

    expect(editor.fields).toEqual([
      { fieldId: "name", type: RESOURCE_FIELD_TYPES.Text, required: true },
    ])
  })

  it("projects provider-neutral create seeds through the registration-owned binding", async () => {
    const project = vi.fn((seed) => ({ name: `${seed.name} (seeded)` }))
    const { definition, registration } = createHarness({
      createSeedBindings: [
        {
          kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
          project,
        },
      ],
    })

    expect(registration.createSeedKinds).toEqual([
      MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
    ])

    const editor = await (
      await registration.open()
    ).openCreateEditor({
      seed: {
        kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
        name: "Imported channel",
        channelType: "example",
        credential: "credential-placeholder",
        baseUrl: "https://upstream.example.invalid",
        enabled: true,
        models: ["model-a"],
        orderingWeight: 7,
        priority: 0,
        notes: "",
      },
    })

    expect(project).toHaveBeenCalledOnce()
    expect(editor.initialValues).toEqual({ name: "Imported channel (seeded)" })
    expect(definition.createEditor).toHaveBeenCalledWith(
      { scope: "scope-a" },
      undefined,
    )
  })

  it("rejects undeclared create seeds before opening the provider editor", async () => {
    const { definition, registration } = createHarness()
    const workspace = await registration.open()

    const error = await captureManagedError(
      workspace.openCreateEditor({
        seed: {
          kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
          name: "Imported channel",
          channelType: "example",
          credential: "credential-placeholder",
          baseUrl: "https://upstream.example.invalid",
          enabled: true,
          models: [],
          orderingWeight: 0,
          priority: 0,
          notes: "",
        },
      }),
    )

    expect(error.failure.code).toBe(
      MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
    )
    expect(definition.createEditor).not.toHaveBeenCalled()
  })

  it("forwards only the abort signal beside a credential-bearing create seed", async () => {
    const project = vi.fn(() => ({ name: "Imported channel" }))
    const { definition, registration } = createHarness({
      createSeedBindings: [
        {
          kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
          project,
        },
      ],
    })
    const controller = new AbortController()

    await (
      await registration.open()
    ).openCreateEditor({
      signal: controller.signal,
      seed: {
        kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
        name: "Imported channel",
        channelType: "example",
        credential: "credential-placeholder",
        baseUrl: "https://upstream.example.invalid",
        enabled: true,
        models: [],
        orderingWeight: 0,
        priority: 0,
        notes: "",
      },
    })

    expect(project).toHaveBeenCalledWith(
      expect.objectContaining({ credential: "credential-placeholder" }),
    )
    expect(definition.createEditor).toHaveBeenCalledWith(
      { scope: "scope-a" },
      { signal: controller.signal },
    )
    expect(
      vi.mocked(definition.createEditor).mock.calls[0]?.[1],
    ).not.toHaveProperty("seed")
  })

  it("exposes provider-neutral mutation results from the public workspace contract", async () => {
    const workspace = await createHarness().registration.open()
    const editor = await workspace.openCreateEditor()

    expectTypeOf(editor.submit).returns.toEqualTypeOf<
      Promise<ManagedSiteMutationResult<ResourceDisplayFacts>>
    >()
    expectTypeOf(workspace.delete).returns.toEqualTypeOf<
      Promise<ManagedSiteMutationResult<void>>
    >()

    await expect(editor.submit({ name: "Created" })).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: { displayName: "Created", ref: toRef() },
    })
    await expect(workspace.delete(toRef())).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
    })
  })

  it("returns generic pre-dispatch rejection for direct invalid submit and keeps the editor reusable", async () => {
    const { definition, registration } = createHarness()
    const editor = await (await registration.open()).openCreateEditor()

    await expect(editor.submit({ name: "" })).resolves.toEqual({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
      diagnostic: {
        message: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
      },
    })
    expect(definition.create).not.toHaveBeenCalled()

    await expect(editor.submit({ name: "Created" })).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: { displayName: "Created" },
    })
  })

  it.each([
    {
      result: rejected("denied", "provider-private rejection"),
      closes: false,
    },
    {
      result: {
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
        confirmedEffects: [
          testEffect(MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated),
        ],
        completion: MANAGED_SITE_MUTATION_COMPLETIONS.Uncertain,
        diagnostic: { message: "provider-private partial", raw: "unavailable" },
      } as const,
      closes: true,
    },
    {
      result: {
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
        diagnostic: {
          message: "provider-private uncertain",
          raw: "unavailable",
        },
      } as const,
      closes: true,
    },
  ])(
    "returns $result.outcome directly and applies its editor replay policy",
    async ({ result, closes }) => {
      const create = vi.fn().mockResolvedValue(result)
      const editor = await (
        await createHarness({ create }).registration.open()
      ).openCreateEditor()

      await expect(editor.submit({ name: "Attempt" })).resolves.toBe(result)
      await editor.submit({ name: "Second attempt" })

      expect(create).toHaveBeenCalledTimes(closes ? 1 : 2)
    },
  )

  it.each(["malformed", "thrown"] as const)(
    "throws a %s adapter failure without replay",
    async (mode) => {
      const raw = new Error("provider-private mutation failure")
      const create = vi.fn(async () => {
        if (mode === "thrown") throw raw
        return { outcome: "not-an-outcome", raw }
      })
      const editor = await (
        await createHarness({ create: create as never }).registration.open()
      ).openCreateEditor()

      if (mode === "thrown") {
        await expect(editor.submit({ name: "Attempt" })).rejects.toBe(raw)
      } else {
        await expect(editor.submit({ name: "Attempt" })).rejects.toThrow(
          "Invalid managed site mutation result",
        )
      }
      await expect(
        editor.submit({ name: "Do not replay" }),
      ).resolves.toMatchObject({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
      })
      expect(create).toHaveBeenCalledOnce()
    },
  )

  it.each(["succeeded", "partial"] as const)(
    "preserves a %s display projection failure without replay",
    async (outcome) => {
      const projectionError = new TypeError("invalid display projection")
      const create = vi.fn(async () =>
        outcome === "succeeded"
          ? succeeded(
              TEST_DETAIL,
              MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated,
            )
          : ({
              outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
              data: TEST_DETAIL,
              confirmedEffects: [
                testEffect(MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated),
              ],
              completion: MANAGED_SITE_MUTATION_COMPLETIONS.Uncertain,
              diagnostic: { message: "provider-private partial" },
            } as const),
      )
      const { registration } = createHarness({
        create,
        toDetailFacts: vi.fn(() => {
          throw projectionError
        }),
      })
      const editor = await (await registration.open()).openCreateEditor()

      await expect(editor.submit({ name: "Attempt" })).rejects.toBe(
        projectionError,
      )
      await expect(
        editor.submit({ name: "Do not replay" }),
      ).resolves.toMatchObject({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
      })
      expect(create).toHaveBeenCalledOnce()
    },
  )

  it("opens a ready workspace without exposing native config or detail types", async () => {
    const { registration } = createHarness()
    const publicRegistration: ManagedResourceRegistration = registration
    const workspace: ManagedResourceWorkspace = await publicRegistration.open()
    const editor: ResourceEditor = await workspace.openEditEditor(toRef())

    expect(workspace).not.toHaveProperty("supportsSearch")
    expect(workspace.capabilities).toEqual({
      canSearch: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
    })
    expect(workspace).not.toHaveProperty("config")
    expect(editor.initialValues).toEqual({
      name: TEST_DETAIL.name,
      visible: TEST_DETAIL.settings.visible,
    })
    expect(editor).not.toHaveProperty("detail")
    expect(editor).not.toHaveProperty("secret")
  })

  it("sanitizes edit details before creating or retaining editor mutation closures", async () => {
    const rawSecret = "native-only-secret"
    const sanitizedSecret = "controlled-secret-state"
    const latestSecret = "latest-authoritative-secret"
    const initialDetail = {
      ...TEST_DETAIL,
      secret: rawSecret,
      settings: { ...TEST_DETAIL.settings, hidden: "nested-native-secret" },
    }
    const latestDetail = {
      ...TEST_DETAIL,
      secret: latestSecret,
      settings: { ...TEST_DETAIL.settings, hidden: "latest-nested-secret" },
    }
    const editEditor = vi.fn<TestDefinition["editEditor"]>(
      (_config, detail) => {
        expect(detail.secret).toBe(sanitizedSecret)
        expect(detail.settings.hidden).toBe("safe-editor-setting")
        return {
          fields: [{ fieldId: "name", type: "text" }],
          initialValues: { name: detail.name },
          validate: () => ({ valid: true }),
          buildCommand: (values) => ({
            name: String(values.name),
            visible: detail.settings.visible,
          }),
        }
      },
    )
    const update = vi.fn<TestDefinition["update"]>(async (_config, detail) => {
      expect(detail.secret).toBe(latestSecret)
      expect(detail.settings.hidden).toBe("latest-nested-secret")
      return succeeded(
        { ...detail, name: "Renamed" },
        MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceUpdated,
      )
    })
    const get = vi
      .fn<TestDefinition["get"]>()
      .mockResolvedValueOnce(initialDetail)
      .mockResolvedValueOnce(latestDetail)
    const { registration } = createHarness({
      get,
      editEditor,
      update,
      sanitizeEditDetail: (detail) => ({
        ...detail,
        secret: sanitizedSecret,
        settings: {
          visible: detail.settings.visible,
          hidden: "safe-editor-setting",
        },
      }),
    })

    const editor = await (await registration.open()).openEditEditor(toRef())
    await editor.submit({ name: "Renamed" })

    expect(editEditor).toHaveBeenCalledOnce()
    expect(get).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenCalledOnce()
    expect(editor).not.toHaveProperty("secret")
  })

  it("keeps an editor reusable when the fresh authoritative read fails before dispatch", async () => {
    const get = vi
      .fn<TestDefinition["get"]>()
      .mockResolvedValueOnce(TEST_DETAIL)
      .mockRejectedValueOnce("denied")
      .mockResolvedValueOnce(TEST_DETAIL)
    const update = vi.fn<TestDefinition["update"]>(
      async (_config, detail, command) =>
        succeeded(
          { ...detail, name: command.name },
          MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceUpdated,
        ),
    )
    const { registration } = createHarness({ get, update })
    const editor = await (await registration.open()).openEditEditor(toRef())

    expect(
      (
        await captureManagedError(
          editor.submit({ name: "First attempt", visible: "shown" }),
        )
      ).failure.code,
    ).toBe(MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied)
    await expect(
      editor.submit({ name: "Recovered", visible: "shown" }),
    ).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: { displayName: "Recovered" },
    })

    expect(get).toHaveBeenCalledTimes(3)
    expect(update).toHaveBeenCalledOnce()
  })

  it("closes an editor when the resource disappears during the fresh authoritative read", async () => {
    const get = vi
      .fn<TestDefinition["get"]>()
      .mockResolvedValueOnce(TEST_DETAIL)
      .mockRejectedValueOnce("not-found")
    const update = vi.fn<TestDefinition["update"]>()
    const { registration } = createHarness({ get, update })
    const editor = await (await registration.open()).openEditEditor(toRef())

    expect(
      (
        await captureManagedError(
          editor.submit({ name: "Missing", visible: "shown" }),
        )
      ).failure.code,
    ).toBe(MANAGED_RESOURCE_FAILURE_CODES.NotFound)
    await expect(
      editor.submit({ name: "Do not replay", visible: "shown" }),
    ).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
      diagnostic: { message: "validation_failed" },
    })

    expect(get).toHaveBeenCalledTimes(2)
    expect(update).not.toHaveBeenCalled()
  })

  it("normalizes disabled operation capabilities and rejects crafted calls", async () => {
    const { definition, registration } = createHarness({
      capabilities: {
        canSearch: false,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
      },
    })
    const workspace = await registration.open()

    expect(workspace.capabilities).toEqual({
      canSearch: false,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
    })
    expect(workspace).not.toHaveProperty("supportsSearch")
    for (const action of [
      workspace.list({ search: "crafted" }),
      workspace.openCreateEditor(),
      workspace.openEditEditor(toRef()),
      workspace.delete(toRef()),
    ]) {
      expect((await captureManagedError(action)).failure.code).toBe(
        MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
      )
    }
    expect(definition.list).not.toHaveBeenCalled()
    expect(definition.createEditor).not.toHaveBeenCalled()
    expect(definition.get).not.toHaveBeenCalled()
    expect(definition.delete).not.toHaveBeenCalled()
  })

  it("supports an opaque nonnumeric resource id and cursor page without a total", async () => {
    const nextCursor = "cursor:opaque/next"
    const { registration } = createHarness({
      list: vi.fn(async () => ({
        items: [
          { locator: TEST_LOCATOR, name: TEST_DETAIL.name, enabled: true },
        ],
        nextCursor,
      })),
    })

    const page = await (await registration.open()).list({ cursor: "start" })

    expect(page).toEqual({
      items: [
        expect.objectContaining({
          ref: toRef(),
          displayName: TEST_DETAIL.name,
        }),
      ],
      nextCursor,
    })
    expect(page).not.toHaveProperty("total")
    expect(page.items[0].ref.resourceId).toContain("opaque%3Aid%2Falpha")
  })

  it.each(["", "s".repeat(2049), 42])(
    "rejects an invalid definition scope %p after evaluating it once",
    async (scopeKey) => {
      const { definition, registration } = createHarness({
        scopeKey: vi.fn(() => scopeKey as string),
      })

      const error = await captureManagedError(registration.open())

      expect(error.failure.code).toBe(MANAGED_RESOURCE_FAILURE_CODES.Unexpected)
      expect(definition.scopeKey).toHaveBeenCalledOnce()
      expect(definition.list).not.toHaveBeenCalled()
    },
  )

  it("rejects empty or over-512-character resource ids before native access", async () => {
    const { definition, registration } = createHarness()
    const workspace = await registration.open()

    for (const resourceId of ["", "x".repeat(513), 42 as unknown as string]) {
      const error = await captureManagedError(workspace.get(toRef(resourceId)))
      expect(error.failure.code).toBe(
        MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
      )
    }
    expect(definition.decodeLocator).not.toHaveBeenCalled()
    expect(definition.get).not.toHaveBeenCalled()
  })

  it("rejects malformed runtime refs before native access", async () => {
    const { definition, registration } = createHarness()
    const workspace = await registration.open()
    const malformedRefs = [null, undefined, {}, { ...toRef(), resourceId: 42 }]
    const operations = [
      (ref: ManagedResourceRef) => workspace.get(ref),
      (ref: ManagedResourceRef) => workspace.openEditEditor(ref),
      (ref: ManagedResourceRef) => workspace.delete(ref),
    ]

    for (const malformedRef of malformedRefs) {
      for (const operation of operations) {
        const error = await captureManagedError(
          operation(malformedRef as ManagedResourceRef),
        )
        expect(error.failure.code).toBe(
          MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
        )
      }
    }
    expect(definition.decodeLocator).not.toHaveBeenCalled()
    expect(definition.get).not.toHaveBeenCalled()
    expect(definition.delete).not.toHaveBeenCalled()
  })

  it("rejects refs with the wrong site type resource kind or scope", async () => {
    const { definition, registration } = createHarness()
    const workspace = await registration.open()
    const invalidRefs = [
      { ...toRef(), siteType: SITE_TYPES.NEW_API },
      { ...toRef(), kind: "not-channel" },
      { ...toRef(), scopeKey: "scope-b" },
    ] as ManagedResourceRef[]

    for (const ref of invalidRefs) {
      const error = await captureManagedError(workspace.get(ref))
      expect(error.failure.code).toBe(
        MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
      )
    }
    expect(definition.decodeLocator).not.toHaveBeenCalled()
    expect(definition.get).not.toHaveBeenCalled()
  })

  it("preserves the native error when its failure mapper throws", async () => {
    const nativeError = new Error("native details")
    const { registration } = createHarness({
      openConfig: vi.fn(async () => {
        throw nativeError
      }),
      mapFailure: vi.fn(() => {
        throw new Error("mapper details")
      }),
    })

    await expect(registration.open()).rejects.toBe(nativeError)
  })

  it("preserves provider boundary failures for the definition failure mapper", async () => {
    const encodeFailure = createHarness({
      encodeLocator: vi.fn(() => {
        throw "denied"
      }),
    })
    const decodeFailure = createHarness({
      decodeLocator: vi.fn(() => {
        throw "denied"
      }),
    })
    const projectionFailure = createHarness({
      toListFacts: vi.fn(() => {
        throw "denied"
      }),
    })

    const encodeError = await captureManagedError(
      (await encodeFailure.registration.open()).list(),
    )
    const decodeError = await captureManagedError(
      (await decodeFailure.registration.open()).get(toRef()),
    )
    const projectionError = await captureManagedError(
      (await projectionFailure.registration.open()).list(),
    )

    expect(encodeError.failure.code).toBe(
      MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
    )
    expect(decodeError.failure.code).toBe(
      MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
    )
    expect(projectionError.failure.code).toBe(
      MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
    )
  })

  it("rejects get details whose native identity differs from the requested ref", async () => {
    const { definition, registration } = createHarness({
      get: vi.fn(async () => OTHER_DETAIL),
    })

    const error = await captureManagedError(
      (await registration.open()).get(toRef()),
    )

    expect(error.failure.code).toBe(MANAGED_RESOURCE_FAILURE_CODES.Unexpected)
    expect(definition.toDetailFacts).not.toHaveBeenCalled()
  })

  it("rejects edit editors whose loaded detail has a different native identity", async () => {
    const { definition, registration } = createHarness({
      get: vi.fn(async () => OTHER_DETAIL),
    })

    const error = await captureManagedError(
      (await registration.open()).openEditEditor(toRef()),
    )

    expect(error.failure.code).toBe(MANAGED_RESOURCE_FAILURE_CODES.Unexpected)
    expect(definition.editEditor).not.toHaveBeenCalled()
  })

  it("snapshots caller refs before asynchronous reads and editor creation", async () => {
    const readDeferred = createDeferred<TestDetail>()
    const readHarness = createHarness({
      get: vi.fn(() => readDeferred.promise),
    })
    const readWorkspace = await readHarness.registration.open()
    const readRef = toRef()
    const pendingFacts = readWorkspace.get(readRef)
    Object.assign(readRef, {
      siteType: SITE_TYPES.NEW_API,
      scopeKey: "mutated-scope",
      resourceId: encodeLocator(OTHER_LOCATOR),
    })
    readDeferred.resolve(TEST_DETAIL)

    await expect(pendingFacts).resolves.toMatchObject({ ref: toRef() })

    const editorDeferred = createDeferred<TestDetail>()
    const editorHarness = createHarness({
      get: vi.fn(() => editorDeferred.promise),
    })
    const editorWorkspace = await editorHarness.registration.open()
    const editorRef = toRef()
    const pendingEditor = editorWorkspace.openEditEditor(editorRef)
    Object.assign(editorRef, {
      kind: "mutated-kind",
      scopeKey: "mutated-scope",
      resourceId: encodeLocator(OTHER_LOCATOR),
    })
    editorDeferred.resolve(TEST_DETAIL)
    const editor = await pendingEditor

    await expect(
      editor.submit({ name: "Renamed", visible: "updated" }),
    ).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: { ref: toRef() },
    })
  })

  it("keeps validation issues authoritative without dispatching invalid submit values", async () => {
    const { definition, registration } = createHarness()
    const editor = await (await registration.open()).openEditEditor(toRef())

    expect(editor.validate({ name: "", visible: "unchanged" })).toEqual({
      valid: false,
      issues: [
        {
          fieldId: "name",
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
        },
      ],
    })
    await expect(
      editor.submit({ name: "", visible: "unchanged" }),
    ).resolves.toEqual({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
      diagnostic: { message: "validation_failed" },
    })
    expect(definition.update).not.toHaveBeenCalled()
    await editor.submit({ name: "Renamed", visible: "updated" })

    expect(editor.initialValues).not.toHaveProperty("secret")
    expect(editor.initialValues).not.toHaveProperty("settings")
    expect(definition.update).toHaveBeenCalledWith(
      { scope: "scope-a" },
      TEST_DETAIL,
      { name: "Renamed", visible: "updated" },
      undefined,
    )
    await expect(
      editor.submit({ name: "Do not replay", visible: "updated" }),
    ).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
      diagnostic: { message: "validation_failed" },
    })
    expect(definition.update).toHaveBeenCalledTimes(1)
  })

  it("preserves a hidden nested native field across an allowed edit", async () => {
    const { definition, registration } = createHarness()
    const editor = await (await registration.open()).openEditEditor(toRef())

    const facts = await editor.submit({ name: "Renamed", visible: "updated" })

    const sourceDetail = vi.mocked(definition.update).mock.calls[0][1]
    expect(sourceDetail.settings.hidden).toBe("preserve-me")
    expect(facts).toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
    })
    expect(
      facts.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Succeeded &&
        facts.data.fields,
    ).toContainEqual({
      fieldId: "visible",
      kind: "text",
      value: "updated",
    })
  })

  it("throws for retargeted applied updates and prevents replay", async () => {
    const update = vi.fn(async () =>
      succeeded(
        OTHER_DETAIL,
        MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceUpdated,
      ),
    )
    const { registration } = createHarness({ update })
    const editor = await (await registration.open()).openEditEditor(toRef())

    const error = await captureManagedError(
      editor.submit({ name: "Retargeted", visible: "updated" }),
    )
    expect(error.failure.code).toBe(MANAGED_RESOURCE_FAILURE_CODES.Unexpected)
    await expect(
      editor.submit({ name: "Do not replay", visible: "updated" }),
    ).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
      diagnostic: { message: "validation_failed" },
    })
    expect(update).toHaveBeenCalledTimes(1)
  })

  it("coalesces concurrent editor submits into one Adapter mutation", async () => {
    const deferred = createDeferred<ManagedSiteMutationResult<TestDetail>>()
    const create = vi.fn(() => deferred.promise)
    const { registration } = createHarness({ create })
    const editor = await (await registration.open()).openCreateEditor()
    const values: EditableResourceProjection = { name: "Created" }

    const first = editor.submit(values)
    const second = editor.submit(values)

    expect(first).toBe(second)
    expect(create).toHaveBeenCalledTimes(1)
    deferred.resolve(
      succeeded(
        { ...TEST_DETAIL, name: "Created" },
        MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated,
      ),
    )
    await expect(first).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: { displayName: "Created", ref: toRef() },
    })
  })

  it("preserves uncertain and partial mutation outcomes without replay", async () => {
    const create = vi.fn(
      async () =>
        ({
          outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
          diagnostic: {
            message: "Creation acknowledgement was not received",
            raw: "unavailable",
          },
        }) as const,
    )
    const update = vi.fn(
      async () =>
        ({
          outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
          confirmedEffects: [
            testEffect(MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceUpdated),
          ],
          completion: MANAGED_SITE_MUTATION_COMPLETIONS.Uncertain,
          diagnostic: {
            message: "Status acknowledgement was not received",
            raw: "unavailable",
          },
        }) as const,
    )
    const { registration } = createHarness({ create, update })
    const workspace = await registration.open()
    const createEditor = await workspace.openCreateEditor()
    const editEditor = await workspace.openEditEditor(toRef())

    for (const [editor, values, outcome] of [
      [
        createEditor,
        { name: "Created" },
        MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
      ],
      [
        editEditor,
        { name: "Renamed", visible: "updated" },
        MANAGED_SITE_MUTATION_OUTCOMES.Partial,
      ],
    ] as const) {
      await expect(editor.submit(values)).resolves.toMatchObject({ outcome })
      await expect(editor.submit(values)).resolves.toMatchObject({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
        diagnostic: { message: "validation_failed" },
      })
    }
    expect(create).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it("accepts an effectful delete without a reconciliation read", async () => {
    const deleteResource = vi.fn<TestDefinition["delete"]>(async () =>
      succeeded(undefined, MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceDeleted),
    )
    const get = vi.fn<TestDefinition["get"]>()
    const { registration } = createHarness({ get, delete: deleteResource })

    await expect(
      (await registration.open()).delete(toRef()),
    ).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      confirmedEffects: [
        { kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceDeleted },
      ],
    })
    expect(deleteResource).toHaveBeenCalledTimes(1)
    expect(get).not.toHaveBeenCalled()
  })

  it("confirms absence with a fresh read after an effect-free succeeded delete", async () => {
    const deleteResource = vi.fn(
      async () =>
        ({
          outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
          data: undefined,
          confirmedEffects: [],
        }) as const,
    )
    const get = vi.fn<TestDefinition["get"]>(async () => {
      throw "not-found"
    })
    const { registration } = createHarness({ get, delete: deleteResource })

    await expect((await registration.open()).delete(toRef())).resolves.toEqual({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: undefined,
      confirmedEffects: [],
    })
    expect(deleteResource).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it("throws when an effect-free succeeded delete still finds the resource", async () => {
    const deleteResource = vi.fn<TestDefinition["delete"]>(async () => ({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: undefined,
      confirmedEffects: [],
    }))
    const get = vi.fn<TestDefinition["get"]>(async () => TEST_DETAIL)
    const { registration } = createHarness({ get, delete: deleteResource })
    const workspace = await registration.open()

    const error = await captureManagedError(workspace.delete(toRef()))
    expect(error.failure.code).toBe(MANAGED_RESOURCE_FAILURE_CODES.Unexpected)
    expect(deleteResource).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it("surfaces a failed reconciliation read after an effect-free succeeded delete", async () => {
    const deleteResource = vi.fn<TestDefinition["delete"]>(async () => ({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: undefined,
      confirmedEffects: [],
    }))
    const get = vi.fn<TestDefinition["get"]>(async () => {
      throw "unavailable"
    })
    const { registration } = createHarness({ get, delete: deleteResource })
    const workspace = await registration.open()

    await expect(workspace.delete(toRef())).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
      diagnostic: { raw: "unavailable" },
    })
    expect(deleteResource).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it("confirms absence with a fresh read after delete returns not_found", async () => {
    const deleteResource = vi.fn(async () => rejected("not-found"))
    const get = vi.fn<TestDefinition["get"]>(async () => {
      throw "not-found"
    })
    const { registration } = createHarness({
      get,
      delete: deleteResource,
    })

    await expect((await registration.open()).delete(toRef())).resolves.toEqual({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: undefined,
      confirmedEffects: [],
    })
    expect(deleteResource).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it("uses a rejected diagnostic code to trigger the delete fresh read", async () => {
    const deleteResource = vi.fn(async () => ({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
      diagnostic: {
        message: "resource is absent",
        code: MANAGED_RESOURCE_FAILURE_CODES.NotFound,
        raw: "opaque-delete-response",
      },
    }))
    const get = vi.fn<TestDefinition["get"]>(async () => {
      throw "not-found"
    })
    const { registration } = createHarness({
      get,
      delete: deleteResource,
    })

    await expect((await registration.open()).delete(toRef())).resolves.toEqual({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: undefined,
      confirmedEffects: [],
    })
    expect(deleteResource).toHaveBeenCalledOnce()
    expect(get).toHaveBeenCalledOnce()
  })

  it("does not treat delete not_found as success when a fresh read finds the resource", async () => {
    const deleteResource = vi.fn(async () => rejected("not-found"))
    const get = vi.fn<TestDefinition["get"]>(async () => TEST_DETAIL)
    const { registration } = createHarness({
      get,
      delete: deleteResource,
    })
    const workspace = await registration.open()

    await expect(workspace.delete(toRef())).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
      diagnostic: { raw: "not-found" },
    })
    expect(deleteResource).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it("surfaces a failed delete reconciliation read without replaying delete", async () => {
    const deleteResource = vi.fn(async () => rejected("not-found"))
    const get = vi.fn<TestDefinition["get"]>(async () => {
      throw "unavailable"
    })
    const { registration } = createHarness({
      get,
      delete: deleteResource,
    })
    const workspace = await registration.open()

    await expect(workspace.delete(toRef())).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
      diagnostic: { raw: "unavailable" },
    })
    expect(deleteResource).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it("preserves a rejected-delete projection failure", async () => {
    const projectionError = new TypeError("invalid delete failure projection")
    const mapFailure = vi
      .fn<(error: unknown) => ResourceFailure>()
      .mockImplementationOnce(() => {
        throw projectionError
      })
      .mockReturnValue({ code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected })
    const deleteResource = vi.fn<TestDefinition["delete"]>(async () =>
      rejected("denied"),
    )
    const { registration } = createHarness({
      delete: deleteResource,
      mapFailure,
    })
    const workspace = await registration.open()

    await expect(workspace.delete(toRef())).rejects.toBe(projectionError)
    expect(mapFailure).toHaveBeenCalledTimes(1)
    expect(deleteResource).toHaveBeenCalledTimes(1)
  })

  it("preserves the native reconciliation error when its mapper throws", async () => {
    const nativeError = new Error("native reconciliation failure")
    const mapperError = new Error("mapper failure")
    const get = vi.fn<TestDefinition["get"]>(async () => {
      throw nativeError
    })
    const mapFailure = vi.fn(() => {
      throw mapperError
    })
    const deleteResource = vi.fn<TestDefinition["delete"]>(async () => ({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: undefined,
      confirmedEffects: [],
    }))
    const { registration } = createHarness({
      delete: deleteResource,
      get,
      mapFailure,
    })

    await expect((await registration.open()).delete(toRef())).rejects.toBe(
      nativeError,
    )
    expect(deleteResource).toHaveBeenCalledOnce()
    expect(get).toHaveBeenCalledOnce()
  })

  it("maps abort before dispatch to aborted and keeps the editor reusable", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(rejected("aborted"))
      .mockResolvedValueOnce(
        succeeded(
          TEST_DETAIL,
          MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated,
        ),
      )
    const { registration } = createHarness({ create })
    const editor = await (await registration.open()).openCreateEditor()

    await expect(editor.submit({ name: "First" })).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
      diagnostic: { raw: "aborted" },
    })
    await expect(editor.submit({ name: "Second" })).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: { displayName: TEST_DETAIL.name },
    })
    expect(create).toHaveBeenCalledTimes(2)
  })

  it("maps abort after dispatch to mutation_state_uncertain and closes the editor", async () => {
    const create = vi.fn(
      async () =>
        ({
          outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
          diagnostic: { message: "aborted", raw: "aborted" },
        }) as const,
    )
    const { registration } = createHarness({ create })
    const editor = await (await registration.open()).openCreateEditor()

    await expect(
      editor.submit({ name: "Possibly created" }),
    ).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
    })
    await expect(
      editor.submit({ name: "Do not replay" }),
    ).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
      diagnostic: { message: "validation_failed" },
    })
    expect(create).toHaveBeenCalledTimes(1)
  })

  it("accepts an effect-free update after its fresh read confirms convergence", async () => {
    const get = vi
      .fn<TestDefinition["get"]>()
      .mockResolvedValueOnce(TEST_DETAIL)
      .mockResolvedValueOnce(TEST_DETAIL)
    const update = vi.fn<TestDefinition["update"]>(
      async (_config, detail, command) => {
        expect(detail.name).toBe(command.name)
        expect(detail.settings.visible).toBe(command.visible)
        return {
          outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
          data: detail,
          confirmedEffects: [],
        }
      },
    )
    const { registration } = createHarness({ get, update })
    const editor = await (await registration.open()).openEditEditor(toRef())

    await expect(
      editor.submit({
        name: TEST_DETAIL.name,
        visible: TEST_DETAIL.settings.visible,
      }),
    ).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: { displayName: TEST_DETAIL.name },
    })
    expect(get).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it("throws for an effect-free create result and prevents replay", async () => {
    const create = vi.fn(async () => ({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: TEST_DETAIL,
      confirmedEffects: [],
    }))
    const { registration } = createHarness({ create: create as never })
    const editor = await (await registration.open()).openCreateEditor()

    await expect(editor.submit({ name: "Malformed result" })).rejects.toThrow(
      "Invalid managed site mutation result",
    )
    await expect(
      editor.submit({ name: "Do not replay" }),
    ).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
      diagnostic: { message: "validation_failed" },
    })
    expect(create).toHaveBeenCalledOnce()
  })

  it("preserves a terminal buildCommand error and closes the editor", async () => {
    const buildError = new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.NotFound,
    })
    const create = vi.fn<TestDefinition["create"]>()
    const { registration } = createHarness({
      create,
      createEditor: vi.fn(async () => ({
        fields: [{ fieldId: "name", type: "text" as const }],
        initialValues: { name: "" },
        validate: () => ({ valid: true as const }),
        buildCommand: () => {
          throw buildError
        },
      })),
    })
    const editor = await (await registration.open()).openCreateEditor()

    await expect(editor.submit({ name: "Invalid command" })).rejects.toBe(
      buildError,
    )
    await expect(editor.submit({ name: "Do not rebuild" })).resolves.toEqual({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
      diagnostic: { message: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed },
    })
    expect(create).not.toHaveBeenCalled()
  })

  it("preserves native diagnostics for the controller disclosure boundary", async () => {
    const secret = "plain placeholder credential"
    const create = vi.fn(async () =>
      rejected("denied", `Credential ${secret}; permission denied`),
    )
    const { registration } = createHarness({
      create,
      createEditor: vi.fn(async () => ({
        fields: [
          { fieldId: "name", type: "text" as const },
          {
            fieldId: "credential",
            type: "secret" as const,
            secretState: "unavailable" as const,
            canReplace: true,
            allowClear: false,
          },
        ],
        initialValues: {
          name: "",
          credential: { kind: "unchanged" as const },
        },
        validate: () => ({ valid: true as const }),
        buildCommand: (values: EditableResourceProjection) => ({
          name: String(values.name),
        }),
      })),
    })
    const editor = await (await registration.open()).openCreateEditor()

    const result = await editor.submit({
      name: "Denied",
      credential: { kind: "replace", value: secret },
    })

    expect(result).toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
      diagnostic: {
        message: `Credential ${secret}; permission denied`,
        raw: "denied",
      },
    })
  })

  it("preserves raw diagnostic identity for the private failure mapper", async () => {
    const rawCause = new Error("provider rejected the request")
    const mapFailure = vi.fn(
      (_error: unknown): ResourceFailure => ({
        code: MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
      }),
    )
    const create = vi.fn(
      async () =>
        ({
          outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
          diagnostic: { message: "permission denied", raw: rawCause },
        }) as const,
    )
    const { registration } = createHarness({ create, mapFailure })
    const editor = await (await registration.open()).openCreateEditor()

    const result = await editor.submit({ name: "Denied" })

    expect(result).toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
      diagnostic: { raw: rawCause },
    })
    expect(mapFailure).not.toHaveBeenCalled()
  })

  it("does not project editor mutation failures at the workspace boundary", async () => {
    const projectionError = new TypeError("invalid failure projection")
    const mapFailure = vi
      .fn<(error: unknown) => ResourceFailure>()
      .mockImplementationOnce(() => {
        throw projectionError
      })
      .mockReturnValue({ code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected })
    const create = vi.fn(async () => rejected("denied"))
    const { registration } = createHarness({ create, mapFailure })
    const editor = await (await registration.open()).openCreateEditor()

    await expect(editor.submit({ name: "Denied" })).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
      diagnostic: { raw: "denied" },
    })
    expect(mapFailure).not.toHaveBeenCalled()
  })

  it("maps reads to controlled errors and preserves mutation throws", async () => {
    const openFailure = createHarness({
      openConfig: vi.fn(async () => {
        throw "denied"
      }),
    })
    expect(
      (await captureManagedError(openFailure.registration.open())).failure.code,
    ).toBe(MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied)

    const throwingReadOperations: (keyof TestDefinition)[] = [
      "list",
      "get",
      "createEditor",
      "editEditor",
    ]
    for (const operation of throwingReadOperations) {
      const { registration } = createHarness({
        [operation]: vi.fn(() => {
          throw "denied"
        }),
      })
      const workspace = await registration.open()
      let action: Promise<unknown>
      switch (operation) {
        case "list":
          action = workspace.list()
          break
        case "get":
          action = workspace.get(toRef())
          break
        case "createEditor":
          action = workspace.openCreateEditor()
          break
        case "editEditor":
          action = workspace.openEditEditor(toRef())
          break
        default:
          action = workspace.openEditEditor(toRef())
      }
      expect((await captureManagedError(action)).failure.code).toBe(
        MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
      )
    }

    for (const operation of ["create", "update", "delete"] as const) {
      const { registration } = createHarness({
        [operation]: vi.fn(() => {
          throw "denied"
        }),
      })
      const workspace = await registration.open()
      const action =
        operation === "create"
          ? workspace
              .openCreateEditor()
              .then((editor) => editor.submit({ name: "Created" }))
          : operation === "update"
            ? workspace
                .openEditEditor(toRef())
                .then((editor) =>
                  editor.submit({ name: "Renamed", visible: "updated" }),
                )
            : workspace.delete(toRef())

      await expect(action).rejects.toBe("denied")
    }

    const missingUpdate = vi.fn(async () => rejected("not-found"))
    const missingUpdateHarness = createHarness({ update: missingUpdate })
    const missingUpdateEditor = await (
      await missingUpdateHarness.registration.open()
    ).openEditEditor(toRef())
    await expect(
      missingUpdateEditor.submit({
        name: "Missing",
        visible: "unchanged",
      }),
    ).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
      diagnostic: { raw: "not-found" },
    })
    await expect(
      missingUpdateEditor.submit({
        name: "Do not replay",
        visible: "unchanged",
      }),
    ).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
      diagnostic: { raw: "not-found" },
    })
    expect(missingUpdate).toHaveBeenCalledTimes(2)

    const duplicateFacts = [
      { fieldId: "duplicate", kind: "text", value: "one" },
      { fieldId: "duplicate", kind: "text", value: "two" },
    ] as const
    const duplicateList = createHarness({
      toListFacts: vi.fn<TestDefinition["toListFacts"]>((item, ref) => ({
        ref,
        displayName: item.name,
        status: "enabled",
        fields: duplicateFacts,
        actions: { canUpdate: true, canDelete: true },
      })),
    })
    expect(
      (
        await captureManagedError(
          (await duplicateList.registration.open()).list(),
        )
      ).failure.code,
    ).toBe(MANAGED_RESOURCE_FAILURE_CODES.Unexpected)

    const duplicateDetail = createHarness({
      toDetailFacts: vi.fn<TestDefinition["toDetailFacts"]>((detail, ref) => ({
        ref,
        displayName: detail.name,
        status: "enabled",
        fields: duplicateFacts,
        actions: { canUpdate: true, canDelete: true },
      })),
    })
    expect(
      (
        await captureManagedError(
          (await duplicateDetail.registration.open()).get(toRef()),
        )
      ).failure.code,
    ).toBe(MANAGED_RESOURCE_FAILURE_CODES.Unexpected)

    const unsafeSearchValues = createHarness({
      toListFacts: vi.fn<TestDefinition["toListFacts"]>((item, ref) => ({
        ref,
        displayName: item.name,
        status: "enabled",
        fields: [],
        searchValues: ["safe-model", 42] as never,
        actions: { canUpdate: true, canDelete: true },
      })),
    })
    expect(
      (
        await captureManagedError(
          (await unsafeSearchValues.registration.open()).list(),
        )
      ).failure.code,
    ).toBe(MANAGED_RESOURCE_FAILURE_CODES.Unexpected)

    const retargetRef = (ref: ManagedResourceRef): ManagedResourceRef => ({
      ...ref,
      resourceId: "retargeted-resource",
    })
    const mismatchedListRef = createHarness({
      toListFacts: vi.fn<TestDefinition["toListFacts"]>((item, ref) => ({
        ref: retargetRef(ref),
        displayName: item.name,
        status: "enabled",
        fields: [],
        actions: { canUpdate: true, canDelete: true },
      })),
    })
    expect(
      (
        await captureManagedError(
          (await mismatchedListRef.registration.open()).list(),
        )
      ).failure.code,
    ).toBe(MANAGED_RESOURCE_FAILURE_CODES.Unexpected)

    const mismatchedDetailRef = createHarness({
      toDetailFacts: vi.fn<TestDefinition["toDetailFacts"]>((detail, ref) => ({
        ref: retargetRef(ref),
        displayName: detail.name,
        status: "enabled",
        fields: [],
        actions: { canUpdate: true, canDelete: true },
      })),
    })
    const mismatchedDetailWorkspace =
      await mismatchedDetailRef.registration.open()
    expect(
      (await captureManagedError(mismatchedDetailWorkspace.get(toRef())))
        .failure.code,
    ).toBe(MANAGED_RESOURCE_FAILURE_CODES.Unexpected)
    const createProjectionError = await captureManagedError(
      mismatchedDetailWorkspace
        .openCreateEditor()
        .then((editor) => editor.submit({ name: "Created" })),
    )
    expect(createProjectionError.failure.code).toBe(
      MANAGED_RESOURCE_FAILURE_CODES.Unexpected,
    )
  })
})

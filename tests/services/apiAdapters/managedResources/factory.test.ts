import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  MANAGED_RESOURCE_FIELD_ISSUE_CODES,
  ManagedResourceError,
  type EditableResourceProjection,
  type ManagedResourceRef,
  type ManagedResourceRegistration,
  type ManagedResourceWorkspace,
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
    ).resolves.toMatchObject({ displayName: "Recovered" })

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
    expect(
      (
        await captureManagedError(
          editor.submit({ name: "Do not replay", visible: "shown" }),
        )
      ).failure.code,
    ).toBe(MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed)

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
    ).resolves.toMatchObject({ ref: toRef() })
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
    const validationError = await captureManagedError(
      editor.submit({ name: "", visible: "unchanged" }),
    )
    expect(validationError.failure).toEqual({
      code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
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
    await captureManagedError(
      editor.submit({ name: "Do not replay", visible: "updated" }),
    )
    expect(definition.update).toHaveBeenCalledTimes(1)
  })

  it("preserves a hidden nested native field across an allowed edit", async () => {
    const { definition, registration } = createHarness()
    const editor = await (await registration.open()).openEditEditor(toRef())

    const facts = await editor.submit({ name: "Renamed", visible: "updated" })

    const sourceDetail = vi.mocked(definition.update).mock.calls[0][1]
    expect(sourceDetail.settings.hidden).toBe("preserve-me")
    expect(facts.fields).toContainEqual({
      fieldId: "visible",
      kind: "text",
      value: "updated",
    })
  })

  it("rejects retargeted applied updates and prevents replay", async () => {
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
    await captureManagedError(
      editor.submit({ name: "Do not replay", visible: "updated" }),
    )
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
      displayName: "Created",
      ref: toRef(),
    })
  })

  it("maps uncertain and partial mutation outcomes to mutation_state_uncertain", async () => {
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

    for (const [editor, values] of [
      [createEditor, { name: "Created" }],
      [editEditor, { name: "Renamed", visible: "updated" }],
    ] as const) {
      const error = await captureManagedError(editor.submit(values))
      expect(error.failure.code).toBe(
        MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
      )
      await captureManagedError(editor.submit(values))
    }
    expect(create).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledTimes(1)

    const thrownCreate = vi.fn(async () => {
      throw "post-dispatch-uncertain"
    })
    const thrownHarness = createHarness({
      create: thrownCreate,
      mapFailure: vi.fn((error) =>
        error === "post-dispatch-uncertain"
          ? { code: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain }
          : mapTestFailure(error),
      ),
    })
    const thrownEditor = await (
      await thrownHarness.registration.open()
    ).openCreateEditor()
    expect(
      (
        await captureManagedError(
          thrownEditor.submit({ name: "Uncertain create" }),
        )
      ).failure.code,
    ).toBe(MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain)
    await captureManagedError(
      thrownEditor.submit({ name: "Do not replay uncertain create" }),
    )
    expect(thrownCreate).toHaveBeenCalledTimes(1)
  })

  it("accepts an effectful delete without a reconciliation read", async () => {
    const deleteResource = vi.fn<TestDefinition["delete"]>(async () =>
      succeeded(undefined, MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceDeleted),
    )
    const get = vi.fn<TestDefinition["get"]>()
    const { registration } = createHarness({ get, delete: deleteResource })

    await expect((await registration.open()).delete(toRef())).resolves.toBe(
      undefined,
    )
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

    await expect((await registration.open()).delete(toRef())).resolves.toBe(
      undefined,
    )
    expect(deleteResource).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it("rejects an effect-free succeeded delete when a fresh read finds the resource", async () => {
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

    const error = await captureManagedError(workspace.delete(toRef()))

    expect(error.failure.code).toBe(MANAGED_RESOURCE_FAILURE_CODES.Unavailable)
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

    await expect((await registration.open()).delete(toRef())).resolves.toBe(
      undefined,
    )
    expect(deleteResource).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it("does not treat delete not_found as success when a fresh read finds the resource", async () => {
    const deleteResource = vi.fn(async () => rejected("not-found"))
    const get = vi.fn<TestDefinition["get"]>(async () => TEST_DETAIL)
    const { registration } = createHarness({
      get,
      delete: deleteResource,
    })
    const workspace = await registration.open()

    const error = await captureManagedError(workspace.delete(toRef()))

    expect(error.failure.code).toBe(MANAGED_RESOURCE_FAILURE_CODES.NotFound)
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

    const error = await captureManagedError(workspace.delete(toRef()))

    expect(error.failure.code).toBe(MANAGED_RESOURCE_FAILURE_CODES.Unavailable)
    expect(deleteResource).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it("rethrows a delete failure projection error without re-projecting it", async () => {
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

    const firstError = await captureManagedError(
      editor.submit({ name: "First" }),
    )
    expect(firstError.failure.code).toBe(MANAGED_RESOURCE_FAILURE_CODES.Aborted)
    await expect(editor.submit({ name: "Second" })).resolves.toMatchObject({
      displayName: TEST_DETAIL.name,
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

    const firstError = await captureManagedError(
      editor.submit({ name: "Possibly created" }),
    )
    expect(firstError.failure.code).toBe(
      MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
    )
    const secondError = await captureManagedError(
      editor.submit({ name: "Do not replay" }),
    )
    expect(secondError.failure.code).toBe(
      MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
    )
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
    ).resolves.toMatchObject({ displayName: TEST_DETAIL.name })
    expect(get).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it("rejects an effect-free create result as malformed and prevents replay", async () => {
    const create = vi.fn(async () => ({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: TEST_DETAIL,
      confirmedEffects: [],
    }))
    const { registration } = createHarness({ create: create as never })
    const editor = await (await registration.open()).openCreateEditor()

    const firstError = await captureManagedError(
      editor.submit({ name: "Malformed result" }),
    )
    expect(firstError.failure.code).toBe(
      MANAGED_RESOURCE_FAILURE_CODES.Unexpected,
    )
    await captureManagedError(editor.submit({ name: "Do not replay" }))
    expect(create).toHaveBeenCalledOnce()
  })

  it("projects a sanitized private message at the legacy exception boundary", async () => {
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

    const error = await captureManagedError(
      editor.submit({
        name: "Denied",
        credential: { kind: "replace", value: secret },
      }),
    )

    expect(error.failure.code).toBe(
      MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
    )
    expect(error.message).toContain("[REDACTED]")
    expect(error.message).not.toContain(secret)
  })

  it("preserves raw diagnostic identity for the private failure mapper", async () => {
    const rawCause = new Error("provider rejected the request")
    const mapFailure = vi.fn((error: unknown): ResourceFailure => {
      expect(error).toBe(rawCause)
      return { code: MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied }
    })
    const create = vi.fn(
      async () =>
        ({
          outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
          diagnostic: { message: "permission denied", raw: rawCause },
        }) as const,
    )
    const { registration } = createHarness({ create, mapFailure })
    const editor = await (await registration.open()).openCreateEditor()

    const error = await captureManagedError(editor.submit({ name: "Denied" }))

    expect(error.failure.code).toBe(
      MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
    )
    expect(mapFailure).toHaveBeenCalledOnce()
  })

  it("rethrows a private failure projection error with its original identity", async () => {
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

    await expect(editor.submit({ name: "Denied" })).rejects.toBe(
      projectionError,
    )
  })

  it("maps every Adapter read and mutation failure to a controlled public code", async () => {
    const openFailure = createHarness({
      openConfig: vi.fn(async () => {
        throw "denied"
      }),
    })
    expect(
      (await captureManagedError(openFailure.registration.open())).failure.code,
    ).toBe(MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied)

    const throwingOperations: (keyof TestDefinition)[] = [
      "list",
      "get",
      "createEditor",
      "editEditor",
      "create",
      "update",
      "delete",
    ]
    for (const operation of throwingOperations) {
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
        case "create":
          action = workspace
            .openCreateEditor()
            .then((editor) => editor.submit({ name: "Created" }))
          break
        case "update":
          action = workspace
            .openEditEditor(toRef())
            .then((editor) =>
              editor.submit({ name: "Renamed", visible: "updated" }),
            )
          break
        default:
          action = workspace.delete(toRef())
      }
      expect((await captureManagedError(action)).failure.code).toBe(
        MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
      )
    }

    const missingUpdate = vi.fn(async () => rejected("not-found"))
    const missingUpdateHarness = createHarness({ update: missingUpdate })
    const missingUpdateEditor = await (
      await missingUpdateHarness.registration.open()
    ).openEditEditor(toRef())
    expect(
      (
        await captureManagedError(
          missingUpdateEditor.submit({
            name: "Missing",
            visible: "unchanged",
          }),
        )
      ).failure.code,
    ).toBe(MANAGED_RESOURCE_FAILURE_CODES.NotFound)
    await captureManagedError(
      missingUpdateEditor.submit({
        name: "Do not replay",
        visible: "unchanged",
      }),
    )
    expect(missingUpdate).toHaveBeenCalledTimes(1)

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
    expect(
      (
        await captureManagedError(
          mismatchedDetailWorkspace
            .openCreateEditor()
            .then((editor) => editor.submit({ name: "Created" })),
        )
      ).failure.code,
    ).toBe(MANAGED_RESOURCE_FAILURE_CODES.Unexpected)
  })
})

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
import {
  defineNativeResourceKind,
  type NativeResourceKindDefinition,
  type NativeResourceMutationResult,
} from "~/services/apiAdapters/managedResources/factory"

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
  TestUpdateCommand,
  TestFailure
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
    supportsSearch: true,
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
      certainty: "applied",
      value: { ...TEST_DETAIL, name: command.name },
    })),
    update: vi.fn<TestDefinition["update"]>(
      async (_config, detail, command) => ({
        certainty: "applied",
        value: {
          ...detail,
          name: command.name,
          settings: { ...detail.settings, visible: command.visible },
        },
      }),
    ),
    delete: vi.fn<TestDefinition["delete"]>(async () => ({
      certainty: "applied",
      value: undefined,
    })),
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
  it("opens a ready workspace without exposing native config or detail types", async () => {
    const { registration } = createHarness()
    const publicRegistration: ManagedResourceRegistration = registration
    const workspace: ManagedResourceWorkspace = await publicRegistration.open()
    const editor: ResourceEditor = await workspace.openEditEditor(toRef())

    expect(workspace.supportsSearch).toBe(true)
    expect(workspace).not.toHaveProperty("config")
    expect(editor.initialValues).toEqual({
      name: TEST_DETAIL.name,
      visible: TEST_DETAIL.settings.visible,
    })
    expect(editor).not.toHaveProperty("detail")
    expect(editor).not.toHaveProperty("secret")
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

  it("maps failures safely when a native failure mapper throws", async () => {
    const { registration } = createHarness({
      openConfig: vi.fn(async () => {
        throw new Error("native details")
      }),
      mapFailure: vi.fn(() => {
        throw new Error("mapper details")
      }),
    })

    const error = await captureManagedError(registration.open())

    expect(error.failure.code).toBe(MANAGED_RESOURCE_FAILURE_CODES.Unexpected)
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

  it("keeps hidden native detail in the edit-editor closure", async () => {
    const { definition, registration } = createHarness()
    const editor = await (await registration.open()).openEditEditor(toRef())

    const validationError = await captureManagedError(
      editor.submit({ name: "", visible: "unchanged" }),
    )
    expect(validationError.failure).toEqual({
      code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
      fieldIssues: [
        {
          fieldId: "name",
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
        },
      ],
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
    const update = vi.fn(
      async () => ({ certainty: "applied", value: OTHER_DETAIL }) as const,
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
    const deferred =
      createDeferred<NativeResourceMutationResult<TestDetail, TestFailure>>()
    const create = vi.fn(() => deferred.promise)
    const { registration } = createHarness({ create })
    const editor = await (await registration.open()).openCreateEditor()
    const values: EditableResourceProjection = { name: "Created" }

    const first = editor.submit(values)
    const second = editor.submit(values)

    expect(first).toBe(second)
    expect(create).toHaveBeenCalledTimes(1)
    deferred.resolve({
      certainty: "applied",
      value: { ...TEST_DETAIL, name: "Created" },
    })
    await expect(first).resolves.toMatchObject({
      displayName: "Created",
      ref: toRef(),
    })
  })

  it("maps possible and partial mutation outcomes to mutation_state_uncertain", async () => {
    const create = vi.fn(
      async () => ({ certainty: "possibly-applied" }) as const,
    )
    const update = vi.fn(
      async () => ({ certainty: "partially-applied" }) as const,
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

  it("treats deletion of an already-missing resource as success", async () => {
    const deleteResource = vi.fn(
      async () =>
        ({
          certainty: "not-applied",
          failure: "not-found",
        }) as const,
    )
    const { registration } = createHarness({ delete: deleteResource })

    await expect((await registration.open()).delete(toRef())).resolves.toBe(
      undefined,
    )
    expect(deleteResource).toHaveBeenCalledTimes(1)

    const thrownNotFound = createHarness({
      delete: vi.fn(async () => {
        throw "not-found"
      }),
    })
    await expect(
      (await thrownNotFound.registration.open()).delete(toRef()),
    ).resolves.toBe(undefined)
  })

  it("maps abort before dispatch to aborted and keeps the editor reusable", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ certainty: "not-applied", failure: "aborted" })
      .mockResolvedValueOnce({ certainty: "applied", value: TEST_DETAIL })
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
      async () => ({ certainty: "possibly-applied" }) as const,
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

    const missingUpdate = vi.fn(
      async () =>
        ({
          certainty: "not-applied",
          failure: "not-found",
        }) as const,
    )
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

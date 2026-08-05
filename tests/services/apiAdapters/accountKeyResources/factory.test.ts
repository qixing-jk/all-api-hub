import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  defineAccountKeyResourceCapability,
  type AccountKeyResourceDefinition,
} from "~/services/apiAdapters/accountKeyResources/factory"
import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  ACCOUNT_KEY_RESOURCE_FIELD_ISSUE_CODES,
  AccountKeyResourceError,
  type AccountKeyResourceOpenInput,
  type AccountKeyResourceRef,
  type AccountKeyScope,
  type EditableResourceProjection,
  type ResourceFailure,
  type ResourceValidationResult,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { AuthTypeEnum } from "~/types"

type Detail = { id: string; name: string }
type CreateCommand = { name: string; destinationScopeKey?: string }
type Definition = AccountKeyResourceDefinition<
  { scopeKey: string },
  string,
  Detail,
  Detail,
  CreateCommand,
  { name: string },
  "denied"
>

const REF: AccountKeyResourceRef = {
  accountId: "account-example",
  siteType: SITE_TYPES.OPENROUTER,
  scopeKey: "workspace-example",
  resourceId: "opaque-key-example",
}

const SCOPE: AccountKeyScope = {
  scopeKey: "workspace-example",
  routeKey: "keys",
  displayName: "Workspace",
  isDefault: true,
}

const OPEN_INPUT: AccountKeyResourceOpenInput = {
  account: {
    id: "account-example",
    name: "Example account",
    siteType: SITE_TYPES.OPENROUTER,
  },
  request: {
    accountId: "account-example",
    baseUrl: "https://example.invalid",
    auth: {
      authType: AuthTypeEnum.AccessToken,
      userId: "user-example",
      accessToken: "token",
    },
  },
}

const createDefinition = (overrides: Partial<Definition> = {}): Definition => ({
  siteType: SITE_TYPES.OPENROUTER,
  openConfig: vi.fn(async () => ({ scopeKey: "workspace-example" })),
  listScopes: vi.fn(async () => [SCOPE]),
  defaultScopeKey: (config) => config.scopeKey,
  encodeLocator: (locator) => locator,
  decodeLocator: (resourceId) => resourceId,
  locatorFromListItem: (item) => item.id,
  locatorFromDetail: (detail) => detail.id,
  list: vi.fn(async () => ({
    items: [{ id: "opaque-key-example", name: "Key" }],
  })),
  get: vi.fn(async () => ({ id: "opaque-key-example", name: "Key" })),
  toListFacts: (item, ref) => ({
    ref,
    displayName: item.name,
    maskedLabel: "…example",
    status: "enabled",
    fields: [],
    actions: { canUpdate: true, canDelete: true },
  }),
  toDetailFacts: (detail, ref) => ({
    ref,
    displayName: detail.name,
    maskedLabel: "…example",
    status: "enabled",
    fields: [],
    actions: { canUpdate: true, canDelete: true },
  }),
  createEditor: vi.fn(async () => ({
    fields: [],
    initialValues: { name: "" },
    validate: (): ResourceValidationResult => ({ valid: true }),
    buildCommand: (values: EditableResourceProjection) => ({
      name: String(values.name),
    }),
  })),
  editEditor: vi.fn(() => ({
    fields: [],
    initialValues: { name: "Key" },
    validate: (): ResourceValidationResult => ({ valid: true }),
    buildCommand: (values: EditableResourceProjection) => ({
      name: String(values.name),
    }),
  })),
  create: vi.fn<Definition["create"]>(async (_config, _scope, command) => ({
    certainty: "applied",
    value: { detail: { id: "created-key", name: command.name } },
  })),
  update: vi.fn<Definition["update"]>(
    async (_config, _scope, _detail, command) => ({
      certainty: "applied",
      value: { id: "opaque-key-example", name: command.name },
    }),
  ),
  delete: vi.fn(async () => ({
    certainty: "applied" as const,
    value: undefined,
  })),
  mapFailure: (error): ResourceFailure =>
    error === "denied"
      ? { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.PermissionDenied }
      : { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected },
  ...overrides,
})

const openSession = (definition = createDefinition()) =>
  defineAccountKeyResourceCapability(definition).open(OPEN_INPUT)

const open = async (definition = createDefinition()) =>
  (await openSession(definition)).openCollection("workspace-example")

describe("defineAccountKeyResourceCapability", () => {
  it("rejects wrong-account and wrong-scope refs before adapter access", async () => {
    const definition = createDefinition()
    const collection = await open(definition)

    await expect(
      collection.get({ ...REF, accountId: "other-account" }),
    ).rejects.toBeInstanceOf(AccountKeyResourceError)
    await expect(
      collection.openEditEditor({ ...REF, scopeKey: "other-scope" }),
    ).rejects.toBeInstanceOf(AccountKeyResourceError)

    expect(definition.get).not.toHaveBeenCalled()
  })

  it("rejects whitespace-only and wrong-site refs before provider decoding", async () => {
    const decodeLocator = vi.fn((resourceId: string) => resourceId)
    const definition = createDefinition({ decodeLocator })
    const collection = await open(definition)

    await expect(
      collection.get({ ...REF, resourceId: "   " }),
    ).rejects.toBeInstanceOf(AccountKeyResourceError)
    await expect(
      collection.get({ ...REF, siteType: SITE_TYPES.NEW_API }),
    ).rejects.toBeInstanceOf(AccountKeyResourceError)

    expect(definition.decodeLocator).not.toHaveBeenCalled()
    expect(definition.get).not.toHaveBeenCalled()
  })

  it("does not let late or duplicate mutation results escape the public editor", async () => {
    const deferred = (() => {
      let resolve!: (value: {
        certainty: "applied"
        value: { detail: Detail }
      }) => void
      const promise = new Promise<{
        certainty: "applied"
        value: { detail: Detail }
      }>((done) => {
        resolve = done
      })
      return { promise, resolve }
    })()
    const definition = createDefinition({
      create: vi.fn(() => deferred.promise),
    })
    const editor = await (
      await openSession(definition)
    ).openCreateEditor("workspace-example")

    const first = editor.submit({ name: "Created" })
    const duplicate = editor.submit({ name: "Ignored" })
    expect(first).toBe(duplicate)

    deferred.resolve({
      certainty: "applied",
      value: { detail: { id: "created-key", name: "Created" } },
    })
    await expect(first).resolves.toEqual({
      facts: expect.objectContaining({
        ref: expect.objectContaining({
          accountId: "account-example",
          resourceId: "created-key",
        }),
      }),
    })
    await expect(editor.submit({ name: "Late" })).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed },
    })
  })

  it("rejects an edit response whose native locator changes", async () => {
    const definition = createDefinition({
      update: vi.fn(async () => ({
        certainty: "applied" as const,
        value: { id: "other-opaque-key", name: "Other key" },
      })),
    })
    const editor = await (await open(definition)).openEditEditor(REF)

    await expect(editor.submit({ name: "Renamed" })).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected },
    })
  })

  it("maps option-loader failures through the account-native error boundary", async () => {
    const definition = createDefinition({
      createEditor: vi.fn(async () => ({
        fields: [],
        initialValues: { name: "" },
        validate: (): ResourceValidationResult => ({ valid: true }),
        buildCommand: (values: EditableResourceProjection) => ({
          name: String(values.name),
        }),
        loadOptions: async () => {
          throw "denied"
        },
      })),
    })
    const editor = await (
      await openSession(definition)
    ).openCreateEditor("workspace-example")

    await expect(
      editor.loadOptions?.("name", { name: "" }),
    ).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.PermissionDenied },
    })
  })

  it("snapshots and freezes public scopes before operations retain them", async () => {
    const definition = createDefinition()
    const session = await openSession(definition)
    const scopes = await session.listScopes()

    expect(Object.isFrozen(scopes)).toBe(true)
    expect(Object.isFrozen(scopes[0])).toBe(true)
    expect(Reflect.set(scopes[0]!, "scopeKey", "mutated-scope")).toBe(false)

    const collection = await session.openCollection("workspace-example")
    expect(Object.isFrozen(collection.scope)).toBe(true)
    expect(
      Reflect.set(collection.scope, "scopeKey", "other-mutated-scope"),
    ).toBe(false)

    const page = await collection.list()
    expect(page.items[0]?.ref.scopeKey).toBe("workspace-example")
    expect(definition.list).toHaveBeenCalledWith(
      { scopeKey: "workspace-example" },
      expect.objectContaining(SCOPE),
      undefined,
      undefined,
    )
    expect(definition.listScopes).toHaveBeenCalledOnce()
  })

  it.each([
    ["scope key", [SCOPE, { ...SCOPE, routeKey: "other", isDefault: false }]],
    [
      "route identity",
      [
        SCOPE,
        {
          ...SCOPE,
          scopeKey: "other-workspace",
          displayName: "Other workspace",
          isDefault: false,
        },
      ],
    ],
  ])("rejects duplicate %s values", async (_label, scopes) => {
    const definition = createDefinition({
      listScopes: vi.fn(async () => scopes),
    })

    await expect(
      (await openSession(definition)).listScopes(),
    ).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected },
    })
  })

  it.each([
    ["blank scope key", { ...SCOPE, scopeKey: "   " }],
    ["oversized scope key", { ...SCOPE, scopeKey: "x".repeat(2049) }],
    ["blank route key", { ...SCOPE, routeKey: "   " }],
    ["oversized route key", { ...SCOPE, routeKey: "x".repeat(513) }],
    ["blank display name", { ...SCOPE, displayName: "   " }],
    ["oversized display name", { ...SCOPE, displayName: "x".repeat(513) }],
    ["blank secondary label", { ...SCOPE, secondaryLabel: "   " }],
    [
      "oversized secondary label",
      { ...SCOPE, secondaryLabel: "x".repeat(513) },
    ],
    ["non-string secondary label", { ...SCOPE, secondaryLabel: 1 }],
    ["non-boolean default", { ...SCOPE, isDefault: "true" }],
  ])("rejects a malformed scope: %s", async (_label, scope) => {
    const definition = createDefinition({
      listScopes: vi.fn(async () => [scope] as unknown as AccountKeyScope[]),
    })

    await expect(
      (await openSession(definition)).listScopes(),
    ).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected },
    })
  })

  it("retries scope loading after an aborted or failed attempt", async () => {
    const listScopes = vi
      .fn<Definition["listScopes"]>()
      .mockRejectedValueOnce("denied")
      .mockResolvedValueOnce([SCOPE])
    const session = await openSession(createDefinition({ listScopes }))

    await expect(session.listScopes()).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.PermissionDenied },
    })
    await expect(session.listScopes()).resolves.toEqual([SCOPE])
    expect(listScopes).toHaveBeenCalledTimes(2)
  })

  it("keeps a structured partial scope inventory and refreshes only that cached read", async () => {
    const teamScope = {
      ...SCOPE,
      scopeKey: "workspace-team",
      routeKey: "team",
      displayName: "Team workspace",
      isDefault: false,
    }
    const listScopeInventory = vi
      .fn()
      .mockResolvedValueOnce({
        scopes: [SCOPE],
        partialFailure: {
          code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
        },
      })
      .mockResolvedValueOnce({ scopes: [SCOPE, teamScope] })
    const definition = createDefinition({
      listScopeInventory,
    } as never)
    const session = await openSession(definition)

    await expect((session as any).listScopeInventory()).resolves.toEqual({
      scopes: [SCOPE],
      partialFailure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
      },
    })
    await expect(session.listScopes()).resolves.toEqual([SCOPE])
    await expect((session as any).refreshScopeInventory()).resolves.toEqual({
      scopes: [SCOPE, teamScope],
    })
    await expect(session.listScopes()).resolves.toEqual([SCOPE, teamScope])
    expect(listScopeInventory).toHaveBeenCalledTimes(2)
    expect(definition.listScopes).not.toHaveBeenCalled()
  })

  it("does not share one caller's abort signal with another scope load", async () => {
    const firstAbort = new AbortController()
    const secondAbort = new AbortController()
    const listScopes = vi.fn<Definition["listScopes"]>(
      async (_config, options) => {
        if (options?.signal === secondAbort.signal) return [SCOPE]
        return await new Promise<readonly AccountKeyScope[]>(
          (_resolve, reject) => {
            options?.signal?.addEventListener("abort", () => reject("denied"), {
              once: true,
            })
          },
        )
      },
    )
    const session = await openSession(createDefinition({ listScopes }))

    const first = session.listScopes({ signal: firstAbort.signal })
    const second = session.listScopes({ signal: secondAbort.signal })
    firstAbort.abort()

    await expect(first).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.PermissionDenied },
    })
    await expect(second).resolves.toEqual([SCOPE])
    expect(listScopes).toHaveBeenCalledTimes(2)
  })

  it.each([
    null,
    {},
    { account: null, request: OPEN_INPUT.request },
    { account: OPEN_INPUT.account, request: null },
    {
      account: { ...OPEN_INPUT.account, id: "   " },
      request: OPEN_INPUT.request,
    },
  ])("fails closed for malformed open input %#", async (input) => {
    const capability = defineAccountKeyResourceCapability(createDefinition())

    await expect(capability.open(input as never)).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed },
    })
  })

  it("maps provider validation throws at the public editor boundary", async () => {
    const definition = createDefinition({
      createEditor: vi.fn(async () => ({
        fields: [],
        initialValues: {},
        validate: () => {
          throw "denied"
        },
        buildCommand: () => ({ name: "unused" }),
      })),
    })
    const editor = await (
      await openSession(definition)
    ).openCreateEditor("workspace-example")

    expect(() => editor.validate({})).toThrow(
      expect.objectContaining({
        failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.PermissionDenied },
      }),
    )
  })

  it("preserves safe validation issues without exposing provider values", async () => {
    const validation = {
      valid: false as const,
      issues: [
        {
          fieldId: "name",
          code: ACCOUNT_KEY_RESOURCE_FIELD_ISSUE_CODES.Required,
          rawValue: "provider-secret-value",
        },
      ],
    }
    const definition = createDefinition({
      createEditor: vi.fn(async () => ({
        fields: [],
        initialValues: {},
        validate: () => validation,
        buildCommand: () => ({ name: "unused" }),
      })),
    })
    const editor = await (
      await openSession(definition)
    ).openCreateEditor("workspace-example")

    expect(editor.validate({})).toEqual({
      valid: false,
      issues: [
        {
          fieldId: "name",
          code: ACCOUNT_KEY_RESOURCE_FIELD_ISSUE_CODES.Required,
        },
      ],
    })
    let submitError: unknown
    try {
      await editor.submit({})
    } catch (error) {
      submitError = error
    }
    expect(submitError).toBeInstanceOf(AccountKeyResourceError)
    expect((submitError as AccountKeyResourceError).failure).toEqual({
      code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed,
      fieldIssues: [
        {
          fieldId: "name",
          code: ACCOUNT_KEY_RESOURCE_FIELD_ISSUE_CODES.Required,
        },
      ],
    })
    expect(
      JSON.stringify((submitError as AccountKeyResourceError).failure),
    ).not.toContain("provider-secret-value")
  })

  it("passes canonical scope, commands, details, and options to mutations", async () => {
    const create = vi.fn<Definition["create"]>(
      async (_config, _scope, command) => ({
        certainty: "applied",
        value: { detail: { id: "created-key", name: command.name } },
      }),
    )
    const update = vi.fn<Definition["update"]>(
      async (_config, _scope, detail, command) => ({
        certainty: "applied",
        value: { ...detail, name: command.name },
      }),
    )
    const definition = createDefinition({ create, update })
    const session = await openSession(definition)
    const createOptions = { signal: new AbortController().signal }
    const editOptions = { signal: new AbortController().signal }

    await (
      await session.openCreateEditor("workspace-example")
    ).submit({ name: "Created" }, createOptions)
    await (
      await (
        await session.openCollection("workspace-example")
      ).openEditEditor(REF)
    ).submit({ name: "Renamed" }, editOptions)

    expect(create).toHaveBeenCalledWith(
      { scopeKey: "workspace-example" },
      expect.objectContaining(SCOPE),
      { name: "Created" },
      createOptions,
    )
    expect(update).toHaveBeenCalledWith(
      { scopeKey: "workspace-example" },
      expect.objectContaining(SCOPE),
      { id: "opaque-key-example", name: "Key" },
      { name: "Renamed" },
      editOptions,
    )
    expect(Object.isFrozen(create.mock.calls[0]![1])).toBe(true)
    expect(Object.isFrozen(update.mock.calls[0]![1])).toBe(true)
    expect(create.mock.calls[0]![1]).not.toBe(SCOPE)
    expect(update.mock.calls[0]![1]).not.toBe(SCOPE)
  })

  it("rejects a created secret correlated to a different resource", async () => {
    const definition = createDefinition({
      create: vi.fn<Definition["create"]>(async () => ({
        certainty: "applied",
        value: {
          detail: { id: "created-key", name: "Created" },
          createdSecret: {
            correlation: {
              kind: "account-key-resource",
              ref: {
                accountId: "other-account",
                siteType: SITE_TYPES.OPENROUTER,
                scopeKey: "workspace-example",
                resourceId: "created-key",
              },
            },
            displayName: "Created",
            secret: "created-secret",
            secretAvailability: "create-response-only",
            credential: {
              accountName: "Example",
              apiType: "openai-compatible",
              baseUrl: "https://api.example.invalid",
              tagIds: [],
            },
          },
        },
      })),
    })
    const editor = await (
      await openSession(definition)
    ).openCreateEditor("workspace-example")

    await expect(editor.submit({ name: "Created" })).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected },
    })
  })

  it("keeps a created secret correlated to the resulting resource", async () => {
    const definition = createDefinition({
      create: vi.fn<Definition["create"]>(async () => ({
        certainty: "applied",
        value: {
          detail: { id: "created-key", name: "Created" },
          createdSecret: {
            correlation: {
              kind: "account-key-resource",
              ref: {
                accountId: "account-example",
                siteType: SITE_TYPES.OPENROUTER,
                scopeKey: "workspace-example",
                resourceId: "created-key",
              },
            },
            displayName: "Created",
            secret: "created-secret",
            secretAvailability: "create-response-only",
            credential: {
              accountName: "Example",
              apiType: "openai-compatible",
              baseUrl: "https://api.example.invalid",
              tagIds: [],
            },
          },
        },
      })),
    })
    const editor = await (
      await openSession(definition)
    ).openCreateEditor("workspace-example")

    await expect(editor.submit({ name: "Created" })).resolves.toMatchObject({
      createdSecret: {
        correlation: {
          kind: "account-key-resource",
          ref: { resourceId: "created-key" },
        },
      },
    })
  })

  it("projects a created resource into its validated destination scope", async () => {
    const destinationScope = {
      scopeKey: "workspace-destination",
      routeKey: "destination",
      displayName: "Destination workspace",
      isDefault: false,
    }
    const definition = createDefinition({
      listScopes: vi.fn(async () => [SCOPE, destinationScope]),
      create: vi.fn<Definition["create"]>(async () => ({
        certainty: "applied",
        value: {
          detail: { id: "created-key", name: "Created" },
          scopeKey: "workspace-destination",
          createdSecret: {
            correlation: {
              kind: "account-key-resource",
              ref: {
                accountId: "account-example",
                siteType: SITE_TYPES.OPENROUTER,
                scopeKey: "workspace-destination",
                resourceId: "created-key",
              },
            },
            displayName: "Created",
            secret: "created-secret",
            secretAvailability: "create-response-only",
            credential: {
              accountName: "Example",
              apiType: "openai-compatible",
              baseUrl: "https://api.example.invalid",
              tagIds: [],
            },
          },
        },
      })),
    })
    const editor = await (
      await openSession(definition)
    ).openCreateEditor("workspace-example")

    await expect(editor.submit({ name: "Created" })).resolves.toMatchObject({
      facts: {
        ref: {
          accountId: "account-example",
          siteType: SITE_TYPES.OPENROUTER,
          scopeKey: "workspace-destination",
          resourceId: "created-key",
        },
      },
      createdSecret: {
        correlation: {
          kind: "account-key-resource",
          ref: {
            accountId: "account-example",
            siteType: SITE_TYPES.OPENROUTER,
            scopeKey: "workspace-destination",
            resourceId: "created-key",
          },
        },
      },
    })
  })

  it("preserves an applied create after the cached scope inventory drifts", async () => {
    const replacementScope = {
      ...SCOPE,
      scopeKey: "workspace-replacement",
      routeKey: "replacement",
      displayName: "Replacement workspace",
      isDefault: false,
    }
    const listScopeInventory = vi
      .fn()
      .mockResolvedValueOnce({ scopes: [SCOPE] })
      .mockResolvedValueOnce({ scopes: [replacementScope] })
    const definition = createDefinition({
      listScopeInventory,
      create: vi.fn<Definition["create"]>(async () => ({
        certainty: "applied",
        value: {
          detail: { id: "created-key", name: "Created" },
          scopeKey: SCOPE.scopeKey,
        },
      })),
    } as never)
    const session = await openSession(definition)
    const editor = await session.openCreateEditor(SCOPE.scopeKey)

    await expect(session.refreshScopeInventory?.()).resolves.toMatchObject({
      scopes: [replacementScope],
    })
    await expect(editor.submit({ name: "Created" })).resolves.toMatchObject({
      facts: {
        ref: {
          scopeKey: SCOPE.scopeKey,
          resourceId: "created-key",
        },
      },
    })
  })

  it("resolves a validated create destination before dispatch", async () => {
    const destinationScope = {
      scopeKey: "workspace-destination",
      routeKey: "destination",
      displayName: "Destination workspace",
      isDefault: false,
    }
    const create = vi.fn<Definition["create"]>(async () => ({
      certainty: "applied",
      value: { detail: { id: "created-key", name: "Created" } },
    }))
    const definition = createDefinition({
      listScopes: vi.fn(async () => [SCOPE, destinationScope]),
      create,
      createEditor: vi.fn(async () => ({
        fields: [],
        initialValues: { name: "", destinationScopeKey: SCOPE.scopeKey },
        validate: (): ResourceValidationResult => ({ valid: true }),
        buildCommand: (values: EditableResourceProjection) => ({
          name: String(values.name),
          destinationScopeKey: String(values.destinationScopeKey),
        }),
        destinationScopeKey: (command: CreateCommand) =>
          command.destinationScopeKey!,
      })),
    })
    const editor = await (
      await openSession(definition)
    ).openCreateEditor(SCOPE.scopeKey)

    expect(
      editor.resolveDestinationScopeKey({
        name: "Created",
        destinationScopeKey: destinationScope.scopeKey,
      }),
    ).toBe(destinationScope.scopeKey)
    expect(create).not.toHaveBeenCalled()
  })

  it("rejects an unvalidated command destination before create dispatch", async () => {
    const create = vi.fn<Definition["create"]>(async () => ({
      certainty: "applied",
      value: { detail: { id: "created-key", name: "Created" } },
    }))
    const definition = createDefinition({
      create,
      createEditor: vi.fn(async () => ({
        fields: [],
        initialValues: {
          name: "",
          destinationScopeKey: "workspace-unvalidated",
        },
        validate: (): ResourceValidationResult => ({ valid: true }),
        buildCommand: (values: EditableResourceProjection) => ({
          name: String(values.name),
          destinationScopeKey: String(values.destinationScopeKey),
        }),
        destinationScopeKey: (command: CreateCommand) =>
          command.destinationScopeKey!,
      })),
    })
    const editor = await (
      await openSession(definition)
    ).openCreateEditor("workspace-example")

    await expect(
      editor.submit({
        name: "Created",
        destinationScopeKey: "workspace-unvalidated",
      }),
    ).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed },
    })
    expect(create).not.toHaveBeenCalled()
  })

  it("preserves an applied resource when the provider reports another scope", async () => {
    const definition = createDefinition({
      create: vi.fn<Definition["create"]>(async () => ({
        certainty: "applied",
        value: {
          detail: { id: "created-key", name: "Created" },
          scopeKey: "workspace-unvalidated",
        },
      })),
    })
    const editor = await (
      await openSession(definition)
    ).openCreateEditor("workspace-example")

    await expect(editor.submit({ name: "Created" })).resolves.toMatchObject({
      facts: {
        ref: {
          scopeKey: "workspace-unvalidated",
          resourceId: "created-key",
        },
      },
    })
  })

  it("retries definite mutation rejection but closes after uncertain state", async () => {
    const retryingCreate = vi
      .fn<Definition["create"]>()
      .mockResolvedValueOnce({ certainty: "not-applied", failure: "denied" })
      .mockResolvedValueOnce({
        certainty: "applied",
        value: { detail: { id: "created-key", name: "Recovered" } },
      })
    const retryingEditor = await (
      await openSession(createDefinition({ create: retryingCreate }))
    ).openCreateEditor("workspace-example")

    await expect(
      retryingEditor.submit({ name: "First" }),
    ).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.PermissionDenied },
    })
    await expect(
      retryingEditor.submit({ name: "Recovered" }),
    ).resolves.toMatchObject({
      facts: { displayName: "Recovered" },
    })
    expect(retryingCreate).toHaveBeenCalledTimes(2)

    const uncertainCreate = vi.fn<Definition["create"]>(async () => ({
      certainty: "possibly-applied",
    }))
    const uncertainEditor = await (
      await openSession(createDefinition({ create: uncertainCreate }))
    ).openCreateEditor("workspace-example")

    await expect(
      uncertainEditor.submit({ name: "Uncertain" }),
    ).rejects.toMatchObject({
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
      },
    })
    await expect(
      uncertainEditor.submit({ name: "Replay" }),
    ).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed },
    })
    expect(uncertainCreate).toHaveBeenCalledOnce()
  })
})

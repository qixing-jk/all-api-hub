import { act, renderHook, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AccountKeyResourceEditorDialog } from "~/features/KeyManagement/components/AccountKeyResource/AccountKeyResourceEditorDialog"
import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "~/features/KeyManagement/constants"
import {
  isAccountKeyResourceRouteTransitionAcknowledged,
  useAccountKeyResourceController,
} from "~/features/KeyManagement/controllers/useAccountKeyResourceController"
import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  AccountKeyResourceError,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  OPENROUTER_KEY_FIELD_IDS,
  OPENROUTER_KEY_LIMIT_MODES,
  OPENROUTER_KEY_LIMIT_RESETS,
} from "~/services/apiAdapters/openrouter/keyResourceFields"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import { render, screen } from "~~/tests/test-utils/render"

const {
  createDisplayAccountApiContextMock,
  startProductAnalyticsActionMock,
  trackCompleteMock,
} = vi.hoisted(() => ({
  createDisplayAccountApiContextMock: vi.fn(),
  startProductAnalyticsActionMock: vi.fn(),
  trackCompleteMock: vi.fn(),
}))

vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  createDisplayAccountApiContext: (...args: unknown[]) =>
    createDisplayAccountApiContextMock(...args),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  resolveProductAnalyticsErrorCategoryFromError: vi.fn(() => "unknown"),
  startProductAnalyticsAction: (...args: unknown[]) =>
    startProductAnalyticsActionMock(...args),
}))

const createAccount = (id: string) =>
  ({
    id,
    name: "Example account",
    siteType: "openrouter" as const,
    baseUrl: "https://example.invalid",
  }) as any

const createFacts = (scopeKey: string, resourceId: string) => ({
  ref: {
    accountId: "account-example",
    siteType: "openrouter" as const,
    scopeKey,
    resourceId,
  },
  displayName: "Example key",
  maskedLabel: "sk-…example",
  status: "enabled",
  fields: [],
  actions: { canUpdate: true, canDelete: true },
})

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

const mockNativeResourceSession = (open: ReturnType<typeof vi.fn>) => {
  createDisplayAccountApiContextMock.mockReturnValue({
    accountKeyResources: { open },
    request: {},
  })
}

describe("useAccountKeyResourceController", () => {
  beforeEach(() => {
    createDisplayAccountApiContextMock.mockReset()
    startProductAnalyticsActionMock.mockReset()
    trackCompleteMock.mockReset()
    startProductAnalyticsActionMock.mockReturnValue({
      complete: trackCompleteMock,
    })
  })

  it("tracks a native refresh with controlled insights only", async () => {
    startProductAnalyticsActionMock.mockReturnValue({
      complete: trackCompleteMock,
    })
    const account = {
      ...createAccount("account-raw-example"),
      name: "Account Raw Name",
      siteType: "openrouter",
    }
    const scope = {
      scopeKey: "workspace-raw-id",
      routeKey: "team",
      displayName: "Workspace Raw Name",
      isDefault: true,
    }
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue(scope),
        listScopes: vi.fn().mockResolvedValue([scope]),
        openCollection: vi.fn().mockResolvedValue({
          list: vi.fn().mockResolvedValue({ items: [] }),
        }),
        openCreateEditor: vi.fn(),
      }),
    )
    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [account],
        selectedAccount: account.id,
        routeParams: { accountId: account.id, workspace: "team" },
      }),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => {
      await result.current.refresh()
    })

    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccountTokens,
      }),
    )
    expect(trackCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      expect.objectContaining({ insights: expect.any(Object) }),
    )
    const calls = JSON.stringify([
      startProductAnalyticsActionMock.mock.calls,
      trackCompleteMock.mock.calls,
    ])
    for (const value of [
      "account-raw-example",
      "workspace-raw-id",
      "Account Raw Name",
      "Workspace Raw Name",
      "hash-example",
      "secret-example",
      "limit-example",
      "upstream message",
    ]) {
      expect(calls).not.toContain(value)
    }
  })

  it("falls back from an invalid workspace route without opening the stale scope", async () => {
    const openCollection = vi.fn().mockResolvedValue({
      list: vi.fn().mockResolvedValue({
        items: [createFacts("workspace-default-id", "key-example")],
      }),
    })
    const session = {
      resolveDefaultScope: vi.fn().mockResolvedValue({
        scopeKey: "workspace-default-id",
        routeKey: "team",
        displayName: "Team",
        isDefault: true,
      }),
      listScopes: vi.fn().mockResolvedValue([
        {
          scopeKey: "workspace-default-id",
          routeKey: "team",
          displayName: "Team",
          isDefault: true,
        },
      ]),
      openCollection,
      openCreateEditor: vi.fn(),
    }
    const open = vi.fn().mockResolvedValue(session)
    const replaceRoute = vi.fn()
    mockNativeResourceSession(open)

    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: { accountId: "account-example", workspace: "stale" },
        replaceRoute,
      }),
    )

    await waitFor(() => expect(result.current.rows).toHaveLength(1))
    expect(openCollection).toHaveBeenCalledWith("workspace-default-id", {
      signal: expect.any(AbortSignal),
    })
    expect(openCollection).not.toHaveBeenCalledWith("stale", expect.anything())
    expect(replaceRoute).toHaveBeenCalledWith({
      accountId: "account-example",
      workspace: "team",
    })
    expect(result.current.notice?.kind).toBe("workspace-fallback")
  })

  it("keeps default-scope rows usable while retrying a partial workspace inventory", async () => {
    const defaultScope = {
      scopeKey: "workspace-default-id",
      routeKey: "default",
      displayName: "Default workspace",
      isDefault: true,
    }
    const teamScope = {
      scopeKey: "workspace-team-id",
      routeKey: "team",
      displayName: "Team workspace",
      secondaryLabel: "team",
      isDefault: false,
    }
    const facts = createFacts(defaultScope.scopeKey, "key-example")
    const list = vi.fn().mockResolvedValue({ items: [facts] })
    const session = {
      resolveDefaultScope: vi.fn().mockResolvedValue(defaultScope),
      listScopes: vi.fn().mockResolvedValue([defaultScope]),
      listScopeInventory: vi.fn().mockResolvedValue({
        scopes: [defaultScope],
        partialFailure: {
          code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
          message: "Controlled workspace inventory failure",
        },
      }),
      refreshScopeInventory: vi.fn().mockResolvedValue({
        scopes: [defaultScope, teamScope],
      }),
      openCollection: vi.fn().mockResolvedValue({ list }),
      openCreateEditor: vi.fn(),
    }
    mockNativeResourceSession(vi.fn().mockResolvedValue(session))

    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: {
          accountId: "account-example",
          workspace: defaultScope.routeKey,
        },
      }),
    )

    await waitFor(() => expect(result.current.rows).toEqual([facts]))
    expect((result.current as any).scopeInventoryFailure).toMatchObject({
      code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
    })
    expect(result.current.failures).toEqual({})
    expect(result.current.scopes).toEqual([defaultScope])

    await act(async () => {
      await (result.current as any).retryScopeInventory()
    })

    expect(session.refreshScopeInventory).toHaveBeenCalledOnce()
    expect(result.current.scopes).toEqual([defaultScope, teamScope])
    expect((result.current as any).scopeInventoryFailure).toBeNull()
    expect(result.current.rows).toEqual([facts])
    expect(list).toHaveBeenCalledOnce()
    expect(session.openCollection).toHaveBeenCalledOnce()
  })

  it("ignores a late workspace-inventory retry after the account session changes", async () => {
    const retry = deferred<any>()
    const firstScope = {
      scopeKey: "workspace-first-id",
      routeKey: "first",
      displayName: "First workspace",
      isDefault: true,
    }
    const secondScope = {
      scopeKey: "workspace-second-id",
      routeKey: "second",
      displayName: "Second workspace",
      isDefault: true,
    }
    const staleScope = {
      scopeKey: "workspace-stale-id",
      routeKey: "stale",
      displayName: "Stale workspace",
      isDefault: false,
    }
    const firstSession = {
      resolveDefaultScope: vi.fn().mockResolvedValue(firstScope),
      listScopes: vi.fn().mockResolvedValue([firstScope]),
      listScopeInventory: vi.fn().mockResolvedValue({
        scopes: [firstScope],
        partialFailure: {
          code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
        },
      }),
      refreshScopeInventory: vi.fn(() => retry.promise),
      openCollection: vi.fn().mockResolvedValue({
        list: vi.fn().mockResolvedValue({ items: [] }),
      }),
      openCreateEditor: vi.fn(),
    }
    const secondSession = {
      resolveDefaultScope: vi.fn().mockResolvedValue(secondScope),
      listScopes: vi.fn().mockResolvedValue([secondScope]),
      listScopeInventory: vi.fn().mockResolvedValue({ scopes: [secondScope] }),
      refreshScopeInventory: vi.fn(),
      openCollection: vi.fn().mockResolvedValue({
        list: vi.fn().mockResolvedValue({ items: [] }),
      }),
      openCreateEditor: vi.fn(),
    }
    mockNativeResourceSession(
      vi.fn((input: { account: { id: string } }) =>
        Promise.resolve(
          input.account.id === "account-one" ? firstSession : secondSession,
        ),
      ),
    )
    const accounts = [
      createAccount("account-one"),
      createAccount("account-two"),
    ]
    const { result, rerender } = renderHook(
      ({ selectedAccount, workspace }) =>
        useAccountKeyResourceController({
          accounts,
          selectedAccount,
          routeParams: { accountId: selectedAccount, workspace },
        }),
      { initialProps: { selectedAccount: "account-one", workspace: "first" } },
    )

    await waitFor(() =>
      expect(result.current.selectedScope).toEqual(firstScope),
    )
    act(() => {
      void (result.current as any).retryScopeInventory()
    })
    await waitFor(() =>
      expect(firstSession.refreshScopeInventory).toHaveBeenCalledOnce(),
    )

    rerender({ selectedAccount: "account-two", workspace: "second" })
    await waitFor(() =>
      expect(result.current.selectedScope).toEqual(secondScope),
    )
    await act(async () => retry.resolve({ scopes: [firstScope, staleScope] }))

    expect(result.current.selectedScope).toEqual(secondScope)
    expect(result.current.scopes).toEqual([secondScope])
    expect((result.current as any).scopeInventoryFailure).toBeNull()
  })

  it("rejects an unauthorized route scope when it names a different account", async () => {
    const openCollection = vi.fn().mockResolvedValue({
      list: vi.fn().mockResolvedValue({ items: [] }),
    })
    const replaceRoute = vi.fn()
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue({
          scopeKey: "workspace-default-id",
          routeKey: "default",
          displayName: "Default",
          isDefault: true,
        }),
        listScopes: vi.fn().mockResolvedValue([
          {
            scopeKey: "workspace-unauthorized-id",
            routeKey: "unauthorized",
            displayName: "Unauthorized",
            isDefault: false,
          },
        ]),
        openCollection,
        openCreateEditor: vi.fn(),
      }),
    )

    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: {
          accountId: "another-account",
          workspace: "unauthorized",
        },
        replaceRoute,
      }),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(openCollection).toHaveBeenCalledWith("workspace-default-id", {
      signal: expect.any(AbortSignal),
    })
    expect(openCollection).not.toHaveBeenCalledWith(
      "workspace-unauthorized-id",
      expect.anything(),
    )
    expect(replaceRoute).toHaveBeenCalledWith({
      accountId: "account-example",
      workspace: "default",
    })
    expect(result.current.notice?.kind).toBe("workspace-fallback")
  })

  it("canonicalizes a missing workspace without reporting a fallback", async () => {
    const scope = {
      scopeKey: "workspace-default-id",
      routeKey: "default",
      displayName: "Default",
      isDefault: true,
    }
    const replaceRoute = vi.fn()
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue(scope),
        listScopes: vi.fn().mockResolvedValue([scope]),
        openCollection: vi.fn().mockResolvedValue({
          list: vi.fn().mockResolvedValue({ items: [] }),
        }),
        openCreateEditor: vi.fn(),
      }),
    )

    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: { accountId: "account-example" },
        replaceRoute,
      }),
    )

    await waitFor(() => expect(result.current.selectedScope).toEqual(scope))
    expect(replaceRoute).toHaveBeenCalledWith({
      accountId: "account-example",
      workspace: "default",
    })
    expect(result.current.notice).toBeNull()
  })

  it("reloads and canonicalizes when only the route account id changes", async () => {
    const openCollection = vi.fn().mockResolvedValue({
      list: vi.fn().mockResolvedValue({ items: [] }),
    })
    const open = vi.fn().mockResolvedValue({
      resolveDefaultScope: vi.fn().mockResolvedValue({
        scopeKey: "workspace-default-id",
        routeKey: "team",
        displayName: "Team",
        isDefault: true,
      }),
      listScopes: vi.fn().mockResolvedValue([]),
      openCollection,
      openCreateEditor: vi.fn(),
    })
    const replaceRoute = vi.fn()
    mockNativeResourceSession(open)
    const { rerender } = renderHook(
      ({ routeAccountId }) =>
        useAccountKeyResourceController({
          accounts: [createAccount("account-example")],
          selectedAccount: "account-example",
          routeParams: { accountId: routeAccountId, workspace: "team" },
          replaceRoute,
        }),
      { initialProps: { routeAccountId: "account-example" } },
    )

    await waitFor(() => expect(openCollection).toHaveBeenCalledTimes(1))
    expect(replaceRoute).not.toHaveBeenCalled()

    rerender({ routeAccountId: "stale-account" })

    await waitFor(() => expect(openCollection).toHaveBeenCalledTimes(2))
    expect(open).toHaveBeenCalledTimes(2)
    expect(replaceRoute).toHaveBeenCalledWith({
      accountId: "account-example",
      workspace: "team",
    })
  })

  it("rebuilds and aborts when request context changes for the same account identity", async () => {
    const firstList = deferred<any>()
    const scope = {
      scopeKey: "workspace-default-id",
      routeKey: "team",
      displayName: "Team",
      isDefault: true,
    }
    const open = vi
      .fn()
      .mockResolvedValueOnce({
        resolveDefaultScope: vi.fn().mockResolvedValue(scope),
        listScopes: vi.fn().mockResolvedValue([scope]),
        openCollection: vi.fn().mockResolvedValue({
          list: vi.fn(() => firstList.promise),
        }),
        openCreateEditor: vi.fn(),
      })
      .mockResolvedValueOnce({
        resolveDefaultScope: vi.fn().mockResolvedValue(scope),
        listScopes: vi.fn().mockResolvedValue([scope]),
        openCollection: vi.fn().mockResolvedValue({
          list: vi.fn().mockResolvedValue({
            items: [createFacts(scope.scopeKey, "key-current")],
          }),
        }),
        openCreateEditor: vi.fn(),
      })
    mockNativeResourceSession(open)
    const firstAccount = {
      ...createAccount("account-example"),
      baseUrl: "https://first.example.invalid",
      authType: "access_token",
      userId: "user-first",
      token: "secret-first",
    }
    const secondAccount = {
      ...firstAccount,
      baseUrl: "https://second.example.invalid",
      userId: "user-second",
      token: "secret-second",
      cookieAuthSessionCookie: "secret-cookie-second",
    }
    const { result, rerender } = renderHook(
      ({ account }) =>
        useAccountKeyResourceController({
          accounts: [account as any],
          selectedAccount: "account-example",
          routeParams: { accountId: "account-example", workspace: "team" },
        }),
      { initialProps: { account: firstAccount } },
    )
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1))
    const firstSignal = open.mock.calls[0]?.[1]?.signal as
      | AbortSignal
      | undefined

    rerender({ account: secondAccount })

    await waitFor(() => expect(open).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(result.current.rows.map((row) => row.ref.resourceId)).toEqual([
        "key-current",
      ]),
    )
    expect(firstSignal?.aborted).toBe(true)
    expect(createDisplayAccountApiContextMock.mock.lastCall?.[0]).toMatchObject(
      {
        id: "account-example",
        siteType: "openrouter",
        baseUrl: "https://second.example.invalid",
        authType: "access_token",
        userId: "user-second",
      },
    )
    await act(async () => firstList.resolve({ items: [] }))
    expect(result.current.rows[0]?.ref.resourceId).toBe("key-current")
  })

  it("defers a same-route context reload until a created secret closes", async () => {
    const staleList = deferred<any>()
    const currentList = deferred<any>()
    const scope = {
      scopeKey: "workspace-default-id",
      routeKey: "team",
      displayName: "Team",
      isDefault: true,
    }
    const initialFacts = createFacts(scope.scopeKey, "key-initial")
    const staleFacts = createFacts(scope.scopeKey, "key-stale")
    const currentFacts = createFacts(scope.scopeKey, "key-current")
    const createdSecret = {
      correlation: {
        kind: "account-key-resource" as const,
        ref: initialFacts.ref,
      },
      displayName: "Created key",
      secret: "one-time-secret-example",
      secretAvailability: "create-response-only" as const,
      credential: {},
    }
    const editor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => scope.scopeKey,
      submit: vi.fn().mockResolvedValue({
        facts: initialFacts,
        createdSecret,
      }),
    }
    const initialCollection = {
      list: vi.fn().mockResolvedValue({ items: [initialFacts] }),
      get: vi.fn(),
      openEditEditor: vi.fn(),
      delete: vi.fn(),
    }
    const staleCollection = {
      list: vi.fn(() => staleList.promise),
      get: vi.fn(),
      openEditEditor: vi.fn(),
      delete: vi.fn(),
    }
    const currentCollection = {
      list: vi.fn(() => currentList.promise),
      get: vi.fn(),
      openEditEditor: vi.fn(),
      delete: vi.fn(),
    }
    const createSession = (collection: typeof initialCollection) => ({
      resolveDefaultScope: vi.fn().mockResolvedValue(scope),
      listScopes: vi.fn().mockResolvedValue([scope]),
      openCollection: vi.fn().mockResolvedValue(collection),
      openCreateEditor: vi.fn().mockResolvedValue(editor),
    })
    const open = vi
      .fn()
      .mockResolvedValueOnce(createSession(initialCollection))
      .mockResolvedValueOnce(createSession(staleCollection))
      .mockResolvedValueOnce(createSession(currentCollection))
    mockNativeResourceSession(open)
    const firstAccount = {
      ...createAccount("account-example"),
      baseUrl: "https://first.example.invalid",
      authType: "access_token",
      userId: "user-first",
      token: "secret-first",
    }
    const secondAccount = {
      ...firstAccount,
      baseUrl: "https://second.example.invalid",
      userId: "user-second",
      token: "secret-second",
    }
    const { result, rerender } = renderHook(
      ({ account }) =>
        useAccountKeyResourceController({
          accounts: [account],
          selectedAccount: "account-example",
          routeParams: { accountId: "account-example", workspace: "team" },
        }),
      { initialProps: { account: firstAccount } },
    )

    await waitFor(() => expect(result.current.rows).toEqual([initialFacts]))
    await act(async () => result.current.openCreate())
    act(() => {
      void result.current.submitEditor(result.current.editor!.editorId, {})
    })
    await waitFor(() => expect(staleCollection.list).toHaveBeenCalledOnce())
    expect(result.current.createdSecret).toBe(createdSecret)

    rerender({ account: secondAccount })

    await waitFor(() =>
      expect(result.current.createdSecret).toBe(createdSecret),
    )
    expect(open).toHaveBeenCalledTimes(2)
    expect(result.current.openDelete(initialFacts.ref)).toBe(false)

    act(() => {
      result.current.closeCreatedSecret()
      void result.current.openDetail(initialFacts.ref)
      expect(result.current.openDelete(initialFacts.ref)).toBe(false)
    })

    await waitFor(() => expect(open).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(currentCollection.list).toHaveBeenCalledOnce())
    expect(initialCollection.get).not.toHaveBeenCalled()
    expect(result.current.isLoading).toBe(true)
    expect(createDisplayAccountApiContextMock.mock.lastCall?.[0]).toMatchObject(
      {
        baseUrl: "https://second.example.invalid",
        authType: "access_token",
        userId: "user-second",
        token: "secret-second",
      },
    )

    await act(async () => currentList.resolve({ items: [currentFacts] }))
    await waitFor(() => expect(result.current.rows).toEqual([currentFacts]))
    await act(async () => staleList.resolve({ items: [staleFacts] }))
    expect(result.current.rows).toEqual([currentFacts])
    expect(open).toHaveBeenCalledTimes(3)
  })

  it("aborts an obsolete workspace list and ignores its late rows", async () => {
    const firstList = deferred<any>()
    const firstCollection = {
      list: vi.fn((..._args: unknown[]) => firstList.promise),
    }
    const secondCollection = {
      list: vi.fn().mockResolvedValue({
        items: [createFacts("workspace-second-id", "key-second")],
      }),
    }
    const scopes = [
      {
        scopeKey: "workspace-default-id",
        routeKey: "team",
        displayName: "Team",
        isDefault: true,
      },
      {
        scopeKey: "workspace-second-id",
        routeKey: "second",
        displayName: "Second",
        isDefault: false,
      },
    ]
    const session = {
      resolveDefaultScope: vi.fn().mockResolvedValue(scopes[0]),
      listScopes: vi.fn().mockResolvedValue(scopes),
      openCollection: vi.fn((scopeKey: string) =>
        Promise.resolve(
          scopeKey === "workspace-default-id"
            ? firstCollection
            : secondCollection,
        ),
      ),
      openCreateEditor: vi.fn(),
    }
    mockNativeResourceSession(vi.fn().mockResolvedValue(session))

    const { result, rerender } = renderHook(
      ({ workspace }) =>
        useAccountKeyResourceController({
          accounts: [createAccount("account-example")],
          selectedAccount: "account-example",
          routeParams: { accountId: "account-example", workspace },
        }),
      { initialProps: { workspace: "team" } },
    )

    await waitFor(() => expect(firstCollection.list).toHaveBeenCalledTimes(1))
    const firstSignal = (
      firstCollection.list.mock.calls[0]?.[1] as
        | { signal?: AbortSignal }
        | undefined
    )?.signal
    rerender({ workspace: "second" })
    await waitFor(() => expect(secondCollection.list).toHaveBeenCalledTimes(1))
    expect(firstSignal?.aborted).toBe(true)

    await act(async () => {
      firstList.resolve({
        items: [createFacts("workspace-default-id", "late-key")],
      })
    })

    await waitFor(() =>
      expect(result.current.rows.map((row) => row.ref.resourceId)).toEqual([
        "key-second",
      ]),
    )
  })

  it("rehydrates an OpenRouter create editor for the selected workspace", async () => {
    const field = OPENROUTER_KEY_FIELD_IDS
    const previousOptions = deferred<any>()
    const nextOptions = deferred<any>()
    const scopes = [
      {
        scopeKey: "workspace-first-id",
        routeKey: "first",
        displayName: "First",
        isDefault: true,
      },
      {
        scopeKey: "workspace-second-id",
        routeKey: "second",
        displayName: "Second",
        isDefault: false,
      },
    ]
    const fields = [
      {
        fieldId: field.Name,
        type: "text" as const,
        required: true,
      },
      {
        fieldId: field.Workspace,
        type: "select" as const,
        required: true,
        options: scopes.map((scope) => ({ value: scope.scopeKey })),
      },
      {
        fieldId: field.Creator,
        type: "select" as const,
        nullable: true,
        options: [],
        optionLoader: { dependsOn: [field.Workspace] },
      },
    ]
    const firstEditor = {
      fields,
      initialValues: {
        [field.Name]: "",
        [field.Workspace]: "workspace-first-id",
        [field.Creator]: null,
      },
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => "workspace-first-id",
      loadOptions: vi.fn(() => previousOptions.promise),
      submit: vi.fn(),
    }
    const secondSubmit = vi.fn().mockResolvedValue({
      facts: createFacts("workspace-second-id", "key-second"),
    })
    const secondEditor = {
      fields,
      initialValues: {
        [field.Name]: "",
        [field.Workspace]: "workspace-second-id",
        [field.Creator]: null,
      },
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => "workspace-second-id",
      loadOptions: vi.fn(() => nextOptions.promise),
      submit: secondSubmit,
    }
    const replaceRoute = vi.fn()
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue(scopes[0]),
        listScopes: vi.fn().mockResolvedValue(scopes),
        openCollection: vi.fn().mockResolvedValue({
          list: vi.fn().mockResolvedValue({ items: [] }),
        }),
        openCreateEditor: vi
          .fn()
          .mockResolvedValueOnce(firstEditor)
          .mockResolvedValueOnce(secondEditor),
      }),
    )
    const { result, rerender } = renderHook(
      ({ workspace }) =>
        useAccountKeyResourceController({
          accounts: [createAccount("account-example")],
          selectedAccount: "account-example",
          routeParams: { accountId: "account-example", workspace },
          replaceRoute,
        }),
      { initialProps: { workspace: "first" } },
    )

    await waitFor(() => expect(result.current.selectedScope).toEqual(scopes[0]))
    await act(async () => result.current.openCreate())
    const firstEditorId = result.current.editor!.editorId
    act(() =>
      result.current.setEditorValues(result.current.editor!.editorId, {
        [field.Name]: "User key name",
        [field.Workspace]: "workspace-first-id",
        [field.Creator]: "member-first",
      }),
    )
    act(() => {
      void result.current.loadEditorOptions(
        result.current.editor!.editorId,
        field.Creator,
      )
    })
    await waitFor(() =>
      expect(firstEditor.loadOptions).toHaveBeenCalledTimes(1),
    )
    const firstSignal = (
      firstEditor.loadOptions.mock.calls[0] as unknown as
        | [unknown, unknown, { signal?: AbortSignal }]
        | undefined
    )?.[2]?.signal
    expect(result.current.selectScope(scopes[1]!.scopeKey)).toBe(true)
    expect(replaceRoute).toHaveBeenCalledWith({
      accountId: "account-example",
      workspace: "second",
    })

    rerender({ workspace: "second" })
    await waitFor(() =>
      expect(result.current.selectedScope?.scopeKey).toBe(
        "workspace-second-id",
      ),
    )
    await waitFor(() =>
      expect(result.current.editor?.editorId).not.toBe(firstEditorId),
    )
    // The keyed dialog owns dependent option loading after rehydration. The
    // controller only exposes the rehydrated editor session.
    expect(secondEditor.loadOptions).not.toHaveBeenCalled()
    act(() => {
      void result.current.loadEditorOptions(
        result.current.editor!.editorId,
        field.Creator,
      )
    })
    await waitFor(() => expect(secondEditor.loadOptions).toHaveBeenCalledOnce())
    expect(secondEditor.loadOptions).toHaveBeenCalledWith(
      field.Creator,
      {
        [field.Name]: "User key name",
        [field.Workspace]: "workspace-second-id",
        [field.Creator]: null,
      },
      { signal: expect.any(AbortSignal) },
    )
    expect(firstSignal?.aborted).toBe(true)
    expect(result.current.editor?.mode).toBe("create")
    nextOptions.resolve([{ value: "member-second" }])
    await waitFor(() =>
      expect(result.current.editor?.optionsByField[field.Creator]).toEqual([
        { value: "member-second" },
      ]),
    )
    expect(result.current.editor?.values).toEqual({
      [field.Name]: "User key name",
      [field.Workspace]: "workspace-second-id",
      [field.Creator]: null,
    })

    await act(async () => previousOptions.resolve([{ value: "member-first" }]))
    expect(result.current.editor?.optionsByField[field.Creator]).toEqual([
      { value: "member-second" },
    ])
    expect(result.current.editor?.values[field.Creator]).toBeNull()
    expect(result.current.editor?.feedback).toBeNull()
    expect(firstEditor.submit).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.submitEditor(
        result.current.editor!.editorId,
        result.current.editor!.values,
      )
    })
    expect(secondSubmit).toHaveBeenCalledWith(
      {
        [field.Name]: "User key name",
        [field.Workspace]: "workspace-second-id",
        [field.Creator]: null,
      },
      { signal: expect.any(AbortSignal) },
    )
  })

  it("keeps a dialog's typed projection through controller workspace rehydration and cannot submit an invalidated creator", async () => {
    const field = OPENROUTER_KEY_FIELD_IDS
    const user = userEvent.setup()
    const firstOptions = deferred<any>()
    const secondOptions = deferred<any>()
    const scopes = [
      {
        scopeKey: "workspace-first-id",
        routeKey: "first",
        displayName: "First team",
        isDefault: true,
      },
      {
        scopeKey: "workspace-second-id",
        routeKey: "second",
        displayName: "Next team",
        isDefault: false,
      },
    ]
    const fields = [
      { fieldId: field.Name, type: "text" as const, required: true },
      {
        fieldId: field.Workspace,
        type: "select" as const,
        required: true,
        options: scopes.map((scope) => ({
          value: scope.scopeKey,
          displayLabel: scope.displayName,
        })),
      },
      {
        fieldId: field.Creator,
        type: "select" as const,
        nullable: true,
        options: [],
        optionLoader: { dependsOn: [field.Workspace] },
      },
      {
        fieldId: field.LimitMode,
        type: "select" as const,
        required: true,
        options: Object.values(OPENROUTER_KEY_LIMIT_MODES).map((value) => ({
          value,
        })),
      },
      { fieldId: field.Limit, type: "number" as const, nullable: true },
      {
        fieldId: field.LimitReset,
        type: "select" as const,
        required: true,
        options: Object.values(OPENROUTER_KEY_LIMIT_RESETS).map((value) => ({
          value,
        })),
      },
      { fieldId: field.ExpiresAt, type: "date-time" as const, nullable: true },
      { fieldId: field.IncludeByokInLimit, type: "boolean" as const },
    ]
    const createInitialValues = (workspace: string) => ({
      [field.Name]: "",
      [field.Workspace]: workspace,
      [field.Creator]: null,
      [field.LimitMode]: OPENROUTER_KEY_LIMIT_MODES.Unlimited,
      [field.Limit]: null,
      [field.LimitReset]: OPENROUTER_KEY_LIMIT_RESETS.None,
      [field.ExpiresAt]: null,
      [field.IncludeByokInLimit]: false,
    })
    const firstEditor = {
      fields,
      initialValues: createInitialValues("workspace-first-id"),
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => "workspace-first-id",
      loadOptions: vi.fn(() => firstOptions.promise),
      submit: vi.fn(),
    }
    const secondSubmit = vi.fn().mockResolvedValue({
      facts: createFacts("workspace-second-id", "key-second"),
    })
    const secondEditor = {
      fields,
      initialValues: createInitialValues("workspace-second-id"),
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => "workspace-second-id",
      loadOptions: vi.fn(() => secondOptions.promise),
      submit: secondSubmit,
    }
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue(scopes[0]),
        listScopes: vi.fn().mockResolvedValue(scopes),
        openCollection: vi.fn().mockResolvedValue({
          list: vi.fn().mockResolvedValue({ items: [] }),
        }),
        openCreateEditor: vi
          .fn()
          .mockResolvedValueOnce(firstEditor)
          .mockResolvedValueOnce(secondEditor),
      }),
    )

    const ControllerDialogHarness = () => {
      const [workspace, setWorkspace] = useState("first")
      const controller = useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: { accountId: "account-example", workspace },
        replaceRoute: (params) => setWorkspace(params.workspace ?? "first"),
      })
      return (
        <>
          <button type="button" onClick={() => void controller.openCreate()}>
            Open editor
          </button>
          <button
            type="button"
            onClick={() => controller.selectScope("workspace-second-id")}
          >
            Rehydrate workspace
          </button>
          <AccountKeyResourceEditorDialog
            editor={controller.editor}
            onClose={controller.closeEditor}
            onSubmit={controller.submitEditor}
            onValuesChange={controller.setEditorValues}
            onLoadOptions={controller.loadEditorOptions}
          />
        </>
      )
    }
    render(<ControllerDialogHarness />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    await user.click(screen.getByRole("button", { name: "Open editor" }))
    await waitFor(() => expect(firstEditor.loadOptions).toHaveBeenCalled())
    await act(async () =>
      firstOptions.resolve([
        { value: "member-first", displayLabel: "First member" },
      ]),
    )
    const name = await screen.findByRole("textbox", {
      name: /keyManagement:openRouter\.editor\.fields\.name\.label/,
    })
    await user.type(name, "Typed key")
    await user.click(
      screen.getByRole("combobox", {
        name: /keyManagement:openRouter\.editor\.fields\.creator\.label/,
      }),
    )
    await user.click(screen.getByRole("option", { name: "First member" }))

    await user.click(
      screen.getByRole("button", { name: "Rehydrate workspace" }),
    )
    await waitFor(() => expect(secondEditor.loadOptions).toHaveBeenCalled())
    expect(name).toHaveValue("Typed key")
    await act(async () =>
      secondOptions.resolve([
        { value: "member-second", displayLabel: "Next member" },
      ]),
    )
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:openRouter.editor.actions.save",
      }),
    )

    expect(secondSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        [field.Name]: "Typed key",
        [field.Workspace]: "workspace-second-id",
        [field.Creator]: null,
      }),
      { signal: expect.any(AbortSignal) },
    )
  })

  it("does not submit the obsolete editor while a workspace transition is loading", async () => {
    const secondCollection = deferred<any>()
    const scopes = [
      {
        scopeKey: "workspace-first-id",
        routeKey: "first",
        displayName: "First",
        isDefault: true,
      },
      {
        scopeKey: "workspace-second-id",
        routeKey: "second",
        displayName: "Second",
        isDefault: false,
      },
    ]
    const firstEditor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => "workspace-first-id",
      submit: vi.fn().mockResolvedValue({}),
    }
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue(scopes[0]),
        listScopes: vi.fn().mockResolvedValue(scopes),
        openCollection: vi.fn((scopeKey: string) =>
          scopeKey === "workspace-first-id"
            ? Promise.resolve({
                list: vi.fn().mockResolvedValue({ items: [] }),
              })
            : secondCollection.promise,
        ),
        openCreateEditor: vi.fn().mockResolvedValue(firstEditor),
      }),
    )
    const { result, rerender } = renderHook(
      ({ workspace }) =>
        useAccountKeyResourceController({
          accounts: [createAccount("account-example")],
          selectedAccount: "account-example",
          routeParams: { accountId: "account-example", workspace },
        }),
      { initialProps: { workspace: "first" } },
    )

    await waitFor(() => expect(result.current.selectedScope).toEqual(scopes[0]))
    await act(async () => result.current.openCreate())

    rerender({ workspace: "second" })
    await waitFor(() => expect(result.current.selectedScope).toBeNull())
    act(() => {
      void result.current.submitEditor(
        result.current.editor?.editorId ?? -1,
        {},
      )
    })

    expect(firstEditor.submit).not.toHaveBeenCalled()
  })

  it("preserves edits made while a workspace transition is still loading", async () => {
    const secondCollection = deferred<any>()
    const scopes = [
      {
        scopeKey: "workspace-first-id",
        routeKey: "first",
        displayName: "First",
        isDefault: true,
      },
      {
        scopeKey: "workspace-second-id",
        routeKey: "second",
        displayName: "Second",
        isDefault: false,
      },
    ]
    const fields = [{ fieldId: "name", type: "text" as const }]
    const firstEditor = {
      fields,
      initialValues: { name: "" },
      validate: vi.fn().mockReturnValue({ valid: true }),
      submit: vi.fn(),
    }
    const secondEditor = {
      fields,
      initialValues: { name: "" },
      validate: vi.fn().mockReturnValue({ valid: true }),
      submit: vi.fn(),
    }
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue(scopes[0]),
        listScopes: vi.fn().mockResolvedValue(scopes),
        openCollection: vi.fn((scopeKey: string) =>
          scopeKey === "workspace-first-id"
            ? Promise.resolve({
                list: vi.fn().mockResolvedValue({ items: [] }),
              })
            : secondCollection.promise,
        ),
        openCreateEditor: vi
          .fn()
          .mockResolvedValueOnce(firstEditor)
          .mockResolvedValueOnce(secondEditor),
      }),
    )
    const { result, rerender } = renderHook(
      ({ workspace }) =>
        useAccountKeyResourceController({
          accounts: [createAccount("account-example")],
          selectedAccount: "account-example",
          routeParams: { accountId: "account-example", workspace },
        }),
      { initialProps: { workspace: "first" } },
    )

    await waitFor(() => expect(result.current.selectedScope).toEqual(scopes[0]))
    await act(async () => result.current.openCreate())

    rerender({ workspace: "second" })
    await waitFor(() => expect(result.current.selectedScope).toBeNull())
    act(() =>
      result.current.setEditorValues(result.current.editor!.editorId, {
        name: "Edited during load",
      }),
    )

    await act(async () =>
      secondCollection.resolve({
        list: vi.fn().mockResolvedValue({ items: [] }),
      }),
    )
    await waitFor(() => expect(result.current.editor?.mode).toBe("create"))
    expect(result.current.editor?.values).toEqual({
      name: "Edited during load",
    })
  })

  it("does not resurrect an editor closed while a workspace transition is loading", async () => {
    const secondCollection = deferred<any>()
    const scopes = [
      {
        scopeKey: "workspace-first-id",
        routeKey: "first",
        displayName: "First",
        isDefault: true,
      },
      {
        scopeKey: "workspace-second-id",
        routeKey: "second",
        displayName: "Second",
        isDefault: false,
      },
    ]
    const firstEditor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      submit: vi.fn(),
    }
    const secondEditor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      submit: vi.fn(),
    }
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue(scopes[0]),
        listScopes: vi.fn().mockResolvedValue(scopes),
        openCollection: vi.fn((scopeKey: string) =>
          scopeKey === "workspace-first-id"
            ? Promise.resolve({
                list: vi.fn().mockResolvedValue({ items: [] }),
              })
            : secondCollection.promise,
        ),
        openCreateEditor: vi
          .fn()
          .mockResolvedValueOnce(firstEditor)
          .mockResolvedValueOnce(secondEditor),
      }),
    )
    const { result, rerender } = renderHook(
      ({ workspace }) =>
        useAccountKeyResourceController({
          accounts: [createAccount("account-example")],
          selectedAccount: "account-example",
          routeParams: { accountId: "account-example", workspace },
        }),
      { initialProps: { workspace: "first" } },
    )

    await waitFor(() => expect(result.current.selectedScope).toEqual(scopes[0]))
    await act(async () => result.current.openCreate())

    rerender({ workspace: "second" })
    await waitFor(() => expect(result.current.selectedScope).toBeNull())
    act(() => {
      // Keep these in one React turn: the rehydration promise must observe the
      // close synchronously rather than restoring the stale rendered editor.
      result.current.closeEditor(result.current.editor!.editorId)
      secondCollection.resolve({
        list: vi.fn().mockResolvedValue({ items: [] }),
      })
    })
    await act(async () => {})
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.editor).toBeNull()
  })

  it("closes the preserved editor and surfaces a collection failure during workspace replacement", async () => {
    const replacementCollection = deferred<any>()
    const collectionFailure = new AccountKeyResourceError({
      code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
    })
    const scopes = [
      {
        scopeKey: "workspace-first-id",
        routeKey: "first",
        displayName: "First",
        isDefault: true,
      },
      {
        scopeKey: "workspace-second-id",
        routeKey: "second",
        displayName: "Second",
        isDefault: false,
      },
    ]
    const firstEditor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      submit: vi.fn(),
    }
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue(scopes[0]),
        listScopes: vi.fn().mockResolvedValue(scopes),
        openCollection: vi.fn((scopeKey: string) =>
          scopeKey === "workspace-first-id"
            ? Promise.resolve({
                list: vi.fn().mockResolvedValue({ items: [] }),
              })
            : replacementCollection.promise,
        ),
        openCreateEditor: vi.fn().mockResolvedValue(firstEditor),
      }),
    )
    const { result, rerender } = renderHook(
      ({ workspace }) =>
        useAccountKeyResourceController({
          accounts: [createAccount("account-example")],
          selectedAccount: "account-example",
          routeParams: { accountId: "account-example", workspace },
        }),
      { initialProps: { workspace: "first" } },
    )

    await waitFor(() => expect(result.current.selectedScope).toEqual(scopes[0]))
    await act(async () => result.current.openCreate())
    rerender({ workspace: "second" })
    await waitFor(() => expect(result.current.isLoading).toBe(true))

    await act(async () => replacementCollection.reject(collectionFailure))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.editor).toBeNull()
    expect(result.current.selectedScope).toBeNull()
    expect(result.current.failures["account-example"]?.code).toBe(
      ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
    )
    await act(async () =>
      result.current.submitEditor(result.current.editor?.editorId ?? -1, {}),
    )
    expect(firstEditor.submit).not.toHaveBeenCalled()
  })

  it("closes the preserved editor when replacement editor creation fails after collection preparation", async () => {
    const replacementEditor = deferred<any>()
    const editorFailure = new AccountKeyResourceError({
      code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
    })
    const scopes = [
      {
        scopeKey: "workspace-first-id",
        routeKey: "first",
        displayName: "First",
        isDefault: true,
      },
      {
        scopeKey: "workspace-second-id",
        routeKey: "second",
        displayName: "Second",
        isDefault: false,
      },
    ]
    const firstEditor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      submit: vi.fn(),
    }
    const openCreateEditor = vi
      .fn()
      .mockResolvedValueOnce(firstEditor)
      .mockImplementationOnce(() => replacementEditor.promise)
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue(scopes[0]),
        listScopes: vi.fn().mockResolvedValue(scopes),
        openCollection: vi.fn().mockResolvedValue({
          list: vi.fn().mockResolvedValue({ items: [] }),
        }),
        openCreateEditor,
      }),
    )
    const { result, rerender } = renderHook(
      ({ workspace }) =>
        useAccountKeyResourceController({
          accounts: [createAccount("account-example")],
          selectedAccount: "account-example",
          routeParams: { accountId: "account-example", workspace },
        }),
      { initialProps: { workspace: "first" } },
    )

    await waitFor(() => expect(result.current.selectedScope).toEqual(scopes[0]))
    await act(async () => result.current.openCreate())
    rerender({ workspace: "second" })
    await waitFor(() => expect(openCreateEditor).toHaveBeenCalledTimes(2))

    await act(async () => replacementEditor.reject(editorFailure))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.editor).toBeNull()
    expect(result.current.selectedScope).toBeNull()
    expect(result.current.failures["account-example"]?.code).toBe(
      ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
    )
    await act(async () =>
      result.current.submitEditor(result.current.editor?.editorId ?? -1, {}),
    )
    expect(firstEditor.submit).not.toHaveBeenCalled()
    expect(openCreateEditor).toHaveBeenCalledTimes(2)
  })

  it("rejects a submit command captured from an obsolete editor generation", async () => {
    const scopes = [
      {
        scopeKey: "workspace-first-id",
        routeKey: "first",
        displayName: "First",
        isDefault: true,
      },
      {
        scopeKey: "workspace-second-id",
        routeKey: "second",
        displayName: "Second",
        isDefault: false,
      },
    ]
    const firstEditor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => "workspace-second-id",
      submit: vi.fn().mockResolvedValue({}),
    }
    const secondEditor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      submit: vi.fn().mockResolvedValue({}),
    }
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue(scopes[0]),
        listScopes: vi.fn().mockResolvedValue(scopes),
        openCollection: vi.fn().mockResolvedValue({
          list: vi.fn().mockResolvedValue({ items: [] }),
        }),
        openCreateEditor: vi
          .fn()
          .mockResolvedValueOnce(firstEditor)
          .mockResolvedValueOnce(secondEditor),
      }),
    )
    const { result, rerender } = renderHook(
      ({ workspace }) =>
        useAccountKeyResourceController({
          accounts: [createAccount("account-example")],
          selectedAccount: "account-example",
          routeParams: { accountId: "account-example", workspace },
        }),
      { initialProps: { workspace: "first" } },
    )

    await waitFor(() => expect(result.current.selectedScope).toEqual(scopes[0]))
    await act(async () => result.current.openCreate())
    const firstEditorId = result.current.editor!.editorId
    const obsoleteSubmit = (values: object) => {
      return (result.current.submitEditor as any)(firstEditorId, values)
    }

    rerender({ workspace: "second" })
    await waitFor(() => expect(result.current.selectedScope).toEqual(scopes[1]))
    await waitFor(() => expect(result.current.editor?.mode).toBe("create"))
    await act(async () => obsoleteSubmit({}))

    expect(firstEditor.submit).not.toHaveBeenCalled()
    expect(secondEditor.submit).not.toHaveBeenCalled()
  })

  it("aborts obsolete editor option loads and ignores their late options", async () => {
    const firstOptions = deferred<any>()
    const secondOptions = deferred<any>()
    const loadOptions = vi
      .fn()
      .mockImplementationOnce(() => firstOptions.promise)
      .mockImplementationOnce(() => secondOptions.promise)
    const scope = {
      scopeKey: "workspace-default-id",
      routeKey: "team",
      displayName: "Team",
      isDefault: true,
    }
    const session = {
      resolveDefaultScope: vi.fn().mockResolvedValue(scope),
      listScopes: vi.fn().mockResolvedValue([scope]),
      openCollection: vi.fn().mockResolvedValue({
        list: vi.fn().mockResolvedValue({ items: [] }),
      }),
      openCreateEditor: vi.fn().mockResolvedValue({
        fields: [{ fieldId: "creator", type: "select", options: [] }],
        initialValues: {},
        validate: vi.fn().mockReturnValue({ valid: true }),
        loadOptions,
        submit: vi.fn(),
      }),
    }
    mockNativeResourceSession(vi.fn().mockResolvedValue(session))
    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: { accountId: "account-example", workspace: "team" },
      }),
    )

    await waitFor(() => expect(result.current.selectedScope).toEqual(scope))
    await act(async () => {
      await result.current.openCreate()
    })
    act(() => {
      void result.current.loadEditorOptions(
        result.current.editor!.editorId,
        "creator",
        {},
      )
    })
    await waitFor(() => expect(loadOptions).toHaveBeenCalledTimes(1))
    const firstSignal = (
      loadOptions.mock.calls[0]?.[2] as {
        signal?: AbortSignal
      }
    )?.signal
    act(() => {
      void result.current.loadEditorOptions(
        result.current.editor!.editorId,
        "creator",
        {},
      )
    })
    await waitFor(() => expect(loadOptions).toHaveBeenCalledTimes(2))
    expect(firstSignal?.aborted).toBe(true)

    await act(async () => {
      firstOptions.resolve([{ value: "late" }])
      secondOptions.resolve([{ value: "current" }])
    })

    await waitFor(() =>
      expect(result.current.editor?.optionsByField.creator).toEqual([
        { value: "current" },
      ]),
    )
  })

  it("does not apply late options from an editor replaced by a new session", async () => {
    const staleOptions = deferred<any>()
    const scope = {
      scopeKey: "workspace-default-id",
      routeKey: "team",
      displayName: "Team",
      isDefault: true,
    }
    const firstEditor = {
      fields: [{ fieldId: "creator", type: "select" as const, options: [] }],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      loadOptions: vi.fn(() => staleOptions.promise),
      submit: vi.fn(),
    }
    const secondEditor = {
      fields: [{ fieldId: "creator", type: "select" as const, options: [] }],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      loadOptions: vi.fn(),
      submit: vi.fn(),
    }
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue(scope),
        listScopes: vi.fn().mockResolvedValue([scope]),
        openCollection: vi.fn().mockResolvedValue({
          list: vi.fn().mockResolvedValue({ items: [] }),
        }),
        openCreateEditor: vi
          .fn()
          .mockResolvedValueOnce(firstEditor)
          .mockResolvedValueOnce(secondEditor),
      }),
    )
    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: { accountId: "account-example", workspace: "team" },
      }),
    )

    await waitFor(() => expect(result.current.selectedScope).toEqual(scope))
    await act(async () => result.current.openCreate())
    act(() => {
      void result.current.loadEditorOptions(
        result.current.editor!.editorId,
        "creator",
        {},
      )
    })
    await waitFor(() => expect(firstEditor.loadOptions).toHaveBeenCalledOnce())
    const staleSignal = (
      firstEditor.loadOptions.mock.calls[0] as unknown as
        | [unknown, unknown, { signal?: AbortSignal }]
        | undefined
    )?.[2]?.signal

    await act(async () => result.current.openCreate())
    expect(staleSignal?.aborted).toBe(true)
    await act(async () => staleOptions.resolve([{ value: "stale-member" }]))

    expect(result.current.editor?.fields).toEqual(secondEditor.fields)
    expect(result.current.editor?.optionsByField.creator).toBeUndefined()
  })

  it("clears stale dependent options and exposes only the current load failure", async () => {
    const field = OPENROUTER_KEY_FIELD_IDS
    const lateFirstFailure = deferred<never>()
    const retry = deferred<any>()
    const loadOptions = vi
      .fn()
      .mockResolvedValueOnce([{ value: "member-first" }])
      .mockImplementationOnce(() => lateFirstFailure.promise)
      .mockRejectedValueOnce(
        new AccountKeyResourceError({
          code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
          message: "unsafe upstream detail",
        }),
      )
      .mockImplementationOnce(() => retry.promise)
    const scopes = [
      {
        scopeKey: "workspace-first-id",
        routeKey: "first",
        displayName: "First",
        isDefault: true,
      },
      {
        scopeKey: "workspace-second-id",
        routeKey: "second",
        displayName: "Second",
        isDefault: false,
      },
    ]
    const editor = {
      fields: [
        {
          fieldId: field.Workspace,
          type: "select" as const,
          options: scopes.map((scope) => ({ value: scope.scopeKey })),
        },
        {
          fieldId: field.Creator,
          type: "select" as const,
          nullable: true,
          options: [],
          optionLoader: { dependsOn: [field.Workspace] },
        },
        { fieldId: field.Name, type: "text" as const },
      ],
      initialValues: {
        [field.Workspace]: "workspace-first-id",
        [field.Creator]: null,
        [field.Name]: "",
      },
      validate: vi.fn().mockReturnValue({ valid: true }),
      loadOptions,
      submit: vi.fn().mockResolvedValue({
        facts: createFacts("workspace-second-id", "key-second"),
      }),
    }
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue(scopes[0]),
        listScopes: vi.fn().mockResolvedValue(scopes),
        openCollection: vi.fn().mockResolvedValue({
          list: vi.fn().mockResolvedValue({ items: [] }),
        }),
        openCreateEditor: vi.fn().mockResolvedValue(editor),
      }),
    )
    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: { accountId: "account-example", workspace: "first" },
      }),
    )

    await waitFor(() => expect(result.current.selectedScope).toEqual(scopes[0]))
    await act(async () => result.current.openCreate())
    await act(async () =>
      result.current.loadEditorOptions(
        result.current.editor!.editorId,
        field.Creator,
      ),
    )
    act(() =>
      result.current.setEditorValues(result.current.editor!.editorId, {
        [field.Workspace]: "workspace-first-id",
        [field.Creator]: "member-first",
        [field.Name]: "kept name",
      }),
    )

    act(() => {
      void result.current.loadEditorOptions(
        result.current.editor!.editorId,
        field.Creator,
        {
          [field.Workspace]: "workspace-first-id",
          [field.Creator]: "member-first",
          [field.Name]: "kept name",
        },
      )
    })
    await waitFor(() => expect(loadOptions).toHaveBeenCalledTimes(2))
    act(() => {
      void result.current.loadEditorOptions(
        result.current.editor!.editorId,
        field.Creator,
        {
          [field.Workspace]: "workspace-second-id",
          [field.Creator]: "member-first",
          [field.Name]: "kept name",
        },
      )
    })
    await waitFor(() => expect(loadOptions).toHaveBeenCalledTimes(3))
    expect(loadOptions).toHaveBeenLastCalledWith(
      field.Creator,
      {
        [field.Workspace]: "workspace-second-id",
        [field.Creator]: null,
        [field.Name]: "kept name",
      },
      { signal: expect.any(AbortSignal) },
    )
    await waitFor(() =>
      expect(
        result.current.editor?.optionFailuresByField[field.Creator],
      ).toMatchObject({
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
        message: "unsafe upstream detail",
      }),
    )
    expect(result.current.editor?.optionsByField[field.Creator]).toEqual([])
    expect(result.current.editor?.values).toEqual({
      [field.Workspace]: "workspace-first-id",
      [field.Creator]: null,
      [field.Name]: "kept name",
    })

    act(() => {
      void result.current.loadEditorOptions(
        result.current.editor!.editorId,
        field.Creator,
        {
          ...result.current.editor!.values,
          [field.Workspace]: "workspace-second-id",
        },
      )
    })
    await waitFor(() => expect(loadOptions).toHaveBeenCalledTimes(4))
    expect(
      result.current.editor?.optionFailuresByField[field.Creator],
    ).toBeUndefined()
    retry.resolve([{ value: "member-second" }])
    await waitFor(() =>
      expect(result.current.editor?.optionsByField[field.Creator]).toEqual([
        { value: "member-second" },
      ]),
    )

    await act(async () => lateFirstFailure.reject(new Error("late first")))
    expect(
      result.current.editor?.optionFailuresByField[field.Creator],
    ).toBeUndefined()
    expect(result.current.editor?.optionsByField[field.Creator]).toEqual([
      { value: "member-second" },
    ])
    await act(async () =>
      result.current.submitEditor(
        result.current.editor!.editorId,
        result.current.editor!.values,
      ),
    )
    expect(editor.submit.mock.calls[0]?.[0]).not.toMatchObject({
      [field.Creator]: "member-first",
    })
  })

  it("aborts editor option loads when the editor closes", async () => {
    const options = deferred<any>()
    const loadOptions = vi.fn(
      (
        _fieldId: string,
        _values: unknown,
        _options: { signal?: AbortSignal },
      ) => options.promise,
    )
    const scope = {
      scopeKey: "workspace-default-id",
      routeKey: "team",
      displayName: "Team",
      isDefault: true,
    }
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue(scope),
        listScopes: vi.fn().mockResolvedValue([scope]),
        openCollection: vi.fn().mockResolvedValue({
          list: vi.fn().mockResolvedValue({ items: [] }),
        }),
        openCreateEditor: vi.fn().mockResolvedValue({
          fields: [{ fieldId: "creator", type: "select", options: [] }],
          initialValues: {},
          validate: vi.fn().mockReturnValue({ valid: true }),
          loadOptions,
          submit: vi.fn(),
        }),
      }),
    )
    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: { accountId: "account-example", workspace: "team" },
      }),
    )

    await waitFor(() => expect(result.current.selectedScope).toEqual(scope))
    await act(async () => {
      await result.current.openCreate()
    })
    act(() => {
      void result.current.loadEditorOptions(
        result.current.editor!.editorId,
        "creator",
        {},
      )
    })
    await waitFor(() => expect(loadOptions).toHaveBeenCalledTimes(1))
    const signal = (
      (
        loadOptions.mock.calls[0] as unknown as
          | [unknown, unknown, { signal?: AbortSignal }]
          | undefined
      )?.[2] as { signal?: AbortSignal } | undefined
    )?.signal

    act(() => result.current.closeEditor(result.current.editor!.editorId))

    expect(signal?.aborted).toBe(true)
  })

  it("loads only default scopes with bounded all-account concurrency", async () => {
    const openedScopes: string[] = []
    let active = 0
    let maximumActive = 0
    const accounts = Array.from({ length: 6 }, (_, index) =>
      createAccount(`account-${index + 1}`),
    )
    const openNativeResources = vi.fn((input: any) =>
      Promise.resolve({
        resolveDefaultScope: vi.fn().mockResolvedValue({
          scopeKey: `scope-${input.account.id}`,
          routeKey: "default",
          displayName: "Default",
          isDefault: true,
        }),
        listScopes: vi.fn(),
        openCollection: vi.fn((scopeKey: string) => {
          openedScopes.push(scopeKey)
          return Promise.resolve({
            list: vi.fn(async () => {
              active += 1
              maximumActive = Math.max(maximumActive, active)
              await Promise.resolve()
              active -= 1
              return { items: [] }
            }),
          })
        }),
        openCreateEditor: vi.fn(),
      }),
    )
    mockNativeResourceSession(openNativeResources)

    renderHook(() =>
      useAccountKeyResourceController({
        accounts,
        selectedAccount: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
      }),
    )

    await waitFor(() => expect(openedScopes).toHaveLength(accounts.length))
    expect(openedScopes).toEqual(
      accounts.map((account) => `scope-${account.id}`),
    )
    expect(maximumActive).toBeLessThanOrEqual(4)
  })

  it("isolates all-account failures and reports completion progress", async () => {
    const finalList = deferred<any>()
    const accounts = [
      {
        ...createAccount("account-pending"),
        baseUrl: "https://three.example.invalid",
      },
      {
        ...createAccount("account-one"),
        baseUrl: "https://one.example.invalid",
      },
      {
        ...createAccount("account-failed"),
        baseUrl: "https://two.example.invalid",
      },
    ]
    mockNativeResourceSession(
      vi.fn((input: { account: { id: string } }) => {
        if (input.account.id === "account-failed") {
          return Promise.resolve({
            resolveDefaultScope: vi.fn().mockRejectedValue(new Error("failed")),
          })
        }
        return Promise.resolve({
          resolveDefaultScope: vi.fn().mockResolvedValue({
            scopeKey: `scope-${input.account.id}`,
            routeKey: "default",
            displayName: "Default",
            isDefault: true,
          }),
          openCollection: vi.fn().mockResolvedValue({
            list:
              input.account.id === "account-pending"
                ? vi.fn(() => finalList.promise)
                : vi.fn().mockResolvedValue({
                    items: [
                      {
                        ...createFacts("scope-account-one", "key-one"),
                        ref: {
                          ...createFacts("scope-account-one", "key-one").ref,
                          accountId: "account-one",
                        },
                      },
                    ],
                  }),
          }),
        })
      }),
    )
    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts,
        selectedAccount: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
      }),
    )

    await waitFor(() =>
      expect(result.current.progress).toEqual({
        total: 3,
        loaded: 1,
        loading: 1,
        error: 1,
      }),
    )
    expect(result.current.failures).toHaveProperty("account-failed")
    expect(result.current.rows.map((row) => row.ref.accountId)).toEqual([
      "account-one",
    ])
    expect(result.current.settledAccountIds).toEqual([
      "account-one",
      "account-failed",
    ])
    finalList.resolve({
      items: [
        {
          ...createFacts("scope-account-pending", "key-pending"),
          ref: {
            ...createFacts("scope-account-pending", "key-pending").ref,
            accountId: "account-pending",
          },
        },
      ],
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.failures).toHaveProperty("account-failed")
    expect(result.current.rows.map((row) => row.ref.accountId)).toEqual([
      "account-pending",
      "account-one",
    ])
    expect(result.current.progress).toEqual({
      total: 3,
      loaded: 2,
      loading: 0,
      error: 1,
    })
    expect(result.current.settledAccountIds).toEqual([
      "account-pending",
      "account-one",
      "account-failed",
    ])
  })

  it("merges only native default scopes in all-account mode", async () => {
    const nativeRow = {
      ...createFacts("scope-native", "key-native"),
      ref: {
        ...createFacts("scope-native", "key-native").ref,
        accountId: "account-native",
      },
    }
    const openedAccountIds: string[] = []
    const openNativeResources = vi.fn((input: { account: { id: string } }) => {
      openedAccountIds.push(input.account.id)
      if (input.account.id === "account-failed") {
        return Promise.resolve({
          resolveDefaultScope: vi.fn().mockRejectedValue(new Error("failed")),
        })
      }
      return Promise.resolve({
        resolveDefaultScope: vi.fn().mockResolvedValue({
          scopeKey: "scope-native",
          routeKey: "default",
          displayName: "Default",
          isDefault: true,
        }),
        listScopes: vi.fn(),
        openCollection: vi.fn().mockResolvedValue({
          list: vi.fn().mockResolvedValue({ items: [nativeRow] }),
        }),
        openCreateEditor: vi.fn(),
      })
    })
    const accounts = [
      {
        ...createAccount("account-native"),
        baseUrl: "https://native.example.invalid",
      },
      {
        ...createAccount("account-legacy"),
        siteType: "new-api" as const,
        baseUrl: "https://legacy.example.invalid",
      },
      {
        ...createAccount("account-failed"),
        baseUrl: "https://failed.example.invalid",
      },
    ]
    createDisplayAccountApiContextMock.mockImplementation((account: any) => ({
      ...(account.siteType === "openrouter"
        ? { accountKeyResources: { open: openNativeResources } }
        : {}),
      request: {},
    }))
    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts,
        selectedAccount: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
      }),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(openedAccountIds).toEqual(["account-native", "account-failed"])
    expect(result.current.mode).toBe("all")
    expect(result.current.scopes).toEqual([])
    expect(result.current.selectedScope).toBeNull()
    expect(result.current.rows).toEqual([nativeRow])
    expect(result.current.failures).toHaveProperty("account-failed")
    expect(result.current.failures).not.toHaveProperty("account-legacy")
    expect(result.current.progress).toEqual({
      total: 2,
      loaded: 1,
      loading: 0,
      error: 1,
    })
  })

  it("edits a native key from all-account mode without changing the selected account", async () => {
    const facts = {
      ...createFacts("scope-native", "key-native"),
      ref: {
        ...createFacts("scope-native", "key-native").ref,
        accountId: "account-native",
      },
    }
    const editor = {
      fields: [],
      initialValues: { name: "Example key" },
      validate: vi.fn().mockReturnValue({ valid: true }),
      submit: vi.fn().mockResolvedValue({ facts }),
    }
    const collection = {
      list: vi.fn().mockResolvedValue({ items: [facts] }),
      openEditEditor: vi.fn().mockResolvedValue(editor),
      delete: vi.fn(),
    }
    const openCollection = vi.fn().mockResolvedValue(collection)
    const openNativeResources = vi.fn().mockResolvedValue({
      resolveDefaultScope: vi.fn().mockResolvedValue({
        scopeKey: "scope-native",
        routeKey: "default",
        displayName: "Default",
        isDefault: true,
      }),
      openCollection,
    })
    mockNativeResourceSession(openNativeResources)
    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-native")],
        selectedAccount: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
      }),
    )

    await waitFor(() => expect(result.current.rows).toEqual([facts]))
    const unacceptedRef = { ...facts.ref, resourceId: "unaccepted-key" }
    await act(async () => result.current.openEdit(unacceptedRef))
    expect(result.current.editor).toBeNull()
    expect(result.current.openDelete(unacceptedRef)).toBe(false)
    expect(openNativeResources).toHaveBeenCalledTimes(1)

    await act(async () => result.current.openEdit(facts.ref))
    expect(result.current.editor?.mode).toBe("edit")

    await act(async () => {
      await result.current.submitEditor(result.current.editor!.editorId, {
        name: "Renamed key",
      })
    })

    expect(editor.submit).toHaveBeenCalledTimes(1)
    expect(openCollection).toHaveBeenCalledWith(
      "scope-native",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(collection.list).toHaveBeenCalledTimes(2)
    expect(result.current.mode).toBe("all")
    expect(trackCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      expect.objectContaining({
        insights: expect.objectContaining({
          mode: PRODUCT_ANALYTICS_MODE_IDS.All,
          selectedCount: 1,
        }),
      }),
    )
  })

  it("deletes a native key from all-account mode without changing the selected account", async () => {
    const facts = {
      ...createFacts("scope-native", "key-native"),
      ref: {
        ...createFacts("scope-native", "key-native").ref,
        accountId: "account-native",
      },
    }
    const collection = {
      list: vi.fn().mockResolvedValue({ items: [facts] }),
      openEditEditor: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    }
    const openCollection = vi.fn().mockResolvedValue(collection)
    const openNativeResources = vi.fn().mockResolvedValue({
      resolveDefaultScope: vi.fn().mockResolvedValue({
        scopeKey: "scope-native",
        routeKey: "default",
        displayName: "Default",
        isDefault: true,
      }),
      openCollection,
    })
    mockNativeResourceSession(openNativeResources)
    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-native")],
        selectedAccount: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
      }),
    )

    await waitFor(() => expect(result.current.rows).toEqual([facts]))
    let opened = false
    act(() => {
      opened = result.current.openDelete(facts.ref)
    })
    expect(opened).toBe(true)
    await waitFor(() => expect(result.current.deleteState.isOpen).toBe(true))
    await act(async () => result.current.confirmDelete())

    expect(collection.delete).toHaveBeenCalledWith(
      facts.ref,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(collection.list).toHaveBeenCalledTimes(2)
    expect(result.current.mode).toBe("all")
    expect(trackCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      expect.objectContaining({
        insights: expect.objectContaining({
          mode: PRODUCT_ANALYTICS_MODE_IDS.All,
          selectedCount: 1,
        }),
      }),
    )
  })

  it("drains cursors and applies controlled search and status filters", async () => {
    const first = createFacts("workspace-default-id", "key-first")
    const second = {
      ...createFacts("workspace-default-id", "key-second"),
      status: "disabled" as const,
    }
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [first], nextCursor: "next" })
      .mockResolvedValueOnce({ items: [second] })
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue({
          scopeKey: "workspace-default-id",
          routeKey: "team",
          displayName: "Team",
          isDefault: true,
        }),
        listScopes: vi.fn().mockResolvedValue([
          {
            scopeKey: "workspace-default-id",
            routeKey: "team",
            displayName: "Team",
            isDefault: true,
          },
        ]),
        openCollection: vi.fn().mockResolvedValue({
          list,
          get: vi.fn().mockResolvedValue(first),
          openEditEditor: vi.fn(),
          delete: vi.fn(),
        }),
        openCreateEditor: vi.fn(),
      }),
    )
    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: { accountId: "account-example", workspace: "team" },
      }),
    )

    await waitFor(() => expect(result.current.rows).toHaveLength(2))
    expect(list.mock.calls.map((call) => call[0])).toEqual([
      {},
      { cursor: "next" },
    ])
    act(() => result.current.setStatusFilter("disabled"))
    expect(result.current.rows.map((row) => row.ref.resourceId)).toEqual([
      "key-second",
    ])
    act(() => result.current.setSearch("does-not-match"))
    await waitFor(() => expect(list).toHaveBeenCalledTimes(3))
    expect(list.mock.calls[2]?.[0]).toEqual({ search: "does-not-match" })
    expect(result.current.rows).toEqual([])
  })

  it("resets a hidden single-account status filter when switching to all accounts", async () => {
    const enabled = createFacts("workspace-default-id", "key-enabled")
    const disabled = {
      ...createFacts("workspace-default-id", "key-disabled"),
      status: "disabled" as const,
    }
    const collection = {
      list: vi.fn().mockResolvedValue({ items: [enabled, disabled] }),
      get: vi.fn(),
      openEditEditor: vi.fn(),
      delete: vi.fn(),
    }
    const session = {
      resolveDefaultScope: vi.fn().mockResolvedValue({
        scopeKey: "workspace-default-id",
        routeKey: "team",
        displayName: "Team",
        isDefault: true,
      }),
      listScopes: vi.fn().mockResolvedValue([]),
      openCollection: vi.fn().mockResolvedValue(collection),
      openCreateEditor: vi.fn(),
    }
    mockNativeResourceSession(vi.fn().mockResolvedValue(session))
    const account = createAccount("account-example")
    const { result, rerender } = renderHook(
      ({ selectedAccount }) =>
        useAccountKeyResourceController({
          accounts: [account],
          selectedAccount,
          routeParams: {
            accountId: selectedAccount,
            ...(selectedAccount === account.id ? { workspace: "team" } : {}),
          },
        }),
      { initialProps: { selectedAccount: account.id } },
    )

    await waitFor(() => expect(result.current.rows).toHaveLength(2))
    act(() => result.current.setStatusFilter("disabled"))
    expect(result.current.rows).toEqual([disabled])

    rerender({ selectedAccount: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.statusFilter).toBe("all")
    expect(result.current.rows).toEqual([enabled, disabled])
  })

  it.each([
    [
      "mismatched ID",
      { id: "other" },
      2,
      "account-example",
      "openrouter",
      "account-example",
      "second",
    ],
    [
      "mismatched account",
      { id: "transition" },
      2,
      "account-other",
      "openrouter",
      "account-other",
      "second",
    ],
    [
      "mismatched site",
      { id: "transition" },
      2,
      "account-example",
      "new-api",
      "account-example",
      "second",
    ],
    [
      "mismatched scope route",
      { id: "transition" },
      2,
      "account-example",
      "openrouter",
      "account-example",
      "first",
    ],
    [
      "mismatched generation",
      { id: "transition" },
      3,
      "account-example",
      "openrouter",
      "account-example",
      "second",
    ],
    [
      "replayed transition",
      undefined,
      2,
      "account-example",
      "openrouter",
      "account-example",
      "second",
    ],
  ])(
    "does not preserve a secret for a %s route acknowledgement",
    (
      _caseName,
      transition,
      generation,
      selectedAccount,
      siteType,
      routeAccountId,
      routeKey,
    ) => {
      expect(
        isAccountKeyResourceRouteTransitionAcknowledged({
          expected: {
            id: "transition",
            generation: 2,
            selectedAccount: "account-example",
            accountId: "account-example",
            siteType: "openrouter",
            scopeKey: "workspace-second-id",
            routeKey: "second",
          },
          generation,
          mode: "single",
          transitionId: transition?.id,
          selectedAccount,
          selectedRouteSiteType: siteType,
          routeAccountId,
          routeWorkspace: routeKey,
        }),
      ).toBe(false)
    },
  )

  it("accepts exactly the owned acknowledgement tuple", () => {
    expect(
      isAccountKeyResourceRouteTransitionAcknowledged({
        expected: {
          id: "transition",
          generation: 2,
          selectedAccount: "account-example",
          accountId: "account-example",
          siteType: "openrouter",
          scopeKey: "workspace-second-id",
          routeKey: "second",
        },
        generation: 2,
        mode: "single",
        transitionId: "transition",
        selectedAccount: "account-example",
        selectedRouteSiteType: "openrouter",
        routeAccountId: "account-example",
        routeWorkspace: "second",
      }),
    ).toBe(true)
  })

  it("rejects duplicate resource refs across collection cursors", async () => {
    const duplicate = createFacts("workspace-default-id", "key-example")
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue({
          scopeKey: "workspace-default-id",
          routeKey: "team",
          displayName: "Team",
          isDefault: true,
        }),
        listScopes: vi.fn().mockResolvedValue([]),
        openCollection: vi.fn().mockResolvedValue({
          list: vi
            .fn()
            .mockResolvedValueOnce({ items: [duplicate], nextCursor: "next" })
            .mockResolvedValueOnce({ items: [duplicate] }),
        }),
        openCreateEditor: vi.fn(),
      }),
    )
    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: { accountId: "account-example", workspace: "team" },
      }),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.allRows).toEqual([])
    expect(result.current.failures).toHaveProperty("account-example")
  })

  it("rejects a repeated cursor token even when each page has unique refs", async () => {
    const first = createFacts("workspace-default-id", "key-first")
    const second = createFacts("workspace-default-id", "key-second")
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue({
          scopeKey: "workspace-default-id",
          routeKey: "team",
          displayName: "Team",
          isDefault: true,
        }),
        listScopes: vi.fn().mockResolvedValue([]),
        openCollection: vi.fn().mockResolvedValue({
          list: vi
            .fn()
            .mockResolvedValueOnce({ items: [first], nextCursor: "next" })
            .mockResolvedValueOnce({ items: [second], nextCursor: "next" }),
        }),
        openCreateEditor: vi.fn(),
      }),
    )
    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: { accountId: "account-example", workspace: "team" },
      }),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.allRows).toEqual([])
    expect(result.current.failures).toHaveProperty("account-example")
  })

  it("refreshes the returned destination and keeps a created secret tied to it", async () => {
    const scopes = [
      {
        scopeKey: "workspace-first-id",
        routeKey: "first",
        displayName: "First",
        isDefault: true,
      },
      {
        scopeKey: "workspace-second-id",
        routeKey: "second",
        displayName: "Second",
        isDefault: false,
      },
    ]
    const createdFacts = createFacts("workspace-second-id", "key-created")
    const createdSecret = {
      correlation: {
        kind: "account-key-resource" as const,
        ref: createdFacts.ref,
      },
      displayName: "Created key",
      secret: "secret-created",
      secretAvailability: "create-response-only" as const,
      credential: {},
    }
    const resolveDestinationScopeKey = vi.fn(() => "workspace-second-id")
    const editor = {
      fields: [
        {
          fieldId: "destination",
          type: "select" as const,
          options: scopes.map((scope) => ({ value: scope.scopeKey })),
        },
      ],
      initialValues: { destination: "workspace-first-id" },
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey,
      submit: vi.fn().mockResolvedValue({
        facts: createdFacts,
        createdSecret,
      }),
    }
    const firstCollection = {
      list: vi.fn().mockResolvedValue({ items: [] }),
    }
    const secondCollection = {
      list: vi.fn().mockResolvedValue({ items: [createdFacts] }),
    }
    const openCollection = vi.fn((scopeKey: string) =>
      Promise.resolve(
        scopeKey === "workspace-first-id" ? firstCollection : secondCollection,
      ),
    )
    const replaceRoute = vi.fn()
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue(scopes[0]),
        listScopes: vi.fn().mockResolvedValue(scopes),
        openCollection,
        openCreateEditor: vi.fn().mockResolvedValue(editor),
      }),
    )
    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: { accountId: "account-example", workspace: "first" },
        replaceRoute,
      }),
    )

    await waitFor(() => expect(result.current.selectedScope).toEqual(scopes[0]))
    await act(async () => result.current.openCreate())
    await act(async () =>
      result.current.submitEditor(result.current.editor!.editorId, {
        destination: "workspace-second-id",
      }),
    )

    expect(resolveDestinationScopeKey).toHaveBeenCalledWith({
      destination: "workspace-second-id",
    })
    expect(openCollection.mock.calls.map(([scopeKey]) => scopeKey)).toEqual([
      "workspace-first-id",
      "workspace-second-id",
    ])
    expect(firstCollection.list).toHaveBeenCalledTimes(1)
    expect(secondCollection.list).toHaveBeenCalledTimes(1)
    expect(result.current.selectedScope).toEqual(scopes[1])
    expect(result.current.rows).toEqual([createdFacts])
    expect(result.current.createdSecret).toBe(createdSecret)
    expect(result.current.editor).toBeNull()
    expect(result.current.createdSecret?.correlation).toEqual({
      kind: "account-key-resource",
      ref: createdFacts.ref,
    })
    expect(replaceRoute).toHaveBeenCalledWith(
      {
        accountId: "account-example",
        workspace: "second",
      },
      { id: expect.stringMatching(/^account-key-resource-transition-\d+-1$/) },
    )
  })

  it("keeps a created secret through its owned route transition without reviving the terminal editor", async () => {
    const scopes = [
      {
        scopeKey: "workspace-first-id",
        routeKey: "first",
        displayName: "First",
        isDefault: true,
      },
      {
        scopeKey: "workspace-second-id",
        routeKey: "second",
        displayName: "Second",
        isDefault: false,
      },
    ]
    const createdFacts = createFacts("workspace-second-id", "key-created")
    const createdSecret = {
      correlation: {
        kind: "account-key-resource" as const,
        ref: createdFacts.ref,
      },
      displayName: "Created key",
      secret: "secret-created",
      secretAvailability: "create-response-only" as const,
      credential: {},
    }
    const editor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => "workspace-second-id",
      submit: vi.fn().mockResolvedValue({ facts: createdFacts, createdSecret }),
    }
    const openCreateEditor = vi.fn().mockResolvedValue(editor)
    const openCollection = vi.fn().mockResolvedValue({
      list: vi.fn().mockResolvedValue({ items: [createdFacts] }),
    })
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue(scopes[0]),
        listScopes: vi.fn().mockResolvedValue(scopes),
        openCollection,
        openCreateEditor,
      }),
    )
    const { result } = renderHook(() => {
      const [routeParams, setRouteParams] = useState({
        accountId: "account-example",
        workspace: "first",
      })
      const [routeTransition, setRouteTransition] = useState<
        { id: string } | undefined
      >()
      const controller = useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams,
        routeTransition,
        replaceRoute: (nextRoute, transition) => {
          queueMicrotask(() =>
            setRouteParams({
              accountId: nextRoute.accountId,
              workspace: nextRoute.workspace,
            }),
          )
          queueMicrotask(() => setRouteTransition(transition))
        },
      })
      return { controller, routeParams, routeTransition, setRouteParams }
    })

    await waitFor(() =>
      expect(result.current.controller.selectedScope).toEqual(scopes[0]),
    )
    await act(async () => result.current.controller.openCreate())
    await act(async () =>
      result.current.controller.submitEditor(
        result.current.controller.editor!.editorId,
        {},
      ),
    )

    await waitFor(() =>
      expect(result.current.routeParams.workspace).toBe("second"),
    )
    await waitFor(() => expect(result.current.routeTransition?.id).toBeTruthy())
    await waitFor(() => expect(result.current.controller.isLoading).toBe(false))
    expect(result.current.controller.createdSecret).toBe(createdSecret)
    expect(result.current.controller.editor).toBeNull()
    expect(openCreateEditor).toHaveBeenCalledTimes(1)

    act(() =>
      result.current.setRouteParams({
        accountId: "account-example",
        workspace: "first",
      }),
    )
    await waitFor(() => expect(result.current.controller.isLoading).toBe(false))
    expect(result.current.controller.createdSecret).toBeNull()

    act(() =>
      result.current.setRouteParams({
        accountId: "account-example",
        workspace: "second",
      }),
    )
    await waitFor(() => expect(result.current.controller.isLoading).toBe(false))
    expect(result.current.controller.createdSecret).toBeNull()
    expect(openCreateEditor).toHaveBeenCalledTimes(1)
  })

  it("uses collision-free transition IDs when controllers remount", async () => {
    const scopes = [
      {
        scopeKey: "workspace-first-id",
        routeKey: "first",
        displayName: "First",
        isDefault: true,
      },
      {
        scopeKey: "workspace-second-id",
        routeKey: "second",
        displayName: "Second",
        isDefault: false,
      },
    ]
    const facts = createFacts("workspace-second-id", "key-created")
    const editor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => "workspace-second-id",
      submit: vi.fn().mockResolvedValue({
        facts,
        createdSecret: {
          correlation: {
            kind: "account-key-resource" as const,
            ref: facts.ref,
          },
          displayName: "Created key",
          secret: "secret-created",
          secretAvailability: "create-response-only" as const,
          credential: {},
        },
      }),
    }
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue(scopes[0]),
        listScopes: vi.fn().mockResolvedValue(scopes),
        openCollection: vi.fn().mockResolvedValue({
          list: vi.fn().mockResolvedValue({ items: [facts] }),
        }),
        openCreateEditor: vi.fn().mockResolvedValue(editor),
      }),
    )
    const firstReplaceRoute = vi.fn()
    const first = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: { accountId: "account-example", workspace: "first" },
        replaceRoute: firstReplaceRoute,
      }),
    )
    await waitFor(() =>
      expect(first.result.current.selectedScope).toEqual(scopes[0]),
    )
    await act(async () => first.result.current.openCreate())
    await act(async () =>
      first.result.current.submitEditor(
        first.result.current.editor!.editorId,
        {},
      ),
    )

    first.unmount()
    const secondReplaceRoute = vi.fn()
    const second = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: { accountId: "account-example", workspace: "first" },
        replaceRoute: secondReplaceRoute,
      }),
    )
    await waitFor(() =>
      expect(second.result.current.selectedScope).toEqual(scopes[0]),
    )
    await act(async () => second.result.current.openCreate())
    await act(async () =>
      second.result.current.submitEditor(
        second.result.current.editor!.editorId,
        {},
      ),
    )

    const firstTransition = firstReplaceRoute.mock.calls[0]?.[1] as {
      id: string
    }
    const secondTransition = secondReplaceRoute.mock.calls[0]?.[1] as {
      id: string
    }
    expect(firstTransition.id).toMatch(
      /^account-key-resource-transition-\d+-1$/,
    )
    expect(secondTransition.id).toMatch(
      /^account-key-resource-transition-\d+-1$/,
    )
    expect(secondTransition.id).not.toBe(firstTransition.id)
  })

  it("clears a created secret when a same-value route update has no owned acknowledgement", async () => {
    const scopes = [
      {
        scopeKey: "workspace-first-id",
        routeKey: "first",
        displayName: "First",
        isDefault: true,
      },
      {
        scopeKey: "workspace-second-id",
        routeKey: "second",
        displayName: "Second",
        isDefault: false,
      },
    ]
    const facts = createFacts("workspace-second-id", "key-created")
    const createdSecret = {
      correlation: { kind: "account-key-resource" as const, ref: facts.ref },
      displayName: "Created key",
      secret: "secret-created",
      secretAvailability: "create-response-only" as const,
      credential: {},
    }
    const editor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => "workspace-second-id",
      submit: vi.fn().mockResolvedValue({ facts, createdSecret }),
    }
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue(scopes[0]),
        listScopes: vi.fn().mockResolvedValue(scopes),
        openCollection: vi.fn().mockResolvedValue({
          list: vi.fn().mockResolvedValue({ items: [facts] }),
        }),
        openCreateEditor: vi.fn().mockResolvedValue(editor),
      }),
    )
    const { result } = renderHook(() => {
      const [routeParams, setRouteParams] = useState({
        accountId: "account-example",
        workspace: "first",
      })
      const controller = useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams,
        replaceRoute: (nextRoute) =>
          queueMicrotask(() =>
            setRouteParams({
              accountId: nextRoute.accountId,
              workspace: nextRoute.workspace,
            }),
          ),
      })
      return { controller, routeParams }
    })

    await waitFor(() =>
      expect(result.current.controller.selectedScope).toEqual(scopes[0]),
    )
    await act(async () => result.current.controller.openCreate())
    await act(async () =>
      result.current.controller.submitEditor(
        result.current.controller.editor!.editorId,
        {},
      ),
    )

    await waitFor(() =>
      expect(result.current.routeParams.workspace).toBe("second"),
    )
    await waitFor(() => expect(result.current.controller.isLoading).toBe(false))
    expect(result.current.controller.createdSecret).toBeNull()
  })

  it("keeps a settled one-time secret when the follow-up refresh rejects", async () => {
    const scope = {
      scopeKey: "workspace-default-id",
      routeKey: "team",
      displayName: "Team",
      isDefault: true,
    }
    const facts = createFacts(scope.scopeKey, "key-created")
    const createdSecret = {
      correlation: { kind: "account-key-resource" as const, ref: facts.ref },
      displayName: "Created key",
      secret: "one-time-secret-example",
      secretAvailability: "create-response-only" as const,
      credential: {},
    }
    const refreshFailure = new AccountKeyResourceError({
      code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
    })
    const editor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => scope.scopeKey,
      submit: vi.fn().mockResolvedValue({ facts, createdSecret }),
    }
    const resolveDefaultScope = vi
      .fn()
      .mockResolvedValueOnce(scope)
      .mockRejectedValueOnce(refreshFailure)
    const session = {
      resolveDefaultScope,
      listScopes: vi.fn().mockResolvedValue([scope]),
      openCollection: vi.fn().mockResolvedValue({
        list: vi.fn().mockResolvedValue({ items: [] }),
      }),
      openCreateEditor: vi.fn().mockResolvedValue(editor),
    }
    mockNativeResourceSession(vi.fn().mockResolvedValue(session))
    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: { accountId: "account-example", workspace: "team" },
      }),
    )

    await waitFor(() => expect(result.current.selectedScope).toEqual(scope))
    await act(async () => result.current.openCreate())
    const focusWorkflowId = result.current.focusWorkflowId
    expect(focusWorkflowId).toMatch(/^account-key-resource-editor-/)
    await act(async () =>
      result.current.submitEditor(result.current.editor!.editorId, {}),
    )

    expect(editor.submit).toHaveBeenCalledTimes(1)
    expect(result.current.createdSecret).toBe(createdSecret)
    expect(result.current.createdSecret?.secret).toBe("one-time-secret-example")
    expect(result.current.failures["account-example"]?.code).toBe(
      ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
    )
    expect(result.current.focusWorkflowId).toBe(focusWorkflowId)
    act(() => result.current.closeCreatedSecret())
    expect(result.current.focusWorkflowId).toBeNull()
  })

  it("clears a terminal edit workflow after the editor settles without a secret successor", async () => {
    const scope = {
      scopeKey: "workspace-default-id",
      routeKey: "team",
      displayName: "Team",
      isDefault: true,
    }
    const facts = createFacts(scope.scopeKey, "key-existing")
    const editor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      submit: vi.fn().mockResolvedValue({ facts }),
    }
    const collection = {
      list: vi.fn().mockResolvedValue({ items: [facts] }),
      openEditEditor: vi.fn().mockResolvedValue(editor),
    }
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue(scope),
        listScopes: vi.fn().mockResolvedValue([scope]),
        openCollection: vi.fn().mockResolvedValue(collection),
        openCreateEditor: vi.fn(),
      }),
    )
    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: { accountId: "account-example", workspace: "team" },
      }),
    )

    await waitFor(() => expect(result.current.rows).toEqual([facts]))
    await act(async () => result.current.openEdit(facts.ref))
    const editorId = result.current.editor!.editorId
    await act(async () => result.current.submitEditor(editorId, {}))

    expect(result.current.editor).toBeNull()
    expect(result.current.createdSecret).toBeNull()
    expect(result.current.focusWorkflowId).toBeNull()
  })

  it("retains a view-owned terminal close shell until the dialog acknowledges it", async () => {
    const scope = {
      scopeKey: "workspace-default-id",
      routeKey: "team",
      displayName: "Team",
      isDefault: true,
    }
    const facts = createFacts(scope.scopeKey, "key-existing")
    const editor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      submit: vi.fn().mockResolvedValue({ facts }),
    }
    const collection = {
      list: vi.fn().mockResolvedValue({ items: [facts] }),
      openEditEditor: vi.fn().mockResolvedValue(editor),
    }
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue(scope),
        listScopes: vi.fn().mockResolvedValue([scope]),
        openCollection: vi.fn().mockResolvedValue(collection),
        openCreateEditor: vi.fn(),
      }),
    )
    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: { accountId: "account-example", workspace: "team" },
      }),
    )

    await waitFor(() => expect(result.current.rows).toEqual([facts]))
    await act(async () => result.current.openEdit(facts.ref))
    await act(async () =>
      result.current.submitEditor(result.current.editor!.editorId, {}),
    )

    expect(result.current.editor).toBeNull()
    expect(result.current.terminalCloseEditor).toMatchObject({
      terminalClose: true,
    })
    act(() =>
      result.current.settleTerminalClose(
        result.current.terminalCloseEditor!.editorId,
      ),
    )
    expect(result.current.terminalCloseEditor).toBeNull()
  })

  it("blocks background resource commands while a one-time secret remains unresolved", async () => {
    const scopes = [
      {
        scopeKey: "workspace-first-id",
        routeKey: "first",
        displayName: "First",
        isDefault: true,
      },
      {
        scopeKey: "workspace-second-id",
        routeKey: "second",
        displayName: "Second",
        isDefault: false,
      },
    ]
    const facts = createFacts(scopes[0].scopeKey, "key-created")
    const createdSecret = {
      correlation: { kind: "account-key-resource" as const, ref: facts.ref },
      displayName: "Created key",
      secret: "secret-created",
      secretAvailability: "create-response-only" as const,
      credential: {},
    }
    const createdEditor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => scopes[0].scopeKey,
      submit: vi.fn().mockResolvedValue({ facts, createdSecret }),
    }
    const collection = {
      list: vi.fn().mockResolvedValue({ items: [facts] }),
      get: vi.fn(),
      openEditEditor: vi.fn(),
      delete: vi.fn(),
    }
    const session = {
      resolveDefaultScope: vi.fn().mockResolvedValue(scopes[0]),
      listScopes: vi.fn().mockResolvedValue(scopes),
      listScopeInventory: vi.fn().mockResolvedValue({
        scopes,
        partialFailure: {
          code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
        },
      }),
      refreshScopeInventory: vi.fn().mockResolvedValue({ scopes }),
      openCollection: vi.fn().mockResolvedValue(collection),
      openCreateEditor: vi.fn().mockResolvedValue(createdEditor),
    }
    mockNativeResourceSession(vi.fn().mockResolvedValue(session))
    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: { accountId: "account-example", workspace: "first" },
      }),
    )

    await waitFor(() => expect(result.current.rows).toEqual([facts]))
    await act(async () => result.current.openCreate())
    await act(async () =>
      result.current.submitEditor(result.current.editor!.editorId, {}),
    )

    expect(result.current.createdSecret).toBe(createdSecret)
    expect(result.current.selectScope(scopes[1].scopeKey)).toBe(false)
    await act(async () => result.current.openCreate())
    await act(async () => result.current.openDetail(facts.ref))
    expect(result.current.openDelete(facts.ref)).toBe(false)
    expect(session.openCreateEditor).toHaveBeenCalledTimes(1)
    expect(collection.get).not.toHaveBeenCalled()
    expect(collection.delete).not.toHaveBeenCalled()
    expect(result.current.createdSecret).toBe(createdSecret)

    const keyListCallsBeforeScopeRetry = collection.list.mock.calls.length
    await act(async () => result.current.retryScopeInventory())
    expect(session.refreshScopeInventory).toHaveBeenCalledOnce()
    expect(result.current.scopeInventoryFailure).toBeNull()
    expect(result.current.createdSecret).toBe(createdSecret)
    expect(collection.list).toHaveBeenCalledTimes(keyListCallsBeforeScopeRetry)
  })

  it("fresh-reads the derived create destination after an uncertain result", async () => {
    const refreshedDestination = deferred<any>()
    const scopes = [
      {
        scopeKey: "workspace-first-id",
        routeKey: "first",
        displayName: "First",
        isDefault: true,
      },
      {
        scopeKey: "workspace-second-id",
        routeKey: "second",
        displayName: "Second",
        isDefault: false,
      },
    ]
    const resolveDestinationScopeKey = vi.fn(() => "workspace-second-id")
    const editor = {
      fields: [
        {
          fieldId: "destination",
          type: "select" as const,
          options: scopes.map((scope) => ({ value: scope.scopeKey })),
        },
      ],
      initialValues: { destination: "workspace-first-id" },
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey,
      submit: vi.fn().mockRejectedValue(
        new AccountKeyResourceError({
          code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
        }),
      ),
    }
    const firstCollection = {
      list: vi.fn().mockResolvedValue({ items: [] }),
    }
    const secondCollection = {
      list: vi.fn(() => refreshedDestination.promise),
    }
    const openCollection = vi.fn((scopeKey: string) =>
      Promise.resolve(
        scopeKey === "workspace-first-id" ? firstCollection : secondCollection,
      ),
    )
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue(scopes[0]),
        listScopes: vi.fn().mockResolvedValue(scopes),
        openCollection,
        openCreateEditor: vi.fn().mockResolvedValue(editor),
      }),
    )
    const { result, rerender } = renderHook(
      ({ workspace }) =>
        useAccountKeyResourceController({
          accounts: [createAccount("account-example")],
          selectedAccount: "account-example",
          routeParams: { accountId: "account-example", workspace },
        }),
      { initialProps: { workspace: "first" } },
    )

    await waitFor(() => expect(result.current.selectedScope).toEqual(scopes[0]))
    await act(async () => result.current.openCreate())
    act(() => {
      void result.current.submitEditor(result.current.editor!.editorId, {
        destination: "workspace-second-id",
      })
    })
    await waitFor(() => expect(result.current.freshReadRequired).toBe(true))
    expect(resolveDestinationScopeKey).toHaveBeenCalledWith({
      destination: "workspace-second-id",
    })
    expect(openCollection.mock.calls.map(([scopeKey]) => scopeKey)).toEqual([
      "workspace-first-id",
      "workspace-second-id",
    ])
    expect(firstCollection.list).toHaveBeenCalledTimes(1)
    expect(editor.submit).toHaveBeenCalledTimes(1)

    await act(async () => result.current.refresh())
    expect(result.current.selectedScope).toEqual(scopes[0])
    expect(result.current.freshReadRequired).toBe(false)

    rerender({ workspace: "second" })
    await act(async () => refreshedDestination.resolve({ items: [] }))
    await waitFor(() => expect(result.current.freshReadRequired).toBe(false))
    expect(result.current.selectedScope).toEqual(scopes[1])
    expect(editor.submit).toHaveBeenCalledTimes(1)
  })

  it("locks mutations after an uncertain result until a fresh read completes", async () => {
    const refreshedList = deferred<any>()
    const editor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => "workspace-default-id",
      submit: vi.fn().mockRejectedValue(
        new AccountKeyResourceError({
          code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
        }),
      ),
    }
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [] })
      .mockImplementationOnce(() => refreshedList.promise)
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue({
          scopeKey: "workspace-default-id",
          routeKey: "team",
          displayName: "Team",
          isDefault: true,
        }),
        listScopes: vi.fn().mockResolvedValue([]),
        openCollection: vi.fn().mockResolvedValue({ list }),
        openCreateEditor: vi.fn().mockResolvedValue(editor),
      }),
    )
    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: { accountId: "account-example", workspace: "team" },
      }),
    )

    await waitFor(() => expect(result.current.selectedScope).not.toBeNull())
    await act(async () => result.current.openCreate())
    const editorId = result.current.editor!.editorId
    act(() => {
      void result.current.submitEditor(editorId, {})
    })
    await waitFor(() => expect(result.current.freshReadRequired).toBe(true))
    act(() => {
      void result.current.submitEditor(editorId, {})
    })
    expect(editor.submit).toHaveBeenCalledTimes(1)
    refreshedList.resolve({ items: [] })
    await waitFor(() => expect(result.current.freshReadRequired).toBe(false))
  })

  it("keeps uncertain fresh-read locks scoped to their account and workspace", async () => {
    const accountARefresh = deferred<any>()
    const accountAList = vi
      .fn()
      .mockResolvedValueOnce({ items: [] })
      .mockImplementationOnce(() => accountARefresh.promise)
      .mockResolvedValue({ items: [] })
    const accountBList = vi.fn().mockResolvedValue({ items: [] })
    const accountAEditor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => "workspace-a-id",
      submit: vi.fn().mockRejectedValue(
        new AccountKeyResourceError({
          code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
        }),
      ),
    }
    const accountBFacts = {
      ...createFacts("workspace-b-id", "key-b"),
      ref: {
        ...createFacts("workspace-b-id", "key-b").ref,
        accountId: "account-b",
      },
    }
    const accountBEditor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => "workspace-b-id",
      submit: vi.fn().mockResolvedValue({ facts: accountBFacts }),
    }
    const createSession = (accountId: string) => {
      const isAccountA = accountId === "account-a"
      const scope = {
        scopeKey: isAccountA ? "workspace-a-id" : "workspace-b-id",
        routeKey: "team",
        displayName: isAccountA ? "Workspace A" : "Workspace B",
        isDefault: true,
      }
      return {
        resolveDefaultScope: vi.fn().mockResolvedValue(scope),
        listScopes: vi.fn().mockResolvedValue([scope]),
        openCollection: vi.fn().mockResolvedValue({
          list: isAccountA ? accountAList : accountBList,
        }),
        openCreateEditor: vi
          .fn()
          .mockResolvedValue(isAccountA ? accountAEditor : accountBEditor),
      }
    }
    createDisplayAccountApiContextMock.mockImplementation((account: any) => ({
      accountKeyResources: {
        open: vi.fn().mockResolvedValue(createSession(account.id)),
      },
      request: {},
    }))
    const accounts = [
      { ...createAccount("account-a"), baseUrl: "https://a.example.invalid" },
      { ...createAccount("account-b"), baseUrl: "https://b.example.invalid" },
    ]
    const { result, rerender } = renderHook(
      ({ selectedAccount }) =>
        useAccountKeyResourceController({
          accounts,
          selectedAccount,
          routeParams: { accountId: selectedAccount, workspace: "team" },
        }),
      { initialProps: { selectedAccount: "account-a" } },
    )

    await waitFor(() =>
      expect(result.current.selectedScope?.scopeKey).toBe("workspace-a-id"),
    )
    await act(async () => result.current.openCreate())
    act(() => {
      void result.current.submitEditor(result.current.editor!.editorId, {})
    })
    await waitFor(() => expect(result.current.freshReadRequired).toBe(true))

    rerender({ selectedAccount: "account-b" })
    await waitFor(() =>
      expect(result.current.selectedScope?.scopeKey).toBe("workspace-b-id"),
    )
    expect(result.current.freshReadRequired).toBe(false)
    await act(async () => accountARefresh.reject(new Error("late A read")))
    expect(result.current.freshReadRequired).toBe(false)

    await act(async () => result.current.openCreate())
    await act(async () =>
      result.current.submitEditor(result.current.editor!.editorId, {}),
    )
    expect(accountBEditor.submit).toHaveBeenCalledTimes(1)

    rerender({ selectedAccount: "account-a" })
    await waitFor(() =>
      expect(result.current.selectedScope?.scopeKey).toBe("workspace-a-id"),
    )
    expect(result.current.freshReadRequired).toBe(false)
  })

  it("keys uncertain locks to canonical native collection identity", async () => {
    const lateWorkspaceBRead = deferred<any>()
    const lateWorkspaceCRead = deferred<any>()
    const workspaceB = {
      scopeKey: "workspace-b-id",
      routeKey: "workspace-b",
      displayName: "Workspace B",
      isDefault: true,
    }
    const canonicalWorkspaceB = {
      ...workspaceB,
      routeKey: "workspace-b-canonical",
    }
    const workspaceC = {
      scopeKey: "workspace-c-id",
      routeKey: "workspace-c",
      displayName: "Workspace C",
      isDefault: false,
    }
    const workspaceCFacts = createFacts(workspaceC.scopeKey, "key-c")
    const workspaceBFacts = createFacts(workspaceB.scopeKey, "key-b")
    const workspaceBList = vi
      .fn()
      .mockResolvedValueOnce({ items: [] })
      .mockImplementationOnce(() => lateWorkspaceBRead.promise)
      .mockResolvedValueOnce({ items: [workspaceBFacts] })
    const workspaceCList = vi
      .fn()
      .mockResolvedValueOnce({ items: [workspaceCFacts] })
      .mockImplementationOnce(() => lateWorkspaceCRead.promise)
      .mockImplementationOnce(() => lateWorkspaceCRead.promise)
    const workspaceBEditor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => workspaceB.scopeKey,
      submit: vi.fn().mockRejectedValue(
        new AccountKeyResourceError({
          code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
        }),
      ),
    }
    const workspaceCEditor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => workspaceC.scopeKey,
      submit: vi.fn().mockRejectedValue(
        new AccountKeyResourceError({
          code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
        }),
      ),
    }
    const listScopes = vi
      .fn()
      .mockResolvedValueOnce([workspaceB, workspaceC])
      .mockResolvedValue([canonicalWorkspaceB, workspaceC])
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue(workspaceB),
        listScopes,
        openCollection: vi.fn((scopeKey: string) =>
          Promise.resolve({
            list:
              scopeKey === workspaceB.scopeKey
                ? workspaceBList
                : workspaceCList,
          }),
        ),
        openCreateEditor: vi.fn((scopeKey: string) =>
          Promise.resolve(
            scopeKey === workspaceB.scopeKey
              ? workspaceBEditor
              : workspaceCEditor,
          ),
        ),
      }),
    )
    const { result, rerender } = renderHook(
      ({ workspace }) =>
        useAccountKeyResourceController({
          accounts: [createAccount("account-example")],
          selectedAccount: "account-example",
          routeParams: { accountId: "account-example", workspace },
        }),
      { initialProps: { workspace: workspaceB.routeKey } },
    )

    await waitFor(() =>
      expect(result.current.selectedScope?.scopeKey).toBe(workspaceB.scopeKey),
    )
    await act(async () => result.current.openCreate())
    act(() => {
      void result.current.submitEditor(result.current.editor!.editorId, {})
    })
    await waitFor(() => expect(workspaceBList).toHaveBeenCalledTimes(2))

    rerender({ workspace: workspaceC.routeKey })
    await waitFor(() =>
      expect(result.current.selectedScope?.scopeKey).toBe(workspaceC.scopeKey),
    )
    await act(async () => result.current.openCreate())
    expect(result.current.editor?.mode).toBe("create")
    act(() => {
      void result.current.submitEditor(result.current.editor!.editorId, {})
    })
    await waitFor(() => expect(workspaceCList).toHaveBeenCalledTimes(2))
    expect(workspaceCEditor.submit).toHaveBeenCalledTimes(1)

    await act(async () => lateWorkspaceBRead.resolve({ items: [] }))
    expect(result.current.freshReadRequired).toBe(true)

    rerender({ workspace: "workspace-b-alias" })
    await waitFor(() =>
      expect(result.current.selectedScope?.routeKey).toBe(
        canonicalWorkspaceB.routeKey,
      ),
    )
    await act(async () => result.current.openCreate())
    expect(result.current.editor?.mode).toBe("create")

    rerender({ workspace: workspaceC.routeKey })
    await waitFor(() => expect(workspaceCList).toHaveBeenCalledTimes(3))
    expect(result.current.freshReadRequired).toBe(true)
    await act(async () =>
      lateWorkspaceCRead.resolve({ items: [workspaceCFacts] }),
    )
    await waitFor(() => expect(result.current.freshReadRequired).toBe(false))
  })

  it("keeps a stale uncertain create dirty without blocking another workspace", async () => {
    const pendingWorkspaceBCreate = deferred<any>()
    const workspaceB = {
      scopeKey: "workspace-b-id",
      routeKey: "workspace-b",
      displayName: "Workspace B",
      isDefault: true,
    }
    const workspaceC = {
      scopeKey: "workspace-c-id",
      routeKey: "workspace-c",
      displayName: "Workspace C",
      isDefault: false,
    }
    const workspaceCFacts = createFacts(workspaceC.scopeKey, "key-c")
    const pendingWorkspaceCSubmit = deferred<any>()
    const firstWorkspaceBEditor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => workspaceB.scopeKey,
      submit: vi.fn(() => pendingWorkspaceBCreate.promise),
    }
    const returnedWorkspaceBEditor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => workspaceB.scopeKey,
      submit: vi.fn(),
    }
    const workspaceCEditor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => workspaceC.scopeKey,
      submit: vi.fn(() => pendingWorkspaceCSubmit.promise),
    }
    const openCreateEditor = vi.fn((scopeKey: string) =>
      Promise.resolve(
        scopeKey === workspaceC.scopeKey
          ? workspaceCEditor
          : openCreateEditor.mock.calls.filter(
                ([candidate]) => candidate === workspaceB.scopeKey,
              ).length === 1
            ? firstWorkspaceBEditor
            : returnedWorkspaceBEditor,
      ),
    )
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue(workspaceB),
        listScopes: vi.fn().mockResolvedValue([workspaceB, workspaceC]),
        openCollection: vi.fn((scopeKey: string) =>
          Promise.resolve({
            list: vi.fn().mockResolvedValue({
              items: scopeKey === workspaceC.scopeKey ? [workspaceCFacts] : [],
            }),
          }),
        ),
        openCreateEditor,
      }),
    )
    const { result, rerender } = renderHook(
      ({ workspace }) =>
        useAccountKeyResourceController({
          accounts: [createAccount("account-example")],
          selectedAccount: "account-example",
          routeParams: { accountId: "account-example", workspace },
        }),
      { initialProps: { workspace: workspaceB.routeKey } },
    )

    await waitFor(() =>
      expect(result.current.selectedScope?.scopeKey).toBe(workspaceB.scopeKey),
    )
    await act(async () => result.current.openCreate())
    let workspaceBSubmit!: Promise<unknown>
    act(() => {
      workspaceBSubmit = result.current.submitEditor(
        result.current.editor!.editorId,
        {},
      )
    })
    await waitFor(() =>
      expect(firstWorkspaceBEditor.submit).toHaveBeenCalledTimes(1),
    )

    rerender({ workspace: workspaceC.routeKey })
    await waitFor(() =>
      expect(result.current.selectedScope?.scopeKey).toBe(workspaceC.scopeKey),
    )
    await act(async () => result.current.openCreate())
    let workspaceCSubmit!: Promise<unknown>
    act(() => {
      workspaceCSubmit = result.current.submitEditor(
        result.current.editor!.editorId,
        {},
      )
    })
    await waitFor(() =>
      expect(workspaceCEditor.submit).toHaveBeenCalledTimes(1),
    )
    await act(async () => {
      pendingWorkspaceCSubmit.resolve({ facts: workspaceCFacts })
      await workspaceCSubmit
    })

    rerender({ workspace: workspaceB.routeKey })
    await waitFor(() =>
      expect(result.current.selectedScope?.scopeKey).toBe(workspaceB.scopeKey),
    )
    await act(async () => result.current.openCreate())
    act(() => {
      void result.current.submitEditor(result.current.editor!.editorId, {})
    })
    expect(returnedWorkspaceBEditor.submit).not.toHaveBeenCalled()

    await act(async () => {
      pendingWorkspaceBCreate.reject(
        new AccountKeyResourceError({
          code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
        }),
      )
      await workspaceBSubmit
    })
    await waitFor(() => expect(result.current.freshReadRequired).toBe(true))
    expect(result.current.editor?.feedback).toBeNull()
  })

  it("keeps a stale uncertain delete dirty without blocking another workspace", async () => {
    const pendingWorkspaceBDelete = deferred<void>()
    const workspaceB = {
      scopeKey: "workspace-b-id",
      routeKey: "workspace-b",
      displayName: "Workspace B",
      isDefault: true,
    }
    const workspaceC = {
      scopeKey: "workspace-c-id",
      routeKey: "workspace-c",
      displayName: "Workspace C",
      isDefault: false,
    }
    const workspaceBFacts = createFacts(workspaceB.scopeKey, "key-b")
    const workspaceCFacts = createFacts(workspaceC.scopeKey, "key-c")
    const pendingWorkspaceCSubmit = deferred<any>()
    const workspaceCEditor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => workspaceC.scopeKey,
      submit: vi.fn(() => pendingWorkspaceCSubmit.promise),
    }
    const workspaceBCollection = {
      list: vi.fn().mockResolvedValue({ items: [workspaceBFacts] }),
      delete: vi.fn(() => pendingWorkspaceBDelete.promise),
    }
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue(workspaceB),
        listScopes: vi.fn().mockResolvedValue([workspaceB, workspaceC]),
        openCollection: vi.fn((scopeKey: string) =>
          Promise.resolve(
            scopeKey === workspaceB.scopeKey
              ? workspaceBCollection
              : {
                  list: vi.fn().mockResolvedValue({ items: [workspaceCFacts] }),
                },
          ),
        ),
        openCreateEditor: vi.fn((scopeKey: string) =>
          Promise.resolve(
            scopeKey === workspaceC.scopeKey ? workspaceCEditor : undefined,
          ),
        ),
      }),
    )
    const { result, rerender } = renderHook(
      ({ workspace }) =>
        useAccountKeyResourceController({
          accounts: [createAccount("account-example")],
          selectedAccount: "account-example",
          routeParams: { accountId: "account-example", workspace },
        }),
      { initialProps: { workspace: workspaceB.routeKey } },
    )

    await waitFor(() => expect(result.current.rows).toEqual([workspaceBFacts]))
    act(() => {
      expect(result.current.openDelete(workspaceBFacts.ref)).toBe(true)
    })
    await waitFor(() =>
      expect(result.current.deleteState.ref).toEqual(workspaceBFacts.ref),
    )
    let workspaceBDelete!: Promise<unknown>
    act(() => {
      workspaceBDelete = result.current.confirmDelete()
    })
    await waitFor(() =>
      expect(workspaceBCollection.delete).toHaveBeenCalledTimes(1),
    )

    rerender({ workspace: workspaceC.routeKey })
    await waitFor(() =>
      expect(result.current.selectedScope?.scopeKey).toBe(workspaceC.scopeKey),
    )
    await act(async () => result.current.openCreate())
    let workspaceCSubmit!: Promise<unknown>
    act(() => {
      workspaceCSubmit = result.current.submitEditor(
        result.current.editor!.editorId,
        {},
      )
    })
    await waitFor(() =>
      expect(workspaceCEditor.submit).toHaveBeenCalledTimes(1),
    )
    await act(async () => {
      pendingWorkspaceCSubmit.resolve({ facts: workspaceCFacts })
      await workspaceCSubmit
    })

    rerender({ workspace: workspaceB.routeKey })
    await waitFor(() => expect(result.current.rows).toEqual([workspaceBFacts]))
    await act(async () => {
      pendingWorkspaceBDelete.reject(
        new AccountKeyResourceError({
          code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
        }),
      )
      await workspaceBDelete
    })
    await waitFor(() => expect(result.current.freshReadRequired).toBe(true))
    expect(result.current.deleteState.failure).toBeNull()
  })

  it("ignores an aborted detail request after a replacement detail succeeds", async () => {
    const firstFacts = createFacts("workspace-default-id", "key-first")
    const secondFacts = createFacts("workspace-default-id", "key-second")
    const firstDetail = deferred<any>()
    const secondDetail = deferred<any>()
    let firstSignal: AbortSignal | undefined
    const collection = {
      list: vi.fn().mockResolvedValue({ items: [firstFacts, secondFacts] }),
      get: vi.fn((ref: any, options: { signal?: AbortSignal }) => {
        if (ref.resourceId === firstFacts.ref.resourceId) {
          firstSignal = options.signal
          return firstDetail.promise
        }
        return secondDetail.promise
      }),
      openEditEditor: vi.fn(),
      delete: vi.fn(),
    }
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue({
          scopeKey: "workspace-default-id",
          routeKey: "team",
          displayName: "Team",
          isDefault: true,
        }),
        listScopes: vi.fn().mockResolvedValue([]),
        openCollection: vi.fn().mockResolvedValue(collection),
        openCreateEditor: vi.fn(),
      }),
    )
    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: { accountId: "account-example", workspace: "team" },
      }),
    )

    await waitFor(() => expect(result.current.rows).toHaveLength(2))
    let firstRequest!: Promise<void>
    act(() => {
      firstRequest = result.current.openDetail(firstFacts.ref)
    })
    await waitFor(() => expect(collection.get).toHaveBeenCalledTimes(1))

    let secondRequest!: Promise<void>
    act(() => {
      secondRequest = result.current.openDetail(secondFacts.ref)
    })
    await waitFor(() => expect(firstSignal?.aborted).toBe(true))

    const expandedSecondFacts = {
      ...secondFacts,
      displayName: "Second key details",
    }
    await act(async () => {
      secondDetail.resolve(expandedSecondFacts)
      await Promise.all([firstRequest, secondRequest])
    })

    expect(result.current.detail).toBe(expandedSecondFacts)
    expect(result.current.detailFailure).toBeNull()
    expect(result.current.isDetailLoading).toBe(false)
  })

  it("loads details and serializes delete commands with redacted analytics", async () => {
    startProductAnalyticsActionMock.mockReturnValue({
      complete: trackCompleteMock,
    })
    const facts = createFacts("workspace-default-id", "key-example")
    const remove = deferred<void>()
    const collection = {
      list: vi.fn().mockResolvedValue({ items: [facts] }),
      get: vi.fn().mockResolvedValue({
        ...facts,
        fields: [{ fieldId: "hash", label: "Hash", value: "hash-example" }],
      }),
      openEditEditor: vi.fn().mockResolvedValue({
        fields: [],
        initialValues: {},
        validate: vi.fn().mockReturnValue({ valid: true }),
        submit: vi.fn(),
      }),
      delete: vi.fn(() => remove.promise),
    }
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue({
          scopeKey: "workspace-default-id",
          routeKey: "team",
          displayName: "Team",
          isDefault: true,
        }),
        listScopes: vi.fn().mockResolvedValue([]),
        openCollection: vi.fn().mockResolvedValue(collection),
        openCreateEditor: vi.fn(),
      }),
    )
    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: { accountId: "account-example", workspace: "team" },
      }),
    )

    await waitFor(() => expect(result.current.rows).toHaveLength(1))
    await act(async () => result.current.openDetail(facts.ref))
    expect(result.current.detail?.fields).toEqual([
      { fieldId: "hash", label: "Hash", value: "hash-example" },
    ])
    await act(async () => result.current.openEdit(facts.ref))
    expect(result.current.editor?.mode).toBe("edit")
    act(() => result.current.closeEditor(result.current.editor!.editorId))
    let opened = false
    act(() => {
      opened = result.current.openDelete(facts.ref)
    })
    expect(opened).toBe(true)
    await waitFor(() => expect(result.current.deleteState.isOpen).toBe(true))
    act(() => {
      void result.current.confirmDelete()
    })
    await waitFor(() => expect(collection.delete).toHaveBeenCalledTimes(1))
    act(() => {
      void result.current.confirmDelete()
    })
    expect(collection.delete).toHaveBeenCalledTimes(1)
    await act(async () => remove.resolve())
    await waitFor(() => expect(result.current.deleteState.isOpen).toBe(false))
    expect(collection.list).toHaveBeenCalledTimes(2)
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.DeleteAccountToken,
      }),
    )
    const calls = JSON.stringify([
      startProductAnalyticsActionMock.mock.calls,
      trackCompleteMock.mock.calls,
    ])
    for (const value of ["account-example", "key-example", "hash-example"]) {
      expect(calls).not.toContain(value)
    }
  })

  it("rejects foreign account, site, and scope refs for every resource command", async () => {
    const collection = {
      list: vi.fn().mockResolvedValue({ items: [] }),
      get: vi.fn(),
      openEditEditor: vi.fn(),
      delete: vi.fn(),
    }
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue({
          scopeKey: "workspace-current-id",
          routeKey: "current",
          displayName: "Current",
          isDefault: true,
        }),
        listScopes: vi.fn().mockResolvedValue([]),
        openCollection: vi.fn().mockResolvedValue(collection),
        openCreateEditor: vi.fn(),
      }),
    )
    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: {
          accountId: "account-example",
          workspace: "current",
        },
      }),
    )
    await waitFor(() => expect(result.current.selectedScope).not.toBeNull())
    const invalidRefs = [
      {
        ...createFacts("workspace-current-id", "foreign-account").ref,
        accountId: "account-foreign",
      },
      {
        ...createFacts("workspace-current-id", "foreign-site").ref,
        siteType: "new-api" as const,
      },
      createFacts("workspace-stale-id", "stale-scope").ref,
    ]

    for (const ref of invalidRefs) {
      await act(async () => result.current.openDetail(ref as any))
      await act(async () => result.current.openEdit(ref as any))
      let opened = true
      act(() => {
        opened = result.current.openDelete(ref as any)
      })
      expect(opened).toBe(false)
    }

    expect(collection.get).not.toHaveBeenCalled()
    expect(collection.openEditEditor).not.toHaveBeenCalled()
    expect(collection.delete).not.toHaveBeenCalled()
  })

  it("tracks an applied edit as an update without leaking submitted values", async () => {
    const facts = createFacts("workspace-default-id", "key-example")
    const editor = {
      fields: [],
      initialValues: { member: "member-raw" },
      validate: vi.fn().mockReturnValue({ valid: true }),
      submit: vi.fn().mockResolvedValue({ facts }),
    }
    const collection = {
      list: vi.fn().mockResolvedValue({ items: [facts] }),
      openEditEditor: vi.fn().mockResolvedValue(editor),
    }
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue({
          scopeKey: "workspace-default-id",
          routeKey: "team",
          displayName: "Team",
          isDefault: true,
        }),
        listScopes: vi.fn().mockResolvedValue([]),
        openCollection: vi.fn().mockResolvedValue(collection),
        openCreateEditor: vi.fn(),
      }),
    )
    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: { accountId: "account-example", workspace: "team" },
      }),
    )

    await waitFor(() => expect(result.current.rows).toHaveLength(1))
    await act(async () => result.current.openEdit(facts.ref))
    await act(async () => {
      await result.current.submitEditor(result.current.editor!.editorId, {
        member: "member-raw",
        limit: "limit-example",
        hash: "hash-example",
        secret: "secret-example",
        callbackUrl: "https://example.invalid/path",
      })
    })
    expect(editor.submit).toHaveBeenCalledTimes(1)
    expect(collection.list).toHaveBeenCalledTimes(2)
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.UpdateAccountToken,
      }),
    )
    expect(startProductAnalyticsActionMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.CreateAccountToken,
      }),
    )
    expect(trackCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      expect.objectContaining({ insights: expect.any(Object) }),
    )
    const calls = JSON.stringify([
      startProductAnalyticsActionMock.mock.calls,
      trackCompleteMock.mock.calls,
    ])
    for (const value of [
      "account-example",
      "key-example",
      "Example key",
      "member-raw",
      "limit-example",
      "hash-example",
      "secret-example",
      "https://example.invalid/path",
    ]) {
      expect(calls).not.toContain(value)
    }
  })

  it("tracks a deterministic edit failure without refresh, lock, or replay", async () => {
    const facts = createFacts("workspace-raw-id", "key-raw-id")
    const upstreamError = new AccountKeyResourceError({
      code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
      message: "upstream message",
    })
    const editor = {
      fields: [],
      initialValues: { member: "member-raw" },
      validate: vi.fn().mockReturnValue({ valid: true }),
      submit: vi.fn().mockRejectedValue(upstreamError),
    }
    const collection = {
      list: vi.fn().mockResolvedValue({ items: [facts] }),
      openEditEditor: vi.fn().mockResolvedValue(editor),
    }
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue({
          scopeKey: "workspace-raw-id",
          routeKey: "team",
          displayName: "Workspace Raw Name",
          isDefault: true,
        }),
        listScopes: vi.fn().mockResolvedValue([]),
        openCollection: vi.fn().mockResolvedValue(collection),
        openCreateEditor: vi.fn(),
      }),
    )
    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [
          {
            ...createAccount("account-raw-id"),
            name: "Account Raw Name",
            baseUrl: "https://example.invalid/raw-path",
          },
        ],
        selectedAccount: "account-raw-id",
        routeParams: { accountId: "account-raw-id", workspace: "team" },
      }),
    )

    await waitFor(() => expect(result.current.rows).toHaveLength(1))
    const ref = {
      ...facts.ref,
      accountId: "account-raw-id",
    }
    await act(async () => result.current.openEdit(ref))
    await act(async () => {
      await result.current.submitEditor(result.current.editor!.editorId, {
        member: "member-raw",
        limit: "limit-example",
        hash: "hash-example",
        secret: "secret-example",
        callbackUrl: "https://example.invalid/raw-path",
      })
    })
    expect(editor.submit).toHaveBeenCalledTimes(1)
    expect(collection.list).toHaveBeenCalledTimes(1)
    expect(result.current.freshReadRequired).toBe(false)
    expect(result.current.editor?.feedback?.code).toBe(
      ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
    )
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.UpdateAccountToken,
      }),
    )
    expect(startProductAnalyticsActionMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.CreateAccountToken,
      }),
    )
    expect(trackCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.objectContaining({
        errorCategory: "unknown",
        insights: expect.any(Object),
      }),
    )
    const calls = JSON.stringify([
      startProductAnalyticsActionMock.mock.calls,
      trackCompleteMock.mock.calls,
    ])
    for (const value of [
      "account-raw-id",
      "Account Raw Name",
      "workspace-raw-id",
      "Workspace Raw Name",
      "key-raw-id",
      "member-raw",
      "limit-example",
      "hash-example",
      "upstream message",
      "secret-example",
      "https://example.invalid/raw-path",
    ]) {
      expect(calls).not.toContain(value)
    }
  })

  it("ignores a late edit result after the workspace and editor generation change", async () => {
    const editResult = deferred<any>()
    const scopes = [
      {
        scopeKey: "workspace-first-id",
        routeKey: "first",
        displayName: "First",
        isDefault: true,
      },
      {
        scopeKey: "workspace-second-id",
        routeKey: "second",
        displayName: "Second",
        isDefault: false,
      },
    ]
    const firstFacts = createFacts("workspace-first-id", "key-first")
    const secondFacts = createFacts("workspace-second-id", "key-second")
    const editEditor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      submit: vi.fn(() => editResult.promise),
    }
    const firstCollection = {
      list: vi.fn().mockResolvedValue({ items: [firstFacts] }),
      openEditEditor: vi.fn().mockResolvedValue(editEditor),
    }
    const secondCollection = {
      list: vi.fn().mockResolvedValue({ items: [secondFacts] }),
    }
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue(scopes[0]),
        listScopes: vi.fn().mockResolvedValue(scopes),
        openCollection: vi.fn((scopeKey: string) =>
          Promise.resolve(
            scopeKey === "workspace-first-id"
              ? firstCollection
              : secondCollection,
          ),
        ),
        openCreateEditor: vi.fn(),
      }),
    )
    const { result, rerender } = renderHook(
      ({ workspace }) =>
        useAccountKeyResourceController({
          accounts: [createAccount("account-example")],
          selectedAccount: "account-example",
          routeParams: { accountId: "account-example", workspace },
        }),
      { initialProps: { workspace: "first" } },
    )

    await waitFor(() => expect(result.current.rows).toEqual([firstFacts]))
    await act(async () => result.current.openEdit(firstFacts.ref))
    act(() => {
      void result.current.submitEditor(result.current.editor!.editorId, {})
    })
    await waitFor(() => expect(editEditor.submit).toHaveBeenCalledTimes(1))

    rerender({ workspace: "second" })
    await waitFor(() => expect(result.current.rows).toEqual([secondFacts]))
    await act(async () =>
      editResult.resolve({
        facts: firstFacts,
        createdSecret: {
          correlation: { kind: "account-key-resource", ref: firstFacts.ref },
          displayName: "Late secret",
          secret: "secret-late-example",
          secretAvailability: "create-response-only",
          credential: {},
        },
      }),
    )

    expect(result.current.rows).toEqual([secondFacts])
    expect(result.current.editor).toBeNull()
    expect(result.current.createdSecret).toBeNull()
    expect(firstCollection.list).toHaveBeenCalledTimes(1)
    expect(secondCollection.list).toHaveBeenCalledTimes(1)
    expect(trackCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      expect.objectContaining({
        insights: expect.objectContaining({
          mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
          selectedCount: 1,
        }),
      }),
    )
  })

  it("clears a created secret on account switch and ignores a late create result", async () => {
    const submitted = deferred<any>()
    const editor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => "workspace-default-id",
      submit: vi.fn(() => submitted.promise),
    }
    const facts = createFacts("workspace-default-id", "key-example")
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue({
          scopeKey: "workspace-default-id",
          routeKey: "team",
          displayName: "Team",
          isDefault: true,
        }),
        listScopes: vi.fn().mockResolvedValue([]),
        openCollection: vi.fn().mockResolvedValue({
          list: vi.fn().mockResolvedValue({ items: [] }),
        }),
        openCreateEditor: vi.fn().mockResolvedValue(editor),
      }),
    )
    const accounts = [
      createAccount("account-one"),
      createAccount("account-two"),
    ]
    const { result, rerender } = renderHook(
      ({ selectedAccount }) =>
        useAccountKeyResourceController({
          accounts,
          selectedAccount,
          routeParams: { accountId: selectedAccount, workspace: "team" },
        }),
      { initialProps: { selectedAccount: "account-one" } },
    )

    await waitFor(() => expect(result.current.selectedScope).not.toBeNull())
    await act(async () => result.current.openCreate())
    act(() => {
      void result.current.submitEditor(result.current.editor!.editorId, {})
    })
    await waitFor(() => expect(editor.submit).toHaveBeenCalledTimes(1))
    rerender({ selectedAccount: "account-two" })
    await waitFor(() => expect(result.current.createdSecret).toBeNull())
    await act(async () => {
      submitted.resolve({
        facts,
        createdSecret: {
          correlation: { kind: "account-key-resource", ref: facts.ref },
          displayName: "Example key",
          secret: "secret-example",
          secretAvailability: "create-response-only",
          credential: {},
        },
      })
    })
    expect(result.current.createdSecret).toBeNull()
  })

  it("does not resurrect a terminal editor when the account changes during its refresh", async () => {
    const refreshScope = deferred<any>()
    const scopeOne = {
      scopeKey: "workspace-one-id",
      routeKey: "one",
      displayName: "One",
      isDefault: true,
    }
    const scopeTwo = {
      scopeKey: "workspace-two-id",
      routeKey: "two",
      displayName: "Two",
      isDefault: true,
    }
    const facts = {
      ...createFacts(scopeOne.scopeKey, "key-created"),
      ref: {
        ...createFacts(scopeOne.scopeKey, "key-created").ref,
        accountId: "account-one",
      },
    }
    const editor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => scopeOne.scopeKey,
      submit: vi.fn().mockResolvedValue({
        facts,
        createdSecret: {
          correlation: {
            kind: "account-key-resource" as const,
            ref: facts.ref,
          },
          displayName: "Created key",
          secret: "one-time-secret-example",
          secretAvailability: "create-response-only" as const,
          credential: {},
        },
      }),
    }
    const firstResolveDefaultScope = vi
      .fn()
      .mockResolvedValueOnce(scopeOne)
      .mockImplementation(() => refreshScope.promise)
    const sessionOne = {
      resolveDefaultScope: firstResolveDefaultScope,
      listScopes: vi.fn().mockResolvedValue([scopeOne]),
      openCollection: vi.fn().mockResolvedValue({
        list: vi.fn().mockResolvedValue({ items: [] }),
      }),
      openCreateEditor: vi.fn().mockResolvedValue(editor),
    }
    const sessionTwo = {
      resolveDefaultScope: vi.fn().mockResolvedValue(scopeTwo),
      listScopes: vi.fn().mockResolvedValue([scopeTwo]),
      openCollection: vi.fn().mockResolvedValue({
        list: vi.fn().mockResolvedValue({ items: [] }),
      }),
      openCreateEditor: vi.fn(),
    }
    mockNativeResourceSession(
      vi.fn((input: { account: { id: string } }) =>
        Promise.resolve(
          input.account.id === "account-one" ? sessionOne : sessionTwo,
        ),
      ),
    )
    const accounts = [
      createAccount("account-one"),
      createAccount("account-two"),
    ]
    const { result, rerender } = renderHook(
      ({ selectedAccount, workspace }) =>
        useAccountKeyResourceController({
          accounts,
          selectedAccount,
          routeParams: { accountId: selectedAccount, workspace },
        }),
      { initialProps: { selectedAccount: "account-one", workspace: "one" } },
    )

    await waitFor(() => expect(result.current.selectedScope).toEqual(scopeOne))
    await act(async () => result.current.openCreate())
    void result.current.submitEditor(result.current.editor!.editorId, {})
    await waitFor(() =>
      expect(firstResolveDefaultScope).toHaveBeenCalledTimes(2),
    )

    rerender({ selectedAccount: "account-two", workspace: "two" })
    await waitFor(() => expect(result.current.selectedScope).toEqual(scopeTwo))
    await act(async () => refreshScope.resolve(scopeOne))

    expect(result.current.selectedScope).toEqual(scopeTwo)
    expect(result.current.editor).toBeNull()
    expect(result.current.createdSecret).toBeNull()
  })

  it("ignores a late delete result after the selected account changes", async () => {
    const remove = deferred<void>()
    const facts = createFacts("workspace-default-id", "key-example")
    const collection = {
      list: vi.fn().mockResolvedValue({ items: [facts] }),
      delete: vi.fn(() => remove.promise),
    }
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue({
          scopeKey: "workspace-default-id",
          routeKey: "team",
          displayName: "Team",
          isDefault: true,
        }),
        listScopes: vi.fn().mockResolvedValue([]),
        openCollection: vi.fn().mockResolvedValue(collection),
        openCreateEditor: vi.fn(),
      }),
    )
    const accounts = [
      createAccount("account-example"),
      createAccount("account-two"),
    ]
    const { result, rerender } = renderHook(
      ({ selectedAccount }) =>
        useAccountKeyResourceController({
          accounts,
          selectedAccount,
          routeParams: { accountId: selectedAccount, workspace: "team" },
        }),
      { initialProps: { selectedAccount: "account-example" } },
    )

    await waitFor(() => expect(result.current.rows).toHaveLength(1))
    act(() => {
      result.current.openDelete(facts.ref)
    })
    await waitFor(() => expect(result.current.deleteState.isOpen).toBe(true))
    act(() => {
      void result.current.confirmDelete()
    })
    await waitFor(() => expect(collection.delete).toHaveBeenCalledTimes(1))
    rerender({ selectedAccount: "account-two" })
    await act(async () => remove.resolve())
    await waitFor(() => expect(result.current.deleteState.isOpen).toBe(false))
    expect(result.current.freshReadRequired).toBe(false)
  })

  it("aborts an in-flight create when the controller unmounts", async () => {
    const submitted = deferred<any>()
    const editor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => "workspace-default-id",
      submit: vi.fn(() => submitted.promise),
    }
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue({
          scopeKey: "workspace-default-id",
          routeKey: "team",
          displayName: "Team",
          isDefault: true,
        }),
        listScopes: vi.fn().mockResolvedValue([]),
        openCollection: vi.fn().mockResolvedValue({
          list: vi.fn().mockResolvedValue({ items: [] }),
        }),
        openCreateEditor: vi.fn().mockResolvedValue(editor),
      }),
    )
    const { result, unmount } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: { accountId: "account-example", workspace: "team" },
      }),
    )

    await waitFor(() => expect(result.current.selectedScope).not.toBeNull())
    await act(async () => result.current.openCreate())
    act(() => {
      void result.current.submitEditor(result.current.editor!.editorId, {})
    })
    await waitFor(() => expect(editor.submit).toHaveBeenCalledTimes(1))
    const signal = (
      editor.submit.mock.calls[0] as unknown as
        | [unknown, { signal?: AbortSignal }]
        | undefined
    )?.[1]?.signal
    unmount()
    expect(signal?.aborted).toBe(true)
    await act(async () => submitted.resolve({}))
  })

  it("keeps settled secrets local to their mounted controller instance", async () => {
    const facts = createFacts("workspace-default-id", "key-example")
    const createdSecret = {
      correlation: { kind: "account-key-resource" as const, ref: facts.ref },
      displayName: "Example key",
      secret: "secret-example",
      secretAvailability: "create-response-only" as const,
      credential: {},
    }
    const editor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => "workspace-default-id",
      submit: vi.fn().mockResolvedValue({ facts, createdSecret }),
    }
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue({
          scopeKey: "workspace-default-id",
          routeKey: "team",
          displayName: "Team",
          isDefault: true,
        }),
        listScopes: vi.fn().mockResolvedValue([]),
        openCollection: vi.fn().mockResolvedValue({
          list: vi.fn().mockResolvedValue({ items: [] }),
        }),
        openCreateEditor: vi.fn().mockResolvedValue(editor),
      }),
    )
    const controllerOptions = {
      accounts: [createAccount("account-example")],
      selectedAccount: "account-example",
      routeParams: { accountId: "account-example", workspace: "team" },
    }
    const first = renderHook(() =>
      useAccountKeyResourceController(controllerOptions),
    )

    await waitFor(() =>
      expect(first.result.current.selectedScope).not.toBeNull(),
    )
    await act(async () => first.result.current.openCreate())
    await act(async () =>
      first.result.current.submitEditor(
        first.result.current.editor!.editorId,
        {},
      ),
    )
    await waitFor(() =>
      expect(first.result.current.createdSecret?.secret).toBe("secret-example"),
    )
    const second = renderHook(() =>
      useAccountKeyResourceController(controllerOptions),
    )
    await waitFor(() => expect(second.result.current.isLoading).toBe(false))
    expect(second.result.current.createdSecret).toBeNull()

    first.unmount()

    expect(second.result.current.createdSecret).toBeNull()
  })

  it("keeps a created secret through same-turn search and public refresh commands", async () => {
    const facts = createFacts("workspace-default-id", "key-example")
    const createdSecret = {
      correlation: { kind: "account-key-resource" as const, ref: facts.ref },
      displayName: "Example key",
      secret: "secret-example",
      secretAvailability: "create-response-only" as const,
      credential: {},
    }
    const editor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => "workspace-default-id",
      submit: vi.fn().mockResolvedValue({ facts, createdSecret }),
    }
    const list = vi.fn().mockResolvedValue({ items: [facts] })
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue({
          scopeKey: "workspace-default-id",
          routeKey: "team",
          displayName: "Team",
          isDefault: true,
        }),
        listScopes: vi.fn().mockResolvedValue([]),
        openCollection: vi.fn().mockResolvedValue({ list }),
        openCreateEditor: vi.fn().mockResolvedValue(editor),
      }),
    )
    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: { accountId: "account-example", workspace: "team" },
      }),
    )

    await waitFor(() => expect(result.current.rows).toEqual([facts]))
    await act(async () => result.current.openCreate())
    await act(async () =>
      result.current.submitEditor(result.current.editor!.editorId, {}),
    )
    await waitFor(() =>
      expect(result.current.createdSecret).toBe(createdSecret),
    )
    const callsWhileSecretIsOpen = list.mock.calls.length

    await act(async () => {
      result.current.setSearch("different")
      await result.current.refresh()
    })
    expect(result.current.search).toBe("")
    expect(result.current.createdSecret).toBe(createdSecret)
    expect(list).toHaveBeenCalledTimes(callsWhileSecretIsOpen)

    act(() => result.current.recordCreatedSecretCopyResult("success"))
    act(() => result.current.recordCreatedSecretSaveResult("failure"))
    expect(result.current.createdSecret).toBe(createdSecret)

    act(() => result.current.closeCreatedSecret())
    act(() => result.current.setSearch("different"))
    await waitFor(() => expect(result.current.search).toBe("different"))
    await waitFor(() =>
      expect(list.mock.calls.length).toBeGreaterThan(callsWhileSecretIsOpen),
    )
    const callsAfterClose = list.mock.calls.length
    await act(async () => result.current.refresh())
    expect(list.mock.calls.length).toBeGreaterThan(callsAfterClose)
  })

  it("serializes mutations and clears one-time creation secrets when the dialog closes", async () => {
    startProductAnalyticsActionMock.mockClear()
    trackCompleteMock.mockClear()
    startProductAnalyticsActionMock.mockReturnValue({
      complete: trackCompleteMock,
    })
    const submit = deferred<any>()
    const editor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => "workspace-default-id",
      submit: vi.fn(() => submit.promise),
    }
    const facts = createFacts("workspace-default-id", "key-example")
    const session = {
      resolveDefaultScope: vi.fn().mockResolvedValue({
        scopeKey: "workspace-default-id",
        routeKey: "team",
        displayName: "Team",
        isDefault: true,
      }),
      listScopes: vi.fn().mockResolvedValue([
        {
          scopeKey: "workspace-default-id",
          routeKey: "team",
          displayName: "Team",
          isDefault: true,
        },
      ]),
      openCollection: vi.fn().mockResolvedValue({
        list: vi.fn().mockResolvedValue({ items: [facts] }),
        get: vi.fn(),
        openEditEditor: vi.fn(),
        delete: vi.fn(),
      }),
      openCreateEditor: vi.fn().mockResolvedValue(editor),
    }
    mockNativeResourceSession(vi.fn().mockResolvedValue(session))
    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: { accountId: "account-example", workspace: "team" },
      }),
    )
    await waitFor(() => expect(result.current.rows).toHaveLength(1))
    await act(async () => result.current.openCreate())
    expect(result.current.editor?.mode).toBe("create")
    void result.current.submitEditor(result.current.editor!.editorId, {})
    void result.current.submitEditor(result.current.editor!.editorId, {})
    expect(editor.submit).toHaveBeenCalledTimes(1)

    await act(async () => {
      submit.resolve({
        facts,
        createdSecret: {
          correlation: { kind: "account-key-resource", ref: facts.ref },
          displayName: "Example key",
          secret: "secret-example",
          secretAvailability: "create-response-only",
          credential: {},
        },
      })
    })
    await waitFor(() =>
      expect(result.current.createdSecret?.secret).toBe("secret-example"),
    )
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.CreateAccountToken,
      }),
    )
    expect(trackCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      expect.objectContaining({ insights: expect.any(Object) }),
    )
    startProductAnalyticsActionMock.mockClear()
    trackCompleteMock.mockClear()
    act(() => result.current.recordCreatedSecretCopyResult("success"))
    act(() => result.current.recordCreatedSecretSaveResult("failure"))
    expect(startProductAnalyticsActionMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopyAccountTokenKey,
      }),
    )
    expect(startProductAnalyticsActionMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        actionId:
          PRODUCT_ANALYTICS_ACTION_IDS.SaveAccountTokenToApiCredentialProfile,
      }),
    )
    expect(trackCompleteMock).toHaveBeenNthCalledWith(
      1,
      PRODUCT_ANALYTICS_RESULTS.Success,
      expect.objectContaining({ insights: expect.any(Object) }),
    )
    expect(trackCompleteMock).toHaveBeenNthCalledWith(
      2,
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.objectContaining({
        errorCategory: "unknown",
        insights: expect.any(Object),
      }),
    )
    const observerCalls = JSON.stringify([
      startProductAnalyticsActionMock.mock.calls,
      trackCompleteMock.mock.calls,
    ])
    for (const value of [
      "account-example",
      "workspace-default-id",
      "key-example",
      "Example key",
      "secret-example",
    ]) {
      expect(observerCalls).not.toContain(value)
    }
    act(() => result.current.closeCreatedSecret())
    expect(result.current.createdSecret).toBeNull()
  })

  it("exposes one failed editor-opening attempt and retries its bound request", async () => {
    const opening = deferred<any>()
    const editor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => "workspace-default-id",
      submit: vi.fn(),
    }
    const openCreateEditor = vi
      .fn()
      .mockImplementationOnce(() => opening.promise)
      .mockResolvedValueOnce(editor)
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue({
          scopeKey: "workspace-default-id",
          routeKey: "team",
          displayName: "Team",
          isDefault: true,
        }),
        listScopes: vi.fn().mockResolvedValue([]),
        openCollection: vi.fn().mockResolvedValue({
          list: vi.fn().mockResolvedValue({ items: [] }),
        }),
        openCreateEditor,
      }),
    )
    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: { accountId: "account-example", workspace: "team" },
      }),
    )

    await waitFor(() => expect(result.current.selectedScope).not.toBeNull())
    act(() => {
      void result.current.openCreate()
      void result.current.openCreate()
    })
    expect(openCreateEditor).toHaveBeenCalledOnce()
    expect(result.current.editorOpening.status).toBe("loading")

    await act(async () =>
      opening.reject(
        new AccountKeyResourceError({
          code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
          message: "private provider message",
        }),
      ),
    )
    await waitFor(() =>
      expect(result.current.editorOpening.status).toBe("failure"),
    )
    expect(result.current.editorOpening).toEqual({
      attemptId: expect.any(Number),
      status: "failure",
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
        message: "private provider message",
      },
    })

    act(() =>
      result.current.retryEditorOpening(result.current.editorOpening.attemptId),
    )
    await waitFor(() => expect(result.current.editor).not.toBeNull())
    expect(openCreateEditor).toHaveBeenCalledTimes(2)
    expect(result.current.editorOpening.status).toBe("idle")
  })

  it("invalidates only the bound editor-opening attempt", async () => {
    const firstOpening = deferred<any>()
    const secondOpening = deferred<any>()
    const firstEditor = {
      fields: [],
      initialValues: {},
      validate: vi.fn().mockReturnValue({ valid: true }),
      resolveDestinationScopeKey: () => "workspace-default-id",
      submit: vi.fn(),
    }
    const secondEditor = { ...firstEditor }
    const openCreateEditor = vi
      .fn()
      .mockImplementationOnce(() => firstOpening.promise)
      .mockImplementationOnce(() => secondOpening.promise)
    mockNativeResourceSession(
      vi.fn().mockResolvedValue({
        resolveDefaultScope: vi.fn().mockResolvedValue({
          scopeKey: "workspace-default-id",
          routeKey: "team",
          displayName: "Team",
          isDefault: true,
        }),
        listScopes: vi.fn().mockResolvedValue([]),
        openCollection: vi.fn().mockResolvedValue({
          list: vi.fn().mockResolvedValue({ items: [] }),
        }),
        openCreateEditor,
      }),
    )
    const { result } = renderHook(() =>
      useAccountKeyResourceController({
        accounts: [createAccount("account-example")],
        selectedAccount: "account-example",
        routeParams: { accountId: "account-example", workspace: "team" },
      }),
    )

    await waitFor(() => expect(result.current.selectedScope).not.toBeNull())
    act(() => void result.current.openCreate())
    const firstAttemptId = result.current.editorOpening.attemptId
    act(() => result.current.cancelEditorOpening(firstAttemptId))
    expect(result.current.editorOpening.status).toBe("idle")

    await act(async () => firstOpening.resolve(firstEditor))
    expect(result.current.editor).toBeNull()

    act(() => void result.current.openCreate())
    const secondAttemptId = result.current.editorOpening.attemptId
    act(() => result.current.cancelEditorOpening(firstAttemptId))
    expect(result.current.editorOpening).toEqual({
      attemptId: secondAttemptId,
      status: "loading",
    })

    await act(async () => secondOpening.resolve(secondEditor))
    await waitFor(() => expect(result.current.editor).not.toBeNull())
  })
})

import { act, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import KeyManagement from "~/entrypoints/options/pages/KeyManagement"
import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "~/features/KeyManagement/constants"
import type { AccountKeyResourceRouteTransition } from "~/features/KeyManagement/controllers/useAccountKeyResourceController"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import { TOKEN_PROVISIONING_TEST_IDS } from "~/features/TokenProvisioning/testIds"
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
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { testI18n } from "~~/tests/test-utils/i18n"
import { render, screen, waitFor } from "~~/tests/test-utils/render"
import {
  createAccount,
  createToken,
} from "~~/tests/utils/keyManagementFactories"

const {
  accountKeyResourceControllerOptionsSpy,
  accountKeyResourceControllerReplaceRouteSpy,
  accountKeyResourceEditorDialogPropsSpy,
  accountSelectorPanelPropsSpy,
  accountSummaryBarPropsSpy,
  addTokenDialogPropsSpy,
  createDisplayAccountApiContextMock,
  createProfileFromAccountTokenMock,
  oneTimeSecretDialogPropsSpy,
  oneTimeSecretDialogHarnessState,
  replaceWithinOptionsPageMock,
  sendRuntimeActionMessageMock,
  startProductAnalyticsActionMock,
  trackCompleteMock,
  useKeyManagementMock,
  useUserPreferencesContextMock,
  legacyAddTokenSpy,
  legacyLoadTokensSpy,
  legacyRetryFailedAccountsSpy,
} = vi.hoisted(() => ({
  accountKeyResourceControllerOptionsSpy: vi.fn(),
  accountKeyResourceControllerReplaceRouteSpy: vi.fn(),
  accountKeyResourceEditorDialogPropsSpy: vi.fn(),
  accountSelectorPanelPropsSpy: vi.fn(),
  accountSummaryBarPropsSpy: vi.fn(),
  addTokenDialogPropsSpy: vi.fn(),
  createDisplayAccountApiContextMock: vi.fn(),
  createProfileFromAccountTokenMock: vi.fn(),
  oneTimeSecretDialogPropsSpy: vi.fn(),
  oneTimeSecretDialogHarnessState: { disableAutoCopy: false },
  replaceWithinOptionsPageMock: vi.fn(),
  sendRuntimeActionMessageMock: vi.fn(),
  startProductAnalyticsActionMock: vi.fn(),
  trackCompleteMock: vi.fn(),
  useKeyManagementMock: vi.fn(),
  useUserPreferencesContextMock: vi.fn(),
  legacyAddTokenSpy: vi.fn(),
  legacyLoadTokensSpy: vi.fn(),
  legacyRetryFailedAccountsSpy: vi.fn(),
}))

vi.mock("~/services/apiCredentialProfiles/accountTokenImport", () => ({
  createProfileFromAccountToken: (...args: unknown[]) =>
    createProfileFromAccountTokenMock(...args),
}))

vi.mock(
  "~/features/KeyManagement/controllers/useAccountKeyResourceController",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/features/KeyManagement/controllers/useAccountKeyResourceController")
      >()

    return {
      ...actual,
      useAccountKeyResourceController: (options: any) => {
        accountKeyResourceControllerOptionsSpy(options)
        return actual.useAccountKeyResourceController({
          ...options,
          replaceRoute: (
            params: Record<string, string>,
            transition?: AccountKeyResourceRouteTransition,
          ) => {
            accountKeyResourceControllerReplaceRouteSpy(params, transition)
            options.replaceRoute?.(params, transition)
          },
        } as never)
      },
    }
  },
)

vi.mock(
  "~/features/KeyManagement/components/AccountSummaryBar",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/features/KeyManagement/components/AccountSummaryBar")
      >()
    const React = await import("react")
    return {
      ...actual,
      AccountSummaryBar: (props: unknown) => {
        accountSummaryBarPropsSpy(props)
        return React.createElement(actual.AccountSummaryBar, props as never)
      },
    }
  },
)

vi.mock(
  "~/features/KeyManagement/components/AccountSelectorPanel",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/features/KeyManagement/components/AccountSelectorPanel")
      >()
    const React = await import("react")
    return {
      ...actual,
      AccountSelectorPanel: (props: unknown) => {
        accountSelectorPanelPropsSpy(props)
        return React.createElement(actual.AccountSelectorPanel, props as never)
      },
    }
  },
)

vi.mock(
  "~/features/TokenProvisioning/components/AddTokenDialog",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/features/TokenProvisioning/components/AddTokenDialog")
      >()
    const React = await import("react")
    return {
      ...actual,
      default: (props: unknown) => {
        addTokenDialogPropsSpy(props)
        return React.createElement(actual.default, props as never)
      },
    }
  },
)

vi.mock(
  "~/features/KeyManagement/components/AccountKeyResource/AccountKeyResourceEditorDialog",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/features/KeyManagement/components/AccountKeyResource/AccountKeyResourceEditorDialog")
      >()
    const React = await import("react")

    return {
      ...actual,
      AccountKeyResourceEditorDialog: (props: unknown) => {
        accountKeyResourceEditorDialogPropsSpy(props)
        return React.createElement(
          actual.AccountKeyResourceEditorDialog,
          props as never,
        )
      },
    }
  },
)

vi.mock(
  "~/features/TokenProvisioning/components/OneTimeSecretDialog",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/features/TokenProvisioning/components/OneTimeSecretDialog")
      >()
    const React = await import("react")

    return {
      ...actual,
      OneTimeSecretDialog: (props: unknown) => {
        oneTimeSecretDialogPropsSpy(props)
        return React.createElement(actual.OneTimeSecretDialog, {
          ...(props as object),
          ...(oneTimeSecretDialogHarnessState.disableAutoCopy
            ? { autoCopy: false }
            : {}),
        } as never)
      },
    }
  },
)

vi.mock(
  "~/services/accounts/utils/apiServiceRequest",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/accounts/utils/apiServiceRequest")
      >()

    return {
      ...actual,
      createDisplayAccountApiContext: (...args: unknown[]) =>
        createDisplayAccountApiContextMock(...args),
    }
  },
)

vi.mock("~/services/productAnalytics/actions", () => ({
  resolveProductAnalyticsErrorCategoryFromError: vi.fn(() => "unknown"),
  startProductAnalyticsAction: (...args: unknown[]) =>
    startProductAnalyticsActionMock(...args),
}))

vi.mock("~/features/KeyManagement/hooks/useKeyManagement", () => ({
  useKeyManagement: (...args: unknown[]) => useKeyManagementMock(...args),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return { ...actual, sendRuntimeActionMessage: sendRuntimeActionMessageMock }
})

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/navigation")>()
  return {
    ...actual,
    replaceWithinOptionsPage: replaceWithinOptionsPageMock,
    pushWithinOptionsPage: vi.fn(),
    openModelsPage: vi.fn(),
  }
})

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/UserPreferencesContext")>()
  return {
    ...actual,
    useUserPreferencesContext: () => useUserPreferencesContextMock(),
  }
})

vi.mock(
  "~/features/ManagedSiteVerification/useNewApiManagedVerification",
  () => ({
    useNewApiManagedVerification: () => ({
      dialogState: {
        isOpen: false,
        step: "logging-in",
        request: null,
        code: "",
        isBusy: false,
      },
      setCode: vi.fn(),
      closeDialog: vi.fn(),
      openBaseUrl: vi.fn(),
      openNewApiManagedVerification: vi.fn(),
      submitCode: vi.fn(),
      retryVerification: vi.fn(),
      patchRequestConfig: vi.fn(),
    }),
  }),
)

vi.mock(
  "~/features/ManagedSiteVerification/NewApiManagedVerificationDialog",
  () => ({
    NewApiManagedVerificationDialog: () => null,
  }),
)

vi.mock(
  "~/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification",
  () => ({
    loadNewApiChannelKeyWithVerification: vi.fn(),
  }),
)

type LegacyHarnessConfig = {
  accounts: any[]
  initialSelectedAccount: string
  tokens?: any[]
  accountSummaryItems?: any[]
  tokenLoadProgress?: {
    total: number
    loaded: number
    loading: number
    error: number
  } | null
  failedAccounts?: any[]
  allAccountsFilterAccountIds?: string[]
}

let legacyHarnessConfig: LegacyHarnessConfig

function useLegacyKeyManagementHarness() {
  const [selectedAccount, setSelectedAccount] = useState(
    legacyHarnessConfig.initialSelectedAccount,
  )
  const [searchTerm, setSearchTerm] = useState("")
  const [allAccountsFilterAccountIds, setAllAccountsFilterAccountIds] =
    useState(legacyHarnessConfig.allAccountsFilterAccountIds ?? [])
  const [isAddTokenOpen, setIsAddTokenOpen] = useState(false)
  const tokens = legacyHarnessConfig.tokens ?? []

  return {
    displayData: legacyHarnessConfig.accounts,
    selectedAccount,
    setSelectedAccount,
    searchTerm,
    setSearchTerm,
    tokens,
    isLoading: false,
    visibleKeys: new Set(),
    resolvingVisibleKeys: new Set(),
    isAddTokenOpen,
    editingToken: null,
    serviceCredentials: {},
    currentAccountLoadError: undefined,
    currentAccountUnsupportedKeyManagement: false,
    tokenLoadProgress: legacyHarnessConfig.tokenLoadProgress ?? null,
    failedAccounts: legacyHarnessConfig.failedAccounts ?? [],
    accountSummaryItems: legacyHarnessConfig.accountSummaryItems ?? [],
    managedSiteTokenStatuses: {},
    isManagedSiteChannelStatusSupported: true,
    isManagedSiteStatusRefreshing: false,
    allAccountsFilterAccountIds,
    setAllAccountsFilterAccountIds,
    loadTokens: legacyLoadTokensSpy,
    entries: tokens.map((token) => ({
      id: `${token.accountId}:${token.id}`,
      runtimeKey: {
        kind: "account-token",
        accountId: token.accountId,
        accountName: token.accountName,
        token,
      },
    })),
    filteredTokens: tokens,
    filteredEntries: tokens.map((token) => ({
      id: `${token.accountId}:${token.id}`,
      runtimeKey: {
        kind: "account-token",
        accountId: token.accountId,
        accountName: token.accountName,
        token,
      },
    })),
    getVisibleTokenKey: (token: { key: string }) => token.key,
    refreshManagedSiteTokenStatuses: vi.fn(),
    refreshManagedSiteTokenStatusForToken: vi.fn(),
    confirmManagedSiteTokenStatusWithChannelKey: vi.fn(),
    copyKey: vi.fn(),
    copyServiceCredential: vi.fn(),
    rotateServiceCredential: vi.fn(),
    toggleKeyVisibility: vi.fn(),
    retryFailedAccounts: legacyRetryFailedAccountsSpy,
    handleAddToken: () => {
      legacyAddTokenSpy()
      setIsAddTokenOpen(true)
    },
    handleCloseAddToken: () => setIsAddTokenOpen(false),
    handleEditToken: vi.fn(),
    handleDeleteToken: vi.fn(),
  }
}

const createScope = (
  scopeKey: string,
  routeKey: string,
  displayName: string,
  isDefault: boolean,
) => ({ scopeKey, routeKey, displayName, isDefault })

const createFacts = (
  accountId: string,
  scopeKey: string,
  resourceId: string,
  displayName = "Native key",
) => ({
  ref: {
    accountId,
    siteType: SITE_TYPES.OPENROUTER,
    scopeKey,
    resourceId,
  },
  displayName,
  maskedLabel: "sk-or-v1-••••example",
  status: "enabled" as const,
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

const createNativeSession = ({
  scopes,
  rows = [],
  createEditor,
  deleteResource = vi.fn().mockResolvedValue(undefined),
}: {
  scopes: ReturnType<typeof createScope>[]
  rows?: ReturnType<typeof createFacts>[]
  createEditor?: any
  deleteResource?: ReturnType<typeof vi.fn>
}) => {
  const collection = {
    list: vi.fn().mockResolvedValue({ items: rows }),
    get: vi.fn(async (ref) =>
      rows.find((row) => row.ref.resourceId === ref.resourceId),
    ),
    openEditEditor: vi.fn(),
    delete: deleteResource,
  }
  const session = {
    resolveDefaultScope: vi.fn().mockResolvedValue(scopes[0]),
    listScopes: vi.fn().mockResolvedValue(scopes),
    openCollection: vi.fn().mockResolvedValue(collection),
    openCreateEditor: vi.fn().mockResolvedValue(createEditor),
  }
  return { collection, session }
}

const createOpenRouterEditor = ({
  scopes,
  destinationScopeKey,
  submit,
}: {
  scopes: ReturnType<typeof createScope>[]
  destinationScopeKey: string
  submit: ReturnType<typeof vi.fn>
}) => {
  const field = OPENROUTER_KEY_FIELD_IDS
  return {
    fields: [
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
    ],
    initialValues: {
      [field.Name]: "Created native key",
      [field.Workspace]: destinationScopeKey,
      [field.Creator]: null,
      [field.LimitMode]: OPENROUTER_KEY_LIMIT_MODES.Unlimited,
      [field.Limit]: null,
      [field.LimitReset]: OPENROUTER_KEY_LIMIT_RESETS.None,
      [field.ExpiresAt]: null,
      [field.IncludeByokInLimit]: false,
    },
    validate: vi.fn().mockReturnValue({ valid: true }),
    resolveDestinationScopeKey: () => destinationScopeKey,
    loadOptions: vi.fn().mockResolvedValue([]),
    submit,
  }
}

async function renderCreatedNativeSecret() {
  const user = userEvent.setup()
  const account = createAccount({
    id: "native-account-private-example",
    name: "Private native key name",
    siteType: SITE_TYPES.OPENROUTER,
    baseUrl: "https://native.example.invalid",
  })
  const scope = createScope(
    "workspace-private-example",
    "private-workspace-route",
    "Private workspace",
    true,
  )
  const createdFacts = createFacts(
    account.id,
    scope.scopeKey,
    "private-hash-example",
    "Private native key name",
  )
  const createdSecret = {
    correlation: {
      kind: "account-key-resource" as const,
      ref: createdFacts.ref,
    },
    displayName: createdFacts.displayName,
    secret: "one-time-private-plaintext-example",
    secretAvailability: "create-response-only" as const,
    credential: {
      accountName: account.name,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: account.baseUrl,
      siteType: account.siteType,
      tagIds: [],
    },
  }
  const createEditor = createOpenRouterEditor({
    scopes: [scope],
    destinationScopeKey: scope.scopeKey,
    submit: vi.fn().mockResolvedValue({ facts: createdFacts, createdSecret }),
  })
  const { session } = createNativeSession({ scopes: [scope], createEditor })
  createDisplayAccountApiContextMock.mockReturnValue({
    accountKeyResources: { open: vi.fn().mockResolvedValue(session) },
    request: {},
  })
  legacyHarnessConfig = {
    accounts: [account],
    initialSelectedAccount: account.id,
  }

  render(<KeyManagement routeParams={{ accountId: account.id }} />)
  await waitFor(() =>
    expect(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.addTokenButton),
    ).toBeEnabled(),
  )
  await user.click(screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.addTokenButton))
  await user.click(
    await screen.findByRole("button", {
      name: "keyManagement:openRouter.editor.actions.save",
    }),
  )
  await screen.findByRole("dialog", {
    name: "keyManagement:oneTimeKey.title",
  })

  // The assertions below are about the secret actions, not the completed create.
  startProductAnalyticsActionMock.mockClear()
  trackCompleteMock.mockClear()

  return { account, createdFacts, createdSecret, user }
}

function expectSecretActionTelemetry(
  actionId:
    | typeof PRODUCT_ANALYTICS_ACTION_IDS.CopyAccountTokenKey
    | typeof PRODUCT_ANALYTICS_ACTION_IDS.SaveAccountTokenToApiCredentialProfile,
  result: "success" | "failure",
) {
  expect(startProductAnalyticsActionMock).toHaveBeenCalledExactlyOnceWith({
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
    actionId,
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  })
  expect(trackCompleteMock).toHaveBeenCalledExactlyOnceWith(
    result === "success"
      ? PRODUCT_ANALYTICS_RESULTS.Success
      : PRODUCT_ANALYTICS_RESULTS.Failure,
    {
      ...(result === "failure"
        ? { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown }
        : {}),
      insights: {
        mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
        siteType: SITE_TYPES.OPENROUTER,
        selectedCount: 1,
      },
    },
  )

  const telemetryArguments = JSON.stringify([
    startProductAnalyticsActionMock.mock.calls,
    trackCompleteMock.mock.calls,
  ])
  for (const forbidden of [
    "one-time-private-plaintext-example",
    "native-account-private-example",
    "workspace-private-example",
    "private-workspace-route",
    "Private native key name",
    "private-hash-example",
    "private upstream detail",
  ]) {
    expect(telemetryArguments).not.toContain(forbidden)
  }
}

describe("KeyManagement native page integration", () => {
  beforeEach(() => {
    accountKeyResourceControllerOptionsSpy.mockReset()
    accountKeyResourceControllerReplaceRouteSpy.mockReset()
    accountKeyResourceEditorDialogPropsSpy.mockReset()
    accountSelectorPanelPropsSpy.mockReset()
    accountSummaryBarPropsSpy.mockReset()
    addTokenDialogPropsSpy.mockReset()
    createDisplayAccountApiContextMock.mockReset()
    createProfileFromAccountTokenMock.mockReset()
    oneTimeSecretDialogPropsSpy.mockReset()
    oneTimeSecretDialogHarnessState.disableAutoCopy = false
    replaceWithinOptionsPageMock.mockReset()
    sendRuntimeActionMessageMock.mockReset()
    startProductAnalyticsActionMock.mockReset()
    trackCompleteMock.mockReset()
    useKeyManagementMock.mockReset()
    useUserPreferencesContextMock.mockReset()
    legacyAddTokenSpy.mockReset()
    legacyLoadTokensSpy.mockReset()
    legacyLoadTokensSpy.mockResolvedValue(undefined)
    legacyRetryFailedAccountsSpy.mockReset()

    useKeyManagementMock.mockImplementation(useLegacyKeyManagementHarness)
    useUserPreferencesContextMock.mockReturnValue({
      managedSiteType: SITE_TYPES.NEW_API,
      newApiBaseUrl: "https://managed.example.invalid",
      newApiUserId: "1",
      newApiUsername: "operator",
      newApiPassword: "placeholder",
      newApiTotpSecret: "placeholder",
    })
    sendRuntimeActionMessageMock.mockResolvedValue({ success: false })
    startProductAnalyticsActionMock.mockReturnValue({
      complete: trackCompleteMock,
    })
    createProfileFromAccountTokenMock.mockResolvedValue({
      name: "Saved profile",
    })
    testI18n.addResource(
      "en",
      "keyManagement",
      "openRouter.delete.description",
      "Delete {{name}} from the remote provider permanently. This cannot be undone.",
    )
  })

  it("echoes the exact applied transition through the real controller and preserves its focus workflow until deliberate secret close", async () => {
    const user = userEvent.setup()
    const account = createAccount({
      id: "native-account",
      name: "Native account",
      siteType: SITE_TYPES.OPENROUTER,
      baseUrl: "https://native.example.invalid",
    })
    const firstScope = createScope(
      "workspace-first-id",
      "first",
      "First workspace",
      true,
    )
    const secondScope = createScope(
      "workspace-second-id",
      "second",
      "Second workspace",
      false,
    )
    const createdFacts = createFacts(
      account.id,
      secondScope.scopeKey,
      "resource-created-example",
      "Created native key",
    )
    const createdSecret = {
      correlation: {
        kind: "account-key-resource" as const,
        ref: createdFacts.ref,
      },
      displayName: createdFacts.displayName,
      secret: "one-time-secret-example",
      secretAvailability: "create-response-only" as const,
      credential: {
        accountName: account.name,
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: account.baseUrl,
        siteType: account.siteType,
        tagIds: [],
      },
    }
    const createEditor = createOpenRouterEditor({
      scopes: [firstScope, secondScope],
      destinationScopeKey: secondScope.scopeKey,
      submit: vi.fn().mockResolvedValue({
        facts: createdFacts,
        createdSecret,
      }),
    })
    const { session } = createNativeSession({
      scopes: [firstScope, secondScope],
      createEditor,
    })
    createDisplayAccountApiContextMock.mockReturnValue({
      accountKeyResources: { open: vi.fn().mockResolvedValue(session) },
      request: {},
    })
    legacyHarnessConfig = {
      accounts: [account],
      initialSelectedAccount: account.id,
    }

    function RouteHarness() {
      const [routeParams, setRouteParams] = useState<Record<string, string>>({
        accountId: account.id,
        workspace: firstScope.routeKey,
      })
      replaceWithinOptionsPageMock.mockImplementation(
        (_hash: string, params?: Record<string, string>) => {
          if (params) queueMicrotask(() => setRouteParams(params))
        },
      )
      return <KeyManagement routeParams={routeParams} />
    }

    render(<RouteHarness />)

    await waitFor(() =>
      expect(
        screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.addTokenButton),
      ).toBeEnabled(),
    )
    await user.click(screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.addTokenButton))
    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:openRouter.editor.actions.save",
      }),
    )

    await waitFor(() =>
      expect(
        accountKeyResourceControllerReplaceRouteSpy.mock.calls.some(
          ([params, transition]) =>
            params.workspace === secondScope.routeKey && transition,
        ),
      ).toBe(true),
    )
    const [, requestedTransition] =
      accountKeyResourceControllerReplaceRouteSpy.mock.calls.find(
        ([params, transition]) =>
          params.workspace === secondScope.routeKey && transition,
      ) ?? []
    expect(requestedTransition).toBeDefined()
    const echoedOptions = accountKeyResourceControllerOptionsSpy.mock.calls
      .map(([options]) => options as any)
      .find(
        (options) =>
          options.routeParams?.workspace === secondScope.routeKey &&
          options.routeTransition,
      )
    expect(echoedOptions?.routeTransition).toBe(requestedTransition)

    await waitFor(() =>
      expect(
        oneTimeSecretDialogPropsSpy.mock.calls.some(
          ([props]) => (props as any).isOpen,
        ),
      ).toBe(true),
    )
    await screen.findByRole("dialog", {
      name: "keyManagement:oneTimeKey.title",
    })

    const editorWorkflowProps =
      accountKeyResourceEditorDialogPropsSpy.mock.calls
        .map(([props]) => props as any)
        .find((props) => props.focusWorkflowId)
    const secretWorkflowProps = oneTimeSecretDialogPropsSpy.mock.calls
      .map(([props]) => props as any)
      .find((props) => props.isOpen)
    expect(editorWorkflowProps?.focusWorkflowId).toMatch(
      /^account-key-resource-editor-/,
    )
    expect(secretWorkflowProps?.focusWorkflowId).toBe(
      editorWorkflowProps?.focusWorkflowId,
    )
    expect(editorWorkflowProps?.onTerminalCloseSettled).toEqual(
      expect.any(Function),
    )
    expect(secretWorkflowProps?.result).toBe(createdSecret)

    await waitFor(() =>
      expect(oneTimeSecretDialogPropsSpy.mock.lastCall?.[0]).toMatchObject({
        isOpen: true,
        result: createdSecret,
      }),
    )
    act(() => (oneTimeSecretDialogPropsSpy.mock.lastCall?.[0] as any).onClose())
    await waitFor(() =>
      expect(oneTimeSecretDialogPropsSpy.mock.lastCall?.[0]).toMatchObject({
        isOpen: false,
        result: null,
      }),
    )
  })

  it.each([
    { operation: "copy", outcome: "success" },
    { operation: "copy", outcome: "failure" },
    { operation: "save", outcome: "success" },
    { operation: "save", outcome: "failure" },
  ] as const)(
    "wires the real one-time $operation $outcome outcome to exactly one native action span",
    async ({ operation, outcome }) => {
      oneTimeSecretDialogHarnessState.disableAutoCopy = true
      const clipboardWrite = vi.fn()
      if (operation === "copy") {
        clipboardWrite.mockImplementation(() =>
          outcome === "success"
            ? Promise.resolve()
            : Promise.reject(new Error("private upstream detail")),
        )
      } else {
        createProfileFromAccountTokenMock.mockImplementation(() =>
          outcome === "success"
            ? Promise.resolve({ name: "Saved profile" })
            : Promise.reject(new Error("private upstream detail")),
        )
      }
      const { user } = await renderCreatedNativeSecret()

      if (operation === "copy") {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: { writeText: clipboardWrite },
        })
        await user.click(
          screen.getByRole("button", {
            name: "keyManagement:oneTimeKey.copy",
          }),
        )
      } else {
        await user.click(
          screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeySaveButton),
        )
      }

      await waitFor(() => expect(trackCompleteMock).toHaveBeenCalledTimes(1))
      expectSecretActionTelemetry(
        operation === "copy"
          ? PRODUCT_ANALYTICS_ACTION_IDS.CopyAccountTokenKey
          : PRODUCT_ANALYTICS_ACTION_IDS.SaveAccountTokenToApiCredentialProfile,
        outcome,
      )
    },
  )

  it("deliberately cancels then confirms an unhandled secret close without recording a copy/save action or retaining dialog contents", async () => {
    oneTimeSecretDialogHarnessState.disableAutoCopy = true
    const { createdSecret, user } = await renderCreatedNativeSecret()

    await user.click(
      screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyCloseButton),
    )
    const closeConfirmation = await screen.findByRole("dialog", {
      name: "keyManagement:oneTimeKey.closeConfirm.title",
    })
    await user.click(
      within(closeConfirmation).getByRole("button", {
        name: "keyManagement:oneTimeKey.closeConfirm.cancel",
      }),
    )
    expect(screen.getByDisplayValue(createdSecret.secret)).toBeInTheDocument()
    expect(startProductAnalyticsActionMock).not.toHaveBeenCalled()
    expect(trackCompleteMock).not.toHaveBeenCalled()

    await user.click(
      screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyCloseButton),
    )
    await user.click(
      await screen.findByTestId(
        TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyConfirmCloseButton,
      ),
    )

    await waitFor(() =>
      expect(
        screen.queryByDisplayValue(createdSecret.secret),
      ).not.toBeInTheDocument(),
    )
    expect(startProductAnalyticsActionMock).not.toHaveBeenCalled()
    expect(trackCompleteMock).not.toHaveBeenCalled()
  })

  it("echoes a native route transition only when its requested route is applied", async () => {
    const user = userEvent.setup()
    const account = createAccount({
      id: "native-account",
      name: "Native account",
      siteType: SITE_TYPES.OPENROUTER,
      baseUrl: "https://native.example.invalid",
    })
    const firstScope = createScope(
      "workspace-first-id",
      "first",
      "First workspace",
      true,
    )
    const secondScope = createScope(
      "workspace-second-id",
      "second",
      "Second workspace",
      false,
    )
    const createdFacts = createFacts(
      account.id,
      secondScope.scopeKey,
      "resource-created-example",
      "Created native key",
    )
    const createdSecret = {
      correlation: {
        kind: "account-key-resource" as const,
        ref: createdFacts.ref,
      },
      displayName: createdFacts.displayName,
      secret: "one-time-secret-example",
      secretAvailability: "create-response-only" as const,
      credential: {
        accountName: account.name,
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: account.baseUrl,
        siteType: account.siteType,
        tagIds: [],
      },
    }
    const createEditor = createOpenRouterEditor({
      scopes: [firstScope, secondScope],
      destinationScopeKey: secondScope.scopeKey,
      submit: vi.fn().mockResolvedValue({
        facts: createdFacts,
        createdSecret,
      }),
    })
    const { session } = createNativeSession({
      scopes: [firstScope, secondScope],
      createEditor,
    })
    createDisplayAccountApiContextMock.mockReturnValue({
      accountKeyResources: { open: vi.fn().mockResolvedValue(session) },
      request: {},
    })
    legacyHarnessConfig = {
      accounts: [account],
      initialSelectedAccount: account.id,
    }

    let applyRoute!: (params: Record<string, string>) => void
    let pendingTransitionRoute: Record<string, string> | undefined
    function RouteHarness() {
      const [routeParams, setRouteParams] = useState<Record<string, string>>({
        accountId: account.id,
        workspace: firstScope.routeKey,
      })
      applyRoute = setRouteParams
      return <KeyManagement routeParams={routeParams} />
    }
    replaceWithinOptionsPageMock.mockImplementation(
      (_hash: string, params?: Record<string, string>) => {
        if (params?.workspace === secondScope.routeKey) {
          pendingTransitionRoute = params
        }
      },
    )

    render(<RouteHarness />)

    await waitFor(() =>
      expect(
        screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.addTokenButton),
      ).toBeEnabled(),
    )
    await user.click(screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.addTokenButton))
    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:openRouter.editor.actions.save",
      }),
    )
    await waitFor(() =>
      expect(pendingTransitionRoute).toEqual({
        accountId: account.id,
        workspace: secondScope.routeKey,
      }),
    )

    const pendingTransition = accountKeyResourceControllerOptionsSpy.mock.calls
      .map(([options]) => (options as any).routeTransition)
      .find(Boolean) as AccountKeyResourceRouteTransition | undefined
    expect(pendingTransition).toBeUndefined()

    act(() =>
      applyRoute({
        ...pendingTransitionRoute!,
        unrelated: "must-not-acknowledge",
      }),
    )
    await waitFor(() =>
      expect(
        (accountKeyResourceControllerOptionsSpy.mock.lastCall?.[0] as any)
          .routeParams,
      ).toEqual({
        ...pendingTransitionRoute,
        unrelated: "must-not-acknowledge",
      }),
    )
    expect(
      (accountKeyResourceControllerOptionsSpy.mock.lastCall?.[0] as any)
        .routeTransition,
    ).toBeUndefined()
    await waitFor(() =>
      expect(oneTimeSecretDialogPropsSpy.mock.lastCall?.[0]).toMatchObject({
        isOpen: false,
        result: null,
      }),
    )
    act(() => applyRoute(pendingTransitionRoute!))

    await waitFor(() =>
      expect(
        (accountKeyResourceControllerOptionsSpy.mock.lastCall?.[0] as any)
          .routeParams,
      ).toEqual(pendingTransitionRoute),
    )
    expect(
      (accountKeyResourceControllerOptionsSpy.mock.lastCall?.[0] as any)
        .routeTransition,
    ).toBeUndefined()
  })

  it("publishes settled native accounts incrementally with honest per-account summary counts", async () => {
    const loadedAccount = createAccount({
      id: "native-loaded-account",
      name: "Loaded native account",
      siteType: SITE_TYPES.OPENROUTER,
      baseUrl: "https://loaded.example.invalid",
    })
    const emptyAccount = createAccount({
      id: "native-empty-account",
      name: "Empty native account",
      siteType: SITE_TYPES.OPENROUTER,
      baseUrl: "https://empty.example.invalid",
    })
    const failedAccount = createAccount({
      id: "native-failed-account",
      name: "Failed native account",
      siteType: SITE_TYPES.OPENROUTER,
      baseUrl: "https://failed.example.invalid",
    })
    const scope = createScope(
      "workspace-example-id",
      "default",
      "Default workspace",
      true,
    )
    const loadedList = deferred<{ items: ReturnType<typeof createFacts>[] }>()
    const emptyList = deferred<{ items: ReturnType<typeof createFacts>[] }>()
    const failedList = deferred<{ items: ReturnType<typeof createFacts>[] }>()
    const lists = new Map([
      [loadedAccount.id, loadedList],
      [emptyAccount.id, emptyList],
      [failedAccount.id, failedList],
    ])
    createDisplayAccountApiContextMock.mockImplementation((account: any) => ({
      accountKeyResources: {
        open: vi.fn().mockResolvedValue({
          resolveDefaultScope: vi.fn().mockResolvedValue(scope),
          openCollection: vi.fn().mockResolvedValue({
            list: vi.fn(() => lists.get(account.id)!.promise),
          }),
        }),
      },
      request: {},
    }))
    legacyHarnessConfig = {
      accounts: [loadedAccount, emptyAccount, failedAccount],
      initialSelectedAccount: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
      accountSummaryItems: [
        { accountId: loadedAccount.id, name: loadedAccount.name, count: 0 },
        { accountId: emptyAccount.id, name: emptyAccount.name, count: 0 },
        { accountId: failedAccount.id, name: failedAccount.name, count: 0 },
      ],
    }

    render(
      <KeyManagement
        routeParams={{ accountId: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE }}
      />,
    )

    await waitFor(() =>
      expect(accountSummaryBarPropsSpy.mock.lastCall?.[0]).toMatchObject({
        items: expect.arrayContaining([
          expect.objectContaining({ accountId: loadedAccount.id, count: null }),
          expect.objectContaining({ accountId: emptyAccount.id, count: null }),
          expect.objectContaining({ accountId: failedAccount.id, count: null }),
        ]),
      }),
    )

    act(() =>
      loadedList.resolve({
        items: [
          createFacts(
            loadedAccount.id,
            scope.scopeKey,
            "resource-loaded",
            "Incrementally visible native key",
          ),
        ],
      }),
    )
    await waitFor(() =>
      expect(
        screen.getByText("Incrementally visible native key"),
      ).toBeVisible(),
    )
    expect(accountSummaryBarPropsSpy.mock.lastCall?.[0]).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ accountId: loadedAccount.id, count: 1 }),
        expect.objectContaining({ accountId: emptyAccount.id, count: null }),
        expect.objectContaining({ accountId: failedAccount.id, count: null }),
      ]),
    })

    act(() => emptyList.resolve({ items: [] }))
    await waitFor(() =>
      expect(accountSummaryBarPropsSpy.mock.lastCall?.[0]).toMatchObject({
        items: expect.arrayContaining([
          expect.objectContaining({ accountId: emptyAccount.id, count: 0 }),
        ]),
      }),
    )

    act(() => failedList.reject(new Error("failed")))
    await waitFor(() =>
      expect(accountSummaryBarPropsSpy.mock.lastCall?.[0]).toMatchObject({
        items: expect.arrayContaining([
          expect.objectContaining({ accountId: loadedAccount.id, count: 1 }),
          expect.objectContaining({
            accountId: failedAccount.id,
            count: null,
            errorType: "load-failed",
          }),
        ]),
      }),
    )
    expect(screen.getByText("Incrementally visible native key")).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: "keyManagement:actions.retryFailed",
      }),
    ).toBeEnabled()
  })

  it("routes Add exclusively to the native editor for an empty native account and suppresses legacy managed actions", async () => {
    const user = userEvent.setup()
    const account = createAccount({
      id: "native-account",
      name: "Native account",
      siteType: SITE_TYPES.OPENROUTER,
      baseUrl: "https://native.example.invalid",
    })
    const scope = createScope(
      "workspace-example-id",
      "default",
      "Default workspace",
      true,
    )
    const createEditor = createOpenRouterEditor({
      scopes: [scope],
      destinationScopeKey: scope.scopeKey,
      submit: vi.fn(),
    })
    const { session } = createNativeSession({
      scopes: [scope],
      createEditor,
    })
    createDisplayAccountApiContextMock.mockReturnValue({
      accountKeyResources: { open: vi.fn().mockResolvedValue(session) },
      request: {},
    })
    legacyHarnessConfig = {
      accounts: [account],
      initialSelectedAccount: account.id,
    }

    render(
      <KeyManagement
        routeParams={{ accountId: account.id, workspace: scope.routeKey }}
      />,
    )

    const addButton = await screen.findByTestId(
      KEY_MANAGEMENT_TEST_IDS.addTokenButton,
    )
    await waitFor(() => expect(addButton).toBeEnabled())
    expect(
      screen.queryByText("keyManagement:managedSiteStatus.pageUnsupported"),
    ).toBeNull()
    expect(
      screen.queryByTestId(
        KEY_MANAGEMENT_TEST_IDS.openSelectedAccountModelsButton,
      ),
    ).toBeNull()
    expect(
      screen.queryByRole("button", {
        name: "keyManagement:repairMissingKeys.action",
      }),
    ).toBeNull()
    expect(
      screen.queryByRole("button", {
        name: "keyManagement:managedSiteStatus.actions.refresh",
      }),
    ).toBeNull()

    await user.click(addButton)

    await waitFor(() =>
      expect(session.openCreateEditor).toHaveBeenCalledTimes(1),
    )
    expect(legacyAddTokenSpy).not.toHaveBeenCalled()
    expect(addTokenDialogPropsSpy.mock.lastCall?.[0]).toMatchObject({
      isOpen: false,
    })
  })

  it("keeps the default workspace usable while exposing and retrying a partial workspace inventory", async () => {
    const user = userEvent.setup()
    const account = createAccount({
      id: "native-account",
      name: "Native account",
      siteType: SITE_TYPES.OPENROUTER,
      baseUrl: "https://native.example.invalid",
    })
    const defaultScope = {
      ...createScope(
        "workspace-default-id",
        "default",
        "Default workspace",
        true,
      ),
      secondaryLabel: "Workspace owner",
    }
    const teamScope = {
      ...createScope("workspace-team-id", "team", "Team workspace", false),
      secondaryLabel: "Team member",
    }
    const facts = createFacts(
      account.id,
      defaultScope.scopeKey,
      "opaque-resource-example",
    )
    const { collection, session } = createNativeSession({
      scopes: [defaultScope],
      rows: [facts],
    })
    const listScopeInventory = vi.fn().mockResolvedValue({
      scopes: [defaultScope],
      partialFailure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
      },
    })
    const refreshScopeInventory = vi.fn().mockResolvedValue({
      scopes: [defaultScope, teamScope],
    })
    Object.assign(session, { listScopeInventory, refreshScopeInventory })
    const open = vi.fn().mockResolvedValue(session)
    createDisplayAccountApiContextMock.mockReturnValue({
      accountKeyResources: { open },
      request: {},
    })
    legacyHarnessConfig = {
      accounts: [account],
      initialSelectedAccount: account.id,
    }

    render(
      <KeyManagement
        routeParams={{
          accountId: account.id,
          workspace: defaultScope.routeKey,
        }}
      />,
    )

    expect(
      await screen.findByText("keyManagement:openRouter.workspace.partial"),
    ).toBeVisible()
    expect(screen.getByText(facts.displayName)).toBeVisible()
    const selector = screen.getByRole("combobox", {
      name: "keyManagement:openRouter.workspace.label",
    })
    expect(selector).toBeEnabled()
    await user.click(selector)
    const defaultOption = await screen.findByRole("option", {
      name: /Default workspace/,
    })
    expect(defaultOption).toHaveTextContent("Workspace owner")
    await user.click(defaultOption)

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:openRouter.workspace.retry",
      }),
    )

    await waitFor(() => expect(refreshScopeInventory).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(
        screen.queryByText("keyManagement:openRouter.workspace.partial"),
      ).toBeNull(),
    )
    expect(screen.getByText(facts.displayName)).toBeVisible()
    expect(open).toHaveBeenCalledOnce()
    expect(collection.list).toHaveBeenCalledOnce()
  })

  it("routes Add exclusively to the legacy dialog for a legacy account", async () => {
    const user = userEvent.setup()
    const account = createAccount({
      id: "legacy-account",
      name: "Legacy account",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://legacy.example.invalid",
    })
    createDisplayAccountApiContextMock.mockReturnValue({ request: {} })
    legacyHarnessConfig = {
      accounts: [account],
      initialSelectedAccount: account.id,
    }

    render(<KeyManagement routeParams={{ accountId: account.id }} />)

    const addButton = await screen.findByTestId(
      KEY_MANAGEMENT_TEST_IDS.addTokenButton,
    )
    expect(addButton).toBeEnabled()
    await user.click(addButton)

    expect(legacyAddTokenSpy).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(addTokenDialogPropsSpy.mock.lastCall?.[0]).toMatchObject({
        isOpen: true,
        preSelectedAccountId: account.id,
      }),
    )
    expect(
      accountKeyResourceEditorDialogPropsSpy.mock.lastCall?.[0],
    ).toMatchObject({
      editor: null,
    })
  })

  it("keeps filtered-all native scope non-creatable and never opens both add flows", async () => {
    const user = userEvent.setup()
    const account = createAccount({
      id: "native-account",
      name: "Native account",
      siteType: SITE_TYPES.OPENROUTER,
      baseUrl: "https://native.example.invalid",
    })
    const scope = createScope(
      "workspace-example-id",
      "default",
      "Default workspace",
      true,
    )
    const { session } = createNativeSession({ scopes: [scope] })
    createDisplayAccountApiContextMock.mockReturnValue({
      accountKeyResources: { open: vi.fn().mockResolvedValue(session) },
      request: {},
    })
    legacyHarnessConfig = {
      accounts: [account],
      initialSelectedAccount: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
      allAccountsFilterAccountIds: [account.id],
    }

    render(
      <KeyManagement
        routeParams={{ accountId: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE }}
      />,
    )

    const addButton = await screen.findByTestId(
      KEY_MANAGEMENT_TEST_IDS.addTokenButton,
    )
    await waitFor(() => expect(addButton).toBeDisabled())
    await user.click(addButton)

    expect(session.openCreateEditor).not.toHaveBeenCalled()
    expect(legacyAddTokenSpy).not.toHaveBeenCalled()
    expect(addTokenDialogPropsSpy.mock.lastCall?.[0]).toMatchObject({
      isOpen: false,
      preSelectedAccountId: null,
    })
  })

  it("keeps Add disabled when the selected native scope cannot be loaded", async () => {
    const user = userEvent.setup()
    const account = createAccount({
      id: "native-account",
      name: "Native account",
      siteType: SITE_TYPES.OPENROUTER,
      baseUrl: "https://native.example.invalid",
    })
    const open = vi.fn().mockRejectedValue(
      new AccountKeyResourceError({
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.AuthenticationFailed,
      }),
    )
    createDisplayAccountApiContextMock.mockReturnValue({
      accountKeyResources: { open },
      request: {},
    })
    legacyHarnessConfig = {
      accounts: [account],
      initialSelectedAccount: account.id,
    }

    render(<KeyManagement routeParams={{ accountId: account.id }} />)

    await waitFor(() => expect(open).toHaveBeenCalledTimes(1))
    const addButton = screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.addTokenButton)
    expect(addButton).toBeDisabled()
    await user.click(addButton)
    expect(legacyAddTokenSpy).not.toHaveBeenCalled()
    expect(
      accountKeyResourceEditorDialogPropsSpy.mock.lastCall?.[0],
    ).toMatchObject({
      editor: null,
    })
  })

  it("retries a terminal native load from the workspace error and restores its rows", async () => {
    const user = userEvent.setup()
    const account = createAccount({
      id: "native-retry-account",
      name: "Native retry account",
      siteType: SITE_TYPES.OPENROUTER,
      baseUrl: "https://native-retry.example.invalid",
    })
    const scope = createScope(
      "workspace-retry-id",
      "retry-workspace",
      "Retry workspace",
      true,
    )
    const facts = createFacts(
      account.id,
      scope.scopeKey,
      "retry-resource-example",
      "Recovered native key",
    )
    const { session } = createNativeSession({ scopes: [scope], rows: [facts] })
    const open = vi
      .fn()
      .mockRejectedValueOnce(
        new AccountKeyResourceError({
          code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.AuthenticationFailed,
        }),
      )
      .mockResolvedValueOnce(session)
    createDisplayAccountApiContextMock.mockReturnValue({
      accountKeyResources: { open },
      request: {},
    })
    legacyHarnessConfig = {
      accounts: [account],
      initialSelectedAccount: account.id,
    }

    render(<KeyManagement routeParams={{ accountId: account.id }} />)

    await waitFor(() => expect(open).toHaveBeenCalledOnce())
    const workspaceSection = screen
      .getByRole("heading", {
        name: "keyManagement:openRouter.workspace.heading",
      })
      .closest("section")
    expect(workspaceSection).not.toBeNull()
    const workspace = within(workspaceSection!)
    expect(
      await workspace.findByText("keyManagement:openRouter.workspace.error"),
    ).toBeVisible()

    await user.click(
      workspace.getByRole("button", {
        name: "keyManagement:openRouter.workspace.retry",
      }),
    )

    await waitFor(() => expect(open).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(
        workspace.queryByText("keyManagement:openRouter.workspace.error"),
      ).toBeNull(),
    )
    expect(screen.getByText(facts.displayName)).toBeVisible()
    expect(
      screen.getByRole("combobox", {
        name: "keyManagement:openRouter.workspace.label",
      }),
    ).toBeEnabled()
  })

  it("clears workspace routing when switching from a native account to another account or all accounts", async () => {
    const user = userEvent.setup()
    const nativeAccount = createAccount({
      id: "native-account",
      name: "Native account",
      siteType: SITE_TYPES.OPENROUTER,
      baseUrl: "https://native.example.invalid",
    })
    const legacyAccount = createAccount({
      id: "legacy-account",
      name: "Legacy account",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://legacy.example.invalid",
    })
    const scope = createScope(
      "workspace-example-id",
      "default",
      "Default workspace",
      true,
    )
    const { session } = createNativeSession({ scopes: [scope] })
    createDisplayAccountApiContextMock.mockImplementation((account: any) => ({
      ...(account.siteType === SITE_TYPES.OPENROUTER
        ? { accountKeyResources: { open: vi.fn().mockResolvedValue(session) } }
        : {}),
      request: {},
    }))
    legacyHarnessConfig = {
      accounts: [nativeAccount, legacyAccount],
      initialSelectedAccount: nativeAccount.id,
    }

    render(
      <KeyManagement
        routeParams={{
          accountId: nativeAccount.id,
          workspace: scope.routeKey,
        }}
      />,
    )

    const accountSelect = await screen.findByTestId(
      KEY_MANAGEMENT_TEST_IDS.accountScopeSelect,
    )
    await user.click(accountSelect)
    await user.click(
      await screen.findByRole("option", { name: legacyAccount.name }),
    )
    expect(replaceWithinOptionsPageMock).toHaveBeenLastCalledWith("#keys", {
      accountId: legacyAccount.id,
    })

    await user.click(accountSelect)
    await user.click(
      await screen.findByTestId(KEY_MANAGEMENT_TEST_IDS.accountScopeAllOption),
    )
    expect(replaceWithinOptionsPageMock).toHaveBeenLastCalledWith("#keys", {
      accountId: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
    })
  })

  it("shows enabled native rows after a single-account status filter is hidden in all-account mode", async () => {
    const user = userEvent.setup()
    const nativeAccount = createAccount({
      id: "native-filter-account",
      name: "Native filter account",
      siteType: SITE_TYPES.OPENROUTER,
      baseUrl: "https://native-filter.example.invalid",
    })
    const scope = createScope(
      "workspace-filter-id",
      "filter",
      "Filter workspace",
      true,
    )
    const enabledRow = createFacts(
      nativeAccount.id,
      scope.scopeKey,
      "resource-enabled",
      "Enabled native key",
    )
    const disabledRow = {
      ...createFacts(
        nativeAccount.id,
        scope.scopeKey,
        "resource-disabled",
        "Disabled native key",
      ),
      status: "disabled" as const,
    }
    const { session } = createNativeSession({
      scopes: [scope],
      rows: [enabledRow, disabledRow] as any,
    })
    createDisplayAccountApiContextMock.mockReturnValue({
      accountKeyResources: { open: vi.fn().mockResolvedValue(session) },
      request: {},
    })
    legacyHarnessConfig = {
      accounts: [nativeAccount],
      initialSelectedAccount: nativeAccount.id,
    }

    render(<KeyManagement routeParams={{ accountId: nativeAccount.id }} />)

    const statusFilter = await screen.findByRole("combobox", {
      name: "keyManagement:openRouter.list.statusFilter.label",
    })
    await waitFor(() =>
      expect(screen.getByText(enabledRow.displayName)).toBeVisible(),
    )
    await user.click(statusFilter)
    await user.click(
      await screen.findByRole("option", {
        name: "keyManagement:openRouter.list.status.disabled",
      }),
    )
    await waitFor(() =>
      expect(screen.queryByText(enabledRow.displayName)).toBeNull(),
    )
    expect(screen.getByText(disabledRow.displayName)).toBeVisible()

    const accountSelect = screen.getByTestId(
      KEY_MANAGEMENT_TEST_IDS.accountScopeSelect,
    )
    await user.click(accountSelect)
    await user.click(
      await screen.findByTestId(KEY_MANAGEMENT_TEST_IDS.accountScopeAllOption),
    )

    await waitFor(() =>
      expect(screen.getByText(enabledRow.displayName)).toBeVisible(),
    )
    expect(screen.getByText(disabledRow.displayName)).toBeVisible()
    expect(
      screen.queryByRole("combobox", {
        name: "keyManagement:openRouter.list.statusFilter.label",
      }),
    ).toBeNull()
    expect(
      (accountKeyResourceControllerOptionsSpy.mock.lastCall?.[0] as any)
        .selectedAccount,
    ).toBe(KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE)
  })

  it("integrates native rows, counts, progress, partial failures, and retry into the all-account page", async () => {
    const user = userEvent.setup()
    const nativeAccount = createAccount({
      id: "native-account",
      name: "Native account",
      siteType: SITE_TYPES.OPENROUTER,
      baseUrl: "https://native.example.invalid",
    })
    const failedNativeAccount = createAccount({
      id: "failed-native-account",
      name: "Failed native account",
      siteType: SITE_TYPES.OPENROUTER,
      baseUrl: "https://failed-native.example.invalid",
    })
    const legacyAccount = createAccount({
      id: "legacy-account",
      name: "Legacy account",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://legacy.example.invalid",
    })
    const scope = createScope(
      "workspace-example-id",
      "default",
      "Default workspace",
      true,
    )
    const nativeRows = [
      createFacts(
        nativeAccount.id,
        scope.scopeKey,
        "resource-one",
        "Native one",
      ),
      createFacts(
        nativeAccount.id,
        scope.scopeKey,
        "resource-two",
        "Native two",
      ),
    ]
    const successful = createNativeSession({
      scopes: [scope],
      rows: nativeRows,
    })
    const recovered = createNativeSession({ scopes: [scope], rows: [] })
    const successfulOpen = vi.fn().mockResolvedValue(successful.session)
    const failedOpen = vi
      .fn()
      .mockRejectedValueOnce(
        new AccountKeyResourceError({
          code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
        }),
      )
      .mockResolvedValue(recovered.session)
    createDisplayAccountApiContextMock.mockImplementation((account: any) => ({
      ...(account.id === nativeAccount.id
        ? { accountKeyResources: { open: successfulOpen } }
        : account.id === failedNativeAccount.id
          ? { accountKeyResources: { open: failedOpen } }
          : {}),
      request: {},
    }))
    const legacyToken = createToken({
      id: 1,
      name: "Legacy key",
      accountId: legacyAccount.id,
      accountName: legacyAccount.name,
    })
    legacyHarnessConfig = {
      accounts: [nativeAccount, failedNativeAccount, legacyAccount],
      initialSelectedAccount: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
      tokens: [legacyToken],
      accountSummaryItems: [
        {
          accountId: legacyAccount.id,
          name: legacyAccount.name,
          count: 1,
        },
      ],
      tokenLoadProgress: { total: 1, loaded: 1, loading: 0, error: 0 },
    }

    render(
      <KeyManagement
        routeParams={{ accountId: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE }}
      />,
    )

    await waitFor(() => expect(failedOpen).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(accountSummaryBarPropsSpy.mock.lastCall?.[0]).toMatchObject({
        items: expect.arrayContaining([
          expect.objectContaining({
            accountId: legacyAccount.id,
            count: 1,
          }),
          expect.objectContaining({
            accountId: nativeAccount.id,
            count: 2,
          }),
          expect.objectContaining({
            accountId: failedNativeAccount.id,
            count: null,
            errorType: "load-failed",
          }),
        ]),
      }),
    )
    expect(accountSelectorPanelPropsSpy.mock.lastCall?.[0]).toMatchObject({
      tokens: [legacyToken],
      nativeRows: expect.arrayContaining([
        expect.objectContaining({ accountId: nativeAccount.id }),
        expect.objectContaining({ accountId: nativeAccount.id }),
      ]),
      failedAccounts: [
        {
          accountId: failedNativeAccount.id,
          accountName: failedNativeAccount.name,
        },
      ],
      tokenLoadProgress: {
        total: 3,
        loaded: 2,
        loading: 0,
        error: 1,
      },
      aggregateCounts: {
        total: null,
        enabled: null,
        showing: null,
        knownTotal: 3,
        knownEnabled: 3,
        knownShowing: 3,
      },
    })

    act(() => {
      accountSummaryBarPropsSpy.mock.lastCall?.[0].onAccountClick(
        nativeAccount.id,
      )
    })
    await waitFor(() =>
      expect(accountSelectorPanelPropsSpy.mock.lastCall?.[0]).toMatchObject({
        aggregateCounts: {
          total: 3,
          enabled: 3,
          showing: 3,
          knownTotal: 3,
          knownEnabled: 3,
          knownShowing: 3,
        },
      }),
    )
    act(() => {
      accountSummaryBarPropsSpy.mock.lastCall?.[0].onAccountClick(
        nativeAccount.id,
      )
    })
    await waitFor(() =>
      expect(
        accountSelectorPanelPropsSpy.mock.lastCall?.[0].aggregateCounts.total,
      ).toBeNull(),
    )
    expect(screen.getAllByText(nativeAccount.name).length).toBeGreaterThan(0)
    expect(
      screen.getAllByText(failedNativeAccount.name).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getByText("keyManagement:accountSummary.loadFailed"),
    ).toBeVisible()

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.retryFailed",
      }),
    )
    await waitFor(() => expect(failedOpen).toHaveBeenCalledTimes(2))
    expect(legacyRetryFailedAccountsSpy).toHaveBeenCalledTimes(1)

    await user.click(
      screen.getAllByRole("button", {
        name: "keyManagement:actions.detailsFor",
      })[0],
    )
    expect(screen.getByText("keyManagement:details.empty")).toBeVisible()
    expect(successful.collection.get).not.toHaveBeenCalled()

    await user.type(
      screen.getByPlaceholderText("keyManagement:searchPlaceholder"),
      "Native one",
    )
    await waitFor(() =>
      expect(accountSummaryBarPropsSpy.mock.lastCall?.[0]).toMatchObject({
        items: expect.arrayContaining([
          expect.objectContaining({
            accountId: nativeAccount.id,
            count: 1,
          }),
        ]),
      }),
    )
  })

  it("shows a retryable failure instead of an empty inventory when the selected native account load fails", async () => {
    const nativeAccount = createAccount({
      id: "native-failed-account",
      name: "Failed native account",
      siteType: SITE_TYPES.OPENROUTER,
      baseUrl: "https://native-failed.example.invalid",
    })
    const openResources = vi.fn().mockRejectedValue(
      new AccountKeyResourceError({
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
      }),
    )
    createDisplayAccountApiContextMock.mockReturnValue({
      accountKeyResources: { open: openResources },
      request: {},
    })
    legacyHarnessConfig = {
      accounts: [nativeAccount],
      initialSelectedAccount: nativeAccount.id,
    }

    render(<KeyManagement routeParams={{ accountId: nativeAccount.id }} />)

    expect(
      await screen.findByText("keyManagement:loadError.title"),
    ).toBeVisible()
    expect(screen.queryByText("keyManagement:noKeys")).toBeNull()
    expect(screen.queryByText("keyManagement:createFirstKey")).toBeNull()
    expect(
      screen
        .getAllByRole("button", {
          name: "keyManagement:refreshTokenList",
        })
        .some((button) => !button.hasAttribute("disabled")),
    ).toBe(true)
  })

  it("keeps an all-account partial native failure distinct from a proven empty inventory", async () => {
    const loadedAccount = createAccount({
      id: "native-loaded-empty-account",
      name: "Loaded empty native account",
      siteType: SITE_TYPES.OPENROUTER,
      baseUrl: "https://native-loaded.example.invalid",
    })
    const failedAccount = createAccount({
      id: "native-unknown-account",
      name: "Unknown native account",
      siteType: SITE_TYPES.OPENROUTER,
      baseUrl: "https://native-unknown.example.invalid",
    })
    const scope = createScope(
      "workspace-example-id",
      "default",
      "Default workspace",
      true,
    )
    const loaded = createNativeSession({ scopes: [scope], rows: [] })
    createDisplayAccountApiContextMock.mockImplementation((account: any) => ({
      accountKeyResources: {
        open:
          account.id === loadedAccount.id
            ? vi.fn().mockResolvedValue(loaded.session)
            : vi.fn().mockRejectedValue(
                new AccountKeyResourceError({
                  code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
                }),
              ),
      },
      request: {},
    }))
    legacyHarnessConfig = {
      accounts: [loadedAccount, failedAccount],
      initialSelectedAccount: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
    }

    render(
      <KeyManagement
        routeParams={{ accountId: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE }}
      />,
    )

    expect(
      await screen.findByText("keyManagement:loadError.title"),
    ).toBeVisible()
    expect(screen.queryByText("keyManagement:noKeys")).toBeNull()
    expect(screen.queryByText("keyManagement:createFirstKey")).toBeNull()
    expect(
      screen.getAllByRole("button", {
        name: "keyManagement:refreshTokenList",
      }).length,
    ).toBeGreaterThan(0)
  })

  it("disables Header refresh while the native inventory is loading", async () => {
    const nativeAccount = createAccount({
      id: "native-loading-account",
      name: "Native loading account",
      siteType: SITE_TYPES.OPENROUTER,
      baseUrl: "https://native-loading.example.invalid",
    })
    const scope = createScope(
      "workspace-loading-id",
      "loading",
      "Loading workspace",
      true,
    )
    const { session } = createNativeSession({ scopes: [scope] })
    let resolveOpen!: (value: typeof session) => void
    const pendingOpen = new Promise<typeof session>((resolve) => {
      resolveOpen = resolve
    })
    const openResources = vi.fn(() => pendingOpen)
    createDisplayAccountApiContextMock.mockReturnValue({
      accountKeyResources: { open: openResources },
      request: {},
    })
    legacyHarnessConfig = {
      accounts: [nativeAccount],
      initialSelectedAccount: nativeAccount.id,
    }

    render(<KeyManagement routeParams={{ accountId: nativeAccount.id }} />)
    await waitFor(() => expect(openResources).toHaveBeenCalledTimes(1))
    expect(accountSelectorPanelPropsSpy.mock.lastCall?.[0]).toMatchObject({
      aggregateCounts: {
        total: null,
        enabled: null,
        showing: null,
        knownTotal: 0,
        knownEnabled: 0,
        knownShowing: 0,
      },
    })
    expect(
      screen.getByRole("button", {
        name: "keyManagement:refreshTokenList",
      }),
    ).toBeDisabled()

    resolveOpen(session)
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "keyManagement:refreshTokenList",
        }),
      ).toBeEnabled(),
    )
    expect(accountSelectorPanelPropsSpy.mock.lastCall?.[0]).toMatchObject({
      aggregateCounts: {
        total: 0,
        enabled: 0,
        showing: 0,
      },
    })
  })

  it("refreshes both legacy and native inventories in all-account mode and stays busy until both settle", async () => {
    const user = userEvent.setup()
    const legacyAccount = createAccount({
      id: "legacy-refresh-account",
      name: "Legacy refresh account",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://legacy-refresh.example.invalid",
    })
    const nativeAccount = createAccount({
      id: "native-refresh-account",
      name: "Native refresh account",
      siteType: SITE_TYPES.OPENROUTER,
      baseUrl: "https://native-refresh.example.invalid",
    })
    const scope = createScope(
      "workspace-refresh-id",
      "refresh",
      "Refresh workspace",
      true,
    )
    const { session } = createNativeSession({ scopes: [scope] })
    let resolveNativeRefresh!: (value: typeof session) => void
    const pendingNativeRefresh = new Promise<typeof session>((resolve) => {
      resolveNativeRefresh = resolve
    })
    const openResources = vi
      .fn()
      .mockResolvedValueOnce(session)
      .mockImplementationOnce(() => pendingNativeRefresh)
    createDisplayAccountApiContextMock.mockImplementation((account: any) => ({
      ...(account.id === nativeAccount.id
        ? { accountKeyResources: { open: openResources } }
        : {}),
      request: {},
    }))
    legacyHarnessConfig = {
      accounts: [legacyAccount, nativeAccount],
      initialSelectedAccount: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
      tokenLoadProgress: { total: 1, loaded: 1, loading: 0, error: 0 },
    }
    legacyLoadTokensSpy.mockRejectedValueOnce(
      new Error("Legacy refresh unavailable"),
    )

    render(
      <KeyManagement
        routeParams={{ accountId: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE }}
      />,
    )
    await waitFor(() => expect(openResources).toHaveBeenCalledTimes(1))
    const refreshButton = screen.getByRole("button", {
      name: "keyManagement:refreshTokenList",
    })
    await user.click(refreshButton)

    await waitFor(() => {
      expect(legacyLoadTokensSpy).toHaveBeenCalledWith(undefined, {
        protectionBypassExecution: expect.any(Object),
      })
      expect(openResources).toHaveBeenCalledTimes(2)
    })
    expect(
      screen.getByRole("button", { name: "common:status.refreshing" }),
    ).toBeDisabled()

    resolveNativeRefresh(session)
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "keyManagement:refreshTokenList",
        }),
      ).toBeEnabled(),
    )
  })

  it("shows safe native delete detail and permits a deliberate retry without exposing the resource id", async () => {
    const user = userEvent.setup()
    const account = createAccount({
      id: "native-account",
      name: "Native account",
      siteType: SITE_TYPES.OPENROUTER,
      baseUrl: "https://native.example.invalid",
    })
    const scope = createScope(
      "workspace-example-id",
      "default",
      "Default workspace",
      true,
    )
    const facts = createFacts(
      account.id,
      scope.scopeKey,
      "private-resource-id-example",
      "Visible native key",
    )
    const deleteResource = vi
      .fn()
      .mockRejectedValueOnce(
        new AccountKeyResourceError({
          code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
          message: "Remote service temporarily unavailable",
        }),
      )
      .mockResolvedValueOnce(undefined)
    const { session } = createNativeSession({
      scopes: [scope],
      rows: [facts],
      deleteResource,
    })
    createDisplayAccountApiContextMock.mockReturnValue({
      accountKeyResources: { open: vi.fn().mockResolvedValue(session) },
      request: {},
    })
    legacyHarnessConfig = {
      accounts: [account],
      initialSelectedAccount: account.id,
    }

    render(
      <KeyManagement
        routeParams={{ accountId: account.id, workspace: scope.routeKey }}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:openRouter.list.actions.delete",
      }),
    )
    expect(
      await screen.findByText(
        "Delete Visible native key from the remote provider permanently. This cannot be undone.",
      ),
    ).toBeVisible()
    expect(document.body).not.toHaveTextContent("private-resource-id-example")

    await user.click(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeDeleteConfirmButton),
    )
    expect(
      await screen.findByText("Remote service temporarily unavailable"),
    ).toBeVisible()
    expect(deleteResource).toHaveBeenCalledTimes(1)

    await user.click(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeDeleteConfirmButton),
    )
    await waitFor(() => expect(deleteResource).toHaveBeenCalledTimes(2))
  })

  it("offers refresh first after an uncertain native delete and never blind-retries deletion", async () => {
    const user = userEvent.setup()
    const account = createAccount({
      id: "native-account",
      name: "Native account",
      siteType: SITE_TYPES.OPENROUTER,
      baseUrl: "https://native.example.invalid",
    })
    const scope = createScope(
      "workspace-example-id",
      "default",
      "Default workspace",
      true,
    )
    const facts = createFacts(
      account.id,
      scope.scopeKey,
      "private-resource-id-example",
      "Visible native key",
    )
    const deleteResource = vi.fn().mockRejectedValue(
      new AccountKeyResourceError({
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
        message: "The provider response was interrupted",
      }),
    )
    const { session } = createNativeSession({
      scopes: [scope],
      rows: [facts],
      deleteResource,
    })
    const open = vi.fn().mockResolvedValue(session)
    createDisplayAccountApiContextMock.mockReturnValue({
      accountKeyResources: { open },
      request: {},
    })
    legacyHarnessConfig = {
      accounts: [account],
      initialSelectedAccount: account.id,
    }

    render(
      <KeyManagement
        routeParams={{ accountId: account.id, workspace: scope.routeKey }}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:openRouter.list.actions.delete",
      }),
    )
    await user.click(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeDeleteConfirmButton),
    )
    await waitFor(() => expect(deleteResource).toHaveBeenCalledTimes(1))
    expect(
      await screen.findByText("The provider response was interrupted"),
    ).toBeVisible()
    expect(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeDeleteConfirmButton),
    ).toHaveTextContent("keyManagement:openRouter.delete.refresh")

    const openCountAfterRecovery = open.mock.calls.length
    await user.click(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeDeleteConfirmButton),
    )
    await waitFor(() =>
      expect(open.mock.calls.length).toBeGreaterThan(openCountAfterRecovery),
    )
    expect(deleteResource).toHaveBeenCalledTimes(1)
  })
})

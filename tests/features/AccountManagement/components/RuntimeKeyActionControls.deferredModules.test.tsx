import type { UserEvent } from "@testing-library/user-event"
import type { ReactNode } from "react"
import { Suspense } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeKeyActionControls } from "~/features/AccountManagement/components/CopyKeyDialog/RuntimeKeyActionControls"
import {
  buildDisplayAccountTokenRuntimeKey,
  buildServiceCredentialRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import type { AccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import { AuthTypeEnum } from "~/types"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  kiloCodeExportDialogMock,
  kiloCodeProfileExportDialogMock,
  openInCherryStudioMock,
  userPreferencesContextMock,
} = vi.hoisted(() => ({
  kiloCodeExportDialogMock: vi.fn(),
  kiloCodeProfileExportDialogMock: vi.fn(),
  openInCherryStudioMock: vi.fn(),
  userPreferencesContextMock: {
    managedSiteType: "new-api",
    claudeCodeRouterBaseUrl: "https://router.example.invalid",
    claudeCodeRouterApiKey: "ccr-management-key",
    cliProxyBaseUrl: "https://cliproxy.example.invalid",
    cliProxyManagementKey: "cliproxy-management-key",
    markGatewayGuidanceOnboardingCompleted: vi.fn(),
  },
}))

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/UserPreferencesContext")>()
  return {
    ...actual,
    UserPreferencesProvider: ({ children }: { children: ReactNode }) =>
      children,
    useUserPreferencesContext: () => userPreferencesContextMock,
  }
})

vi.mock("~/contexts/FeatureGuidanceContext", () => ({
  useFeatureGuidanceContext: () => ({
    markGatewayGuidanceOnboardingCompleted:
      userPreferencesContextMock.markGatewayGuidanceOnboardingCompleted,
  }),
}))

vi.mock("~/components/dialogs/ChannelDialog", () => ({
  ChannelDialogProvider: ({ children }: { children: ReactNode }) => children,
  useChannelDialog: () => ({
    openWithAccount: vi.fn(),
    openWithCredentials: vi.fn(),
  }),
}))

vi.mock("~/components/ManagedSiteImportButton", () => ({
  ManagedSiteImportButton: () => null,
}))

vi.mock("~/components/ExportActionsMenu", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/components/ExportActionsMenu")>()
  return actual
})

vi.mock("~/components/ClaudeCodeRouterImportDialog", () => ({
  ClaudeCodeRouterImportDialog: () => null,
}))
vi.mock("~/components/CliProxyExportDialog", () => ({
  CliProxyExportDialog: () => null,
}))
vi.mock("~/components/CursorPlusExportDialog", () => ({
  CursorPlusExportDialog: () => null,
}))
vi.mock("~/components/KelivoExportDialog", () => ({
  KelivoExportDialog: () => null,
}))

// Module-factory counters prove each deferred import stays unresolved until its
// action selects it; component spies prove the resolved exports still run.
const kiloCodeModuleLoadMock = vi.hoisted(() => ({ count: 0 }))
const kiloCodeProfileModuleLoadMock = vi.hoisted(() => ({ count: 0 }))
const cherryStudioModuleLoadMock = vi.hoisted(() => ({ count: 0 }))

vi.mock("~/components/KiloCodeExportDialog", () => {
  kiloCodeModuleLoadMock.count += 1
  return {
    KiloCodeExportDialog: (props: unknown) =>
      kiloCodeExportDialogMock(props) ?? null,
  }
})

vi.mock(
  "~/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog",
  () => {
    kiloCodeProfileModuleLoadMock.count += 1
    return {
      KiloCodeProfileExportDialog: (props: unknown) =>
        kiloCodeProfileExportDialogMock(props) ?? null,
    }
  },
)

vi.mock("~/services/integrations/cherryStudio", () => {
  cherryStudioModuleLoadMock.count += 1
  return {
    OpenInCherryStudio: (...args: unknown[]) => openInCherryStudioMock(...args),
  }
})

vi.mock(
  "~/services/accounts/utils/apiServiceRequest",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/accounts/utils/apiServiceRequest")
      >()
    return {
      ...actual,
      resolveDisplayAccountRuntimeKeySecret: async (
        _account: unknown,
        runtimeKey: { token: { key: string } },
      ) => ({ ...runtimeKey, secret: runtimeKey.token.key }),
    }
  },
)

const ACCOUNT = {
  id: "acc-1",
  name: "Example",
  username: "tester",
  siteType: "new-api",
  baseUrl: "https://example.com",
  token: "token",
  userId: "1",
  authType: AuthTypeEnum.AccessToken,
} as any

const TOKEN = {
  id: 1,
  user_id: 1,
  key: "sk-test",
  status: 1,
  name: "default",
  created_time: 0,
  accessed_time: 0,
  expired_time: -1,
  remain_quota: 0,
  unlimited_quota: true,
  used_quota: 0,
  allow_ips: "",
  model_limits_enabled: false,
  model_limits: "",
  group: "",
} as any

function renderActionControls(overrides?: {
  account?: typeof ACCOUNT
  runtimeKey?: AccountRuntimeKey
}) {
  const account = overrides?.account ?? ACCOUNT
  const runtimeKey =
    overrides?.runtimeKey ?? buildDisplayAccountTokenRuntimeKey(account, TOKEN)
  return render(
    <Suspense fallback={null}>
      <RuntimeKeyActionControls
        runtimeKey={runtimeKey}
        actionPolicy={{ copySecret: false, exportSecret: true }}
        copiedRuntimeKeyId={null}
        onCopyKey={() => {}}
        account={account}
      />
    </Suspense>,
  )
}

async function clickKiloCodeAction(user: UserEvent) {
  const trigger = screen.getByRole("button", { name: "common:actions.export" })
  await user.click(trigger)
  await user.click(
    screen.getByRole("menuitem", {
      name: "keyManagement:actions.exportToKiloCode",
    }),
  )
}

describe("RuntimeKeyActionControls deferred module loading", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    kiloCodeModuleLoadMock.count = 0
    kiloCodeProfileModuleLoadMock.count = 0
    cherryStudioModuleLoadMock.count = 0
  })

  it("does not load Kilo Code dialog modules until the Kilo Code action runs", async () => {
    expect(kiloCodeModuleLoadMock.count).toBe(0)
    expect(kiloCodeProfileModuleLoadMock.count).toBe(0)

    const { default: userEvent } = await import("@testing-library/user-event")
    const user = userEvent.setup()
    renderActionControls()

    // Opening the export menu alone must not load any deferred module.
    await user.click(
      screen.getByRole("button", { name: "common:actions.export" }),
    )
    expect(kiloCodeModuleLoadMock.count).toBe(0)
    expect(kiloCodeProfileModuleLoadMock.count).toBe(0)

    await user.click(
      screen.getByRole("menuitem", {
        name: "keyManagement:actions.exportToKiloCode",
      }),
    )

    // The account-token path resolves through the lazy dialog after load.
    await waitFor(() => {
      expect(kiloCodeExportDialogMock).toHaveBeenCalledWith(
        expect.objectContaining({ isOpen: true }),
      )
    })
    expect(kiloCodeModuleLoadMock.count).toBe(1)
    expect(kiloCodeProfileModuleLoadMock.count).toBe(0)
  })

  it("renders the service-credential profile dialog from its deferred module", async () => {
    expect(kiloCodeProfileModuleLoadMock.count).toBe(0)

    const sharedChatAccount = {
      ...ACCOUNT,
      id: "sharedchat-account",
      siteType: "sharedchat" as const,
      authType: AuthTypeEnum.Cookie,
      token: "",
    } as any
    const runtimeKey = buildServiceCredentialRuntimeKey(sharedChatAccount, {
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex service key",
      key: "sk-service-credential-secret",
      isAuthenticated: true,
      baseUrl: "https://api.example.invalid/v1",
    })

    const { default: userEvent } = await import("@testing-library/user-event")
    const user = userEvent.setup()
    renderActionControls({ account: sharedChatAccount, runtimeKey })

    await user.click(
      screen.getByRole("button", { name: "common:actions.export" }),
    )
    await user.click(
      screen.getByRole("menuitem", {
        name: "keyManagement:actions.exportToKiloCode",
      }),
    )

    await waitFor(() => {
      expect(kiloCodeProfileExportDialogMock).toHaveBeenCalledWith(
        expect.objectContaining({ isOpen: true }),
      )
    })
    expect(kiloCodeProfileModuleLoadMock.count).toBe(1)
    expect(kiloCodeModuleLoadMock.count).toBe(0)
  })

  it("loads Cherry Studio only when its export action runs", async () => {
    expect(cherryStudioModuleLoadMock.count).toBe(0)

    const { default: userEvent } = await import("@testing-library/user-event")
    const user = userEvent.setup()
    renderActionControls()
    await clickKiloCodeAction(user)

    await user.click(
      screen.getByRole("button", { name: "common:actions.export" }),
    )
    expect(cherryStudioModuleLoadMock.count).toBe(0)

    await user.click(
      screen.getByRole("menuitem", {
        name: "keyManagement:actions.useInCherry",
      }),
    )

    await waitFor(() => {
      expect(openInCherryStudioMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "acc-1" }),
        expect.objectContaining({ key: "sk-test" }),
      )
    })
    expect(cherryStudioModuleLoadMock.count).toBe(1)
  })
})

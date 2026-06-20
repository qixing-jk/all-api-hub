import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import CopyKeyDialog from "~/features/AccountManagement/components/CopyKeyDialog"
import {
  CREATED_TOKEN_SECRET_DECISION_KINDS,
  DEFAULT_TOKEN_CREATION_DECISION_KINDS,
  TOKEN_CREATION_SECRET_RECOVERY,
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_REPAIR_POLICY_KINDS,
  TOKEN_PROVISIONING_WORKFLOWS,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import { ACCOUNT_KEY_REPAIR_SKIP_REASONS } from "~/types/accountKeyAutoProvisioning"
import {
  buildSub2ApiAccount,
  buildSub2ApiToken,
} from "~~/tests/test-utils/factories"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  fetchAccountTokensMock,
  createApiTokenMock,
  fetchAccountAvailableModelsMock,
  fetchUserGroupsMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  fetchAccountTokensMock: vi.fn(),
  createApiTokenMock: vi.fn(),
  fetchAccountAvailableModelsMock: vi.fn(),
  fetchUserGroupsMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

const normalizeGroupNames = (groups: Record<string, unknown>): string[] =>
  Array.from(
    new Set(
      Object.keys(groups)
        .map((group) => group.trim())
        .filter(Boolean),
    ),
  )

const createSub2ApiTokenProvisioningMock = () => ({
  isInventoryTokenUsable: vi.fn(() => true),
  resolveDefaultTokenCreation: vi.fn((request: any) => {
    const explicitGroup =
      typeof request.explicitGroup === "string"
        ? request.explicitGroup.trim()
        : ""

    if (explicitGroup) {
      return {
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
        tokenData: { ...request.defaultTokenData, group: explicitGroup },
        oneTimeSecret: false,
        recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
      }
    }

    if (
      request.workflow !== TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection &&
      request.workflow !== TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation
    ) {
      return {
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked,
        reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupRequired,
      }
    }

    if (!request.userGroups) {
      return { kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups }
    }

    const allowedGroups = normalizeGroupNames(request.userGroups)

    if (allowedGroups.length === 0) {
      return {
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked,
        reason: TOKEN_PROVISIONING_BLOCK_REASONS.AvailableGroupRequired,
      }
    }

    if (allowedGroups.length === 1) {
      return {
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
        tokenData: { ...request.defaultTokenData, group: allowedGroups[0] },
        oneTimeSecret: false,
        recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
      }
    }

    return {
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.SelectionRequired,
      allowedGroups,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupSelectionRequired,
    }
  }),
  classifyCreatedToken: vi.fn(({ result }: any) =>
    result
      ? { kind: CREATED_TOKEN_SECRET_DECISION_KINDS.NeedsInventoryRefetch }
      : {
          kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Failed,
          reason: TOKEN_PROVISIONING_BLOCK_REASONS.CreateFailed,
        },
  ),
  getRepairPolicy: vi.fn(() => ({
    kind: TOKEN_PROVISIONING_REPAIR_POLICY_KINDS.Skipped,
    skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.Sub2Api,
  })),
})

vi.mock("react-hot-toast", () => ({
  default: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}))

vi.mock("~/services/apiService", () => ({
  getApiService: () => ({
    fetchAccountAvailableModels: (...args: any[]) =>
      fetchAccountAvailableModelsMock(...args),
    fetchUserGroups: (...args: any[]) => fetchUserGroupsMock(...args),
    updateApiToken: vi.fn(async () => true),
  }),
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: () => ({
    keyManagement: {
      fetchTokens: (...args: any[]) => fetchAccountTokensMock(...args),
      createToken: (...args: any[]) => createApiTokenMock(...args),
      resolveTokenKey: async (_params: {
        request: unknown
        token: { key: string }
      }) => _params.token.key,
      deleteToken: vi.fn(),
      fetchAvailableModels: (...args: any[]) =>
        fetchAccountAvailableModelsMock(...args),
      userGroups: {
        fetch: (...args: any[]) => fetchUserGroupsMock(...args),
      },
    },
    tokenProvisioning: createSub2ApiTokenProvisioningMock(),
  }),
}))

const ACCOUNT = buildSub2ApiAccount()

const TOKEN = buildSub2ApiToken()

describe("CopyKeyDialog sub2api support", () => {
  beforeEach(() => {
    fetchAccountTokensMock.mockReset()
    createApiTokenMock.mockReset()
    fetchAccountAvailableModelsMock.mockReset()
    fetchUserGroupsMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    fetchAccountAvailableModelsMock.mockResolvedValue([])
  })

  it("auto-uses the only valid current group for Sub2API quick-create", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])
    fetchUserGroupsMock.mockResolvedValueOnce({
      vip: { desc: "VIP", ratio: 2 },
    })
    createApiTokenMock.mockResolvedValueOnce(true)

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledTimes(1)
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
      expect(createApiTokenMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ group: "vip" }),
      )
    })
  })

  it("refreshes inventory instead of showing one-time UI when Sub2API create returns a token DTO", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])
    fetchUserGroupsMock.mockResolvedValueOnce({
      vip: { desc: "VIP", ratio: 2 },
    })
    createApiTokenMock.mockResolvedValueOnce({
      ...TOKEN,
      id: 9,
      key: "sk-sub2api-created-full-secret",
      name: "sub2api-created",
    })

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    await waitFor(() => {
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
      expect(createApiTokenMock).toHaveBeenCalledTimes(1)
    })
    expect(
      screen.queryByText("keyManagement:oneTimeKey.title"),
    ).not.toBeInTheDocument()
  })

  it("requires explicit group selection when multiple Sub2API groups exist", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    fetchUserGroupsMock
      .mockResolvedValueOnce({
        default: { desc: "Default", ratio: 1 },
        vip: { desc: "VIP", ratio: 2 },
      })
      .mockResolvedValueOnce({
        default: { desc: "Default", ratio: 1 },
        vip: { desc: "VIP", ratio: 2 },
      })

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    expect(createApiTokenMock).not.toHaveBeenCalled()
    expect(
      await screen.findByText(
        "messages:tokenProvisioning.createRequiresGroupSelection",
      ),
    ).toBeInTheDocument()
  })

  it("fails safely when no Sub2API groups are available", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({})

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    expect(createApiTokenMock).not.toHaveBeenCalled()
    expect(
      await screen.findByText("messages:sub2api.createRequiresAvailableGroup"),
    ).toBeInTheDocument()
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
  })

  it("opens the constrained dialog flow before creating when multiple groups exist", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    fetchUserGroupsMock
      .mockResolvedValueOnce({
        default: { desc: "Default", ratio: 1 },
        vip: { desc: "VIP", ratio: 2 },
      })
      .mockResolvedValueOnce({
        default: { desc: "Default", ratio: 1 },
        vip: { desc: "VIP", ratio: 2 },
      })
    createApiTokenMock.mockResolvedValueOnce(true)
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    await screen.findByRole("button", {
      name: "keyManagement:dialog.createToken",
    })

    const groupTrigger = screen
      .getAllByRole("combobox")
      .find((element) =>
        element.textContent?.includes("keyManagement:dialog.groupLabel"),
      )
    expect(groupTrigger).toBeTruthy()

    await user.click(groupTrigger as HTMLElement)
    await user.click(
      await screen.findByText(
        "default - Default (keyManagement:dialog.groupRate 1)",
      ),
    )

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:dialog.createToken",
      }),
    )

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ group: "default" }),
      )
    })
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createKimiKey,
  deleteKimiKey,
  fetchKimiAccountData,
  fetchKimiAccountModelCatalog,
  fetchKimiKeys,
  fetchKimiProjects,
  fetchKimiUserInfo,
  renameKimiKey,
  resolveKimiOrganizationId,
} from "~/services/apiService/kimiOpenPlatform"
import * as transport from "~/services/apiService/kimiOpenPlatform/transport"
import { AuthTypeEnum } from "~/types"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

vi.mock("~/services/apiService/kimiOpenPlatform/transport", () => ({
  ensureKimiAuthState: vi.fn(),
  fetchKimiConsole: vi.fn(),
  fetchKimiConsolePath: vi.fn(),
  fetchKimiInference: vi.fn(),
  persistKimiAuthState: vi.fn(),
  readKimiAuthState: vi.fn(),
}))

const consoleSession = {
  accessToken: "token-1",
  refreshToken: "refresh-1",
  organizationId: "org-xyz",
}

const accountRequest = () => ({
  accountId: "acc-1",
  baseUrl: "https://platform.kimi.com",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token-1" },
})

describe("kimiOpenPlatform service index", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("learns an organization and uses the uid when the user has no display name", async () => {
    const state = { ...consoleSession, organizationId: "" }
    vi.mocked(transport.readKimiAuthState).mockReturnValue(state)
    vi.mocked(transport.fetchKimiConsole).mockResolvedValue({
      code: 0,
      data: {
        uid: " user ",
        organizations: [{ organization: { id: " org " } }],
      },
    })
    await expect(fetchKimiUserInfo(accountRequest())).resolves.toEqual({
      id: "user",
      username: "user",
      access_token: "token-1",
      organizationId: "org",
    })
    expect(state.organizationId).toBe("org")
  })

  it("rejects accounts without an organization", async () => {
    vi.mocked(transport.fetchKimiConsole).mockResolvedValue({
      code: 0,
      data: { uid: "user" },
    })
    await expect(resolveKimiOrganizationId(accountRequest())).rejects.toThrow(
      "missing_kimi_organization",
    )
    expect(transport.persistKimiAuthState).not.toHaveBeenCalled()
  })

  it("routes list, creation, rename and deletion to the selected organization and project", async () => {
    const request = accountRequest()
    vi.mocked(transport.ensureKimiAuthState).mockResolvedValue(consoleSession)
    const key = {
      key: "ak-key",
      auth: "sk-secret",
      name: "Key",
      project_id: "project",
    }
    vi.mocked(transport.fetchKimiConsole)
      .mockResolvedValueOnce({ code: 0, data: [key] })
      .mockResolvedValueOnce({ code: 0, data: key })
      .mockResolvedValue({ code: 0 })
    await expect(fetchKimiKeys(request)).resolves.toEqual([key])
    await expect(createKimiKey(request, "project", "Key")).resolves.toEqual(key)
    await renameKimiKey(request, "project", "ak-key", "Renamed")
    await deleteKimiKey(request, "project", "ak-key")
    expect(transport.fetchKimiConsole).toHaveBeenNthCalledWith(
      1,
      request,
      "organizationKeys",
      { query: { oid: "org-xyz" } },
    )
    expect(transport.fetchKimiConsole).toHaveBeenNthCalledWith(
      2,
      request,
      "createApiKey",
      {
        method: "POST",
        query: { pid: "project", oid: "org-xyz" },
        body: { name: "Key" },
      },
    )
    expect(transport.fetchKimiConsole).toHaveBeenNthCalledWith(
      3,
      request,
      "updateApiKey",
      {
        method: "PUT",
        query: { pid: "project", oid: "org-xyz", id: "ak-key" },
        body: { name: "Renamed" },
      },
    )
    expect(transport.fetchKimiConsole).toHaveBeenNthCalledWith(
      4,
      request,
      "deleteApiKey",
      {
        method: "DELETE",
        query: { pid: "project", oid: "org-xyz", id: "ak-key" },
      },
    )
  })

  it.each([
    ["https://platform.kimi.com", 72, 7.2, 5_000_000],
    ["https://platform.kimi.ai", 10, 7.2, 5_000_000],
  ])(
    "uses API-key-only balance on the correct deployment %s",
    async (baseUrl, available, exchangeRate, quota) => {
      vi.mocked(transport.readKimiAuthState).mockReturnValue(undefined)
      vi.mocked(transport.fetchKimiInference).mockResolvedValue({
        code: 0,
        status: true,
        scode: "0x0",
        data: { available_balance: available },
      })
      const request = {
        ...accountRequest(),
        baseUrl,
        exchangeRate,
        checkIn: buildCheckInConfig(),
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "sk-inference-key",
        },
      }
      await expect(fetchKimiAccountData(request)).resolves.toMatchObject({
        quota,
        today_quota_consumption: 0,
      })
      expect(transport.fetchKimiInference).toHaveBeenCalledWith(
        request,
        "/v1/users/me/balance",
        "sk-inference-key",
      )
      expect(transport.fetchKimiConsole).not.toHaveBeenCalled()
    },
  )

  it("rejects a malformed gateway list instead of accepting it as empty", async () => {
    vi.mocked(transport.ensureKimiAuthState).mockResolvedValue(consoleSession)
    vi.mocked(transport.fetchKimiConsole).mockResolvedValueOnce({
      code: 0,
      data: [{ id: "project-1", name: "Default", is_default: true }],
    })
    vi.mocked(transport.fetchKimiConsolePath).mockResolvedValueOnce({
      code: 0,
      data: { data: "unexpected" },
    })
    await expect(
      fetchKimiAccountModelCatalog(accountRequest()),
    ).rejects.toThrow("invalid_kimi_model_catalog")
  })

  it("resolves organizationId from stored state when present", async () => {
    vi.mocked(transport.ensureKimiAuthState).mockResolvedValueOnce(
      consoleSession,
    )

    const oid = await resolveKimiOrganizationId(accountRequest())
    expect(oid).toBe("org-xyz")
  })

  it("resolves organizationId from userInfo when state has no organizationId", async () => {
    vi.mocked(transport.ensureKimiAuthState).mockResolvedValueOnce({
      ...consoleSession,
      organizationId: "",
    })
    vi.mocked(transport.fetchKimiConsole).mockResolvedValueOnce({
      code: 0,
      data: {
        uid: "user-1",
        organizations: [{ organization: { id: "org-from-user-info" } }],
      },
    })

    const request = accountRequest()
    const oid = await resolveKimiOrganizationId(request)
    expect(oid).toBe("org-from-user-info")
    expect(transport.persistKimiAuthState).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ organizationId: "org-from-user-info" }),
    )
  })

  it("fetchKimiProjects passes resolved organizationId to listProjects", async () => {
    vi.mocked(transport.ensureKimiAuthState).mockResolvedValueOnce(
      consoleSession,
    )
    vi.mocked(transport.fetchKimiConsole).mockResolvedValueOnce({
      code: 0,
      data: [{ id: "proj-1", name: "Project 1", is_default: true }],
    })

    const request = accountRequest()
    const projects = await fetchKimiProjects(request)
    expect(projects).toEqual([
      { id: "proj-1", name: "Project 1", is_default: true },
    ])
    expect(transport.fetchKimiConsole).toHaveBeenCalledWith(
      request,
      "listProjects",
      { query: { oid: "org-xyz" } },
    )
  })

  it("fetchKimiAccountData passes oid to organizationAccountInfo", async () => {
    vi.mocked(transport.ensureKimiAuthState).mockResolvedValueOnce(
      consoleSession,
    )
    vi.mocked(transport.fetchKimiConsole).mockResolvedValueOnce({
      code: 0,
      data: { cur: 100, today_consume: 5 },
    })

    const request = {
      ...accountRequest(),
      exchangeRate: 7.2,
    } as unknown as import("~/services/accounts/accountDataModel").ApiServiceAccountRequest

    const data = await fetchKimiAccountData(request)
    expect(transport.fetchKimiConsole).toHaveBeenCalledWith(
      request,
      "organizationAccountInfo",
      { query: { oid: "org-xyz" } },
    )
    expect(data.quota).toBeGreaterThan(0)
  })

  it("fetchKimiAccountModelCatalog reads the default project's open gateway", async () => {
    vi.mocked(transport.ensureKimiAuthState).mockResolvedValue(consoleSession)
    vi.mocked(transport.fetchKimiConsole).mockResolvedValueOnce({
      code: 0,
      data: [
        { id: "proj-other", name: "Other" },
        { id: "proj-default", name: "Default", is_default: true },
      ],
    })
    vi.mocked(transport.fetchKimiConsolePath).mockResolvedValueOnce({
      code: 0,
      data: {
        object: "list",
        data: [
          {
            id: "kimi-k2.7-code",
            context_length: 262144,
            supports_reasoning: true,
          },
          { id: "kimi-k2.6" },
          { id: 42 },
        ],
      },
    })

    const request = accountRequest()
    const models = await fetchKimiAccountModelCatalog(request)

    expect(models).toEqual([{ id: "kimi-k2.7-code" }, { id: "kimi-k2.6" }])
    expect(transport.fetchKimiConsolePath).toHaveBeenCalledWith(
      request,
      "/api/v1/organizations/org-xyz/projects/proj-default/open-gateway/models",
    )
  })

  it("fetchKimiAccountModelCatalog rejects when the account has no project", async () => {
    vi.mocked(transport.ensureKimiAuthState).mockResolvedValue(consoleSession)
    vi.mocked(transport.fetchKimiConsole).mockResolvedValueOnce({
      code: 0,
      data: [],
    })

    await expect(
      fetchKimiAccountModelCatalog(accountRequest()),
    ).rejects.toThrow("missing_kimi_project")
    expect(transport.fetchKimiConsolePath).not.toHaveBeenCalled()
  })
})

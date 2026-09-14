import { beforeEach, describe, expect, it, vi } from "vitest"

describe("claudeCodeRouterService", () => {
  const baseOptions = {
    providerApiKey: "provider-key",
    routerBaseUrl: "https://router.example.com",
    routerApiKey: "router-secret",
    providerName: "Example Provider",
    providerApiBaseUrl: "https://provider.example.com/v1",
    providerModels: [" claude-3-7-sonnet ", "claude-3-5-sonnet"],
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("returns config-missing when the router base URL is blank", async () => {
    const { importToClaudeCodeRouter } = await import(
      "~/services/integrations/claudeCodeRouterService"
    )

    await expect(
      importToClaudeCodeRouter({
        ...baseOptions,
        routerBaseUrl: "",
      }),
    ).resolves.toMatchObject({
      success: false,
      message: expect.stringContaining(
        "messages:claudeCodeRouter.configMissing",
      ),
    })
  })

  it("returns models-missing when the provider model list is empty after trimming", async () => {
    const { importToClaudeCodeRouter } = await import(
      "~/services/integrations/claudeCodeRouterService"
    )

    await expect(
      importToClaudeCodeRouter({
        ...baseOptions,
        providerModels: [" ", ""],
      }),
    ).resolves.toMatchObject({
      success: false,
      message: expect.stringContaining(
        "messages:claudeCodeRouter.modelsMissing",
      ),
    })
  })

  it("updates an existing provider and restarts when requested", async () => {
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            Providers: [
              {
                name: "Example Provider",
                api_base_url: "https://provider.example.com/v1",
                api_key: "provider-key",
                models: ["claude-3-haiku"],
                transformer: { keep: true },
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )

    vi.stubGlobal("fetch", fetchMock as any)

    const { importToClaudeCodeRouter } = await import(
      "~/services/integrations/claudeCodeRouterService"
    )

    const result = await importToClaudeCodeRouter({
      ...baseOptions,
      restartAfterSave: true,
    })

    expect(result).toMatchObject({
      success: true,
      message: expect.stringContaining(
        "messages:claudeCodeRouter.updateSuccess",
      ),
    })

    const saveCall = fetchMock.mock.calls[1]
    expect(String(saveCall[0])).toBe("https://router.example.com/api/config")
    expect(saveCall[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer router-secret",
        "Content-Type": "application/json",
      }),
    })
    expect(JSON.parse(saveCall[1].body)).toMatchObject({
      Providers: [
        {
          name: "Example Provider",
          api_base_url: "https://provider.example.com/v1",
          api_key: "provider-key",
          models: ["claude-3-7-sonnet", "claude-3-5-sonnet"],
          transformer: { keep: true },
        },
      ],
    })

    expect(String(fetchMock.mock.calls[2][0])).toBe(
      "https://router.example.com/api/restart",
    )
  })

  it("adds a new provider when no exact match exists", async () => {
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ Providers: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )

    vi.stubGlobal("fetch", fetchMock as any)

    const { importToClaudeCodeRouter } = await import(
      "~/services/integrations/claudeCodeRouterService"
    )

    const result = await importToClaudeCodeRouter(baseOptions)

    expect(result).toMatchObject({
      success: true,
      message: expect.stringContaining(
        "messages:claudeCodeRouter.importSuccess",
      ),
    })

    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      Providers: [
        {
          name: "Example Provider",
          api_base_url: "https://provider.example.com/v1",
          api_key: "provider-key",
          models: ["claude-3-7-sonnet", "claude-3-5-sonnet"],
        },
      ],
    })
  })

  it("preserves non-provider config fields and omits authorization headers when no router API key is configured", async () => {
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            theme: "dark",
            Providers: "invalid-shape",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )

    vi.stubGlobal("fetch", fetchMock as any)

    const { importToClaudeCodeRouter } = await import(
      "~/services/integrations/claudeCodeRouterService"
    )

    const result = await importToClaudeCodeRouter({
      ...baseOptions,
      routerApiKey: undefined,
    })

    expect(result).toMatchObject({
      success: true,
      message: expect.stringContaining(
        "messages:claudeCodeRouter.importSuccess",
      ),
    })

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "GET",
      headers: expect.not.objectContaining({
        Authorization: expect.any(String),
      }),
    })
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        "Content-Type": "application/json",
      }),
    })
    expect(fetchMock.mock.calls[1][1].headers).not.toHaveProperty(
      "Authorization",
    )
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      theme: "dark",
      Providers: [
        expect.objectContaining({
          name: "Example Provider",
        }),
      ],
    })
  })

  it("adds a second provider entry when only the stored API key differs", async () => {
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            Providers: [
              {
                name: "Example Provider",
                api_base_url: "https://provider.example.com/v1",
                api_key: "older-key",
                models: ["claude-3-haiku"],
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )

    vi.stubGlobal("fetch", fetchMock as any)

    const { importToClaudeCodeRouter } = await import(
      "~/services/integrations/claudeCodeRouterService"
    )

    const result = await importToClaudeCodeRouter(baseOptions)

    expect(result).toMatchObject({
      success: true,
      message: expect.stringContaining(
        "messages:claudeCodeRouter.importSuccess",
      ),
    })

    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      Providers: [
        expect.objectContaining({
          api_key: "older-key",
          models: ["claude-3-haiku"],
        }),
        expect.objectContaining({
          api_key: "provider-key",
          models: ["claude-3-7-sonnet", "claude-3-5-sonnet"],
        }),
      ],
    })
  })

  it("returns a save failure message when the config update request is rejected", async () => {
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ Providers: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("blocked", { status: 500, statusText: "Server Error" }),
      )

    vi.stubGlobal("fetch", fetchMock as any)

    const { importToClaudeCodeRouter } = await import(
      "~/services/integrations/claudeCodeRouterService"
    )

    await expect(importToClaudeCodeRouter(baseOptions)).resolves.toMatchObject({
      success: false,
      message: "Claude Code Router API save failed: 500",
    })
  })

  it("returns a restart failure message after a successful config save", async () => {
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ Providers: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("unavailable", { status: 503, statusText: "Unavailable" }),
      )

    vi.stubGlobal("fetch", fetchMock as any)

    const { importToClaudeCodeRouter } = await import(
      "~/services/integrations/claudeCodeRouterService"
    )

    await expect(
      importToClaudeCodeRouter({
        ...baseOptions,
        restartAfterSave: true,
      }),
    ).resolves.toMatchObject({
      success: false,
      message: "Claude Code Router restart failed: 503",
    })
  })

  it("returns the thrown message when config fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("forbidden", { status: 403, statusText: "Forbidden" }),
        ) as any,
    )

    const { importToClaudeCodeRouter } = await import(
      "~/services/integrations/claudeCodeRouterService"
    )

    await expect(importToClaudeCodeRouter(baseOptions)).resolves.toMatchObject({
      success: false,
      message: "Claude Code Router API request failed: 403",
    })
  })
})

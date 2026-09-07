import { describe, expect, it } from "vitest"

import { Storage } from "@plasmohq/storage"

import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { createAutomaticProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { protectionBypassHistoryStorage } from "~/services/protectionBypass/historyStorage"

describe("protection bypass history", () => {
  it("omits invalid origins and unrecognized fallback evidence", async () => {
    await protectionBypassHistoryStorage.start({
      execution: createAutomaticProtectionBypassExecution(
        "account_refresh",
        "scheduled",
        "background",
      ),
      task: {
        kind: "api_fallback_fetch",
        params: {
          originUrl: "invalid origin?token=secret",
          fetchUrl: "https://example.com/api",
          fallbackDiagnostic: { statusCode: 999, code: "secret" as never },
        },
      },
    })

    const [entry] = await protectionBypassHistoryStorage.list()
    expect(entry.origin).toBeUndefined()
    expect(entry.fallbackDiagnostic).toBeUndefined()
    expect(JSON.stringify(entry)).not.toContain("secret")
  })

  it("retains the safe origin and permission outcome of an incognito session read", async () => {
    const id = await protectionBypassHistoryStorage.start({
      execution: {
        version: 2,
        kind: "user_command",
        command: "add_account",
        surface: "options",
      },
      task: {
        kind: "session_read",
        params: {
          url: "https://user:secret@example.com/account?token=secret",
          siteType: "new-api",
          requestId: "session-read-request",
          useIncognito: true,
        },
      },
    })
    await protectionBypassHistoryStorage.finish(id, {
      context: { kind: "unavailable", reason: "incognito_access_required" },
      response: { success: false },
    })

    const history = await protectionBypassHistoryStorage.list()
    expect(history).toEqual([
      expect.objectContaining({
        id,
        origin: "https://example.com",
        incognito: true,
        status: "unavailable",
        failureReason: "incognito_access_required",
      }),
    ])
    expect(JSON.stringify(history)).not.toContain("secret")
    expect(JSON.stringify(history)).not.toContain("session-read-request")
  })

  it("retains the trigger and result without saving request or response secrets", async () => {
    const id = await protectionBypassHistoryStorage.start({
      execution: createAutomaticProtectionBypassExecution(
        "account_refresh",
        "scheduled",
        "background",
      ),
      task: {
        kind: "api_fallback_fetch",
        params: {
          originUrl:
            "https://user:password@example.com/private?token=secret#secret",
          fetchUrl: "https://example.com/api/account?access_token=secret",
          fetchOptions: {
            method: "GET",
            headers: { Authorization: "Bearer request-secret" },
          },
          cookieAuthSessionCookie: "session=cookie-secret",
          fallbackDiagnostic: {
            statusCode: 403,
            code: API_ERROR_CODES.HTTP_403,
          },
        },
      },
    })

    expect(await protectionBypassHistoryStorage.list()).toEqual([
      expect.objectContaining({
        id,
        status: "started",
        origin: "https://example.com",
        method: "GET",
        taskKind: "api_fallback_fetch",
        fallbackDiagnostic: { statusCode: 403, code: "HTTP_403" },
        execution: expect.objectContaining({
          kind: "automatic",
          feature: "account_refresh",
          trigger: "scheduled",
          surface: "background",
        }),
      }),
    ])

    await protectionBypassHistoryStorage.finish(id, {
      context: { kind: "allowed", adapter: "tab", reused: true },
      response: {
        success: true,
        status: 200,
        data: { access_token: "response-secret", user: { id: 42 } },
        headers: { "set-cookie": "response-cookie-secret" },
      },
    })

    const history = await protectionBypassHistoryStorage.list()
    expect(history).toEqual([
      expect.objectContaining({
        id,
        status: "completed",
        contextMode: "tab",
        contextReused: true,
        httpStatus: 200,
        finishedAt: expect.any(Number),
        durationMs: expect.any(Number),
      }),
    ])
    const serialized = JSON.stringify(
      await browser.storage.local.get(STORAGE_KEYS.PROTECTION_BYPASS_HISTORY),
    )
    for (const secret of [
      "password",
      "private",
      "token",
      "secret",
      "cookie",
      "Authorization",
    ]) {
      expect(serialized).not.toContain(secret)
    }
  })

  it("keeps concurrent attempts bounded and never restores a cleared pending entry", async () => {
    const execution = createAutomaticProtectionBypassExecution(
      "account_refresh",
      "scheduled",
      "background",
    )
    const ids = await Promise.all(
      Array.from({ length: 105 }, (_, index) =>
        protectionBypassHistoryStorage.start({
          execution,
          task: {
            kind: "api_fallback_fetch",
            params: {
              originUrl: `https://site-${index}.example`,
              fetchUrl: `https://site-${index}.example/api`,
            },
          },
        }),
      ),
    )
    const retained = await protectionBypassHistoryStorage.list()
    expect(retained).toHaveLength(100)
    expect(retained.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(ids.slice(5)),
    )
    expect(retained.find((entry) => entry.id === ids[0])).toBeUndefined()
    expect(retained[0].method).toBe("GET")

    await protectionBypassHistoryStorage.clear()
    await protectionBypassHistoryStorage.finish(ids[104], {
      response: { success: true },
    })
    expect(await protectionBypassHistoryStorage.list()).toEqual([])
  })

  it("records a specific unavailable-environment reason even before policy evaluation", async () => {
    const id = await protectionBypassHistoryStorage.start({
      execution: createAutomaticProtectionBypassExecution(
        "account_refresh",
        "ui_lifecycle",
        "popup",
      ),
      task: {
        kind: "api_fallback_fetch",
        params: {
          originUrl: "https://example.com",
          fetchUrl: "https://example.com/api",
        },
      },
    })
    await protectionBypassHistoryStorage.finish(id, {
      context: { kind: "unavailable", reason: "firefox_popup_unsupported" },
      response: { success: false, error: "raw runtime error" },
    })
    expect(await protectionBypassHistoryStorage.list()).toEqual([
      expect.objectContaining({
        status: "unavailable",
        failureReason: "firefox_popup_unsupported",
      }),
    ])
  })

  it("ignores malformed stored rows and strips untrusted fields on read", async () => {
    const execution = createAutomaticProtectionBypassExecution(
      "account_refresh",
      "scheduled",
      "background",
    )
    await new Storage({ area: "local" }).set(
      STORAGE_KEYS.PROTECTION_BYPASS_HISTORY,
      {
        version: 1,
        entries: [
          {
            id: "bad",
            startedAt: 9e20,
            status: "started",
            execution,
            taskKind: "api_fallback_fetch",
            incognito: false,
          },
          {
            id: "valid",
            startedAt: 100,
            status: "started",
            execution,
            taskKind: "api_fallback_fetch",
            incognito: false,
            origin: "https://user:secret@example.com/private?token=secret",
            error: "secret",
            data: { accessToken: "secret" },
          },
          {
            id: "unknown",
            startedAt: 200,
            status: "made_up",
            execution,
            taskKind: "api_fallback_fetch",
            incognito: false,
          },
        ],
      },
    )
    const history = await protectionBypassHistoryStorage.list()
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      id: "valid",
      origin: "https://example.com",
    })
    expect(JSON.stringify(history)).not.toContain("secret")
  })

  it("captures immutable trigger facts and drops unrecognized diagnostic payloads", async () => {
    const execution = {
      ...createAutomaticProtectionBypassExecution(
        "account_refresh",
        "scheduled",
        "background",
      ),
    }
    const pending = protectionBypassHistoryStorage.start({
      execution,
      task: {
        kind: "api_fallback_fetch",
        params: {
          originUrl: "http://localhost:3000",
          fetchUrl: "http://localhost:3000/api",
          fallbackDiagnostic: {
            statusCode: 403,
            code: "secret" as never,
            message: "secret",
            body: { token: "secret" },
          } as never,
        },
      },
    })
    execution.feature = "checkin"
    const id = await pending
    await protectionBypassHistoryStorage.finish(id, {
      response: {
        success: false,
        status: 503,
        code: "secret",
        error: "secret",
        reason: "secret",
        data: { token: "secret" },
      },
    })
    const history = await protectionBypassHistoryStorage.list()
    expect(history).toEqual([
      expect.objectContaining({
        origin: "http://localhost:3000",
        status: "failed",
        httpStatus: 503,
        execution: expect.objectContaining({ feature: "account_refresh" }),
        fallbackDiagnostic: { statusCode: 403 },
      }),
    ])
    expect(
      JSON.stringify(
        await browser.storage.local.get(STORAGE_KEYS.PROTECTION_BYPASS_HISTORY),
      ),
    ).not.toContain("secret")
  })
})

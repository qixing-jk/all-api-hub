import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import ProtectionBypassHistory from "~/features/BasicSettings/components/tabs/Refresh/ProtectionBypassHistory"
import { SHIELD_SETTINGS_TARGET_IDS } from "~/features/BasicSettings/components/tabs/Refresh/searchTargets"
import { createAutomaticProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { protectionBypassHistoryStorage } from "~/services/protectionBypass/historyStorage"
import { render } from "~~/tests/test-utils/render"

afterEach(() => window.history.replaceState(null, "", "/"))

describe("protection bypass history settings", () => {
  it("keeps history closed until requested and shows all summaries with details on demand", async () => {
    const user = userEvent.setup()
    await Promise.all(
      Array.from({ length: 100 }, (_, index) =>
        protectionBypassHistoryStorage.start({
          execution: createAutomaticProtectionBypassExecution(
            "account_refresh",
            "scheduled",
            "background",
          ),
          task: {
            kind: "api_fallback_fetch",
            params: {
              originUrl: `https://site-${index}.example`,
              fetchUrl: `https://site-${index}.example/api/user/self`,
            },
          },
        }),
      ),
    )
    render(<ProtectionBypassHistory />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    const trigger = screen.getByRole("button", {
      name: "shieldBypass:history.open",
    })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

    await user.click(trigger)
    const dialog = within(
      await screen.findByRole("dialog", { name: "shieldBypass:history.title" }),
    )
    await dialog.findByText("https://site-99.example")
    expect(
      dialog.getAllByRole("button", {
        name: /https:\/\/site-\d+\.example/,
        expanded: false,
      }),
    ).toHaveLength(100)
    expect(
      dialog.queryByText("shieldBypass:history.fields.method"),
    ).not.toBeInTheDocument()
    expect(
      dialog.queryByRole("button", { name: "common:actions.more" }),
    ).not.toBeInTheDocument()

    await user.click(
      dialog.getByRole("button", { name: /https:\/\/site-99\.example/ }),
    )
    expect(dialog.getByText("shieldBypass:history.fields.method")).toBeVisible()
    expect(
      dialog.getByRole("button", { name: "shieldBypass:history.copy" }),
    ).toBeVisible()
    await user.keyboard("{Escape}")
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    )
    expect(trigger).toHaveFocus()
  })

  it("shows the trigger evidence, receives completion updates and filters by site", async () => {
    const user = userEvent.setup()
    const id = await protectionBypassHistoryStorage.start({
      execution: createAutomaticProtectionBypassExecution(
        "account_refresh",
        "scheduled",
        "background",
      ),
      task: {
        kind: "api_fallback_fetch",
        params: {
          originUrl: "https://example.com",
          fetchUrl: "https://example.com/api/user/self",
          fallbackDiagnostic: { statusCode: 403, code: "HTTP_403" },
        },
      },
    })
    render(<ProtectionBypassHistory />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    await user.click(
      screen.getByRole("button", { name: "shieldBypass:history.open" }),
    )
    await user.click(await screen.findByText("https://example.com"))
    expect(screen.getByText("HTTP 403 · HTTP_403")).toBeVisible()
    expect(
      screen.getByText("shieldBypass:history.triggers.scheduled"),
    ).toBeVisible()

    await act(async () => {
      await protectionBypassHistoryStorage.finish(id, {
        context: { kind: "allowed", adapter: "tab", reused: true },
        response: { success: true, status: 200 },
      })
    })
    expect(
      await screen.findByText("shieldBypass:history.statuses.completed"),
    ).toBeVisible()
    expect(screen.getByText("shieldBypass:history.reused")).toBeVisible()

    await user.type(
      screen.getByRole("searchbox", { name: "shieldBypass:history.search" }),
      "absent.example",
    )
    expect(screen.getByText("shieldBypass:history.noMatches")).toBeVisible()
    expect(screen.queryByText("https://example.com")).not.toBeInTheDocument()
  })

  it("copies only diagnostic data and clears history after confirmation", async () => {
    const user = userEvent.setup()
    await protectionBypassHistoryStorage.start({
      execution: createAutomaticProtectionBypassExecution(
        "account_refresh",
        "scheduled",
        "background",
      ),
      task: {
        kind: "api_fallback_fetch",
        params: {
          originUrl: "https://user:secret@example.com/private?token=secret",
          fetchUrl: "https://example.com/api?token=secret",
          cookieAuthSessionCookie: "session=secret",
        },
      },
    })
    render(<ProtectionBypassHistory />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    await user.click(
      screen.getByRole("button", { name: "shieldBypass:history.open" }),
    )
    await user.click(await screen.findByText("https://example.com"))
    await user.click(
      screen.getByRole("button", { name: "shieldBypass:history.copy" }),
    )
    const copied = await navigator.clipboard.readText()
    expect(JSON.parse(copied)).toMatchObject({
      origin: "https://example.com",
      status: "started",
    })
    expect(copied).not.toContain("secret")

    await user.click(
      screen.getByRole("button", { name: "shieldBypass:history.actions" }),
    )
    await user.click(
      screen.getByRole("menuitem", { name: "shieldBypass:history.clear" }),
    )
    const dialog = await screen.findByRole("dialog", {
      name: "shieldBypass:history.clear",
    })
    expect(await protectionBypassHistoryStorage.list()).toHaveLength(1)
    await user.click(
      within(dialog).getByRole("button", { name: "common:actions.clear" }),
    )
    expect(await screen.findByText("shieldBypass:history.empty")).toBeVisible()
    expect(await protectionBypassHistoryStorage.list()).toEqual([])
  })

  it("offers retry when history cannot be read instead of showing an empty history", async () => {
    const user = userEvent.setup()
    const read = vi
      .spyOn(protectionBypassHistoryStorage, "list")
      .mockRejectedValueOnce(new Error("storage unavailable"))
    try {
      render(<ProtectionBypassHistory />, {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      })
      await user.click(
        screen.getByRole("button", { name: "shieldBypass:history.open" }),
      )
      expect(
        await screen.findByText("shieldBypass:history.loadFailed"),
      ).toBeVisible()
      expect(
        screen.queryByText("shieldBypass:history.empty"),
      ).not.toBeInTheDocument()
      await user.click(
        screen.getByRole("button", { name: "common:actions.retry" }),
      )
      expect(
        await screen.findByText("shieldBypass:history.empty"),
      ).toBeVisible()
    } finally {
      read.mockRestore()
    }
  })

  it("shows the denial and original HTTP evidence before expansion and searches diagnostic codes", async () => {
    const user = userEvent.setup()
    const id = await protectionBypassHistoryStorage.start({
      execution: createAutomaticProtectionBypassExecution(
        "account_refresh",
        "scheduled",
        "background",
      ),
      task: {
        kind: "api_fallback_fetch",
        params: {
          originUrl: "https://denied.example",
          fetchUrl: "https://denied.example/api",
          fallbackDiagnostic: { statusCode: 403, code: "HTTP_403" },
        },
      },
    })
    await protectionBypassHistoryStorage.finish(id, {
      decision: {
        kind: "denied",
        reason: "automatic_disabled",
        operation: "fetch",
        cause: "api_error_fallback",
        feature: "account_refresh",
        surface: "background",
      },
      response: { success: false, code: "TEMP_WINDOW_DISABLED" },
    })
    render(<ProtectionBypassHistory />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    await user.click(
      screen.getByRole("button", { name: "shieldBypass:history.open" }),
    )
    const dialog = within(
      await screen.findByRole("dialog", { name: "shieldBypass:history.title" }),
    )
    const summary = await dialog.findByRole("button", {
      name: /https:\/\/denied\.example/,
      expanded: false,
    })
    expect(summary).toHaveTextContent("HTTP 403")
    expect(summary).toHaveTextContent(
      "shieldBypass:history.denials.automatic_disabled",
    )

    const search = dialog.getByRole("searchbox", {
      name: "shieldBypass:history.search",
    })
    for (const query of ["403", "TEMP_WINDOW_DISABLED", "automatic_disabled"]) {
      await user.clear(search)
      await user.type(search, query)
      expect(
        dialog.getByRole("button", { name: /https:\/\/denied\.example/ }),
      ).toBeVisible()
    }
    await user.clear(search)
    await user.type(search, "absent")
    expect(dialog.getByText("shieldBypass:history.noMatches")).toBeVisible()
    await user.click(
      dialog.getByRole("button", { name: "shieldBypass:history.clearFilters" }),
    )
    expect(search).toHaveValue("")
    expect(
      dialog.getByRole("button", { name: /https:\/\/denied\.example/ }),
    ).toBeVisible()
  })

  it.each([
    ["automatic_disabled", SHIELD_SETTINGS_TARGET_IDS.enabled],
    ["feature_disabled", SHIELD_SETTINGS_TARGET_IDS.feature.account_refresh],
  ] as const)(
    "follows history links and returns to the relevant setting for %s",
    async (reason, targetId) => {
      const user = userEvent.setup()
      const enableSetting = vi.fn()
      const id = await protectionBypassHistoryStorage.start({
        execution: createAutomaticProtectionBypassExecution(
          "account_refresh",
          "scheduled",
          "background",
        ),
        task: {
          kind: "api_fallback_fetch",
          params: {
            originUrl: "https://settings.example",
            fetchUrl: "https://settings.example/api",
          },
        },
      })
      await protectionBypassHistoryStorage.finish(id, {
        decision: {
          kind: "denied",
          reason,
          operation: "fetch",
          cause: "api_error_fallback",
          feature: "account_refresh",
          surface: "background",
        },
      })
      window.history.replaceState(
        null,
        "",
        "/?tab=refresh&anchor=shield-history#basic",
      )
      render(
        <>
          <div id={targetId}>
            <button onClick={enableSetting}>Automatic setting</button>
          </div>
          <ProtectionBypassHistory />
        </>,
        {
          withUserPreferencesProvider: false,
          withThemeProvider: false,
        },
      )
      const dialog = within(
        await screen.findByRole("dialog", {
          name: "shieldBypass:history.title",
        }),
      )
      await user.click(
        await dialog.findByRole("button", {
          name: /https:\/\/settings\.example/,
        }),
      )
      expect(
        dialog.getByRole("heading", {
          name: "shieldBypass:history.groups.trigger",
        }),
      ).toBeVisible()
      expect(
        dialog.getByRole("heading", {
          name: "shieldBypass:history.groups.context",
        }),
      ).toBeVisible()
      await user.click(
        dialog.getByRole("button", {
          name: "shieldBypass:history.openSettings",
        }),
      )
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      )
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Automatic setting" }),
        ).toHaveFocus(),
      )
      expect(new URLSearchParams(window.location.search).get("anchor")).toBe(
        targetId,
      )
      expect(enableSetting).not.toHaveBeenCalled()

      await user.click(
        screen.getByRole("button", { name: "shieldBypass:history.open" }),
      )
      expect(
        await screen.findByRole("dialog", {
          name: "shieldBypass:history.title",
        }),
      ).toBeVisible()
      await user.keyboard("{Escape}")
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      )
      expect(
        new URLSearchParams(window.location.search).get("anchor"),
      ).not.toBe(SHIELD_SETTINGS_TARGET_IDS.history)
    },
  )

  it("keeps an expanded record in place while offering new records and updating its result", async () => {
    const user = userEvent.setup()
    const id = await protectionBypassHistoryStorage.start({
      execution: createAutomaticProtectionBypassExecution(
        "account_refresh",
        "scheduled",
        "background",
      ),
      task: {
        kind: "api_fallback_fetch",
        params: {
          originUrl: "https://reading.example",
          fetchUrl: "https://reading.example/api",
        },
      },
    })
    render(<ProtectionBypassHistory />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    await user.click(
      screen.getByRole("button", { name: "shieldBypass:history.open" }),
    )
    const dialog = within(
      await screen.findByRole("dialog", { name: "shieldBypass:history.title" }),
    )
    const summary = await dialog.findByRole("button", {
      name: /https:\/\/reading\.example/,
    })
    await user.click(summary)
    await act(async () => {
      await protectionBypassHistoryStorage.start({
        execution: createAutomaticProtectionBypassExecution(
          "account_refresh",
          "scheduled",
          "background",
        ),
        task: {
          kind: "api_fallback_fetch",
          params: {
            originUrl: "https://new.example",
            fetchUrl: "https://new.example/api",
          },
        },
      })
    })
    const showNewRecords = await dialog.findByRole("button", {
      name: /^shieldBypass:history.newRecords/,
    })
    expect(dialog.queryByText("https://new.example")).not.toBeInTheDocument()
    expect(summary).toHaveAttribute("aria-expanded", "true")

    await act(async () => {
      await protectionBypassHistoryStorage.finish(id, {
        context: { kind: "allowed", adapter: "tab", reused: true },
        response: { success: true, status: 200 },
      })
    })
    expect(
      await dialog.findByText("shieldBypass:history.statuses.completed"),
    ).toBeVisible()
    expect(dialog.getByText("shieldBypass:history.reused")).toBeVisible()
    expect(summary).toHaveAttribute("aria-expanded", "true")
    await user.click(showNewRecords)
    expect(dialog.getByText("https://new.example")).toBeVisible()
    expect(summary).toHaveAttribute("aria-expanded", "true")
    expect(
      dialog.queryByRole("button", {
        name: /^shieldBypass:history.newRecords/,
      }),
    ).not.toBeInTheDocument()
  })
})

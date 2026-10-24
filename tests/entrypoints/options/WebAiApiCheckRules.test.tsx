import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, expect, it, vi } from "vitest"

import { WebAiApiCheckSiteAccessSettings } from "~/features/BasicSettings/components/tabs/WebAiApiCheck/WebAiApiCheckSiteAccessSettings"
import {
  WEB_AI_API_CHECK_RULE_LIST,
  WEB_AI_API_CHECK_RULE_MUTATION,
  WEB_AI_API_CHECK_RULE_SYNTAX,
} from "~/services/verification/webAiApiCheck/siteRuleConstants"
import { buildUserPreferences } from "~~/tests/test-utils/factories"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"

const { mutate, context, tabs } = vi.hoisted(() => ({
  mutate: vi.fn(),
  context: vi.fn(),
  tabs: vi.fn(),
}))
vi.mock("~/contexts/UserPreferencesContext", () => ({
  UserPreferencesProvider: ({ children }: { children: ReactNode }) => children,
  useUserPreferencesContext: () => context(),
}))
vi.mock("~/utils/browser/tabs", () => ({ getAllTabs: () => tabs() }))
beforeEach(() => {
  vi.clearAllMocks()
  context.mockReturnValue({
    preferences: buildUserPreferences(),
    mutateWebAiApiCheckSiteRules: mutate,
  })
  mutate.mockResolvedValue({ ok: true, preferences: buildUserPreferences() })
  tabs.mockResolvedValue([])
})

it("previews three rules and independently expands the remaining entries", async () => {
  const user = userEvent.setup()
  const prefs = buildUserPreferences()
  prefs.webAiApiCheck!.autoDetect.siteRules = {
    priority: WEB_AI_API_CHECK_RULE_LIST.BLACKLIST,
    whitelist: Array.from({ length: 5 }, (_, i) => ({
      syntax: WEB_AI_API_CHECK_RULE_SYNTAX.WILDCARD,
      pattern: `*://white${i}.example/*`,
    })),
    blacklist: [
      {
        syntax: WEB_AI_API_CHECK_RULE_SYNTAX.WILDCARD,
        pattern: "*://black.example/*",
      },
    ],
  }
  context.mockReturnValue({
    preferences: prefs,
    mutateWebAiApiCheckSiteRules: mutate,
  })
  render(<WebAiApiCheckSiteAccessSettings autoDetectEnabled />)
  const white = document.getElementById("web-ai-api-check-included-sites")!
  const black = document.getElementById("web-ai-api-check-excluded-sites")!
  expect(within(white).getAllByRole("listitem")).toHaveLength(3)
  expect(within(black).getByText("*://black.example/*")).toBeVisible()
  expect(
    within(black).queryByRole("button", {
      name: "webAiApiCheck:settings.siteRules.showAll",
    }),
  ).not.toBeInTheDocument()
  const toggle = within(white).getByRole("button", {
    name: "webAiApiCheck:settings.siteRules.showAll",
  })
  expect(toggle).toHaveAttribute("aria-expanded", "false")
  await user.click(toggle)
  expect(within(white).getAllByRole("listitem")).toHaveLength(5)
  expect(within(white).getByText("*://white4.example/*")).toBeVisible()
  await user.keyboard("{Enter}")
  expect(within(white).getAllByRole("listitem")).toHaveLength(3)
  expect(mutate).not.toHaveBeenCalled()
  await user.click(
    within(white).getByRole("button", {
      name: "webAiApiCheck:settings.siteRules.addWhitelist",
    }),
  )
  await user.type(
    screen.getByRole("textbox", {
      name: "webAiApiCheck:settings.siteRules.content",
    }),
    "new.example",
  )
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "common:actions.add",
    }),
  )
  expect(within(white).getAllByRole("listitem")).toHaveLength(5)
})

it("names the website-list section before presenting the priority and individual lists", () => {
  render(<WebAiApiCheckSiteAccessSettings autoDetectEnabled />)
  const section = screen.getByRole("region", {
    name: "webAiApiCheck:settings.siteRules.title",
  })
  expect(
    within(section).getByRole("heading", {
      name: "webAiApiCheck:settings.siteRules.title",
    }),
  ).toBeVisible()
  expect(
    within(section).getByText("webAiApiCheck:settings.siteRules.description"),
  ).toBeVisible()
  expect(
    within(section).getByRole("heading", {
      name: "webAiApiCheck:settings.siteRules.whitelist",
    }),
  ).toBeVisible()
  expect(
    within(section).getByRole("group", {
      name: "webAiApiCheck:settings.siteRules.priority",
    }),
  ).toBeVisible()
})

it("configures pasted rules independently instead of changing every line's syntax", async () => {
  const user = userEvent.setup()
  render(<WebAiApiCheckSiteAccessSettings autoDetectEnabled />)
  await user.click(
    screen.getByRole("button", {
      name: "webAiApiCheck:settings.siteRules.addWhitelist",
    }),
  )
  fireEvent.change(
    screen.getByRole("textbox", {
      name: "webAiApiCheck:settings.siteRules.content",
    }),
    { target: { value: "https://one.example/path\nhttps://two.example/page" } },
  )
  const inputs = screen.getAllByRole("textbox", {
    name: "webAiApiCheck:settings.siteRules.content",
  })
  expect(inputs).toHaveLength(2)
  const rows = screen.getAllByRole("group", {
    name: "webAiApiCheck:settings.siteRules.content",
  })
  await user.click(
    within(rows[0]!).getByRole("button", {
      name: "webAiApiCheck:settings.siteRules.currentPage",
    }),
  )
  expect(
    within(rows[1]!).getByRole("combobox", {
      name: "webAiApiCheck:settings.siteRules.syntax",
    }),
  ).toHaveTextContent("webAiApiCheck:settings.siteRules.wildcard")
  await user.click(screen.getByRole("button", { name: "common:actions.add" }))
  await waitFor(() =>
    expect(mutate).toHaveBeenCalledWith({
      type: WEB_AI_API_CHECK_RULE_MUTATION.ADD,
      list: WEB_AI_API_CHECK_RULE_LIST.WHITELIST,
      rules: [
        {
          syntax: WEB_AI_API_CHECK_RULE_SYNTAX.EXACT,
          pattern: "https://one.example/path",
        },
        {
          syntax: WEB_AI_API_CHECK_RULE_SYNTAX.WILDCARD,
          pattern: "https://two.example/page",
        },
      ],
    }),
  )
})

it("selects multiple open websites without overwriting another row's edited scope", async () => {
  const user = userEvent.setup()
  tabs.mockResolvedValue([
    { url: "https://one.example/docs", title: "First", lastAccessed: 2 },
    { url: "https://two.example/page", title: "Second", lastAccessed: 1 },
  ])
  render(<WebAiApiCheckSiteAccessSettings autoDetectEnabled />)
  await user.click(
    screen.getByRole("button", {
      name: "webAiApiCheck:settings.siteRules.addWhitelist",
    }),
  )
  const picker = screen.getByRole("combobox", {
    name: "webAiApiCheck:settings.siteRules.tabPicker",
  })
  await user.type(picker, "First")
  await user.click(
    await screen.findByRole("option", { name: "First — https://one.example" }),
  )
  await user.click(
    screen.getByRole("button", {
      name: "webAiApiCheck:settings.siteRules.currentPage",
    }),
  )
  fireEvent.change(picker, { target: { value: "Second" } })
  await user.click(
    await screen.findByRole("option", { name: "Second — https://two.example" }),
  )
  const inputs = screen.getAllByRole("textbox", {
    name: "webAiApiCheck:settings.siteRules.content",
  })
  expect(inputs.map((input) => (input as HTMLTextAreaElement).value)).toEqual([
    "https://one.example/docs",
    "*://two.example/*",
  ])
  await user.clear(picker)
  await user.type(picker, "Second")
  await user.click(
    await screen.findByRole("option", { name: "Second — https://two.example" }),
  )
  expect(
    screen.getAllByRole("textbox", {
      name: "webAiApiCheck:settings.siteRules.content",
    }),
  ).toHaveLength(1)
  expect(
    screen.getByRole("textbox", {
      name: "webAiApiCheck:settings.siteRules.content",
    }),
  ).toHaveValue("https://one.example/docs")
  await user.clear(picker)
  await user.type(picker, "Second")
  await user.click(
    await screen.findByRole("option", { name: "Second — https://two.example" }),
  )
  expect(mutate).not.toHaveBeenCalled()
  await user.click(screen.getByRole("button", { name: "common:actions.add" }))
  await waitFor(() =>
    expect(mutate).toHaveBeenCalledWith({
      type: WEB_AI_API_CHECK_RULE_MUTATION.ADD,
      list: WEB_AI_API_CHECK_RULE_LIST.WHITELIST,
      rules: [
        {
          syntax: WEB_AI_API_CHECK_RULE_SYNTAX.EXACT,
          pattern: "https://one.example/docs",
        },
        {
          syntax: WEB_AI_API_CHECK_RULE_SYNTAX.WILDCARD,
          pattern: "*://two.example/*",
        },
      ],
    }),
  )
})

it("opens a secondary editor and only writes normalized deduplicated rules on confirmation", async () => {
  const user = userEvent.setup()
  render(<WebAiApiCheckSiteAccessSettings autoDetectEnabled />)
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  await user.click(
    screen.getByRole("button", {
      name: "webAiApiCheck:settings.siteRules.addWhitelist",
    }),
  )
  expect(
    screen.getByRole("heading", {
      name: "webAiApiCheck:settings.siteRules.addWhitelist",
    }),
  ).toBeVisible()
  const input = screen.getByRole("textbox", {
    name: "webAiApiCheck:settings.siteRules.content",
  })
  await user.click(input)
  await user.paste("docs.example.com\ndocs.example.com")
  await user.tab()
  expect(mutate).not.toHaveBeenCalled()
  await user.click(screen.getByRole("button", { name: "common:actions.add" }))
  await waitFor(() =>
    expect(mutate).toHaveBeenCalledWith({
      type: WEB_AI_API_CHECK_RULE_MUTATION.ADD,
      list: WEB_AI_API_CHECK_RULE_LIST.WHITELIST,
      rules: [
        {
          syntax: WEB_AI_API_CHECK_RULE_SYNTAX.WILDCARD,
          pattern: "*://docs.example.com/*",
        },
      ],
    }),
  )
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
})

it("retains invalid and failed drafts and preserves a cancelled add draft", async () => {
  const user = userEvent.setup()
  render(<WebAiApiCheckSiteAccessSettings autoDetectEnabled />)
  await user.click(
    screen.getByRole("button", {
      name: "webAiApiCheck:settings.siteRules.addBlacklist",
    }),
  )
  const input = screen.getByRole("textbox", {
    name: "webAiApiCheck:settings.siteRules.content",
  })
  await user.type(input, "bad rule")
  await user.click(screen.getByRole("button", { name: "common:actions.add" }))
  expect(mutate).not.toHaveBeenCalled()
  await user.clear(input)
  await user.type(input, "example.com")
  mutate.mockResolvedValueOnce({ ok: false, reason: { type: "storage-error" } })
  await user.click(screen.getByRole("button", { name: "common:actions.add" }))
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
  expect(input).toHaveValue("example.com")
  await user.click(
    screen.getByRole("button", { name: "common:actions.cancel" }),
  )
  await user.click(
    screen.getByRole("button", {
      name: "webAiApiCheck:settings.siteRules.addBlacklist",
    }),
  )
  expect(
    screen.getByRole("textbox", {
      name: "webAiApiCheck:settings.siteRules.content",
    }),
  ).toHaveValue("example.com")
})

import { waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { act, useState } from "react"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import { AccountCheckInPageField } from "~/features/AccountManagement/components/AccountDialog/checkin/AccountCheckInPageField"
import enAccountDialog from "~/locales/en/accountDialog.json"
import {
  NATIVE_CHECK_IN_PAGE_SOURCES,
  NATIVE_CHECK_IN_PAGE_STATES,
} from "~/services/checkin/discovery/evidence/scanTypes"
import { AuthTypeEnum } from "~/types"
import { executeProtectionBypassTask } from "~/utils/browser/tempWindowFetch"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { testI18n } from "~~/tests/test-utils/i18n"
import { render, screen } from "~~/tests/test-utils/render"

vi.mock("~/utils/browser/tempWindowFetch", () => ({
  executeProtectionBypassTask: vi.fn(),
}))

function Field({
  siteUrl = "https://site.test",
  siteType = SITE_TYPES.NEW_API,
  userId = "1",
}: {
  siteUrl?: string
  siteType?: AccountSiteType
  userId?: string
}) {
  const [checkIn, setCheckIn] = useState(
    buildCheckInConfig({ nativePagePath: "/old" }),
  )
  return (
    <AccountCheckInPageField
      checkIn={checkIn}
      onCheckInChange={setCheckIn}
      siteUrl={siteUrl}
      siteType={siteType}
      discoveryIdentity={{
        userId,
        accessToken: "test-token",
        authType: AuthTypeEnum.AccessToken,
        cookieAuthSessionCookie: "",
      }}
      discoveryEnabled
    />
  )
}

describe("native page configuration exploration", () => {
  afterAll(() => testI18n.removeResourceBundle("en", "accountDialog"))
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    testI18n.addResourceBundle(
      "en",
      "accountDialog",
      enAccountDialog,
      true,
      true,
    )
  })
  it("clears the configured draft path using the field action", async () => {
    const user = userEvent.setup()
    render(<Field />)
    const path = await screen.findByRole("textbox", {
      name: enAccountDialog.form.checkInPagePath,
    })
    await user.click(screen.getByRole("button", { name: /^Clear$/ }))
    expect(path).toHaveValue("")
    await waitFor(() => expect(path).toHaveFocus())
    expect(executeProtectionBypassTask).not.toHaveBeenCalled()
  })

  it("keeps detailed path guidance in accessible help without hiding validation errors", async () => {
    const user = userEvent.setup()
    render(<Field />)
    const path = await screen.findByRole("textbox", {
      name: enAccountDialog.form.checkInPagePath,
    })
    expect(
      screen.queryByText(enAccountDialog.form.checkInPagePathDesc),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: "About check-in page paths" }),
    )
    expect(
      screen.getByText(enAccountDialog.form.checkInPagePathDesc),
    ).toBeVisible()
    await user.keyboard("{Escape}")
    await user.clear(path)
    await user.type(path, "https://other.test/invite")
    expect(screen.getByRole("alert")).toHaveTextContent(
      enAccountDialog.form.checkInPagePathInvalid,
    )
    expect(path).toHaveAccessibleDescription(
      enAccountDialog.form.checkInPagePathInvalid,
    )
  })
  it("finds labelled candidates read-only and changes the draft only on Use path", async () => {
    vi.mocked(executeProtectionBypassTask).mockResolvedValue({
      success: true,
      data: {
        complete: true,
        candidates: [
          {
            path: "/invite",
            sources: [
              NATIVE_CHECK_IN_PAGE_SOURCES.Script,
              NATIVE_CHECK_IN_PAGE_SOURCES.Area,
            ],
            state: NATIVE_CHECK_IN_PAGE_STATES.Actionable,
          },
        ],
      },
    })
    const user = userEvent.setup()
    render(<Field />)
    await user.click(
      await screen.findByRole("button", { name: "Find check-in page" }),
    )
    expect(await screen.findByText("/invite")).toBeInTheDocument()
    expect(
      screen.getByText(enAccountDialog.form.checkInPageScriptEvidence),
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Use this path" }),
    ).toHaveAccessibleDescription("/invite")
    expect(
      screen.getByRole("button", { name: "Open to review" }),
    ).toHaveAccessibleDescription("/invite")
    expect(screen.getByRole("note")).toHaveTextContent(
      enAccountDialog.form.checkInPageActionable,
    )
    expect(
      screen.getByLabelText(enAccountDialog.form.checkInPagePath),
    ).toHaveValue("/old")
    expect(executeProtectionBypassTask).toHaveBeenCalledWith(
      expect.objectContaining({
        task: {
          kind: "checkin_page_discovery",
          params: expect.objectContaining({
            originUrl: "https://site.test",
            nativePagePath: "/old",
          }),
        },
      }),
    )
    await user.click(screen.getByRole("button", { name: "Use this path" }))
    expect(
      screen.getByLabelText(enAccountDialog.form.checkInPagePath),
    ).toHaveValue("/invite")
  })
  it("shows an area-only partial result once and still lets the user adopt its path", async () => {
    vi.mocked(executeProtectionBypassTask).mockResolvedValue({
      success: true,
      data: {
        complete: false,
        candidates: [
          {
            path: "/invite",
            sources: [NATIVE_CHECK_IN_PAGE_SOURCES.Area],
            state: NATIVE_CHECK_IN_PAGE_STATES.Area,
          },
        ],
      },
    })
    const user = userEvent.setup()
    render(<Field />)
    await user.click(
      await screen.findByRole("button", { name: "Find check-in page" }),
    )
    expect(
      await screen.findByText(enAccountDialog.form.checkInPageArea),
    ).toBeVisible()
    expect(
      screen.getByText(enAccountDialog.form.findCheckInPagePartial),
    ).toBeVisible()
    expect(
      screen.queryByText(enAccountDialog.form.checkInPageAreaEvidence),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(enAccountDialog.form.checkInPageActionable),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Use this path" }))
    expect(
      screen.getByRole("textbox", {
        name: enAccountDialog.form.checkInPagePath,
      }),
    ).toHaveValue("/invite")
  })
  it("does not announce a cancelled search when only editing an invalid path", async () => {
    const user = userEvent.setup()
    render(<Field />)
    await user.type(
      await screen.findByLabelText(enAccountDialog.form.checkInPagePath),
      " ",
    )
    expect(
      screen.queryByText(enAccountDialog.form.findCheckInPageCancelled),
    ).not.toBeInTheDocument()
  })
  it("opens the same-site candidate without adopting it and clears an open error after retry", async () => {
    vi.mocked(executeProtectionBypassTask).mockResolvedValue({
      success: true,
      data: {
        complete: true,
        candidates: [
          {
            path: "/invite?tab=daily#/claim",
            sources: [NATIVE_CHECK_IN_PAGE_SOURCES.Navigation],
            state: NATIVE_CHECK_IN_PAGE_STATES.Unverified,
          },
        ],
      },
    })
    vi.spyOn(browser.tabs, "create")
      .mockRejectedValueOnce(new Error("Could not open tab"))
      .mockResolvedValueOnce({ id: 1 } as browser.tabs.Tab)
    const user = userEvent.setup()
    render(<Field />)
    await user.click(
      await screen.findByRole("button", { name: "Find check-in page" }),
    )
    const open = await screen.findByRole("button", {
      name: enAccountDialog.form.checkInPageOpen,
    })
    await user.click(open)
    expect(
      await screen.findByText(enAccountDialog.form.checkInPageOpenFailed),
    ).toBeVisible()
    await user.click(open)
    expect(browser.tabs.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: "https://site.test/invite?tab=daily#/claim",
        active: true,
      }),
    )
    expect(
      screen.getByRole("textbox", {
        name: enAccountDialog.form.checkInPagePath,
      }),
    ).toHaveValue("/old")
    expect(
      screen.queryByText(enAccountDialog.form.checkInPageOpenFailed),
    ).not.toBeInTheDocument()
  })
  it.each(["search", "invalid-edit", "same-path-use", "site-type", "identity"])(
    "clears a candidate open error after %s without changing the saved path",
    async (action) => {
      vi.mocked(executeProtectionBypassTask).mockResolvedValue({
        success: true,
        data: {
          complete: true,
          candidates: [
            {
              path: "/old",
              sources: [NATIVE_CHECK_IN_PAGE_SOURCES.Script],
              state: NATIVE_CHECK_IN_PAGE_STATES.Actionable,
            },
          ],
        },
      })
      vi.spyOn(browser.tabs, "create").mockRejectedValue(
        new Error("Tab unavailable"),
      )
      const user = userEvent.setup()
      const view = render(<Field />)
      const find = await screen.findByRole("button", {
        name: "Find check-in page",
      })
      await user.click(find)
      await user.click(
        await screen.findByRole("button", { name: "Open to review" }),
      )
      expect(
        await screen.findByText(enAccountDialog.form.checkInPageOpenFailed),
      ).toBeVisible()
      if (action === "search") await user.click(find)
      else if (action === "invalid-edit")
        await user.type(
          screen.getByLabelText(enAccountDialog.form.checkInPagePath),
          " ",
        )
      else if (action === "site-type")
        view.rerender(<Field siteType={SITE_TYPES.VELOERA} />)
      else if (action === "identity") view.rerender(<Field userId="2" />)
      else
        await user.click(screen.getByRole("button", { name: "Use this path" }))
      expect(
        screen.queryByText(enAccountDialog.form.checkInPageOpenFailed),
      ).not.toBeInTheDocument()
    },
  )
  it.each([
    "search",
    "invalid-edit",
    "same-path-use",
    "retry",
    "site-change",
    "site-type",
    "identity",
  ])("ignores a late tab-open failure after %s", async (action) => {
    vi.mocked(executeProtectionBypassTask).mockResolvedValue({
      success: true,
      data: {
        complete: true,
        candidates: [
          {
            path: "/old",
            sources: [NATIVE_CHECK_IN_PAGE_SOURCES.Script],
            state: NATIVE_CHECK_IN_PAGE_STATES.Actionable,
          },
        ],
      },
    })
    let rejectOpen!: (reason: Error) => void
    vi.spyOn(browser.tabs, "create")
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectOpen = reject
          }),
      )
      .mockResolvedValue({ id: 1 } as browser.tabs.Tab)
    const user = userEvent.setup()
    const view = render(<Field />)
    const find = await screen.findByRole("button", {
      name: "Find check-in page",
    })
    await user.click(find)
    const open = await screen.findByRole("button", { name: "Open to review" })
    await user.click(open)
    if (action === "search") await user.click(find)
    else if (action === "invalid-edit")
      await user.type(
        screen.getByLabelText(enAccountDialog.form.checkInPagePath),
        " ",
      )
    else if (action === "same-path-use")
      await user.click(screen.getByRole("button", { name: "Use this path" }))
    else if (action === "retry") await user.click(open)
    else if (action === "site-type")
      view.rerender(<Field siteType={SITE_TYPES.VELOERA} />)
    else if (action === "identity") view.rerender(<Field userId="2" />)
    else view.rerender(<Field siteUrl="https://other.test" />)
    await act(async () => {
      rejectOpen(new Error("Late tab failure"))
    })
    expect(
      screen.queryByText(enAccountDialog.form.checkInPageOpenFailed),
    ).not.toBeInTheDocument()
  })
  it.each(["cancel", "site-change"])(
    "ignores a late result after %s and keeps the path",
    async (mode) => {
      let finish!: (
        value: Awaited<ReturnType<typeof executeProtectionBypassTask>>,
      ) => void
      vi.mocked(executeProtectionBypassTask).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          }),
      )
      const user = userEvent.setup()
      const view = render(<Field />)
      await user.click(
        await screen.findByRole("button", { name: "Find check-in page" }),
      )
      if (mode === "cancel") {
        const cancel = await screen.findByRole("button", {
          name: "Cancel search",
        })
        expect(cancel).toHaveFocus()
        expect(
          within(screen.getByRole("status")).queryByRole("button"),
        ).not.toBeInTheDocument()
        await user.click(cancel)
        expect(
          screen.getByRole("button", { name: "Find check-in page" }),
        ).toHaveFocus()
      } else view.rerender(<Field siteUrl="https://other.test" />)
      await act(async () => {
        finish({
          success: true,
          data: {
            complete: true,
            candidates: [
              {
                path: "/invite",
                sources: [NATIVE_CHECK_IN_PAGE_SOURCES.Script],
                state: NATIVE_CHECK_IN_PAGE_STATES.Actionable,
              },
            ],
          },
        })
      })
      expect(screen.queryByText("/invite")).not.toBeInTheDocument()
      expect(
        screen.getByLabelText(enAccountDialog.form.checkInPagePath),
      ).toHaveValue("/old")
    },
  )
  it("keeps the path after failure and allows a successful empty retry", async () => {
    vi.mocked(executeProtectionBypassTask)
      .mockRejectedValueOnce(new Error("Disconnected"))
      .mockResolvedValueOnce({
        success: true,
        data: { complete: true, candidates: [] },
      })
    const user = userEvent.setup()
    render(<Field />)
    await user.click(
      await screen.findByRole("button", { name: "Find check-in page" }),
    )
    expect(
      await screen.findByText(enAccountDialog.form.findCheckInPageFailed),
    ).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Find check-in page" }))
    expect(
      await screen.findByText(enAccountDialog.form.findCheckInPageEmpty),
    ).toBeVisible()
    expect(
      screen.queryByRole("list", {
        name: enAccountDialog.form.findCheckInPageCandidates,
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByLabelText(enAccountDialog.form.checkInPagePath),
    ).toHaveValue("/old")
  })
})

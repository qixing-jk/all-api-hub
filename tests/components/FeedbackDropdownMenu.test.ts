import { beforeEach, describe, expect, it, vi } from "vitest"

import { FEEDBACK_MENU_ITEMS } from "~/components/FeedbackDropdownMenu"
import {
  openBugReportPage,
  openCommunityPage,
  openFeatureRequestPage,
  openLanguageRequestPage,
  openSiteSupportRequestPage,
} from "~/utils/navigation"

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/navigation")>()
  return {
    ...actual,
    openBugReportPage: vi.fn(),
    openCommunityPage: vi.fn(),
    openFeatureRequestPage: vi.fn(),
    openLanguageRequestPage: vi.fn(),
    openSiteSupportRequestPage: vi.fn(),
  }
})

const mockedOpenBugReportPage = vi.mocked(openBugReportPage)
const mockedOpenCommunityPage = vi.mocked(openCommunityPage)
const mockedOpenFeatureRequestPage = vi.mocked(openFeatureRequestPage)
const mockedOpenLanguageRequestPage = vi.mocked(openLanguageRequestPage)
const mockedOpenSiteSupportRequestPage = vi.mocked(openSiteSupportRequestPage)

describe("FeedbackDropdownMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("defines every feedback shortcut label", () => {
    expect(FEEDBACK_MENU_ITEMS.map((item) => item.labelKey)).toEqual([
      "feedback.bugReport",
      "feedback.featureRequest",
      "feedback.siteSupportRequest",
      "feedback.languageRequest",
      "feedback.community",
    ])
  })

  it.each([
    ["feedback.bugReport", mockedOpenBugReportPage, undefined],
    ["feedback.featureRequest", mockedOpenFeatureRequestPage, undefined],
    [
      "feedback.siteSupportRequest",
      mockedOpenSiteSupportRequestPage,
      undefined,
    ],
    ["feedback.languageRequest", mockedOpenLanguageRequestPage, undefined],
    ["feedback.community", mockedOpenCommunityPage, "ja"],
  ])("opens %s from the shared feedback menu item", (labelKey, open, arg) => {
    FEEDBACK_MENU_ITEMS.find((item) => item.labelKey === labelKey)?.open("ja")

    if (arg === undefined) {
      expect(open).toHaveBeenCalledWith()
    } else {
      expect(open).toHaveBeenCalledWith(arg)
    }
    expect(open).toHaveBeenCalledTimes(1)
  })
})

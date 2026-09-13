import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, vi } from "vitest"

import AccountFilterBar from "~/features/AccountManagement/components/AccountList/AccountFilterBar"
import { testI18n } from "~~/tests/test-utils/i18n"

const options = [
  { value: "all", label: "All entries" },
  { value: "matching", label: "Matching entries", count: 2 },
  { value: "empty", label: "No matches", count: 0 },
]

describe("AccountFilterBar", () => {
  it.each(["site-type", "check-in", "refresh", "disabled"])(
    "selects and clears the %s filter while retaining the other selections",
    async (filter) => {
      const onChange = vi.fn()
      function Example() {
        const [values, setValues] = useState<Record<string, string>>({})
        const change = (key: string) => (value: string) => {
          onChange(key, value)
          setValues((previous) => ({ ...previous, [key]: value }))
        }
        return (
          <AccountFilterBar
            siteTypeValue={values["site-type"] ?? "all"}
            checkInValue={values["check-in"] ?? "all"}
            refreshValue={values.refresh ?? "all"}
            disabledValue={values.disabled ?? "all"}
            siteTypeOptions={options}
            checkInOptions={options}
            refreshOptions={options}
            disabledOptions={options}
            onSiteTypeChange={change("site-type")}
            onCheckInChange={change("check-in")}
            onRefreshChange={change("refresh")}
            onDisabledChange={change("disabled")}
          />
        )
      }
      const user = userEvent.setup()
      render(
        <I18nextProvider i18n={testI18n}>
          <Example />
        </I18nextProvider>,
      )
      const trigger = screen.getByTestId(`account-filter-${filter}`)
      expect(trigger).toHaveAttribute("title", "All entries")
      await user.click(trigger)
      const listbox = screen.getByRole("listbox")
      expect(
        within(listbox).getByRole("option", { name: /No matches/ }),
      ).toHaveAttribute("data-count", "0")
      await user.click(
        within(listbox).getByRole("option", { name: /Matching entries/ }),
      )
      expect(onChange).toHaveBeenLastCalledWith(filter, "matching")
      expect(trigger).toHaveAttribute("title", "Matching entries")
      expect(trigger).toHaveTextContent("Matching entries")
      expect(
        screen
          .getAllByRole("combobox")
          .filter((item) => item.title === "All entries"),
      ).toHaveLength(3)
      await user.click(trigger)
      await user.click(screen.getByRole("option", { name: "All entries" }))
      expect(onChange).toHaveBeenLastCalledWith(filter, "all")
      expect(trigger).toHaveAttribute("title", "All entries")
    },
  )
})

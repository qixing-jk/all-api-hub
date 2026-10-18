import { expect, it } from "vitest"

import { PermissionRow } from "~/features/Permissions/components/PermissionList"
import { render, screen } from "~~/tests/test-utils/render"

it("renders a permission row without inventing a status badge when no status label is supplied", () => {
  render(
    <PermissionRow
      item={{
        id: "custom",
        title: "Custom capability",
        description: "Read the browser instructions",
        rightContent: <button>Details</button>,
      }}
    />,
    {
      withReleaseUpdateStatusProvider: false,
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    },
  )
  expect(screen.getByText("Custom capability")).toBeVisible()
  expect(screen.getByText("Read the browser instructions")).toBeVisible()
  expect(screen.getByRole("button", { name: "Details" })).toBeVisible()
  expect(document.querySelector('[data-slot="badge"]')).toBeNull()
})

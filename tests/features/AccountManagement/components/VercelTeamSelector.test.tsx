import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { useState } from "react"
import { afterEach, expect, it } from "vitest"

import { VercelTeamSelector } from "~/features/AccountManagement/components/AccountDialog/form/VercelTeamSelector"
import { server } from "~~/tests/msw/server"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

afterEach(() => server.resetHandlers())

it("offers all accessible teams without replacing an existing non-default selection", async () => {
  const user = userEvent.setup()
  server.use(
    http.get("https://api.vercel.com/v2/teams", () =>
      HttpResponse.json({
        teams: [
          { id: "team_a", name: "Alpha", slug: "a" },
          { id: "team_b", name: "Beta", slug: "b" },
        ],
      }),
    ),
  )
  function Harness() {
    const [selected, setSelected] = useState("team_b")
    return (
      <>
        <VercelTeamSelector
          accessToken="pat"
          value={selected}
          onChange={setSelected}
        />
        <output>{selected}</output>
      </>
    )
  }
  render(<Harness />)
  const selector = await screen.findByRole("combobox")
  await waitFor(() => expect(selector).toHaveTextContent("Beta"))
  await user.click(selector)
  await user.click(await screen.findByRole("option", { name: /Alpha/ }))
  expect(screen.getByRole("status")).toHaveTextContent("team_a")
})

it("automatically retains the only accessible team in a fresh form", async () => {
  server.use(
    http.get("https://api.vercel.com/v2/teams", () =>
      HttpResponse.json({
        teams: [{ id: "team_a", name: "Alpha", slug: "a" }],
      }),
    ),
  )
  function Harness() {
    const [selected, setSelected] = useState("")
    return (
      <form>
        <VercelTeamSelector
          accessToken="pat"
          value={selected}
          onChange={setSelected}
        />
        <output>{selected}</output>
      </form>
    )
  }
  render(<Harness />)
  await waitFor(() =>
    expect(screen.getByRole("combobox")).toHaveTextContent("Alpha"),
  )
  expect(screen.getByRole("status")).toHaveTextContent("team_a")
})

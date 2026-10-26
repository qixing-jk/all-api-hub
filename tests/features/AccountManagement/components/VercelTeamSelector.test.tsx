import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { useState } from "react"
import { afterEach, expect, it, vi } from "vitest"

import { VercelTeamSelector } from "~/features/AccountManagement/components/AccountDialog/form/VercelTeamSelector"
import { server } from "~~/tests/msw/server"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

afterEach(() => server.resetHandlers())

it("keeps the replacement token's teams when the previous request finishes late", async () => {
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const started = vi.fn()
  server.use(
    http.get("https://api.vercel.com/v2/teams", async ({ request }) => {
      if (request.headers.get("Authorization") === "Bearer old") {
        started()
        await pending
        return HttpResponse.json({ teams: [{ id: "old-team", slug: "old" }] })
      }
      return HttpResponse.json({ teams: [{ id: "new-team", slug: "new" }] })
    }),
  )
  const onChange = vi.fn()
  const { rerender } = render(
    <VercelTeamSelector accessToken="old" value="" onChange={onChange} />,
  )
  await waitFor(() => expect(started).toHaveBeenCalled())
  rerender(
    <VercelTeamSelector accessToken="new" value="" onChange={onChange} />,
  )
  await waitFor(() => expect(onChange).toHaveBeenCalledWith("new-team"))
  release()
  await waitFor(() => expect(screen.getByRole("combobox")).toBeEnabled())
  expect(onChange).not.toHaveBeenCalledWith("old-team")
})

it("offers retry after a failed team lookup and requires a choice for several teams", async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  server.use(
    http.get(
      "https://api.vercel.com/v2/teams",
      () => new HttpResponse(null, { status: 503 }),
    ),
  )
  render(
    <VercelTeamSelector
      accessToken="pat"
      value="unavailable-team"
      onChange={onChange}
    />,
  )
  expect(await screen.findByRole("alert")).toBeVisible()
  expect(screen.getByRole("combobox")).toBeDisabled()
  server.use(
    http.get("https://api.vercel.com/v2/teams", () =>
      HttpResponse.json({
        teams: [
          { id: "a", slug: "alpha" },
          { id: "b", slug: "beta" },
        ],
      }),
    ),
  )
  await user.click(screen.getByRole("button", { name: /retry/i }))
  await waitFor(() => expect(screen.getByRole("combobox")).toBeEnabled())
  expect(onChange).toHaveBeenCalledWith("")
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
})

it("does not load teams for an empty token", async () => {
  const onChange = vi.fn()
  render(<VercelTeamSelector accessToken=" " value="" onChange={onChange} />)
  expect(await screen.findByRole("combobox")).toBeDisabled()
  expect(onChange).not.toHaveBeenCalled()
})

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

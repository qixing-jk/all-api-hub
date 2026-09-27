import { describe, expect, it } from "vitest"

import { resolveGitHubRepoStarState } from "~/services/starPromotion/githubStarButton"

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html")
}

describe("resolveGitHubRepoStarState", () => {
  it("detects an already-starred toggle", () => {
    const doc = parse(`
      <html><body>
        <button aria-pressed="true" aria-label="Star qixing-jk/all-api-hub">Starred</button>
      </body></html>
    `)

    expect(resolveGitHubRepoStarState(doc)).toBe("starred")
  })

  it("detects a not-starred toggle", () => {
    const doc = parse(`
      <html><body>
        <button aria-pressed="false" aria-label="Star qixing-jk/all-api-hub">Star</button>
      </body></html>
    `)

    expect(resolveGitHubRepoStarState(doc)).toBe("not_starred")
  })

  it("falls back to star form actions", () => {
    const starred = parse(`
      <html><body>
        <form action="/search"><button>Search</button></form>
        <form action="/qixing-jk/all-api-hub/unstar"><button>Starred</button></form>
      </body></html>
    `)
    const notStarred = parse(`
      <html><body>
        <form action="/qixing-jk/all-api-hub/star?return_to=1"><button>Star</button></form>
      </body></html>
    `)

    expect(resolveGitHubRepoStarState(starred)).toBe("starred")
    expect(resolveGitHubRepoStarState(notStarred)).toBe("not_starred")
  })

  it("returns null when the viewer is signed out", () => {
    const doc = parse(`
      <html><body>
        <a href="/login?return_to=%2Fqixing-jk%2Fall-api-hub%2Fstar">Sign in to star</a>
      </body></html>
    `)

    expect(resolveGitHubRepoStarState(doc)).toBeNull()
  })

  it("returns null before the star control hydrates", () => {
    const doc = parse(
      '<html><body><div id="repo-stars-counter-star">42</div></body></html>',
    )

    expect(resolveGitHubRepoStarState(doc)).toBeNull()
  })

  it("ignores unrelated pressed buttons without star semantics", () => {
    const doc = parse(`
      <html><body>
        <button aria-pressed="true" aria-label="Wrap lines">Wrap</button>
      </body></html>
    `)

    expect(resolveGitHubRepoStarState(doc)).toBeNull()
  })
})

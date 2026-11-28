import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest"

import { submitPmplanKeyCreation } from "~~/scripts/suites/pmplan/keyCreation.mjs"

const origin = "https://plan.pmcat.top"
const input = { expires_at: null, models: ["test-model"] }
let browser: Browser
let context: BrowserContext
let page: Page
let directory: string

beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
})
afterAll(async () => browser.close())
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "pmplan-creation-"))
  context = await browser.newContext()
  await context.route(`${origin}/**`, async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ json: { id: 17, key: "sk-pm-owned" } })
    } else {
      await route.fulfill({
        contentType: "text/html",
        body: `
        <section data-testid="key-management-native-editor">
          <button data-testid="key-management-native-editor-submit-button">Save</button>
        </section>`,
      })
    }
  })
  page = await context.newPage()
  await page.goto(origin)
  await page.evaluate((input) => {
    document.querySelector("button")!.onclick = () => {
      void fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }).catch(() => {})
    }
  }, input)
})
afterEach(async () => {
  vi.restoreAllMocks()
  await context.close()
  for (const file of await fs.readdir(directory))
    await fs.unlink(path.join(directory, file))
  await fs.rmdir(directory)
})

it("retains the confirmed cleanup ID even if writing creation evidence fails", async () => {
  const confirmedIds = new Set<number>()
  vi.spyOn(fs, "writeFile").mockRejectedValueOnce(new Error("ENOSPC"))
  await expect(
    submitPmplanKeyCreation({
      page,
      input,
      write: true,
      confirmedIds,
      existingIds: new Set(),
      evidenceDir: directory,
    }),
  ).rejects.toThrow("ENOSPC")
  expect([...confirmedIds]).toEqual([17])
})

it("preserves capture failure when restoring the page observer also fails", async () => {
  vi.spyOn(fs, "writeFile").mockRejectedValueOnce(new Error("ENOSPC"))
  const evaluate = page.evaluate.bind(page)
  vi.spyOn(page, "evaluate").mockImplementation(((callback: any, arg: any) => {
    if (
      String(callback).includes("delete window.__aahPmplanCreateObservation")
    ) {
      return Promise.reject(new Error("observer restore failed"))
    }
    return evaluate(callback, arg)
  }) as typeof page.evaluate)
  const failure = await submitPmplanKeyCreation({
    page,
    input,
    write: true,
    confirmedIds: new Set(),
    existingIds: new Set(),
    evidenceDir: directory,
  }).catch((error: unknown) => error)
  expect(failure).toBeInstanceOf(AggregateError)
  expect(
    (failure as AggregateError).errors.map((error: Error) => error.message),
  ).toEqual(["ENOSPC", "observer restore failed"])
})

it("keeps plaintext only in memory and persists only cleanup metadata", async () => {
  const result = await submitPmplanKeyCreation({
    page,
    input,
    write: true,
    confirmedIds: new Set(),
    existingIds: new Set(),
    evidenceDir: directory,
  })
  expect(result.key).toBe("sk-pm-owned")
  const evidence = await fs.readFile(
    path.join(directory, "created-key-17.json"),
    "utf8",
  )
  expect(evidence).not.toContain("sk-pm-owned")
  expect(JSON.parse(evidence)).toEqual({ id: 17 })
})

it("fails duplicate matching dispatch and retains every confirmed cleanup ID", async () => {
  let nextId = 17
  await context.route(`${origin}/api/keys`, (route) =>
    route.fulfill({ json: { id: nextId++, key: "sk-pm-owned" } }),
  )
  await page.evaluate((input) => {
    document.querySelector("button")!.onclick = async () => {
      for (let i = 0; i < 2; i++)
        await fetch("/api/keys", {
          method: "POST",
          body: JSON.stringify(input),
        })
    }
  }, input)
  const confirmedIds = new Set<number>()
  await expect(
    submitPmplanKeyCreation({
      page,
      input,
      write: true,
      confirmedIds,
      existingIds: new Set(),
      evidenceDir: directory,
    }),
  ).rejects.toThrow(/Duplicate/)
  expect([...confirmedIds]).toEqual([17, 18])
})

it("retains an accidentally created key when the validation-only submission regresses", async () => {
  await page.locator("section").evaluate((section) => {
    section.append(document.createTextNode("Enter a valid value."))
  })
  const confirmedIds = new Set<number>()
  await expect(
    submitPmplanKeyCreation({
      page,
      input,
      write: true,
      confirmedIds,
      existingIds: new Set(),
      evidenceDir: directory,
      expectValidationError: true,
    }),
  ).rejects.toThrow("Invalid custom expiry reached the server")
  expect([...confirmedIds]).toEqual([17])
})

it("accepts validation feedback without a request or cleanup ownership", async () => {
  await page.evaluate(() => {
    document.querySelector("button")!.onclick = () => {
      document
        .querySelector("section")!
        .append(document.createTextNode("Enter a valid value."))
    }
  })
  const confirmedIds = new Set<number>()
  await expect(
    submitPmplanKeyCreation({
      page,
      input,
      write: true,
      confirmedIds,
      existingIds: new Set(),
      evidenceDir: directory,
      expectValidationError: true,
    }),
  ).resolves.toBeUndefined()
  expect([...confirmedIds]).toEqual([])
})

it("keeps capture available while the editor and submit action become ready", async () => {
  await page.evaluate(() => {
    const editor = document.querySelector("section")!
    const submit = document.querySelector("button")!
    editor.hidden = true
    submit.disabled = true
    setTimeout(() => {
      editor.hidden = false
    }, 350)
    setTimeout(() => {
      submit.disabled = false
    }, 700)
  })
  const confirmedIds = new Set<number>()
  await expect(
    submitPmplanKeyCreation({
      page,
      input,
      write: true,
      confirmedIds,
      existingIds: new Set(),
      evidenceDir: directory,
      timeoutMs: 500,
    }),
  ).resolves.toEqual({ id: 17, key: "sk-pm-owned" })
  expect([...confirmedIds]).toEqual([17])
})

it("captures only the submitted page request while another tab creates the same key configuration", async () => {
  const other = await context.newPage()
  await other.goto(origin)
  const confirmedIds = new Set<number>()
  let ownedPosts = 0
  await context.route(`${origin}/api/keys`, async (route) => {
    if (route.request().frame().page() !== page) {
      await route.fulfill({ json: { id: 999, key: "sk-pm-other" } })
      return
    }
    ownedPosts++
    await other.evaluate(async (input) => {
      await fetch("/api/keys", { method: "POST", body: JSON.stringify(input) })
    }, input)
    await route.fulfill({ json: { id: 17, key: "sk-pm-owned" } })
  })
  await expect(
    submitPmplanKeyCreation({
      page,
      input,
      write: true,
      confirmedIds,
      existingIds: new Set(),
      evidenceDir: directory,
    }),
  ).resolves.toEqual({ id: 17, key: "sk-pm-owned" })
  expect([...confirmedIds]).toEqual([17])
  expect(ownedPosts).toBe(1)
  expect(await fs.readdir(directory)).toEqual(["created-key-17.json"])
})

it("does not attribute a different payload from the same page to this submission", async () => {
  await page.evaluate((input) => {
    document.querySelector("button")!.onclick = async () => {
      await fetch("/api/keys", {
        method: "POST",
        body: JSON.stringify({ ...input, models: [] }),
      })
      await fetch("/api/keys", { method: "POST", body: JSON.stringify(input) })
    }
  }, input)
  await context.route(`${origin}/api/keys`, async (route) => {
    const matches = route.request().postDataJSON().models.length === 1
    await route.fulfill({
      json: { id: matches ? 17 : 999, key: "sk-pm-fixture" },
    })
  })
  const confirmedIds = new Set<number>()
  await submitPmplanKeyCreation({
    page,
    input,
    write: true,
    confirmedIds,
    existingIds: new Set(),
    evidenceDir: directory,
  })
  expect([...confirmedIds]).toEqual([17])
})

it("refuses read-only creation before submitting or installing listeners", async () => {
  const confirmedIds = new Set<number>()
  const requests: string[] = []
  page.on("request", (request) => requests.push(request.method()))
  await expect(
    submitPmplanKeyCreation({
      page,
      input,
      write: false,
      confirmedIds,
      existingIds: new Set(),
      evidenceDir: directory,
    }),
  ).rejects.toThrow("requires --write")
  expect(requests).toEqual([])
  expect([...confirmedIds]).toEqual([])
})

it("never claims an existing inventory ID even if a create response returns it", async () => {
  const confirmedIds = new Set<number>()
  await expect(
    submitPmplanKeyCreation({
      page,
      input,
      write: true,
      confirmedIds,
      evidenceDir: directory,
      existingIds: new Set([17]),
    }),
  ).rejects.toThrow("existing")
  expect([...confirmedIds]).toEqual([])
})

it.each(["rejected", "lost", "invalid-id"])(
  "does not replay or claim an unconfirmed create (%s)",
  async (failure) => {
    let posts = 0
    await context.route(`${origin}/api/keys`, async (route) => {
      posts++
      if (failure === "lost") await route.abort("failed")
      else
        await route.fulfill({
          status: failure === "rejected" ? 403 : 200,
          json: { id: -1 },
        })
    })
    const confirmedIds = new Set<number>()
    await expect(
      submitPmplanKeyCreation({
        page,
        input,
        write: true,
        confirmedIds,
        existingIds: new Set(),
        evidenceDir: directory,
      }),
    ).rejects.toThrow()
    expect(posts).toBe(1)
    expect([...confirmedIds]).toEqual([])
  },
)

it.each(["body", "evidence"])(
  "bounds %s capture and does not claim late responses after cleanup can begin",
  async (stage) => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    let started = false
    if (stage === "body") {
      page.on("response", (response) => {
        if (response.request().method() !== "POST") return
        vi.spyOn(response, "json").mockImplementation(async () => {
          started = true
          await pending
          return { id: 17, key: "sk-pm-owned" }
        })
      })
    } else {
      vi.spyOn(fs, "writeFile").mockImplementationOnce(async () => {
        started = true
        await pending
      })
    }
    const confirmedIds = new Set<number>()
    let guardTimeout: ReturnType<typeof setTimeout>
    const guard = new Promise<never>((_, reject) => {
      guardTimeout = setTimeout(
        () => reject(new Error("Capture did not respect its deadline")),
        1500,
      )
    })
    try {
      await expect(
        Promise.race([
          submitPmplanKeyCreation({
            page,
            input,
            write: true,
            confirmedIds,
            existingIds: new Set(),
            evidenceDir: directory,
            timeoutMs: 500,
          }),
          guard,
        ]),
      ).rejects.toThrow("timed out")
      expect(started).toBe(true)
    } finally {
      clearTimeout(guardTimeout!)
      release()
    }
    await pending
    await Promise.resolve()
    expect([...confirmedIds]).toEqual(stage === "body" ? [] : [17])
  },
)

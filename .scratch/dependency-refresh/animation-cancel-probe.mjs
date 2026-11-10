import assert from "node:assert/strict"
import { chromium } from "@playwright/test"

// Prerequisite: npm install --prefix .scratch/dependency-refresh/artifacts/happy-probe
// --ignore-scripts --no-audit --no-fund happy-dom@21.0.4
// Run with the project's Node version and an installed Playwright Chromium.
// This bounded probe compares native cancellation, not the whole account UI.
const { Window } =
  await import("./artifacts/happy-probe/node_modules/happy-dom/lib/index.js")
const errors = []
const onRejection = (error) => errors.push(error?.name)
process.on("unhandledRejection", onRejection)
const window = new Window()
try {
  const div = window.document.body.appendChild(
    window.document.createElement("div"),
  )
  div.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1800 }).cancel()
  // Give unhandled-rejection reporting a task turn; this is not animation settling.
  await new Promise((resolve) => setTimeout(resolve, 100))
  assert.deepEqual(errors, ["AbortError"])
  console.log(
    JSON.stringify({ environment: "happy-dom 21.0.4", unhandled: errors }),
  )
} finally {
  await window.happyDOM.close()
  process.off("unhandledRejection", onRejection)
}

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  for (const chainFinished of [false, true]) {
    const unhandled = await page.evaluate(async (chain) => {
      const errors = []
      const listener = (event) => {
        errors.push(event.reason?.name)
        event.preventDefault()
      }
      window.addEventListener("unhandledrejection", listener)
      const div = document.body.appendChild(document.createElement("div"))
      const animation = div.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 1800,
      })
      if (chain) animation.finished.then(() => {})
      animation.cancel()
      await new Promise((resolve) => setTimeout(resolve, 100))
      window.removeEventListener("unhandledrejection", listener)
      div.remove()
      return errors
    }, chainFinished)
    assert.deepEqual(unhandled, chainFinished ? ["AbortError"] : [])
    console.log(
      JSON.stringify({
        environment: browser.version(),
        chainFinished,
        unhandled,
      }),
    )
  }
} finally {
  await browser.close()
}

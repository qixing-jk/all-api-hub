// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://gateway.example/login"}
import { afterEach, expect, it, vi } from "vitest"

import {
  acceptLoginAgreement,
  enterPasswordLogin,
  findPasswordLoginForm,
} from "~/services/accountLogin/passwordForm"

afterEach(() => {
  document.body.innerHTML = ""
  vi.useRealTimers()
})

it.each([
  '<input type="password"><input name="username">',
  '<form action="https://other.example/login"><input name="username"><input type="password"><button>Login</button></form>',
  '<form><input name="username"><input type="password" autocomplete="new-password"><button>Login</button></form>',
  '<form><input type="password"><button>Login</button></form>',
  '<form><input name="username"><input name="email"><input type="password"><button>Login</button></form>',
  '<form><input name="username"><input type="password"><button formaction="https://other.example/login">Login</button></form>',
  '<form><input name="username"><input type="password"><button>Login</button><button>Register</button></form>',
  '<form hidden><input name="username"><input type="password"><button>Login</button></form>',
  '<div aria-hidden="true"><form><input name="username"><input type="password"><button>Login</button></form></div>',
])(
  "refuses ambiguous, hidden, registration or cross-origin password form %s",
  (html) => {
    document.body.innerHTML = html
    // jsdom does not reflect HTMLButtonElement.formAction like Chromium does.
    const override = document.querySelector("button[formaction]")
    if (override)
      Object.defineProperty(override, "formAction", {
        value: override.getAttribute("formaction"),
      })
    expect(findPasswordLoginForm()).toBeNull()
  },
)

it("ignores a hidden duplicate form and adopts only the visible login", () => {
  document.body.innerHTML =
    '<form style="display:none"><input name="username"><input type="password"><button>Login</button></form><form id="login"><input name="username"><input type="password"><button>Login</button></form>'
  expect(findPasswordLoginForm()?.form.id).toBe("login")
})

it("leaves ambiguous native password choices to a person", () => {
  document.body.innerHTML =
    "<button>Use password</button><button>Use password</button>"
  const clicked = vi.fn()
  document.body.addEventListener("click", clicked, { once: true })
  expect(enterPasswordLogin(["Use password"])).toBe(true)
  expect(clicked).not.toHaveBeenCalled()
})

it("requires consent to remain connected and checked after native events", async () => {
  vi.useFakeTimers()
  document.body.innerHTML =
    '<form><input type="checkbox" id="legal-consent"></form>'
  const form = document.querySelector("form")!
  document
    .querySelector("input")!
    .addEventListener("click", () => form.replaceChildren())
  const result = acceptLoginAgreement(form)
  await vi.advanceTimersByTimeAsync(100)
  await expect(result).resolves.toBe(false)
})

it("does not select unrelated optional preferences", async () => {
  document.body.innerHTML =
    '<form><label><input type="checkbox">Subscribe to news</label><label><input type="checkbox"><a href="https://other.example/privacy-policy">Optional external policy</a></label></form>'
  await expect(
    acceptLoginAgreement(document.querySelector("form")!),
  ).resolves.toBe(true)
  expect(
    [...document.querySelectorAll("input")].every((input) => !input.checked),
  ).toBe(true)
})

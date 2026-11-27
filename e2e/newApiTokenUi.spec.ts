import { expect, test } from "@playwright/test"

import { copyNewApiAccessToken } from "~~/scripts/flows/new-api-token-ui.mjs"

for (const { showMethodTab, tokenNotice } of [
  { showMethodTab: false, tokenNotice: "This token will not be shown again" },
  { showMethodTab: true, tokenNotice: "This token will not be shown again" },
  { showMethodTab: false, tokenNotice: "请立即复制此令牌，之后将不再显示。" },
]) {
  test(`acquires a scoped token with password verification ${showMethodTab ? "with" : "without"} method tabs (${tokenNotice})`, async ({
    page,
  }) => {
    await page.setContent(`
      <button id="open">Create access token</button>
      <div role="dialog" id="create" hidden>
        <input name="name" /><button id="select">Select all</button>
        <input type="checkbox" /><button id="submit">Create access token</button>
      </div>
      <div role="dialog" aria-label="Security verification" id="verification" hidden>
        ${showMethodTab ? '<button role="tab">Password</button>' : "<p>Password</p>"}
        <label>Password<input id="password" type="password" /></label><button id="verify">Verify</button>
      </div>
      <div role="dialog" aria-label="Access tokens" id="token" hidden>
        <p>${tokenNotice}</p><input value="fixture-password-token" /><button id="close">Close</button>
      </div>
      <script>
        document.querySelector('#open').onclick = () => {
          document.querySelector('#open').hidden = true;
          document.querySelector('#create').hidden = false;
        };
        document.querySelector('#select').onclick = () => document.querySelector('input[type=checkbox]').checked = true;
        document.querySelector('#submit').onclick = () => {
          if (!document.querySelector('input[type=checkbox]').checked) return;
          document.querySelector('#create').hidden = true;
          document.querySelector('#verification').hidden = false;
        };
        document.querySelector('#verify').onclick = () => {
          if (document.querySelector('#password').value !== 'fixture-password') return;
          document.querySelector('#verification').hidden = true;
          document.querySelector('#token').hidden = false;
        };
        document.querySelector('#close').onclick = () => document.querySelector('#token').hidden = true;
      </script>
    `)
    let created = 0
    const token = await copyNewApiAccessToken(
      page,
      { password: "fixture-password" },
      {
        onScopedTokenCreated: () => {
          created++
        },
      },
    )
    expect(token).toBe("fixture-password-token")
    expect(created).toBe(1)
    await expect(
      page.getByRole("dialog", { name: "Access tokens" }),
    ).toBeHidden()
  })
}

test("acquires a scoped token when the native permission catalog has multiple groups", async ({
  page,
}) => {
  await page.setContent(`
    <button id="open">Create access token</button>
    <div role="dialog" id="create" hidden>
      <input name="name" />
      <section aria-label="Personal"><button class="select">Select all</button><input type="checkbox" /></section>
      <section aria-label="Administration"><button class="select">Select all</button><input type="checkbox" /></section>
      <section aria-label="System"><button class="select">Select all</button><input type="checkbox" /></section>
      <button id="submit">Create access token</button>
    </div>
    <div role="dialog" aria-label="Access tokens" id="token" hidden>
      <p>This token will not be shown again</p><input value="fixture-scoped-token" /><button id="close">Close</button>
    </div>
    <script>
      document.querySelector('#open').onclick = () => {
        document.querySelector('#open').hidden = true;
        document.querySelector('#create').hidden = false;
      };
      document.querySelectorAll('.select').forEach(button => {
        button.onclick = () => button.parentElement.querySelector('input').checked = true;
      });
      document.querySelector('#submit').onclick = () => {
        if ([...document.querySelectorAll('input[type=checkbox]')].every(input => input.checked)) {
          document.querySelector('#create').hidden = true;
          document.querySelector('#token').hidden = false;
        }
      };
      document.querySelector('#close').onclick = () => document.querySelector('#token').hidden = true;
    </script>
  `)
  let created = false
  const token = await copyNewApiAccessToken(
    page,
    { password: "" },
    {
      tokenName: "AAH fixture",
      onScopedTokenCreated: () => {
        created = true
      },
    },
  )
  expect(token).toBe("fixture-scoped-token")
  expect(created).toBe(true)
  await expect(page.getByRole("dialog", { name: "Access tokens" })).toBeHidden()
})

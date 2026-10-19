import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { SITE_TYPES } from "~/constants/siteType"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import type { AutoCheckinStatus } from "~/types/autoCheckin"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageJsonValue,
  getServiceWorker,
  holdExtensionWindowNavigation,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

for (const mode of [
  "turnstile",
  "second-factor",
  "api-fallback",
  "shared-session",
  "password-choice",
  "legacy-agreement",
  "modern-agreement",
] as const) {
  test(`password UI login handles ${mode}`, async ({
    context,
    page,
    extensionId,
    extensionDir,
  }) => {
    installExtensionPageGuards(page)
    await forceExtensionLanguage(page, "zh-CN")
    await stubLlmMetadataIndex(context)
    await stubNewApiSiteRoutes(context, {
      baseUrl: "https://agentrouter.org",
      userId: 17,
      systemName: "Agent Router",
    })
    let signedIn: number | null = mode === "shared-session" ? 17 : null
    const logins: unknown[] = []
    const nativeSubmissions: boolean[] = []
    let passwordChoices = 0
    let agreementAcceptances = 0
    let logouts = 0
    let interruptedObservation = false
    await context.route("https://agentrouter.org/api/user/self", (route) => {
      if (
        mode === "second-factor" &&
        signedIn &&
        !interruptedObservation &&
        !route.request().headers().authorization
      ) {
        // A redirect can interrupt the first read after native verification.
        // This read is safe to repeat; the login submission must remain single.
        interruptedObservation = true
        return route.abort("failed")
      }
      return route.fulfill(
        signedIn
          ? {
              json: { success: true, data: { id: signedIn, checked_in: true } },
            }
          : { status: 401, json: { success: false } },
      )
    })
    await context.route(
      "https://agentrouter.org/api/fixture/accept-agreement",
      (route) => {
        agreementAcceptances++
        return route.fulfill({ json: { success: true } })
      },
    )
    await context.route(
      "https://agentrouter.org/api/user/auth/refresh",
      (route) => route.fulfill({ status: 401, json: { success: false } }),
    )
    await context.route("https://agentrouter.org/api/user/logout", (route) => {
      logouts++
      signedIn = null
      return route.fulfill({ json: { success: true } })
    })
    await context.route("https://agentrouter.org/api/user/login", (route) => {
      logins.push(route.request().postDataJSON())
      nativeSubmissions.push(
        route.request().headers()["x-fixture-native-submit"] === "1",
      )
      if (mode === "second-factor")
        return route.fulfill({
          json: { success: true, data: { require_2fa: true } },
        })
      signedIn = 17
      return route.fulfill({
        json: { success: true, data: { id: 17, checked_in: true } },
      })
    })
    await context.route(
      "https://agentrouter.org/api/fixture/password-choice",
      (route) => {
        passwordChoices++
        return route.fulfill({ json: { success: true } })
      },
    )
    await context.route(
      "https://agentrouter.org/api/fixture/verify",
      (route) => {
        signedIn = 17
        return route.fulfill({
          json: { success: true, data: { id: 17, checked_in: true } },
        })
      },
    )
    await context.route("https://agentrouter.org/login", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><meta charset="utf-8"><title>Native login fixture</title>
      <style>body{font:16px system-ui;max-width:440px;margin:48px auto;padding:20px}input,button{display:block;box-sizing:border-box;width:100%;margin:16px 0;padding:12px}h1{font-size:24px}</style>
      <h1>站点原生登录表单</h1><main></main>
      <script>
      const mode=${JSON.stringify(mode)};
      function done(data){localStorage.setItem('user',JSON.stringify(data));location.assign('/console');}
      function showForm(){document.querySelector('main').innerHTML='<form><label>用户名<input name="username" autocomplete="username"></label><label>密码<input type="password" autocomplete="current-password"></label>'+(['turnstile','password-choice','legacy-agreement','modern-agreement'].includes(mode)?'<div class="cf-turnstile"><iframe title="Verification" srcdoc="Complete verification"></iframe><button type="button" id="verify">完成人机验证</button></div>':'')+(mode==='legacy-agreement'?'<label><input id="terms" type="checkbox">我已阅读并同意<a href="/user-agreement">用户协议</a></label>':mode==='modern-agreement'?'<button id="legal-consent" type="button" role="checkbox" aria-checked="false">同意用户协议</button>':'')+(mode.endsWith('-agreement')?'<label><input id="marketing" type="checkbox">接收促销邮件</label>':'')+'<button type="submit">登录</button></form>';
        const consent=document.querySelector('#terms, #legal-consent');
        if(consent){
          const submit=document.querySelector('[type=submit]');if(mode==='legacy-agreement')submit.disabled=true;
          consent.addEventListener('click',async()=>{await fetch('/api/fixture/accept-agreement');consent.setAttribute('aria-checked','true');submit.disabled=false;});
        }
        document.querySelector('#verify')?.addEventListener('click',()=>document.querySelector('.cf-turnstile').remove());
        document.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();
          if(document.querySelector('.cf-turnstile'))return;
          const body={username:document.querySelector('[name=username]').value,password:document.querySelector('[type=password]').value};
          const result=await fetch('/api/user/login',{method:'POST',headers:{'Content-Type':'application/json','X-Fixture-Native-Submit':'1'},body:JSON.stringify(body)}).then(r=>r.json());
          if(result.data.require_2fa){document.querySelector('main').innerHTML='<form><label>二次验证码<input name="otp" autocomplete="one-time-code"></label><button type="submit">完成二次验证</button></form>';document.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();const result=await fetch('/api/fixture/verify',{method:'POST'}).then(r=>r.json());done(result.data);});}else done(result.data);
        });
      }
      if(mode==='shared-session'){localStorage.setItem('user',JSON.stringify({id:17}));document.querySelector('main').innerHTML='<p>此浏览器已登录目标账号</p><button id="logout">确认并退出当前会话</button>';document.querySelector('#logout').onclick=async()=>{await fetch('/api/user/logout');localStorage.removeItem('user');showForm();};}
      else if(mode==='password-choice'){
        document.querySelector('main').innerHTML='<button type="button">使用 GitHub 继续</button><button type="button" id="password-choice"><span>使用 邮箱或用户名 登录</span></button>';
        document.querySelector('#password-choice').onclick=async()=>{await fetch('/api/fixture/password-choice');showForm();};
      }
      else if(mode!=='api-fallback')showForm();
      </script>`,
      }),
    )
    const worker = await getServiceWorker(context)
    await seedUserPreferences(worker, {
      preferencesVersion: DEFAULT_PREFERENCES.preferencesVersion,
      openChangelogOnUpdate: false,
      autoCheckin: {
        ...DEFAULT_PREFERENCES.autoCheckin!,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: false,
      },
    })
    await seedStoredAccounts(worker, [
      createStoredAccount({
        id: "ui-login",
        site_name: "AgentRouter",
        site_type: SITE_TYPES.NEW_API,
        site_url: "https://agentrouter.org",
        account_info: {
          id: "17",
          username: "member",
          access_token: "fixture-token",
        },
        login: {
          methodId: "password",
          credentials: {
            username: "native-member",
            password: " fixture password ",
          },
        },
        checkIn: {
          automaticExecutionEnabled: true,
          selection: {
            mode: "automatic",
            methodId: AUTO_CHECKIN_METHOD_IDS.AgentRouterLoginCheckIn,
          },
          methodKnowledge: {
            methods: {
              [AUTO_CHECKIN_METHOD_IDS.AgentRouterLoginCheckIn]: {
                detection: {
                  outcome: "matched",
                  evidence: { source: "probe", observedAt: Date.now() },
                },
              },
            },
          },
        },
      }),
    ])
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#autoCheckin`,
    )
    await waitForExtensionRoot(page)
    const releaseNavigation = await holdExtensionWindowNavigation(
      context,
      worker,
      "https://agentrouter.org/login",
    )
    await page.getByRole("button", { name: "立即执行", exact: true }).click()
    await releaseNavigation()
    if (mode !== "api-fallback") {
      let login: typeof page | undefined
      await expect
        .poll(async () => {
          for (const candidate of context.pages()) {
            if (candidate.url() !== "https://agentrouter.org/login") continue
            const selector =
              mode === "turnstile" ||
              mode === "password-choice" ||
              mode.endsWith("-agreement")
                ? '[name="username"]'
                : mode === "second-factor"
                  ? '[name="otp"]'
                  : "#logout"
            if (await candidate.locator(selector).count()) {
              login = candidate
              return true
            }
          }
          return false
        })
        .toBe(true)
      if (!login) throw new Error("Native login page was not ready")
      if (
        mode === "turnstile" ||
        mode === "password-choice" ||
        mode.endsWith("-agreement")
      ) {
        await expect(login.locator('[name="username"]')).toHaveValue(
          "native-member",
        )
        expect(logins).toHaveLength(0)
        if (mode.endsWith("-agreement")) {
          await expect.poll(() => agreementAcceptances).toBe(1)
          await expect(login.locator("#marketing")).not.toBeChecked()
          if (mode === "legacy-agreement")
            await expect(login.locator("#terms")).toBeChecked()
          else
            await expect(login.locator("#legal-consent")).toHaveAttribute(
              "aria-checked",
              "true",
            )
        }
        await page.bringToFront()
        const reminder = page.getByRole("button", {
          name: "打开登录窗口",
          exact: true,
        })
        await expect(reminder).toBeVisible()
        await captureVisualViews({
          page,
          ready: reminder,
          id:
            mode === "password-choice"
              ? "password-choice-assist"
              : mode.endsWith("-agreement")
                ? `${mode}-assist`
                : "password-login-assist",
          extensionDir,
        })
        await reminder.click()
        await expect
          .poll(() => login!.evaluate(() => document.hasFocus()))
          .toBe(true)
        await captureVisualViews({
          page: login,
          ready: login.locator("main"),
          id:
            mode === "password-choice"
              ? "password-native-choice-form"
              : mode.endsWith("-agreement")
                ? `${mode}-native-form`
                : "password-native-verification",
          extensionDir,
        })
        await login.getByRole("button", { name: "完成人机验证" }).click()
      } else if (mode === "second-factor") {
        await expect(login.getByLabel("二次验证码")).toBeVisible()
        expect(logins).toHaveLength(1)
        await login.getByLabel("二次验证码").fill("123456")
        await login.getByRole("button", { name: "完成二次验证" }).click()
      } else {
        await expect(
          login.getByRole("button", { name: "确认并退出当前会话" }),
        ).toBeVisible()
        expect(logouts).toBe(0)
        expect(logins).toHaveLength(0)
        await login.getByRole("button", { name: "确认并退出当前会话" }).click()
      }
    }
    await expect
      .poll(
        async () =>
          (
            await getPlasmoStorageJsonValue<AutoCheckinStatus>(
              worker,
              "autoCheckin_status",
            )
          )?.perAccount?.["ui-login"]?.status,
        { timeout: 45_000 },
      )
      .toBe("success")
    expect(logins).toEqual([
      { username: "native-member", password: " fixture password " },
    ])
    expect(nativeSubmissions).toEqual([mode !== "api-fallback"])
    expect(passwordChoices).toBe(mode === "password-choice" ? 1 : 0)
    expect(agreementAcceptances).toBe(mode.endsWith("-agreement") ? 1 : 0)
    expect(logouts).toBe(mode === "shared-session" ? 1 : 0)
    expect(interruptedObservation).toBe(mode === "second-factor")
    await expect
      .poll(
        () =>
          context
            .pages()
            .filter((candidate) =>
              candidate.url().startsWith("https://agentrouter.org"),
            ).length,
      )
      .toBe(0)
  })
}

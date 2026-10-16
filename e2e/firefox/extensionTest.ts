import fs from "node:fs/promises"
import net from "node:net"
import path from "node:path"
import { test as base, expect } from "@playwright/test"
import { Builder, Origin, type WebElement } from "selenium-webdriver"
import firefox from "selenium-webdriver/firefox.js"

import { POPUP_TEST_IDS } from "~/entrypoints/popup/testIds"
import {
  I18NEXT_LANGUAGE_STORAGE_KEY,
  STORAGE_KEYS,
  STORAGE_LOCKS,
} from "~/services/core/storageKeys"
import type { AccountStorageConfig } from "~/types"
import { firefoxAdapter } from "~~/scripts/mobile/adapters.mjs"

type Adapter = Awaited<ReturnType<typeof firefoxAdapter>>
type Target = Adapter["targets"][number]

// Sidebar documents can contain a nested remote browser. Resolve all surfaces
// by URL rather than assuming the popup is still mounted after navigation.
const findExtensionBrowser = `
  const url = arguments[0]
  function findPage(doc) {
    for (const item of doc.querySelectorAll('browser')) {
      if (item.currentURI?.spec?.split(/[?#]/)[0] === url) return item
      const nested = item.contentDocument && findPage(item.contentDocument)
      if (nested) return nested
    }
  }
  const pageBrowser = findPage(document)
`

/** Real Firefox extension surfaces, sharing the maintained Firefox RDP transport. */
class FirefoxExtension {
  private asyncResultId = 0
  constructor(
    readonly driver: firefox.Driver,
    readonly adapter: Adapter,
    readonly origin: string,
    readonly extensionId: string,
    readonly pagePath = "popup.html",
  ) {}

  page(pagePath: string) {
    return new FirefoxExtension(
      this.driver,
      this.adapter,
      this.origin,
      this.extensionId,
      pagePath,
    )
  }

  async openInTab(suffix = "") {
    await this.driver.executeScript(
      `
      gBrowser.selectedTab = gBrowser.addTab(arguments[0], {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()
      })
    `,
      `${this.origin}${this.pagePath}${suffix}`,
    )
    await this.pageTarget()
  }

  async respondToPermissionPrompt(allow: boolean) {
    const button = await this.driver.wait(
      () =>
        this.driver.executeScript<WebElement | null>(
          `
      const notification = document.getElementById('addon-webext-permissions-notification')
      if (!notification || PopupNotifications.panel.state !== 'open') return null
      const button = arguments[0] ? notification.button : notification.secondaryButton
      const target = button?.shadowRoot?.querySelector('button') ?? button
      return target && !target.disabled && target.getBoundingClientRect().width > 0 ? target : null
    `,
          allow,
        ),
      15_000,
      "Firefox optional permission prompt did not appear",
    )
    if (!button) throw new Error("Firefox permission prompt has no action")
    await this.driver
      .actions({ async: true })
      .move({ origin: button })
      .click()
      .perform()
  }

  async pageTarget(): Promise<Target> {
    const target = await this.driver.wait(
      () =>
        this.adapter.targets.find(
          (target) =>
            target.url.split(/[?#]/)[0] === `${this.origin}${this.pagePath}`,
        ),
      15_000,
      `Firefox extension page did not appear: ${this.pagePath}`,
    )
    if (!target)
      throw new Error(`Firefox extension page did not appear: ${this.pagePath}`)
    return target
  }

  async evaluate<T>(expression: string): Promise<T> {
    const target = await this.pageTarget()
    const { value } = await this.adapter.evaluate(
      target,
      `JSON.stringify(${expression})`,
    )
    if (typeof value !== "string")
      throw new Error(`Firefox did not return a JSON value for: ${expression}`)
    return JSON.parse(value) as T
  }

  /** RDP returns Promise grips; settle async browser API results in the page. */
  async evaluateAsync<T>(expression: string): Promise<T> {
    const slot = JSON.stringify(`__aahFirefoxTestResult${this.asyncResultId++}`)
    await this.evaluate(`(() => {
      window[${slot}] = {done: false}
      Promise.resolve(${expression}).then(
        value => { window[${slot}] = {done: true, value} },
        error => { window[${slot}] = {done: true, error: String(error)} }
      )
      return true
    })()`)
    try {
      await expect
        .poll(() => this.evaluate<boolean>(`window[${slot}].done`))
        .toBe(true)
      const result = await this.evaluate<{ value: T; error?: string }>(
        `window[${slot}]`,
      )
      if (result.error) throw new Error(result.error)
      return result.value
    } finally {
      await this.evaluate(`delete window[${slot}]`)
    }
  }

  async openPopup() {
    await this.driver.executeScript(
      `
      const id = arguments[0]
      const widget = id.toLowerCase().replace(/[^a-z0-9_-]/g, '_') + '-browser-action'
      CustomizableUI.addWidgetToArea(widget, CustomizableUI.AREA_NAVBAR)
      const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs')
      const extension = ExtensionParent.GlobalManager.extensionMap.get(id)
      ExtensionParent.apiManager.global.browserActionFor(extension).triggerAction(window)
    `,
      this.extensionId,
    )
    await this.driver.wait(
      () =>
        this.driver.executeScript<boolean>(
          `
      return [...document.querySelectorAll('browser')].some(item =>
        item.currentURI?.spec === arguments[0] + 'popup.html' &&
        item.closest('panel')?.state === 'open' && item.getBoundingClientRect().width > 0
      )
    `,
          this.origin,
        ),
      15_000,
      "Firefox popup was not visible in a native panel",
    )
    await expect
      .poll(() =>
        this.evaluate<boolean>(
          `Boolean(document.querySelector('[data-testid="${POPUP_TEST_IDS.bookmarksTab}"]'))`,
        ),
      )
      .toBe(true)
    await expect
      .poll(() => this.evaluate<string>("document.fonts.status"))
      .toBe("loaded")
    await this.evaluate(`(() => {
      const style = document.createElement('style')
      style.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }'
      document.head.append(style)
      return true
    })()`)
  }

  async click(testId: string) {
    await this.clickSelector(`[data-testid="${testId}"]`)
  }

  async isPopupOpen(): Promise<boolean> {
    return this.driver.executeScript<boolean>(
      `
      return [...document.querySelectorAll('browser')].some(item =>
        item.currentURI?.spec === arguments[0] + 'popup.html' && item.closest('panel')?.state === 'open')
    `,
      this.origin,
    )
  }

  async closePopup() {
    await this.driver.executeScript(
      `
      const browser = [...document.querySelectorAll('browser')].find(item => item.currentURI?.spec === arguments[0] + 'popup.html')
      browser?.closest('panel')?.hidePopup()
    `,
      this.origin,
    )
    await expect.poll(() => this.isPopupOpen()).toBe(false)
  }

  async isNativeSidebarOpen(): Promise<boolean> {
    return this.driver.executeScript<boolean>(
      `
      return window.SidebarController.isOpen && window.SidebarController.currentID.includes(arguments[0].toLowerCase().replace(/[^a-z0-9_-]/g, '_'))
    `,
      this.extensionId,
    )
  }

  /** Native pointer input preserves Firefox's user activation for sidebarAction.open. */
  async nativeClickSelector(cssSelector: string) {
    await expect
      .poll(() =>
        this.evaluate<boolean>(
          `Boolean(document.querySelector(${JSON.stringify(cssSelector)}))`,
        ),
      )
      .toBe(true)
    const point = await this.evaluate<{ x: number; y: number }>(`(() => {
      const element = document.querySelector(${JSON.stringify(cssSelector)})
      element.scrollIntoView({block: 'nearest'})
      const bounds = element.getBoundingClientRect()
      return {x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2}
    })()`)
    const bounds = await this.driver.executeScript<{ x: number; y: number }>(
      `
      ${findExtensionBrowser}
      const bounds = pageBrowser.getBoundingClientRect()
      let x = bounds.x, y = bounds.y
      for (let frame = pageBrowser.ownerDocument.defaultView.frameElement; frame; frame = frame.ownerDocument.defaultView.frameElement) {
        const offset = frame.getBoundingClientRect()
        x += offset.x
        y += offset.y
      }
      return {x, y}
    `,
      `${this.origin}${this.pagePath}`,
    )
    await this.driver
      .actions({ async: true })
      .move({
        x: Math.round(bounds.x + point.x),
        y: Math.round(bounds.y + point.y),
        origin: Origin.VIEWPORT,
      })
      .click()
      .perform()
  }

  async fill(testId: string, value: string) {
    await this.evaluate(`(() => {
      const element = document.querySelector('[data-testid="${testId}"]')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, ${JSON.stringify(value)})
      element.dispatchEvent(new Event('input', {bubbles: true}))
      return true
    })()`)
  }

  async clickSelector(cssSelector: string) {
    const selector = JSON.stringify(cssSelector)
    await expect
      .poll(() =>
        this.evaluate<boolean>(`Boolean(document.querySelector(${selector}))`),
      )
      .toBe(true)
    await this.evaluate(`(() => {
      const element = document.querySelector(${selector})
      element.scrollIntoView({block: 'nearest'})
      const init = {bubbles: true, cancelable: true, composed: true, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true}
      element.dispatchEvent(new PointerEvent('pointerdown', {...init, buttons: 1}))
      element.dispatchEvent(new MouseEvent('mousedown', {...init, buttons: 1}))
      element.dispatchEvent(new PointerEvent('pointerup', init))
      element.dispatchEvent(new MouseEvent('mouseup', init))
      element.click()
      return true
    })()`)
  }

  async clickButton(name: string) {
    const expression = `[...document.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(name)} || button.getAttribute('aria-label') === ${JSON.stringify(name)})`
    await expect
      .poll(() => this.evaluate<boolean>(`Boolean(${expression})`))
      .toBe(true)
    await this.evaluate(`(() => { (${expression}).click(); return true })()`)
  }

  async screenshot(file: string) {
    // WebDriver chrome screenshots omit native popup windows on Windows.
    // Capture the popup's own remote browsing context instead.
    const data = await this.driver.executeAsyncScript<{
      data?: string
      error?: string
    }>(
      `
      const done = arguments[arguments.length - 1]
      ${findExtensionBrowser}
      if (!pageBrowser) { done({error: 'Firefox extension page is not mounted: ' + url}); return }
      pageBrowser.browsingContext.currentWindowGlobal.drawSnapshot(null, 1, 'white').then(image => {
        const canvas = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas')
        canvas.width = image.width
        canvas.height = image.height
        canvas.getContext('2d').drawImage(image, 0, 0)
        image.close()
        done({data: canvas.toDataURL('image/png').split(',')[1]})
      }, error => done({error: String(error)}))
    `,
      `${this.origin}${this.pagePath}`,
    )
    if (!data.data)
      throw new Error(data.error ?? "Firefox popup screenshot was empty")
    await fs.writeFile(file, data.data, "base64")
  }
}

/** Reserve an ephemeral loopback port for this isolated Firefox RDP server. */
async function debuggerPort(): Promise<number> {
  const server = net.createServer()
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (!address || typeof address === "string")
    throw new Error("No Firefox RDP port")
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
  return address.port
}

export const test = base.extend<{
  firefoxExtension: FirefoxExtension
  accountStorage: AccountStorageConfig | undefined
}>({
  accountStorage: [undefined, { option: true }],
  firefoxExtension: async ({ accountStorage }, run, testInfo) => {
    const port = await debuggerPort()
    const options = new firefox.Options()
      .addArguments(`--start-debugger-server=${port}`, "-headless")
      .windowSize({ width: 1280, height: 1000 })
      .setPreference("devtools.chrome.enabled", true)
      .setPreference("devtools.debugger.remote-enabled", true)
      .setPreference("devtools.debugger.prompt-connection", false)
      .setPreference("ui.popup.disable_autohide", true)
      .setPreference("intl.accept_languages", "en-US, en")
      // Keep the desktop suite independent of the host's touch-screen hardware.
      .setPreference("ui.primaryPointerCapabilities", 6)
      .setPreference("ui.allPointerCapabilities", 6)
    if (process.env.AAH_E2E_FIREFOX_EXECUTABLE_PATH) {
      options.setBinary(process.env.AAH_E2E_FIREFOX_EXECUTABLE_PATH)
    }
    const service = new firefox.ServiceBuilder(
      process.env.AAH_E2E_GECKODRIVER_PATH,
    ).addArguments("--allow-system-access")
    const driver = (await new Builder()
      .forBrowser("firefox")
      .setFirefoxOptions(options)
      .setFirefoxService(service)
      .build()) as firefox.Driver
    let adapter: Adapter | undefined
    let extension: FirefoxExtension | undefined
    try {
      await driver.manage().setTimeouts({ script: 15_000, pageLoad: 30_000 })
      const extensionId = await driver.installAddon(
        path.resolve(".output/firefox-mv2-test"),
        true,
      )
      await driver.setContext(firefox.Context.CHROME)
      const origin = await driver.executeScript<string>(
        "return WebExtensionPolicy.getByID(arguments[0]).getURL('')",
        extensionId,
      )
      // Smoke tests use bundled resources and synthetic inputs only. Remote
      // catalogs must not change screenshots or require external availability.
      await driver.executeScript(
        "Services.io.manageOfflineStatus = false; Services.io.offline = true",
      )
      // Persist locale before opening the popup, without borrowing user data.
      await driver.setContext(firefox.Context.CONTENT)
      await driver.get(`${origin}popup.html`)
      await driver.executeScript(
        "localStorage.setItem(arguments[0], 'en')",
        I18NEXT_LANGUAGE_STORAGE_KEY,
      )
      if (accountStorage) {
        const result = await driver.executeAsyncScript<{ error?: string }>(
          `
          const done = arguments[arguments.length - 1]
          navigator.locks.request(arguments[2], () => browser.storage.local.set({[arguments[0]]: arguments[1]}))
            .then(() => done({}), error => done({error: String(error)}))
        `,
          STORAGE_KEYS.ACCOUNTS,
          JSON.stringify(accountStorage),
          STORAGE_LOCKS.ACCOUNT_STORAGE,
        )
        if (result.error) throw new Error(result.error)
      }
      await driver.get("about:blank")
      await driver.setContext(firefox.Context.CHROME)
      // Installing a sidebar extension can auto-open its sidebar. Start closed
      // so handoff tests cannot pass by observing the installation side effect.
      await driver.executeScript("window.SidebarController.hide()")
      await driver.wait(
        () =>
          driver.executeScript<boolean>(
            "return !window.SidebarController.isOpen",
          ),
        15_000,
      )
      adapter = await firefoxAdapter({ port }, { extensionId })
      extension = new FirefoxExtension(driver, adapter, origin, extensionId)
      await testInfo.attach("firefox-version", {
        body: String((await driver.getCapabilities()).get("browserVersion")),
        contentType: "text/plain",
      })
      await run(extension)
    } finally {
      try {
        if (extension && testInfo.status !== testInfo.expectedStatus) {
          const file = testInfo.outputPath("failure.png")
          try {
            const surface = (await extension.isPopupOpen())
              ? extension
              : (await extension.isNativeSidebarOpen())
                ? extension.page("sidepanel.html")
                : extension.page("options.html")
            await surface.screenshot(file)
            await testInfo.attach("Firefox extension failure", {
              path: file,
              contentType: "image/png",
            })
          } catch (error) {
            // Preserve the original assertion even if navigation destroyed its page.
            await testInfo.attach("Firefox screenshot unavailable", {
              body: String(error),
              contentType: "text/plain",
            })
          }
        }
      } finally {
        adapter?.close()
        await driver.quit()
      }
    }
  },
})

export { expect }

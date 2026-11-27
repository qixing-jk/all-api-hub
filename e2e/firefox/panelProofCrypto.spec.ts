import { createPublicKey, verify } from "node:crypto"

import { createSub2ApiBrowserSessionFixture } from "~~/e2e/utils/sub2apiBrowserSessionFixture"

import { expect, test } from "./extensionTest"

test("Firefox content requests reuse the website's non-exportable panel key", async ({
  firefoxExtension,
}) => {
  const fixture = await createSub2ApiBrowserSessionFixture()
  const options = firefoxExtension.page("options.html")
  await options.openInTab()
  let tabId: number | undefined
  try {
    tabId = await options.evaluateAsync<number>(
      `browser.tabs.create({url: ${JSON.stringify(fixture.origin)}}).then(tab => tab.id)`,
    )
    await expect
      .poll(
        async () =>
          await options.evaluateAsync<string>(
            `browser.tabs.get(${tabId}).then(tab => tab.status)`,
          ),
      )
      .toBe("complete")
    await options.evaluateAsync(
      `browser.tabs.executeScript(${tabId}, {code: "document.getElementById('login').click()"})`,
    )
    await expect
      .poll(() =>
        options.evaluateAsync(
          `browser.tabs.executeScript(${tabId}, {code: "document.getElementById('status').textContent"}).then(result => result[0])`,
        ),
      )
      .toBe("Signed in 17")
    const result = await options.evaluateAsync(`(async () => {
      const [token] = await browser.tabs.executeScript(${tabId}, {code: "localStorage.getItem('auth_token')"})
      return await browser.tabs.sendMessage(${tabId}, {
        action: 'performTempWindowFetch', siteType: 'sub2api', expectedOrigin: ${JSON.stringify(fixture.origin)},
        fetchUrl: ${JSON.stringify(fixture.origin + "/api/v1/auth/me")},
        fetchOptions: {headers: {Authorization: 'Bearer '+token}, credentials: 'omit'}, responseType: 'json'
      })
    })()`)
    expect(result).toMatchObject({
      success: true,
      status: 200,
      data: { code: 0, data: { id: 17 } },
    })
    expect(fixture.state.identityReads).toBe(1)
    expect(fixture.failures).toEqual([])
  } finally {
    if (tabId)
      await options.evaluateAsync(
        `browser.tabs.remove(${tabId}).then(() => true)`,
      )
    await fixture.close()
  }
})

test("Firefox persists non-exportable P-256 extension keys across document reloads", async ({
  firefoxExtension,
}) => {
  const options = firefoxExtension.page("options.html")
  await options.openInTab()
  const before = await options.evaluateAsync<JsonWebKey>(`(async () => {
    const pair = await crypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, false, ['sign', 'verify'])
    const db = await new Promise((resolve, reject) => {
      const opening = indexedDB.open('panel-proof-crypto-test', 1)
      opening.onupgradeneeded = () => opening.result.createObjectStore('keys')
      opening.onsuccess = () => resolve(opening.result)
      opening.onerror = () => reject(opening.error)
    })
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('keys', 'readwrite')
      transaction.objectStore('keys').put(pair, 'key')
      transaction.oncomplete = resolve
      transaction.onerror = () => reject(transaction.error)
    })
    db.close()
    return await crypto.subtle.exportKey('jwk', pair.publicKey)
  })()`)
  await options.evaluate(
    "(() => { window.__panelProofBeforeReload = true; setTimeout(() => location.reload(), 0); return true })()",
  )
  await expect
    .poll(() =>
      options.evaluate(
        "typeof window.__panelProofBeforeReload === 'undefined'",
      ),
    )
    .toBe(true)
  const after = await options.evaluateAsync<{
    jwk: JsonWebKey
    exportable: boolean
    signature: number[]
  }>(`(async () => {
    const db = await new Promise((resolve, reject) => {
      const opening = indexedDB.open('panel-proof-crypto-test', 1)
      opening.onsuccess = () => resolve(opening.result)
      opening.onerror = () => reject(opening.error)
    })
    const pair = await new Promise((resolve, reject) => {
      const reading = db.transaction('keys').objectStore('keys').get('key')
      reading.onsuccess = () => resolve(reading.result)
      reading.onerror = () => reject(reading.error)
    })
    db.close()
    const signature = await crypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, pair.privateKey, new TextEncoder().encode('panel-proof-fixture'))
    return {jwk: await crypto.subtle.exportKey('jwk', pair.publicKey), exportable: pair.privateKey.extractable, signature: [...new Uint8Array(signature)]}
  })()`)
  expect(after.jwk).toEqual(before)
  expect(after.exportable).toBe(false)
  expect(after.signature).toHaveLength(64)
  expect(
    verify(
      "sha256",
      Buffer.from("panel-proof-fixture"),
      {
        key: createPublicKey({ key: { ...after.jwk }, format: "jwk" }),
        dsaEncoding: "ieee-p1363",
      },
      Buffer.from(after.signature),
    ),
  ).toBe(true)
})

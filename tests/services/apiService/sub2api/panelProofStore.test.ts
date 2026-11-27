import { webcrypto } from "node:crypto"
import { afterEach, expect, it, vi } from "vitest"

import {
  getSub2ApiPanelSigningKey,
  readSub2ApiPanelSigningKey,
} from "~/services/apiService/sub2api/auth/panelProofStore"

afterEach(() => vi.unstubAllGlobals())

it("leaves optional proof unavailable without IndexedDB", async () => {
  vi.stubGlobal("indexedDB", undefined)
  await expect(
    readSub2ApiPanelSigningKey("https://panel.example"),
  ).resolves.toBeUndefined()
})

it.each([
  "blocked",
  "open error",
  "read error",
  "transaction error",
  "abort",
  "abort without error",
])(
  "rejects unavailable signing storage and closes its connection: %s",
  async (failure) => {
    vi.stubGlobal("crypto", webcrypto)
    const close = vi.fn()
    const error = new Error("Signing storage unavailable")
    const put = vi.fn()
    vi.stubGlobal("indexedDB", {
      open: () => {
        const opening: any = {
          error,
          result: {
            close,
            transaction: (_store: string, mode?: string) => {
              const transaction: any = {
                error: failure === "abort without error" ? null : error,
                objectStore: () => ({
                  put,
                  get: () => {
                    const read: any = { error, result: undefined }
                    queueMicrotask(() => {
                      if (failure === "read error") read.onerror()
                      else {
                        read.onsuccess()
                        if (mode === "readwrite") {
                          if (failure.startsWith("abort")) transaction.onabort()
                          else transaction.onerror()
                        }
                      }
                    })
                    return read
                  },
                }),
              }
              return transaction
            },
          },
        }
        queueMicrotask(() => {
          if (failure === "blocked") opening.onblocked()
          else if (failure === "open error") opening.onerror()
          else opening.onsuccess()
        })
        return opening
      },
    })
    await expect(
      getSub2ApiPanelSigningKey("https://panel.example"),
    ).rejects.toThrow()
    expect(close).toHaveBeenCalledTimes(
      ["blocked", "open error"].includes(failure) ? 0 : 1,
    )
    expect(put).toHaveBeenCalledTimes(
      failure.startsWith("abort") || failure === "transaction error" ? 1 : 0,
    )
  },
)

it.each(["read", "existing", "concurrent"])(
  "reuses stored key material and closes the connection: %s",
  async (operation) => {
    vi.stubGlobal("crypto", webcrypto)
    const winner = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign", "verify"],
    )
    const put = vi.fn()
    const close = vi.fn()
    vi.stubGlobal("indexedDB", {
      open: () => {
        const opening: any = {
          result: {
            close,
            transaction: (_store: string, mode?: string) => {
              const transaction: any = {
                objectStore: () => ({
                  put,
                  get: () => {
                    const read: any = {
                      result:
                        operation !== "concurrent" || mode === "readwrite"
                          ? winner
                          : undefined,
                    }
                    queueMicrotask(() => {
                      read.onsuccess()
                      if (mode === "readwrite") transaction.oncomplete()
                    })
                    return read
                  },
                }),
              }
              return transaction
            },
          },
        }
        queueMicrotask(() => opening.onsuccess())
        return opening
      },
    })
    const read =
      operation === "read"
        ? readSub2ApiPanelSigningKey
        : getSub2ApiPanelSigningKey
    await expect(read("https://panel.example")).resolves.toBe(winner)
    expect(put).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledOnce()
  },
)

import { t } from "i18next"

import { fetchUserInfo } from "~/services/apiService"
import {
  EXTENSION_HEADER_NAME,
  EXTENSION_HEADER_VALUE,
} from "~/utils/cookieHelper"
import { getErrorMessage } from "~/utils/error"

export function setupContentMessageHandlers() {
  browser.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === "getLocalStorage") {
      try {
        const { key } = request

        if (key) {
          const value = localStorage.getItem(key)
          sendResponse({ success: true, data: { [key]: value } })
        } else {
          const localStorage = window.localStorage
          const data: Record<string, any> = {}

          for (let i = 0; i < localStorage.length; i++) {
            const storageKey = localStorage.key(i)
            if (storageKey) {
              data[storageKey] = localStorage.getItem(storageKey)
            }
          }

          sendResponse({ success: true, data })
        }
      } catch (error) {
        sendResponse({ success: false, error: getErrorMessage(error) })
      }
      return true
    }

    if (request.action === "getUserFromLocalStorage") {
      ;(async () => {
        try {
          const userStr = localStorage.getItem("user")
          const user = userStr
            ? JSON.parse(userStr)
            : await fetchUserInfo(request.url)

          if (!user || !user.id) {
            sendResponse({
              success: false,
              error: t("messages:content.userInfoNotFound"),
            })
            return
          }

          sendResponse({ success: true, data: { userId: user.id, user } })
        } catch (error) {
          sendResponse({ success: false, error: getErrorMessage(error) })
        }
      })()
      return true
    }

    if (request.action === "checkCloudflareGuard") {
      try {
        const passed =
          !document.title.includes("Just a moment") &&
          !document.querySelector("#cf-content")

        sendResponse({ success: true, passed })
      } catch (error) {
        sendResponse({ success: false, error: getErrorMessage(error) })
      }
      return true
    }

    if (request.action === "waitAndGetUserInfo") {
      waitForUserInfo()
        .then((userInfo) => {
          sendResponse({ success: true, data: userInfo })
        })
        .catch((error) => {
          sendResponse({ success: false, error: error.message })
        })
      return true
    }

    if (request.action === "performTempWindowFetch") {
      ;(async () => {
        try {
          const { fetchUrl, fetchOptions = {}, responseType = "json" } = request

          if (!fetchUrl) {
            throw new Error("Invalid fetch request")
          }

          const normalizedOptions = normalizeFetchOptions(fetchOptions)
          normalizedOptions.credentials = "include"
          /** 添加扩展标识头
           * 用于区分是来自扩展的请求，方便服务器做特殊处理
           * @see handleWebRequest
           */
          if (!normalizedOptions.headers) {
            normalizedOptions.headers = {}
          }
          ;(normalizedOptions.headers as Record<string, string>)[
            EXTENSION_HEADER_NAME
          ] = EXTENSION_HEADER_VALUE
          const response = await fetch(fetchUrl, normalizedOptions)

          const headers: Record<string, string> = {}
          response.headers.forEach((value, key) => {
            headers[key] = value
          })

          let data: any = null
          try {
            data = await parseResponseData(response, responseType)
          } catch (parseError) {
            console.warn("[Content] Failed to parse response:", parseError)
          }

          const errorMessage = response.ok
            ? undefined
            : typeof data === "string"
              ? data
              : data?.message
                ? data.message
                : JSON.stringify(data ?? {})

          sendResponse({
            success: response.ok,
            status: response.status,
            headers,
            data,
            error: errorMessage,
          })
        } catch (error) {
          sendResponse({ success: false, error: getErrorMessage(error) })
        }
      })()
      return true
    }
  })
}

async function waitForUserInfo(
  maxWaitTime = 5000,
): Promise<{ userId: string; user: any }> {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const userStr = localStorage.getItem("user")
      if (userStr) {
        const user = JSON.parse(userStr)
        if (user.id) {
          return { userId: user.id, user }
        }
      }
    } catch (error) {
      console.error(error)
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(t("messages:content.waitUserInfoTimeout"))
}

type TempWindowResponseType = "json" | "text" | "arrayBuffer" | "blob"

function normalizeFetchOptions(options: RequestInit = {}): RequestInit {
  const normalized: RequestInit = { ...options }

  if (options.headers) {
    normalized.headers = sanitizeHeaders(options.headers)
  }

  return normalized
}

function sanitizeHeaders(headers: HeadersInit): Record<string, string> {
  if (headers instanceof Headers) {
    const result: Record<string, string> = {}
    headers.forEach((value, key) => {
      result[key] = value
    })
    return result
  }

  if (Array.isArray(headers)) {
    return headers.reduce(
      (acc, [key, value]) => {
        acc[key] = value
        return acc
      },
      {} as Record<string, string>,
    )
  }

  return Object.entries(headers).reduce(
    (acc, [key, value]) => {
      if (value != null) {
        acc[key] = String(value)
      }
      return acc
    },
    {} as Record<string, string>,
  )
}

async function parseResponseData(
  response: Response,
  responseType: TempWindowResponseType,
) {
  switch (responseType) {
    case "text":
      return await response.text()
    case "arrayBuffer": {
      const buffer = await response.arrayBuffer()
      return Array.from(new Uint8Array(buffer))
    }
    case "blob": {
      const blob = await response.blob()
      const blobBuffer = await blob.arrayBuffer()
      return { data: Array.from(new Uint8Array(blobBuffer)), type: blob.type }
    }
    case "json":
    default: {
      const text = await response.text()
      try {
        return JSON.parse(text)
      } catch (error) {
        console.warn(
          "[Content] Failed to parse JSON response, fallback to text",
          error,
        )
        return text
      }
    }
  }
}

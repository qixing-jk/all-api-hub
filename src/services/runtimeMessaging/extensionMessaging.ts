import type {
  ExtensionMessagingConfig,
  ExtensionMessenger,
  GetReturnType,
  MaybePromise,
  Message,
} from "@webext-core/messaging"

import {
  onRuntimeMessage,
  sendRuntimeMessageOnce,
  sendTabMessage,
} from "~/utils/browser/browserApi"

export type { Logger } from "@webext-core/messaging"

interface RuntimeMessagingResponse {
  res?: unknown
  err?: SerializedRuntimeMessagingError
}

interface SerializedRuntimeMessagingError {
  message: string
  name?: string
  stack?: string
}

type ExtensionMessage = {
  sender: browser.runtime.MessageSender
}

type RuntimeMessageListener = (
  message: unknown,
  sender: browser.runtime.MessageSender,
  sendResponse: (response?: RuntimeMessagingResponse) => void,
) => boolean

type RuntimeMessageHandler<
  TProtocolMap extends Record<string, any>,
  TType extends keyof TProtocolMap,
> = (
  message: Message<TProtocolMap, TType> & ExtensionMessage,
) => MaybePromise<GetReturnType<TProtocolMap[TType]>>

/**
 * Converts non-Error thrown values into a stable message for runtime transport.
 */
function getNonErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error
  }

  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

/**
 * Reduces thrown values to fields that can cross the extension message channel.
 */
function serializeError(error: unknown): SerializedRuntimeMessagingError {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    }
  }

  return {
    message: getNonErrorMessage(error),
    name: "Error",
  }
}

/**
 * Restores a serialized runtime messaging error for the original sender.
 */
function deserializeError(error: SerializedRuntimeMessagingError): Error {
  const deserialized = new Error(error.message)
  deserialized.name = error.name ?? "Error"
  if (error.stack) {
    deserialized.stack = error.stack
  }
  return deserialized
}

/**
 * Narrows unknown message payloads to objects before inspecting fields.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/**
 * Detects the message envelope shape used by webext-core typed messages.
 */
function isTypedRuntimeMessage(
  message: unknown,
): message is Record<string, unknown> & { type: string; timestamp: number } {
  return (
    isRecord(message) &&
    typeof message.type === "string" &&
    typeof message.timestamp === "number"
  )
}

/**
 * Creates the fallback error used when a browser message receives no response.
 */
function createNoResponseError(): SerializedRuntimeMessagingError {
  return {
    message: "No response",
    name: "Error",
  }
}

/**
 * Browser extension messaging transport that keeps Chrome/Edge async response
 * channels open with `sendResponse` + `return true`.
 *
 * Chrome runtime messaging contract:
 * https://developer.chrome.com/docs/extensions/develop/concepts/messaging#responses
 * This transport intentionally uses the non-fallback `sendResponse`/`return true`
 * path because async handlers must keep the response channel open in Chrome/Edge.
 */
export function defineExtensionMessaging<
  TProtocolMap extends Record<string, any> = Record<string, any>,
>(config: ExtensionMessagingConfig = {}): ExtensionMessenger<TProtocolMap> {
  type MessageType = keyof TProtocolMap & string

  let removeRootListener: (() => void) | undefined
  const perTypeListeners: Partial<{
    [TType in MessageType]: RuntimeMessageHandler<TProtocolMap, TType>
  }> = {}
  let idSeq = Math.floor(Math.random() * 10000)

  /**
   * Removes the root runtime listener after the last typed listener is gone.
   */
  function cleanupRootListener() {
    if (Object.keys(perTypeListeners).length > 0) {
      return
    }

    removeRootListener?.()
    removeRootListener = undefined
  }

  /**
   * Generates a lightweight trace id compatible with webext-core messages.
   */
  function getNextId() {
    return idSeq++
  }

  /**
   * Runs a registered typed listener and responds through the callback channel.
   */
  function processMessage(
    message: Record<string, unknown> & { type: string; timestamp: number },
    sender: browser.runtime.MessageSender,
    sendResponse: (response?: RuntimeMessagingResponse) => void,
  ) {
    const listener = perTypeListeners[
      message.type as MessageType
    ] as RuntimeMessageHandler<TProtocolMap, MessageType>
    config.logger?.debug("[messaging] Received message", message)

    Promise.resolve()
      .then(() =>
        listener({
          ...message,
          sender,
        } as Message<TProtocolMap, MessageType> & ExtensionMessage),
      )
      .then((res) => {
        config.logger?.debug(`[messaging] onMessage {id=${message.id}} ->`, {
          res,
        })
        sendResponse({ res })
      })
      .catch((error) => {
        const err = serializeError(error)
        config.logger?.debug(`[messaging] onMessage {id=${message.id}} ->`, {
          err,
        })
        sendResponse({ err })
      })
  }

  /**
   * Installs the single root listener for this messenger instance.
   */
  function addRootListener() {
    const listener: RuntimeMessageListener = (
      message,
      sender,
      sendResponse,
    ) => {
      if (!isTypedRuntimeMessage(message)) {
        if (config.throwOnUnknownMessageFormat) {
          const error = new Error(
            `[messaging] Unknown message format, must include the 'type' & 'timestamp' fields, received: ${JSON.stringify(
              message,
            )}`,
          )
          config.logger?.error(error)
          throw error
        }

        return false
      }

      if (!perTypeListeners[message.type as MessageType]) {
        return false
      }

      processMessage(message, sender, sendResponse)
      return true
    }

    return onRuntimeMessage(listener)
  }

  return {
    async sendMessage(type, data, arg) {
      const message = {
        id: getNextId(),
        type,
        data,
        timestamp: Date.now(),
      }
      config.logger?.debug(`[messaging] sendMessage {id=${message.id}} ->`)

      const response =
        arg == null
          ? await sendRuntimeMessageOnce(message)
          : await sendTabMessage(
              typeof arg === "number" ? arg : arg.tabId,
              message,
              typeof arg === "object" && arg.frameId != null
                ? { frameId: arg.frameId }
                : undefined,
            )
      const { res, err } = (response ?? {
        err: createNoResponseError(),
      }) as RuntimeMessagingResponse

      config.logger?.debug(`[messaging] sendMessage {id=${message.id}} <-`, {
        res,
        err,
      })

      if (err) {
        throw deserializeError(err)
      }

      return res as GetReturnType<TProtocolMap[typeof type]>
    },
    onMessage(type, onReceived) {
      if (!removeRootListener) {
        config.logger?.debug(
          `[messaging] "${String(
            type,
          )}" initialized the message listener for this context`,
        )
        removeRootListener = addRootListener()
      }

      if (perTypeListeners[type as MessageType]) {
        const error = new Error(
          `[messaging] In this JS context, only one listener can be setup for ${String(
            type,
          )}`,
        )
        config.logger?.error(error)
        throw error
      }

      perTypeListeners[type as MessageType] =
        onReceived as RuntimeMessageHandler<TProtocolMap, MessageType>
      config.logger?.log(`[messaging] Added listener for ${String(type)}`)

      return () => {
        delete perTypeListeners[type as MessageType]
        cleanupRootListener()
      }
    },
    removeAllListeners() {
      Object.keys(perTypeListeners).forEach((type) => {
        delete perTypeListeners[type as MessageType]
      })
      cleanupRootListener()
    },
  } as ExtensionMessenger<TProtocolMap>
}

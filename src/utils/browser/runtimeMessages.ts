import "~/utils/browser/browserEnvironment"

import { type RuntimeActionId } from "~/constants/runtimeActions"
import { getErrorMessage } from "~/utils/core/error"

/**
 * 发送消息到 runtime
 * 统一的消息发送接口
 * @param message 要发送到 runtime 的消息负载。
 * @param options 可选的重试和延迟配置。
 */
export async function sendRuntimeMessage(
  message: unknown,
  options?: SendMessageRetryOptions,
): Promise<any>

export async function sendRuntimeMessage<TResponse>(
  message: unknown,
  options?: SendMessageRetryOptions,
): Promise<TResponse>

export async function sendRuntimeMessage<TResponse>(
  message: unknown,
  options?: SendMessageRetryOptions,
): Promise<TResponse> {
  return await sendMessageWithRetry<TResponse>(message, options)
}

/**
 * Sends a runtime message whose `action` is a canonical {@link RuntimeActionId}.
 *
 * This is a thin wrapper over {@link sendRuntimeMessage} that preserves payload
 * and options unchanged while providing better type-safety for runtime action IDs.
 */
export async function sendRuntimeActionMessage(
  message: { action: RuntimeActionId } & Record<string, unknown>,
  options?: SendMessageRetryOptions,
): Promise<any>

export async function sendRuntimeActionMessage<TResponse>(
  message: { action: RuntimeActionId } & Record<string, unknown>,
  options?: SendMessageRetryOptions,
): Promise<TResponse>

export async function sendRuntimeActionMessage<TResponse>(
  message: { action: RuntimeActionId } & Record<string, unknown>,
  options?: SendMessageRetryOptions,
): Promise<TResponse> {
  return await sendRuntimeMessage<TResponse>(message, options)
}

export interface SendMessageRetryOptions {
  maxAttempts?: number
  delayMs?: number
}

export interface SendTabMessageRetryOptions
  extends SendMessageRetryOptions,
    browser.tabs._SendMessageOptions {
  documentId?: string
}

const RECOVERABLE_MESSAGE_SNIPPETS = [
  "Receiving end does not exist",
  "Could not establish connection",
]

/**
 * Detects WebExtension messaging failures where the receiver is unavailable,
 * for example because a content script has not attached yet or the listening
 * UI page is already closed.
 * @param error Unknown messaging error to inspect.
 * @returns True when the error indicates there is no active message receiver.
 */
export function isMessageReceiverUnavailableError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase()

  return RECOVERABLE_MESSAGE_SNIPPETS.some((snippet) =>
    message.includes(snippet.toLowerCase()),
  )
}

/**
 * Determines whether a WebExtension messaging error is transient and worth retrying.
 *
 * Applies to both `browser.runtime.sendMessage` and `browser.tabs.sendMessage`,
 * where content scripts may not be ready yet.
 */
function isRecoverableMessageError(error: unknown): boolean {
  return isMessageReceiverUnavailableError(error)
}

type MessageRetryDefaults = {
  maxAttempts: number
  delayMs: number
}

/**
 * Internal helper to retry WebExtension messaging work with exponential backoff.
 */
async function withMessageRetry<T>(
  work: () => Promise<T>,
  options: SendMessageRetryOptions | undefined,
  defaults: MessageRetryDefaults,
): Promise<T> {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? defaults.maxAttempts)
  const delayMs = options?.delayMs ?? defaults.delayMs

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await work()
    } catch (error) {
      const shouldRetry =
        attempt < maxAttempts - 1 && isRecoverableMessageError(error)

      if (!shouldRetry) {
        throw error
      }

      await new Promise((resolve) =>
        setTimeout(resolve, delayMs * Math.pow(2, attempt)),
      )
    }
  }

  // `work()` either returns or throws; this is just to satisfy TypeScript.
  throw new Error("withMessageRetry: exhausted retries")
}

/**
 * Sends a runtime message with retry logic for recoverable failures.
 * Applies exponential backoff based on `maxAttempts` and `delayMs`.
 * @param message Payload forwarded to the background/page runtime.
 * @param options Optional retry configuration.
 */
export async function sendMessageWithRetry(
  message: unknown,
  options?: SendMessageRetryOptions,
): Promise<any>

export async function sendMessageWithRetry<TResponse>(
  message: unknown,
  options?: SendMessageRetryOptions,
): Promise<TResponse>

export async function sendMessageWithRetry<TResponse>(
  message: unknown,
  options?: SendMessageRetryOptions,
): Promise<TResponse> {
  return await withMessageRetry(
    () => browser.runtime.sendMessage(message) as Promise<TResponse>,
    options,
    { maxAttempts: 3, delayMs: 500 },
  )
}

/**
 * Sends a message to a tab content script with retry logic for recoverable failures.
 *
 * This is useful when a tab has just been created and the content script might
 * not be ready to receive messages yet.
 *
 * Applies exponential backoff based on `maxAttempts` and `delayMs`.
 */
export async function sendTabMessageWithRetry(
  tabId: number,
  message: unknown,
  options?: SendTabMessageRetryOptions,
): Promise<any>

export async function sendTabMessageWithRetry<TResponse>(
  tabId: number,
  message: unknown,
  options?: SendTabMessageRetryOptions,
): Promise<TResponse>

export async function sendTabMessageWithRetry<TResponse>(
  tabId: number,
  message: unknown,
  options?: SendTabMessageRetryOptions,
): Promise<TResponse> {
  const sendOptions: browser.tabs._SendMessageOptions & {
    documentId?: string
  } = {
    ...(typeof options?.frameId === "number"
      ? { frameId: options.frameId }
      : {}),
    ...(typeof options?.documentId === "string"
      ? { documentId: options.documentId }
      : {}),
  }
  const hasSendOptions = Object.keys(sendOptions).length > 0
  // webextension-polyfill types do not yet model Chrome's documentId tab-message target.
  const typedSendOptions = sendOptions as browser.tabs._SendMessageOptions

  return await withMessageRetry(
    () =>
      (hasSendOptions
        ? browser.tabs.sendMessage(tabId, message, typedSendOptions)
        : browser.tabs.sendMessage(tabId, message)) as Promise<TResponse>,
    options,
    { maxAttempts: 5, delayMs: 400 },
  )
}

/**
 * 监听 runtime 消息
 * 返回清理函数
 *
 * 注意：callback 可以返回 true 来保持异步响应通道
 * @param callback 收到消息时触发的处理函数。
 */
export function onRuntimeMessage(
  callback: (
    message: any,
    sender: browser.runtime.MessageSender,
    sendResponse: (response?: any) => void,
  ) => void,
): () => void {
  browser.runtime.onMessage.addListener(callback)
  return () => {
    browser.runtime.onMessage.removeListener(callback)
  }
}

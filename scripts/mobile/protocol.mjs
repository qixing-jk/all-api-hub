import net from "node:net"

const TIMEOUT = 10000

/** Common bounded request/event lifecycle for the native debugging transports. */
function channel(send, shutdown) {
  const pending = new Map()
  const listeners = new Set()
  let closed = false
  return {
    onEvent(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    event(message) {
      for (const listener of listeners) listener(message)
    },
    reply(key, message) {
      const item = pending.get(key)
      if (item) {
        pending.delete(key)
        clearTimeout(item.timer)
        if (message.error)
          item.reject(
            new Error(
              message.message || message.error.message || String(message.error),
            ),
          )
        else item.resolve(message)
      }
    },
    request(key, message) {
      if (closed) return Promise.reject(new Error("Debugger disconnected"))
      if (pending.has(key))
        return Promise.reject(new Error(`Concurrent request to ${key}`))
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(key)
          reject(
            new Error(`Debugger timeout: ${message.method || message.type}`),
          )
          this.close()
        }, TIMEOUT)
        pending.set(key, { resolve, reject, timer })
        try {
          send(message)
        } catch (error) {
          clearTimeout(timer)
          pending.delete(key)
          reject(error)
        }
      })
    },
    close(error = new Error("Debugger disconnected")) {
      if (closed) return
      closed = true
      for (const item of pending.values()) {
        clearTimeout(item.timer)
        item.reject(error)
      }
      pending.clear()
      listeners.clear()
      shutdown()
    },
  }
}

/** Connect directly to a Chromium page/worker or browser WebSocket. */
export async function connectCdp(url) {
  const socket = new WebSocket(url)
  let sequence = 0
  const connection = channel(
    (message) => socket.send(JSON.stringify(message)),
    () => socket.close(),
  )
  socket.addEventListener("message", ({ data }) => {
    try {
      const message = JSON.parse(data)
      if (message.id) connection.reply(message.id, message)
      else connection.event(message)
    } catch (error) {
      connection.close(error)
    }
  })
  socket.addEventListener("close", () => connection.close())
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      connection.close()
      reject(new Error("CDP connection timeout"))
    }, TIMEOUT)
    socket.addEventListener(
      "open",
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timer)
        const error = new Error("CDP connection failed")
        connection.close(error)
        reject(error)
      },
      { once: true },
    )
  })
  return {
    request: (method, params = {}) => {
      const id = ++sequence
      return connection.request(id, { id, method, params })
    },
    onEvent: connection.onEvent,
    close: () => connection.close(),
  }
}

/** Firefox RDP uses byte-length-prefixed UTF-8 JSON, not CDP/WebSocket. */
export async function connectRdp(port) {
  const socket = net.createConnection({ host: "127.0.0.1", port })
  let buffer = Buffer.alloc(0)
  let greeted = false
  let ready, failed
  const greeting = new Promise((resolve, reject) => {
    ready = resolve
    failed = reject
  })
  const connection = channel(
    (message) => {
      const body = Buffer.from(JSON.stringify(message))
      socket.write(Buffer.concat([Buffer.from(`${body.length}:`), body]))
    },
    () => socket.destroy(),
  )
  const timer = setTimeout(() => {
    connection.close()
    failed(new Error("Firefox greeting timeout"))
  }, TIMEOUT)
  socket.on("error", (error) => {
    clearTimeout(timer)
    failed(error)
    connection.close(error)
  })
  socket.on("close", () => {
    clearTimeout(timer)
    failed(new Error("Firefox debugger disconnected"))
    connection.close()
  })
  socket.on("data", (chunk) => {
    try {
      buffer = Buffer.concat([buffer, chunk])
      while (buffer.length) {
        const separator = buffer.indexOf(58)
        if (separator < 0) {
          if (buffer.length > 12)
            throw new Error("Invalid Firefox packet header")
          break
        }
        const header = buffer.subarray(0, separator).toString()
        if (!/^\d+$/.test(header))
          throw new Error("Invalid Firefox packet length")
        const length = Number(header)
        if (length > 16 * 1024 * 1024)
          throw new Error("Firefox packet exceeds limit")
        if (buffer.length < separator + 1 + length) break
        const message = JSON.parse(
          buffer.subarray(separator + 1, separator + 1 + length).toString(),
        )
        buffer = buffer.subarray(separator + 1 + length)
        if (!greeted) {
          greeted = true
          clearTimeout(timer)
          ready()
          continue
        }
        // Protocol events have a type; ordinary actor replies do not.
        if (message.type && !message.error) connection.event(message)
        else connection.reply(message.from, message)
      }
    } catch (error) {
      clearTimeout(timer)
      failed(error)
      connection.close(error)
    }
  })
  await greeting
  return {
    request: (to, type, params = {}) =>
      connection.request(to, { ...params, to, type }),
    onEvent: connection.onEvent,
    close: () => connection.close(),
  }
}

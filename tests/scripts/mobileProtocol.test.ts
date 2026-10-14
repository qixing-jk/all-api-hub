import net from "node:net"
import { afterEach, expect, it } from "vitest"

import { connectRdp } from "~~/scripts/mobile/protocol.mjs"

const cleanup: (() => void)[] = []
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach((fn) => fn()),
)

it("reads fragmented UTF-8 Firefox packets and keeps events separate from replies", async () => {
  const packet = (value: unknown) => {
    const body = Buffer.from(JSON.stringify(value))
    return Buffer.concat([Buffer.from(`${body.length}:`), body])
  }
  const server = net.createServer((socket) => {
    cleanup.push(() => socket.destroy())
    socket.write(packet({ from: "root", applicationType: "browser" }))
    socket.once("data", () => {
      const bytes = Buffer.concat([
        packet({ from: "root", type: "tabListChanged" }),
        packet({ from: "root", tabs: [{ title: "手机" }] }),
      ])
      socket.write(bytes.subarray(0, bytes.length - 5))
      setTimeout(() => socket.write(bytes.subarray(bytes.length - 5)), 5)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  cleanup.push(() => server.close())
  const address = server.address() as net.AddressInfo
  const connection = await connectRdp(address.port)
  cleanup.push(() => connection.close())
  const events: unknown[] = []
  connection.onEvent((event: unknown) => events.push(event))
  await expect(connection.request("root", "listTabs")).resolves.toMatchObject({
    tabs: [{ title: "手机" }],
  })
  expect(events).toEqual([{ from: "root", type: "tabListChanged" }])
})

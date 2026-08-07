import assert from "node:assert/strict"
import test from "node:test"

import {
  CustomProviderStore,
  normalizeCustomProviderState,
} from "../src/customProviderStore.js"

const createMemoryStateStore = (initial = []) => {
  let value = structuredClone(initial)
  return {
    async read(fallback) {
      return value ?? structuredClone(fallback)
    },
    async write(next) {
      value = structuredClone(next)
    },
  }
}

test("stores OpenAI-compatible providers in natural name order", async () => {
  const store = new CustomProviderStore({
    stateStore: createMemoryStateStore(),
    now: () => new Date("2026-08-07T01:02:03.000Z"),
  })

  const ten = await store.save({
    name: "供应商 10",
    baseUrl: "https://ten.example.com/v1/",
  })
  const two = await store.save({
    name: "供应商 2",
    baseUrl: "https://two.example.com/v1",
  })

  assert.deepEqual(
    (await store.list()).map((provider) => provider.name),
    ["供应商 2", "供应商 10"],
  )
  assert.equal(ten.baseUrl, "https://ten.example.com/v1")
  assert.equal((await store.get(two.id)).name, "供应商 2")
})

test("edits and removes a saved custom provider", async () => {
  const store = new CustomProviderStore({
    stateStore: createMemoryStateStore(),
  })
  const created = await store.save({
    name: "旧名称",
    baseUrl: "https://old.example.com",
  })
  const updated = await store.save({
    id: created.id,
    name: "新名称",
    baseUrl: "https://new.example.com/api",
  })

  assert.equal(updated.id, created.id)
  assert.equal((await store.list())[0].name, "新名称")
  await store.remove(created.id)
  assert.deepEqual(await store.list(), [])
})

test("rejects duplicate names and unsafe custom provider URLs", async () => {
  const store = new CustomProviderStore({
    stateStore: createMemoryStateStore(),
  })
  await store.save({
    name: "内部 OpenAI",
    baseUrl: "https://first.example.com",
  })

  await assert.rejects(
    store.save({
      name: "内部 openai",
      baseUrl: "https://second.example.com",
    }),
    /同名/,
  )
  await assert.rejects(
    store.save({ name: "文件地址", baseUrl: "file:///tmp/upstream" }),
    /HTTP/,
  )
})

test("keeps valid custom provider rows when legacy state is partial", () => {
  assert.deepEqual(
    normalizeCustomProviderState([
      {
        id: "valid",
        name: "有效供应商",
        baseUrl: "https://valid.example.com",
      },
      { id: "invalid", name: "", baseUrl: "" },
    ]).map(({ id, name }) => ({ id, name })),
    [{ id: "valid", name: "有效供应商" }],
  )
})

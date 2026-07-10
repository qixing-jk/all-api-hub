import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import {
  normalizeScheduleOptions,
  ScheduleStore,
} from "../src/scheduleStore.js"

const makeStore = async () => {
  const root = await mkdtemp(join(tmpdir(), "dataeyesai-schedules-"))
  return {
    root,
    store: new ScheduleStore({
      path: join(root, "schedules.json"),
      secretPath: join(root, "schedule-secret.key"),
      now: () => new Date("2026-07-10T10:00:00.000Z"),
    }),
  }
}

const preview = {
  provider: { id: "openai", name: "OpenAI" },
  keys: [
    { apiKey: "sk-first-secret", quota: 20 },
    { apiKey: "sk-second-secret", quota: null },
    { apiKey: "sk-third-secret", quota: 30 },
  ],
  baseUrl: "https://api.openai.com",
  name: "OpenAI 定时",
  groups: ["default"],
  models: ["gpt-4o-mini"],
  duplicates: [],
  profileId: "profile",
  targetName: "主站",
  targetUrl: "https://new-api.example",
  channelOther: {},
  channelSettings: {},
  providerMappings: [],
  awsAutoCredentialMode: false,
  awsEntryRouting: false,
  templateConfig: null,
  templateChannelId: null,
  templateChannelName: "",
  automaticName: true,
  awsRouting: null,
}

test("normalizes schedule timing and batch size", () => {
  assert.deepEqual(
    normalizeScheduleOptions({
      startAt: "2026-07-10T18:30:00.000Z",
      batchSize: "5",
      intervalMinutes: "15",
    }),
    {
      batchSize: 5,
      intervalMinutes: 15,
      nextRunAt: "2026-07-10T18:30:00.000Z",
    },
  )
})

test("stores scheduled keys encrypted and exposes only public metadata", async () => {
  const { root, store } = await makeStore()
  try {
    const job = await store.create({
      preview,
      createOptions: { combineKeys: false },
      schedule: {
        startAt: "2026-07-10T10:05:00.000Z",
        batchSize: 2,
        intervalMinutes: 30,
      },
    })

    assert.equal(job.counts.total, 3)
    assert.equal(job.entries[0].keyHint, "••••cret")
    assert.equal(JSON.stringify(job).includes("sk-first-secret"), false)
    const rawFile = await readFile(join(root, "schedules.json"), "utf8")
    assert.equal(rawFile.includes("sk-first-secret"), false)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test("claims due batches and marks mixed results by key index", async () => {
  const { root, store } = await makeStore()
  try {
    const job = await store.create({
      preview,
      createOptions: { combineKeys: false },
      schedule: {
        startAt: "2026-07-10T10:00:00.000Z",
        batchSize: 2,
        intervalMinutes: 10,
      },
    })

    const claim = await store.claimDueJob(new Date("2026-07-10T10:00:00.000Z"))
    assert.equal(claim.id, job.id)
    assert.deepEqual(
      claim.preview.keys.map((entry) => entry.apiKey),
      ["sk-first-secret", "sk-second-secret"],
    )

    const updated = await store.completeRun(
      job.id,
      {
        success: false,
        successCount: 1,
        failedCount: 1,
        results: [
          {
            success: false,
            keyIndex: 1,
            error: "废 Key",
          },
          {
            success: true,
            keyIndex: 2,
            channelId: 123,
            channelName: "渠道 123",
          },
        ],
      },
      new Date("2026-07-10T10:01:00.000Z"),
    )

    assert.equal(updated.counts.pending, 1)
    assert.equal(updated.counts.imported, 1)
    assert.equal(updated.counts.failed, 1)
    assert.equal(updated.status, "active")
    assert.equal(updated.entries[0].status, "failed")
    assert.equal(updated.entries[1].channelId, 123)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

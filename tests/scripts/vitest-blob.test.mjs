import assert from "node:assert/strict"
import { test } from "node:test"
import { parse, stringify } from "flatted"

import { parseVitestBlob } from "../../scripts/utils/vitestBlob.mjs"

test("blob decoding preserves timings, coverage, literal strings and circular task identities", () => {
  const result = {
    state: "fail",
    duration: 123.25,
    message: '0 "1" \\ newline\n中文',
  }
  const coverage = {
    "src/example.ts": { s: { 0: 1 }, branches: [null, false, 7] },
  }
  const file = {
    name: "tests/0.test.ts",
    result,
    setupDuration: 2,
    prepareDuration: 3,
    collectDuration: 4,
    environmentLoad: 5,
    tasks: [],
    coverage,
  }
  const suite = { name: "1", file, parent: file, tasks: [file] }
  file.tasks.push(suite)
  const second = { name: "tests/1.test.ts", result, tasks: [suite], coverage }
  Object.defineProperty(coverage, "__proto__", {
    value: { safe: "0" },
    enumerable: true,
  })
  const blob = [
    "4.0.3",
    [file, second],
    [],
    [["node", ["0", "01", "1e2"]]],
    coverage,
    200,
  ]
  const text = stringify(blob)
  const decoded = parseVitestBlob(text)
  assert.deepEqual(decoded, parse(text))
  assert.equal(decoded[1][0].tasks[0].file, decoded[1][0])
  assert.equal(decoded[1][0].tasks[0].tasks[0], decoded[1][0])
  assert.equal(decoded[1][0].result, decoded[1][1].result)
  assert.equal(decoded[1][0].coverage, decoded[4])
  assert.equal(decoded[4].__proto__.safe, "0")
  assert.equal(Object.getPrototypeOf(decoded[4]), Object.prototype)
})

test("ordinary empty or primitive flatted values retain the original decoder's behavior", () => {
  for (const value of [
    null,
    false,
    7,
    "0",
    {},
    [],
    [null, false, 0],
    { a: "0", b: "1" },
  ]) {
    const text = stringify(value)
    assert.deepEqual(parseVitestBlob(text), parse(text))
  }
})

test("varied graphs retain every value and shared reference", () => {
  const literals = [
    null,
    false,
    true,
    0,
    -1,
    12.5,
    "",
    "0",
    "01",
    "中文",
    '\\"\n',
  ]
  for (let seed = 0; seed < 64; seed++) {
    const nodes = Array.from({ length: 24 }, (_, index) =>
      index % 3 ? {} : [],
    )
    for (let index = 0; index < nodes.length; index++) {
      const value = literals[(index + seed) % literals.length]
      const target = nodes[(index * 7 + seed) % nodes.length]
      if (Array.isArray(nodes[index]))
        nodes[index].push(value, target, nodes[index])
      else
        Object.assign(nodes[index], { value, next: target, self: nodes[index] })
    }
    const text = stringify(["4.0.3", nodes, [], [], { graph: nodes }, seed])
    assert.deepEqual(parseVitestBlob(text), parse(text), `Graph ${seed}`)
  }
})

test("noncanonical references and inline objects remain compatible with the original decoder", () => {
  for (const text of [
    '[["01"],"literal"]',
    '[["+1"],"literal"]',
    '[["1e0"],"literal"]',
    '[[{"inline":"1"}],"literal"]',
    '[["0"]]',
    '[["1"],{"forward":"0"}]',
    '[["2"],"unused"]',
    '[["not-an-index"]]',
    "[]",
  ]) {
    assert.deepEqual(parseVitestBlob(text), parse(text), text)
  }
})

test("malformed JSON and invalid null references keep failing", () => {
  for (const text of ["{", "null", "{}", '[["1"],null]']) {
    assert.throws(() => parse(text), undefined, text)
    assert.throws(() => parseVitestBlob(text), undefined, text)
  }
})

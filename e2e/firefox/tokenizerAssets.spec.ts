import { expect, test } from "./extensionTest"

test("Firefox reads both packaged tokenizer vocabularies", async ({
  firefoxExtension,
}) => {
  const options = firefoxExtension.page("options.html")
  await options.openInTab("#overview")
  const vocabularies = await options.evaluateAsync(`Promise.all(
    ["cl100k_base", "o200k_base"].map(async (encoding) => {
      const url = browser.runtime.getURL("tokenizers/" + encoding + ".json");
      const response = await fetch(url);
      if (!response.ok) throw new Error("Vocabulary load failed: " + response.status);
      const ranks = await response.json();
      return { encoding, length: ranks.length, first: ranks[0], protocol: new URL(url).protocol };
    })
  )`)
  expect(vocabularies).toEqual([
    {
      encoding: "cl100k_base",
      length: 100256,
      first: "!",
      protocol: "moz-extension:",
    },
    {
      encoding: "o200k_base",
      length: 199998,
      first: "!",
      protocol: "moz-extension:",
    },
  ])
})

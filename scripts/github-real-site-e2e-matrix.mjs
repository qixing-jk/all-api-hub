#!/usr/bin/env node
import { appendFileSync } from "node:fs"

import { filterRealSiteE2eMatrix } from "./real-site-e2e-matrix.mjs"

const category = process.argv[2] ?? "all"
const include = filterRealSiteE2eMatrix(category)
const matrix = JSON.stringify({ include })
const outputFile = process.env.GITHUB_OUTPUT

if (outputFile) {
  appendFileSync(outputFile, `matrix=${matrix}\n`, "utf8")
} else {
  console.log(matrix)
}

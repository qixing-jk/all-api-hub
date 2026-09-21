// Descriptive subjects in this repo already exceed the conventional 100-character header.
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "header-max-length": [2, "always", 120],
  },
}

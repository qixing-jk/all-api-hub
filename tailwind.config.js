/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["!./node_modules", "./**/*.{js,ts,jsx,tsx}"],
  plugins: [require("@tailwindcss/forms"), require("@tailwindcss/typography")],
}

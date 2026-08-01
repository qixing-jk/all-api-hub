const form = document.querySelector("#access-form")
const input = document.querySelector("#access-key")
const toggle = document.querySelector("#toggle-key")
const status = document.querySelector("#login-status")
const submit = document.querySelector("#login-button")

toggle.addEventListener("click", () => {
  const visible = input.type === "text"
  input.type = visible ? "password" : "text"
  toggle.textContent = visible ? "显示" : "隐藏"
})

form.addEventListener("submit", async (event) => {
  event.preventDefault()
  submit.disabled = true
  status.classList.add("hidden")
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessKey: input.value }),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || "登录失败")
    window.location.reload()
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "登录失败"
    status.classList.remove("hidden")
    input.focus()
    input.select()
  } finally {
    submit.disabled = false
  }
})

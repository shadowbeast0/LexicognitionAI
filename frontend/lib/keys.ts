export type ApiKeys = {
  openrouter: string
  google: string
  llamaCloud: string
}

const STORAGE_KEY = "lexicognition:keys"

export function loadKeys(): ApiKeys {
  if (typeof window === "undefined") return { openrouter: "", google: "", llamaCloud: "" }
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}")
    return { openrouter: saved.openrouter || "", google: saved.google || "", llamaCloud: saved.llamaCloud || "" }
  } catch {
    return { openrouter: "", google: "", llamaCloud: "" }
  }
}

export function saveKeys(keys: ApiKeys) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys))
  } catch {
    return
  }
}

export function clearKeys() {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    return
  }
}

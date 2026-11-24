"use client"

import { useEffect, useState } from "react"
import { KeyRound, Check, Eye, EyeOff } from "lucide-react"
import { clearKeys, loadKeys, saveKeys, type ApiKeys } from "@/lib/keys"

const FIELDS: { id: keyof ApiKeys; label: string; hint: string; href: string; required?: boolean }[] = [
  { id: "openrouter", label: "OpenRouter API key", hint: "Required. Runs Llama 3.3 70B for questions and grading.", href: "https://openrouter.ai/keys", required: true },
  { id: "google", label: "Google AI Studio key", hint: "Optional. Lets Gemini read diagrams when Vision is on.", href: "https://aistudio.google.com/app/apikey" },
  { id: "llamaCloud", label: "LlamaCloud API key", hint: "Optional. Uses LlamaParse for complex or scanned PDFs.", href: "https://cloud.llamaindex.ai/" },
]

export function ApiKeysPanel({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved?: (keys: ApiKeys) => void }) {
  const [keys, setKeys] = useState<ApiKeys>({ openrouter: "", google: "", llamaCloud: "" })
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) setKeys(loadKeys())
  }, [open])

  if (!open) return null

  return (
    <div className="w-full max-w-xl rounded-2xl border border-border bg-card/80 p-5 text-left backdrop-blur" role="region" aria-label="API keys">
      <div className="mb-4 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Your API keys</h2>
        <button type="button" className="ml-auto text-xs text-muted-foreground hover:text-foreground" onClick={() => setVisible((v) => !v)}>
          {visible ? <EyeOff className="inline h-3.5 w-3.5" /> : <Eye className="inline h-3.5 w-3.5" />} {visible ? "Hide" : "Show"}
        </button>
      </div>
      <div className="space-y-4">
        {FIELDS.map((field) => (
          <label key={field.id} className="block">
            <span className="flex items-baseline justify-between text-xs font-medium">
              {field.label}
              <a href={field.href} target="_blank" rel="noreferrer" className="text-primary hover:underline">Get a key</a>
            </span>
            <input
              type={visible ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              value={keys[field.id]}
              onChange={(event) => setKeys((current) => ({ ...current, [field.id]: event.target.value.trim() }))}
              placeholder={field.required ? "sk-or-..." : "Optional"}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary"
            />
            <span className="mt-1 block text-xs text-muted-foreground">{field.hint}</span>
          </label>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Keys are saved only in this browser and sent directly to each provider. Nothing goes through a Lexicognition server.</p>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={!keys.openrouter}
          onClick={() => { saveKeys(keys); onSaved?.(keys); onOpenChange(false) }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          <Check className="h-4 w-4" /> Save keys
        </button>
        <button type="button" onClick={() => { clearKeys(); setKeys({ openrouter: "", google: "", llamaCloud: "" }); onSaved?.({ openrouter: "", google: "", llamaCloud: "" }) }} className="rounded-lg border border-border px-4 py-2 text-sm">
          Forget keys
        </button>
      </div>
    </div>
  )
}

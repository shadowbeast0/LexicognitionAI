"use client"

import { loadKeys } from "@/lib/keys"

const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs"
const PDFJS_WORKER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs"
const TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1"
const LLM_MODEL = "meta-llama/llama-3.3-70b-instruct"
const VISION_MODEL = "gemini-2.5-flash"
const LLAMA_CLOUD = "https://api.cloud.llamaindex.ai/api/parsing"

type Chunk = { text: string; page: string; source: string; type?: string; vector?: Float32Array }
type Doc = { page_content: string; metadata: { page: string; source: string; type?: string } }

const loadModule = (url: string) => (new Function("u", "return import(u)") as (u: string) => Promise<any>)(url)

const state = {
  chunks: [] as Chunk[],
  embed: null as null | ((texts: string[]) => Promise<Float32Array[]>),
  questions: [] as string[],
  index: 0,
  lastQuestion: "",
  lastAnswer: "",
  lastCritique: "",
  perfectAnswers: new Map<string, string>(),
}

export function resetSession() {
  state.chunks = []
  state.questions = []
  state.index = 0
  state.lastQuestion = ""
  state.lastAnswer = ""
  state.lastCritique = ""
  state.perfectAnswers.clear()
}

function requireKey() {
  const keys = loadKeys()
  if (!keys.openrouter) throw new Error("Add your OpenRouter API key first.")
  return keys
}

async function llm(prompt: string): Promise<string> {
  const keys = requireKey()
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${keys.openrouter}`,
      "Content-Type": "application/json",
      "X-Title": "Lexicognition AI",
    },
    body: JSON.stringify({ model: LLM_MODEL, temperature: 0.2, messages: [{ role: "user", content: prompt }] }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = data?.error?.message || `OpenRouter error ${response.status}`
    throw new Error(response.status === 401 ? "OpenRouter rejected the API key. Check it in the key settings." : message)
  }
  return (data.choices?.[0]?.message?.content || "").trim()
}

function parseJson<T>(text: string): T {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim()
  const start = cleaned.search(/[\[{]/)
  const end = Math.max(cleaned.lastIndexOf("]"), cleaned.lastIndexOf("}"))
  if (start < 0 || end < start) throw new Error("The model did not return JSON.")
  return JSON.parse(cleaned.slice(start, end + 1)) as T
}

const JSON_FORMAT = "Return only valid JSON with no extra text."

async function getEmbedder() {
  if (state.embed) return state.embed
  const { pipeline } = await loadModule(TRANSFORMERS)
  const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { dtype: "q8" })
  state.embed = async (texts: string[]) => {
    const out: Float32Array[] = []
    for (let i = 0; i < texts.length; i += 16) {
      const batch = await extractor(texts.slice(i, i + 16), { pooling: "mean", normalize: true })
      for (const row of batch.tolist() as number[][]) out.push(Float32Array.from(row))
    }
    return out
  }
  return state.embed
}

async function retrieve(query: string, k = 8): Promise<Doc[]> {
  const embed = await getEmbedder()
  const [q] = await embed([query])
  return state.chunks
    .map((chunk) => {
      let dot = 0
      for (let i = 0; i < q.length; i += 1) dot += q[i] * (chunk.vector as Float32Array)[i]
      return { chunk, score: dot }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ chunk }) => ({ page_content: chunk.text, metadata: { page: chunk.page, source: chunk.source, type: chunk.type } }))
}

function splitText(text: string, size = 1500, overlap = 200): string[] {
  const separators = ["\n## ", "\n### ", "\n\n", "\n", " ", ""]
  const split = (input: string, level: number): string[] => {
    if (input.length <= size) return input.trim() ? [input] : []
    const separator = separators[level]
    const parts = separator ? input.split(separator).map((part, i) => (i ? separator + part : part)) : input.match(new RegExp(`[\\s\\S]{1,${size}}`, "g")) || []
    const chunks: string[] = []
    let current = ""
    for (const part of parts) {
      if (part.length > size) {
        if (current.trim()) chunks.push(current)
        current = ""
        chunks.push(...split(part, Math.min(level + 1, separators.length - 1)))
        continue
      }
      if ((current + part).length > size) {
        if (current.trim()) chunks.push(current)
        const tail = current.slice(Math.max(0, current.length - overlap))
        current = (tail + part).length <= size ? tail + part : part
      } else {
        current += part
      }
    }
    if (current.trim()) chunks.push(current)
    return chunks
  }
  return split(text, 0).map((chunk) => chunk.trim()).filter(Boolean)
}

async function loadPdf(file: File) {
  const pdfjs = await loadModule(PDFJS)
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER
  return pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
}

async function pdfPages(pdf: any): Promise<string[]> {
  const pages: string[] = []
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const page = await pdf.getPage(n)
    const content = await page.getTextContent()
    let text = ""
    let lastY: number | null = null
    for (const item of content.items as { str: string; transform: number[]; hasEOL?: boolean }[]) {
      const y = item.transform[5]
      if (lastY !== null && Math.abs(y - lastY) > 2) text += "\n"
      text += item.str
      if (item.hasEOL) text += "\n"
      lastY = y
    }
    pages.push(text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n"))
  }
  return pages
}

async function llamaParsePages(file: File, key: string): Promise<string[] | null> {
  try {
    const form = new FormData()
    form.append("file", file)
    const upload = await fetch(`${LLAMA_CLOUD}/upload`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form })
    if (!upload.ok) return null
    const { id } = await upload.json()
    for (let attempt = 0; attempt < 90; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      const job = await fetch(`${LLAMA_CLOUD}/job/${id}`, { headers: { Authorization: `Bearer ${key}` } }).then((r) => r.json())
      if (job.status === "SUCCESS") {
        const result = await fetch(`${LLAMA_CLOUD}/job/${id}/result/json`, { headers: { Authorization: `Bearer ${key}` } }).then((r) => r.json())
        return (result.pages || []).map((page: { md?: string; text?: string }) => page.md || page.text || "")
      }
      if (job.status === "ERROR" || job.status === "CANCELED") return null
    }
    return null
  } catch {
    return null
  }
}

async function describePage(pdf: any, n: number, googleKey: string): Promise<string | null> {
  const page = await pdf.getPage(n)
  const viewport = page.getViewport({ scale: 1.6 })
  const canvas = document.createElement("canvas")
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise
  const b64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1]
  const prompt = `You are a Research Paper Image Analyst.
1. CLASSIFY: Is this image a **Conceptual Diagram**, **Architecture**, **System Flow**, or **Graph**?
2. FILTER: If it is a purely decorative image, logo, or code snippet -> Return "IRRELEVANT".
3. DESCRIBE: Provide a dense technical explanation of the components and data flow logic.`
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${VISION_MODEL}:generateContent?key=${encodeURIComponent(googleKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      generationConfig: { temperature: 0.1 },
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: b64 } }] }],
    }),
  })
  if (!response.ok) return null
  const data = await response.json()
  const content = (data.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || "").join("").trim()
  if (!content || content.toUpperCase().includes("IRRELEVANT") || content.length < 20) return null
  return content
}

async function pagesWithFigures(pdf: any, limit: number): Promise<number[]> {
  const pdfjs = await loadModule(PDFJS)
  const pages: number[] = []
  for (let n = 1; n <= pdf.numPages && pages.length < limit; n += 1) {
    const page = await pdf.getPage(n)
    const ops = await page.getOperatorList()
    if (ops.fnArray.some((fn: number) => fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject)) pages.push(n)
  }
  return pages
}

export async function processPdf(file: File, enableVision: boolean, onStatus: (status: string) => void) {
  const keys = requireKey()
  resetSession()
  onStatus("reading")
  const pdf = await loadPdf(file)
  onStatus("parsing")
  const pages = (keys.llamaCloud && (await llamaParsePages(file, keys.llamaCloud))) || (await pdfPages(pdf))
  if (!pages.join("").trim()) throw new Error("No text could be read from this PDF. Scanned PDFs need a LlamaCloud key.")
  const chunks: Chunk[] = []
  pages.forEach((text, i) => {
    for (const piece of splitText(text)) chunks.push({ text: piece, page: String(i + 1), source: file.name })
  })
  if (enableVision && keys.google) {
    for (const n of await pagesWithFigures(pdf, 8)) {
      const description = await describePage(pdf, n, keys.google).catch(() => null)
      if (description) {
        chunks.push({
          text: `--- [ARCHITECTURAL DIAGRAM / FIGURE DESCRIPTION] ---\n${description}\n----------------------------------------------------`,
          page: String(n),
          source: file.name,
          type: "visual_data",
        })
      }
    }
  }
  onStatus("indexing")
  const embed = await getEmbedder()
  const vectors = await embed(chunks.map((c) => c.text))
  chunks.forEach((chunk, i) => { chunk.vector = vectors[i] })
  state.chunks = chunks
  onStatus("generating")
  state.questions = await generateQuestions()
  state.index = 0
  return { status: "ready", total_questions: state.questions.length, first_question: state.questions[0] }
}

async function generateQuestions(): Promise<string[]> {
  const topics = ["Abstract & Introduction", "Methodology & Experimental Setup", "Core Mechanisms & Theory", "Results & Data Analysis", "Discussion, Limitations & Implications"]
    .sort(() => Math.random() - 0.5)
  let context = ""
  for (const topic of topics) {
    for (const doc of await retrieve(topic)) context += `\n--- Topic: ${topic} (Page ${doc.metadata.page}) ---\n${doc.page_content}\n`
  }
  let foundVisuals = false
  for (const doc of await retrieve("architectural diagram figure description system workflow")) {
    if (doc.page_content.includes("ARCHITECTURAL DIAGRAM") || doc.metadata.type === "visual_data") {
      context += `\n--- !!! VISUAL EVIDENCE (Page ${doc.metadata.page}) !!! ---\n${doc.page_content}\n`
      foundVisuals = true
    }
  }
  const countInstruction = foundVisuals ? "The list length must be EXACTLY 6." : "The list length must be EXACTLY 5."
  const visualInstruction = foundVisuals
    ? `6. **Question 6 (The Visual Test):** Check the context for '!!! VISUAL EVIDENCE !!!'.
   - **IF FOUND:** Generate a 6th question that tests VISUAL OBSERVATION and LOGIC.
     - **RULE 1 (NO LEAKAGE):** Do NOT describe the process in the question itself.
     - **RULE 2 (POINT & ASK):** Instead, point to a specific component or connection in the diagram and ask the student to justify its existence.
     - **Format:** "Referencing the diagram on Page X, what is the specific mathematical purpose of the [Component Name]..."`
    : "6. **DO NOT GENERATE A 6TH QUESTION.** Stop strictly at 5 questions."
  const prompt = `${JSON_FORMAT}
You are a Professor conducting a Strict Viva Voce Examination for a Research Defense.
Your goal is to test the candidate's deep conceptual understanding of the PROVIDED RESEARCH PAPER.

**INSTRUCTIONS:**
1. **Questions 1-5:** Generate 5 deep, text-based conceptual questions from the 'Topic' sections.
${visualInstruction}

**OUTPUT FORMAT:**
- A raw JSON list of strings.
- ${countInstruction}

**VARIETY GUIDELINES:**
1. For each run, pick a different 'lens' suitable for the domain (Methodology, Structure, Implications).
2. Rotate between "Why" and "How" questions.
3. Each question MUST come from a different context section provided.

**STRICT VIVA GUIDELINES:**
1. Synthesize mechanisms: Ask how a core component or method solves a problem mentioned in the Motivation.
2. Avoid verbatim quotes or simple numerical facts.
3. Do not repeat the same focus across questions.

Context:
${context}

Output JSON List:`
  const questions = parseJson<string[]>(await llm(prompt)).filter((q) => typeof q === "string" && q.trim())
  if (!questions.length) throw new Error("No questions were generated. Try again.")
  return questions
}

async function extractAtomicPropositions(evidence: string) {
  return llm(`Extract a list of discrete, independent technical facts (atomic propositions)
from the evidence below. Each fact should be a standalone claim essential for a 10/10 answer.

Evidence: ${evidence}

Output Format:
- Proposition 1
- Proposition 2`)
}

async function extractGradingCriteria(question: string, evidence: string) {
  return parseJson<{ perfect_answer: string; mandatory_keywords: string[]; causal_logic: string }>(await llm(`${JSON_FORMAT}
Identify the core technical concepts and causal mechanisms required for a 10/10 answer.

Question: ${question}
Relevant Evidence: ${evidence}

Output a JSON object with:
1. "perfect_answer": A 2-3 sentence conceptual explanation.
2. "mandatory_keywords": A list of 5-8 specific technical keywords or phrases.
3. "causal_logic": The 'Why' behind the answer.`))
}

async function generatePerfectAnswer(question: string, atomicFacts: string) {
  return llm(`Using the Atomic Propositions below, construct a 10/10 conceptual "Viva Voce" answer.

VIVA STYLE GUIDELINES:
1. BE CONCISE: Max 150 words. Explain like a student speaking directly to a professor.
2. CAUSAL LOGIC: Focus heavily on the "Why" and "How" mechanisms.
3. NO CITATIONS: Do not mention specific page numbers, figures, or authors.
4. TECHNICAL DEPTH: Use precise, domain-specific terminology (e.g., "parallelization", "p-value", "enzyme kinetics") instead of vague descriptions.

Viva Question: ${question}
Atomic Propositions:
${atomicFacts}

Perfect Viva Answer (g*):`)
}

async function gradeAnswer(question: string, answer: string, cachedPerfect?: string) {
  const docs = await retrieve(question)
  const evidence = docs.map((d) => d.page_content).join("\n\n")
  const [atomicFacts, criteria] = await Promise.all([extractAtomicPropositions(evidence), extractGradingCriteria(question, evidence)])
  const perfectAnswer = cachedPerfect ?? (await generatePerfectAnswer(question, atomicFacts))
  const feedback = await llm(`You are a Strict but Fair Viva Voce Examiner. Compare the Student Answer (u) against the Perfect Answer (g*) and Keywords (K).

Viva Question: ${question}
Student Answer (u): ${answer}
Perfect Answer (g*): ${perfectAnswer}
Mandatory Keywords (K): ${(criteria.mandatory_keywords || []).join(", ")}
Required Causal Logic (L): ${criteria.causal_logic}
Supporting Atomic Facts (FOR YOUR REFERENCE ONLY): ${atomicFacts}

GRADING RULES:
1. PERFECT MATCH REWARD: If (u) is semantically identical or conceptually very similar to (g*), award 10/10 immediately.
2. KEYWORD/LOGIC CHECK:
   - 8-9/10: Hits all keywords and causal logic but has minor phrasing flaws.
   - 4-7/10: Partial understanding; explains 'What' but misses the 'Why'.
3. PENALTIES:
   - CIRCULAR REASONING: If (u) repeats words from the question *without* adding the technical mechanism, grade 1-2.
   - CONTRADICTION: Deduct 3 points if the answer contradicts itself.
   - HALLUCINATION: Penalize heavily for contradicting Atomic Facts.

Output Format:
**Grade:** [Score]/10 \\n
**Verdict:** [Pass/Fail/Partial] \\n
**Matched Keywords:** [List keywords found in student answer] \\n
**Examiner's Critique:** [Provide a blunt, human-like critique of their logic and consistency.] \\n
**Conceptual Gap:** [List the specific technical propositions or logic links that were missing.]

NEGATIVE CONSTRAINTS (CRITICAL):
1. DO NOT include a "Supporting Evidence", "References", "Sources", or "Atomic Facts" section in your output.
2. DO NOT mention page numbers or filenames in the text.
3. STOP writing immediately after the "Conceptual Gap" section.`)
  return { feedback, perfect_answer: perfectAnswer, docs }
}

async function preciseReferences(question: string) {
  const raw = await retrieve(question)
  const precise: Doc[] = []
  const seen: string[] = []
  for (const doc of raw) {
    const short = (await llm(`Extract the single most critical technical fact from this excerpt that answers: "${question}".

STRICT RULES:
1. Output ONE sentence only.
2. Maximum 120 words.
3. If the excerpt is irrelevant, output 'REDUNDANT'.
4. Do not start with "The text states..." or "In this paper...". Just state the fact directly.
5. Rephrase the excerpts by understanding the meaning instead of blindly copy-pasting.

Seen Concepts: ${JSON.stringify(seen)}
Excerpt: ${doc.page_content}`)).trim()
    if (!short.toUpperCase().includes("REDUNDANT") && short.length > 10) {
      precise.push({ page_content: short, metadata: doc.metadata })
      seen.push(short)
    }
    if (precise.length >= 2) break
  }
  return precise
}

export async function submitAnswer(request: { answer: string; question_context?: string | null; is_retry_or_followup?: boolean }) {
  if (!state.chunks.length) throw new Error("No PDF uploaded yet.")
  const isSkip = request.answer === "USER_SKIPPED_THOUGHTFULLY"
  const question = request.question_context || state.questions[state.index]
  let grade: { score: number; feedback: string; perfect_answer: string; docs: Doc[]; evidence: { page: string; source: string; content: string }[] }
  if (isSkip) {
    grade = { score: 0, feedback: "Question skipped by student.", perfect_answer: "N/A", docs: [], evidence: [] }
  } else {
    try {
      const result = await gradeAnswer(question, request.answer, state.perfectAnswers.get(question))
      if (!state.perfectAnswers.has(question)) state.perfectAnswers.set(question, result.perfect_answer)
      const match = result.feedback.match(/\*\*Grade:\*\*\s*(\d+)\/10/) || result.feedback.match(/(\d+)\/10/)
      grade = { ...result, score: match ? Number(match[1]) : 5, evidence: [] }
    } catch (error) {
      grade = { score: 0, feedback: `Error: ${error instanceof Error ? error.message : String(error)}`, perfect_answer: "N/A", docs: [], evidence: [] }
    }
    try {
      grade.evidence = (await preciseReferences(question)).map((doc) => ({ page: doc.metadata.page, source: doc.metadata.source, content: doc.page_content }))
    } catch {
      grade.evidence = []
    }
  }
  state.lastQuestion = question
  state.lastAnswer = request.answer
  state.lastCritique = grade.feedback
  if (!request.is_retry_or_followup) state.index += 1
  const finished = state.index >= state.questions.length
  return { grade_data: grade, next_question: finished ? "EXAM_COMPLETED" : state.questions[state.index], is_finished: finished, is_skip: isSkip }
}

export async function generateFollowup() {
  if (!state.chunks.length) throw new Error("Retriever not initialized.")
  try {
    const evidence = (await retrieve(state.lastQuestion)).map((d) => d.page_content).join("\n\n")
    const followup = await llm(`You are a Strict Examiner. The student has just answered a Viva question, but their answer had gaps or vagueness.
Generate ONE targeted follow-up question to probe the specific concept they missed or explained poorly.

Original Question: ${state.lastQuestion}
Student Answer: ${state.lastAnswer}
Examiner's Critique: ${state.lastCritique}
Relevant Evidence Context: ${evidence}

GUIDELINES:
1. Focus directly on the "Conceptual Gap" identified in the critique.
2. If the student mentioned a term but didn't explain "Why", ask about that specific mechanism.
3. Keep it short and sharp.
4. Do NOT simply repeat the original question.

Output ONLY the string of the follow-up question.`)
    return { followup_question: followup }
  } catch {
    return { followup_question: "Can you elaborate on the technical gaps identified in your previous answer?" }
  }
}

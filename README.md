# Lexicognition AI

![Microsoft](https://img.shields.io/badge/Sponsored%20by-Microsoft-00A4EF?logo=microsoft&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Frontend-Next.js-000000?logo=nextdotjs&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

Lexicognition AI is a production-style AI viva-voce platform that transforms a PDF research paper into an adaptive oral examination flow with evidence-grounded grading.

It combines:

- A FastAPI backend with streaming ingestion progress (SSE)
- A Retrieval-Augmented Generation (RAG) stack with Chroma
- LLM-driven question generation, critique-based grading, and follow-up probing
- A modern Next.js interface

## Championship Announcement

Our Team **ByteMe**, led by **Arjeesh Palai**, and team members **Arko Dasgupta**, **Sombrata Biswas**, and **Arka Dutta** bagged the **1st Prize** in the event **Lexicognition AI**, conducted by the annual techno-management fest of **IIT Kharagpur, Kshitij 2026**, and sponsored by **Microsoft**.

## Demo

Check out the demo below:

[![Lexicognition-AI Demo](https://github.com/shadowbeast0/LexicognitionAI/blob/main/assets/demo.gif)](https://www.loom.com/share/cd894cad2d8f478aa8a8a138156eb93f)

## Table of Contents

- [Why ByteMe](#why-lexicognition-ai)
- [Core Capabilities](#core-capabilities)
- [System Architecture](#system-architecture)
- [Mathematical Formalization](#mathematical-formalization)
- [API Design](#api-design)
- [Tech Stack](#tech-stack)
- [Repository Structure](#repository-structure)
- [Setup and Run](#setup-and-run)
- [Configuration](#configuration)
- [Evaluation and Workflow Notes](#evaluation-and-workflow-notes)
- [Contributions](#contributions)
- [Contributing](#contributing)
- [License](#license)

## Why ByteMe

Traditional viva workflows are hard to scale and difficult to standardize. Lexicognition AI addresses this by making the examination process:

- **Document-aware**: questions are generated from parsed paper context
- **Evidence-anchored**: feedback includes concise references derived from retrieval
- **Adaptive**: follow-up questions target conceptual gaps
- **Transparent**: deterministic flow state for question progression, retries, skips, and completion

## Core Capabilities

### 1) AI Examination Pipeline

- Upload PDF and initialize indexing pipeline via backend streaming endpoint
- Generate 5 core conceptual questions from retrieved context
- Conditionally generate a 6th visual-analysis question if conceptual diagrams are detected

### 2) Strict Grading Engine

- Creates atomic propositions from retrieved evidence
- Extracts mandatory technical keywords and causal logic constraints
- Generates a concise ideal baseline answer
- Grades student answers with explicit rubric outputs:
  - grade out of 10
  - pass/fail/partial verdict
  - matched keywords
  - conceptual gap critique

### 3) Follow-up Intelligence

- One-click generation of targeted follow-up question based on the most recent critique
- Follow-up depth control to avoid repetitive interrogation loops

### 4) Rich Frontend Experience

- Real-time upload progress with staged parsing/indexing/generation status
- Chat-based viva interface with retry, skip, follow-up, and next-question controls
- Evidence sidebar, markdown + math rendering, polished motion transitions
- 3D visual modules for experiential UI polish

### 5) Dual Interface Availability

- **Next.js app** for full web experience
- **Streamlit app** for rapid interactive viva board usage

## System Architecture

```text
PDF Upload
   |
   v
LlamaParse (Markdown + page split)
   |
   +--> Optional Vision Layer (PyMuPDF image extraction + Gemini captioning)
   |
   v
Recursive Chunking
   |
   v
Embeddings (all-MiniLM-L6-v2)
   |
   v
Chroma Vector Store
   |
   v
Retriever (k=8)
   |
   +--> Question Generation (5 + optional visual question)
   +--> Grading (atomic facts, keyword logic, critique)
   +--> Crisp Evidence Distillation
   +--> Follow-up Question Generation
```

### Backend Runtime Flow

1. `POST /upload_pdf` receives file and vision toggle.
2. Backend streams progress events (reading/parsing/indexing/generating).
3. Retriever pipeline is built and first question payload is returned.
4. `POST /submit_answer` grades each response and returns next state.
5. `POST /generate_followup` generates targeted follow-up from critique history.
6. `POST /reset` clears server session state.

## Mathematical Formalization

Let:

- $q_i$ = question $i$
- $D_i = \{d_1, d_2, ..., d_k\}$ be retrieved chunks for $q_i$
- $A(D_i)$ be atomic proposition extraction
- $g_i^*$ be the generated ideal baseline answer
- $u_i$ be student answer
- $K_i$ be mandatory keyword set
- $L_i$ be required causal logic constraints

We define:

$$
D_i = R(q_i), \quad A_i = A(D_i), \quad g_i^* = G(q_i, A_i)
$$

The grading critic computes:

$$
s_i = C(u_i, g_i^*, K_i, L_i), \quad s_i \in [0,10]
$$

A coarse decision map is then used in the frontend:

$$
\\text{grade}(s_i)=
\begin{cases}
\\text{PASS}, & s_i \ge 8 \\
\\text{REVIEW}, & 5 \le s_i < 8 \\
\\text{FAIL}, & s_i < 5
\end{cases}
$$

The follow-up generator uses contextual error correction:

$$
q_i' = F(q_i, u_i, \text{critique}_i, D_i)
$$

where $q_i'$ is a targeted probing question on the detected conceptual gap.

## API Design

### `GET /`

Health check endpoint.

### `POST /upload_pdf`

Initializes ingestion + retrieval pipeline.

- Form fields:
  - `file`: PDF
  - `enable_vision`: boolean (`true`/`false`)
- Response: `text/event-stream` with staged status updates and final ready payload.

### `POST /submit_answer`

Grades an answer and advances question state.

Request body:

```json
{
  "answer": "string",
  "question_context": "optional string",
  "is_retry_or_followup": false
}
```

Returns:

- `grade_data` (feedback, score, perfect answer, evidence)
- `next_question`
- `is_finished`
- `is_skip`

### `POST /generate_followup`

Generates one targeted follow-up question using last question/answer/critique context.

### `POST /reset`

Resets in-memory session and clears temporary upload file.

## Tech Stack

### Frontend

- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS v4
- Framer Motion
- Three.js (`@react-three/fiber`, `@react-three/drei`)
- Markdown rendering with GFM + KaTeX

### Backend

- FastAPI + Uvicorn
- Streamlit (alternate UI runtime)
- LangChain components
- LlamaParse for PDF parsing
- Chroma vector store
- HuggingFace sentence embeddings (`all-MiniLM-L6-v2`)
- OpenRouter LLM (`meta-llama/llama-3.3-70b-instruct`)
- Gemini (`gemini-2.5-flash`) for optional visual description

## Repository Structure

```text
.
├── backend.py                  # FastAPI server (SSE + grading endpoints)
├── app.py                      # Streamlit viva interface
├── src/
│   ├── examiner.py             # Question generation, grading, follow-up logic
│   ├── config.py               # Environment key loading
│   ├── models.py               # LLM, embeddings, vision description helpers
│   └── rag/
│       ├── ingest.py           # LlamaParse + vision extraction + chunking
│       ├── store.py            # Chroma embedding storage
│       ├── retrieve.py         # Retriever + crisp reference generation
│       └── __init__.py         # Pipeline composition
├── frontend/
│   ├── app/                    # Layout, routes, global styling
│   ├── components/             # Exam, landing, 3D, and UI components
│   └── lib/                    # Utilities and data typings
├── requirements.txt            # Python dependency baseline
├── environment.yml             # Conda environment specification
└── SETUP.md                    # Setup reference
```

## Setup and Run

Detailed setup remains available in [SETUP.md](SETUP.md).

### 1) Python Environment

```bash
python -m venv myenv
myenv\Scripts\activate
pip install -r requirements.txt
```

### 2) Conda Environment

```bash
conda env create -f environment.yml
```

### 3) Frontend Dependencies

```bash
cd frontend
npm install
```

### 4) Start Backend (FastAPI)

```bash
uvicorn backend:app --reload --port 8000
```

### 5) Start Frontend

```bash
cd frontend
npm run dev
```

Open: `http://localhost:3000`

### Optional: Streamlit Runtime

```bash
streamlit run app.py
```

## Configuration

Create a `.env` file in the repository root:

```env
OPENROUTER_API_KEY=your_openrouter_key
GOOGLE_API_KEY=your_google_key
LLAMA_CLOUD_API_KEY=your_llamacloud_key
```

Notes:

- `OPENROUTER_API_KEY` is required for core LLM operations.
- `GOOGLE_API_KEY` is required only when visual analysis is enabled.
- `LLAMA_CLOUD_API_KEY` is required for LlamaParse ingestion.

## Evaluation and Workflow Notes

- Question progression is stateful and supports:
  - retry submission
  - skip question
  - follow-up generation
  - graceful viva completion
- Evidence shown in UI is distilled into concise facts for readability.
- Perfect-answer caching avoids recomputation for repeated grading on same question.
- Upload processing uses SSE for incremental UX updates.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).

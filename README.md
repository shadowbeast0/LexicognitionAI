# Lexicognition-AI

Lexicognition-AI is a cutting-edge application designed to enhance the examination and grading process using AI-powered tools. It features a modern frontend built with Next.js and a robust backend to support AI-driven functionalities.

## Demo

Check out the demo video below to see Lexicognition-AI in action:

[Demo Video](https://raw.githubusercontent.com/shadowbeast0/lexicognition-AI/main/assets/demo.mp4)

## Contributions

- **Backend + RAG Pipeline**: [Arko Dasgupta](https://github.com/arkodasgupta0412) and [Arjeesh Palai](https://github.com/shadowbeast0)
- **Frontend**: [Sombrata Biswas](https://github.com/agentkira)

## Features

### Frontend

- **Landing Page**: Includes sections like Hero, Features, How It Works, and Call-to-Action.
- **Examination Interface**: Provides tools for file uploads, grading, and messaging.
- **3D Visuals**: Interactive 3D components using Three.js.
- **Reusable UI Components**: Buttons, progress bars, and more.

### Backend

- **AI-Powered Examination**: Supports ingestion, retrieval, and storage of examination data.
- **RAG (Retrieve-Answer-Generate) Pipeline**: Implements a pipeline for efficient data handling.
- **Utilities**: Includes mock data and helper functions.

## Tech Stack

### Frontend

- **Framework**: Next.js 14
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **3D Graphics**: Three.js
- **UI Components**: Custom React components with Lucide icons
- **Build Tool**: Webpack (built-in with Next.js)

### Backend

- **Framework**: FastAPI
- **Language**: Python 3.11+
- **AI/ML Libraries**: LangChain, LlamaIndex, LlamaParse
- **Vector Store**: Chroma
- **Embeddings**: Google Generative AI (Gemini)
- **LLM Integration**: OpenRouter API
- **API Format**: REST with Server-Sent Events (SSE) for streaming
- **Task Queue**: Async support with Python asyncio

## Project Structure

### Frontend

Located in the `frontend/` directory:

- `app/`: Contains global styles and page layouts.
- `components/`: Modular components for exams, landing pages, and 3D visuals.
- `lib/`: Utility functions and mock data.
- `public/`: Static assets.

### Backend

Located in the `src/` directory:

- `examiner.py`: Core logic for examination processing.
- `rag/`: Contains modules for ingestion, retrieval, and storage.
- `models.py`: Defines data models.
- `config.py`: Configuration settings.

### Environment

- Python virtual environment located in `myenv/`.
- Dependencies managed via `requirements.txt` and `environment.yml`.

## Setup

For setup instructions, refer to the [SETUP.md](SETUP.md) file.

## Usage

- Access the frontend at `http://localhost:3000`.
- Interact with the examination interface and AI tools.

## Contributing

1. Fork the repository.
2. Create a new branch:
   ```bash
   git checkout -b feature-branch
   ```
3. Commit your changes:
   ```bash
   git commit -m "Add new feature"
   ```
4. Push to the branch:
   ```bash
   git push origin feature-branch
   ```
5. Open a pull request.

## License

This project is licensed under the MIT License. See the LICENSE file for details.

## Acknowledgments

- Inspired by advancements in AI and modern web development.
- Built with Next.js, Python, and Three.js.

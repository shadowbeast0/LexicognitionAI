# Setup Instructions

Follow these steps to set up the Lexicognition-AI project on your local machine.

## Prerequisites

- Python 3.11+
- Node.js 18+
- npm or yarn

## Steps

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd lexicognition-AI
   ```
2. Set up the Python environment:

   **On Windows:**

   ```bash
   python -m venv myenv
   myenv\Scripts\activate
   pip install -r requirements.txt
   ```

   **On macOS/Linux:**

   ```bash
   python3 -m venv myenv
   source myenv/bin/activate
   pip install -r requirements.txt
   ```

3. Set up API Keys:

   Create a `.env` file in the root directory and add the following API keys:
   - **Google API Key**:
     - Obtain from: [Google API Key](https://aistudio.google.com/api-keys)
     - Enable the Gemini API
     - Add to `.env`: `GOOGLE_API_KEY=your_key_here`
   - **OpenRouter API Key**:
     - Obtain from: [OpenRouter API Key](https://openrouter.ai/)
     - Sign up and generate an API key from your account settings
     - Add to `.env`: `OPENROUTER_API_KEY=your_key_here`
   - **Llama Cloud API Key**:
     - Obtain from: [LlamaCloud API Key](https://cloud.llamaindex.ai/)
     - Sign up and create an API key from your dashboard
     - Add to `.env`: `LLAMA_CLOUD_API_KEY=your_key_here`

4. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   ```
5. Start the development servers:
   - Backend:
     ```bash
     uvicorn backend:app --reload --port 8000
     ```
   - Frontend:
     ```bash
     npm run dev
     ```

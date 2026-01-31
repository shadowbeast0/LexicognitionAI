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
   ```bash
   python -m venv myenv
   myenv\Scripts\activate  # On Windows
   pip install -r requirements.txt
   ```
3. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   ```
4. Start the development servers:
   - Backend:
     ```bash
     uvicorn backend:app --reload --port 8000
     ```
   - Frontend:
     ```bash
     npm run dev
     ```

import shutil
import os
import re
import traceback
import json
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, AsyncGenerator
from src.rag import create_retriever_pipeline
from src.examiner import generate_questions, grade_answer, generate_followup_question
from src.rag.retrieve import get_precise_references  # For crisp evidence

app = FastAPI()

# --- ENABLE CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- GLOBAL STATE ---
SESSION_STATE = {
    "retriever": None,
    "questions": [],
    "current_q_index": 0,
    "history": [],
    "last_question": "",
    "last_answer": "",
    "last_critique": "",
    "question_perfect_answers": {}
}

# --- REQUEST MODELS ---
class ChatRequest(BaseModel):
    answer: str
    question_context: Optional[str] = None
    is_retry_or_followup: Optional[bool] = False

class FollowupRequest(BaseModel):
    feedback: str


@app.get("/")
def health_check():
    return {"status": "active", "message": "Lexicognition Brain is Online"}


@app.post("/reset")
async def reset_session():
    """Clears all session state and Chroma collection for fresh start."""
    global SESSION_STATE
    SESSION_STATE = {
        "retriever": None,
        "questions": [],
        "current_q_index": 0,
        "history": [],
        "last_question": "",
        "last_answer": "",
        "last_critique": "",
        "question_perfect_answers": {}
    }
    # Delete temp file if exists
    if os.path.exists("temp_exam_file.pdf"):
        try:
            os.remove("temp_exam_file.pdf")
        except:
            pass
    print("🔄 Session reset complete.")
    return {"status": "reset", "message": "Session cleared successfully"}

@app.post("/upload_pdf")
async def upload_pdf(
    file: UploadFile = File(...),
    enable_vision: bool = Form(True) 
):
    """Handles PDF upload and initializes the RAG pipeline with streaming progress."""
    try:
        print(f"📥 Receiving file: {file.filename} (Vision Enabled: {enable_vision})")
        temp_filename = "temp_exam_file.pdf"
        original_filename = file.filename  
        
        with open(temp_filename, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        async def generate_progress():
            """Generator function to send progress updates."""
            try:
                # Step 1: Reading PDF Bytes
                yield f'data: {json.dumps({"status": "reading", "message": "Reading PDF Bytes..."})}\n\n'
                
                # Step 2: Ingesting Text & Visuals (LlamaParse)
                yield f'data: {json.dumps({"status": "parsing", "message": "Ingesting Text & Visuals (LlamaParse)..."})}\n\n'
                
                # Perform the pipeline
                retriever = create_retriever_pipeline(
                    temp_filename, 
                    original_filename, 
                    enable_vision=enable_vision
                )
                
                SESSION_STATE["retriever"] = retriever
                
                # Step 3: Constructing Atomic Index
                yield f'data: {json.dumps({"status": "indexing", "message": "Constructing Atomic Index..."})}\n\n'
                
                # Step 4: Generating Conceptual Questions
                yield f'data: {json.dumps({"status": "generating", "message": "Generating Conceptual Questions..."})}\n\n'
                
                questions = generate_questions(retriever)
                SESSION_STATE["questions"] = questions
                SESSION_STATE["current_q_index"] = 0
                SESSION_STATE["history"] = []
                
                print(f"✅ Exam Ready! Generated {len(questions)} questions.")
                
                # Final response with complete data
                yield f'data: {json.dumps({"status": "complete", "message": "Complete", "data": {"status": "ready", "total_questions": len(questions), "first_question": questions[0]}})}\n\n'
                
            except Exception as e:
                traceback.print_exc()
                yield f'data: {json.dumps({"status": "error", "message": str(e)})}\n\n'
        
        return StreamingResponse(generate_progress(), media_type="text/event-stream")
        
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    
    
@app.post("/submit_answer")
async def submit_answer(request: ChatRequest):
    """Grades user answers and manages question progression."""
    if not SESSION_STATE["retriever"]:
        raise HTTPException(status_code=400, detail="No PDF uploaded yet.")

    user_answer = request.answer
    is_skip = user_answer == "USER_SKIPPED_THOUGHTFULLY"
    
    grading_result = None
    current_q_text = request.question_context or SESSION_STATE["questions"][SESSION_STATE["current_q_index"]]
    
    if is_skip:
        grading_result = {
            "score": 0,
            "feedback": "Question skipped by student.",
            "perfect_answer": "N/A",
            "docs": [],
            "evidence": []
        }
    else:
        try:
            # Check for cached perfect answer
            cached_perfect = SESSION_STATE["question_perfect_answers"].get(current_q_text)
            
            grading_result = grade_answer(
                current_q_text, 
                user_answer, 
                SESSION_STATE["retriever"],
                perfect_answer=cached_perfect
            )
            
            # Cache the perfect answer if not already
            if cached_perfect is None and "perfect_answer" in grading_result:
                SESSION_STATE["question_perfect_answers"][current_q_text] = grading_result["perfect_answer"]
            
            # Extract score from feedback text (format: **Grade:** X/10)
            feedback_text = grading_result.get("feedback", "")
            score_match = re.search(r'\*\*Grade:\*\*\s*(\d+)/10', feedback_text)
            if score_match:
                grading_result["score"] = int(score_match.group(1))
            else:
                # Try alternative patterns
                score_match = re.search(r'(\d+)/10', feedback_text)
                if score_match:
                    grading_result["score"] = int(score_match.group(1))
                else:
                    grading_result["score"] = 5  # Default mid score if parsing fails
                
        except Exception as e:
            traceback.print_exc()
            grading_result = {"score": 0, "feedback": f"Error: {str(e)}", "perfect_answer": "N/A", "docs": []}
    
    # Use get_precise_references for crisp, UI-friendly evidence
    evidence = []
    if not is_skip:
        try:
            crisp_docs = get_precise_references(current_q_text, SESSION_STATE["retriever"])
            for doc in crisp_docs:
                evidence.append({
                    "page": str(doc.metadata.get('page', 'Unknown')),
                    "source": str(doc.metadata.get('source', 'Document')),
                    "content": doc.page_content
                })
        except Exception as e:
            print(f"⚠️ Evidence extraction failed: {e}")
    
    grading_result["evidence"] = evidence
    
    # Store for followup
    SESSION_STATE["last_question"] = current_q_text
    SESSION_STATE["last_answer"] = user_answer
    SESSION_STATE["last_critique"] = grading_result.get("feedback", "")
    
    # --- LOGIC FIX: PREVENT PREMATURE INDEX INCREMENT ---
    # Only increment the index if it's NOT a retry/follow-up. 
    # Skips are treated as completions of the current slot.
    if not request.is_retry_or_followup:
        SESSION_STATE["current_q_index"] += 1

    # Determine next question
    is_finished = SESSION_STATE["current_q_index"] >= len(SESSION_STATE["questions"])
    next_q = "EXAM_COMPLETED" if is_finished else SESSION_STATE["questions"][SESSION_STATE["current_q_index"]]

    return {
        "grade_data": grading_result,
        "next_question": next_q,
        "is_finished": is_finished,
        "is_skip": is_skip
    }

@app.post("/generate_followup")
async def generate_followup(request: FollowupRequest):
    """
    FIXED: Added missing endpoint to handle follow-up generation.
    Utilizes the same high-quality logic used in the Streamlit app.
    """
    if not SESSION_STATE["retriever"]:
        raise HTTPException(status_code=400, detail="Retriever not initialized.")
    
    try:
        print("🔍 Generating high-quality follow-up based on feedback...")
        
        # Get evidence for the last question
        docs = SESSION_STATE["retriever"].invoke(SESSION_STATE["last_question"])
        evidence = "\n\n".join([d.page_content for d in docs])
        
        # Calls the examiner logic which utilizes the RAG retriever for technical depth
        followup = generate_followup_question(
            SESSION_STATE["last_question"], 
            SESSION_STATE["last_answer"], 
            SESSION_STATE["last_critique"], 
            evidence
        )
        return {"followup_question": followup}
    except Exception as e:
        traceback.print_exc()
        # Fallback if the LLM fails
        return {"followup_question": "Can you elaborate on the technical gaps identified in your previous answer?"}

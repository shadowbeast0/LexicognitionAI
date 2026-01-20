from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser, StrOutputParser
from src.models import get_llm
import random

llm = get_llm()

def generate_questions(retriever):
    """ 
    Generates 5 text-based questions, plus an OPTIONAL 6th visual question
    if and only if a diagram description is found.
    """

    # Universal topics applicable to 99% of research papers
    topics = [
        "Abstract & Introduction", 
        "Methodology & Experimental Setup", 
        "Core Mechanisms & Theory", 
        "Results & Data Analysis", 
        "Discussion, Limitations & Implications"
    ]
    
    # Shuffle topics to ensure the LLM doesn't always prioritize them in the same order
    random.shuffle(topics)
    
    context_text = ""
    
    # 1. Fetch Text Context (With Page Numbers)
    for t in topics:
        # We invoke the retriever with these generic section headers
        docs = retriever.invoke(t)
        for d in docs:
            page_num = d.metadata.get('page', 'Unknown')
            context_text += f"\n--- Topic: {t} (Page {page_num}) ---\n{d.page_content}\n"

    # 2. Fetch Visual Context (Force-Fetch Diagrams)
    # This queries specifically for the tag we added in ingest.py
    visual_docs = retriever.invoke("architectural diagram figure description system workflow")
    
    # --- CHANGED: Strict Flag for Visuals ---
    found_visuals = False

    for d in visual_docs:
        # Only add if it actually contains our specific metadata or tag
        # If Vision was OFF, these docs simply won't exist in the vector store.
        if "ARCHITECTURAL DIAGRAM" in d.page_content or d.metadata.get("type") == "visual_data":
            page_num = d.metadata.get('page', 'Unknown')
            context_text += f"\n--- !!! VISUAL EVIDENCE (Page {page_num}) !!! ---\n{d.page_content}\n"
            found_visuals = True # Set flag to true

    # --- CHANGED: Dynamic Prompt Instructions ---
    if found_visuals:
        count_instruction = "The list length must be EXACTLY 6."
        visual_instruction = """
        6. **Question 6 (The Visual Test):** Check the context for '!!! VISUAL EVIDENCE !!!'.
           - **IF FOUND:** Generate a 6th question that tests VISUAL OBSERVATION and LOGIC.
             - **RULE 1 (NO LEAKAGE):** Do NOT describe the process in the question itself.
             - **RULE 2 (POINT & ASK):** Instead, point to a specific component or connection in the diagram and ask the student to justify its existence.
             - **Format:** "Referencing the diagram on Page X, what is the specific mathematical purpose of the [Component Name]..."
        """
    else:
        # FORCE strict 5 questions if no visuals were retrieved
        count_instruction = "The list length must be EXACTLY 5."
        visual_instruction = "6. **DO NOT GENERATE A 6TH QUESTION.** Stop strictly at 5 questions."

    # 3. Dynamic Prompting with Optional 6th Question
    template = f"""
    You are a Professor conducting a Strict Viva Voce Examination for a Research Defense.
    Your goal is to test the candidate's deep conceptual understanding of the PROVIDED RESEARCH PAPER.

    **INSTRUCTIONS:**
    1. **Questions 1-5:** Generate 5 deep, text-based conceptual questions from the 'Topic' sections.
    {visual_instruction}

    **OUTPUT FORMAT:**
    - A raw JSON list of strings. 
    - {count_instruction}

    **VARIETY GUIDELINES:**
    1. For each run, pick a different 'lens' suitable for the domain (Methodology, Structure, Implications).
    2. Rotate between "Why" and "How" questions.
    3. Each question MUST come from a different context section provided.

    **STRICT VIVA GUIDELINES:**
    1. Synthesize mechanisms: Ask how a core component or method solves a problem mentioned in the Motivation.
    2. Avoid verbatim quotes or simple numerical facts.
    3. Do not repeat the same focus across questions.

    Context:
    {{context}}

    Output JSON List:
    """
    
    parser = JsonOutputParser()

    prompt = ChatPromptTemplate.from_template("""
    {format_instructions}

    """ + template)

    chain = prompt | llm | parser

    return chain.invoke({
        "context": context_text,
        "format_instructions": parser.get_format_instructions()
    })


def extract_atomic_propositions(evidence):
    """
    The Cortex: Decomposes ground truth into discrete, independent technical facts.
    """
    template = """
    Extract a list of discrete, independent technical facts (atomic propositions) 
    from the evidence below. Each fact should be a standalone claim essential for a 10/10 answer.
    
    Evidence: {evidence}
    
    Output Format:
    - Proposition 1
    - Proposition 2
    """
    prompt = ChatPromptTemplate.from_template(template)
    response = (prompt | llm | StrOutputParser()).invoke({"evidence": evidence})
    return response.strip()


def extract_grading_criteria(question, evidence):
    """
    Filters relevant context and generates a list of mandatory conceptual keywords.
    """
    template = """
    Identify the core technical concepts and causal mechanisms required for a 10/10 answer.
    
    Question: {question}
    Relevant Evidence: {evidence}
    
    Output a JSON object with:
    1. "perfect_answer": A 2-3 sentence conceptual explanation.
    2. "mandatory_keywords": A list of 5-8 specific technical keywords or phrases.
    3. "causal_logic": The 'Why' behind the answer.
    """
    prompt = ChatPromptTemplate.from_template(template)
    chain = prompt | llm | JsonOutputParser()
    return chain.invoke({"question": question, "evidence": evidence})


def generate_perfect_answer(question, atomic_facts):
    """ 
    Generates a concise, viva-style 10/10 baseline (Max 150 words). 
    """
    template = """
    Using the Atomic Propositions below, construct a 10/10 conceptual "Viva Voce" answer.
    
    VIVA STYLE GUIDELINES:
    1. BE CONCISE: Max 150 words. Explain like a student speaking directly to a professor.
    2. CAUSAL LOGIC: Focus heavily on the "Why" and "How" mechanisms.
    3. NO CITATIONS: Do not mention specific page numbers, figures, or authors.
    4. TECHNICAL DEPTH: Use precise, domain-specific terminology (e.g., "parallelization", "p-value", "enzyme kinetics") instead of vague descriptions.

    Viva Question: {question}
    Atomic Propositions: 
    {atomic_facts}

    Perfect Viva Answer (g*):
    """
    prompt = ChatPromptTemplate.from_template(template)
    return (prompt | llm | StrOutputParser()).invoke({
        "question": question, 
        "atomic_facts": atomic_facts
    })


def generate_followup_question(original_question, student_answer, critique, evidence):
    """
    Generates a single follow-up question based on weaknesses in the student's answer.
    """
    template = """
    You are a Strict Examiner. The student has just answered a Viva question, but their answer had gaps or vagueness.
    Generate ONE targeted follow-up question to probe the specific concept they missed or explained poorly.

    Original Question: {original_question}
    Student Answer: {student_answer}
    Examiner's Critique: {critique}
    Relevant Evidence Context: {evidence}

    GUIDELINES:
    1. Focus directly on the "Conceptual Gap" identified in the critique.
    2. If the student mentioned a term but didn't explain "Why", ask about that specific mechanism.
    3. Keep it short and sharp.
    4. Do NOT simply repeat the original question.

    Output ONLY the string of the follow-up question.
    """
    prompt = ChatPromptTemplate.from_template(template)
    return (prompt | llm | StrOutputParser()).invoke({
        "original_question": original_question,
        "student_answer": student_answer,
        "critique": critique,
        "evidence": evidence
    })


def grade_answer(question, answer, retriever, perfect_answer=None):
    # 1. Retrieve the most relevant Chunks
    docs = retriever.invoke(question)
    evidence_text = "\n\n".join([d.page_content for d in docs])
    
    # 2. Extract Atomic Propositions
    atomic_facts = extract_atomic_propositions(evidence_text)

    # 3. Extract Grading Criteria & Keywords
    criteria = extract_grading_criteria(question, evidence_text)
    keywords = criteria["mandatory_keywords"]
    causal_logic = criteria["causal_logic"]
    
    # 4. Generate the 10/10 brief baseline
    if perfect_answer is None:
        perfect_answer = generate_perfect_answer(question, atomic_facts)
    
    # 5. The Conscience: Critic Function C(u, g*)
    template = """
    You are a Strict but Fair Viva Voce Examiner. Compare the Student Answer (u) against the Perfect Answer (g*) and Keywords (K).
    
    Viva Question: {question}
    Student Answer (u): {answer}
    Perfect Answer (g*): {perfect_answer}
    Mandatory Keywords (K): {keywords}
    Required Causal Logic (L): {causal_logic}
    Supporting Atomic Facts (FOR YOUR REFERENCE ONLY): {atomic_facts}

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
    **Grade:** [Score]/10 \n
    **Verdict:** [Pass/Fail/Partial] \n
    **Matched Keywords:** [List keywords found in student answer] \n
    **Examiner's Critique:** [Provide a blunt, human-like critique of their logic and consistency.] \n
    **Conceptual Gap:** [List the specific technical propositions or logic links that were missing.]

    NEGATIVE CONSTRAINTS (CRITICAL):
    1. DO NOT include a "Supporting Evidence", "References", "Sources", or "Atomic Facts" section in your output.
    2. DO NOT mention page numbers or filenames in the text.
    3. STOP writing immediately after the "Conceptual Gap" section.
    """
    
    prompt = ChatPromptTemplate.from_template(template)
    feedback = (prompt | llm | StrOutputParser()).invoke({
        "answer": answer,
        "perfect_answer": perfect_answer,
        "atomic_facts": atomic_facts,
        "question": question,
        "keywords": ", ".join(keywords),
        "causal_logic": causal_logic
    })
    
    print(f"\n--- Grading for: {question} ---\nKeywords: {keywords}\nLogic: {causal_logic}")
    
    return {
        "feedback": feedback,
        "perfect_answer": perfect_answer,
        "docs": docs
    }
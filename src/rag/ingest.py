import os
import tempfile
try:
    import pymupdf as fitz  # PyMuPDF (preferred)
except ImportError:
    import fitz  # Backward compatibility alias
from llama_parse import LlamaParse
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from src.config import LLAMA_CLOUD_API_KEY
from src.models import describe_image 

def load_and_chunk_pdf(uploaded_file, original_filename=None, enable_vision=True):
    """
    Ingests PDF using LlamaParse.
    Args:
        uploaded_file: The file path string (from FastAPI) or file object.
        original_filename (str): The actual name of the file to use in metadata.
    """
    
    # 1. Determine Display Name for Metadata
    if original_filename:
        display_name = original_filename
    elif isinstance(uploaded_file, str):
        display_name = os.path.basename(uploaded_file)
    else:
        display_name = getattr(uploaded_file, "name", "document.pdf")

    # 2. Handle File Path vs File Object
    if isinstance(uploaded_file, str):
        tmp_path = uploaded_file
        should_cleanup = False
    else:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
            tmp_file.write(uploaded_file.getvalue())
            tmp_path = tmp_file.name
        should_cleanup = True

    try:
        # 3. Parse with LlamaParse
        parser = LlamaParse(
            api_key=LLAMA_CLOUD_API_KEY,
            result_type="markdown",
            verbose=True,
            split_by_page=True
        )
        llama_documents = parser.load_data(tmp_path)
        langchain_docs = []
        
        # --- PHASE A: Text Documents ---
        for i, doc in enumerate(llama_documents):
            page_num = doc.metadata.get("page_number", str(i + 1))
            metadata = {
                "source": display_name,  # <--- USES CORRECT FILENAME
                "page": str(page_num) 
            }
            lc_doc = Document(page_content=doc.text, metadata=metadata)
            langchain_docs.append(lc_doc)

        if enable_vision:
        # --- PHASE B: Vision Layer (Extract & Caption Conceptual Diagrams) ---
            print("👀 Scanning PDF for Architectural Diagrams & Conceptual Flows...")
            pdf_doc = None
            try:
                pdf_doc = fitz.open(tmp_path)
            
                for page_index in range(len(pdf_doc)):
                    page = pdf_doc[page_index]
                    image_list = page.get_images(full=True)
                
                    if image_list:
                        print(f"   -> Found {len(image_list)} images on Page {page_index+1}")
                
                    for img_index, img in enumerate(image_list):
                        xref = img[0]
                        base_image = pdf_doc.extract_image(xref)
                        image_bytes = base_image["image"]
                    
                    # Filter 1: Ignore tiny icons/artifacts (< 5KB)
                        if len(image_bytes) < 5000: 
                            continue
                        
                    # Filter 2: Send to Groq Vision for "Concept vs. Data" check
                        description = describe_image(image_bytes)
                    
                        if description:
                            print(f"      ✅ conceptual diagram captured on Page {page_index+1}")
                        
                        # Create a distinct "Visual Document"
                            visual_text = f"--- [ARCHITECTURAL DIAGRAM / FIGURE DESCRIPTION] ---\n{description}\n----------------------------------------------------"
                        
                            visual_doc = Document(
                                page_content=visual_text,
                                metadata={
                                    "source": original_filename,
                                    "page": str(page_index + 1),
                                    "type": "visual_data" # Metadata tag for filtering if needed
                                }
                            )
                            langchain_docs.append(visual_doc)
                        else:
                        # describe_image returns None for irrelevant plots/charts
                            pass
                        
            except Exception as e:
                print(f"⚠️ Vision Layer Warning: Could not process images. Error: {e}")
            # We continue even if vision fails, so we don't crash the main text pipeline
        
            finally:
            # Close the PDF file handle to release Windows file lock
                if pdf_doc:
                    pdf_doc.close()
        else:
             print("🚫 Vision Layer Skipped by User Toggle.")

        # 4. Chunking
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1500, 
            chunk_overlap=200,
            separators=["\n## ", "\n### ", "\n\n", "\n", " ", ""] 
        )
        final_splits = text_splitter.split_documents(langchain_docs)

        # 5. Debug Output
        full_debug_text = f"Source: {display_name}\nTotal Chunks: {len(final_splits)}\n{'='*50}\n\n"
        for i, chunk in enumerate(final_splits):
            full_debug_text += f"--- [ CHUNK {i+1} ] ---\nMetadata: {chunk.metadata}\nContent:\n{chunk.page_content}\n{'-'*30}\n\n"

        current_dir = os.path.dirname(os.path.abspath(__file__))
        root_dir = os.path.dirname(os.path.dirname(current_dir)) 
        debug_file_path = os.path.join(root_dir, "debug_llama_parse.txt")
        
        with open(debug_file_path, "w", encoding="utf-8") as f:
            f.write(full_debug_text)

        return final_splits, debug_file_path

    finally:
        if should_cleanup and os.path.exists(tmp_path):
            try: os.remove(tmp_path)
            except: pass
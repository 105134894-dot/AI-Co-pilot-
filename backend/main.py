from fileinput import filename
import os
import time
import io
import json
from typing import List, Optional
from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel
from dotenv import load_dotenv
from pinecone import Pinecone, ServerlessSpec
from google import genai
from fastapi.middleware.cors import CORSMiddleware
from pypdf import PdfReader
from docx import Document

# ==========================================
# 1. SETUP & CONFIGURATION
# ==========================================
load_dotenv()

# Load API Keys with safety checks
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME")
KNOWLEDGE_MAP_INDEX_NAME = os.getenv("KNOWLEDGE_MAP_INDEX_NAME")

if not all([GEMINI_API_KEY, PINECONE_API_KEY, PINECONE_INDEX_NAME, KNOWLEDGE_MAP_INDEX_NAME]):
    raise ValueError("❌ Missing required API keys in .env")

# Configure Gemini with new API
client = genai.Client(api_key=GEMINI_API_KEY)

# --- CHANGED: Use 2.5-flash-lite ---
CHAT_MODEL_NAME = 'gemini-2.5-flash-lite'
EMBED_MODEL_NAME = 'text-embedding-004'

# Pinecone Configuration
pc = Pinecone(api_key=PINECONE_API_KEY)

# Main Knowledge Base Index
if PINECONE_INDEX_NAME not in pc.list_indexes().names():
    print(f"⚙️ Creating Knowledge Base index '{PINECONE_INDEX_NAME}'")
    pc.create_index(
        name=PINECONE_INDEX_NAME,
        dimension=768,
        metric="cosine",
        spec=ServerlessSpec(cloud="aws", region="us-east-1")
    )
index_kb = pc.Index(PINECONE_INDEX_NAME)

# Knowledge Map Index
if KNOWLEDGE_MAP_INDEX_NAME not in pc.list_indexes().names():
    print(f"⚙️ Creating Knowledge Map index '{KNOWLEDGE_MAP_INDEX_NAME}'")
    pc.create_index(
        name=KNOWLEDGE_MAP_INDEX_NAME,
        dimension=768,
        metric="cosine",
        spec=ServerlessSpec(cloud="aws", region="us-east-1")
    )
index_km = pc.Index(KNOWLEDGE_MAP_INDEX_NAME)

# Ingestion constants
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200
BATCH_SIZE = 100

# ==========================================
# 2. DATA MODELS (Pydantic)
# ==========================================
class ChatRequest(BaseModel):
    query: str    
    top_k: Optional[int] = 3
    system_prompt: Optional[str] = None  # Accept system prompt from frontend

class Source(BaseModel):
    text: str
    source: str
    score: float

class ChatResponse(BaseModel):
    response: str          
    sources: List[Source]

class IngestResponse(BaseModel):
    success: bool
    message: str
    chunks_added: int
    filename: str

# ==========================================
# 3. HELPER FUNCTIONS FOR INGESTION
# ==========================================
def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text from PDF file bytes"""
    try:
        pdf_file = io.BytesIO(file_bytes)
        reader = PdfReader(pdf_file)
        return "".join([page.extract_text() or "" for page in reader.pages])
    except Exception as e:
        print(f"Error reading PDF: {e}")
        return ""

def extract_text_from_docx(file_bytes: bytes) -> str:
    """Extract text from DOCX file bytes"""
    try:
        docx_file = io.BytesIO(file_bytes)
        doc = Document(docx_file)
        return "\n".join([p.text for p in doc.paragraphs])
    except Exception as e:
        print(f"Error reading DOCX: {e}")
        return ""

def extract_docx_paragraphs_with_headings(file_bytes: bytes):
    """
    Returns a list of tuples: (paragraph_text, heading)
    """
    doc = Document(io.BytesIO(file_bytes))
    paragraphs = []
    current_heading = "No Heading"

    for p in doc.paragraphs:
        style = p.style.name
        if style.startswith("Heading"):
            current_heading = p.text.strip() or current_heading
        elif p.text.strip():
            paragraphs.append((p.text.strip(), current_heading))

    return paragraphs

def extract_pdf_paragraphs_with_headings(file_bytes: bytes):
    """
    Returns a list of tuples: (paragraph_text, heading)
    Heuristic: lines in ALL CAPS and short are headings
    """
    pdf_file = io.BytesIO(file_bytes)
    reader = PdfReader(pdf_file)
    paragraphs = []
    current_heading = "No Heading"

    for page in reader.pages:
        text = page.extract_text() or ""
        for para in text.split("\n\n"):
            para = para.strip()
            if not para:
                continue
            if para.isupper() and len(para.split()) < 10:
                current_heading = para
            else:
                paragraphs.append((para, current_heading))

    return paragraphs

# ----- Paragraph-level Chunking -----
def merge_paragraphs_into_chunks(paragraphs, max_chunk_size=1000):
    """
    Merge paragraph tuples into chunks.
    Returns list of dicts: {'text', 'heading', 'paragraph_index'}
    """
    chunks = []
    current_chunk = ""
    current_heading = ""
    start_index = 0

    for i, (para_text, para_heading) in enumerate(paragraphs):
        if not current_chunk:
            current_chunk = para_text
            current_heading = para_heading
            start_index = i
        elif len(current_chunk) + len(para_text) + 1 <= max_chunk_size:
            current_chunk += "\n" + para_text
        else:
            chunks.append({
                "text": current_chunk.strip(),
                "heading": current_heading,
                "paragraph_index": start_index
            })
            current_chunk = para_text
            current_heading = para_heading
            start_index = i

    if current_chunk:
        chunks.append({
            "text": current_chunk.strip(),
            "heading": current_heading,
            "paragraph_index": start_index
        })

    return chunks

# ==========================================
# 4. DEFAULT SYSTEM PROMPT (Fallback Only)
# ==========================================
DEFAULT_SYSTEM_PROMPT = """You are an AI Co-Pilot for accessibility and inclusive design, specifically supporting Mekong Inclusive Ventures (MIV) practitioners, educators, and Entrepreneur Support Organizations (ESOs).

Provide clear, concise, and actionable advice based on the provided context.
Focus on accuracy, brevity, and professionalism.

Structure responses as:
- Direct answer first
- Step-by-step guidance when needed
- Relevant tool links or examples
- Bullet points for clarity
- Provide URL links for all relevant sources.

Do not use overly friendly or casual language like "I'd be happy to help", "Sure thing!", or excessive exclamation marks.

If the context does not contain the answer, say, "I don't have specific information on this in the MIV knowledge base, but here is general best practice," followed by helpful guidance."""

# ==========================================
# 5. FASTAPI APP & ROUTES
# ==========================================
app = FastAPI(title="MIV AI Co-Pilot API")

# CORS - Allowing all origins to prevent connection issues
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {"status": "online", "message": "MIV AI Co-Pilot Brain is running 🧠"}

# -----------------------
# Ingest Endpoint
# -----------------------
@app.post("/ingest", response_model=IngestResponse)
async def ingest_endpoint(file: UploadFile = File(...), target_index: str = "kb"):
    """
    Upload and ingest a file into the vector database.

    KB (default):
      - PDF
      - DOCX
      - TXT
      - Generic JSON {topic, content}

    KM (target_index="km"):
      - JSON Knowledge Map with text_to_embed + metadata
    """
    start_time = time.time()
    filename = file.filename

    # -----------------------------
    # SELECT INDEX
    # -----------------------------
    if target_index == "km":
        index_target = pc.Index(KNOWLEDGE_MAP_INDEX_NAME)
    else:
        index_target = pc.Index(PINECONE_INDEX_NAME)

    # -----------------------------
    # FILE TYPE VALIDATION
    # -----------------------------
    if not filename.lower().endswith(('.pdf', '.docx', '.json', '.txt')):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Only PDF, DOCX, TXT, or JSON supported."
        )

    try:
        # -----------------------------
        # CLEAN EXISTING VECTORS
        # -----------------------------
        try:
            index_target.delete(filter={"source": filename})
        except Exception:
            pass

        file_bytes = await file.read()
        paragraph_chunks = []

       # =========================================================
        # KB INGESTION (FALLBACK HEADINGS)
        # =========================================================
        if target_index != "km":

            if filename.lower().endswith('.pdf'):
                paragraphs = extract_pdf_paragraphs_with_headings(file_bytes)
                paragraph_chunks_raw = merge_paragraphs_into_chunks(paragraphs)

            elif filename.lower().endswith('.docx'):
                paragraphs = extract_docx_paragraphs_with_headings(file_bytes)
                paragraph_chunks_raw = merge_paragraphs_into_chunks(paragraphs)


            elif filename.lower().endswith('.txt'):
                text = file_bytes.decode("utf-8", errors="ignore")
                paragraphs_raw = [p.strip() for p in text.split("\n\n") if p.strip()]
                paragraph_chunks_raw = [{"text": p, "heading": None} for p in paragraphs_raw]

            elif filename.lower().endswith('.json'):
                data = json.loads(file_bytes)
                paragraph_chunks_raw = [{"text": entry.get("content", ""), "heading": entry.get("topic")} for entry in data]



        # =========================================================
        # KM INGESTION
        # =========================================================
        else:
            km_data = json.loads(file_bytes)

            for i, entry in enumerate(km_data):
                text_for_embedding = entry.get("description", "").strip()
                if not text_for_embedding:
                    continue

                paragraph_chunks.append({
                    "text": text_for_embedding,
                    "paragraph_index": i,
                    "metadata": {
                        "source": filename,
                        "user_intent": entry.get("user_intent", ""),
                        "tool_name": entry.get("tool_name", ""),
                        "url": entry.get("url") or entry.get("URL", ""),
                        "user_questions": entry.get("user_questions", ""),
                        "description": text_for_embedding
                        
                    }
                })

        # =========================================================
        # EMBEDDING + UPSERT
        # =========================================================
        vectors_to_upsert = []

        for chunk in paragraph_chunks:
            text = chunk["text"]
            para_idx = chunk["paragraph_index"]

            embedding_response = client.models.embed_content(
                model=EMBED_MODEL_NAME,
                contents=text
            )
            vector = embedding_response.embeddings[0].values

            # -----------------------------
            # KB UPSERT (CLEAN)
            # -----------------------------
            if target_index != "km":
                chunk_id = f"{filename}-para-{para_idx}"

                vectors_to_upsert.append((
                    chunk_id,
                    vector,
                    {
                        "text": text,
                        "heading": chunk.get("heading"),
                        "source": filename
                    }
                ))

            # -----------------------------
            # KM UPSERT (INTENT-BASED)
            # -----------------------------
            else:
                metadata = chunk["metadata"]
                chunk_id = f"km-{para_idx}"

                vectors_to_upsert.append((
                    chunk_id,
                    vector,
                    {
                        "text": metadata["description"],
                        "source": metadata["source"],
                        "user_intent": metadata["user_intent"],
                        "tool_name": metadata["tool_name"],
                        "url": metadata["url"],
                        "user_questions": metadata["user_questions"]
                    }
                ))

            # Batch upsert
            if len(vectors_to_upsert) >= BATCH_SIZE:
                index_target.upsert(vectors=vectors_to_upsert)
                vectors_to_upsert = []

        # Final flush
        if vectors_to_upsert:
            index_target.upsert(vectors=vectors_to_upsert)

        return IngestResponse(
            success=True,
            message=f"Successfully ingested {filename}",
            chunks_added=len(paragraph_chunks),
            filename=filename
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -----------------------
# Chat Endpoint (Dual Index)
# -----------------------
@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest):
    start_time = time.time()
    
    # 1️⃣ Get user question
    question = req.query.strip()
    print(f"\n🔥 Received Question: {question}")

    # Use passed system prompt or fall back to default
    system_prompt = req.system_prompt if req.system_prompt else DEFAULT_SYSTEM_PROMPT
    print(f"📋 Using System Prompt: {system_prompt[:100]}...")

    # 2️⃣ Handle greetings first
    greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon']
    if question.lower() in greetings:
        return {
            "response": "Hello! 👋 I'm your AI Co-Pilot for accessibility. I can help you find tools, understand guidelines, or improve your content. What would you like to know?",
            "sources": []
        }

    # 3️⃣ Detect formatting instructions
    formatted_question = question  # default
    q_lower = question.lower()

    if "in three words" in q_lower:
        formatted_question += " (Answer in exactly three words, separated by commas, no extra commentary)"
    elif "bullet points" in q_lower:
        formatted_question += (
            " (Answer as bullet points: each tip on a separate line starting with '-', do not combine multiple tips in one paragraph, no inline asterisks)"
        )
    elif "numbered steps" in q_lower:
        formatted_question += (
            " (Answer as numbered steps: each step on a separate line starting with its number, no extra commentary)"
        )

    try:
        # --- EMBED USER QUESTION ---
        embedding_response = client.models.embed_content(
            model=EMBED_MODEL_NAME,
            contents=question
        )
        query_embedding = embedding_response.embeddings[0].values

        # --- STEP 1: QUERY KNOWLEDGE MAP ---
        km_results = index_km.query(
            vector=query_embedding,
            top_k=1,
            include_metadata=True
        )

        if km_results['matches']:
            km_text = km_results['matches'][0]['metadata'].get('text', '')
            km_topic = km_text
            print("🔹 KM Retrieved:")
            for match in km_results['matches']:
                metadata = match.get('metadata', {})
                print("  - User Intent:", metadata.get('user_intent'))
                print("  - Source:", metadata.get('source'))
                print("  - Text preview:", metadata.get('text')[:150])
        else:
            km_text = ""
            km_topic = question

        # --- STEP 2: QUERY KNOWLEDGE BASE using KM topic ---
        kb_embedding_response = client.models.embed_content(
            model=EMBED_MODEL_NAME,
            contents=km_topic
        )
        kb_query_embedding = kb_embedding_response.embeddings[0].values

        kb_results = index_kb.query(
            vector=kb_query_embedding,
            top_k=req.top_k,
            include_metadata=True
        )

        print("🔹 KB Retrieved:")
        for match in kb_results['matches']:
            metadata = match.get('metadata', {})
            print("  - Source:", metadata.get('source'))
            print("  - Score:", match['score'])
            print("  - Text preview:", metadata.get('text')[:150])  
            
        # --- BUILD CONTEXT ---
        retrieved_chunks = []
        context_text_list = []

        # Add Knowledge Map snippet first
        if km_text:
            context_text_list.append(f"[Source: Knowledge Map]\n{km_text}")
            retrieved_chunks.append({"text": km_text[:200]+"...", "source": "Knowledge Map", "score": 1.0})

        # Add Knowledge Base results
        for match in kb_results['matches']:
            metadata = match.get('metadata', {})
            text_content = metadata.get('text', '')
            source_name = metadata.get('source', 'Knowledge Base')

            context_text_list.append(f"[Source: {source_name}]\n{text_content}")
            retrieved_chunks.append({"text": text_content[:200]+"...", "source": source_name, "score": match['score']})

        full_context = "\n\n---\n\n".join(context_text_list)

        # --- GENERATE AI RESPONSE USING PASSED SYSTEM PROMPT ---
        prompt = f"""{system_prompt}

CONTEXT FROM KNOWLEDGE MAP + KNOWLEDGE BASE:
{full_context}

USER QUESTION:
{formatted_question}
"""
        response = client.models.generate_content(
            model=CHAT_MODEL_NAME,
            contents=prompt
        )

        elapsed = time.time() - start_time
        print(f"✅ Reply generated in {elapsed:.2f}s")

        return {"response": response.text, "sources": retrieved_chunks}

    except Exception as e:
        print(f"❌ Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# -----------------------
# List Documents Endpoint
# -----------------------
@app.get("/list-documents")
async def list_documents():
    try:
        results = index_kb.query(
            vector=[0.0] * 768,
            top_k=1000,
            include_metadata=True
        )
        sources = set()
        for match in results.get('matches', []):
            metadata = match.get('metadata', {})
            if 'source' in metadata:
                sources.add(metadata['source'])
        documents = [{"filename": src} for src in sorted(sources)]
        return {"success": True, "documents": documents, "total_chunks_sampled": len(results.get('matches', []))}
    except Exception as e:
        print(f"❌ Error listing documents: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# -----------------------
# List Knowledge Maps Endpoint
# ----------------------- 
@app.get("/list-knowledge-maps")
async def list_km():
    try:
        results = index_km.query(vector=[0.0]*768, top_k=1000, include_metadata=True)
        sources = set()
        for match in results.get('matches', []):
            metadata = match.get('metadata', {})
            if 'source' in metadata:
                sources.add(metadata['source'])
        km_docs = [{"filename": src} for src in sorted(sources)]
        return {"success": True, "knowledge_maps": km_docs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

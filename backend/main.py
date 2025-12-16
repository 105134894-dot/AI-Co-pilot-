from fileinput import filename
import os
import time
import io
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

if not all([GEMINI_API_KEY, PINECONE_API_KEY, PINECONE_INDEX_NAME]):
    raise ValueError("❌ Missing API keys in .env file. Please check GEMINI_API_KEY, PINECONE_API_KEY, and PINECONE_INDEX_NAME.")

# Configure Gemini with new API
client = genai.Client(api_key=GEMINI_API_KEY)

# Using specific model
CHAT_MODEL_NAME = 'gemini-2.5-flash'
EMBED_MODEL_NAME = 'text-embedding-004'

# Configure Pinecone
pc = Pinecone(api_key=PINECONE_API_KEY)

# Auto-create index if it doesn't exist
if PINECONE_INDEX_NAME not in pc.list_indexes().names():
    print(f"⚙️ Index '{PINECONE_INDEX_NAME}' not found. Creating it...")
    pc.create_index(
        name=PINECONE_INDEX_NAME,
        dimension=768, 
        metric="cosine",
        spec=ServerlessSpec(cloud="aws", region="us-east-1")
    )
    # Wait for index to be ready
    while not pc.describe_index(PINECONE_INDEX_NAME).status['ready']:
        time.sleep(1)

index = pc.Index(PINECONE_INDEX_NAME)

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
# 4. SYSTEM PROMPT
# ==========================================
SYSTEM_PROMPT = """You are an AI Co-Pilot for accessibility and inclusive design, 
specifically supporting Mekong Inclusive Ventures (MIV) practitioners, educators, and 
Entrepreneur Support Organizations (ESOs).

Your role is to:
- Guide users in discovering and using accessible digital tools
- Provide step-by-step guidance on implementing accessibility features
- Share relevant tool links and inclusive design tips
- Make accessibility concepts easy to understand for non-technical users

Always be conversational, practical, and focus on actionable advice based on the 
context provided.

If the context doesn't contain the answer, say you don't know based on the MIV knowledge base, 
but provide general best practices if applicable."""

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

@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest):
    start_time = time.time()
    
    # 1️⃣ Get user question
    question = req.query.strip()
    print(f"\n🔥 Received Question: {question}")

    # 2️⃣ Detect formatting instructions
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

    # 3️⃣ Handle greetings
    greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon']
    if question.lower() in greetings:
        return {
            "response": "Hello! 👋 I'm your AI Co-Pilot for accessibility. I can help you find tools, understand guidelines, or improve your content. What would you like to know?",
            "sources": []
        }

    try:
        # --- EMBEDDING with new API ---
        embedding_response = client.models.embed_content(
            model=EMBED_MODEL_NAME,
            contents=question
        )
        # Access the embedding from the response
        query_embedding = embedding_response.embeddings[0].values

        # --- SEARCH PINECONE ---
        search_results = index.query(
            vector=query_embedding,
            top_k=req.top_k,
            include_metadata=True
        )

        # Debug: show retrieved chunks
        print("Retrieved chunks:")
        for match in search_results['matches']:
            metadata = match.get('metadata', {})
            snippet = metadata.get('text', '')[:100]
            source_name = metadata.get('source', 'MIV Database')
            print("-", source_name, "|", snippet)

        # --- Build context ---
        retrieved_chunks = []
        context_text_list = []
        for match in search_results['matches']:
            metadata = match.get('metadata', {})
            text_content = metadata.get('text', '')
            source_name = metadata.get('source', 'MIV Database')

            retrieved_chunks.append({
                "text": text_content[:200] + "...",
                "source": source_name,
                "score": match['score']
            })
            context_text_list.append(f"[Source: {source_name}]\n{text_content}")

        full_context = "\n\n---\n\n".join(context_text_list)

        # --- GENERATE AI RESPONSE with new API ---
        prompt = f"""{SYSTEM_PROMPT}

CONTEXT FROM KNOWLEDGE BASE:
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

        return {
            "response": response.text,
            "sources": retrieved_chunks
        }

    except Exception as e:
        print(f"❌ Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ingest", response_model=IngestResponse)
async def ingest_endpoint(file: UploadFile = File(...)):
    """
    Upload and ingest a PDF or DOCX file into the vector database.
    Chunks the document, generates embeddings, and stores in Pinecone.
    """
    start_time = time.time()
    filename = file.filename
    
    print(f"\n📄 Ingesting file: {filename}")
    
    # Validate file type
    if not filename.lower().endswith(('.pdf', '.docx')):
        raise HTTPException(
            status_code=400, 
            detail="Invalid file type. Only PDF and DOCX files are supported."
        )
    
    # Remove existing vectors for this file (prevents zombie data)
    print(f"♻️ Removing existing vectors for {filename}")
    index.delete(filter={"source": filename})

    try:
        # Read file content into memory
        file_bytes = await file.read()

        # Extract paragraphs with headings
        if filename.lower().endswith('.pdf'):
            paragraphs = extract_pdf_paragraphs_with_headings(file_bytes)
        else:
            paragraphs = extract_docx_paragraphs_with_headings(file_bytes)

        # Merge paragraphs into chunks
        paragraph_chunks = merge_paragraphs_into_chunks(paragraphs)

        # Validate extraction
        if not paragraph_chunks:
            raise HTTPException(
                status_code=400,
                detail="No paragraph extracted from the document."
            )

        print(f"📝 Extracted {len(paragraph_chunks)} paragraph chunks from {filename}")

        vectors_to_upsert = []
        start_time = time.time()

        for i, chunk_info in enumerate(paragraph_chunks):
            chunk_text = chunk_info['text']
            heading = chunk_info['heading']
            para_idx = chunk_info['paragraph_index']

            # Generate embedding with new API
            embedding_response = client.models.embed_content(
                model=EMBED_MODEL_NAME,
                contents=chunk_text
            )
            # Access the embedding from the response
            vector = embedding_response.embeddings[0].values

            # Unique ID
            chunk_id = f"{filename}-para-{para_idx}"

            # Upsert with heading metadata
            vectors_to_upsert.append((
                chunk_id,
                vector,
                {
                    "text": chunk_text,
                    "source": filename,
                    "paragraph_index": para_idx,
                    "heading": heading
                }
            ))

            # Upsert in batches
            if len(vectors_to_upsert) >= BATCH_SIZE:
                index.upsert(vectors=vectors_to_upsert)
                print(f"✅ Uploaded batch of {len(vectors_to_upsert)} vectors")
                vectors_to_upsert = []
                time.sleep(0.5)

        # Upsert remaining vectors
        if vectors_to_upsert:
            index.upsert(vectors=vectors_to_upsert)
            print(f"✅ Uploaded final batch of {len(vectors_to_upsert)} vectors")

        elapsed = time.time() - start_time
        print(f"🎉 Ingestion complete in {elapsed:.2f}s - {len(paragraph_chunks)} chunks added")

        return IngestResponse(
            success=True,
            message=f"Successfully ingested {filename}",
            chunks_added=len(paragraph_chunks),
            filename=filename
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Ingestion error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred during ingestion: {str(e)}"
        )
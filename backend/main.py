import os
import time
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from pinecone import Pinecone, ServerlessSpec
import google.generativeai as genai
from fastapi.middleware.cors import CORSMiddleware

# ==========================================
# 1. SETUP & CONFIGURATION
# ==========================================
load_dotenv()

# Load API Keys with safety checks
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
# PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME") #commenting out for now, wil ADD BACK IN LATER

if not all([GEMINI_API_KEY, PINECONE_API_KEY, PINECONE_INDEX_NAME]):
    raise ValueError("❌ Missing API keys in .env file. Please check GEMINI_API_KEY, PINECONE_API_KEY, and PINECONE_INDEX_NAME.")

# Configure Gemini
genai.configure(api_key=GEMINI_API_KEY)
# Using specific model with limitations, no cost.
CHAT_MODEL_NAME = 'gemini-2.5-flash' 
EMBED_MODEL_NAME = 'models/text-embedding-004'

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

index = pc.Index(PINECONE_INDEX_NAME)

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

# ==========================================
# 3. SYSTEM PROMPT
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
# 4. FASTAPI APP & ROUTES
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
    
    # We use req.query because that's what we defined in the ChatRequest model
    question = req.query.strip()
    
    print(f"\n📥 Received Question: {question}")

    # --- A. HANDLE GREETINGS (Saves Money/Time) ---
    greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon']
    if question.lower() in greetings:
        return {
            "response": "Hello! 👋 I'm your AI Co-Pilot for accessibility. I can help you find tools, understand guidelines, or improve your content. What would you like to know?",
            "sources": []
        }

    try:
        # --- B. EMBEDDING ---
        embedding_resp = genai.embed_content(
            model=EMBED_MODEL_NAME,
            content=question,
            task_type="retrieval_query"
        )
        query_embedding = embedding_resp['embedding']

        # --- C. SEARCH PINECONE ---
        search_results = index.query(
            vector=query_embedding,
            top_k=req.top_k,
            include_metadata=True
        )

        # Process results into a clean list
        retrieved_chunks = []
        context_text_list = []
        
        for match in search_results['matches']:
            # Safety check for empty metadata
            metadata = match.get('metadata', {})
            text_content = metadata.get('text', '')
            source_name = metadata.get('source', 'MIV Database')
            
            # Add to sources list for frontend display
            retrieved_chunks.append({
                "text": text_content[:200] + "...", # Snippet
                "source": source_name,
                "score": match['score']
            })
            
            # Add to context for AI reasoning
            context_text_list.append(f"[Source: {source_name}]\n{text_content}")

        full_context = "\n\n---\n\n".join(context_text_list)

        # --- D. GENERATE ANSWER ---
        prompt = f"""{SYSTEM_PROMPT}

CONTEXT FROM KNOWLEDGE BASE:
{full_context}

USER QUESTION:
{question}

Please provide a helpful, practical answer based on the context above."""

        model = genai.GenerativeModel(CHAT_MODEL_NAME)
        ai_response = model.generate_content(prompt)
        
        elapsed = time.time() - start_time
        print(f"✅ Reply generated in {elapsed:.2f}s")

        # Returns 'response' which matches the miv-widget.js requirement
        return {
            "response": ai_response.text,
            "sources": retrieved_chunks
        }

    except Exception as e:
        print(f"❌ Error: {str(e)}")
        # This will send a 500 error to the frontend, triggering the "technical issue" message
        raise HTTPException(status_code=500, detail=str(e))
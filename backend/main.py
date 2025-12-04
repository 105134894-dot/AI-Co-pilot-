import os
from fastapi import FastAPI
from pydantic import BaseModel
from dotenv import load_dotenv
from pinecone import Pinecone, ServerlessSpec
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai

# --------------------------------------
# Load environment variables
# --------------------------------------
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME")

if not GEMINI_API_KEY:
    raise ValueError("❌ Missing GEMINI_API_KEY in .env")

if not PINECONE_API_KEY:
    raise ValueError("❌ Missing PINECONE_API_KEY in .env")

if not PINECONE_INDEX_NAME:
    raise ValueError("❌ Missing PINECONE_INDEX_NAME in .env")

# --------------------------------------
# Configure Gemini
# --------------------------------------
genai.configure(api_key=GEMINI_API_KEY)

embed_model = "models/text-embedding-004"
chat_model = "models/gemini-flash-latest"   # ✅ This model exists for your key

# --------------------------------------
# Configure Pinecone
# --------------------------------------
pc = Pinecone(api_key=PINECONE_API_KEY)

# Create the index if missing
if PINECONE_INDEX_NAME not in pc.list_indexes().names():
    pc.create_index(
        name=PINECONE_INDEX_NAME,
        dimension=768,
        metric="cosine",
        spec=ServerlessSpec(cloud="aws", region="us-east-1")
    )

index = pc.Index(PINECONE_INDEX_NAME)

# --------------------------------------
# FastAPI Setup
# --------------------------------------
app = FastAPI()

class ChatRequest(BaseModel):
    query: str
    top_k: int = 3

@app.get("/")
def home():
    return {"message": "AI Co-Pilot backend running with Gemini + Pinecone!"}

# --------------------------------------
# CHAT ENDPOINT
# --------------------------------------
@app.post("/chat")
def chat(req: ChatRequest):

    # 1. Embed the query text
    embedding = genai.embed_content(
        model=embed_model,
        content=req.query
    )["embedding"]

    # 2. Query Pinecone
    search_results = index.query(
        vector=embedding,
        top_k=req.top_k,
        include_metadata=True
    )

    # 3. Build context from results
    matches = search_results.get("matches", [])
    context = "\n\n".join([
        match.get("metadata", {}).get("text", "")
        for match in matches
    ])

    # 4. Gemini request
    prompt = f"""
    You are MIV's AI Co-Pilot. Use the context below to answer the question clearly and helpfully.

    CONTEXT:
    {context}

    USER QUESTION:
    {req.query}
    """

    model = genai.GenerativeModel(chat_model)
    response = model.generate_content(prompt)

    return {
        "query": req.query,
        "context_used": context,
        "response": response.text
    }
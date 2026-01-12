import os
import json
import time
from pinecone import Pinecone, ServerlessSpec
from google import genai
from dotenv import load_dotenv

# -----------------------------
# CONFIG
# -----------------------------
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
KM_INDEX_NAME = os.getenv("KNOWLEDGE_MAP_INDEX_NAME", "miv-knowledge-map-index")
EMBED_MODEL_NAME = "text-embedding-004"
EMBEDDING_DIMENSION = 768
BATCH_SIZE = 100
KM_FILE = "data/KnowledgeMapv2.json"

if not all([GEMINI_API_KEY, PINECONE_API_KEY]):
    raise ValueError("❌ Missing GEMINI_API_KEY or PINECONE_API_KEY in .env")

# -----------------------------
# CLIENTS
# -----------------------------
client = genai.Client(api_key=GEMINI_API_KEY)
pc = Pinecone(api_key=PINECONE_API_KEY)

# Ensure index exists
existing_indexes = pc.list_indexes().names()
if KM_INDEX_NAME not in existing_indexes:
    print(f"⚙️ Creating Knowledge Map index '{KM_INDEX_NAME}'")
    pc.create_index(
        KM_INDEX_NAME,
        dimension=EMBEDDING_DIMENSION,
        metric="cosine",
        spec=ServerlessSpec(cloud="aws", region="us-east-1")
    )

index_km = pc.Index(KM_INDEX_NAME)

# -----------------------------
# LOAD AND INGEST KM JSON
# -----------------------------
with open(KM_FILE, "r", encoding="utf-8") as f:
    km_data = json.load(f)

vectors_to_upsert = []
start_time = time.time()

for i, entry in enumerate(km_data):
    # Use text_to_embed ONLY for embedding
    text_for_embedding = entry.get("text_to_embed", "").strip()
    if not text_for_embedding:
        continue

    embedding_response = client.models.embed_content(
        model=EMBED_MODEL_NAME,
        contents=text_for_embedding
    )
    vector = embedding_response.embeddings[0].values

    # Pinecone vector ID (the ONLY ID)
    chunk_id = f"km-{i}"

    # Clean metadata — no duplicates
    metadata = {
        "source": "Knowledge Map",
        "user_intent": entry.get("user_intent", ""),
        "tool_name": entry.get("tool_name", ""),
        "url": entry.get("url") or entry.get("URL", ""),
        "text": entry.get("text_to_embed", "")
    }

    vectors_to_upsert.append((chunk_id, vector, metadata))


    # Batch upsert
    if len(vectors_to_upsert) >= BATCH_SIZE:
        index_km.upsert(vectors=vectors_to_upsert)
        vectors_to_upsert = []

# Upsert remaining vectors
if vectors_to_upsert:
    index_km.upsert(vectors=vectors_to_upsert)


elapsed = time.time() - start_time
print(f"✅ KM ingestion complete: {len(km_data)} entries in {elapsed:.2f}s")

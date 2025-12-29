import os
import json
import time
from pinecone import Pinecone, ServerlessSpec
from google import genai
from dotenv import load_dotenv


# 1. CONFIGURATION AND ENVIRONMENT VARIABLES

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
KM_INDEX_NAME = os.getenv("KNOWLEDGE_MAP_INDEX_NAME", "miv-knowledge-map-index")

EMBEDDING_MODEL = "text-embedding-004"
EMBEDDING_DIMENSION = 768
BATCH_SIZE = 100
KM_FILE = "data/KnowledgeMapv2.json"

if not all([GEMINI_API_KEY, PINECONE_API_KEY]):
    raise ValueError("❌ Missing GEMINI_API_KEY or PINECONE_API_KEY in .env")


# 2. INIT CLIENTS

client = genai.Client(api_key=GEMINI_API_KEY)
pc = Pinecone(api_key=PINECONE_API_KEY)


# 3. CREATE INDEX IF DOES NOT EXISTS
#
existing_indexes = pc.list_indexes().names()
if KM_INDEX_NAME not in existing_indexes:
    print(f"⚙️ Creating Knowledge Map index '{KM_INDEX_NAME}'")
    pc.create_index(
        KM_INDEX_NAME,  
        dimension=EMBEDDING_DIMENSION,
        metric="cosine",
        spec=ServerlessSpec(cloud="aws", region="us-east-1")
    )
else:
    print(f"✅ Knowledge Map index '{KM_INDEX_NAME}' already exists")

index_km = pc.Index(KM_INDEX_NAME)


# 4. LOAD KNOWLEDGE MAP DATA

with open(KM_FILE, "r", encoding="utf-8") as f:
    km_data = json.load(f)


# 5. INGEST INTO PINECONE

vectors_to_upsert = []
start_time = time.time()

for i, entry in enumerate(km_data):
    heading = entry.get("user_intent", f"intent-{i}")
    text = entry.get("text_to_embed", "").strip()
    if not text:
        continue

    # Generate embedding
    embedding_response = client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=text
    )
    vector = embedding_response.embeddings[0].values
    chunk_id = f"km-{i}"

    vectors_to_upsert.append((chunk_id, vector, {"text": text, "source": "Knowledge Map", "heading": heading}))

    if len(vectors_to_upsert) >= BATCH_SIZE:
        index_km.upsert(vectors=vectors_to_upsert)
        vectors_to_upsert = []

# Upsert remaining vectors
if vectors_to_upsert:
    index_km.upsert(vectors=vectors_to_upsert)

elapsed = time.time() - start_time
print(f"✅ KM ingestion complete: {len(km_data)} entries in {elapsed:.2f}s")

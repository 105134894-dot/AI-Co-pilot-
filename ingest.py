import os
import time
import glob
import json
from dotenv import load_dotenv
from pinecone import Pinecone, ServerlessSpec
import google.generativeai as genai
from pypdf import PdfReader
from docx import Document

# -----------------------------
# 0. Configuration
# -----------------------------
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_ENVIRONMENT = os.getenv("PINECONE_ENVIRONMENT")
INDEX_NAME = os.getenv("PINECONE_INDEX_NAME")

PDF_DIRECTORY = "data"
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200
EMBEDDING_MODEL = "text-embedding-004"
EMBEDDING_DIMENSION = 768
BATCH_SIZE = 100

if not all([GEMINI_API_KEY, PINECONE_API_KEY, PINECONE_ENVIRONMENT, INDEX_NAME]):
    print("❌ Missing API keys in .env")
    exit()

# -----------------------------
# 1. Helper functions
# -----------------------------
def extract_text_from_pdf(file_path: str) -> str:
    try:
        reader = PdfReader(file_path)
        return "".join([page.extract_text() or "" for page in reader.pages])
    except Exception as e:
        print(f"Error reading PDF {file_path}: {e}")
        return ""

def extract_text_from_docx(file_path: str) -> str:
    try:
        doc = Document(file_path)
        return "\n".join([p.text for p in doc.paragraphs])
    except Exception as e:
        print(f"Error reading DOCX {file_path}: {e}")
        return ""

def split_text(text: str) -> list[str]:
    chunks = []
    i = 0
    while i < len(text):
        end = min(len(text), i + CHUNK_SIZE)
        chunks.append(text[i:end])
        i += CHUNK_SIZE - CHUNK_OVERLAP
    return chunks

# -----------------------------
# 2. Load ingested files log
# -----------------------------
log_file = "ingested_files.json"
if os.path.exists(log_file):
    with open(log_file, "r") as f:
        ingested_files = json.load(f)
else:
    ingested_files = []

# -----------------------------
# 3. Initialize Pinecone & Gemini
# -----------------------------
genai.configure(api_key=GEMINI_API_KEY)
pc = Pinecone(api_key=PINECONE_API_KEY, environment=PINECONE_ENVIRONMENT)

# Auto-create index if missing
if INDEX_NAME not in pc.list_indexes().names():
    print(f"Creating index '{INDEX_NAME}'...")
    pc.create_index(
        name=INDEX_NAME,
        dimension=EMBEDDING_DIMENSION,
        metric="cosine",
        spec=ServerlessSpec(cloud="aws", region=PINECONE_ENVIRONMENT)
    )
    while not pc.describe_index(INDEX_NAME).status['ready']:
        time.sleep(1)
    print("Index ready.")

index = pc.Index(INDEX_NAME)

# -----------------------------
# 4. Process new files
# -----------------------------
files = glob.glob(os.path.join(PDF_DIRECTORY, "*.pdf")) + \
        glob.glob(os.path.join(PDF_DIRECTORY, "*.docx"))

files_to_process = [f for f in files if os.path.basename(f) not in ingested_files]

if not files_to_process:
    print("No new files to ingest. ✅")
    exit()

all_chunks = []

for file_path in files_to_process:
    filename = os.path.basename(file_path)
    print(f"Processing: {filename}")

    raw_text = extract_text_from_pdf(file_path) if filename.lower().endswith(".pdf") else extract_text_from_docx(file_path)
    if not raw_text.strip():
        print(f"No text found in {filename}, skipping.")
        continue

    chunks = split_text(raw_text)
    for i, chunk in enumerate(chunks):
        all_chunks.append({
            "id": f"{filename}-{i}",  # Unique per file
            "text": chunk,
            "filename": filename
        })

print(f"Total chunks to upload: {len(all_chunks)}")

# -----------------------------
# 5. Generate embeddings and upsert
# -----------------------------
vectors_to_upsert = []

for i, chunk in enumerate(all_chunks, 1):
    embedding_resp = genai.embed_content(
        model=EMBEDDING_MODEL,
        content=chunk["text"],
        task_type="RETRIEVAL_DOCUMENT"
    )
    vector = embedding_resp['embedding']

    vectors_to_upsert.append((
        chunk["id"],
        vector,
        {"text": chunk["text"], "source": chunk["filename"]}
    ))

    # Upsert in batches
    if len(vectors_to_upsert) >= BATCH_SIZE:
        index.upsert(vectors=vectors_to_upsert)
        vectors_to_upsert = []
        time.sleep(0.5)

# Upsert remaining vectors
if vectors_to_upsert:
    index.upsert(vectors=vectors_to_upsert)

# -----------------------------
# 6. Update ingested log
# -----------------------------
for f in files_to_process:
    ingested_files.append(os.path.basename(f))

with open(log_file, "w") as f:
    json.dump(ingested_files, f)

print("✅ Ingestion complete. All new PDFs/DOCX added safely.")

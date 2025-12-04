
## 📦 Tech Stack
- Python 3.12
- FastAPI
- Uvicorn
- google-generativeai
- Pinecone
- python-dotenv

## ▶️ Running the backend

1. Go to the backend folder:

   ```bash
   cd backend
Activate the virtual environment:

bash
Copy code
source .venv/bin/activate
Run the server:

bash
Copy code
uvicorn main:app --reload
Your API will run at:

arduino
Copy code
http://localhost:8000
🧪 Test with curl
bash
Copy code
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"query":"Hello?", "top_k": 3}'


🔒 Environment Variables

Create a .env file in /backend:

GEMINI_API_KEY=your_key_here
PINECONE_API_KEY=your_key_here
PINECONE_INDEX_NAME=miv-copilot-index

📁 Project Structure
MIV-co-pilot/
  backend/
    main.py
    .env
    .venv/
    requirements.txt
  README.md
  .gitignore

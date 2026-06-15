# 📚 SyllabiQ – AI-Powered Syllabus-Aligned Learning Platform

SyllabiQ is an intelligent academic assistant that leverages **Retrieval-Augmented Generation (RAG)** to provide syllabus-specific, context-aware answers from institution-approved study materials. It enables teachers to upload academic resources and allows students to interact with them through a conversational AI interface while ensuring responses remain grounded in the uploaded content.

# 🚀 Running SyllabiQ Locally

## 1. Clone the Repository

```bash
git clone <repository-url>
cd pypy
```

---

## 2. Create and Activate a Virtual Environment (Backend)

### Windows

```powershell
python -m venv .venv
.\.venv\Scripts\activate
```

### Linux/macOS

```bash
python3 -m venv .venv
source .venv/bin/activate
```

---

## 3. Install Backend Dependencies

```bash
pip install -r requirements.txt
```

or if using `uv`:

```bash
uv sync
```

---

## 4. Configure Environment Variables

Create a `.env` file (or configure your existing environment) with values such as:

```env
GOOGLE_API_KEY=your_google_api_key
DATABASE_URL=your_database_url
```

> Never commit API keys or secrets to Git.

---

## 5. Start PostgreSQL (Docker)

From the project root:

```bash
docker compose up -d
```

Verify that the database is running:

```bash
docker ps
```

---

## 6. Start the FastAPI Backend

From the project root:

```bash
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The backend will be available at:

```
http://localhost:8000
```

---

## 7. Start the Frontend

Open a **new terminal**:

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at:

```
http://localhost:3000
```

---

## 8. Open the Application

Visit:

```
http://localhost:3000
```

Log in using the appropriate Admin, Teacher, or Student credentials.

# Notes

* The vector database stores semantic embeddings for efficient retrieval.
* Uploaded PDFs are processed in the background before becoming searchable.
* OCR is automatically used for scanned pages when required.
* Ensure Docker, PostgreSQL, and the FastAPI backend are running before using the frontend.

## ✨ Features

### 👨‍🎓 Student Portal

* AI-powered chat based on uploaded academic documents
* Subject-wise access according to branch and semester
* Persistent chat history
* Source-grounded responses from approved materials
* Clean and intuitive dashboard

### 👨‍🏫 Teacher Portal

* Upload PDFs, notes, and presentations
* Automatic document ingestion and indexing
* Subject-specific content management
* Track uploaded resources

### 👨‍💼 Admin Portal

* Manage branches, semesters, teachers, students, and subjects
* Assign teachers to subjects
* Review uploaded documents
* Monitor document processing status

## 🧠 RAG Pipeline

The platform processes uploaded documents through a semantic retrieval pipeline:

1. PDF upload
2. Text extraction and OCR fallback (when required)
3. Semantic chunking
4. Embedding generation using local embedding models
5. Storage in a vector database
6. Hybrid retrieval during chat
7. LLM-generated answers grounded in retrieved context

## 🏗️ Tech Stack

* **Frontend:** Next.js, React, TypeScript
* **Backend:** FastAPI (Python)
* **Database:** PostgreSQL + pgvector
* **ORM:** Prisma
* **Embeddings:** Sentence Transformers (all-MiniLM-L6-v2)
* **Authentication:** Role-based authentication and authorization
* **Document Processing:** PDF parsing and OCR pipeline

## 🔒 Role-Based Access Control

* **Students:** Access only their assigned branch and semester subjects.
* **Teachers:** Manage uploads for assigned subjects.
* **Admins:** Full control over users, branches, subjects, and documents.

## 📂 Core Modules

* User Authentication
* Branch & Semester Management
* Subject Management
* Teacher Assignment
* Document Upload & Processing
* AI Chat Interface
* Vector Search & Retrieval
* Document Status Tracking

## 🚀 Getting Started

1. Clone the repository.
2. Configure environment variables.
3. Start PostgreSQL with pgvector enabled.
4. Install frontend and backend dependencies.
5. Launch the FastAPI backend and Next.js frontend.
6. Log in as an Admin to create branches, subjects, and users.
7. Upload study materials and begin interacting with the AI assistant.

## 📈 Future Enhancements

* Image and diagram-aware retrieval
* Figure and table extraction
* Multimodal RAG support
* Enhanced OCR for scanned documents
* Quiz and flashcard generation
* Learning analytics and progress tracking

## 📄 License

This project is intended for educational and research purposes. Modify and extend it according to your institutional or organizational requirements.



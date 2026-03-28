from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import upload, sessions, answers

app = FastAPI(
    title="fake-it-till-you-make-it",
    description="AI-powered interview coach",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router)
app.include_router(sessions.router)
app.include_router(answers.router)


@app.get("/")
def root():
    return {"message": "fake-it-till-you-make-it is live 🎭"}


@app.get("/health")
def health():
    return {"status": "healthy"}

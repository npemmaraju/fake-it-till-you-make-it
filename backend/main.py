from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def root():
    return {"message": "fake-it-till-you-make-it is live 🎭"}

@app.get("/health")
def health():
    return {"status": "healthy"}

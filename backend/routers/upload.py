from fastapi import APIRouter, UploadFile, File, HTTPException
from services import gcs_service, firestore_service, text_extraction
from models.schemas import ResumeUploadResponse

router = APIRouter(prefix="/upload", tags=["upload"])

ALLOWED_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "text/plain",
}
MAX_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post("/resume", response_model=ResumeUploadResponse)
async def upload_resume(file: UploadFile = File(...)):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{file.content_type}'. Upload a PDF, DOCX, or TXT file.",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File too large. Max size is 10 MB.")

    # Extract text
    extracted_text = text_extraction.extract_text(file_bytes, file.filename or "resume")
    if not extracted_text:
        raise HTTPException(status_code=422, detail="Could not extract text from file.")

    # Upload to GCS
    resume_id, gcs_uri = gcs_service.upload_resume(
        file_bytes, file.filename or "resume", file.content_type
    )

    # Save metadata + text to Firestore
    firestore_service.save_resume(resume_id, file.filename or "resume", gcs_uri, extracted_text)

    return ResumeUploadResponse(
        resume_id=resume_id,
        filename=file.filename or "resume",
        gcs_uri=gcs_uri,
        extracted_text_preview=extracted_text[:300],
    )

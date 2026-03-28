import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from models.schemas import (
    SessionCreateRequest, SessionCreateResponse,
    SessionDetail, Question,
)
from services import firestore_service, gemini_service

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=SessionCreateResponse)
def create_session(req: SessionCreateRequest):
    # Fetch resume
    resume = firestore_service.get_resume(req.resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail=f"Resume '{req.resume_id}' not found.")

    resume_text = resume.get("extracted_text", "")

    # Generate questions via Gemini
    raw_questions = gemini_service.generate_questions(
        resume_text=resume_text,
        job_title=req.job_title,
        job_description=req.job_description,
        company_name=req.company_name,
        interview_type=req.interview_type.value,
        difficulty=req.difficulty.value,
        num_questions=req.num_questions,
    )

    questions = [Question(**q) for q in raw_questions]

    session_id = str(uuid.uuid4())
    session_data = {
        "session_id": session_id,
        "resume_id": req.resume_id,
        "job_title": req.job_title,
        "company_name": req.company_name,
        "interview_type": req.interview_type.value,
        "difficulty": req.difficulty.value,
        "status": "active",
        "questions": [q.model_dump() for q in questions],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    firestore_service.save_session(session_id, session_data)

    return SessionCreateResponse(
        session_id=session_id,
        job_title=req.job_title,
        company_name=req.company_name,
        interview_type=req.interview_type.value,
        difficulty=req.difficulty.value,
        questions=questions,
    )


@router.get("/{session_id}", response_model=SessionDetail)
def get_session(session_id: str):
    session = firestore_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")
    return SessionDetail(**session)

from fastapi import APIRouter, HTTPException
from models.schemas import AnswerSubmitRequest, AnswerFeedback, SessionReport
from services import firestore_service, gemini_service

router = APIRouter(prefix="/sessions", tags=["answers"])


@router.post("/{session_id}/answers", response_model=AnswerFeedback)
def submit_answer(session_id: str, req: AnswerSubmitRequest):
    session = firestore_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    # Find the question
    questions = session.get("questions", [])
    question = next((q for q in questions if q["question_id"] == req.question_id), None)
    if not question:
        raise HTTPException(status_code=404, detail=f"Question '{req.question_id}' not found in session.")

    # Fetch resume text
    resume = firestore_service.get_resume(session["resume_id"])
    resume_text = resume.get("extracted_text", "") if resume else ""

    # Evaluate with Gemini
    evaluation = gemini_service.evaluate_answer(
        resume_text=resume_text,
        job_title=session["job_title"],
        question_text=question["text"],
        question_category=question.get("category", "general"),
        answer_text=req.answer_text,
        difficulty=session.get("difficulty", "medium"),
    )

    feedback = AnswerFeedback(
        question_id=req.question_id,
        question_text=question["text"],
        answer_text=req.answer_text,
        score=evaluation.get("score", 5),
        strengths=evaluation.get("strengths", []),
        improvements=evaluation.get("improvements", []),
        ideal_answer_hint=evaluation.get("ideal_answer_hint", ""),
        follow_up_question=evaluation.get("follow_up_question"),
    )

    # Persist the answer + feedback
    firestore_service.save_answer(session_id, req.question_id, feedback.model_dump())

    return feedback


@router.get("/{session_id}/report", response_model=SessionReport)
def get_report(session_id: str):
    session = firestore_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    answers_raw = firestore_service.get_answers(session_id)
    if not answers_raw:
        raise HTTPException(status_code=422, detail="No answers submitted yet for this session.")

    answers = [AnswerFeedback(**a) for a in answers_raw]
    overall_score = sum(a.score for a in answers) / len(answers)

    summary_data = gemini_service.generate_report_summary(
        job_title=session["job_title"],
        company_name=session.get("company_name"),
        answers=[a.model_dump() for a in answers],
        overall_score=overall_score,
    )

    # Mark session completed
    firestore_service.update_session(session_id, {"status": "completed"})

    return SessionReport(
        session_id=session_id,
        job_title=session["job_title"],
        company_name=session.get("company_name"),
        overall_score=round(overall_score, 1),
        answers=answers,
        summary=summary_data.get("summary", ""),
        top_strengths=summary_data.get("top_strengths", []),
        top_improvements=summary_data.get("top_improvements", []),
        hire_likelihood=summary_data.get("hire_likelihood", "Maybe"),
    )

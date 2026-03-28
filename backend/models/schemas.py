from pydantic import BaseModel
from typing import Optional, List
from enum import Enum


class InterviewType(str, Enum):
    behavioral = "behavioral"
    technical = "technical"
    mixed = "mixed"


class DifficultyLevel(str, Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"


# ── Resume ──────────────────────────────────────────────────────────────────

class ResumeUploadResponse(BaseModel):
    resume_id: str
    filename: str
    gcs_uri: str
    extracted_text_preview: str  # first 300 chars


# ── Session ──────────────────────────────────────────────────────────────────

class SessionCreateRequest(BaseModel):
    resume_id: str
    job_title: str
    job_description: Optional[str] = None
    company_name: Optional[str] = None
    interview_type: InterviewType = InterviewType.mixed
    difficulty: DifficultyLevel = DifficultyLevel.medium
    num_questions: int = 5


class Question(BaseModel):
    question_id: str
    text: str
    category: str  # e.g. "behavioral", "technical", "situational"
    follow_up_hint: Optional[str] = None


class SessionCreateResponse(BaseModel):
    session_id: str
    job_title: str
    company_name: Optional[str]
    interview_type: str
    difficulty: str
    questions: List[Question]


class SessionDetail(BaseModel):
    session_id: str
    resume_id: str
    job_title: str
    company_name: Optional[str]
    interview_type: str
    difficulty: str
    status: str  # "active", "completed"
    questions: List[Question]
    created_at: str


# ── Answers ──────────────────────────────────────────────────────────────────

class AnswerSubmitRequest(BaseModel):
    question_id: str
    answer_text: str


class AnswerFeedback(BaseModel):
    question_id: str
    question_text: str
    answer_text: str
    score: int  # 1-10
    strengths: List[str]
    improvements: List[str]
    ideal_answer_hint: str
    follow_up_question: Optional[str] = None


# ── Report ───────────────────────────────────────────────────────────────────

class SessionReport(BaseModel):
    session_id: str
    job_title: str
    company_name: Optional[str]
    overall_score: float  # average of all answer scores
    answers: List[AnswerFeedback]
    summary: str          # overall performance summary
    top_strengths: List[str]
    top_improvements: List[str]
    hire_likelihood: str  # "Strong Yes", "Yes", "Maybe", "No"

import os
from datetime import datetime, timezone
from typing import Optional
from google.cloud import firestore

_db: firestore.Client | None = None


def _get_db() -> firestore.Client:
    global _db
    if _db is None:
        project = os.getenv("GOOGLE_CLOUD_PROJECT")
        database = os.getenv("FIRESTORE_DATABASE", "(default)")
        _db = firestore.Client(project=project, database=database)
    return _db


# ── Resumes ──────────────────────────────────────────────────────────────────

def save_resume(resume_id: str, filename: str, gcs_uri: str, extracted_text: str) -> None:
    db = _get_db()
    db.collection("resumes").document(resume_id).set({
        "resume_id": resume_id,
        "filename": filename,
        "gcs_uri": gcs_uri,
        "extracted_text": extracted_text,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


def get_resume(resume_id: str) -> Optional[dict]:
    db = _get_db()
    doc = db.collection("resumes").document(resume_id).get()
    return doc.to_dict() if doc.exists else None


# ── Sessions ──────────────────────────────────────────────────────────────────

def save_session(session_id: str, data: dict) -> None:
    db = _get_db()
    db.collection("sessions").document(session_id).set(data)


def get_session(session_id: str) -> Optional[dict]:
    db = _get_db()
    doc = db.collection("sessions").document(session_id).get()
    return doc.to_dict() if doc.exists else None


def update_session(session_id: str, updates: dict) -> None:
    db = _get_db()
    db.collection("sessions").document(session_id).update(updates)


# ── Answers ───────────────────────────────────────────────────────────────────

def save_answer(session_id: str, question_id: str, answer_data: dict) -> None:
    db = _get_db()
    db.collection("sessions").document(session_id)\
      .collection("answers").document(question_id).set(answer_data)


def get_answers(session_id: str) -> list[dict]:
    db = _get_db()
    docs = db.collection("sessions").document(session_id)\
             .collection("answers").stream()
    return [doc.to_dict() for doc in docs]

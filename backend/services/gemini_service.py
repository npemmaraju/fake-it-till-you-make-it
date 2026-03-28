import os
import json
import uuid
import re
from typing import Optional
from google import genai
from google.genai import types

_client: genai.Client | None = None
MODEL = "gemini-1.5-pro"


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    return _client


def _parse_json(text: str) -> dict | list:
    """Strip markdown fences and parse JSON."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


def _generate(prompt: str) -> str:
    client = _get_client()
    response = client.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.7,
            max_output_tokens=2048,
        ),
    )
    return response.text


def generate_questions(
    resume_text: str,
    job_title: str,
    job_description: Optional[str],
    company_name: Optional[str],
    interview_type: str,
    difficulty: str,
    num_questions: int,
) -> list[dict]:
    """Returns list of {question_id, text, category, follow_up_hint}."""
    context_parts = [f"Job Title: {job_title}"]
    if company_name:
        context_parts.append(f"Company: {company_name}")
    if job_description:
        context_parts.append(f"Job Description:\n{job_description}")

    prompt = f"""You are an expert technical recruiter and interview coach.

Candidate Resume:
{resume_text[:3000]}

{chr(10).join(context_parts)}

Interview Type: {interview_type}
Difficulty: {difficulty}

Generate exactly {num_questions} interview questions tailored to this candidate and role.
Return ONLY a JSON array with this exact structure (no other text):
[
  {{
    "text": "question text",
    "category": "behavioral|technical|situational",
    "follow_up_hint": "a short hint about what a great answer covers"
  }}
]

Make questions specific to the candidate's background and the role. Mix question types based on interview_type."""

    raw = _parse_json(_generate(prompt))

    questions = []
    for q in raw:
        questions.append({
            "question_id": str(uuid.uuid4()),
            "text": q["text"],
            "category": q.get("category", "general"),
            "follow_up_hint": q.get("follow_up_hint", ""),
        })
    return questions


def evaluate_answer(
    resume_text: str,
    job_title: str,
    question_text: str,
    question_category: str,
    answer_text: str,
    difficulty: str,
) -> dict:
    """Returns {score, strengths, improvements, ideal_answer_hint, follow_up_question}."""
    prompt = f"""You are a strict but fair interview coach evaluating a candidate's answer.

Job Title: {job_title}
Candidate Resume (excerpt):
{resume_text[:1500]}

Question ({question_category}, difficulty: {difficulty}):
{question_text}

Candidate's Answer:
{answer_text}

Evaluate this answer and return ONLY a JSON object (no other text):
{{
  "score": <integer 1-10>,
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"],
  "ideal_answer_hint": "what an ideal answer would include",
  "follow_up_question": "a follow-up question to probe deeper (or null)"
}}

Scoring guide: 1-3=poor, 4-5=below average, 6-7=average, 8-9=good, 10=exceptional."""

    return _parse_json(_generate(prompt))


def generate_report_summary(
    job_title: str,
    company_name: Optional[str],
    answers: list[dict],
    overall_score: float,
) -> dict:
    """Returns {summary, top_strengths, top_improvements, hire_likelihood}."""
    qa_summary = "\n\n".join([
        f"Q: {a['question_text']}\nScore: {a['score']}/10\nStrengths: {', '.join(a['strengths'])}\nImprovements: {', '.join(a['improvements'])}"
        for a in answers
    ])

    target = f"{job_title}" + (f" at {company_name}" if company_name else "")

    prompt = f"""You are a senior hiring manager reviewing a mock interview for: {target}

Overall Score: {overall_score:.1f}/10

Interview Summary:
{qa_summary}

Return ONLY a JSON object (no other text):
{{
  "summary": "2-3 sentence overall performance assessment",
  "top_strengths": ["strength 1", "strength 2", "strength 3"],
  "top_improvements": ["improvement 1", "improvement 2", "improvement 3"],
  "hire_likelihood": "Strong Yes|Yes|Maybe|No"
}}"""

    return _parse_json(_generate(prompt))

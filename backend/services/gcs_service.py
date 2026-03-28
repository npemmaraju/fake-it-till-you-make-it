import os
import uuid
from google.cloud import storage

BUCKET_NAME = os.getenv("GCS_BUCKET", "interview-coach-uploads-legaxdcr3xftc")

_client: storage.Client | None = None


def _get_client() -> storage.Client:
    global _client
    if _client is None:
        _client = storage.Client()
    return _client


def upload_resume(file_bytes: bytes, filename: str, content_type: str) -> tuple[str, str]:
    """Upload file to GCS. Returns (resume_id, gcs_uri)."""
    resume_id = str(uuid.uuid4())
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    blob_name = f"resumes/{resume_id}.{ext}"

    client = _get_client()
    bucket = client.bucket(BUCKET_NAME)
    blob = bucket.blob(blob_name)
    blob.upload_from_string(file_bytes, content_type=content_type)

    gcs_uri = f"gs://{BUCKET_NAME}/{blob_name}"
    return resume_id, gcs_uri


def download_resume(gcs_uri: str) -> bytes:
    """Download file bytes from GCS URI."""
    # gs://bucket/path
    path = gcs_uri.replace(f"gs://{BUCKET_NAME}/", "")
    client = _get_client()
    bucket = client.bucket(BUCKET_NAME)
    blob = bucket.blob(path)
    return blob.download_as_bytes()

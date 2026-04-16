from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from api.main import app

    return TestClient(app)


@pytest.mark.asyncio
async def test_status_endpoint_returns_pipeline_stage(client):
    paper = SimpleNamespace(
        id="academic_paper:1",
        get_processing_progress=AsyncMock(
            return_value={
                "pipeline_stage": "embedding",
                "job_status": "running",
                "stage_updated_at": None,
                "error_message": None,
            }
        ),
    )

    with patch("papermind.api.ingest_routes.AcademicPaper.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = paper

        response = client.get("/api/papermind/papers/academic_paper:1/status")

    assert response.status_code == 200
    body = response.json()
    assert body["paper_id"] == "academic_paper:1"
    assert body["pipeline_stage"] == "embedding"
    assert body["job_status"] == "running"


@pytest.mark.asyncio
async def test_status_endpoint_404_for_missing_paper(client):
    with patch("papermind.api.ingest_routes.AcademicPaper.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = None

        response = client.get("/api/papermind/papers/academic_paper:missing/status")

    assert response.status_code == 404
    assert response.json()["detail"] == "Paper not found"


@pytest.mark.asyncio
async def test_retry_endpoint_requires_existing_file(client):
    paper = SimpleNamespace(id="academic_paper:1", source_id="source:1")

    with (
        patch("papermind.api.ingest_routes.AcademicPaper.get", new_callable=AsyncMock) as mock_get,
        patch("papermind.api.ingest_routes.repo_query", new_callable=AsyncMock) as mock_repo_query,
    ):
        mock_get.return_value = paper
        mock_repo_query.return_value = [{"asset": {"file_path": "/tmp/does-not-exist.pdf"}}]

        response = client.post("/api/papermind/papers/academic_paper:1/retry")

    assert response.status_code == 400
    assert "existing source file path" in response.json()["detail"]

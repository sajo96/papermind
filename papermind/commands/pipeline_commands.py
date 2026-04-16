from datetime import datetime, timezone
from typing import Any, Dict, Optional

from loguru import logger
from surreal_commands import submit_command

from open_notebook.database.repository import ensure_record_id, repo_query
from papermind.models import AcademicPaper
from papermind.utils import _rows_from_query_result

STAGES = ["ingesting", "parsing", "embedding", "notes", "graph"]


async def _get_paper(paper_id: Optional[str], source_id: Optional[str]) -> Optional[AcademicPaper]:
    if paper_id:
        return await AcademicPaper.get(paper_id)

    if not source_id:
        return None

    rows = await repo_query(
        "SELECT * FROM academic_paper WHERE source_id = $source_id LIMIT 1",
        {"source_id": ensure_record_id(source_id)},
    )
    normalized_rows = _rows_from_query_result(rows)
    if normalized_rows and isinstance(normalized_rows[0], dict):
        return AcademicPaper(**normalized_rows[0])
    return None


def _validate_stage(stage: str) -> None:
    if stage not in STAGES:
        raise ValueError(f"Invalid pipeline stage '{stage}'. Allowed: {STAGES}")


async def _submit_stage_job(stage: str, job_payload: Dict[str, Any]) -> Optional[str]:
    try:
        # Import registers the surreal command in-process before submit.
        import commands.papermind_pipeline_commands  # noqa: F401

        command_id = submit_command(
            "papermind",
            "track_pipeline_stage",
            {
                "stage": stage,
                "paper_id": job_payload.get("paper_id"),
                "source_id": job_payload.get("source_id"),
                "payload": job_payload,
            },
        )
        return str(command_id) if command_id else None
    except Exception as e:
        logger.warning(f"Unable to submit stage command for stage={stage}: {e}")
        return None


async def advance_stage(
    paper_id: Optional[str],
    stage: str,
    job_payload: Dict[str, Any],
    source_id: Optional[str] = None,
) -> Optional[str]:
    """Dispatch a stage tracking command and persist stage metadata."""
    _validate_stage(stage)

    command_id = await _submit_stage_job(stage, job_payload)
    paper = await _get_paper(paper_id=paper_id, source_id=source_id)
    if not paper:
        logger.warning(
            f"Skipping stage update because paper was not found: stage={stage}, "
            f"paper_id={paper_id}, source_id={source_id}"
        )
        return command_id

    paper.command = ensure_record_id(command_id) if command_id else None
    paper.pipeline_stage = stage
    paper.stage_updated_at = datetime.now(timezone.utc)
    paper.error_message = None
    await paper.save()

    logger.info(f"[{paper.id}] stage={stage} command={command_id}")
    return command_id


async def mark_failed(
    paper_id: Optional[str],
    stage: str,
    error: str,
    source_id: Optional[str] = None,
) -> None:
    paper = await _get_paper(paper_id=paper_id, source_id=source_id)
    if not paper:
        logger.error(
            f"Cannot mark failed stage for missing paper: stage={stage}, "
            f"paper_id={paper_id}, source_id={source_id}, error={error}"
        )
        return

    paper.pipeline_stage = "failed"
    paper.error_message = error[:2000]
    paper.stage_updated_at = datetime.now(timezone.utc)
    await paper.save()
    logger.error(f"[{paper.id}] FAILED at stage={stage}: {error}")


async def mark_done(paper_id: Optional[str], source_id: Optional[str] = None) -> None:
    paper = await _get_paper(paper_id=paper_id, source_id=source_id)
    if not paper:
        logger.warning(f"Cannot mark done for missing paper: paper_id={paper_id}, source_id={source_id}")
        return

    paper.pipeline_stage = "done"
    paper.command = None
    paper.error_message = None
    paper.stage_updated_at = datetime.now(timezone.utc)
    await paper.save()
    logger.info(f"[{paper.id}] pipeline marked done")

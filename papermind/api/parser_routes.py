import os
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from loguru import logger
import httpx
from pathlib import Path

from papermind.models import AcademicPaper
from papermind.parsers.academic_pdf_parser import AcademicPDFParser

router = APIRouter(prefix="/papermind/parse_academic", tags=["papermind-parser"])

# Use port 5055 by default since this might run in the background worker or fastapi app
API_BASE = os.environ.get("PAPERMIND_API_BASE", "http://localhost:5055")

class ParseRequest(BaseModel):
    source_id: str

class ParseResponse(BaseModel):
    academic_paper_id: str
    title: str
    authors: list[str]
    section_count: int
    doi: str | None

@router.post("", response_model=ParseResponse)
async def parse_academic_paper(req: ParseRequest, background_tasks: BackgroundTasks):
    try:
        # Load the source file path from DB by calling existing API
        async with httpx.AsyncClient(timeout=10.0) as client:
            source_res = await client.get(f"{API_BASE}/api/sources/{req.source_id}")
            if source_res.status_code >= 400:
                raise HTTPException(status_code=404, detail="Source not found")
            source_data = source_res.json()
            
        file_path = source_data.get("file_path")
        if not file_path or not Path(file_path).exists():
             raise HTTPException(status_code=400, detail="Source file path is invalid or missing.")

        # 2. Run AcademicPDFParser on it
        parser = AcademicPDFParser(file_path=file_path)
        # Parse synchronously right now
        import asyncio
        loop = asyncio.get_event_loop()
        parsed_paper = await loop.run_in_executor(None, parser.parse)

        # 3. Save ParsedPaper data to academic_paper table
        paper = AcademicPaper(
             source_id=req.source_id,
             title=parsed_paper.title,
             authors=parsed_paper.authors,
             abstract=parsed_paper.abstract,
             doi=parsed_paper.doi,
             year=parsed_paper.year,
             keywords=parsed_paper.keywords,
             sections=parsed_paper.sections,
             raw_references=parsed_paper.raw_references,
        )
        await paper.save()

        # 4. Trigger atom chunking
        async def trigger_atomize(paper_id: str):
             try:
                 async with httpx.AsyncClient(timeout=120.0) as c:
                      await c.post(f"{API_BASE}/api/papermind/atomize", json={"paper_id": paper_id})
             except Exception as e:
                 logger.error(f"Failed to trigger atomize for {paper_id}: {e}")

        # Currently we schedule it in background task
        background_tasks.add_task(trigger_atomize, paper.id)

        return ParseResponse(
            academic_paper_id=paper.id,
            title=paper.title,
            authors=paper.authors,
            section_count=len(paper.sections),
            doi=paper.doi
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to parse academic pdf")
        raise HTTPException(status_code=500, detail=str(e))

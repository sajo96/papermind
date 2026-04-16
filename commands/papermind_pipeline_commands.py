import time
from typing import Any, Dict, Optional

from pydantic import BaseModel
from surreal_commands import command


class TrackPipelineStageInput(BaseModel):
    stage: str
    paper_id: Optional[str] = None
    source_id: Optional[str] = None
    payload: Dict[str, Any] = {}


class TrackPipelineStageOutput(BaseModel):
    success: bool
    stage: str
    paper_id: Optional[str] = None
    source_id: Optional[str] = None
    processing_time: float


@command("track_pipeline_stage", app="papermind")
async def track_pipeline_stage_command(
    input_data: TrackPipelineStageInput,
) -> TrackPipelineStageOutput:
    start_time = time.time()
    return TrackPipelineStageOutput(
        success=True,
        stage=input_data.stage,
        paper_id=input_data.paper_id,
        source_id=input_data.source_id,
        processing_time=time.time() - start_time,
    )

-- Pipeline status tracking fields for PaperMind ingestion
DEFINE FIELD IF NOT EXISTS command          ON academic_paper TYPE option<record<command>>;
DEFINE FIELD IF NOT EXISTS pipeline_stage   ON academic_paper TYPE option<string>;
DEFINE FIELD IF NOT EXISTS stage_updated_at ON academic_paper TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS error_message    ON academic_paper TYPE option<string>;

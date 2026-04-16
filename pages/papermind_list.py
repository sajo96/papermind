import os
import time
from urllib.parse import quote

import httpx
import streamlit as st

API_BASE = os.environ.get("PAPERMIND_API_BASE", "http://localhost:5055")

STAGE_LABELS = {
    "ingesting": "⏳ Ingesting",
    "parsing": "🔍 Parsing",
    "embedding": "🧠 Embedding",
    "notes": "✍️ Generating Notes",
    "graph": "🕸️ Building Graph",
    "done": "✅ Ready",
    "failed": "❌ Failed",
}
TERMINAL_STAGES = {"done", "failed"}


def render_paper_status(paper_id: str) -> str | None:
    try:
        response = httpx.get(
            f"{API_BASE}/api/papermind/papers/{paper_id}/status",
            timeout=5,
        )
        if response.status_code == 200:
            data = response.json()
            stage = data.get("pipeline_stage") or "unknown"
            job = data.get("job_status") or ""
            label = STAGE_LABELS.get(stage, f"🔄 {stage}")
            st.caption(f"{label}  `{job}`")
            if stage == "failed":
                st.error(data.get("error_message", "Unknown error"))
            return stage
        st.caption("Status unavailable")
        return None
    except Exception:
        st.caption("Status unavailable")
        return None


def fetch_papers_for_notebook(notebook_id: str) -> list[dict]:
    encoded_notebook_id = quote(notebook_id, safe=":")
    response = httpx.get(f"{API_BASE}/api/papermind/graph/{encoded_notebook_id}", timeout=15)
    response.raise_for_status()
    data = response.json()
    nodes = data.get("nodes", [])
    return [node for node in nodes if node.get("type") == "paper"]


def render_paper_row(paper: dict) -> str | None:
    title = paper.get("label") or paper.get("id") or "Untitled paper"
    st.subheader(title)

    metadata_parts: list[str] = []
    year = paper.get("year")
    if year:
        metadata_parts.append(f"Year: {year}")
    doi = paper.get("doi")
    if doi:
        metadata_parts.append(f"DOI: {doi}")
    authors = paper.get("authors")
    if authors:
        metadata_parts.append(f"Authors: {', '.join(authors)}")

    if metadata_parts:
        st.caption(" | ".join(metadata_parts))

    paper_id = paper.get("id")
    if not paper_id:
        st.caption("Status unavailable")
        return None

    return render_paper_status(paper_id)


def main() -> None:
    st.set_page_config(page_title="PaperMind Pipeline Status", page_icon="📄", layout="wide")
    st.title("PaperMind Pipeline Status")

    notebook_id = st.text_input(
        "Notebook ID",
        value=st.session_state.get("papermind_notebook_id", ""),
        placeholder="notebook:...",
        help="Enter notebook ID to show papers and live pipeline progress.",
    )
    st.session_state["papermind_notebook_id"] = notebook_id

    auto_refresh = st.toggle("Auto refresh every 3 seconds", value=True)

    if not notebook_id:
        st.info("Enter a notebook ID to list papers and monitor pipeline status.")
        return

    container = st.empty()
    active_stage_found = False

    with container.container():
        try:
            papers = fetch_papers_for_notebook(notebook_id)
        except Exception as exc:
            st.error(f"Failed to load papers: {exc}")
            return

        if not papers:
            st.info("No papers found for this notebook.")
            return

        for paper in papers:
            stage = render_paper_row(paper)
            if stage and stage not in TERMINAL_STAGES:
                active_stage_found = True
            st.divider()

    if auto_refresh and active_stage_found:
        time.sleep(3)
        st.rerun()


if __name__ == "__main__":
    main()

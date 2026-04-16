import re

from loguru import logger

from open_notebook.database.repository import ensure_record_id, repo_query
from papermind.tagging.concept_utils import (
    author_terms,
    canonical_concept_id,
    is_author_label,
)


async def save_concepts(
    paper_id: str,
    note_concepts: list[str],
    paper_keywords: list[str],
    authors: list[str],
) -> list[str]:
    """Save concept records and tagged_with edges for a paper.

    Merges *note_concepts* (primary, from the LLM note generator) with
    *paper_keywords* (secondary, from PDF metadata).  No LLM calls, no spaCy.
    """
    author_term_set = author_terms(authors)

    seen: set[str] = set()
    labels: list[str] = []

    for label in [*note_concepts, *paper_keywords]:
        label = str(label or "").strip()
        if not label:
            continue
        normalized = re.sub(r"[^a-z0-9\s]+", " ", label.lower())
        normalized = re.sub(r"\s+", " ", normalized).strip()
        if is_author_label(normalized, author_term_set):
            continue
        concept_id = canonical_concept_id(label)
        if not concept_id or concept_id in seen:
            continue
        seen.add(concept_id)
        labels.append(label)

    for label in labels:
        concept_id = canonical_concept_id(label)
        if not concept_id:
            continue
        try:
            await repo_query(
                "UPDATE $id SET label = $label, created_at = time::now()",
                {"id": ensure_record_id(concept_id), "label": label.strip()},
            )
            await repo_query(
                "RELATE $in -> tagged_with -> $out",
                {"in": ensure_record_id(paper_id), "out": ensure_record_id(concept_id)},
            )
        except Exception as e:
            logger.warning(f"Failed linking concept {label}: {e}")

    return labels

from unittest.mock import AsyncMock, patch

import pytest

from papermind.api.graph_routes import _canonical_concept_id as graph_canonical_concept_id
from papermind.generators.academic_note_generator import AcademicNoteGenerator
from papermind.parsers.academic_pdf_parser import ParsedPaper
from papermind.tagging.auto_tagger import AutoTagger


def test_note_generator_filters_geo_and_institution_labels():
    assert AcademicNoteGenerator._canonical_concept_id("Denmark") is None
    assert AcademicNoteGenerator._canonical_concept_id("USA") is None
    assert AcademicNoteGenerator._canonical_concept_id("Danish") is None
    assert AcademicNoteGenerator._canonical_concept_id("University of Colorado") is None
    assert AcademicNoteGenerator._canonical_concept_id("kathryn arehart colorado edu") is None

    assert (
        AcademicNoteGenerator._canonical_concept_id("Graph Neural Networks")
        == "concept:graph_neural_networks"
    )


def test_auto_tagger_filters_geo_and_institution_labels():
    tagger = AutoTagger()

    assert tagger._canonical_concept_id("Denmark") is None
    assert tagger._canonical_concept_id("USA") is None
    assert tagger._canonical_concept_id("Danish") is None
    assert tagger._canonical_concept_id("University of Colorado") is None
    assert tagger._canonical_concept_id("kathryn arehart colorado edu") is None

    assert tagger._canonical_concept_id("transformer architecture") == "concept:transformer_architecture"


def test_graph_routes_filters_geo_and_institution_labels():
    assert graph_canonical_concept_id("Denmark") is None
    assert graph_canonical_concept_id("USA") is None
    assert graph_canonical_concept_id("Danish") is None
    assert graph_canonical_concept_id("University of Colorado") is None
    assert graph_canonical_concept_id("kathryn arehart colorado edu") is None

    assert graph_canonical_concept_id("causal inference") == "concept:causal_inference"


@pytest.mark.asyncio
async def test_auto_tagger_llm_curation_still_respects_hard_filters():
    tagger = AutoTagger()
    parsed = ParsedPaper(
        title="Test Paper",
        authors=["Kathryn Arehart"],
        abstract="About transformer models for speech enhancement.",
        doi=None,
        year=2024,
        keywords=["transformer architecture", "USA"],
        sections={"methods": "We evaluate a transformer architecture."},
        raw_references=[],
        raw_text="",
        is_ocr=False,
    )

    with patch.object(tagger, "_extract_spacy_tags", return_value=[]), patch.object(
        tagger, "_extract_llm_tags", new_callable=AsyncMock
    ) as mock_extract_llm, patch.object(
        tagger, "_llm_filter_candidates", new_callable=AsyncMock
    ) as mock_llm_filter, patch(
        "papermind.tagging.auto_tagger.repo_query", new_callable=AsyncMock
    ) as mock_repo_query:
        mock_extract_llm.return_value = []
        mock_llm_filter.return_value = [
            "transformer architecture",
            "University of Colorado",
            "kathryn arehart",
            "USA",
        ]

        labels = await tagger.tag_paper("academic_paper:1", parsed, note_concepts=[])

    assert labels == ["transformer architecture"]
    assert mock_repo_query.await_count == 2

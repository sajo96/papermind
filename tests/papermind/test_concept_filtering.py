from unittest.mock import AsyncMock, patch

import pytest

from papermind.tagging.concept_utils import canonical_concept_id, concept_label_from_id


def test_filters_geo_and_institution_labels():
    assert canonical_concept_id("Denmark") is None
    assert canonical_concept_id("USA") is None
    assert canonical_concept_id("Danish") is None
    assert canonical_concept_id("University of Colorado") is None
    assert canonical_concept_id("kathryn arehart colorado edu") is None

    assert canonical_concept_id("Graph Neural Networks") == "concept:graph_neural_network"
    assert canonical_concept_id("transformer architecture") == "concept:transformer_architecture"
    assert canonical_concept_id("causal inference") == "concept:causal_inference"


def test_concept_label_from_id():
    assert concept_label_from_id("concept:bert_model") == "Bert Model"
    assert concept_label_from_id("concept:causal_inference") == "Causal Inference"
    assert concept_label_from_id("") == "Concept"


def test_singularization():
    # Trailing-s should be stripped for keys longer than 5 chars
    assert canonical_concept_id("transformers") == "concept:transformer"
    assert canonical_concept_id("graphs") == "concept:graph"


def test_numeric_ratio_rejection():
    # Mostly-numeric labels should be rejected
    assert canonical_concept_id("10.1145/12345") is None


@pytest.mark.asyncio
async def test_save_concepts_filters_authors_and_noise():
    from papermind.tagging.concept_saver import save_concepts

    with patch("papermind.tagging.concept_saver.repo_query", new_callable=AsyncMock) as mock_repo:
        labels = await save_concepts(
            paper_id="academic_paper:1",
            note_concepts=["transformer architecture", "BERT", "USA", "Kathryn Arehart"],
            paper_keywords=["attention mechanism", "University of Colorado"],
            authors=["Kathryn Arehart"],
        )

    # Should keep technical concepts, reject geo/institution/author
    assert "transformer architecture" in labels
    assert "BERT" in labels
    assert "attention mechanism" in labels
    assert "USA" not in labels
    assert "Kathryn Arehart" not in labels
    assert "University of Colorado" not in labels

    # Should have called repo_query for each kept concept (UPDATE + RELATE)
    assert mock_repo.await_count == len(labels) * 2

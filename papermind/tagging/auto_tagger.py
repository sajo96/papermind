import json
import os
import re
from typing import Optional

from langchain_core.messages import HumanMessage, SystemMessage
from loguru import logger

from open_notebook.ai.provision import provision_langchain_model
from open_notebook.database.repository import ensure_record_id, repo_query
from papermind.parsers.academic_pdf_parser import ParsedPaper


class AutoTagger:
    """Generate concept tags via spaCy NER plus an LLM topic pass."""

    def __init__(self) -> None:
        self._spacy_nlp = None
        self._spacy_attempted = False
        self._noise_terms = {
            "paper", "study", "result", "results", "method", "methods", "model",
            "analysis", "introduction", "discussion", "conclusion", "abstract",
            "data", "table", "figure", "section", "reference", "references",
            "this", "that", "these", "those", "using", "used", "based",
            "journal", "volume", "issue", "http", "https", "www",
            "author", "authors", "doi", "issn", "isbn", "arxiv", "preprint",
            "published", "publication", "publisher", "copyright",
        }
        self._geo_terms = {
            "usa", "u s a", "u s", "us", "united states", "united kingdom",
            "england", "scotland", "wales", "ireland", "denmark", "sweden",
            "norway", "finland", "germany", "france", "italy", "spain",
            "portugal", "netherlands", "belgium", "switzerland", "austria",
            "poland", "ukraine", "russia", "china", "japan", "korea", "india",
            "canada", "mexico", "brazil", "argentina", "australia", "new zealand",
            "africa", "asia", "europe", "north america", "south america",
            "american", "british", "danish", "swedish", "norwegian", "finnish",
            "german", "french", "italian", "spanish", "portuguese", "dutch",
            "belgian", "austrian", "polish", "russian", "chinese", "japanese",
            "korean", "indian", "canadian", "mexican", "brazilian", "argentinian",
            "australian", "colorado", "boulder",
        }

    def _is_institution_or_geo(self, normalized: str) -> bool:
        if normalized in self._geo_terms:
            return True
        for term in self._geo_terms:
            if re.search(rf"\b{re.escape(term)}\b", normalized):
                return True
        if re.search(
            r"\b(university|universities|college|institute|institution|department|school|faculty|hospital|center|centre|laboratory|lab|ministry)\b",
            normalized,
        ):
            return True
        if re.search(r"\b(edu|ac uk|gmail|yahoo|outlook)\b", normalized):
            return True
        if re.search(r"\b(country|state|city|nation|province|county|capital|region)\b", normalized):
            return True
        return False

    def _is_noisy_label(self, label: str) -> bool:
        normalized = re.sub(r"[^a-z0-9\s]+", " ", (label or "").strip().lower())
        normalized = re.sub(r"\s+", " ", normalized).strip()
        if not normalized:
            return True
        if normalized in self._noise_terms:
            return True
        if len(normalized) < 3:
            return True
        if len(normalized) > 60:
            return True
        if normalized.isdigit():
            return True
        if self._is_institution_or_geo(normalized):
            return True
        if re.search(r"\b(doi|issn|isbn|arxiv|author|authors?)\b", normalized):
            return True
        if re.search(r"\b10\.\d{4,}/", normalized):
            return True
        return False

    def _canonical_concept_id(self, value: str) -> Optional[str]:
        cleaned = re.sub(r"[^a-z0-9\s]+", " ", (value or "").strip().lower())
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        if self._is_noisy_label(cleaned):
            return None
        return f"concept:{cleaned.replace(' ', '_')}"

    def _author_terms(self, authors: list[str]) -> set[str]:
        terms: set[str] = set()
        for author in authors or []:
            cleaned = re.sub(r"[^a-z0-9\s]+", " ", str(author or "").strip().lower())
            cleaned = re.sub(r"\s+", " ", cleaned).strip()
            if not cleaned:
                continue
            terms.add(cleaned)
            for part in cleaned.split():
                if len(part) >= 4:
                    terms.add(part)
        return terms

    def _is_author_label(self, normalized_label: str, author_terms: set[str]) -> bool:
        if not normalized_label or not author_terms:
            return False
        if normalized_label in author_terms:
            return True
        return False

    def _load_spacy(self):
        if self._spacy_attempted:
            return self._spacy_nlp

        self._spacy_attempted = True
        model_name = os.getenv("PAPERMIND_SPACY_MODEL", "en_core_web_sm")
        try:
            import spacy  # type: ignore

            self._spacy_nlp = spacy.load(model_name)
            logger.info(f"Loaded spaCy model for auto-tagging: {model_name}")
        except Exception as exc:
            logger.warning(
                "spaCy model unavailable for auto-tagging; "
                f"continuing with LLM-only tags ({exc})"
            )
            self._spacy_nlp = None

        return self._spacy_nlp

    def _extract_spacy_tags(self, parsed: ParsedPaper) -> list[str]:
        nlp = self._load_spacy()
        if not nlp:
            return []

        text = "\n".join(
            [
                parsed.title or "",
                parsed.abstract or "",
                "\n".join(parsed.sections.values())[:12000] if isinstance(parsed.sections, dict) else "",
            ]
        )

        if not text.strip():
            return []

        doc = nlp(text)
        keep_labels = {
            "PRODUCT",
            "EVENT",
            "WORK_OF_ART",
            "LAW",
            "LANGUAGE",
        }

        tags: list[str] = []
        seen: set[str] = set()
        for ent in doc.ents:
            if ent.label_ not in keep_labels:
                continue
            label = ent.text.strip()
            key = label.lower()
            if len(label) < 3 or key in seen:
                continue
            seen.add(key)
            tags.append(label)
            if len(tags) >= 20:
                break

        return tags

    async def _extract_llm_tags(self, parsed: ParsedPaper) -> list[str]:
        excerpt = "\n\n".join(
            [
                f"Title: {parsed.title or ''}",
                f"Abstract: {parsed.abstract or ''}",
                "Sections:\n" + (
                    "\n".join(
                        f"{k}: {str(v)[:600]}" for k, v in (parsed.sections or {}).items()
                    )[:5000]
                    if isinstance(parsed.sections, dict)
                    else ""
                ),
            ]
        ).strip()

        if not excerpt:
            return []

        prompt = (
            "Extract up to 12 concise topic tags for this academic paper. "
            "Return strict JSON only in this format: {\"tags\": [\"tag1\", \"tag2\"]}. "
            "Prefer technical concepts and methods, avoid generic words."
        )

        try:
            llm = await provision_langchain_model(
                excerpt,
                model_id=None,
                default_type="chat",
                temperature=0.1,
                max_tokens=300,
            )
            response = await llm.ainvoke(
                [
                    SystemMessage(content="Return valid JSON only."),
                    HumanMessage(content=f"{prompt}\n\n{excerpt}"),
                ]
            )
            raw = getattr(response, "content", str(response)).strip()
            raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
            raw = re.sub(r"\s*```$", "", raw)
            payload = json.loads(raw)
            tags = payload.get("tags", []) if isinstance(payload, dict) else []
            if not isinstance(tags, list):
                return []
            return [str(tag).strip() for tag in tags if str(tag).strip()][:12]
        except Exception as exc:
            logger.warning(f"LLM topic extraction failed during auto-tagging: {exc}")
            return []

    async def _llm_filter_candidates(self, parsed: ParsedPaper, candidates: list[str]) -> list[str]:
        if not candidates:
            return []

        if os.getenv("PAPERMIND_LLM_CONCEPT_FILTER", "true").lower() not in {"1", "true", "yes", "on"}:
            return candidates[:12]

        excerpt = "\n\n".join(
            [
                f"Title: {parsed.title or ''}",
                f"Abstract: {(parsed.abstract or '')[:1800]}",
                "Sections:\n" + (
                    "\n".join(
                        f"{k}: {str(v)[:500]}" for k, v in (parsed.sections or {}).items()
                    )[:3500]
                    if isinstance(parsed.sections, dict)
                    else ""
                ),
                "Candidate concepts:\n" + "\n".join(f"- {c}" for c in candidates[:40]),
            ]
        ).strip()

        prompt = (
            "You are filtering concept tags for a paper-to-paper concept map. "
            "Keep only technical concepts, methods, datasets, or domain terms that help connect papers semantically. "
            "Reject geography, nationality/demonyms, institutions, organizations, author/person names, and email/domain fragments. "
            "Return strict JSON only as {\"keep\": [\"concept1\", \"concept2\"], \"add\": [\"optional_new_concept\"]}. "
            "If uncertain, exclude it. Keep at most 12 items total across keep+add."
        )

        try:
            llm = await provision_langchain_model(
                excerpt,
                model_id=None,
                default_type="chat",
                temperature=0.0,
                max_tokens=400,
            )
            response = await llm.ainvoke(
                [
                    SystemMessage(content="Return valid JSON only."),
                    HumanMessage(content=f"{prompt}\n\n{excerpt}"),
                ]
            )
            raw = getattr(response, "content", str(response)).strip()
            raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
            raw = re.sub(r"\s*```$", "", raw)
            payload = json.loads(raw)
            keep = payload.get("keep", []) if isinstance(payload, dict) else []
            add = payload.get("add", []) if isinstance(payload, dict) else []

            merged: list[str] = []
            seen: set[str] = set()
            for entry in [*keep, *add]:
                label = str(entry or "").strip()
                if not label:
                    continue
                key = re.sub(r"\s+", " ", label.lower()).strip()
                if key in seen:
                    continue
                seen.add(key)
                merged.append(label)
                if len(merged) >= 12:
                    break
            return merged
        except Exception as exc:
            logger.warning(f"LLM concept-filter pass failed; falling back to deterministic filtering ({exc})")
            return candidates[:12]

    async def tag_paper(
        self,
        paper_id: str,
        parsed: ParsedPaper,
        note_concepts: Optional[list[str]] = None,
    ) -> list[str]:
        spacy_tags = self._extract_spacy_tags(parsed)
        llm_tags = await self._extract_llm_tags(parsed)
        note_tags = list(note_concepts or [])
        keyword_tags = list(parsed.keywords or [])
        author_terms = self._author_terms(parsed.authors or [])

        candidate_labels = [*keyword_tags, *note_tags, *spacy_tags, *llm_tags]
        dedup: dict[str, str] = {}
        for raw in candidate_labels:
            label = str(raw or "").strip()
            normalized = re.sub(r"[^a-z0-9\s]+", " ", label.lower())
            normalized = re.sub(r"\s+", " ", normalized).strip()
            if self._is_author_label(normalized, author_terms):
                continue
            concept_id = self._canonical_concept_id(label)
            if not concept_id:
                continue
            dedup[concept_id] = label

        curated_labels = await self._llm_filter_candidates(parsed, list(dedup.values()))

        labels: list[str] = []
        for label in curated_labels:
            normalized = re.sub(r"[^a-z0-9\s]+", " ", label.lower())
            normalized = re.sub(r"\s+", " ", normalized).strip()
            if self._is_author_label(normalized, author_terms):
                continue

            concept_id = self._canonical_concept_id(label)
            if not concept_id:
                continue

            await repo_query(
                "UPDATE $id SET label = $label, created_at = time::now()",
                {
                    "id": ensure_record_id(concept_id),
                    "label": label,
                },
            )
            await repo_query(
                "RELATE $in -> tagged_with -> $out",
                {
                    "in": ensure_record_id(paper_id),
                    "out": ensure_record_id(concept_id),
                },
            )
            labels.append(label)

        return labels

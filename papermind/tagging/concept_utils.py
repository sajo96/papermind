import re
from typing import Optional


_NOISY_CONCEPT_TERMS = {
    "paper",
    "study",
    "result",
    "results",
    "method",
    "methods",
    "analysis",
    "introduction",
    "discussion",
    "conclusion",
    "abstract",
    "data",
    "table",
    "figure",
    "section",
    "reference",
    "references",
    "this",
    "that",
    "these",
    "those",
    "using",
    "used",
    "based",
    "journal",
    "volume",
    "issue",
    "http",
    "https",
    "www",
    "site",
    "sites",
    "march",
    "computing",
    "author",
    "authors",
    "doi",
    "issn",
    "isbn",
    "arxiv",
    "preprint",
    "published",
    "publication",
    "publisher",
    "copyright",
    "methodology",
    "limitation",
    "limitations",
}

_GEO_CONCEPT_TERMS = {
    "usa",
    "u s a",
    "u s",
    "us",
    "united states",
    "united kingdom",
    "england",
    "scotland",
    "wales",
    "ireland",
    "denmark",
    "sweden",
    "norway",
    "finland",
    "germany",
    "france",
    "italy",
    "spain",
    "portugal",
    "netherlands",
    "belgium",
    "switzerland",
    "austria",
    "poland",
    "ukraine",
    "russia",
    "china",
    "japan",
    "korea",
    "india",
    "canada",
    "mexico",
    "brazil",
    "argentina",
    "australia",
    "new zealand",
    "africa",
    "asia",
    "europe",
    "north america",
    "south america",
    "american",
    "british",
    "danish",
    "swedish",
    "norwegian",
    "finnish",
    "german",
    "french",
    "italian",
    "spanish",
    "portuguese",
    "dutch",
    "belgian",
    "austrian",
    "polish",
    "russian",
    "chinese",
    "japanese",
    "korean",
    "indian",
    "canadian",
    "mexican",
    "brazilian",
    "argentinian",
    "australian",
    "colorado",
    "boulder",
}

_INSTITUTION_PATTERN = re.compile(
    r"\b(university|universities|college|institute|institution|department|school|faculty|hospital|center|centre|laboratory|lab|ministry)\b"
)
_GEOGRAPHY_PATTERN = re.compile(r"\b(country|state|city|nation|province|county|capital|region)\b")
_EMAIL_PATTERN = re.compile(r"\b(edu|ac uk|gmail|yahoo|outlook)\b")
_DOI_PATTERN = re.compile(r"\b10\.\d{4,}/")
_ACADEMIC_ID_PATTERN = re.compile(r"\b(doi|issn|isbn|arxiv|author|authors?)\b")


def is_noisy_label(label: str) -> bool:
    normalized = re.sub(r"[^a-z0-9\s]+", " ", (label or "").strip().lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    if not normalized:
        return True
    if len(normalized) < 3:
        return True
    if len(normalized) > 60:
        return True
    if normalized.isdigit():
        return True
    if normalized in _NOISY_CONCEPT_TERMS:
        return True
    if normalized in _GEO_CONCEPT_TERMS:
        return True
    for term in _GEO_CONCEPT_TERMS:
        if re.search(rf"\b{re.escape(term)}\b", normalized):
            return True
    if _INSTITUTION_PATTERN.search(normalized):
        return True
    if _GEOGRAPHY_PATTERN.search(normalized):
        return True
    if _EMAIL_PATTERN.search(normalized):
        return True
    if _DOI_PATTERN.search(normalized):
        return True
    if _ACADEMIC_ID_PATTERN.search(normalized):
        return True
    # Mostly numeric/metadata-like labels are not useful graph concepts.
    alnum = re.sub(r"[^a-z0-9]", "", normalized)
    if alnum and sum(ch.isdigit() for ch in alnum) / len(alnum) > 0.45:
        return True
    return False


def normalize_concept_key(value: str) -> str:
    raw = (value or "").replace("concept:", "").strip().lower()
    raw = raw.replace("_", " ").replace("-", " ").replace("/", " ")
    key = re.sub(r"[^a-z0-9\s]+", " ", raw)
    key = re.sub(r"\s+", " ", key).strip()

    # Normalize common lexical variants that otherwise split concept nodes.
    key = key.replace("hearing aid", "hearing aid")
    key = key.replace("auditory peripheral", "auditory periphery")
    key = key.replace("long term", "longterm")

    # Singularize trailing-s for better matching (e.g. "transformers" -> "transformer").
    if key.endswith("s") and len(key) > 5:
        key = key[:-1]
    return key


def canonical_concept_id(value: str) -> Optional[str]:
    """Return a normalized concept ID like ``concept:transformer_architecture``, or *None* if noisy."""
    key = normalize_concept_key(value)
    if not key or is_noisy_label(key):
        return None
    return f"concept:{key.replace(' ', '_')}"


def concept_label_from_id(concept_id: str) -> str:
    """Human-readable label from a concept ID, e.g. ``concept:bert_model`` -> ``"Bert Model"``."""
    key = normalize_concept_key(concept_id)
    if not key:
        return "Concept"
    return " ".join(part.capitalize() for part in key.split())


def author_terms(authors: list[str]) -> set[str]:
    """Return a set of lowercase name fragments used to reject author-like labels."""
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


def is_author_label(normalized_label: str, author_term_set: set[str]) -> bool:
    if not normalized_label or not author_term_set:
        return False
    return normalized_label in author_term_set

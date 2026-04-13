import re
import os
import fitz  # PyMuPDF
import pytesseract
from PIL import Image
import scholarly
import crossref_commons.retrieval
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)

@dataclass
class ParsedPaper:
    title: str
    authors: list[str]
    abstract: str | None
    doi: str | None
    year: int | None
    keywords: list[str]
    sections: dict[str, str]
    raw_references: list[str]
    raw_text: str
    is_ocr: bool

def find_doi(text: str) -> str | None:
    match = re.search(r"10\.\d{4,}/[^\s]+", text)
    if match:
        return match.group(0).rstrip(".")
    return None

class AcademicPDFParser:
    def __init__(self, file_path: str):
        self.file_path = file_path
        self.is_ocr = False

    def parse(self) -> ParsedPaper:
        raw_text = ""
        
        try:
            doc = fitz.open(self.file_path)
            for page in doc:
                page_text = page.get_text("text")
                if len(page_text.strip()) < 200 and os.environ.get("PAPERMIND_ENABLE_OCR", "true").lower() == "true":
                    self.is_ocr = True
                    pix = page.get_pixmap()
                    # PyMuPDF pixmap to PIL Image
                    if pix.alpha:
                        img = Image.frombytes("RGBA", [pix.width, pix.height], pix.samples)
                    else:
                        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                    page_text = pytesseract.image_to_string(img)
                raw_text += page_text + "\n"
        except Exception as e:
            logger.error(f"Failed to extract text from PDF {self.file_path}: {e}")

        doi = find_doi(raw_text)
        title, authors, year, abstract = "Unknown Title", [], None, None
        
        if doi:
            try:
                crossref_mailto = os.environ.get("PAPERMIND_CROSSREF_MAILTO", "test@example.com")
                pub = crossref_commons.retrieval.get_publication_as_json(doi)
                if pub:
                    title = pub.get("title", [title])[0]
                    authors_list = pub.get("author", [])
                    authors = [f"{a.get("given", "")} {a.get("family", "")}".strip() for a in authors_list]
                    if "published-print" in pub:
                        date_parts = pub["published-print"].get("date-parts", [])
                        if date_parts and len(date_parts[0]) > 0:
                            year = date_parts[0][0]
                    abstract = pub.get("abstract", None)
            except Exception as e:
                logger.error(f"Crossref lookup failed for DOI {doi}: {e}")

        # Fallback to scholarly
        if title == "Unknown Title" and len(raw_text) > 100:
             potential_title = " ".join([line.strip() for line in raw_text.split("\n")[:5] if line.strip()][:3])
             if potential_title:
                 title = potential_title
                 # Disabled scholarly lookup for speed, uncomment if needed
                 # try:
                 #     search_query = scholarly.scholarly.search_pubs(potential_title)
                 #     pub = next(search_query, None)
                 #     if pub:
                 #         title = pub["bib"].get("title", potential_title)
                 #         author_data = pub["bib"].get("author", [])
                 #         if isinstance(author_data, str):
                 #             authors = author_data.split(" and ")
                 #         year_str = pub["bib"].get("pub_year")
                 #         year = int(year_str) if year_str and str(year_str).isdigit() else None
                 #         abstract = pub["bib"].get("abstract", abstract)
                 # except Exception as e:
                 #     logger.warning(f"Scholarly lookup failed: {e}")

        sections = self._extract_sections(raw_text)

        return ParsedPaper(
            title=title or "Unknown Title",
            authors=authors,
            abstract=abstract,
            doi=doi,
            year=year,
            keywords=[],
            sections=sections,
            raw_references=[],
            raw_text=raw_text,
            is_ocr=self.is_ocr
        )

    def _extract_sections(self, text: str) -> dict[str, str]:
        sections = {}
        current_section = "frontmatter"
        current_text = []
        
        section_regex = re.compile(r"^(abstract|introduction|background|methods?|results?|discussion|conclusion|references)\s*$", re.IGNORECASE)
        
        for line in text.split("\n"):
            line_clean = line.strip()
            if not line_clean:
                current_text.append(line)
                continue
                
            if section_regex.match(line_clean) or (line_clean.isupper() and 3 < len(line_clean) < 30):
                if current_text:
                    sections[current_section] = "\n".join(current_text)
                current_section = line_clean.lower()
                current_text = []
            else:
                current_text.append(line)
                
        if current_text:
            sections[current_section] = "\n".join(current_text)
            
        if len(sections) < 3:
            return {"full_text": text}

        return sections

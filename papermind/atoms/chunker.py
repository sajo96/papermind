import tiktoken
from typing import List
from papermind.parsers.academic_pdf_parser import ParsedPaper
from papermind.models import Atom

def get_token_count(text: str, model_name: str = "cl100k_base") -> int:
    try:
        encoding = tiktoken.get_encoding(model_name)
    except Exception:
        # Fallback if cl100k_base fails
        encoding = tiktoken.get_encoding("cl100k_base")
    return len(encoding.encode(text))

def split_text_into_chunks(text: str, max_tokens: int = 600, overlap: int = 100) -> List[str]:
    encoding = tiktoken.get_encoding("cl100k_base")
    tokens = encoding.encode(text)
    
    if len(tokens) <= max_tokens:
        return [text]
        
    chunks = []
    start = 0
    while start < len(tokens):
        end = min(start + max_tokens, len(tokens))
        chunk_tokens = tokens[start:end]
        chunks.append(encoding.decode(chunk_tokens))
        
        if end == len(tokens):
            break
        start += (max_tokens - overlap)
        
    return chunks

def chunk_paper_into_atoms(parsed_paper: ParsedPaper, paper_id: str) -> List[Atom]:
    """
    Strategy:
    - For each section in parsed_paper.sections:
        - If section text <= 800 tokens: create ONE atom for the whole section
        - If section text > 800 tokens: split into overlapping 600-token chunks
          with 100-token overlap (sliding window)
    - Assign section_label from the section key
    - Return list of Atom objects (not yet embedded)
    """
    atoms = []
    
    for section_name, content in parsed_paper.sections.items():
        token_count = get_token_count(content)
        
        if token_count <= 800:
            atom = Atom(
                paper_id=paper_id,
                section_label=section_name,
                content=content
            )
            atoms.append(atom)
        else:
            text_chunks = split_text_into_chunks(content, max_tokens=600, overlap=100)
            for i, chunk in enumerate(text_chunks):
                atom = Atom(
                    paper_id=paper_id,
                    section_label=f"{section_name}_chunk_{i+1}",
                    content=chunk
                )
                atoms.append(atom)
                
    return atoms

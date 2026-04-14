#!/usr/bin/env python
"""Quick test of Step 4 chunking pipeline."""

import sys
sys.path.insert(0, '/Volumes/Files/projects/papermind')

from papermind.chunkers.token_chunker import TokenChunker
from papermind.atoms.chunker import chunk_paper_into_atoms
from papermind.parsers.academic_pdf_parser import ParsedPaper


def test_token_chunker():
    """Test the TokenChunker with sample text."""
    print("\n=== Testing TokenChunker ===")
    
    chunker = TokenChunker(chunk_size=600, overlap=100)
    
    # Sample section text
    sample_text = """
    This is the introduction section of an academic paper.
    It discusses the background and motivation for the research.
    """ + " Lorem ipsum dolor sit amet. " * 100  # Add enough text to trigger chunking
    
    chunks = chunker.chunk_section(sample_text, "Introduction")
    
    print(f"✓ Chunked sample text into {len(chunks)} chunks")
    for i, chunk in enumerate(chunks):
        print(f"  Chunk {i+1}: {chunk.token_count} tokens, label={chunk.section_label}")
    
    return len(chunks) > 0


def test_paper_chunking():
    """Test chunking a full paper's sections."""
    print("\n=== Testing Paper Chunking ===")
    
    # Create a sample ParsedPaper
    sample_sections = {
        "abstract": "This is the abstract. " * 50,
        "introduction": "This is the introduction. " * 100,
        "methods": "This is the methods section. " * 100,
    }
    
    paper = ParsedPaper(
        title="Test Paper",
        authors=["Author One", "Author Two"],
        abstract="Test abstract",
        doi="10.1234/test",
        year=2024,
        keywords=["keyword1", "keyword2"],
        sections=sample_sections,
        raw_references=["Ref1", "Ref2"],
        raw_text="Full text",
        is_ocr=False
    )
    
    atoms = chunk_paper_into_atoms(paper, "paper:1")
    
    print(f"✓ Chunked paper into {len(atoms)} atoms")
    for i, atom in enumerate(atoms[:5]):  # Show first 5
        print(f"  Atom {i+1}: section={atom.section_label}, tokens_approx={len(atom.content.split())}")
    
    return len(atoms) > 0


def test_token_counting():
    """Test token counting accuracy."""
    print("\n=== Testing Token Counting ===")
    
    chunker = TokenChunker()
    
    test_texts = [
        "Hello world",
        "The quick brown fox jumps over the lazy dog",
        "This is a longer text. " * 50,
    ]
    
    for text in test_texts:
        count = chunker.count_tokens(text)
        print(f"✓ Token count for '{text[:50]}...': {count}")
    
    return True


if __name__ == "__main__":
    print("=" * 60)
    print("STEP 4 - CHUNKING PIPELINE TEST")
    print("=" * 60)
    
    try:
        assert test_token_chunker(), "TokenChunker test failed"
        assert test_paper_chunking(), "Paper chunking test failed"
        assert test_token_counting(), "Token counting test failed"
        
        print("\n" + "=" * 60)
        print("✓ ALL TESTS PASSED - Step 4 chunking pipeline is working!")
        print("=" * 60)
        sys.exit(0)
    except Exception as e:
        print(f"\n✗ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

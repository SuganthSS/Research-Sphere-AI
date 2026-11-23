"""Section-aware document chunking service.

Splits a research paper's extracted pages into overlapping text chunks,
respecting section boundaries. Uses character-based splitting — no heavy
tokenizer is required.

Target chunk size: 800–1200 characters (TARGET_CHUNK_SIZE = 1000)
Overlap between adjacent chunks within the same section: CHUNK_OVERLAP = 150 chars
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Optional, TYPE_CHECKING

from app.services.text_cleaning import clean_page_text
from app.services.section_detection import build_page_section_map, detect_section_in_text

if TYPE_CHECKING:
    from app.models.paper_page import PaperPage


# ---------------------------------------------------------------------------
# Configuration constants
# ---------------------------------------------------------------------------
TARGET_CHUNK_SIZE: int = 1000  # characters per chunk (target)
CHUNK_OVERLAP: int = 150       # overlap between adjacent chunks in same section
MIN_CHUNK_SIZE: int = 50       # don't create chunks smaller than this


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class ChunkResult:
    """Represents a single text chunk from the document chunking pipeline."""
    chunk_index: int         # 0-based, sequential across entire document
    section_name: Optional[str]
    text: str
    character_count: int
    start_page: int
    end_page: int
    token_count_estimate: Optional[int] = field(default=None)

    def __post_init__(self) -> None:
        if self.token_count_estimate is None:
            # Approximate token count: word count × 1.3
            word_count = len(self.text.split())
            self.token_count_estimate = int(word_count * 1.3)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _split_into_units(text: str, max_size: int = TARGET_CHUNK_SIZE) -> List[str]:
    """Split text into units (paragraphs, sentences, or pieces) where each unit is <= max_size."""
    raw_paras = re.split(r"\n\s*\n", text)
    paragraphs = [p.strip() for p in raw_paras if p.strip()]
    units: List[str] = []

    for para in paragraphs:
        if len(para) <= max_size:
            units.append(para)
        else:
            # Split long paragraph into sentences or character slices
            sentences = re.split(r"(?<=[.!?])\s+", para)
            curr = ""
            for s in sentences:
                s = s.strip()
                if not s:
                    continue
                if len(s) > max_size:
                    if curr:
                        units.append(curr)
                        curr = ""
                    for i in range(0, len(s), max_size):
                        slice_chunk = s[i:i + max_size].strip()
                        if slice_chunk:
                            units.append(slice_chunk)
                elif len(curr) + len(s) + 1 <= max_size:
                    curr = f"{curr} {s}" if curr else s
                else:
                    if curr:
                        units.append(curr)
                    curr = s
            if curr:
                units.append(curr)

    return units


def _chunk_text_block(
    text_block: str,
    section_name: Optional[str],
    start_page: int,
    end_page: int,
    chunk_index_start: int,
) -> List[ChunkResult]:
    """Split a contiguous text block into overlapping chunks at paragraph/sentence boundaries."""
    if not text_block.strip():
        return []

    units = _split_into_units(text_block, TARGET_CHUNK_SIZE)
    if not units:
        return []

    chunks: List[ChunkResult] = []
    chunk_index = chunk_index_start
    current_units: List[str] = []
    current_len: int = 0

    for unit in units:
        unit_len = len(unit)

        # If adding this unit would exceed target size, emit chunk if current buffer is non-empty
        if current_len + unit_len + 2 > TARGET_CHUNK_SIZE and current_units:
            chunk_text = "\n\n".join(current_units)
            chunks.append(ChunkResult(
                chunk_index=chunk_index,
                section_name=section_name,
                text=chunk_text,
                character_count=len(chunk_text),
                start_page=start_page,
                end_page=end_page,
            ))
            chunk_index += 1

            # Determine overlap: take trailing ~CHUNK_OVERLAP characters
            if len(chunk_text) > CHUNK_OVERLAP:
                overlap_text = chunk_text[-CHUNK_OVERLAP:].strip()
                current_units = [overlap_text] if overlap_text else []
                current_len = len(overlap_text)
            else:
                current_units = []
                current_len = 0

        current_units.append(unit)
        current_len += unit_len + 2

    # Flush remainder
    if current_units:
        chunk_text = "\n\n".join(current_units).strip()
        if chunk_text:
            if chunks and len(chunk_text) < MIN_CHUNK_SIZE:
                last_chunk = chunks[-1]
                merged_text = f"{last_chunk.text}\n\n{chunk_text}"
                last_chunk.text = merged_text
                last_chunk.character_count = len(merged_text)
                last_chunk.token_count_estimate = int(len(merged_text.split()) * 1.3)
            else:
                chunks.append(ChunkResult(
                    chunk_index=chunk_index,
                    section_name=section_name,
                    text=chunk_text,
                    character_count=len(chunk_text),
                    start_page=start_page,
                    end_page=end_page,
                ))

    return chunks


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def chunk_document(pages: "List[PaperPage]") -> List[ChunkResult]:
    """Chunk a document from its extracted pages into section-aware overlapping chunks.

    Pipeline:
    1. Build a section map (page_number → section_name) with cross-page continuity
    2. For each page, clean the text
    3. Group consecutive pages sharing the same section into blocks
    4. Chunk each block independently (overlapping within section)
    5. Return all chunks in order with globally sequential chunk_index

    Returns an empty list for documents with no meaningful text.
    """
    if not pages:
        return []

    # Step 1: Build section map
    section_map = dict(build_page_section_map(pages))

    # Step 2: Group pages into section blocks
    # Each block: (section_name, [(page_number, cleaned_text)])
    blocks: List[tuple] = []
    current_section: Optional[str] = None
    current_block: List[tuple] = []

    for page in pages:
        section = section_map.get(page.page_number)
        cleaned = clean_page_text(page.text or "")

        if section != current_section:
            if current_block:
                blocks.append((current_section, current_block))
            current_section = section
            current_block = [(page.page_number, cleaned)]
        else:
            current_block.append((page.page_number, cleaned))

    # Flush last block
    if current_block:
        blocks.append((current_section, current_block))

    # Step 3: Chunk each section block
    all_chunks: List[ChunkResult] = []
    global_chunk_index = 0

    for section_name, page_tuples in blocks:
        if not page_tuples:
            continue

        # Collect full section text with page tracking
        full_text = "\n\n".join(text for _, text in page_tuples if text.strip())
        start_page = page_tuples[0][0]
        end_page = page_tuples[-1][0]

        section_chunks = _chunk_text_block(
            text_block=full_text,
            section_name=section_name,
            start_page=start_page,
            end_page=end_page,
            chunk_index_start=global_chunk_index,
        )

        # Re-index chunks to global sequence
        for chunk in section_chunks:
            chunk.chunk_index = global_chunk_index
            global_chunk_index += 1

        all_chunks.extend(section_chunks)

    return all_chunks

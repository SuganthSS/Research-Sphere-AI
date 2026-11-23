"""Deterministic regex-based scientific section detection service.

NO LLM is used. Detection is purely pattern-based and case-insensitive.
Supports both unnumbered headings ("Abstract", "Introduction") and
numbered headings ("1 Introduction", "2.1 Methodology").

Cross-page continuity: once a section is identified, it carries forward
to subsequent pages until a new heading is found.
"""
import re
from typing import Optional, List, Tuple, TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.paper_page import PaperPage


# ---------------------------------------------------------------------------
# Canonical section patterns ordered by specificity (most specific first)
# ---------------------------------------------------------------------------

# Each entry: (compiled_regex, canonical_name)
# The regex matches the heading at the start of a line or after a newline.
# We use re.IGNORECASE | re.MULTILINE.

_PATTERN_SPECS: List[Tuple[str, str]] = [
    # Combined / compound sections first
    (r"(?:^|\n)\s*(?:\d+[\.\d]*\s+)?results\s+and\s+discussion", "Results and Discussion"),
    (r"(?:^|\n)\s*(?:\d+[\.\d]*\s+)?materials\s+and\s+methods", "Materials and Methods"),
    (r"(?:^|\n)\s*(?:\d+[\.\d]*\s+)?related\s+work", "Related Work"),
    (r"(?:^|\n)\s*(?:\d+[\.\d]*\s+)?literature\s+review", "Literature Review"),
    (r"(?:^|\n)\s*(?:\d+[\.\d]*\s+)?experimental\s+setup", "Experimental Setup"),
    (r"(?:^|\n)\s*(?:\d+[\.\d]*\s+)?future\s+work", "Future Work"),
    # Single-word sections
    (r"(?:^|\n)\s*(?:\d+[\.\d]*\s+)?abstract\b", "Abstract"),
    (r"(?:^|\n)\s*(?:\d+[\.\d]*\s+)?introduction\b", "Introduction"),
    (r"(?:^|\n)\s*(?:\d+[\.\d]*\s+)?background\b", "Background"),
    (r"(?:^|\n)\s*(?:\d+[\.\d]*\s+)?methodology\b", "Methodology"),
    (r"(?:^|\n)\s*(?:\d+[\.\d]*\s+)?methods\b", "Methods"),
    (r"(?:^|\n)\s*(?:\d+[\.\d]*\s+)?experiments\b", "Experiments"),
    (r"(?:^|\n)\s*(?:\d+[\.\d]*\s+)?results\b", "Results"),
    (r"(?:^|\n)\s*(?:\d+[\.\d]*\s+)?discussion\b", "Discussion"),
    (r"(?:^|\n)\s*(?:\d+[\.\d]*\s+)?evaluation\b", "Evaluation"),
    (r"(?:^|\n)\s*(?:\d+[\.\d]*\s+)?conclusions\b", "Conclusion"),
    (r"(?:^|\n)\s*(?:\d+[\.\d]*\s+)?conclusion\b", "Conclusion"),
    (r"(?:^|\n)\s*(?:\d+[\.\d]*\s+)?limitations\b", "Limitations"),
    (r"(?:^|\n)\s*(?:\d+[\.\d]*\s+)?acknowledgements\b", "Acknowledgements"),
    (r"(?:^|\n)\s*(?:\d+[\.\d]*\s+)?acknowledgments\b", "Acknowledgements"),
    (r"(?:^|\n)\s*(?:\d+[\.\d]*\s+)?references\b", "References"),
    (r"(?:^|\n)\s*(?:\d+[\.\d]*\s+)?appendix\b", "Appendix"),
]

SECTION_PATTERNS: List[Tuple[re.Pattern, str]] = [
    (re.compile(pat, re.IGNORECASE | re.MULTILINE), name)
    for pat, name in _PATTERN_SPECS
]

# Fallback labels
FRONT_MATTER = "Front Matter"
UNKNOWN_SECTION = "Unknown"


def detect_section_in_text(text: str) -> Optional[str]:
    """Return the first canonical section name found in text, or None.

    Searches for section heading patterns. Returns the name of the first
    matching section (by position in the text, then by specificity order).
    """
    if not text:
        return None

    earliest_match: Optional[Tuple[int, str]] = None

    for pattern, name in SECTION_PATTERNS:
        m = pattern.search(text)
        if m:
            pos = m.start()
            if earliest_match is None or pos < earliest_match[0]:
                earliest_match = (pos, name)

    return earliest_match[1] if earliest_match is not None else None


def build_page_section_map(pages: "List[PaperPage]") -> List[Tuple[int, str]]:
    """Return a list of (page_number, section_name) for all pages.

    Rules:
    - Text before the first recognized heading → FRONT_MATTER
    - Once a section heading is detected on a page, that section carries
      forward to subsequent pages until a new heading overrides it.
    - Pages where no heading has ever been detected and no heading was
      found before them → FRONT_MATTER.
    - After the first heading ever found, pages with no new heading keep
      the most recently detected section.
    """
    result: List[Tuple[int, str]] = []
    current_section: Optional[str] = None  # None means "before first heading"

    for page in pages:
        detected = detect_section_in_text(page.text or "")
        if detected is not None:
            current_section = detected

        if current_section is None:
            section_label = FRONT_MATTER
        else:
            section_label = current_section

        result.append((page.page_number, section_label))

    return result

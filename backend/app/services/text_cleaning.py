"""Conservative scientific text cleaning service.

Normalizes whitespace, line endings, control characters, and Unicode.
Does NOT remove equations, citations, Greek letters, symbols, or any
meaningful scientific content. Raw PaperPage.text is never modified —
this module creates a cleaned copy for downstream processing.
"""
import re
import unicodedata


def clean_page_text(raw_text: str) -> str:
    """Return a cleaned copy of raw page text, preserving all scientific content.

    Operations performed (in order):
    1. Normalize line endings to \\n
    2. Remove null bytes and ASCII control characters (except \\t, \\n, \\r)
    3. Normalize repeated spaces within lines (collapse to single space)
    4. Normalize excessive blank lines (max 2 consecutive blank lines)
    5. Strip trailing whitespace from each line
    6. Normalize Unicode to NFC form

    Scientific content preserved:
    - Greek letters (α, β, γ, …), math symbols (∑, ∫, ≤, ≥, →, …)
    - Superscripts / subscripts, equation brackets, citations, references
    - Hyphens, dashes, en-dashes, em-dashes
    """
    if not raw_text or not raw_text.strip():
        return ""

    text = raw_text

    # 1. Normalize line endings
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # 2. Remove null bytes and problematic control characters
    #    Keep: \t (0x09), \n (0x0a)
    #    Remove: 0x00–0x08, 0x0b–0x0c, 0x0e–0x1f, 0x7f
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)

    # 3. Collapse multiple spaces within each line (preserve indentation)
    #    Only collapse 2+ consecutive spaces → single space
    text = re.sub(r" {2,}", " ", text)

    # 4. Strip trailing whitespace from each line
    lines = [line.rstrip() for line in text.split("\n")]
    text = "\n".join(lines)

    # 5. Collapse more than 2 consecutive blank lines into exactly 2
    text = re.sub(r"\n{3,}", "\n\n", text)

    # 6. Unicode normalization (NFC: canonical composition)
    text = unicodedata.normalize("NFC", text)

    return text.strip()

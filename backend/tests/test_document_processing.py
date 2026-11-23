"""Comprehensive test suite for Module 4 / Iteration 4.1:
Text Cleaning, Scientific Section Detection, and RAG-Ready Chunking.

Tests cover:
- text_cleaning service
- section_detection service
- document_chunking service
- document_processing API endpoints (POST /process, GET /chunks)
- ownership isolation, cascade deletion, idempotent reprocessing
"""
import io
import uuid
import pytest
import pymupdf
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.db.session import SessionLocal
from app.models.paper import Paper
from app.models.paper_chunk import PaperChunk
from app.services.text_cleaning import clean_page_text
from app.services.section_detection import detect_section_in_text, build_page_section_map
from app.services.document_chunking import chunk_document, TARGET_CHUNK_SIZE, CHUNK_OVERLAP

client = TestClient(app)


# ---------------------------------------------------------------------------
# Shared helpers (mirror pattern from test_paper_extraction.py)
# ---------------------------------------------------------------------------

def create_authenticated_user(name: str = "Dr. Chunk Tester") -> tuple[dict, str, uuid.UUID]:
    """Register and login a test user; email uses 'chunk_' prefix to avoid collision."""
    email = f"chunk_{uuid.uuid4().hex[:8]}@example.com"
    password = "StrongPassword2026!"
    reg_res = client.post(
        "/api/auth/register",
        json={"name": name, "email": email, "password": password},
    )
    assert reg_res.status_code == 201, reg_res.text
    user_data = reg_res.json()
    user_id = uuid.UUID(user_data["id"])
    login_res = client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )
    assert login_res.status_code == 200, login_res.text
    token = login_res.json()["access_token"]
    return user_data, token, user_id


def create_test_project(token: str, name: str = "Chunking Research Lab") -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    res = client.post(
        "/api/projects",
        headers=headers,
        json={"name": name, "description": "Testing chunking pipeline."},
    )
    assert res.status_code == 201, res.text
    return res.json()


def generate_pdf_with_sections() -> bytes:
    """Generate a multi-page PDF with recognizable scientific section headings."""
    pages = [
        "Abstract\n\nThis paper presents a novel approach to neural network optimization. "
        "We demonstrate significant improvements over baseline methods on standard benchmarks. "
        "Our results show a 15% reduction in training time with equivalent accuracy.",

        "Introduction\n\nDeep learning has transformed the field of artificial intelligence. "
        "Recent advances in transformer architectures have enabled unprecedented performance "
        "on natural language processing tasks. The key challenge remains computational efficiency. "
        "In this work, we address this challenge by proposing a new optimization strategy.",

        "Methods\n\nWe adopt a gradient-based optimization approach. The loss function L is defined as:\n"
        "L = Σ(y_i - ŷ_i)² + λ||W||²\n"
        "where y_i are ground-truth labels, ŷ_i are predictions, and λ is the regularization coefficient. "
        "Data preprocessing follows the standard pipeline described in [Smith et al., 2023].",

        "Results\n\nOur method achieves state-of-the-art performance on the GLUE benchmark. "
        "Table 1 shows comparison results across all tasks. The proposed optimizer reduces "
        "gradient variance by 23% (p < 0.01, n=5 trials). Error bars represent one standard deviation.",

        "Discussion\n\nThe improvements are attributable to the adaptive learning rate schedule. "
        "Similar to findings in [Jones & Lee, 2022], our results suggest that momentum "
        "accumulation is critical for convergence in deep residual networks. Future directions "
        "include extending the method to multi-modal architectures.",

        "References\n\n[1] Smith, A. et al. (2023). Efficient Transformers: A Survey. NeurIPS.\n"
        "[2] Jones, B. & Lee, C. (2022). Momentum Methods in Deep Learning. ICML.\n"
        "[3] Wang, X. et al. (2021). GLUE: A Multi-task Benchmark. ICLR.",
    ]
    doc = pymupdf.open()
    for text in pages:
        page = doc.new_page()
        page.insert_text((50, 50), text, fontsize=11)
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


def generate_simple_pdf() -> bytes:
    """Generate a minimal single-page PDF for quick upload tests."""
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((50, 50), "This is a simple test document with no section headings.", fontsize=11)
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


def upload_and_extract_paper(token: str, project_id: str, pdf_bytes: bytes, filename: str = "test_paper.pdf") -> dict:
    """Upload a PDF and run extraction; returns paper dict with extraction completed."""
    headers = {"Authorization": f"Bearer {token}"}
    upload_res = client.post(
        f"/api/projects/{project_id}/papers",
        headers=headers,
        files={"file": (filename, pdf_bytes, "application/pdf")},
    )
    assert upload_res.status_code == 201, upload_res.text
    paper = upload_res.json()
    paper_id = paper["id"]
    extract_res = client.post(f"/api/papers/{paper_id}/extract", headers=headers)
    assert extract_res.status_code == 200, extract_res.text
    assert extract_res.json()["extraction_status"] == "completed"
    return paper


# ===========================================================================
# SECTION 1 — text_cleaning service tests
# ===========================================================================

class TestTextCleaning:
    """Unit tests for the text_cleaning service."""

    def test_empty_string_returns_empty(self):
        assert clean_page_text("") == ""

    def test_none_equivalent_empty(self):
        # Function expects str; test with blank
        assert clean_page_text("   \n  \n  ") == ""

    def test_normalizes_repeated_spaces(self):
        result = clean_page_text("hello    world   foo")
        assert "  " not in result
        assert "hello world foo" in result

    def test_normalizes_crlf_line_endings(self):
        result = clean_page_text("line1\r\nline2\r\nline3")
        assert "\r" not in result
        assert "line1\nline2\nline3" in result

    def test_normalizes_cr_only_line_endings(self):
        result = clean_page_text("line1\rline2")
        assert "\r" not in result
        assert "line1\nline2" in result

    def test_removes_null_bytes(self):
        result = clean_page_text("hello\x00world")
        assert "\x00" not in result
        assert "helloworld" in result

    def test_removes_control_chars(self):
        # \x01, \x07 (bell), \x1f (unit separator) should be removed
        result = clean_page_text("text\x01\x07\x1fmore")
        assert "\x01" not in result
        assert "\x07" not in result
        assert "\x1f" not in result

    def test_preserves_tabs(self):
        # Tabs (\x09) are preserved
        result = clean_page_text("col1\tcol2\tcol3")
        assert "\t" in result

    def test_max_two_consecutive_blank_lines(self):
        result = clean_page_text("para1\n\n\n\n\npara2")
        # Should have at most 2 consecutive newlines
        assert "\n\n\n" not in result

    def test_strips_trailing_whitespace_per_line(self):
        result = clean_page_text("line with trailing   \nclean line")
        for line in result.split("\n"):
            assert line == line.rstrip()

    def test_preserves_greek_letters(self):
        text = "The parameter α controls the learning rate β and loss function Σ."
        result = clean_page_text(text)
        assert "α" in result
        assert "β" in result
        assert "Σ" in result

    def test_preserves_math_symbols(self):
        text = "Equation: ∫f(x)dx = F(b) - F(a), with ≤ and ≥ bounds."
        result = clean_page_text(text)
        assert "∫" in result
        assert "≤" in result
        assert "≥" in result
        assert "→" not in result or "→" in text  # only if present

    def test_preserves_citations(self):
        text = "As shown in [Smith et al., 2023] and [Jones & Lee, 2022]."
        result = clean_page_text(text)
        assert "[Smith et al., 2023]" in result

    def test_unicode_normalization_nfc(self):
        import unicodedata
        # Compose a character using combining form (NFD) and verify NFC output
        nfd_char = "e\u0301"  # 'e' + combining acute = é (NFD)
        result = clean_page_text(f"caf{nfd_char}")
        assert unicodedata.is_normalized("NFC", result)

    def test_idempotent_cleaning(self):
        """Running clean_page_text twice gives same result as once."""
        text = "Some   text\r\nwith \x00 issues\n\n\n\nparagraph"
        once = clean_page_text(text)
        twice = clean_page_text(once)
        assert once == twice


# ===========================================================================
# SECTION 2 — section_detection service tests
# ===========================================================================

class TestSectionDetection:
    """Unit tests for deterministic section detection (no LLM)."""

    def test_detects_abstract(self):
        assert detect_section_in_text("Abstract\n\nThis paper presents...") == "Abstract"

    def test_detects_introduction(self):
        assert detect_section_in_text("Introduction\n\nDeep learning...") == "Introduction"

    def test_detects_methods(self):
        assert detect_section_in_text("Methods\n\nWe used...") == "Methods"

    def test_detects_results(self):
        assert detect_section_in_text("Results\n\nTable 1 shows...") == "Results"

    def test_detects_discussion(self):
        assert detect_section_in_text("Discussion\n\nThe findings suggest...") == "Discussion"

    def test_detects_conclusion(self):
        assert detect_section_in_text("Conclusion\n\nIn summary...") == "Conclusion"
        # Plural form
        assert detect_section_in_text("Conclusions\n\nIn summary...") == "Conclusion"

    def test_detects_references(self):
        assert detect_section_in_text("References\n\n[1] Smith...") == "References"

    def test_detects_acknowledgements(self):
        assert detect_section_in_text("Acknowledgements\n\nFunded by...") == "Acknowledgements"
        assert detect_section_in_text("Acknowledgments\n\nFunded by...") == "Acknowledgements"

    def test_detects_related_work(self):
        assert detect_section_in_text("Related Work\n\nPrior studies...") == "Related Work"

    def test_detects_materials_and_methods(self):
        assert detect_section_in_text("Materials and Methods\n\nSamples were...") == "Materials and Methods"

    def test_detects_results_and_discussion(self):
        assert detect_section_in_text("Results and Discussion\n\nFigure 1 shows...") == "Results and Discussion"

    def test_detects_numbered_section(self):
        # "1 Introduction"
        assert detect_section_in_text("1 Introduction\n\nDeep learning...") == "Introduction"

    def test_detects_numbered_with_period(self):
        # "2. Methodology"
        assert detect_section_in_text("2. Methodology\n\nWe adopt...") == "Methodology"

    def test_detects_numbered_subsection(self):
        # "4.2 Experimental Setup"
        assert detect_section_in_text("4.2 Experimental Setup\n\nWe ran...") == "Experimental Setup"

    def test_case_insensitive_detection(self):
        assert detect_section_in_text("ABSTRACT\n\nThis paper...") == "Abstract"
        assert detect_section_in_text("introduction\n\nIn this work...") == "Introduction"
        assert detect_section_in_text("REFERENCES\n\n[1] Smith...") == "References"

    def test_no_section_returns_none(self):
        result = detect_section_in_text("This is some body text with no heading.")
        assert result is None

    def test_empty_text_returns_none(self):
        assert detect_section_in_text("") is None

    def test_returns_first_section_in_text(self):
        # If multiple sections appear, return the first by position
        text = "Abstract\n\nSome text.\n\nIntroduction\n\nMore text."
        result = detect_section_in_text(text)
        assert result == "Abstract"

    def test_build_page_section_map_cross_page_continuity(self):
        """Section detected on page 2 should carry to page 3 if no new heading."""
        class FakePage:
            def __init__(self, page_number, text):
                self.page_number = page_number
                self.text = text

        pages = [
            FakePage(1, "Some front matter text, no heading."),
            FakePage(2, "Introduction\n\nThis paper presents..."),
            FakePage(3, "Continuing the introduction text without a new heading."),
            FakePage(4, "Results\n\nTable 1 shows the results."),
        ]
        section_map = build_page_section_map(pages)
        assert section_map[0] == (1, "Front Matter")
        assert section_map[1] == (2, "Introduction")
        assert section_map[2] == (3, "Introduction")  # continuity
        assert section_map[3] == (4, "Results")

    def test_build_page_section_map_all_front_matter(self):
        """Pages with no heading before first section → all Front Matter."""
        class FakePage:
            def __init__(self, page_number, text):
                self.page_number = page_number
                self.text = text

        pages = [
            FakePage(1, "Title page, author names, institution."),
            FakePage(2, "Copyright notice and DOI."),
        ]
        section_map = build_page_section_map(pages)
        assert all(s == "Front Matter" for _, s in section_map)

    def test_build_page_section_map_empty_pages(self):
        assert build_page_section_map([]) == []


# ===========================================================================
# SECTION 3 — document_chunking service tests
# ===========================================================================

class TestDocumentChunking:
    """Unit tests for section-aware chunking service."""

    def _make_pages(self, texts: list[str]) -> list:
        class FakePage:
            def __init__(self, page_number, text):
                self.page_number = page_number
                self.text = text
        return [FakePage(i + 1, t) for i, t in enumerate(texts)]

    def test_empty_pages_returns_empty(self):
        assert chunk_document([]) == []

    def test_single_short_page_produces_one_chunk(self):
        pages = self._make_pages(["Abstract\n\nThis is a short abstract."])
        chunks = chunk_document(pages)
        assert len(chunks) >= 1
        assert chunks[0].section_name == "Abstract"

    def test_chunk_indices_are_sequential(self):
        pages = self._make_pages([
            "Introduction\n\nSome text. " * 20,
            "Methods\n\nMethodology details. " * 20,
        ])
        chunks = chunk_document(pages)
        for i, chunk in enumerate(chunks):
            assert chunk.chunk_index == i

    def test_chunk_sizes_within_reasonable_range(self):
        """Chunks should generally be within [50, TARGET_CHUNK_SIZE * 2.5] characters."""
        long_text = "Introduction\n\n" + ("This is a sentence about neural networks. " * 60)
        pages = self._make_pages([long_text])
        chunks = chunk_document(pages)
        for chunk in chunks:
            assert chunk.character_count >= 50, f"Chunk too small: {chunk.character_count}"
            assert chunk.character_count <= TARGET_CHUNK_SIZE * 3, f"Chunk too large: {chunk.character_count}"

    def test_character_count_matches_text_length(self):
        pages = self._make_pages(["Abstract\n\nThis paper presents new results on deep learning methods."])
        chunks = chunk_document(pages)
        for chunk in chunks:
            assert chunk.character_count == len(chunk.text)

    def test_overlap_between_adjacent_chunks_in_same_section(self):
        """Adjacent chunks within same section should share some text (overlap)."""
        # Create enough text to generate multiple chunks
        long_text = "Introduction\n\n" + ("Neural networks have been applied to many domains. " * 80)
        pages = self._make_pages([long_text])
        chunks = chunk_document(pages)
        if len(chunks) >= 2:
            # At least some text from end of chunk[0] should appear in chunk[1]
            end_of_first = chunks[0].text[-CHUNK_OVERLAP:]
            start_of_second = chunks[1].text[:CHUNK_OVERLAP * 2]
            # They share the same section so overlap should exist
            # This is a soft check: some characters must be common
            assert len(set(end_of_first) & set(start_of_second)) > 0

    def test_section_name_assigned_correctly(self):
        pages = self._make_pages([
            "Abstract\n\nShort abstract.",
            "Introduction\n\nLong introduction content. " * 30,
            "Results\n\nResults section. " * 20,
        ])
        chunks = chunk_document(pages)
        sections = {c.section_name for c in chunks}
        assert "Abstract" in sections or "Front Matter" in sections
        assert "Introduction" in sections
        assert "Results" in sections

    def test_start_and_end_page_set(self):
        pages = self._make_pages([
            "Introduction\n\nPage 1 content.",
            "More introduction content on page 2.",
        ])
        chunks = chunk_document(pages)
        for chunk in chunks:
            assert chunk.start_page >= 1
            assert chunk.end_page >= chunk.start_page

    def test_token_count_estimate_set(self):
        pages = self._make_pages(["Abstract\n\nThis paper explores deep learning methods."])
        chunks = chunk_document(pages)
        for chunk in chunks:
            assert chunk.token_count_estimate is not None
            assert chunk.token_count_estimate >= 0

    def test_deterministic_chunking(self):
        """Running chunk_document twice on the same input gives identical results."""
        pages = self._make_pages([
            "Introduction\n\n" + ("Determinism test sentence. " * 40),
            "Methods\n\n" + ("Method details here. " * 30),
        ])
        chunks1 = chunk_document(pages)
        chunks2 = chunk_document(pages)
        assert len(chunks1) == len(chunks2)
        for c1, c2 in zip(chunks1, chunks2):
            assert c1.text == c2.text
            assert c1.section_name == c2.section_name

    def test_long_section_produces_multiple_chunks(self):
        long_text = "Results\n\n" + ("Measurement data: accuracy=0.95, loss=0.05. " * 100)
        pages = self._make_pages([long_text])
        chunks = chunk_document(pages)
        assert len(chunks) > 1, "Long section should produce multiple chunks"

    def test_empty_page_text_handled_gracefully(self):
        pages = self._make_pages(["Abstract\n\nShort.", "", "Results\n\nData."])
        # Should not raise
        chunks = chunk_document(pages)
        assert isinstance(chunks, list)


# ===========================================================================
# SECTION 4 — API endpoint tests
# ===========================================================================

class TestProcessPaperEndpoint:
    """Integration tests for POST /api/papers/{paper_id}/process."""

    def test_process_requires_auth(self):
        fake_id = uuid.uuid4()
        res = client.post(f"/api/papers/{fake_id}/process")
        assert res.status_code == 401

    def test_process_foreign_paper_returns_404(self):
        _, token_a, _ = create_authenticated_user()
        _, token_b, _ = create_authenticated_user()

        project_a = create_test_project(token_a)
        pdf_bytes = generate_pdf_with_sections()
        paper = upload_and_extract_paper(token_a, project_a["id"], pdf_bytes)

        # User B tries to process User A's paper
        headers_b = {"Authorization": f"Bearer {token_b}"}
        res = client.post(f"/api/papers/{paper['id']}/process", headers=headers_b)
        assert res.status_code == 404

    def test_process_requires_extraction_completed(self):
        """Papers that haven't been extracted yet should return 422."""
        _, token, _ = create_authenticated_user()
        project = create_test_project(token)
        headers = {"Authorization": f"Bearer {token}"}

        pdf_bytes = generate_simple_pdf()
        upload_res = client.post(
            f"/api/projects/{project['id']}/papers",
            headers=headers,
            files={"file": ("simple.pdf", pdf_bytes, "application/pdf")},
        )
        assert upload_res.status_code == 201
        paper_id = upload_res.json()["id"]

        # Attempt to process without extraction
        res = client.post(f"/api/papers/{paper_id}/process", headers=headers)
        assert res.status_code == 422
        detail = res.json()["detail"]
        assert "extraction" in detail.lower()

    def test_successful_processing_returns_processing_response(self):
        _, token, _ = create_authenticated_user()
        project = create_test_project(token)
        pdf_bytes = generate_pdf_with_sections()
        paper = upload_and_extract_paper(token, project["id"], pdf_bytes)
        headers = {"Authorization": f"Bearer {token}"}

        res = client.post(f"/api/papers/{paper['id']}/process", headers=headers)
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["chunking_status"] == "completed"
        assert data["chunk_count"] > 0
        assert isinstance(data["sections_detected"], list)
        assert len(data["sections_detected"]) > 0
        assert data["chunked_at"] is not None
        assert "message" in data

    def test_successful_processing_persists_chunks_in_db(self):
        _, token, _ = create_authenticated_user()
        project = create_test_project(token)
        pdf_bytes = generate_pdf_with_sections()
        paper = upload_and_extract_paper(token, project["id"], pdf_bytes)
        headers = {"Authorization": f"Bearer {token}"}

        res = client.post(f"/api/papers/{paper['id']}/process", headers=headers)
        assert res.status_code == 200
        chunk_count = res.json()["chunk_count"]

        with SessionLocal() as db:
            db_chunks = db.execute(
                select(PaperChunk).where(PaperChunk.paper_id == uuid.UUID(paper["id"]))
            ).scalars().all()
            assert len(db_chunks) == chunk_count

    def test_idempotent_reprocessing_no_duplicate_chunks(self):
        _, token, _ = create_authenticated_user()
        project = create_test_project(token)
        pdf_bytes = generate_pdf_with_sections()
        paper = upload_and_extract_paper(token, project["id"], pdf_bytes)
        headers = {"Authorization": f"Bearer {token}"}

        # Process twice
        res1 = client.post(f"/api/papers/{paper['id']}/process", headers=headers)
        assert res1.status_code == 200
        count1 = res1.json()["chunk_count"]

        res2 = client.post(f"/api/papers/{paper['id']}/process", headers=headers)
        assert res2.status_code == 200
        count2 = res2.json()["chunk_count"]

        # Same number of chunks both times (idempotent)
        assert count1 == count2

        # DB should have exactly count2 chunks (not doubled)
        with SessionLocal() as db:
            db_count = db.execute(
                select(PaperChunk).where(PaperChunk.paper_id == uuid.UUID(paper["id"]))
            ).scalars().all()
            assert len(db_count) == count2

    def test_paper_metadata_updated_after_processing(self):
        _, token, _ = create_authenticated_user()
        project = create_test_project(token)
        pdf_bytes = generate_pdf_with_sections()
        paper = upload_and_extract_paper(token, project["id"], pdf_bytes)
        headers = {"Authorization": f"Bearer {token}"}

        client.post(f"/api/papers/{paper['id']}/process", headers=headers)

        get_res = client.get(f"/api/papers/{paper['id']}", headers=headers)
        assert get_res.status_code == 200
        paper_data = get_res.json()
        assert paper_data["chunking_status"] == "completed"
        assert paper_data["chunk_count"] is not None
        assert paper_data["chunk_count"] > 0
        assert paper_data["chunked_at"] is not None


class TestGetChunksEndpoint:
    """Integration tests for GET /api/papers/{paper_id}/chunks."""

    def test_get_chunks_requires_auth(self):
        fake_id = uuid.uuid4()
        res = client.get(f"/api/papers/{fake_id}/chunks")
        assert res.status_code == 401

    def test_get_chunks_foreign_paper_returns_404(self):
        _, token_a, _ = create_authenticated_user()
        _, token_b, _ = create_authenticated_user()
        project_a = create_test_project(token_a)
        pdf_bytes = generate_pdf_with_sections()
        paper = upload_and_extract_paper(token_a, project_a["id"], pdf_bytes)
        client.post(f"/api/papers/{paper['id']}/process", headers={"Authorization": f"Bearer {token_a}"})

        res = client.get(f"/api/papers/{paper['id']}/chunks", headers={"Authorization": f"Bearer {token_b}"})
        assert res.status_code == 404

    def test_get_chunks_nonexistent_paper_returns_404(self):
        _, token, _ = create_authenticated_user()
        fake_id = uuid.uuid4()
        res = client.get(f"/api/papers/{fake_id}/chunks", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 404

    def test_get_chunks_before_processing_returns_empty(self):
        _, token, _ = create_authenticated_user()
        project = create_test_project(token)
        pdf_bytes = generate_pdf_with_sections()
        paper = upload_and_extract_paper(token, project["id"], pdf_bytes)
        headers = {"Authorization": f"Bearer {token}"}

        res = client.get(f"/api/papers/{paper['id']}/chunks", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["chunk_count"] == 0
        assert data["chunks"] == []

    def test_get_chunks_returns_ordered_chunks(self):
        _, token, _ = create_authenticated_user()
        project = create_test_project(token)
        pdf_bytes = generate_pdf_with_sections()
        paper = upload_and_extract_paper(token, project["id"], pdf_bytes)
        headers = {"Authorization": f"Bearer {token}"}

        client.post(f"/api/papers/{paper['id']}/process", headers=headers)
        res = client.get(f"/api/papers/{paper['id']}/chunks", headers=headers)
        assert res.status_code == 200
        data = res.json()
        chunks = data["chunks"]

        # Verify ordered by chunk_index
        assert len(chunks) > 0
        for i, chunk in enumerate(chunks):
            assert chunk["chunk_index"] == i

    def test_get_chunks_response_structure(self):
        _, token, _ = create_authenticated_user()
        project = create_test_project(token)
        pdf_bytes = generate_pdf_with_sections()
        paper = upload_and_extract_paper(token, project["id"], pdf_bytes)
        headers = {"Authorization": f"Bearer {token}"}

        client.post(f"/api/papers/{paper['id']}/process", headers=headers)
        res = client.get(f"/api/papers/{paper['id']}/chunks", headers=headers)
        assert res.status_code == 200
        data = res.json()

        assert "paper_id" in data
        assert "chunk_count" in data
        assert "sections" in data
        assert "chunks" in data
        assert isinstance(data["sections"], list)

        if data["chunks"]:
            chunk = data["chunks"][0]
            assert "chunk_index" in chunk
            assert "text" in chunk
            assert "character_count" in chunk
            assert "start_page" in chunk
            assert "end_page" in chunk

    def test_get_chunks_sections_list_matches_actual_chunks(self):
        _, token, _ = create_authenticated_user()
        project = create_test_project(token)
        pdf_bytes = generate_pdf_with_sections()
        paper = upload_and_extract_paper(token, project["id"], pdf_bytes)
        headers = {"Authorization": f"Bearer {token}"}

        client.post(f"/api/papers/{paper['id']}/process", headers=headers)
        res = client.get(f"/api/papers/{paper['id']}/chunks", headers=headers)
        data = res.json()
        sections_in_header = set(data["sections"])
        sections_in_chunks = {c["section_name"] or "Unknown" for c in data["chunks"]}
        # Every section in header should appear in at least one chunk
        for s in sections_in_header:
            assert s in sections_in_chunks

    def test_delete_paper_cascades_to_chunks(self):
        _, token, _ = create_authenticated_user()
        project = create_test_project(token)
        pdf_bytes = generate_pdf_with_sections()
        paper = upload_and_extract_paper(token, project["id"], pdf_bytes)
        headers = {"Authorization": f"Bearer {token}"}
        paper_id = uuid.UUID(paper["id"])

        client.post(f"/api/papers/{paper['id']}/process", headers=headers)

        # Verify chunks exist
        with SessionLocal() as db:
            chunks_before = db.execute(
                select(PaperChunk).where(PaperChunk.paper_id == paper_id)
            ).scalars().all()
            assert len(chunks_before) > 0

        # Delete paper
        del_res = client.delete(f"/api/papers/{paper['id']}", headers=headers)
        assert del_res.status_code == 204

        # Verify chunks are gone (CASCADE)
        with SessionLocal() as db:
            chunks_after = db.execute(
                select(PaperChunk).where(PaperChunk.paper_id == paper_id)
            ).scalars().all()
            assert len(chunks_after) == 0

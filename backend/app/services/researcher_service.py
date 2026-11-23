"""Researcher Discovery and Collaboration suggestion service."""
import logging
import uuid
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from app.models.paper import Paper
from app.models.paper_graph import PaperGraph
from app.models.project import Project
from app.schemas.researcher import (
    COLLABORATION_CAUTION_NOTICE,
    ResearcherDiscoveryResponse,
    ResearcherPaperBrief,
    ResearcherProfile,
)
from app.services.neo4j_service import neo4j_service

logger = logging.getLogger(__name__)


class ResearcherDiscoveryService:
    """Discovers researchers and potential collaboration matches strictly within the user's corpus."""

    def discover_researchers(
        self,
        user_id: uuid.UUID,
        project_id: Optional[uuid.UUID],
        db: Session,
    ) -> ResearcherDiscoveryResponse:
        """Extracts authors and synthesizes conservative collaboration rationales from the corpus."""
        # 1. Fetch user's papers and projects
        query = db.query(Paper).filter(Paper.user_id == user_id)
        if project_id:
            query = query.filter(Paper.project_id == project_id)
        papers = query.all()

        if not papers:
            return ResearcherDiscoveryResponse(
                total_researchers=0,
                researchers=[],
                message="No research papers available in your corpus to discover researchers.",
            )

        paper_map = {p.id: p for p in papers}
        user_projects = {p.id: p.name for p in db.query(Project).filter(Project.user_id == user_id).all()}
        allowed_paper_ids = [str(p.id) for p in papers]

        # 2. Extract Authors and Subgraphs from Neo4j
        raw_researchers = []
        try:
            if neo4j_service.is_available():
                raw_researchers = neo4j_service.get_corpus_researchers(allowed_paper_ids)
        except Exception as exc:
            logger.warning("Neo4j author discovery failed, falling back to PostgreSQL graphs: %s", exc)

        # 3. Fallback to PostgreSQL paper_graphs if Neo4j is offline or empty
        if not raw_researchers:
            pg_graphs = (
                db.query(PaperGraph)
                .filter(PaperGraph.paper_id.in_([p.id for p in papers]))
                .all()
            )
            author_dict: Dict[str, Dict[str, Any]] = {}
            for pg in pg_graphs:
                gdata = pg.graph_data or {}
                nodes = gdata.get("nodes", [])
                edges = gdata.get("edges", [])

                authors = [n for n in nodes if n.get("label") == "Author"]
                topics = [n.get("name") for n in nodes if n.get("label") == "Topic" and n.get("name")]
                methods = [n.get("name") for n in nodes if n.get("label") == "Method" and n.get("name")]

                for a in authors:
                    aid = a.get("id") or a.get("name")
                    aname = a.get("name")
                    if not aname:
                        continue
                    if aid not in author_dict:
                        author_dict[aid] = {
                            "author_id": aid,
                            "name": aname,
                            "paper_ids": [],
                            "paper_titles": [],
                            "topics": set(),
                            "methods": set(),
                        }
                    if str(pg.paper_id) not in author_dict[aid]["paper_ids"]:
                        author_dict[aid]["paper_ids"].append(str(pg.paper_id))
                        p_obj = paper_map.get(pg.paper_id)
                        author_dict[aid]["paper_titles"].append(p_obj.title if p_obj else "Research Paper")
                    author_dict[aid]["topics"].update(topics)
                    author_dict[aid]["methods"].update(methods)

            raw_researchers = [
                {
                    "author_id": v["author_id"],
                    "name": v["name"],
                    "paper_ids": v["paper_ids"],
                    "paper_titles": v["paper_titles"],
                    "topics": list(v["topics"]),
                    "methods": list(v["methods"]),
                }
                for v in author_dict.values()
            ]

        if not raw_researchers:
            return ResearcherDiscoveryResponse(
                total_researchers=0,
                researchers=[],
                message="No author entities extracted in your corpus yet. Generate Knowledge Graphs for your papers first.",
            )

        # 4. Formulate Researcher Profiles & Conservative Collaboration Matches
        researchers_list: List[ResearcherProfile] = []

        for r in raw_researchers:
            r_paper_ids = [uuid.UUID(pid) for pid in r["paper_ids"] if pid in [str(p.id) for p in papers]]
            if not r_paper_ids:
                continue

            paper_briefs = []
            for pid in r_paper_ids:
                p_obj = paper_map.get(pid)
                if p_obj:
                    paper_briefs.append(
                        ResearcherPaperBrief(
                            paper_id=p_obj.id,
                            paper_title=p_obj.title,
                            project_id=p_obj.project_id,
                            project_name=user_projects.get(p_obj.project_id, "Research Project"),
                        )
                    )

            topics = r.get("topics", [])
            methods = r.get("methods", [])

            # Compute conservative relevance score
            relevance = min(1.0, 0.45 + (0.15 * len(paper_briefs)) + (0.05 * len(topics)) + (0.05 * len(methods)))
            relevance_score = round(relevance, 2)

            # Conservative collaboration explanation
            top_topics_str = ", ".join(topics[:2]) if topics else "shared research domains"
            top_methods_str = ", ".join(methods[:2]) if methods else "applicable methodologies"

            explanation = (
                f"Potential collaboration match: Has investigated {top_topics_str} "
                f"using {top_methods_str} across {len(paper_briefs)} publication(s) in your corpus. "
                f"Could provide valuable domain and experimental alignment for related research questions."
            )

            researchers_list.append(
                ResearcherProfile(
                    author_id=r["author_id"],
                    name=r["name"],
                    papers_count=len(paper_briefs),
                    papers=paper_briefs,
                    topics=topics,
                    methods=methods,
                    relevance_score=relevance_score,
                    match_label="Potential Collaboration Match",
                    collaboration_explanation=explanation,
                )
            )

        # Sort descending by relevance score
        researchers_list.sort(key=lambda x: (x.relevance_score, x.papers_count), reverse=True)

        return ResearcherDiscoveryResponse(
            total_researchers=len(researchers_list),
            researchers=researchers_list,
            caution_notice=COLLABORATION_CAUTION_NOTICE,
        )

    def get_researcher_profile(
        self,
        user_id: uuid.UUID,
        author_id: str,
        db: Session,
    ) -> Optional[ResearcherProfile]:
        """Retrieves profile of a specific author discovered in the user's corpus."""
        all_res = self.discover_researchers(user_id=user_id, project_id=None, db=db)
        for r in all_res.researchers:
            if r.author_id == author_id:
                return r
        return None


researcher_discovery_service = ResearcherDiscoveryService()

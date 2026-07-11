"""Stage 4 — Neural Match via ChromaDB semantic search (SS-020).

Final fallback that catches thematic/conceptual references the lexical stages
miss, by embedding the sentence and querying a ChromaDB vector store of KJV
verses for nearest neighbours (cosine).

EMBEDDINGS: the real embedder is sentence-transformers `all-MiniLM-L6-v2`
(pulls torch, ~500 MB). Not downloaded this session — a deterministic
feature-hashing MockEmbedder is used so the pipeline flow works end-to-end.

--- To enable real embeddings ------------------------------------------------
  1. pip install sentence-transformers
  2. python scripts/build_embeddings.py   # (re)builds the vector store
  SentenceTransformerEmbedder is selected automatically when importable.
-----------------------------------------------------------------------------
"""

from __future__ import annotations

import hashlib
import logging
import os

from database import get_connection

from .text_utils import content_words

logger = logging.getLogger("sermonsync.matching.semantic")

EMBED_DIM = 384  # matches all-MiniLM-L6-v2
COLLECTION = "kjv_verses"
DEFAULT_PERSIST_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "chroma")


class MockEmbedder:
    """Deterministic feature-hashing embedder (lexical proxy, no model)."""

    is_mock = True
    dim = EMBED_DIM

    def embed(self, texts: list[str]) -> list[list[float]]:
        out = []
        for text in texts:
            vec = [0.0] * self.dim
            for word in content_words(text):
                h = int(hashlib.md5(word.encode()).hexdigest(), 16)
                vec[h % self.dim] += 1.0
                # a signed second hash reduces collisions
                vec[(h // self.dim) % self.dim] += 0.5
            norm = sum(v * v for v in vec) ** 0.5 or 1.0
            out.append([v / norm for v in vec])
        return out


class SentenceTransformerEmbedder:
    is_mock = False

    def __init__(self, model_name: str = "all-MiniLM-L6-v2") -> None:
        from sentence_transformers import SentenceTransformer

        self._model = SentenceTransformer(model_name)
        self.dim = self._model.get_sentence_embedding_dimension()

    def embed(self, texts: list[str]) -> list[list[float]]:
        return self._model.encode(texts, normalize_embeddings=True).tolist()


def default_embedder():
    try:
        import sentence_transformers  # noqa: F401

        return SentenceTransformerEmbedder()
    except Exception as exc:
        logger.info("using MockEmbedder (%s)", exc)
        return MockEmbedder()


class SemanticMatcher:
    stage = 4

    def __init__(self, embedder=None, client=None, persist_dir: str | None = None) -> None:
        self.embedder = embedder or default_embedder()
        self._client = client
        self._persist_dir = persist_dir if persist_dir is not None else DEFAULT_PERSIST_DIR
        self._collection = None

    def _get_client(self):
        if self._client is None:
            import chromadb

            os.makedirs(self._persist_dir, exist_ok=True)
            self._client = chromadb.PersistentClient(path=self._persist_dir)
        return self._client

    def _get_collection(self):
        if self._collection is None:
            client = self._get_client()
            self._collection = client.get_or_create_collection(
                name=COLLECTION, metadata={"hnsw:space": "cosine"}
            )
        return self._collection

    def count(self) -> int:
        return self._get_collection().count()

    def build_index(self, version: str = "KJV", limit: int | None = None, batch: int = 512) -> int:
        """Embed KJV verses and populate the ChromaDB collection."""
        conn = get_connection()
        try:
            vid = conn.execute(
                "SELECT id FROM versions WHERE abbreviation = ? COLLATE NOCASE",
                (version,),
            ).fetchone()
            q = """
                SELECT b.name, ch.number, v.verse_number, v.text
                FROM verses v
                JOIN chapters ch ON v.chapter_id = ch.id
                JOIN books b ON ch.book_id = b.id
                WHERE v.version_id = ?
                ORDER BY b.position, ch.number, v.verse_number
            """
            rows = conn.execute(q, (vid["id"],)).fetchall()
        finally:
            conn.close()
        if limit:
            rows = rows[:limit]

        collection = self._get_collection()
        added = 0
        for i in range(0, len(rows), batch):
            chunk = rows[i : i + batch]
            docs = [r[3] for r in chunk]
            ids = [f"{r[0]}|{r[1]}|{r[2]}" for r in chunk]
            metas = [
                {"book": r[0], "chapter": r[1], "verse": r[2], "text": r[3]}
                for r in chunk
            ]
            embeddings = self.embedder.embed(docs)
            collection.add(ids=ids, embeddings=embeddings, metadatas=metas, documents=docs)
            added += len(chunk)
        logger.info("semantic index built: %d verses (%s embedder)",
                    added, "mock" if getattr(self.embedder, "is_mock", False) else "real")
        return added

    def ensure_index(self) -> None:
        if self.count() == 0:
            logger.info("semantic index empty — building (first use)")
            self.build_index()

    def match(self, sentence: str, k: int = 5, min_confidence: float = 0.0) -> list[dict]:
        self.ensure_index()
        collection = self._get_collection()
        vec = self.embedder.embed([sentence])[0]
        res = collection.query(query_embeddings=[vec], n_results=k)
        metas = res.get("metadatas", [[]])[0]
        distances = res.get("distances", [[]])[0]
        results = []
        for meta, dist in zip(metas, distances):
            similarity = round(max(0.0, 1.0 - float(dist)), 4)
            if similarity < min_confidence:
                continue
            results.append(
                {
                    "book": meta["book"],
                    "chapter": meta["chapter"],
                    "verse": meta["verse"],
                    "version": "KJV",
                    "reference": f"{meta['book']} {meta['chapter']}:{meta['verse']}",
                    "text": meta["text"],
                    "confidence": similarity,
                    "stage": self.stage,
                }
            )
        return results


_matcher = None


def get_matcher() -> SemanticMatcher:
    global _matcher
    if _matcher is None:
        _matcher = SemanticMatcher()
    return _matcher


def set_matcher(matcher) -> None:
    global _matcher
    _matcher = matcher

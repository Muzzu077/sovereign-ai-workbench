"""Tests for app.documents.store and app.documents.persistence."""

import pytest

from app.documents.persistence import DocumentMetadataStore
from app.documents.store import DocumentStore


@pytest.fixture()
def meta_store(tmp_path):
    """Create a DocumentMetadataStore backed by a temp SQLite DB."""
    db_path = tmp_path / "test_docs.db"
    store = DocumentMetadataStore(db_path=db_path)
    yield store
    store.close()


@pytest.fixture()
def doc_store(tmp_path, meta_store):
    """Create a DocumentStore with temp upload dir and metadata store."""
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    return DocumentStore(upload_dir=upload_dir, metadata_store=meta_store)


class TestDocumentStoreListing:
    """Listing documents in a fresh store."""

    def test_list_documents_empty_initially(self, doc_store):
        assert doc_store.list_documents() == []

    def test_document_count_zero_initially(self, doc_store):
        assert doc_store.document_count() == 0


class TestMetadataStoreCounts:
    """DocumentMetadataStore.document_count() on a fresh DB."""

    def test_meta_store_count_zero(self, meta_store):
        assert meta_store.document_count() == 0

    def test_meta_store_list_empty(self, meta_store):
        assert meta_store.list_documents() == []

"""
Files API routes stub.

Will expose endpoints for uploading, listing, and managing
local files and documents. Not implemented in the foundation phase.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/files", tags=["files"])


@router.get("/")
def list_files() -> dict[str, str]:
    """List uploaded files. Stub — not yet implemented."""
    return {"status": "not_implemented", "note": "File management coming in a future phase."}

"""Paper storage service abstraction for scientific PDF documents.

Manages local filesystem storage with clean abstraction designed for future
zero-downtime migration to S3/GCS object storage. Enforces strict path traversal
prevention, user/project isolation, and safe identifier generation.
"""
import uuid
from pathlib import Path
from typing import Optional, BinaryIO
from app.core.config import settings


class StorageSecurityError(Exception):
    """Raised when a path traversal or security violation is detected."""
    pass


class PaperStorageService:
    def __init__(self, root_dir: Optional[Path] = None):
        self._root = (root_dir or settings.storage_path).resolve()
        self._root.mkdir(parents=True, exist_ok=True)

    @property
    def root_directory(self) -> Path:
        return self._root

    def _resolve_safe_path(self, storage_key: str) -> Path:
        """Resolves a storage key and verifies it does not escape the storage root."""
        # Clean relative path
        norm_key = storage_key.strip().replace("\\", "/").lstrip("/")
        if ".." in norm_key.split("/"):
            raise StorageSecurityError("Path traversal sequence detected in storage key.")

        target = (self._root / norm_key).resolve()
        try:
            target.relative_to(self._root)
        except ValueError:
            raise StorageSecurityError("Resolved storage path escapes configured root directory.")

        return target

    def save(
        self,
        file_bytes: bytes,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
    ) -> tuple[str, Path]:
        """Saves PDF file bytes under a secure user/project directory hierarchy.

        Returns:
            tuple[str, Path]: (storage_key, physical_resolved_path)
        """
        file_uuid = uuid.uuid4()
        storage_key = f"{user_id}/{project_id}/{file_uuid}.pdf"
        target_path = self._resolve_safe_path(storage_key)

        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_bytes(file_bytes)

        return storage_key, target_path

    def get_path(self, storage_key: str) -> Optional[Path]:
        """Returns the physical Path if the storage key exists and is safe, else None."""
        try:
            path = self._resolve_safe_path(storage_key)
            if path.is_file():
                return path
            return None
        except StorageSecurityError:
            return None

    def delete(self, storage_key: str) -> bool:
        """Safely removes the stored file from disk."""
        try:
            path = self._resolve_safe_path(storage_key)
            if path.is_file():
                path.unlink(missing_ok=True)
                # Attempt to clean up empty parent directories up to root
                try:
                    if path.parent != self._root and not any(path.parent.iterdir()):
                        path.parent.rmdir()
                        if path.parent.parent != self._root and not any(path.parent.parent.iterdir()):
                            path.parent.parent.rmdir()
                except OSError:
                    pass
            return True
        except Exception:
            return False

    def open(self, storage_key: str) -> BinaryIO:
        """Opens the stored file for reading in binary mode."""
        path = self._resolve_safe_path(storage_key)
        if not path.is_file():
            raise FileNotFoundError(f"Stored file '{storage_key}' not found.")
        return open(path, "rb")


# Singleton instance
paper_storage = PaperStorageService()

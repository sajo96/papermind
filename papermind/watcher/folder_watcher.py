import asyncio
import hashlib
import os
import shutil
from pathlib import Path

import httpx
from loguru import logger
from watchdog.events import FileCreatedEvent, FileSystemEventHandler
from watchdog.observers import Observer

from open_notebook.config import UPLOADS_FOLDER
from open_notebook.database.repository import ensure_record_id, repo_query
from api.routers.sources import generate_unique_filename
from papermind.models import WatchedFolder


async def get_file_md5(file_path: str) -> str:
    """Compute MD5 hash of a file."""
    loop = asyncio.get_event_loop()

    def _compute():
        hash_md5 = hashlib.md5()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()

    return await loop.run_in_executor(None, _compute)


async def check_file_stability(file_path: str, wait_time: int = 2) -> bool:
    """Wait for file size to stabilize to ensure it's fully written."""
    p = Path(file_path)
    if not p.exists():
        return False

    last_size = -1
    for _ in range(10):  # Max 10 checks
        try:
            current_size = p.stat().st_size
            if current_size == last_size and current_size > 0:
                # Stable! Wait one more sleep to be absolutely sure locks are released
                await asyncio.sleep(wait_time)
                return True
            last_size = current_size
        except OSError:
            pass
        await asyncio.sleep(wait_time)

    return False


async def ingest_pdf(pdf_path: str, notebook_id: str):
    """
    1. Compute MD5 hash of file
    2. Call the existing Open Notebook source ingestion API
    3. After ingestion completes, trigger academic parsing
    """
    logger.info(f"Checking new PDF at {pdf_path}")
    wait_time = int(os.environ.get("PAPERMIND_FILE_STABILITY_SECONDS", "2"))
    is_stable = await check_file_stability(pdf_path, wait_time=wait_time)
    if not is_stable:
        logger.warning(f"File {pdf_path} did not stabilize in time, skipping.")
        return

    md5_hash = await get_file_md5(pdf_path)
    logger.debug(f"File {pdf_path} stabilized with hash {md5_hash}")

    # Deduplicate by file hash within the same notebook.
    try:
        duplicate_result = await repo_query(
            """
            SELECT id
            FROM source
            WHERE file_hash = $file_hash
              AND id IN (SELECT VALUE in FROM reference WHERE out = $notebook_id)
            LIMIT 1
            """,
            {
                "file_hash": md5_hash,
                "notebook_id": ensure_record_id(notebook_id),
            },
        )
        if duplicate_result and len(duplicate_result) > 0:
            logger.info(
                f"Skipping duplicate PDF {pdf_path}; matching source: {duplicate_result[0].get('id')}"
            )
            return
    except Exception as e:
        logger.warning(f"Could not run dedup query for {pdf_path}: {e}")

    # Use port 5055 by default since this might run in the background worker or fastapi app
    API_BASE = os.environ.get("PAPERMIND_API_BASE", "http://localhost:5055")

    async with httpx.AsyncClient(timeout=120.0) as client:
        logger.info(f"Ingesting {pdf_path} to notebook {notebook_id} via API")

        # 0. Copy file to uploads folder so the API accepts it
        clean_name = Path(pdf_path).name
        try:
            final_path = generate_unique_filename(clean_name, UPLOADS_FOLDER)
            shutil.copy2(pdf_path, final_path)
            logger.debug(f"Copied {pdf_path} to {final_path}")
        except Exception as e:
            logger.error(f"Failed to copy {pdf_path} to {UPLOADS_FOLDER}: {e}")
            return

        # 1. Start ingestion
        payload = {
            "type": "upload",
            "file_path": str(Path(final_path).absolute()),
            "notebooks": [notebook_id],
            "embed": False,
        }
        res = await client.post(f"{API_BASE}/api/sources/json", json=payload)
        if res.status_code >= 400:
            logger.error(
                f"Failed to ingest source: HTTP {res.status_code} - {res.text}"
            )
            return

        data = res.json()
        source_id = None
        if "source" in data and data.get("source"):
            source_id = data["source"]["id"]
        elif "id" in data:
            source_id = data["id"]
        elif isinstance(data, dict) and "source_id" in data:
            source_id = data["source_id"]

        if not source_id:
            logger.error(f"Could not extract source_id from API response: {data}")
            return

        # Persist MD5 hash on source for future dedup checks.
        try:
            await repo_query(
                "UPDATE type::thing($source_id) MERGE { file_hash: $file_hash }",
                {
                    "source_id": source_id,
                    "file_hash": md5_hash,
                },
            )
        except Exception as e:
            logger.warning(f"Failed to save file_hash for source {source_id}: {e}")

        logger.info(
            f"Successfully ingested source {source_id}. Waiting for processing..."
        )

        # 2. Wait for completion
        for _ in range(60):
            await asyncio.sleep(2)
            status_res = await client.get(f"{API_BASE}/api/sources/{source_id}/status")
            if status_res.status_code == 200:
                status_data = status_res.json()
                if status_data.get("status") in ["completed", "failed", None]:
                    break

        # 3. Trigger academic parsing
        logger.info(f"Triggering academic parsing for source {source_id}...")
        parse_res = await client.post(
            f"{API_BASE}/api/papermind/parse_academic", json={"source_id": source_id}
        )
        if parse_res.status_code >= 400:
            logger.error(
                f"Failed to trigger academic parse: HTTP {parse_res.status_code} - {parse_res.text}"
            )
            return

        logger.info(f"Successfully triggered parse for {pdf_path}")


class PDFHandler(FileSystemEventHandler):
    """
    Fires when a new file is created in the watched directory.
    Only processes .pdf files.
    """

    def __init__(self, notebook_id: str, loop: asyncio.AbstractEventLoop):
        self.notebook_id = notebook_id
        self.loop = loop
        super().__init__()

    def on_created(self, event):
        if event.is_directory:
            return
        if event.src_path.lower().endswith(".pdf"):
            logger.info(f"New PDF detected: {event.src_path}")
            asyncio.run_coroutine_threadsafe(
                ingest_pdf(event.src_path, self.notebook_id), self.loop
            )


class FolderWatcher:
    """
    Manages watchdog Observers per watched folder.
    Reads WatchedFolder records from SurrealDB on startup via sync logic or triggers in FastAPI startup.
    """

    def __init__(self):
        self._observers = {}
        self._loop = None

    async def start(self):
        """Starts monitoring based on configured WatchedFolders."""
        if not os.environ.get("PAPERMIND_WATCH_ENABLED", "true").lower() in ("1", "true"):
            logger.info("FolderWatcher disabled via PAPERMIND_WATCH_ENABLED")
            return

        self._loop = asyncio.get_event_loop()
        
        # In a real SurrealDB flow we could read the WatchedFolder table on boot
        try:
            folders = await WatchedFolder.get_all()
            for folder in folders:
                if folder.active:
                    self.add_folder_watch(
                        folder.path, folder.notebook_id, folder.recursive
                    )
            logger.info(f"FolderWatcher started with {len(self._observers)} active feeds.")
        except Exception as e:
            logger.error(f"Failed to initialize folder watchers: {e}")

    def add_folder_watch(self, path: str, notebook_id: str, recursive: bool):
        if path in self._observers:
            logger.warning(f"Already watching {path}")
            return
            
        p = Path(path)
        if not p.exists():
            logger.warning(f"Watched path {path} does not exist, creating it.")
            p.mkdir(parents=True, exist_ok=True)
            
        observer = Observer()
        handler = PDFHandler(notebook_id, self._loop)
        observer.schedule(handler, path, recursive=recursive)
        observer.start()
        self._observers[path] = observer
        logger.info(f"Started watching folder: {path} for notebook: {notebook_id}")

    async def add_folder(self, path: str, notebook_id: str, recursive: bool):
        """Insert or reactivate watched folder in DB and start its observer."""
        existing = await WatchedFolder.get_all()
        for folder in existing:
            if folder.path == path:
                folder.notebook_id = notebook_id
                folder.recursive = recursive
                folder.active = True
                await folder.save()
                self.add_folder_watch(path, notebook_id, recursive)
                return folder

        folder = WatchedFolder(
            path=path,
            notebook_id=notebook_id,
            recursive=recursive,
            active=True,
        )
        await folder.save()
        self.add_folder_watch(path, notebook_id, recursive)
        return folder

    def remove_folder_watch(self, path: str):
        if path in self._observers:
            observer = self._observers.pop(path)
            observer.stop()
            observer.join()
            logger.info(f"Stopped watching folder: {path}")

    async def remove_folder(self, folder_id: str):
        """Mark watched folder inactive in DB and stop its observer."""
        folder = await WatchedFolder.get(folder_id)
        if not folder:
            return None

        self.remove_folder_watch(folder.path)
        folder.active = False
        await folder.save()
        return folder

    async def stop(self):
        """Cleanly stops all observers."""
        for path, observer in list(self._observers.items()):
            observer.stop()
            observer.join()
            logger.info(f"Stopped watching {path}")
        self._observers.clear()

watcher_instance = FolderWatcher()

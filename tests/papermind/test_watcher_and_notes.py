import asyncio
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from papermind.generators.academic_note_generator import AcademicNoteGenerator
from papermind.watcher.folder_watcher import FolderWatcher


class _FakeObserver:
    def __init__(self):
        self.scheduled = []
        self.started = False
        self.stopped = False
        self.joined = False

    def schedule(self, handler, path, recursive=False):
        self.scheduled.append((handler, path, recursive))

    def start(self):
        self.started = True

    def stop(self):
        self.stopped = True

    def join(self):
        self.joined = True


@pytest.mark.asyncio
async def test_folder_watcher_rebinds_existing_path(tmp_path):
    watcher = FolderWatcher()
    watcher._loop = asyncio.get_event_loop()

    path = str(tmp_path / "watch")
    Path(path).mkdir(parents=True, exist_ok=True)

    with patch("papermind.watcher.folder_watcher.Observer", new=_FakeObserver):
        watcher.add_folder_watch(path, "notebook:one", recursive=False)
        first_observer = watcher._observers[watcher._normalized_path(path)]

        watcher.add_folder_watch(path, "notebook:two", recursive=True)

    normalized_path = watcher._normalized_path(path)
    assert normalized_path in watcher._observers
    assert watcher._watch_configs[normalized_path] == ("notebook:two", True)
    assert first_observer.stopped is True
    assert first_observer.joined is True


@pytest.mark.asyncio
async def test_add_folder_normalizes_notebook_id_and_reuses_existing(tmp_path):
    watcher = FolderWatcher()
    watcher._loop = asyncio.get_event_loop()
    path = str(tmp_path / "watch2")

    existing_folder = SimpleNamespace(
        path=path,
        notebook_id="notebook:old",
        recursive=False,
        active=False,
        save=AsyncMock(),
    )

    with patch("papermind.watcher.folder_watcher.WatchedFolder.get_all", new_callable=AsyncMock) as get_all, patch.object(
        watcher, "add_folder_watch"
    ) as add_watch:
        get_all.return_value = [existing_folder]
        updated = await watcher.add_folder(path, "abc123", recursive=True)

    assert updated.notebook_id == "notebook:abc123"
    assert updated.recursive is True
    assert updated.active is True
    existing_folder.save.assert_awaited_once()
    add_watch.assert_called_once_with(watcher._normalized_path(path), "notebook:abc123", True)


@pytest.mark.asyncio
async def test_note_generator_resolves_notebook_from_reference_edge():
    generator = AcademicNoteGenerator()

    with patch(
        "papermind.generators.academic_note_generator.repo_query",
        new_callable=AsyncMock,
    ) as mock_repo_query:
        mock_repo_query.side_effect = [["notebook:xyz"]]
        notebook_id = await generator._resolve_notebook_id_for_source("source:1")

    assert notebook_id == "notebook:xyz"


@pytest.mark.asyncio
async def test_note_generator_resolves_notebook_from_source_field_fallback():
    generator = AcademicNoteGenerator()

    with patch(
        "papermind.generators.academic_note_generator.repo_query",
        new_callable=AsyncMock,
    ) as mock_repo_query:
        mock_repo_query.side_effect = [[], [{"notebook_id": "notebook:abc"}]]
        notebook_id = await generator._resolve_notebook_id_for_source("source:1")

    assert notebook_id == "notebook:abc"

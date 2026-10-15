"""Consistent private SQLite snapshots without changing source permissions.

Active WAL/rollback databases use SQLite's online backup API through mode=ro.
A closed WAL database with no sidecars cannot be opened on read-only media.
Only that case uses a guarded main-file copy: no WAL or rollback journal may
exist before/after, and the source identity/size/mtime/ctime must stay unchanged.
SQLite opens the copy in a private temporary directory, never the live source
with immutable=1. Missing WAL indexes and concurrent changes fail closed.
"""
from contextlib import closing, contextmanager
import os
from pathlib import Path
import sqlite3
import stat
import tempfile
import time


class SnapshotUnavailable(RuntimeError):
    """A safe snapshot could not be obtained; retain the previous public file."""


def _signature(value):
    return (value.st_dev, value.st_ino, value.st_size,
            value.st_mtime_ns, value.st_ctime_ns)


def _sidecar(path, suffix):
    return os.path.lexists(str(path) + suffix)


def _copy_bytes(source, destination, deadline):
    while True:
        if time.monotonic() >= deadline:
            raise SnapshotUnavailable('snapshot_deadline_exceeded')
        block = source.read(1024 * 1024)
        if not block:
            return
        destination.write(block)


def _closed_wal_copy(path, destination, deadline):
    """Copy only a stable, checkpointed WAL image; never omit a live WAL."""
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode):
        raise SnapshotUnavailable('source_not_regular')
    if _sidecar(path, '-wal') or _sidecar(path, '-journal'):
        raise SnapshotUnavailable('source_has_transaction_journal')
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    with os.fdopen(fd, 'rb') as source:
        if _signature(os.fstat(source.fileno())) != _signature(before):
            raise SnapshotUnavailable('source_changed_before_copy')
        header = source.read(100)
        if header[:16] != b'SQLite format 3\x00' or header[18:20] != b'\x02\x02':
            raise SnapshotUnavailable('source_not_closed_wal')
        source.seek(0)
        with destination.open('xb') as target:
            destination.chmod(0o600)
            _copy_bytes(source, target, deadline)
        after = os.fstat(source.fileno())
    if (_signature(after) != _signature(before)
            or _signature(path.lstat()) != _signature(before)
            or _sidecar(path, '-wal') or _sidecar(path, '-journal')):
        raise SnapshotUnavailable('source_changed_during_copy')


def _online_backup(path, destination, deadline):
    def progress(_status, _remaining, _total):
        if time.monotonic() >= deadline:
            raise SnapshotUnavailable('snapshot_deadline_exceeded')

    destination.touch(mode=0o600, exist_ok=False)
    with closing(sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=.1)) as source:
        source.execute('PRAGMA query_only=ON')
        # Freeze a committed read view, including frames still in the WAL.
        source.execute('BEGIN')
        source.execute('SELECT count(*) FROM sqlite_master').fetchone()
        with closing(sqlite3.connect(destination)) as target:
            source.backup(target, pages=128, progress=progress, sleep=.025)


@contextmanager
def readonly_snapshot(path, *, timeout=5):
    """Yield a read-only, consistent private copy; remove it on success/error.

    TemporaryDirectory uses 0700 permissions and the service's PrivateTmp. No
    source credentials, permissions, checkpoints, journal modes or live files change.
    A source WAL without its readable shared-memory index is not ignored.
    """
    path = Path(path).absolute()
    if not path.is_file() or path.is_symlink():
        raise SnapshotUnavailable('source_missing_or_not_regular')
    deadline = time.monotonic() + timeout
    with tempfile.TemporaryDirectory(prefix='wsli-readonly-') as scratch:
        for attempt in range(3):
            destination = Path(scratch) / f'snapshot-{attempt}.sqlite'
            try:
                if time.monotonic() >= deadline:
                    raise SnapshotUnavailable('snapshot_deadline_exceeded')
                with path.open('rb') as stream:
                    header = stream.read(100)
                if header[:16] != b'SQLite format 3\x00':
                    raise SnapshotUnavailable('invalid_sqlite_header')
                wal_mode = header[18:20] == b'\x02\x02'
                wal = _sidecar(path, '-wal')
                if wal_mode and not wal and not _sidecar(path, '-journal'):
                    _closed_wal_copy(path, destination, deadline)
                else:
                    if wal_mode and wal and not _sidecar(path, '-shm'):
                        raise SnapshotUnavailable('wal_index_unavailable')
                    _online_backup(path, destination, deadline)
                break
            except (SnapshotUnavailable, sqlite3.OperationalError, FileNotFoundError) as exc:
                if attempt == 2 or time.monotonic() >= deadline:
                    raise SnapshotUnavailable('consistent_snapshot_unavailable') from exc
                time.sleep(.025)
        # A cold WAL header can require recovery even in a writable directory.
        # Normalize only this detached copy, never checkpoint/change the source.
        with closing(sqlite3.connect(destination)) as private:
            if private.execute('PRAGMA journal_mode=DELETE').fetchone() != ('delete',):
                raise SnapshotUnavailable('private_snapshot_normalization_failed')
        with closing(sqlite3.connect(destination.as_uri() + '?mode=ro', uri=True)) as db:
            db.execute('PRAGMA query_only=ON')
            db.execute('PRAGMA trusted_schema=OFF')
            if db.execute('PRAGMA quick_check').fetchall() != [('ok',)]:
                raise SnapshotUnavailable('snapshot_integrity_check_failed')
            db.execute('BEGIN')
            yield db

import hashlib
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1] / 'scripts'))
import readonly_sqlite as reader


class ReadonlySQLiteTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root / 'source'
        self.source.mkdir()
        self.path = self.source / 'journal.sqlite'
        self.writer = None

    def tearDown(self):
        self.source.chmod(0o700)
        if self.path.exists():
            self.path.chmod(0o600)
        if self.writer:
            self.writer.close()
        self.temp.cleanup()

    def database(self, *, wal=True, live=False):
        db = sqlite3.connect(self.path)
        if wal:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('PRAGMA wal_autocheckpoint=0')
        db.execute('CREATE TABLE items(value TEXT)')
        db.execute("INSERT INTO items VALUES ('committed')")
        db.commit()
        if live:
            self.writer = db
        else:
            db.close()
            # Apple's SQLite may retain empty sidecars after a clean close.
            # Remove only these generated test artifacts, never a live WAL.
            wal_path = Path(str(self.path) + '-wal')
            if wal_path.exists() and wal_path.stat().st_size == 0:
                wal_path.unlink()
                Path(str(self.path) + '-shm').unlink(missing_ok=True)

    def fingerprint(self):
        return {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                for p in self.source.iterdir() if not p.name.endswith('-shm')}

    def test_closed_wal_without_sidecars_on_readonly_source(self):
        self.database()
        before = self.fingerprint()
        self.path.chmod(0o400)
        self.source.chmod(0o500)
        with reader.readonly_snapshot(self.path) as db:
            self.assertEqual(db.execute('SELECT value FROM items').fetchall(), [('committed',)])
            with self.assertRaises(sqlite3.OperationalError):
                db.execute("INSERT INTO items VALUES ('forbidden')")
        self.assertEqual(self.fingerprint(), before)
        self.assertEqual(sorted(p.name for p in self.source.iterdir()), ['journal.sqlite'])

    def test_active_wal_includes_committed_uncheckpointed_frames(self):
        self.database(live=True)
        self.assertTrue(Path(str(self.path) + '-wal').is_file())
        before = self.fingerprint()
        with reader.readonly_snapshot(self.path) as db:
            self.assertEqual(db.execute('SELECT value FROM items').fetchall(), [('committed',)])
        self.assertEqual(self.fingerprint(), before)

    def test_snapshot_excludes_uncommitted_data(self):
        self.database(live=True)
        self.writer.execute("INSERT INTO items VALUES ('not committed')")
        with reader.readonly_snapshot(self.path) as db:
            self.assertEqual(db.execute('SELECT value FROM items').fetchall(), [('committed',)])
        self.writer.rollback()

    def test_active_wal_readonly_directory_preserves_source(self):
        self.database(live=True)
        before = self.fingerprint()
        for file in self.source.iterdir():
            file.chmod(0o400)
        self.source.chmod(0o500)
        with reader.readonly_snapshot(self.path) as db:
            self.assertEqual(db.execute('SELECT value FROM items').fetchall(), [('committed',)])
        self.assertEqual(self.fingerprint(), before)

    def test_snapshot_stays_fixed_when_writer_commits_after_capture(self):
        self.database(live=True)
        with reader.readonly_snapshot(self.path) as db:
            self.writer.execute("INSERT INTO items VALUES ('later')")
            self.writer.commit()
            self.assertEqual(db.execute('SELECT value FROM items').fetchall(), [('committed',)])
        with reader.readonly_snapshot(self.path) as db:
            self.assertEqual(len(db.execute('SELECT value FROM items').fetchall()), 2)

    def test_rollback_journal_database_uses_backup(self):
        self.database(wal=False)
        before = self.fingerprint()
        with reader.readonly_snapshot(self.path) as db:
            self.assertEqual(db.execute('SELECT value FROM items').fetchone(), ('committed',))
        self.assertEqual(self.fingerprint(), before)

    def test_no_fallback_to_main_file_when_wal_index_unavailable(self):
        self.database(live=True)
        actual = reader._sidecar
        def missing_index(path, suffix):
            return False if suffix == '-shm' else actual(path, suffix)
        with patch.object(reader, '_sidecar', side_effect=missing_index), \
                patch.object(reader, '_closed_wal_copy') as unsafe_copy:
            with self.assertRaises(reader.SnapshotUnavailable):
                with reader.readonly_snapshot(self.path):
                    self.fail('Unindexed WAL must not be silently discarded')
            unsafe_copy.assert_not_called()

    def test_cold_copy_refuses_a_wal_appearing_mid_copy(self):
        self.database()
        copy = reader._copy_bytes
        def raced(source, target, deadline):
            copy(source, target, deadline)
            self.writer = sqlite3.connect(self.path)
            self.writer.execute("INSERT INTO items VALUES ('racing commit')")
            self.writer.commit()
        with patch.object(reader, '_copy_bytes', side_effect=raced):
            with self.assertRaises(reader.SnapshotUnavailable):
                reader._closed_wal_copy(self.path, self.root / 'copy.sqlite', time.monotonic() + 5)

    def test_cold_copy_refuses_changed_main_file(self):
        self.database()
        copy = reader._copy_bytes
        def changed(source, target, deadline):
            copy(source, target, deadline)
            stamp = self.path.stat()
            os.utime(self.path, ns=(stamp.st_atime_ns, stamp.st_mtime_ns + 1000000))
        with patch.object(reader, '_copy_bytes', side_effect=changed):
            with self.assertRaises(reader.SnapshotUnavailable):
                reader._closed_wal_copy(self.path, self.root / 'copy.sqlite', time.monotonic() + 5)

    def test_corrupt_missing_and_symlink_sources_fail_closed(self):
        with self.assertRaises(reader.SnapshotUnavailable):
            with reader.readonly_snapshot(self.path):
                pass
        self.database()
        link = self.source / 'linked.sqlite'
        link.symlink_to(self.path)
        with self.assertRaises(reader.SnapshotUnavailable):
            with reader.readonly_snapshot(link):
                pass
        self.path.write_bytes(b'not a database')
        with self.assertRaises(reader.SnapshotUnavailable):
            with reader.readonly_snapshot(self.path):
                pass

    def test_deadline_fails_closed_and_cleanup_runs_on_exception(self):
        self.database()
        with self.assertRaises(reader.SnapshotUnavailable):
            with reader.readonly_snapshot(self.path, timeout=0):
                pass
        scratch = None
        with self.assertRaises(ValueError):
            with reader.readonly_snapshot(self.path) as db:
                scratch = Path(db.execute('PRAGMA database_list').fetchone()[2]).parent
                self.assertEqual(scratch.stat().st_mode & 0o777, 0o700)
                raise ValueError('test body failure')
        self.assertFalse(scratch.exists())


if __name__ == '__main__':
    unittest.main()

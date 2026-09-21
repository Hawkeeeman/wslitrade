import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('collect_live', Path(__file__).parents[1]/'scripts/collect_live.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class SnapshotTests(unittest.TestCase):
    def run_snapshot(self, args, account_error=False):
        old = '2026-09-06T16:10:47+00:00'
        current = '2026-09-21T14:21:00+00:00'
        previous = {'updatedAt':old,'account':{'equity':'100000'},
                    'market':{'open':False},'bot':{'state':'awake','checkedAt':old}}
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)/'live.json'
            path.write_text(json.dumps(previous))
            with patch.object(collector,'OUT',path), patch.object(collector,'now_iso',return_value=current), \
                 patch('sys.argv',['collect_live.py']+args), \
                 patch.object(collector,'check_bot',return_value={'state':'awake','checkedAt':current}), \
                 patch.object(collector,'collect_account') as account, \
                 patch.object(collector,'collect_market',return_value={'open':True,'checkedAt':current}), \
                 patch.object(collector,'collect_calendar',return_value={'sessions':[]}):
                account.return_value = ({'equity':'100000','checkedAt':current},[],[])
                if account_error:
                    account.side_effect = RuntimeError('sensitive error body must not be published')
                if account_error and '--bot-only' not in args:
                    with self.assertRaises(SystemExit):
                        collector.main()
                else:
                    collector.main()
                if '--bot-only' in args:
                    account.assert_not_called()
                return json.loads(path.read_text())

    def test_bot_only_does_not_redate_balances_or_market(self):
        d = self.run_snapshot(['--bot-only'])
        self.assertEqual(d['bot']['checkedAt'],d['updatedAt'])
        self.assertEqual(d['account']['checkedAt'],'2026-09-06T16:10:47+00:00')
        self.assertFalse(d['market']['open'])

    def test_account_failure_does_not_hide_successful_clock(self):
        d = self.run_snapshot(['--skip-bot'],account_error=True)
        self.assertTrue(d['market']['open'])
        self.assertEqual(d['account']['checkedAt'],'2026-09-06T16:10:47+00:00')
        self.assertEqual(d['errors'],{'account':'RuntimeError'})
        self.assertNotIn('sensitive',json.dumps(d))

    def test_skip_bot_preserves_real_heartbeat_age(self):
        d = self.run_snapshot(['--skip-bot'])
        self.assertEqual(d['bot']['checkedAt'],'2026-09-06T16:10:47+00:00')
        self.assertEqual(d['account']['checkedAt'],d['updatedAt'])

    def test_missing_credentials_raise_catchable_exception(self):
        with patch.dict('os.environ',{},clear=True), patch.object(collector,'CREDS_PATH',Path('/nonexistent/wsli-test')):
            with self.assertRaises(RuntimeError):
                collector.alpaca_creds()

    def test_invalid_clock_is_not_closed(self):
        with patch.object(collector,'alpaca_get',return_value={}):
            with self.assertRaises(ValueError):
                collector.collect_market()

    def test_live_endpoint_refused_before_credentials(self):
        with patch.object(collector,'ALPACA_BASE','https://api.alpaca.markets'), patch.object(collector,'alpaca_creds') as creds:
            with self.assertRaises(RuntimeError):
                collector.alpaca_get('/v2/clock')
            creds.assert_not_called()


if __name__ == '__main__':
    unittest.main()

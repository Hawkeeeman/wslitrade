import importlib.util
import json
import sys
import tempfile
import unittest
from datetime import datetime,timezone
from pathlib import Path
from types import SimpleNamespace as Obj

sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
from collect_paper import amount,stamp,build_snapshot,ledger_summary,snapshot_packet,public_orders,public_decisions,public_policy_change
from install_publisher import HOST_KEY,HOST_FINGERPRINT,units
import base64,hashlib,sqlite3


class PaperExportTests(unittest.TestCase):
    def test_decision_evidence_is_allowlisted_not_a_model_thought(self):
        decisions=public_decisions([dict(at='2026-10-07T13:36:18+00:00',plan=dict(symbol='NCLH',
            qty=65,limit_price='15.26',stop_price='15.20',nominal_risk='3.90',max_notional='991.90',
            account='PRIVATE_ID',thoughts='PRIVATE_THOUGHTS',decision_evidence={'quote_at':None,'private':'PRIVATE_KEY'}))],
            dict(asof='2026-10-07T13:36:09+00:00',cards=[dict(symbol='NCLH',atr='.51',relative_volume='2',range={'high':'15.20'})]))
        self.assertNotIn('PRIVATE',json.dumps(decisions))
        self.assertFalse(decisions[0]['quoteRecorded'])
        self.assertEqual(decisions[0]['candidateRank'],1)
        self.assertEqual(decisions[0]['stopPrice'],'15.20')

    def test_later_scan_is_not_retroactive_admission_evidence(self):
        d=public_decisions([dict(at='2026-10-07T13:36:18+00:00',plan={'symbol':'NCLH'})],
            dict(asof='2026-10-07T14:00:00+00:00',cards=[{'symbol':'NCLH','atr':9}]))[0]
        self.assertIsNone(d['candidateRank']);self.assertIsNone(d['atr'])

    def test_policy_receipt_redacts_hash_and_requires_exact_approval(self):
        value=dict(effective_session='2026-10-08',max_entries=3,exit_cooldown_seconds=900,
            no_repeat_symbols=True,config_hash='PRIVATE_HASH',scheduled_at='2026-10-07T20:10:00+00:00')
        self.assertEqual(public_policy_change(value)['state'],'scheduled')
        self.assertNotIn('PRIVATE',json.dumps(public_policy_change(value)))
        self.assertIsNone(public_policy_change({**value,'max_entries':4}))
    def order(self,cid,legs=None):
        return Obj(client_order_id=cid,filled_at=None,submitted_at=datetime(2026,10,7,13,36,tzinfo=timezone.utc),
            created_at=None,side='buy',symbol='NCLH',qty='65',filled_qty='65',filled_avg_price='15.26',
            status='filled',legs=legs)

    def test_canceled_plumbing_and_unrelated_orders_excluded(self):
        orders=public_orders([self.order('wsli-smoke-20261006-order'),self.order('PRIVATE_CID'),self.order('approved')],{'approved':'entry'})
        self.assertEqual(len(orders),1)
        self.assertEqual(orders[0]['symbol'],'NCLH')
        self.assertNotIn('approved',json.dumps(orders))

    def test_attached_protective_stop_is_actual_order_not_second_entry(self):
        stop=self.order('PRIVATE_CHILD'); stop.side='sell'; stop.filled_avg_price='15.20'
        orders=public_orders([self.order('entry',[stop])],{'entry':'entry'})
        self.assertEqual({o['role'] for o in orders},{'entry','protective_stop'})

    def test_allowlisted_snapshot_never_leaks_identity_prompts_or_paths(self):
        now=datetime(2026,10,7,14,0,tzinfo=timezone.utc)
        payload=build_snapshot(now=now,account=Obj(equity='9996.10',cash='9996.10',last_equity='10000',id='PRIVATE_ACCOUNT'),
            positions=[],orders=[],clock=Obj(is_open=True,timestamp=now,next_open=now,next_close=now),calendar={},
            status={'armed':True,'executor_state':'ENTRY_CONSUMED_OR_PENDING','checked_at':now.isoformat(),
                    'refusals':{'NCLH':'PRIVATE_TOKEN'},'open_order_count':0,'private_path':'PRIVATE_PATH'},
            service='active',ledger=dict(entryCount=1,quoteBatches=5,lastQuoteAt=None,activity=[],intentRoles={}),
            prepared={'universe':{'NCLH':{}},'prepared_at':now.isoformat(),'account':'PRIVATE_ACCOUNT'},
            scan={'cards':[{'symbol':'NCLH'}],'asof':now.isoformat(),'diagnostics':'PRIVATE_DIAGNOSTICS'},reviews=[],
            config=dict(seed='10000',first_session='2026-10-07',last_session='2026-10-20',max_position='1000',risk_per_trade='10',daily_loss='100'),
            halted=False)
        self.assertNotIn('PRIVATE',json.dumps(payload))
        self.assertEqual(payload['account']['trialPl'],'-3.90')
        self.assertEqual(payload['progress']['candidateCount'],1)
        self.assertFalse(payload['publication']['automatic'])
        self.assertEqual(payload['publication']['intervalSeconds'],600)

    def test_numbers_and_timestamps_fail_closed(self):
        for value in ('NaN','Infinity',True,None):self.assertIsNone(amount(value))
        self.assertIsNone(stamp('2026-10-07T09:30:00'))
        self.assertIsNone(stamp(None))

    def test_missing_journal_reports_missing_not_completed(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertIsNone(snapshot_packet(Path(d),'2026-10-07','scan'))
            self.assertIsNone(ledger_summary(Path(d),'2026-10-07')['entryCount'])
            self.assertIsNone(ledger_summary(Path(d),'2026-10-07')['quoteBatches'])

    def test_github_host_pin_matches_official_fingerprint(self):
        actual='SHA256:'+base64.b64encode(hashlib.sha256(base64.b64decode(HOST_KEY.split()[2])).digest()).decode().rstrip('=')
        self.assertEqual(actual,HOST_FINGERPRINT)

    def test_finite_publisher_is_not_an_ai_or_order_loop(self):
        texts=units(); timer=texts['wsli-site-publish.timer']; service=texts['wsli-site-publish.service']
        self.assertIn('2026-10-07..20',timer); self.assertIn('00/10',timer)
        self.assertIn('Persistent=false',timer)
        self.assertEqual(service.split('ExecStart=')[1].split()[0],'/usr/bin/python3')
        self.assertIn('NoNewPrivileges=yes',service)
        self.assertIn('ProtectHome=read-only',service)


if __name__=='__main__':unittest.main()

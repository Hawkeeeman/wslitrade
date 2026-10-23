import hashlib
import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from collect_paper import public_continuation


class ContinuationTests(unittest.TestCase):
    def setUp(self):
        self.config={'first_session':'2026-10-26','last_session':'2026-10-30'}
        self.pending={'first_session':'2026-10-26','last_session':'2026-10-30','scheduled_at':'2026-10-23T20:15:00Z'}
        h=hashlib.sha256(json.dumps(self.config,sort_keys=True,separators=(',',':')).encode()).hexdigest()
        self.receipt={**self.pending,'state':'verified_installed','checked_at':'2026-10-23T20:16:00Z','config_hash':h,
                      'private_identifier':'never_export'}

    def test_pending_is_not_activation(self):
        value=public_continuation(self.pending,None,self.config)
        self.assertEqual(value['state'],'scheduled');self.assertIsNone(value['installedAt'])

    def test_activation_requires_matching_installed_config_and_receipt(self):
        value=public_continuation(self.pending,self.receipt,self.config)
        self.assertEqual(value['state'],'installed')
        self.assertEqual(set(value),{'state','firstSession','lastSession','scheduledAt','installedAt'})

    def test_wrong_hash_or_dates_never_claims_installed(self):
        for change in ({'config_hash':'wrong'},{'first_session':'2026-10-23'},{'state':'staged'},{'checked_at':None}):
            self.assertEqual(public_continuation(self.pending,{**self.receipt,**change},self.config)['state'],'scheduled')

    def test_pending_needs_exact_dates_and_aware_time(self):
        for change in ({'last_session':'2026-11-01'},{'scheduled_at':'2026-10-23T16:15:00'}):
            self.assertIsNone(public_continuation({**self.pending,**change},None,self.config))

    def test_no_receipt_means_no_claim(self):
        self.assertIsNone(public_continuation(None,None,self.config))

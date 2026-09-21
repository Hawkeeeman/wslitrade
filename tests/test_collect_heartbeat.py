import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("heartbeat", Path(__file__).parents[1] / "scripts/collect_heartbeat.py")
hb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hb)


class HeartbeatTests(unittest.TestCase):
    def build(self, outcome="skipped"):
        jobs = [{"id":"h", "enabled":True, "schedule":{"everyMs":1800000},
                 "payload":{"message":"PRIVATE_PROMPT"}, "state":{"lastRunStatus":outcome,
                 "lastRunAtMs":1790001968616, "lastError":"heartbeat skipped: empty-heartbeat-file PRIVATE_TOKEN"}},
                {"id":"m", "schedule":{"at":"2026-09-21T13:38:00Z"},"state":{"lastRunStatus":"ok"}},
                {"id":"e", "schedule":{"at":"2026-09-21T20:05:00Z"}}]
        collector = dict(state="observations_received",session="2026-09-21",feed="iex",mode="observation",
                         ordersEnabled=False,lastObservationAt="2026-09-21T14:48:14Z",batchCount=2198,
                         private_path="PRIVATE_PATH",account="PRIVATE_ACCOUNT")
        return hb.build_snapshot(jobs,"h",{"morning":"m","end_of_day":"e"},collector,"2026-09-21T14:48:15Z",True)

    def test_allowlist_excludes_prompts_errors_paths_and_account(self):
        result = self.build()
        self.assertNotIn("PRIVATE",json.dumps(result))
        self.assertEqual(result["heartbeat"]["skipReason"],"empty_task_file")
        self.assertEqual(result["heartbeat"]["intervalSeconds"],1800)

    def test_unknown_outcome_is_not_success(self):
        self.assertIsNone(self.build("something private")["heartbeat"]["lastOutcome"])

    def test_export_does_not_claim_automatic_publishing(self):
        self.assertFalse(self.build()["publication"]["automatic"])

    def test_review_checks_are_not_inferred_for_end_of_day(self):
        reviews=self.build()["reviews"]
        self.assertTrue(reviews[0]["citationsVerified"])
        self.assertFalse(reviews[1]["citationsVerified"])

    def test_absent_job_fails_closed(self):
        with self.assertRaises(KeyError):
            hb.build_snapshot([],"missing",{}, {},"now")

    def test_missing_timestamp_not_now(self):
        self.assertIsNone(hb.iso_ms(None))
        self.assertIsNone(hb.iso_ms(True))


if __name__ == "__main__":
    unittest.main()

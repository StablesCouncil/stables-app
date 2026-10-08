# INSTANT-EDGE-01-R1: Instant payments edge cases on the laptop (2026-10-03/04)

Five real cases on Minima mainnet with valueless Winiwa/xWiniwa, driven through the app: a fresh install moving money
from old vault coins (E1, E2), the app closed mid-Remove (E3), the node connection lost mid-Remove (E4), another
transaction taking the vault coin a Remove uses (E5). All pass on build 0.0.12.018. See `CLOSURE_REPORT.md` first,
then `run-log.md`. Builds .015 to .018 were made during the run; their gates are in
`1_development/stream_3_governance/task_test_channel/evidence/instant-*/`.

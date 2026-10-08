# STEP2-PRESEED-01-R1: closure report

- **Record:** `docs/STEP2-PRESEED-01.md`, version 1, approved by the founder 2026-09-29 (one run)
- **Run:** `STEP2-PRESEED-01-R1`, formal evidence mode (`EXPERIMENT_GOVERNANCE_STANDARD.md` section 3)
- **Started:** 2026-09-28T22:37:20Z (P0.1). **Ended:** 2026-09-28T22:56:22Z (closing reads). About 19 minutes.
- **Result:** **GREEN.** No stop condition was met. HP1 to HP5 all hold.
- **Network:** Minima mainnet, Winiwa (V9 test token, valueless), 6 atoms in play, all returned.

## Environment and frozen inputs

| Item | Value |
|---|---|
| OS | Windows 11 Home 10.0.26200 x64 (host Litetop) |
| Node.js | v25.8.0 |
| Java (replay) | OpenJDK 17.0.18 (Temurin), `javac 17.0.18` |
| Primary node | DevNodesSet 9101, RPC 9105, Minima 1.0.45.15 |
| Witness node | DevNodesSet 9201, RPC 9205, Minima 1.0.45.15 (observed only) |
| Tips at P0 | 9101: 2,339,121; 9201: 2,339,121 |
| Health at P0 | both `healthy` (`lab-node-health.mjs`, exit 0 for both) |
| Section 4.1 hashes at P0 | all five match the record (`run-state.json` `p0.hashes`) |
| ACCT and X preimages | both recomputed and equal to the record |
| Runner | `measure/step2v2-preseed.mjs`, SHA-256 `7170bfc231b07c02b3cae8dfedb599041bcf5d97a870aeaa271e3d492d42b1a9` (in the fixture block; re-checked at the start of every phase; unchanged at closure) |
| Replay | `measure/java/KissRunScaled.java` SHA-256 `a9b8739d8fc54ab02b15b07c0d2bc028d4732339ed6fb5b9cd2f4e07f33e919a`, compiled at P0.8 against the 9101 jar (SHA-256 `241f9429d0ea2599905fe0950e0dde4c59a2cabe3e480cd89b6e24a628cee56a`) |
| Fixture block | `fixture-block.json`, SHA-256 `7a218fa02d560a304b1df4f1b896196a464424066b0976f97ab28d71ece1e65c` (written at P0.8, before H01; unchanged at closure) |

**Fixture block (record 4.4):**

| Name | Value |
|---|---|
| K1 (`keys action:new` on 9101) | `0x0167A7B0503330A79681A93E337F8218EC9597C54BCD841921F93BEFA2BA6E3E` |
| K2 (public key of the `getaddress` address) | `0xE84A23B8D256087470F0D449E24486452F01829D2E34BC9E822C60A9DBC1631A` |
| P (9101 Savings address from `getaddress`) | `0x5FDF4C3A48E4DA2EFDFA3C679289C6CED03BF25837B3F8752301E91A76B132CA` (`MxG082VRT63KW74R8NFRUHSCU98JHMEQ0TV4M1NMFS7A8Z1T4D7DC9WPBFUQ1GS`) |
| F | `0x61CE0170514740400CABFFEE5BE47B3DBB12144614B6230FAAB5EBB768B671B8`, 0.00000199 Winiwa, created block 2,307,321. Rule, frozen in the runner: the smallest sendable Winiwa coin of at least 0.00000010, at most 12 decimals, at least 3 deep (3 qualified) |
| Start balance, Winiwa on 9101 | confirmed 999,819,176.37531884; unconfirmed 0; sendable 1,000.00040199 (69 coins) |

## Results by hypothesis

| Hypothesis | Result | Evidence |
|---|---|---|
| **HP1** addresses | **PASS** | `runscript` on 9101 returned both frozen 0x and Mx addresses, clean-invariant. `newscript trackall:true` returned `0x5337459E...5449` (REG) and `0xE23CA9F2...3413` (VAULT) on both 9101 and 9201. No phantom appeared. |
| **HP2** honest controls | **PASS** | All six passed `txncheck` with all four flags true, were mined within 1 block of posting, and both nodes reported the same block number and block id. |
| **HP3** refusals | **PASS** | All fourteen: `scripts:false` with `basic`, `signatures` and `mmrproofs` true. The in-process replay (L1) shows the failing inputs and clauses predicted in section 7. The node's own `Script FAIL input:N` log names the same first failing input. The inputs were unspent on both nodes after each refusal, and were spent only by the next registered control. |
| **HP4** conservation and exit | **PASS** | At closure REG and VAULT hold no coin on either node. 9101's Winiwa confirmed, unconfirmed and sendable figures equal the start exactly (coin count 69 to 72: the run's wallet outputs P2, F'', P5, P6 replaced F). |
| **HP5** key | **PASS** | `txnsign publickey:K1` (K1 from `keys action:new`) signed H02, H05, H06 and the refusals R03 to R08 and R11. H02, H05 and H06 were accepted by the registration script, then mined. |

## Honest controls

The canonical TxPoW id differs from the preliminary id returned by `txnpost` for all six, as `XN-MAIN-001-R1` predicted. Each mined TxPoW was found by transaction id (scanning `txpow block:` from the tip at post, then `txpow txpowid:` for each listed TxPoW). "Size" is the canonical TxPoW's own `size`; "export" is the `txnexport` payload in bytes.

| Case | Transaction id | Canonical TxPoW id | Block | Block id (identical on 9101 and 9201) | Confirmations at final read (9101 / 9201) | Size | Export | Estimate | In / out / scripts / sigs | L1 replay (instructions per input) |
|---|---|---|---|---|---|---|---|---|---|---|
| H01 load + registration | `0x191D8117...BCBB` | `0x00011607B93468B5C07B64FC6D75F0B567CD6FCCE08E4A4FC24D59309EFB3E37` | 2,339,123 | `0x0000004570E614B8D3FBEFFF7AC221D8E2B3591BCF35109DFB03A5C7D0AEE38C` | 3 / 3 | 7,233 | 6,482 | 8.1 KB | 1 / 3 / 1 / 1 | 3 (wallet script) |
| H02 partial withdrawal | `0xCFED5981...82CA` | `0x000076C238913AA3E98B86BA0D7972A8A00015D9440C0B43D8A8AA8BF9946E48` | 2,339,129 | `0x0000002E69ED47927D2A941E601EF811B578F56E69DE92D4E99A43582DA06B99` | 3 / 3 | 8,736 | 7,912 | 11.0 KB | 2 / 3 / 2 / 1 | 88 / 31 |
| H03 second load | `0xE7D67951...8384` | `0x00000FCEA22C8A34CCC5E58072D9D3AAB9FC27989E034B47EBD44AB73D643F78` | 2,339,133 | `0x0000004A4BB499F03FB5FB9B0E16D45A0226335C5A50E5C288464926797225D2` | 4 / 4 | 6,134 | 5,383 | 7.8 KB | 1 / 2 / 1 / 1 | 3 (wallet script) |
| H04 merge | `0x69F7965F...A1FF` | `0x0000A82B583582A2DC0D4C82FD3CBDD324D88BF266DF388BB222D47A6FA698FE` | 2,339,138 | `0x0000005F05C734F9B11F7649189732B0C8ECC456AAF8706AB5FC7545070580DF` | 3 / 3 | 2,742 | 1,954 | 5.7 KB | 2 / 1 / 1 / 0 | 39 / 39 |
| H05 withdraw everything | `0x8FD28A92...65BD` | `0x00015B55B4E254358AEF86DE58E9AED3340D638F615A682A2070FF2C5D6E8E66` | 2,339,142 | `0x0000004EF8B808042BE5E999CA94954431C7B26F930527540F49CFFBF928C538` | 3 / 3 | 8,209 | 7,495 | 10.8 KB | 2 / 2 / 2 / 1 | 93 / 28 |
| H06 close | `0x51CD00A8...51AC` | `0x0000645CEB7BE46CE8C359D2E41A68028D260B51D8BF68A88CF4A69B9A178C9A` | 2,339,146 | `0x0000003D24833A19661CF0375D87B68C76A350E1E2AEF4CFE3739863A2186B83` | 3 / 3 | 6,760 | 6,009 | 8.2 KB | 1 / 1 / 1 / 1 | 29 |

Full transaction ids, preliminary TxPoW ids, export SHA-256s, signing keys and output coin ids are in `steps/hNN.json`. H01 was signed by the key of F's address (`0x061966F5...5B8A`); H03 by K2 (F' sat at P); H02, H05 and H06 by K1. The L1 replay counts equal the record's dry-run counts exactly (H02 88/31, H04 39/39, H05 93/28, H06 29).

**Active consensus limits** (block header `magic` at H01's block): max TxPoW size 65,536 bytes, max KISS VM operations 1,024, max transactions 256.

**Explorer links:**
- H01 https://explorer.minima.global/search?q=0x00011607B93468B5C07B64FC6D75F0B567CD6FCCE08E4A4FC24D59309EFB3E37
- H02 https://explorer.minima.global/search?q=0x000076C238913AA3E98B86BA0D7972A8A00015D9440C0B43D8A8AA8BF9946E48
- H03 https://explorer.minima.global/search?q=0x00000FCEA22C8A34CCC5E58072D9D3AAB9FC27989E034B47EBD44AB73D643F78
- H04 https://explorer.minima.global/search?q=0x0000A82B583582A2DC0D4C82FD3CBDD324D88BF266DF388BB222D47A6FA698FE
- H05 https://explorer.minima.global/search?q=0x00015B55B4E254358AEF86DE58E9AED3340D638F615A682A2070FF2C5D6E8E66
- H06 https://explorer.minima.global/search?q=0x0000645CEB7BE46CE8C359D2E41A68028D260B51D8BF68A88CF4A69B9A178C9A
- Vault https://explorer.minima.global/address/0xE23CA9F24CF5BDC49B75964DA145A0AE75F69E6DFD37BDCEAB5765AEB3A53413
- Registration https://explorer.minima.global/address/0x5337459E075F10B5340ACF645B7815D016570787ACBF632CD5ADBB19C8F45449

### Coins at VAULT and REG, before and after (identical on both nodes at every read)

| After | VAULT | REG |
|---|---|---|
| P0 (start) | none | none |
| H01 | L1 `0x9333351F...1341` = 0.00000003 (state) | R1 `0x799A0B8D...4FF3` = 0.00000001 |
| H02 | C1 `0xA78A7841...812C` = 0.00000002 (no state) | R2 `0x9F05D289...CEC0` = 0.00000001 |
| H03 | C1, L2 `0x934C09C4...9E67` = 0.00000002 (state) | R2 |
| H04 | M1 `0x64C0294B...4F57` = 0.00000004 (no state) | R2 |
| H05 | **none** | R3 `0xCD89705F...0775` = 0.00000001 |
| H06 and closing reads | **none** | **none** |

Wallet-side coins of the run (all at P): F' 0.00000195 (H01 change, spent by H03), P2 0.00000001 (H02), F'' 0.00000193 (H03 change), P5 0.00000004 (H05), P6 0.00000001 (H06). In: F 0.00000199. Out: 1 + 193 + 4 + 1 = 199 atoms.

## Refusals (never posted; each deleted with `txndelete`, reply `Deleted`)

"Per input" is the L1 replay (`!` = that input refused). "Node log" is 9101's own `Script FAIL input:N` line printed during the `txncheck`. SHA-256 is of the exported transaction bytes; the hex is in `exports/`.

| Case | Change | Flags b / sig / mmr / scripts | Per input | Refusing clause (replay trace) | Node log | Inputs unspent after, both nodes | Export bytes | Export SHA-256 |
|---|---|---|---|---|---|---|---|---|
| R01 | H02 not signed | T / T / T / **F** | 11! / 31 | input 0 `SIGNEDBY(PREVSTATE(2))` | input:0 | yes | 3,787 | `389c2162...e625` |
| R02 | H02 signed by K2 | T / T / T / **F** | 11! / 31 | input 0 `SIGNEDBY(PREVSTATE(2))` | input:0 | yes | 7,912 | `3af81ea4...a82a` |
| R03 | output 0 pays X | T / T / T / **F** | 70! / 31 | input 0 `VERIFYOUT(0 PREVSTATE(3) w t FALSE)` | input:0 | yes | 7,912 | `205bfbac...683a` |
| R04 | port 3 = X, output 0 pays X | T / T / T / **F** | 19! / 31 | input 0 `SAMESTATE(0 3)` | input:0 | yes | 7,912 | `3de10f62...d7d4` |
| R05 | port 12 = xWiniwa | T / T / T / **F** | 23! / 17! | input 0 `SAMESTATE(12 12)`; input 1 `@TOKENID EQ STATE(12)` | input:0 | yes | 7,912 | `fb3be38a...c04e` |
| R06 | output 1 keeps state | T / T / T / **F** | 88 / 31! | input 1 `VERIFYOUT(1 @ADDRESS c @TOKENID FALSE)` | input:1 | yes | 7,912 | `56ff1e97...ce81` |
| R07 | VAULT 1 plus extra X 1 | T / T / T / **F** | 78! / 31! | input 0 `@TOTOUT EQ 3`; input 1 `VERIFYOUT(1 ...)` | input:0 | yes | 8,130 | `ea46c681...9f63` |
| R08 | no registration output | T / T / T / **F** | 78! / 31 | input 0 `@TOTOUT EQ 3` | input:0 | yes | 7,694 | `2d002542...d749` |
| R09 | L1 alone, op 1, X 3 | T / T / T / **F** | 12! | input 0 `GETINADDR(0) EQ REG` | input:0 | yes | 1,826 | `92bfecfd...d988` |
| R10 | L1 alone, op 4, port 100 | T / T / T / **F** | 13! | input 0 `RETURN FALSE` | input:0 | yes | 1,654 | `b23152d4...07d9` |
| R11 | close of R1 paying X | T / T / T / **F** | 29! | input 0 `VERIFYOUT(0 PREVSTATE(3) STATE(11) @TOKENID FALSE)` | input:0 | yes | 6,079 | `2c9bbdce...3ae6` |
| R12 | close of R1, unsigned | T / T / T / **F** | 11! | input 0 `SIGNEDBY(PREVSTATE(2))` | input:0 | yes | 1,954 | `7dbbab34...9d3f` |
| R13 | merge output VAULT 3 | T / T / T / **F** | 39! / 39! | inputs 0 and 1 `VERIFYOUT(0 @ADDRESS STATE(10) @TOKENID FALSE)` | input:0 | yes | 1,954 | `4f27257a...d09c` |
| R14 | merge output keeps state | T / T / T / **F** | 39! / 39! | inputs 0 and 1 `VERIFYOUT(0 @ADDRESS STATE(10) @TOKENID FALSE)` | input:0 | yes | 1,954 | `9ec053f7...06be` |

Every refusing input and clause is the one section 7 names. For R13, port 10 carried the true sum (4 atoms), so `STATE(10) EQ SUMINPUTS` passed and the refusal came from `VERIFYOUT(0 ...)`. That is one of the two clauses the record lists for R13. The instruction counts equal the dry-run counts for the same shapes (for example unsigned 11, redirected 70, close redirected 29, merge 39, op 4 13).

## Closure report (standard section 8)

1. **Question answered.** Yes. The two frozen step 2 covenants, at their final addresses on Minima mainnet, settled the six honest operations with real coins. They refused all fourteen registered constructions on the input and clause the dry runs predict.
2. **Tests run and not run.** Run: P0; H01 to H06; R01 to R14; closing reads. Everything in the record ran. Not run: nothing.
3. **Evidence level achieved.** **L2** for these shapes: purpose-created valueless token on mainnet, one operator, own tests, one canonical block seen by two registered nodes. The refusal attributions are **L1** (in-process replay on the node's jar), backed by the node's own first-failing-input log line. This is not L3.
4. **Findings.**
   - The clean-form addresses are final and spendable: `newscript` returns them on two nodes, and coins created there were spent through both branches of each script.
   - A key from `keys action:new` signs covenant inputs through `txnsign publickey:`. Design section 12's `newaddress` fallback is not needed.
   - All three vault paths mined (withdraw with change, withdraw to zero, merge), as did both registration paths (withdraw, close). The `basic:false` per-branch complexity risk did not appear.
   - `VERIFYOUT` keepstate behaves on real outputs as modelled: change and merged coins must carry no state (R06, R14), and the registration coin must keep it (H02, H05).
   - Measured sizes are 11 to 52 per cent below the estimates (read as 1,000-byte KB). The estimates used an upper-bound per-input size: H01 7,233 bytes, H02 8,736, H03 6,134, H04 2,742, H05 8,209, H06 6,760.
   - Each honest control was mined in the block after posting.
5. **Falsifiers and anomalies.** No falsifier was met. Anomalies recorded, none a stop condition:
   - (a) **Pre-run readiness.** Before P0 (outside the run, `status`-only probes by `lab-node-health.mjs`), both nodes answered "slow" (5 to 8 s against the tool's 4 s threshold). A concurrent Gradle build (Mininotes, not part of this work) was using about four cores. P0 was started only after the build went quiet and both nodes read `healthy` at the same block. Inside the run, the slowest RPC reply took 10.0 s. No node wedged.
   - (b) **Lingering 9201 JVM.** A second Minima JVM on the 9201 data folder was running: PID 33600 with java8path shim 17156, started 00:49:36 local. It is the lingering first JVM of the MegaMMR resync. The listening instance is PID 36080 (started 00:55:22). PID 33600 was inert (28 MB, no CPU, no network sockets) and was not touched.
   - (c) **Balance components.** 9101's `balance` "confirmed" Winiwa (999,819,176.37531884) includes coins at addresses the node tracks but does not own. The wallet's own figure is "sendable" (1,000.00040199). HP4 holds on every component, so this does not affect the verdict.
   - (d) **Choices frozen in the fixture block before H01.** Two construction choices the record left open were fixed in the fixture block before H01. R09's state ports (the record says only "op 1"): the dry run's analogue (`NEG_A_vault_coin_alone`, the full withdrawal state with w = 0.00000003, c = 0). And the rule for choosing F. Neither affects a clause: R09 fails at its 12th instruction, before any other port is read.
   - (e) **Search commands.** The record does not name the command for finding a TxPoW by transaction id. The runner used read-only `txpow block:` and `txpow txpowid:` reads.
6. **Missing evidence.**
   - The explorer pages were not opened, so whether the explorer displays state is still unknown. The links are recorded.
   - The node log names only the first failing input. The second refusing input in R05, R07, R13 and R14 is attributed by the L1 replay alone.
   - The replay used the builder's own JSON of each transaction (the `txnbasics` reply: inputs with their stored state, outputs, state, witness scripts) plus the `txnsign` signer list. It did not decode the exported hex. The hex and its SHA-256 are the preserved artifact.
   - 9201's own log file was not read.
7. **Architectural impact.** The registration v2 and vault v2 texts and addresses stand as designed. The withdrawal key source (`keys action:new`) is confirmed. The size table in the design can use measured values. The app build and STEP2-DEMO-01 are unblocked, subject to their own approval. This run proves nothing about the phones' 1.1.1.26 node, the app, or value at risk.
8. **Budget and time.** Dust class: 6 atoms of Winiwa moved and all returned. 0 MINIMA spent (feeless). No token created. The run took 19 minutes (P0 to closing reads) and made 685 RPC calls. Preparation (runner, offline selftest, readiness wait) took about 40 minutes.
9. **Recommendation.** **Close green.** Proceed to the founder's approval of STEP2-DEMO-01 and to the app build against these addresses. Before the demo, stop the lingering 9201 JVM (anomaly b) as a lab-hygiene step.
10. **Knowledge-base and handshake updates required** (not made in this run; they need founder review):
    - `step2-load-offload-design.md` section 12: mark mining, `txncheck` on a real node, sizes and the `keys action:new` signing as closed by this run, and replace the size estimates in section 7 with the measured values.
    - `BUILDER_KIT.md` traceability: add these two covenants at L2.
    - `global_knowledge_base.md` and `PROTOCOL_DOCUMENTATION_MAP.md` (standard section 9): after founder review.
    - Memory: a `keys action:new` key signs covenant inputs through `txnsign publickey:` on 1.0.45.15 (L2).

## Evidence index (this folder)

| Path | Contents |
|---|---|
| `commands.jsonl` | Every command sent to either node, in order, with node, RPC port, start and end times, latency and the full parsed reply; the two health-tool runs with stdout, stderr and exit code; runner notes. 791 entries. |
| `run-state.json` | Run state: environment, P0 results, the fixture, every step's full record, coin map, closing reads. |
| `fixture-block.json` | The section 4.4 fixture block, written at P0.8. |
| `steps/hNN.json`, `steps/rNN.json`, `steps/close.json` | Per-step records. Honest: `txncheck`, flags, ids, blocks on both nodes, sizes, counts, coins before and after, replay. Refusal: `txnbasics` JSON, `txncheck`, flags, export hash, node log lines, post-delete input reads on both nodes, attribution. |
| `exports/step2pre_*.hex` | All 20 `txnexport` payloads (6 honest, 14 refusals). |
| `replay/` | Replay classes compiled at P0.8; per-case input JSON, stdout with full traces, and stderr. |
| `phase-logs/` | Runner stdout, stderr and exit code for each phase (all exit 0). |

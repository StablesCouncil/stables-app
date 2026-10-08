# STEP2-PRESEED-01: dust-level check of the Instant payments vault and registration on lab node 9101

- **ID:** `STEP2-PRESEED-01`
- **Version:** 1
- **Status:** **APPROVED by the founder, 2026-09-29** ("yes run the dust check"). Exactly one run, `STEP2-PRESEED-01-R1`, of
  this version is authorised. Decisions: witness node DevNodesSet 9201 (as proposed); if HP5 fails, the run stops (as
  proposed); no continuation with another key inside this run. Setup before P0: 9201 was resynced by MegaMMR
  (spartacusrex.com:9001) and restarted, and it reached 9101's tip (block 2,339,068, both nodes) before the run.
- **Run identity once approved:** `STEP2-PRESEED-01-R1` (one run; a failed run gets a hard-stop record and any
  successor gets a new run id, standard section 6)
- **Mode:** formal evidence mode (`EXPERIMENT_GOVERNANCE_STANDARD.md` section 3)
- **Network:** Minima mainnet only, the V9 test token Winiwa (valueless), dust amounts
- **Primary node:** DevNodesSet **9101**, RPC `http://127.0.0.1:9105`, Minima 1.0.45.15. Builds, signs and posts.
- **Witness node:** DevNodesSet **9201**, RPC `http://127.0.0.1:9205`. Observes only; never signs or posts.
- **Confirmation rule:** one canonical block observed by both nodes (standard section 6.8). A coin is used as an
  input only once it is 3 blocks deep on 9101 (the wallet age rule found in `XN-MAIN-001-R4`).
- **Design:** [`step2-load-offload-design.md`](step2-load-offload-design.md), version 2 (no limit, no retirement)
- **Dry-run basis:** `../measure/receipts/step2v2_covenant_branches.json`, `step2v2_addresses.json`,
  `step2v2_txn_sizes.json`, `step2v2_probes.json`
- **Next:** [`STEP2-DEMO-01`](STEP2-DEMO-01.md) may run only after this record closes green.
- **Location note:** the standard names no folder for records; the brief puts them beside the design.
  Evidence goes to `../evidence/STEP2-PRESEED-01-R1/`.

---

## 1. Research question

Do the two frozen step 2 covenants (registration v2 and vault v2), deployed at their final addresses on Minima
mainnet, settle the six honest operations of the design with real coins, and refuse the fourteen registered
malicious or malformed constructions on the clause the dry runs predict?

## 2. Reason for testing

Everything known about these scripts is L1: in-process runs on the 1.0.45.15 jar and `runscript` on the live
node, which has no transaction. Three things only exist on chain and cannot be settled by a dry run (design section
12): mining (the unreproduced `basic:false` per-branch complexity risk), `VERIFYOUT` and keepstate behaviour on real
outputs, and whether `txnsign publickey:<key>` signs a covenant input with a key made by `keys action:new`. This is
also the first coin at a new covenant address, so the address itself (clean form, law 2 and 3) is proven here with
dust before the demo puts 100 Winiwa there.

## 3. Hypotheses

- **HP1 (addresses).** `newscript` of each frozen clean text on 9101 and 9201 returns the frozen address.
- **HP2 (honest).** Each honest control H01 to H06 passes `txncheck` with `basic`, `signatures`, `mmrproofs` and
  `scripts` all true, is mined, and both nodes report the same canonical block for it.
- **HP3 (refusals).** Each refusal R01 to R14 fails `txncheck` with `scripts:false` (every other flag as listed in
  section 7), on the input and clause named, and its inputs remain unspent afterwards on both nodes.
- **HP4 (conservation and exit).** At the end no coin created by this run remains at the vault or registration
  address, and 9101's Winiwa balance is exactly what it was at start (feeless; every atom that went in came out).
- **HP5 (key).** `txnsign publickey:K1`, K1 made by `keys action:new`, produces a signature the registration
  script accepts.

## 4. Exact initial conditions

### 4.1 Frozen sources

| File (under `1_development/stream_1_app/work/simcard/`) | SHA-256 |
|---|---|
| `kiss/step2/instant_registration_v2.clean.txt` (the exact bytes registered and spent; 589 bytes, one line, no trailing newline) | `a033264f9442cded205a8f7224d41e2387763148e2138351b2e0fbf541ce2d9e` |
| `kiss/step2/instant_vault_v2.clean.txt` (465 bytes) | `e63e0452b1a3d3e641f7b3016e1318070e0291223e0dae48a74f826bc0b76f6a` |
| `kiss/step2/instant_registration_v2.kiss` (readable source + measured header) | `2b0080cf58347c0d82ddff61511a69a74cb824971036f07009195816155c9073` |
| `kiss/step2/instant_vault_v2.kiss` | `92013536f66756c7fbdc7571f70091397cbba8ed0a23251243ea3937555c4de7` |
| `measure/step2v2-covenants.mjs` (text generator) | `ea5f5da650539c98a0f0e6b791108df6802d972b22a5954d824177902c32f9c3` |

Any mismatch at P0 stops the run before anything is created (a changed source is a new version of this record).

### 4.2 Addresses and identities

| Name | Value |
|---|---|
| Registration v2 (REG) | `0x5337459E075F10B5340ACF645B7815D016570787ACBF632CD5ADBB19C8F45449` (`MxG082J6T2PS1QV22QJ82MFCHDNG5EG2PBGF1TCNTHWPYDDNCCSHT2K96PU118J`) |
| Vault v2 (VAULT) | `0xE23CA9F24CF5BDC49B75964DA145A0AE75F69E6DFD37BDCEAB5765AEB3A53413` (`MxG08727WKV4J7YNN29MTCM9MGKB85EENR9SRFT6UUSTAQNCMNB799K2EU5DAJE`) |
| Phantom addresses (must never appear) | REG multi-line form `0xC4B574EA362B47D8DDA72518E696908F0A7BFE363A2B58F90822463436EDD12F`; VAULT multi-line form `0x5FF94F305A3CFCDB24A1D3B00DE5C8EC495C3795FFD9AF37C63C785A54290C6C` |
| Winiwa (WIN) | `0xD4F5DD3546F25D327CBF2B6867E193CE5DB6491AC9C65BBDCECACA1A6688063F` (V9, 8 decimals) |
| xWiniwa (for R05 only, as a state value) | `0xEFA53EFF58616DDBDF0B6D6DBB4E18F041C4509FB3DB3B7E5482B99ABC72F127` |
| Magic (port 0) | `0x53544931` |
| Test account id ACCT (port 1) | `0x2C17A5616335CD69A109C63571FD12859CED3FEF77C876ADE207E886C80F6144` = SHA-256 of `STEP2-PRESEED-01 test account (not an Instant key)` |
| Foreign payout X (refusals only, never posted) | `0x319540F7563D3890A15194E4FB1E0A1DB255C29B5F054948318C20D87F7A291B` = SHA-256 of `STEP2-PRESEED-01 foreign payout, refusals only, never posted` |
| Withdrawal key K1 (port 2) | created at P0.5 by `keys action:new` on 9101; written into the fixture block (4.4) before H01 |
| Another key K2 (R02 only) | the public key of 9101's `getaddress` default address, captured at P0.6 |
| Payout P (port 3) | 9101's own Savings address from `getaddress`, captured at P0.6 |
| Funding coin F | one 9101 Winiwa coin, at least 0.00000010, **at most 12 decimal places** (txn-building law 1), captured at P0.7 |

**Addresses computed by:** the live lab node 9101 running Minima **1.0.45.15** (`runscript`, clean form), and the
same two calls in-process on the 1.0.45.15 jar and on the **1.1.2.6** source-build jar; all four agree
(`step2v2_addresses.json`). They are the addresses of the **runscript clean form** (single line), which is what
`newscript` must receive (txn-building laws 2 and 3).

### 4.3 Node conditions at start

- 9101 and 9201 running, `lab-node-health.mjs` reports both healthy, `status` on both within 2 blocks of each other.
- No unspent coin at REG or VAULT on either node (`coins address:` with no other filter searches the whole
  unpruned chain). If any exists it was put there by someone else: record it as a foreign fixture, never touch it,
  and exclude it from HP4.
- 9101 holds at least 0.00000010 Winiwa in a coin with at most 12 decimals.
- No transaction id beginning `step2pre` in 9101's builder (`txnlist`).

### 4.4 Fixture block written at P0, before H01

K1, K2, P, F (coin id and amount), both nodes' tip block at P0, and the SHA-256 of `measure/step2v2-preseed.mjs`
if a scripted runner is used (a runner is optional; the recipe below is the frozen protocol, and any runner must
reproduce it exactly and be hashed here before H01). Nothing in this block may change after H01.

## 5. Independent variables

The operation (load with registration, withdraw part, load, merge, withdraw all, close); the amounts (atoms); for
refusals, exactly one altered element each: signature, signing key, output 0 address, port 3, port 12, output 1
keepstate, an added output, the registration output removed, input 0, operation 4, close destination, close
signature, merge output amount, merge output keepstate.

## 6. Dependent variables

`txncheck` flags; the failing input; mined or not; canonical block number and block id on each node; confirmations;
transaction id and canonical TxPoW id; serialized size (bytes of `txnexport`); input, output and script counts; coin
ids and amounts at VAULT and REG before and after every step; 9101's Winiwa balance before and after.

## 7. Expected results (case board)

Amounts in atoms (1 atom = 0.00000001 Winiwa). "State" lists the transaction state ports set.

**Honest controls** (built with the local transaction builder, signed, checked, exported, then posted):

| Case | Inputs | Outputs | State | Signed by | Expected |
|---|---|---|---|---|---|
| **H01** first load with registration | F | 0: VAULT 3 (keep); 1: REG 1 (keep); 2: P, F minus 4 (no state) | 0 magic, 1 ACCT, 2 K1, 3 P, 12 WIN | wallet (`auto`) | valid, mined; creates load coin L1 (3) and registration R1 (1) |
| **H02** partial withdrawal | 0: R1, 1: L1 | 0: P 1; 1: VAULT 2 (no state); 2: REG 1 (keep) | 0 to 3 as H01, 7 = 0.00000001, 8 = 1, 10 = 0.00000002, 11 = 0.00000001, 12 WIN | K1 | valid, mined; change C1 (2), registration R2 |
| **H03** second load | F' (9101 change) | 0: VAULT 2 (keep); 1: P change (no state) | 0 magic, 1 ACCT, 3 P | wallet | valid, mined; load coin L2 (2) |
| **H04** merge (anyone) | C1, L2 | 0: VAULT 4 (no state) | 8 = 3, 10 = 0.00000004 | nobody | valid, mined; merged coin M1 (4) |
| **H05** withdraw everything | 0: R2, 1: M1 | 0: P 4; 1: REG 1 (keep) | as H02 with 7 = 0.00000004, 10 = 0 | K1 | valid, mined; **the vault holds nothing from this run** |
| **H06** close | R3 (from H05) | 0: P 1 (no state) | 8 = 2, 11 = 0.00000001 (plus 0 to 3, 12 as stored) | K1 | valid, mined; the registration address holds nothing from this run |

Dry-run counts for these shapes (instructions per input, `step2v2_covenant_branches.json`): H02 88/31, H04 39/39,
H05 93/28, H06 29. Size estimates (`step2v2_txn_sizes.json`): H01 about 8.1 KB, H02 about 11.0 KB, H03 about 7.8 KB,
H04 about 5.7 KB, H05 about 10.8 KB, H06 about 8.2 KB.

**Refusals** (built on the real unspent coins, checked, exported, deleted; **never posted**). R01 to R12 are built
while R1 and L1 are unspent (between H01 and H02); R13 and R14 while C1 and L2 are unspent (between H03 and H04).
Each starts from the honest shape of the case named and changes one thing.

| Case | Change from the honest shape | Expected `txncheck` | Refusing input and clause |
|---|---|---|---|
| **R01** | H02 not signed | scripts false | input 0: `ASSERT SIGNEDBY(PREVSTATE(2))` |
| **R02** | H02 signed by K2 instead of K1 | scripts false | input 0: `SIGNEDBY` |
| **R03** | H02 output 0 pays X | scripts false | input 0: `VERIFYOUT(0 PREVSTATE(3) w t FALSE)` |
| **R04** | H02 port 3 = X and output 0 pays X | scripts false | input 0: `SAMESTATE(0 3)` |
| **R05** | H02 port 12 = xWiniwa | scripts false | input 0: `SAMESTATE(12 12)` (the vault coin also fails `@TOKENID EQ STATE(12)`) |
| **R06** | H02 output 1 keeps state (a fake load) | scripts false | input 1 (vault): `VERIFYOUT(1 @ADDRESS c @TOKENID FALSE)` |
| **R07** | H02 output 1 = VAULT 1 plus an extra output X 1 | scripts false | input 0: `@TOTOUT EQ 3`; input 1: `VERIFYOUT(1 ...)` |
| **R08** | H02 without the registration output | scripts false | input 0: `@TOTOUT EQ 3` |
| **R09** | L1 alone, op 1, output X 3 | scripts false | input 0 (vault): `GETINADDR(0) EQ REG` |
| **R10** | L1 alone, op 4, port 100 = 0.00000003, output X 3 (v1's retirement) | scripts false | input 0 (vault): `RETURN FALSE` (no operation 4) |
| **R11** | close of R1 paying X | scripts false | input 0: `VERIFYOUT(0 PREVSTATE(3) STATE(11) ...)` |
| **R12** | close of R1, not signed | scripts false | input 0: `SIGNEDBY` |
| **R13** | H04 with output VAULT 3 (one atom burnt) | scripts false | inputs 0 and 1: `STATE(10) EQ SUMINPUTS` / `VERIFYOUT(0 ...)` |
| **R14** | H04 with the output keeping state | scripts false | inputs 0 and 1: `VERIFYOUT(0 @ADDRESS STATE(10) @TOKENID FALSE)` |

For every refusal `basic` and `mmrproofs` are expected true (conservation holds and the proofs are real), so the
failing flag is `scripts`. `signatures` is recorded, expected true (no invalid signature is present; R01 and R12
carry none). `txncheck` reports one `scripts` flag for the whole transaction, so the refusing input and clause are
attributed by replaying the exact exported transaction in-process (`KissRunScaled`, the design's L1 method) and by
the node's own script log where it prints one; the attribution is labelled L1.

## 8. Falsification conditions

HP1 falls if `newscript` returns any other address (in particular a phantom). HP2 falls if an honest control fails
`txncheck`, is refused by the network, or is not seen in the same canonical block by both nodes. HP3 falls if a
refusal passes `txncheck` (`scripts:true`), or fails through `basic` or `mmrproofs` instead of `scripts`, or its
replay attributes the failure to a different input than listed, or if any of its inputs is spent afterwards by
anything but the next registered honest control. HP4 falls if a coin created by this run remains at
VAULT or REG, or 9101's Winiwa balance differs from its start by any amount. HP5 falls if `txnsign publickey:K1`
refuses or produces a signature the script rejects.

## 9. Exact recipe

All commands go to 9101 unless marked 9201. `<clean REG>` and `<clean VAULT>` are the exact contents of the two
`.clean.txt` files. Amounts are written in full (`0.00000001`); every change amount is computed with exact decimal
string arithmetic, never floating point (law 1).

**P0 setup (no coin created)**
1. `status` on both nodes; `lab-node-health.mjs`; record versions and tips.
2. SHA-256 of the section 4.1 files equals the table; `runscript script:"<clean REG>"` and `<clean VAULT>` return
   the section 4.2 addresses.
3. `coins address:<REG>` and `coins address:<VAULT>` on both nodes: record (expected: none).
4. `newscript trackall:true script:"<clean REG>"` then the same for `<clean VAULT>`, on 9101 and on 9201: each
   returns the frozen address (HP1).
5. `keys action:new` on 9101: record K1.
6. `getaddress` on 9101: record P and its public key K2.
7. `coins relevant:true sendable:true tokenid:<WIN>` on 9101: choose F; record `balance` (Winiwa) on 9101.
8. Write the fixture block (4.4). From here nothing in it changes.

**Honest control recipe** (H01 to H06; id `step2pre_hNN`):
```
txncreate id:step2pre_hNN
txninput id:step2pre_hNN coinid:<input>            (one line per input, in the order of section 7)
txnoutput id:step2pre_hNN amount:<a> address:<addr> tokenid:<WIN> storestate:<true|false>   (per output, in order)
txnstate id:step2pre_hNN port:<p> value:<v>        (per state port of section 7)
txnbasics id:step2pre_hNN
txnsign id:step2pre_hNN publickey:<auto for H01/H03 | K1 for H02/H05/H06>   (H04: no signature)
txncheck id:step2pre_hNN                           (all four flags must be true, else STOP)
txnexport id:step2pre_hNN                          (keep the hex)
txnpost id:step2pre_hNN txndelete:true              (never mine:true)
```
Then find the mined TxPoW by the **transaction id** (the preliminary TxPoW id returned at post can differ from the
canonical mined one, `XN-MAIN-001-R1`), and on both nodes run `txpow onchain:<txpowid>` and
`txpow block:<block>`; record block number, block id and confirmations. Wait until the new coins are 3 blocks deep
on 9101 before the next step that spends them. Record `coins address:<VAULT>` and `coins address:<REG>` on both
nodes after each control.

**Refusal recipe** (R01 to R14; id `step2pre_rNN`): the same builder steps with the one change of section 7, then
`txncheck` (keep the full response), `txnexport` (keep the hex and its SHA-256 as the deterministic hash), **no
`txnpost`**, `txndelete id:step2pre_rNN`, then `coins coinid:<each input>` on both nodes to show it is still unspent.

**Order:** P0, H01, R01 to R12, H02, H03, R13, R14, H04, H05, H06, closing reads (`balance` on 9101, both
addresses on both nodes).

## 10. Evidence to preserve (`../evidence/STEP2-PRESEED-01-R1/`)

Per standard section 5: run id and timestamps; the section 4.1 hashes as measured at P0; OS, Node.js and Minima
versions of both nodes; the fixture block; every command and its full response (stdout and stderr), in order; for
each honest control the exported transaction, transaction id, canonical TxPoW id, block number and block id on both
nodes, confirmations, serialized bytes, input/output/script counts, and the coin ids and amounts at VAULT and REG
before and after; for each refusal the exported transaction, its SHA-256, the complete `txncheck` response with the
four flags, the expected clause, the non-post record and the unchanged-input reads from both nodes; explorer links
`https://explorer.minima.global/search?q=<txpowid>` for H01 to H06 and
`https://explorer.minima.global/address/0xE23CA9F24CF5BDC49B75964DA145A0AE75F69E6DFD37BDCEAB5765AEB3A53413` (vault),
`https://explorer.minima.global/address/0x5337459E075F10B5340ACF645B7815D016570787ACBF632CD5ADBB19C8F45449`
(registration), whether or not the explorer shows state; a closure report (standard section 8).

## 11. Effect of passing

The two texts are L2 for these shapes (valueless mainnet, own hands): the addresses are final and spendable, the
honest paths mine, the fourteen refusals are preserved as non-canonical artifacts, and the measured sizes replace
the estimates. It unlocks STEP2-DEMO-01 (subject to its own approval) and the app build against these addresses.
It does not prove the app, the phones' 1.1.1.26 node, or anything about value at risk.

## 12. Effect of failing

A hard stop with the evidence kept. An honest control refused or a refusal accepted means the script or the model
is wrong: fix the text (new addresses), re-run the dry runs, register STEP2-PRESEED-02. A signing failure (HP5)
means the withdrawal key must come from `newaddress` instead of `keys action:new` (design section 12): a new version
of this record. A phantom address from `newscript` means the registration path is wrong; nothing was funded yet
(P0 stops before H01).

## 13. Stop conditions (abort criteria)

Stop at the first of: a source hash or address mismatch at P0; either node unhealthy or the tips more than 2 blocks
apart; any honest `txncheck` flag false; a refusal behaving differently from section 7; an honest control not mined
within 20 blocks; the two nodes reporting different blocks for one TxPoW; any input of this run spent by a
transaction that is not the next registered control (someone else took it); any `mine:true`, any command outside
the recipe, or any need to edit node data. Debugging never happens inside the run (standard section 3).

## 14. Evidence level sought

L2: purpose-created valueless tokens on Minima mainnet, one operator, own tests. Not L3.

## 15. Runtime and budget

About 45 minutes (six mined transactions, each waited to 3 blocks, plus fourteen built-and-deleted refusals).
Budget class: dust. Winiwa in play: 6 atoms (0.00000006), all returned to 9101 by H05 and H06; no MINIMA (the
transactions are feeless); no token creation.

## 16. Reviewer and approval state

**Reviewer:** the founder. **State: APPROVED 2026-09-29.** Approval authorises exactly one run,
`STEP2-PRESEED-01-R1`, of this version.

### Decisions this record asks for

1. Approve the record, the two addresses and the dust amounts.
2. The witness node: DevNodesSet 9201 (proposed: automatable and independent of the phones) or a phone.
3. If HP5 fails, may the same run continue with a `newaddress` key, or stop (the standard says stop; proposed:
   stop, and approve STEP2-PRESEED-02 with the other key source in advance).

---

## Run R1 result (2026-09-29)

Appended after the run; sections 1 to 16 above are unchanged. Evidence and the full closure report:
[`../evidence/STEP2-PRESEED-01-R1/`](../evidence/STEP2-PRESEED-01-R1/CLOSURE_REPORT.md).

**`STEP2-PRESEED-01-R1`: GREEN, no stop.** P0 to the closing reads ran 2026-09-28T22:37:20Z to 22:56:22Z, on nodes
9101 and 9201 (both Minima 1.0.45.15), tips 2,339,121 to 2,339,150. The runner `measure/step2v2-preseed.mjs`
(SHA-256 `7170bfc2...b1a9`) was hashed into the fixture block before H01 and did not change.

| Hypothesis | Result |
|---|---|
| HP1 addresses | PASS: `runscript` and `newscript` on 9101 and 9201 returned the frozen REG and VAULT addresses; no phantom |
| HP2 honest | PASS: H01 to H06 all four flags true, each mined one block after posting, same block and block id on both nodes |
| HP3 refusals | PASS: R01 to R14 `scripts:false` (other flags true), refused on the input and clause of section 7 (L1 replay; the node log agrees on the first failing input), inputs unspent on both nodes afterwards |
| HP4 conservation and exit | PASS: no coin of the run left at REG or VAULT on either node; 9101 Winiwa confirmed, unconfirmed and sendable exactly as at start |
| HP5 key | PASS: `txnsign publickey:K1` with a `keys action:new` key was accepted by the registration script (H02, H05, H06 mined) |

| Control | Block | Canonical TxPoW (explorer) |
|---|---|---|
| H01 | 2,339,123 | https://explorer.minima.global/search?q=0x00011607B93468B5C07B64FC6D75F0B567CD6FCCE08E4A4FC24D59309EFB3E37 |
| H02 | 2,339,129 | https://explorer.minima.global/search?q=0x000076C238913AA3E98B86BA0D7972A8A00015D9440C0B43D8A8AA8BF9946E48 |
| H03 | 2,339,133 | https://explorer.minima.global/search?q=0x00000FCEA22C8A34CCC5E58072D9D3AAB9FC27989E034B47EBD44AB73D643F78 |
| H04 | 2,339,138 | https://explorer.minima.global/search?q=0x0000A82B583582A2DC0D4C82FD3CBDD324D88BF266DF388BB222D47A6FA698FE |
| H05 | 2,339,142 | https://explorer.minima.global/search?q=0x00015B55B4E254358AEF86DE58E9AED3340D638F615A682A2070FF2C5D6E8E66 |
| H06 | 2,339,146 | https://explorer.minima.global/search?q=0x0000645CEB7BE46CE8C359D2E41A68028D260B51D8BF68A88CF4A69B9A178C9A |

Measured TxPoW sizes (bytes): H01 7,233; H02 8,736; H03 6,134; H04 2,742; H05 8,209; H06 6,760. All are below the
section 7 estimates.

**Stops:** none.

**Recorded anomalies (not stop conditions):**
- Before P0, the nodes read "slow" under a concurrent build. P0 started once both read healthy.
- An inert lingering 9201 JVM from the resync (PID 33600) was left untouched.
- The `balance` "confirmed" figure includes tracked, non-owned coins.
- R09's unlisted state ports and the rule for choosing F were fixed in the fixture block before H01.

This record closes green; STEP2-DEMO-01 may proceed subject to its own approval.

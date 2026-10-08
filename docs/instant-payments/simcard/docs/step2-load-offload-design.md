# Instant payments, step 2: loading from and offloading to the chain

**Version 2, 2026-09-28**, revised the same day after the founder's review (decisions in section 13). **Status:**
design and dry-run measurement only. No app code, no chain writes. The two on-chain test records are drafted and wait
for approval: [`STEP2-PRESEED-01`](STEP2-PRESEED-01.md) and [`STEP2-DEMO-01`](STEP2-DEMO-01.md).
**Brief:** the founder's goal of 2026-09-28 ("really load the instant wallet with an onchain transaction and off load
it the same way with the receiving wallet and even more with a 3rd wallet... abstracting for now the security of
double spending"). **Builds on:** `chip-balance-design.md` section 0a (Stage 1, the app plays the chip),
`../stables-payment-layer-agent-brief.md` (v3 pivot, decisions 13 to 15), the shipped protocol
`website/dapp/3-test/assets/instant-protocol.js` (scheme 0x04, build 101).
**Measured on:** lab peer 9101, Minima **1.0.45.15**, RPC 9105, chain tip about block 2,338,950. Dry runs only
(`runscript`, `status`, `help`, the local transaction builder with `txndelete`), in-process runs on the same node's
jar (`measure/java/KissRunScaled.java`, real 8-decimal token scaling), an in-memory signature-size probe
(`measure/java/Step2SigSize.java`) and an in-process address check on two jars (`measure/java/Step2Address.java`,
new). Nothing was posted, signed, tracked or imported on any node.

**Tags.** VERIFIED = measured (receipt named) or read at the cited source. ASSUMED = design, arithmetic or
expectation, with the reason. Source citations `src/...` are the Minima source tree in
`work/scratch/minima-core-runtime-gap-2026-08-07/src/org/minima/` (1.1.2.6 build); where the lab node's 1.0.45.15
jar ran the same code, that is said. **Evidence level:** everything measured here is **L1** in the builder-kit sense
(lab node, one operator, dry runs) and **exploratory mode** under `EXPERIMENT_GOVERNANCE_STANDARD.md` section 3: it
cannot ratify anything. Nothing is L2 or L3.

**Receipts (version 2):** `../measure/receipts/step2v2_covenant_branches.json` (58 transactions, every input run,
compared case by case with v1), `step2v2_addresses.json`, `step2v2_txn_sizes.json`, `step2v2_probes.json`.
**Scripts:** `../kiss/step2/instant_registration_v2.kiss`, `instant_vault_v2.kiss` and their deployable
`.clean.txt` forms. **Tools:** `../measure/step2v2-*.mjs`, `../measure/java/`.
**Version 1** (with the daily limit and the 5-year retirement) stays reproducible and is not deployable: receipts
`step2_*.json`, tools `step2-*.mjs`, texts in `../kiss/step2/v1_superseded/`, this document as reviewed in
`v1_superseded/`.

---

## Summary for Chuck

**Yes, the full demo is feasible** with two small covenants and no change to Minima:

1. **Load.** Wallet A sends, say, 100 Winiwa from Savings to a shared **vault** address. The coin it creates carries
   A's Instant account id. A's own node sees that transaction confirmed (3 blocks, about 2.5 minutes) and adds 100
   to A's Instant payments, once.
2. **Pay offline.** A pays B by tap, B pays C by QR. Unchanged from today: nothing touches the chain.
3. **Offload.** C (who never loaded anything) moves 25 to Savings. C's app takes 25 off C's Instant balance first,
   then sends one transaction that takes A's load coin from the vault, pays 25 to C's own Savings, and puts the
   other 75 back in the vault. B does the same with part of what is left. The vault is **pooled**: whoever holds
   Instant money can take it out, whoever loaded it.

**How a withdrawal is authorised (design A, as you decided).** Each account has one small **registration coin** per
currency on chain. It names three things: the account's dedicated withdrawal key, the account's own Savings address,
and the currency. A withdrawal must spend it, be signed by that key, and pay only that Savings address. The key is a
separate Minima key made for this purpose only, never used to hold Savings.

**What changed after your review.**
- **No daily cash-out limit.** The limit, its rolling window and the block it was counted from are gone. Three state
  slots (ports 4, 5 and 6) stay **reserved and unused**, so a later registration version could add a limit without
  moving anything else.
- **No 5-year sweep.** The retirement branch and its successor address are gone. The way out is the **always-open
  exit**: every registered account can always move money to its own Savings, anyone can merge vault coins, and the
  owner of a registration can always close it. Nothing is ever swept; money on a lost phone is like lost cash.
- **One more fix the checks found:** a registration coin created with a missing field could not even be closed.
  Closing now comes before the field checks, so its owner always gets that atom back.
- A side benefit: neither script reads the block height any more, so a signed withdrawal can never go stale while
  it waits to be mined.

**The honest trust statement.** In this stage **the vault trusts the apps**. The chain makes sure money only leaves
the vault to a registered owner's own Savings, signed with that owner's key, with the change returned exactly. It
**cannot** know whether the app took the money off the Instant balance first. **Without a limit, someone with a
modified app or a hand-built transaction can take any amount from other people's loads, up to everything in the
vault.** That is acceptable only because Winiwa and xWiniwa are valueless test tokens, and it is exactly what the
Stage 2 chips fix: the chip's own signed debit will authorise each withdrawal. Section 4.7 states it in full.

**Measured (L1, dry runs).** All 58 covenant transactions behaved as designed (22 honest, 36 refusals). The 38 that
also existed in version 1 give the same verdict, refused by the same input, as before: nothing else changed. A
withdrawal now costs the registration coin **86 to 93** instructions (was 129 to 136) and each vault coin **28 to
31**, of 1,024 allowed. A withdrawal is **11.0 KB** with one vault coin (was 11.5); at most **20 coins** fit the
Core companion's reply cap and 30 the 64 KB transaction cap, as before.

**The final addresses** (clean form, computed by the lab node's Minima 1.0.45.15 and checked on the 1.1.2.6 code):
registration `0x5337459E075F10B5340ACF645B7815D016570787ACBF632CD5ADBB19C8F45449`, vault
`0xE23CA9F24CF5BDC49B75964DA145A0AE75F69E6DFD37BDCEAB5765AEB3A53413`.

**The demo** (section 10): A is the Pixel 7 Pro, B the Pixel 7, C the web preview on the laptop against lab node
9101. Six on-chain transactions, all visible on the Minima explorer; after the last one the vault is empty.

**What you decide now** (section 13): approve the two test records (a dust check on lab node 9101, then the demo),
their amounts, the witness node, and the QR path for the B to C payment.

---

## 1. What the chain sees

| Object | Where | What it holds | Who can move it |
|---|---|---|---|
| **Load coin** | the vault address | the loaded amount, any currency; state: magic, account id, the loader's Savings address | a withdrawal (beside a registration coin) or a merge |
| **Change coin** | the vault address | what a withdrawal or merge returns; **no state** | the same |
| **Registration coin** | the registration address | one atom of any token (the app uses Winiwa); state: account id, withdrawal key, payout address, the currency it governs | only its own key: withdraw or close |
| **Withdrawal** | a transaction | registration coin (input 0) + vault coins in; payout, change, registration out | built by the owner's app, signed by the withdrawal key |

**Deployment order** (acyclic, VERIFIED by construction): the registration script names no address, so its address
comes first; the vault script names the registration address as a literal. Neither needs a deploy transaction: a
covenant exists once a coin sits at its address.

**Final addresses** (VERIFIED, receipt `step2v2_addresses.json`): the live lab node 9101 (Minima **1.0.45.15**,
`runscript`), the same two calls in-process on the 1.0.45.15 jar, and in-process on the **1.1.2.6** source-build jar
all return the same clean text and the same address. They are the addresses of the **runscript clean form**, a
single line, which is fixed by its own cleaning (clean of clean is identical). Every node and app must register and
spend exactly that text (`kiss/step2/*_v2.clean.txt`): `newscript` files text as given, so the multi-line source
would track a phantom address (txn-building laws 2 and 3; phantoms listed).

- **Registration v2:** `0x5337459E075F10B5340ACF645B7815D016570787ACBF632CD5ADBB19C8F45449`
  (`MxG082J6T2PS1QV22QJ82MFCHDNG5EG2PBGF1TCNTHWPYDDNCCSHT2K96PU118J`). Clean text `instant_registration_v2.clean.txt`,
  589 bytes, SHA-256 `a033264f9442cded205a8f7224d41e2387763148e2138351b2e0fbf541ce2d9e`. Phantom if the multi-line
  source were registered: `0xC4B574EA362B47D8DDA72518E696908F0A7BFE363A2B58F90822463436EDD12F`.
- **Vault v2** (names the registration address): `0xE23CA9F24CF5BDC49B75964DA145A0AE75F69E6DFD37BDCEAB5765AEB3A53413`
  (`MxG08727WKV4J7YNN29MTCM9MGKB85EENR9SRFT6UUSTAQNCMNB799K2EU5DAJE`). Clean text `instant_vault_v2.clean.txt`,
  465 bytes, SHA-256 `e63e0452b1a3d3e641f7b3016e1318070e0291223e0dae48a74f826bc0b76f6a`. Phantom:
  `0x5FF94F305A3CFCDB24A1D3B00DE5C8EC495C3795FFD9AF37C63C785A54290C6C`.
- The version 1 addresses (`0x8E1CC987DBA05EAFE8967A8F51DFC3F5496CF0F82F4640980B934987994826B7`,
  `0xC1EA8355E70CC00C70AD0AF3E15DEE4E3C5111A63F67376DC1EFBC64CC6ACE62`) are superseded and must never receive a coin.

**Port map** (one state block per transaction, doctrine 1.1; the registration coin keeps it):

| Port | Meaning | Carried by |
|---|---|---|
| 0 | magic `0x53544931` ("STI1") | load and registration coins |
| 1 | account id: SHA-256 of the Instant P-256 public key (as `instant-protocol.js` computes it) | load and registration coins |
| 2 | dedicated withdrawal public key | registration (and a first load, harmlessly) |
| 3 | payout address: the owner's own Savings address | registration; also every load, so the loader's node keeps it (3.2) |
| **4, 5, 6** | **reserved, unused.** v2 neither reads nor pins them; the app leaves them unset. A later registration version with a limit would use them as v1 did (window start, amount used, claimed block) | nobody |
| 7, 8 | amount, operation (1 withdraw, 2 close, 3 merge; anything else is refused) | per spend |
| 10, 11 | vault change (or merged total), registration dust | per spend |
| 12 | the currency (token id) this registration governs | registration |

---

## 2. The vault covenant (`kiss/step2/instant_vault_v2.kiss`)

Generic by token id: every load of any currency is its own coin. **Two branches** (VERIFIED, receipt
`step2v2_covenant_branches.json`):

- **WITHDRAW (op 1):** input 0 must be at the registration address, this coin's currency must equal port 12 (which
  the registration coin pins), and output 1 must return the declared change to the vault **with no state**. 28 to 31
  instructions per vault coin. The registration coin does the rest (section 4.2).
- **MERGE (op 3), anyone:** vault coins of one currency become one coin that carries no state, exactly the sum. 39
  per coin. It exists to undo fragmentation (section 7); it needs no signature, so it works everywhere without an
  approval.

There is **no retirement branch** (decided, section 6). Operation 4, v1's retirement, is now refused like any unknown
operation: v1's exact honest retirement is refused by every coin (measured `NEG_V_op4_retire_after_dormancy_to_old_successor`),
and so is operation 4 on a 10-year-old coin (`NEG_V_op4_after_10_years_to_anyone`), in-process and on the live node
(13 instructions, refused).

Why change and merged coins carry no state: a vault coin with state naming an account would look like a new load for
that account. Forcing `keepstate FALSE` on every vault-bound output means **the only coins at the vault that carry an
account id are real loads**, paid in from outside (measured refusal `NEG_A_change_kept_with_state_fake_load`).
Minima's conservation rule is "outputs never exceed inputs, per token" (VERIFIED `src/objects/Transaction.java`
checkValid; the difference is burnt), so every branch pins its outputs to exactly the inputs; a skim or a burn is
refused (measured `NEG_A_change_skimmed_to_extra_output`, `NEG_V_MERGE_skims`).

The vault reads only the spending transaction's state, never a coin's own stored state, so a coin sent to the vault
with any state at all, or of any token (native MINIMA included), is withdrawable like any other (measured trap probes,
`step2v2_probes.json`).

---

## 3. Load

### 3.1 The transaction

A Savings send to the vault address with state `{0: magic, 1: account id, 3: my Savings address}` and
`storestate:true`. It is an ordinary Savings spend: the wallet signs its own coins, exactly as today's Send does
(`send` supports `state:{}` and `storestate:`, VERIFIED `help command:send` on 1.0.45.15). **The first load in a
currency also creates the registration coin in the same transaction** (one atom of Winiwa to the registration
address, state ports 0 to 3 and 12): both outputs carry the same state, which is harmless (section 5). Sizes
(VERIFIED components, ASSUMED sums, receipt `step2v2_txn_sizes.json`): **7.8 KB**, or **8.1 KB** with the
registration, of which 4.1 KB is the wallet signature. A Savings that needs several input coins adds about 1.85 KB
per coin and 4.1 KB per extra signing key (ASSUMED from the same parts); the app's existing auto-combine handles
fragmented Savings.

### 3.2 Detection and crediting (the app's own node)

- **Confirmation rule:** credit when the load transaction has **3 confirmations**, the app's default confirmation
  policy (UX law 16d). The app already asks exactly this question for Savings sends: `txpow onchain:<txpowid>`
  returns `{found, block, tip, confirmations}` (VERIFIED `assets/tx-mirror.js` lines 6 and 741; `help command:txpow`
  on 1.0.45.15). Crediting does not depend on the load coin still being unspent: a withdrawal may spend it one block
  later, which is fine, because the credit rests on the load transaction being in the chain.
- **Idempotence key: the load coin id.** A Minima coin id is SHA3(first input coin id, output index) (VERIFIED
  `src/objects/Transaction.java` calculateCoinID), so the app knows it the moment it builds the load. The credit and a
  `seen` record `load:<coinid>` are written in one durable store transaction, the way `receive()` already writes a
  payment and its `seen` key, so a load is credited **at most once**, whichever path finds it first.
- **Two paths find a load.** (1) The app's own pending record (fast path; covers its own loads even if the coin is
  spent quickly). (2) A scan of the vault for unspent coins with `port 1 = my account id` at 3 or more blocks deep
  (covers loads someone else made for this account, and an app that lost its pending record while the coin is still
  unspent).
- **Edge case, stated honestly:** `txpow onchain:` answers only inside the unpruned window (its help says so). A phone
  that posts a load and then stays away for more than about 15 hours may find the load neither answerable nor
  unspent. The row then stays pending and says **Proof unavailable** (four-state law); it is never credited on a guess
  and never dropped. How to recover it (the node's own history of its relevant coins) is implementation work
  (section 12). It cannot happen in the demo.
- **Tracking.** Because port 3 carries the loader's own Savings address, **the loader's node treats its own load
  coins as relevant with no tracking at all**: a coin is relevant when a hex state variable is one of the wallet's
  addresses or keys (VERIFIED `src/database/txpowtree/TxPoWTreeNode.java` checkRelevant). The same holds for the
  registration coin (its key and payout are the owner's). Every app also registers the vault script with
  `newscript trackall:true` at start, in its **clean form** (txn-building law 2; `ensureCovenantTracked` already does
  this and avoids the embedded node's multi-line `newscript` crash), because a **withdrawer** must see other people's
  vault coins.
- **The `relevant:false` gotcha:** every vault read goes through `tv81CoinsAtAddress` / `tv81CoinsById`, which ask
  both forms and merge by coin id (VERIFIED `assets/test-channel-bootstrap.js` lines 1804 and 1837; memory
  `project_covenant_read_relevant_false`). Never an inline query.
- **Tracked is not owned:** a node that tracks the vault counts its coins in wallet-level reads (doctrine 5.2). The
  vault and registration addresses must join the app's infra exclusion list, or the whole pool appears in Savings as
  a phantom (UX law 9b).
- **Core companion reply cap:** never list the whole vault on Core (100,000 characters is roughly 120 to 200 coins,
  ASSUMED at 500 to 800 characters each). Look up by coin id; on nodes that support them, narrow with
  `coins ... tokenid: checkmempool:true` and, where present, `state:` or `totalamount:` (the 1.1.2.6 source has both,
  the 1.0.45.15 help lists neither: version-dependent, ASSUMED on the phones).

### 3.3 What the Wallet shows while a load is pending

- One activity row, title **"To Instant payments"**; the status moves Sending, Broadcasted, Confirming 1/3 ... 3/3,
  **Added** (UX laws 2, 13, 14, 15).
- The Instant payments currency row shows **+100.00** beside its figure, with no words (law 19), until the credit;
  the Savings row drops by 100 as for any send. Proposed: the Wallet total counts the pending amount, so it does not
  dip for two minutes (the Savings debit is also still unconfirmed at that point).
- After Confirm the app lands on the Wallet (law 1). No toast (law 3). When the credit happens the row reads Added and
  the + figure disappears.
- If the load never confirms (dropped), the row says so and nothing is credited: indeterminate is never a verdict
  (doctrine 5.3); after the chain says "not found" for longer than the mempool keeps it, the row reads Not sent and
  the Savings figure returns.

---

## 4. Offload

### 4.1 Debit first

Pressing Confirm **commits the debit** in one durable store transaction, with a withdrawal id, exactly as `pay()`
commits before it emits. Only then is the transaction built. The same withdrawal id is reused on every retry, so one
press can never debit twice. The debit is reversed **only** when the app can prove nothing was posted (the build
failed before `txnpost`, or the person refused the MiniDapp approval). A posted withdrawal that is later dropped is
rebuilt with fresh vault coins under the same id and the same debit.

### 4.2 The withdrawal transaction (`kiss/step2/instant_registration_v2.kiss`)

Inputs: the account's registration coin for that currency at **input 0**, then vault coins of that currency. Outputs:
**0** the amount to the registered Savings address, **1** the change back to the vault (only if any), **last** the
registration coin re-created. The registration coin checks (VERIFIED, 86 to 93 instructions):

1. it is input 0 and it is **signed by the withdrawal key** stored in its own state (`SIGNEDBY(PREVSTATE(2))`);
2. (a close stops here, section 5); its magic, account id, key, payout and currency are unchanged
   (`SAMESTATE(0 3)`, `SAMESTATE(12 12)`);
3. the amount is positive;
4. the change equals **everything of that currency coming in, minus its own dust if it is that currency, minus the
   amount** (`SUMINPUTS`, one instruction whatever the number of inputs, VERIFIED to run on 1.0.45.15 live,
   receipt `step2v2_probes.json`);
5. output 0 pays exactly the amount, in that currency, to the registered payout address; the output count is exact;
   the registration coin comes back to its own address with all of its amount and its state.

Each vault coin checks that input 0 is a registration coin, that its currency is the one the registration names, and
that output 1 is its change (section 2). So the whole transaction is valid only if every input agrees.

Measured refusals (all refused on the input named, receipt `step2v2_covenant_branches.json`): unsigned, signed by
another key, payout redirected in the output or in the state, key swapped in the state, account id swapped in the
state, change skimmed to an extra output, change understated, change kept with state (a fake load), a vault coin of
another currency, no registration at input 0, a vault coin alone, the registration not at input 0, the registration
re-created elsewhere, without state, not at all, or with less than it held, an extra keepstate output at the vault, a
zero or negative amount, a registration for xWiniwa pointed at Winiwa, and A's registration paying C.

### 4.3 How the vault authorises a withdrawal: the four designs compared (A decided)

| | **A. Registration coin + dedicated Minima key** (decided) | **C. Registration coin + app-held SHA-256 hash chain** | **B. The loader's key inside each load coin** | **D. The vault checks the Instant P-256 key** |
|---|---|---|---|---|
| Pooled (C can spend what A loaded) | yes | yes | **no**: only the loader can take out its own loads, so C (who never loaded) cannot offload. Fails the goal | n/a |
| Authorisation on chain | `SIGNEDBY` a key pinned in the registration coin | reveal the next link: `SHA2(link) EQ head`, the new head is the link | `SIGNEDBY` per coin | impossible: KISS has no elliptic-curve check (brief, verified facts) |
| Instructions, registration input (VERIFIED) | 86 to 93 | 95 to 100 | | |
| Withdrawal size, one vault coin (VERIFIED parts) | **11.0 KB** (4.1 KB of it the signature) | **6.9 KB** | | |
| Needs `txnsign` | yes: one approval per offload in a MiniDapp in read mode, Admin pairing on Core | **no**: works in read mode and on Core without Admin | | |
| Where the secret lives | the node's wallet, as a key used for nothing else | the app's own store, beside the Instant key: physically separate from the node | | |
| Front-running | **impossible**: every witness signature is verified against the transaction id (VERIFIED `src/system/brains/TxPoWChecker.java` checkSignatures), so a changed transaction loses its signature | **possible, and now unbounded**: anyone who sees the link in the mempool can post a competing withdrawal of **any** amount (measured `C_FRONTRUN_same_link_whole_vault_still_valid`: valid). It still pays only the owner, but not the amount the owner's app debited | | |
| Uses | 262,144 signatures per default key (brief, verified facts) | the chain length set at registration (for example 10,000), then re-register | | |
| Maturity | the Minima-native pattern; the app already signs a covenant spend with an explicit key (order cancel, `test-channel-bootstrap.js` line 4638, L2 on V9) | a new pattern of ours, L1 only | | |

**Decided: A.** It is the standard Minima pattern, the app already uses it, and nothing in the mempool can be turned
against the owner. Without a limit, C's front-running weakness would be worse than before. C stays measured for the
record only.

### 4.4 Key separation: where the withdrawal key lives

The withdrawal key is made with `keys action:new`, which creates a key pair in the node's key table **without** a
Savings address (VERIFIED `src/system/commands/search/keys.java`; `help command:keys` on 1.0.45.15 lists `new`). It is
derived from the seed and the key's index (VERIFIED `src/database/wallet/Wallet.java` createNewKey: private seed =
hash(base seed, index)). It is never used for a Savings address or for change; it signs only withdrawals, by
`txnsign publickey:<key>` (the explicit-key form the order cancel uses, because `publickey:auto` finds nothing to sign
on a script coin). The separation is **logical, not physical**: the key sits in the same node wallet as the Savings
keys, because only the node can make a Minima signature (the phone's hardware keystore cannot). Stated honestly: a
thief who controls the node controls both.

| Platform | Where the key lives | Signing |
|---|---|---|
| Standalone Android app (A and B) | the embedded node's wallet in the app's private storage | in-process, no approval |
| MiniDapp | the host node's wallet (`keys` is not on the read-mode write list, VERIFIED `src/system/commands/CommandRunner.java`; ASSUMED on the host's version) | `txnsign` queues for one approval per offload |
| Core companion | Minima Core's wallet (`keys`, `txnsign` are on the companion allowlist, VERIFIED `CommandPolicy.java`) | needs Admin pairing; read-only pairing refuses |
| Web preview (C in the demo) | the lab node's wallet, over RPC | direct |

Recovery: after a seed restore the node recreates only its default keys; the withdrawal key returns only if the app
recreates the same index (ASSUMED). If it does not, the account registers again with a new key (free, automatic at
the next offload); the old registration's atom stays locked, and nothing in the vault is (section 6). The Instant
balance itself lives in the WebView's store and is lost with the app data anyway (Stage 1: like cash).

### 4.5 No daily cash-out limit (decided 2026-09-28)

- **Decision.** No limit. It existed only because in this test stage the "chip" is the app, which is not trusted;
  the founder's standing decision 14 designs from full trust in the chip. And section 4.7 of version 1 had already
  shown that it did not bound an attacker (registrations are free).
- **What was removed from the registration coin:** the window start, the amount used, the claimed block and its
  20-block freshness check. The registration input fell from 129 to 136 instructions to **86 to 93**.
- **A side effect worth having:** neither script reads `@BLOCK`, `@BLOCKMILLI` or `@COINAGE` any more, the globals
  that make a script block-dependent (VERIFIED `src/kissvm/Contract.java` getGlobal), and every measured input reports
  monotonic. A monotonic transaction is script-checked once and cannot go stale in the mempool (VERIFIED
  `TxPoWChecker.checkTxPoWScripts`, `NIOMessage`). v1's "claimed block too old, rebuild" failure is gone.
- **The reserved slot: ports 4, 5 and 6.** v2 neither reads nor pins them (measured
  `A_WITHDRAW_reserved_ports_4_to_6_not_read`: junk in them changes nothing); the app leaves them unset. A later
  registration version with a limit would use them exactly as v1 did (4 window start, 5 amount used, 6 claimed
  block), so no other port has to move.
- **How a limit would come back, if ever:** a new registration text has a new address, and the vault names the
  registration address as a literal, so it also needs a new vault naming it. The v2 vault and its registrations stay
  open for ever (section 6); new loads would go to the new pair. That is the same "fresh version" pattern as the
  Instant account itself.
- **What the app still refuses in place** (law 11), before debiting: an amount above what the vault can pay right
  now ("Instant payments cannot move this much to Savings right now", with what can move).

### 4.6 Failures, retries and contention

- **Registration coin busy:** it is re-spent by every withdrawal, so one account makes one withdrawal per currency per
  block; the next waits for the previous to confirm (ASSUMED behaviour of the builder; the same as today's vault lanes).
- **Vault coin taken by someone else's withdrawal:** the loser's transaction is refused ("input already spent"); the
  app rebuilds with other coins under the same withdrawal id. Selection prefers coins not in the mempool
  (`coins ... checkmempool:true`, VERIFIED on 1.0.45.15 help) and picks at random among coins large enough.
- **No stale withdrawals:** with no block reference a valid withdrawal stays valid until one of its coins is spent
  (4.5).
- **Not enough in the vault:** the app refuses before debiting and says what can move.

### 4.7 What an attacker could do (the honest statement)

**What the chain guarantees** (VERIFIED by the 36 measured refusals):
- nothing leaves the vault except to a registered payout address, beside that registration coin, signed by its key;
- the change always returns to the vault, exactly, and never carries state, so no withdrawal can manufacture a load;
- a registration coin's key, payout, account id and currency cannot be changed by whoever spends it, and only its key
  can close it;
- an outsider with no registration and no key cannot move anything (`NEG_A_no_registration_at_input_0`,
  `NEG_A_vault_coin_alone`); anyone can merge vault coins, which moves nothing out.

**What the chain cannot know:** the Instant balance. Payments never touch the chain, so the vault cannot tell whether
the app debited first. So:
- **Without a limit, a modified app, or anyone with a hand-built transaction, can take any amount from other
  people's loads, up to everything in the vault**, without having any Instant balance. One transaction can empty up
  to 30 vault coins (measured `A_WITHDRAW_large_amount_no_limit`, `A_WITHDRAW_everything_5_coins_no_change`), and
  registering costs one atom. The pool becomes under-backed and whoever offloads last finds it short.
- A modified app can also credit itself without loading, and pay the same money twice offline. Those are the
  double-spend questions the founder put aside for this stage, and they are the same trust: **trusted software**.
- **This is acceptable only for valueless test tokens**, and it is exactly what Stage 2 fixes: the chip's own signed
  debit authorises the withdrawal, so the chain no longer trusts the app. No global brake is added in the meantime
  (decided, section 13).
- The demo record treats a vault coin taken by a stranger mid-run as a stop condition (STEP2-DEMO-01 section 13).

---

## 5. Registration

- **What:** one coin per account per currency at the registration address, holding **one atom of any token** (the app
  uses Winiwa, which every wallet gets from the faucet) and naming the currency it governs in port 12. So C, who holds
  no xWiniwa in Savings, can still register to move xWiniwa out (measured
  `A_WITHDRAW_xWiniwa_via_Winiwa_dust_registration`). The app sets ports 0, 1, 2, 3 and 12 and nothing else.
- **Cost:** one feeless transaction, **7.9 KB** (VERIFIED parts), one atom locked; or nothing extra when it rides the
  first load (8.1 KB instead of 7.8 KB). One registration per transaction per currency, because all keepstate
  outputs of a transaction share one state (doctrine 1.1).
- **When (decided):** automatically, **at the first load in a currency, or at the first offload in a currency**,
  whichever comes first. At a first offload the app registers, waits one block (a coin must be in a block before it
  can be spent), then withdraws: about one extra minute, shown as the status **Preparing** on the same row. In a
  MiniDapp the registration is one more approval.
- **Close:** the owner can close a registration at any age (signed; everything it holds returns to the payout
  address; 29 instructions, 8.2 KB; measured also after 10 years and with 100 Winiwa sent to it by mistake). Key
  rotation or a new Savings address = close and register again. **Close is checked before the field pins** (v2):
  it needs only the key (port 2) and the payout (port 3), so a registration created with a missing field by a buggy
  app is refused for withdrawals but its owner still gets the atom back (trap probes, `step2v2_probes.json`).
- **Forged registrations:** anyone can place a coin at the registration address with any state. The script makes that
  exactly equivalent to registering: a coin naming a victim's account id with the forger's key pays only the forger's
  own address, and a coin carrying the victim's key with the forger's payout can only be spent by the victim's key.
  **App rule:** use only the registration coin the app itself created (follow its coin id from creation), and check
  that both its key and its payout are the app's own before signing.

---

## 6. Retirement: the always-open exit (decided 2026-09-28)

**The law and its clarification.** Founder law of 2026-09-26 (D27-q, TGE-D09): every new vault carries a mechanical
retirement branch, so that a token is never hostage to one vault. Version 1 applied it literally: after about 5
years without movement, anyone could move a vault coin to a successor fixed at deployment. Reviewing it, the founder
clarified on 2026-09-28 (memory `feedback_vault_retirement_branch_law.md`, "Clarification, founder 2026-09-28
(Instant payments vault): no time-based retirement"): "it should not have time limit like 5 years." **For a vault
that only holds money 1:1 with no pricing, the retirement path is the always-open exit: every holder can always move
their money back to Savings. Nothing is ever swept; money in a lost device stays like lost cash.** Timers belong only
where a vault prices a token, and even there only after asking.

**Resolution for this vault.** The Instant vault prices nothing and issues nothing: Winiwa and xWiniwa leave it
exactly as they came in. There is no balance sheet to hand to a successor, so each holder's exit is the retirement.
The RETIRE branch (operation 4), the dormancy constant and the successor address are removed; nothing is ever swept.
A future design (Stage 2 chips, or a limit) is a **new** vault beside this one, never an upgrade of it; this one stays
open for as long as anyone holds a coin in it.

**Re-check: can any remaining branch trap coins?** (VERIFIED, receipts `step2v2_covenant_branches.json` and
`step2v2_probes.json`; no branch reads the block height or a coin's age, so none of this can change with time)

| Coin | Way out | Evidence |
|---|---|---|
| Load, change or merged coin at the vault | **WITHDRAW**, beside any registration coin for its currency, signed by that registration's key, to that registration's Savings; anyone can register, so the exit is open to every Instant holder | the 16 honest withdrawal cases, including `A_WITHDRAW_coin_10_years_old`, `A_WITHDRAW_whole_coin_no_change`, `A_WITHDRAW_everything_5_coins_no_change`, `DEMO_T6_A_withdraws_40_vault_to_zero` |
| | **MERGE** by anyone, at any age | `V_MERGE_3_coins`, `V_MERGE_coins_10_years_old` |
| | whatever state it carries, whatever token it is | trap probes: junk state, native MINIMA |
| | nothing else: operation 4 and every unknown operation are refused | `NEG_V_op4_*`, `NEG_V_unknown_operation` |
| Registration coin | **WITHDRAW** re-creates it; **CLOSE** by its owner at any age and any amount, even if created with a missing field | `A_CLOSE_dust_to_owner`, `A_CLOSE_after_10_years`, trap probes (missing port 12; 100 Winiwa by mistake) |

**What can still be lost, stated honestly:**
- An Instant balance on a lost or wiped phone, like cash. Its backing stays in the pool, withdrawable by everyone
  else's offloads (the pool becomes over-backed).
- A registration coin whose owner lost the withdrawal key: one atom. The account registers again with a new key (free)
  and loses no access to the pool.
- Coins someone sends to the registration address without state, or of a token whose own token script forbids moves:
  a sender's mistake, as with any wrong address.

**Visibility (pruning).** A node that did not track the vault when a coin was created cannot see it once it is older
than the unpruned window, about 1,080 to 1,440 blocks, 15 to 17 hours (doctrine 5.4; memory
`project_vault_pruning_window_risk`). This limits **seeing**, not **spending**: a coin is always spendable by whoever
holds its proof. Consequences: every app tracks the vault from its first start (forward capture); a loader's own loads
and an owner's own registration coin are relevant to their nodes anyway (3.2); a fresh install after a quiet day sees
no old vault coins, so its offload says **Proof unavailable** (four-state law), never zero, until activity or an
anchor snapshot. Recommended: extend the existing anchor snapshot (which already carries the faucet and xWiniwa vault
proofs) to carry the largest Instant vault coins. Not needed for the demo, where all three wallets track the vault
before the first load.

---

## 7. Contention and sizes

**Sizes** (VERIFIED parts, ASSUMED sums; receipt `step2v2_txn_sizes.json`; one real provable coin measured on the
live builder, extra covenant inputs at 1,854 bytes each, an upper bound; one signature measured at 4,125 bytes;
header allowance 1,200 bytes; Core reply check 2 x size + 4,000 <= 100,000):

| Transaction | Size (v1) | 64 KB cap | Core reply cap |
|---|---|---|---|
| Load | 7.8 KB (7.8) | yes | yes |
| First load + registration | 8.1 KB (8.1) | yes | yes |
| Registration alone | 7.9 KB (7.9) | yes | yes |
| Withdrawal A, 1 / 2 / 5 / 10 vault coins | 11.0 / 12.9 / 18.4 / 27.7 KB (11.5 / 13.3 / 18.9 / 28.2) | yes | yes |
| Withdrawal A, last coin, no change | 10.8 KB | yes | yes |
| Withdrawal A, 20 vault coins | 46.2 KB (46.7) | yes | yes (the most) |
| Withdrawal A, 25 / 30 vault coins | 55.5 / 64.8 KB (56.0 / 65.2) | yes (30 is the most; 31 is over) | **no** |
| Withdrawal C, 1 vault coin | 6.9 KB (7.4) | yes | yes |
| Close | 8.2 KB (8.5) | yes | yes |
| Merge 2 / 10 vault coins | 5.7 / 20.5 KB (5.9 / 20.7) | yes | yes |

**Rule for the app:** at most **10 vault coins per withdrawal** (28 KB, comfortable on every platform); if more would
be needed, merge first (no signature, no approval) or move less. Instructions do not limit it: the registration input
is constant (86 to 93) whatever the number of vault coins (measured up to 30), and each vault coin runs its own 28 to
31.

**Contention** (ASSUMED behaviour from the design, section 4.6):
- **Loads touch no shared coin at all.** Each creates a new coin; any number per block.
- **Withdrawals** touch the account's own registration coin (per account, per currency) and some vault coins. Two
  withdrawals conflict only if they pick the same vault coin; the loser rebuilds. The vault naturally holds many coins
  (every load is one, every withdrawal leaves one change coin), so many withdrawals fit in a block.
- **Fragmentation:** thousands of small loads make large withdrawals need many coins. Merge (by anyone, any time)
  keeps the vault in a few large coins.
- **Chain load:** a load and an offload are each one transaction of about 8 and 11 KB; payments add nothing. Minima
  carries about 450,000 transactions a day for every app together (brief, verified facts).

**Relay policy:** a node does not forward a transaction whose stored state, times the number of keepstate outputs,
exceeds 65,536 bytes, or with more outputs than its limit (32 as declared, 15 after the source's reset to defaults)
(VERIFIED `src/system/network/minima/RelayPolicy.java` and `src/system/params/GeneralParams.java`, 1.1.2.6 values).
Our state is under 400 bytes, with at most 3 outputs and 2 of them keepstate: far inside.

---

## 8. Per-platform feasibility

| Platform | Load | Register | Offload (design A) | Notes |
|---|---|---|---|---|
| **Standalone Android** (A, B) | yes | yes | **yes**, signed in-process | the embedded node is 1.1.1.26: register the clean single-line script (its multi-line `newscript` crash, `ensureCovenantTracked`); NFC for payments |
| **MiniDapp** (read mode) | one approval | one approval | **one approval per offload** (`txnsign` queues, VERIFIED `CommandRunner.java` write list) | the debit waits for the approval; a refusal reverses it |
| **Core companion** | needs Admin | needs Admin | **needs Admin** | read-only pairing shows the feature with an honest refusal (law 4) |
| **Web preview** (C in the demo) | yes (RPC) | yes | yes | dev surface only; needs the lab node and its CORS proxy (`dev-up.ps1 -DevNodes 1`) |

The script texts parse and run on 1.0.45.15 (VERIFIED live), and their clean form and address are identical on the
1.1.2.6 code (VERIFIED in-process). On the embedded 1.1.1.26 and on Core 1.2.5 / 1.6.11 the same KISS functions are
ASSUMED (`SUMINPUTS`, `SIGNEDBY`, `GETINADDR`, `VERIFYOUT` are long-standing); the clean-form canonicalization is
recorded as identical on 1.0.45.15 and 1.1.1.26 (txn-building law 2). The demo checks 1.1.1.26 on chain.

---

## 9. What people see (founder language; screens decided 2026-09-28)

**Loading and offloading are a Send to your other account.**
- The Instant payments pop-up (law 21: all of its actions live there) replaces "Add test credit" with two buttons,
  **Add from Savings** on the left and **Move to Savings** on the right (law 17). Each opens the **same Send sheet**,
  already set: Add from Savings opens Send with **Savings** chosen and the recipient **My Instant payments**; Move to
  Savings opens Send with **Instant payments** chosen and the recipient **My Savings**. The same amount field, the
  same currency selector (law 23), the same Confirm send, the same protection tiers.
- The same two recipients also appear as chips in the Send sheet (`sendContactChips`), so someone already in Send can
  pick them: a Send to your own other account is the load or the offload.
- **One row per operation** (law 2): "To Instant payments" (load) and "To Savings" (offload). Status only in the status
  (law 13): Sending, Broadcasted, Confirming n/3, then **Added** or **Received**; **Preparing** while a first
  registration happens. Step times as for every transaction (law 14).
- **Land on the Wallet** after Confirm (law 1). **No toasts** (law 3). The pending amount sits on the currency row as
  +100.00 with no words (law 19): on the Instant row for a load, on the Savings row for an offload.
- **An offload above what the vault can pay is refused in place** with the reason, before anything is debited
  (law 11). There is no daily limit to explain.
- Minimal information: no "vault", "registration", "covenant" or "on-chain" anywhere a person reads. StablesAgent
  explains if asked.

**Retiring "Add test credit": a fresh account version (decided).**
- The first build with real loads creates a **new Instant account**: a new P-256 key and a new store
  (`stables-instant-v2`), so a new account id. Only this id ever appears on chain.
- It speaks a **new scheme byte, 0x05**. 0x04 joins the refused legacy versions, so a v2 phone never credits a payment
  from a v1 account ("This code comes from an older test version of Stables... Nothing was moved": the message and
  mechanism already exist for 0x02 and 0x03). Test money therefore can never reach a real balance, even by a tap.
- The old account is frozen: not spendable, not counted in the Wallet total, and summarised by one activity row
  **"Test credit retired"** with its figure, so nothing disappears silently (law 4).
- Both phones must run the new build before the demo; a mixed pair refuses honestly.

---

## 10. The demo run plan

The formal protocols are the two draft records: [`STEP2-PRESEED-01`](STEP2-PRESEED-01.md) (dust on lab node 9101)
and [`STEP2-DEMO-01`](STEP2-DEMO-01.md) (the demo). This section is the plain summary.

### 10.1 Cast

| Wallet | Device | Savings | Instant account | Payments |
|---|---|---|---|---|
| **A** | Pixel 7 Pro, standalone app (Chuck's primary phone) | its embedded node | new v2 account | NFC |
| **B** | Pixel 7 (GrapheneOS), standalone app | its embedded node | new v2 account | NFC with A, QR with C |
| **C** | web preview on the laptop (`http://localhost:8080/dapp/3-test/`) against lab node 9101 over RPC | lab node 9101's wallet (it holds Winiwa, V9 reference section 4) | new v2 account in the browser | QR |

B pays C by QR: C shows its receiver code on the laptop screen, B's camera reads it, B confirms, B shows the payment
QR, and **the laptop's webcam reads it** (ASSUMED: the laptop has a webcam). Fallback if not: C runs in Chrome on the
Pixel 7 Pro over USB (`adb reverse tcp:8080 tcp:8080` and the proxy port), which keeps `localhost` a secure context
for WebCrypto and the camera; it is still a separate wallet (lab node 9101) and a separate account. The path is
fixed before the run starts.

### 10.2 What Chuck does

0. **Before:** the agent builds the feature (flag off by default), installs it on both phones (`adb install -r`,
   force-stop first, never uninstall), starts the preview and lab nodes 9101 and 9201, and runs STEP2-PRESEED-01
   once approved. All three wallets have Winiwa from the faucet; the vault is empty.
1. **A loads (online).** On the Pixel 7 Pro: Wallet, tap Instant payments, **Add from Savings**, 100 Winiwa, Confirm
   send. The app returns to the Wallet with "+100.00" on the Instant row; about 2.5 minutes later the row reads
   Added and Instant payments shows 100. (On chain, T1: the load, plus A's registration.)
2. **Airplane mode** on both phones.
3. **A pays B 60 by tap** (Send, Instant payments, hold the phones together). B's Wallet shows "Payment detected.
   Final: 60".
4. **B pays C 25 by QR** (C on the laptop: Receive, Instant payments; B scans, confirms, shows the QR to the webcam).
   C shows 25.
5. **Phones back online.** On the laptop, **C: Move to Savings, 25.** Status Preparing (C registers: T2, about a
   minute), then Broadcasted, Confirming, Received: lab node 9101's Savings +25. (T3 spends **A's load coin**: 25 to
   C, 75 back to the vault.)
6. **B: Move to Savings, 35** on the Pixel 7. Preparing (T4), then Received (T5 spends the 75: 35 to B, 40 back).
7. **A: Move to Savings, 40** on the Pixel 7 Pro (A registered at step 1). (T6 takes the last 40; the vault is
   empty.) Every unit that went in came out, to three different wallets.

### 10.3 Pre-seed gate (before step 1; builder-kit standing gate 1)

STEP2-PRESEED-01: from lab node 9101 with 6 atoms of Winiwa, after approval: register both clean texts on 9101 and
the witness 9201 (the returned addresses must be the final ones); then six honest controls (a first load with
registration, a partial withdrawal, a second load, a merge, a withdrawal of everything that leaves the vault empty,
a close); and fourteen refusals built on the real coins, checked, exported and **never posted** (unsigned, another
key, payout redirected in the output and in the state, currency swapped, change kept with state, change skimmed,
registration not re-created, a vault coin alone, v1's retirement operation, a redirected close, an unsigned close, a
skimming merge, a merge that keeps state). Every atom returns to 9101.

### 10.4 What the explorer shows

Links take the form `https://explorer.minima.global/search?q=<txpowid>` and
`https://explorer.minima.global/address/<address>` (the app's configured explorer, `runtime-config.js`):
- **The load:** A's Savings coins in; out, a coin at the vault address (the load, 100 Winiwa) and one atom at the
  registration address. Whether the explorer displays the state (the account id) is unknown.
- **Each withdrawal:** in, a registration coin and a vault coin (C's spends **A's load coin**, the pooled moment); out,
  25 to C's Savings address, 75 back to the vault, the registration coin again.
- **The vault address page**
  (`https://explorer.minima.global/address/0xE23CA9F24CF5BDC49B75964DA145A0AE75F69E6DFD37BDCEAB5765AEB3A53413`) over
  time: 100, then 75, then 40, then nothing.

### 10.5 Evidence to capture

In the records (STEP2-DEMO-01 section 10): per transaction, the canonical TxPoW id with block number and block id as
seen by 9101 and by the witness 9201, and the explorer link; the vault's and registration address's coins before and
after every step from both nodes; each wallet's Savings and Instant figures before and after, by screenshots taken
over adb (never hand-copied) and a browser capture for C; the apps' `[instant]` log lines; build fingerprints; the
explorer pages.

### 10.6 Approvals needed before anything is posted

1. **Before implementation:** done, section 13 (decisions 1 to 7 decided 2026-09-28).
2. **Before the first on-chain transaction:** approve [`STEP2-PRESEED-01`](STEP2-PRESEED-01.md) and then
   [`STEP2-DEMO-01`](STEP2-DEMO-01.md), both **DRAFT, awaiting founder approval**, with the final addresses (section
   1) and the amounts. This is the first coin at a new covenant address, which the chip-balance design already marked
   as Chuck's call.
3. **Before posting anything publicly** (explorer links on X or Telegram): the drafted comms, per the publish laws
   (full on-chain ids with explorer links, no em dashes).

---

## 11. Measured numbers (receipts)

**Covenant branches** (VERIFIED, `step2v2_covenant_branches.json`: 58 transactions, 22 honest, 36 refusals,
**0 unexpected**; every input of each transaction run in-process on the 1.0.45.15 jar with 8-decimal token scaling;
38 cases shared with v1 give **the same verdict, refused by the same inputs**, and 20 are new; every input reports
monotonic; instructions per input):

| Branch | Registration input | Each vault coin | Notes |
|---|---|---|---|
| Withdraw with change / with no change | 88 / 93 | 31 / 28 | 8-decimal amounts, e.g. 25.12345678 out, 74.87654322 back (v1: 131 to 136) |
| Withdraw with 2, 5, 10, 20, 30 vault coins | 88 each | 31 each | the registration cost does not grow |
| Withdraw 250,000.12345678 of 1,000,000; everything from 5 coins; a 10-year-old coin | 88; 93; 93 | 31; 28; 28 | no limit, no time dependence |
| The demo's three withdrawals (25 of 100; 35 of 75; the last 40) | 88; 88; 93 | 31; 31; 28 | A's registration paying C refused (70) |
| Withdraw xWiniwa, registration holding Winiwa dust | 86 | 31 | |
| Close (also after 10 years) | 29 | | refused unsigned (11), redirected (29) |
| Merge (anyone, also at 10 years) | | 39 | refused: skim, second output, kept state, mixed currency |
| Operation 4 (v1 retirement) | | 13, refused | also refused on the live node (13) |
| Design C withdraw (not adopted) | 95 to 100 | 28 to 31 | front-run with the same link, any amount: **valid** |

**Live cross-check** (VERIFIED): the transaction-free core of the withdrawal (`kiss/step2/reg_core_v2_runscript.kiss`)
counts **30 instructions on the live node and 30 in-process**, monotonic; the live node and the in-process runner
agree on the refusals too (unsigned 7, zero amount 30, payout changed 15). All texts parse on the live node and are
clean-invariant.

**Addresses** (VERIFIED, `step2v2_addresses.json`): live 1.0.45.15, in-process 1.0.45.15 and in-process 1.1.2.6
agree on every clean text and address (section 1).

**Probes** (VERIFIED, `step2v2_probes.json`): `GETINAMT`, `@AMOUNT` and `SUMINPUTS` read 8-decimal token units
exactly at scale 36 and one atom off is refused; `SUMINPUTS` runs on the live 1.0.45.15 node; no v2 text reads a
block-dependent global; trap probes: a vault coin with hostile stored state and a native MINIMA coin at the vault are
both withdrawable, a registration missing port 12 is refused for withdrawal but closable by its owner, a registration
holding 100 Winiwa by mistake closes for all 100. Unchanged finding from v1: the doctrine's trap form
`VERIFYOUT(@AMOUNT ...)` under keepstate **passes** in-process at 8 decimals, so this method does not reproduce the
recorded on-chain failure; the scripts keep the pinned-port form anyway.

**Signature** (VERIFIED, `Step2SigSize.java` on the node jar): a default key (64 x 3) signature adds **4,125 bytes** to
a transaction and verifies (key generation 1.3 s and signing 2.2 s in this run on the laptop; not a phone figure).

---

## 12. What remains unverified

| Item | Status | Risk | Closes in |
|---|---|---|---|
| **Mining** any of these spends on mainnet | **CLOSED, L2 (STEP2-PRESEED-01-R1, 2026-09-28):** all six honest shapes (load plus registration, partial withdrawal, load, merge, withdraw all, close) mined in blocks 2,339,123 to 2,339,146, and both nodes agree | none seen for these shapes | closed |
| The vault and registration spends through `txncheck` on a real node | **CLOSED, L2:** the six honest spends had all four flags true; the 14 refusals were `scripts:false` on the predicted clause (attributed by in-process replay, L1) and never posted | | closed |
| Sizes | **MEASURED (TxPoW bytes, R1):** load plus registration 7,233; partial withdrawal 8,736; load 6,134; merge 2,742; withdraw all 8,209; close 6,760 (11 to 52% under the section 7 estimates, which stay as upper bounds) | | closed |
| `txnsign publickey:` with a `keys action:new` key | **CLOSED, L2 (HP5):** the `keys action:new` key K1 signed H02, H05 and H06, and the registration script accepted them on 1.0.45.15 | | closed |
| Embedded 1.1.1.26 and Core 1.2.5 / 1.6.11 KISS and `coins` filters | ASSUMED | a missing filter only costs reply size | STEP2-DEMO-01 (1.1.1.26) |
| `txpow onchain:` on the phones | used today by the app for Savings (VERIFIED in code); ASSUMED identical for loads | | demo |
| `send` with `state:{}` producing the load coin as designed | ASSUMED from `help` (the app may build it with `txncreate` instead, as the pre-seed does) | | implementation |
| A load whose phone was away longer than the unpruned window (3.2 edge case) | designed as Proof unavailable; recovery path not designed | a pending load that never credits (the money stays in the pool) | implementation |
| The relevance of a coin through a state variable (3.2 tracking) | VERIFIED in the 1.1.2.6 source only | if 1.1.1.26 differs, the vault tracking (`trackall`) still finds the coins | implementation |
| The laptop's webcam for the B to C leg | ASSUMED | fallback in 10.1 | demo prep |
| Explorer shows state | unknown | cosmetic | demo |
| Phone signing time | unmeasured | slower offload confirm | demo |

---

## 13. Decisions for Chuck

**Decided 2026-09-28** (the founder's review of version 1):

1. **How the vault authorises a withdrawal: design A**, as recommended: a registration coin per account per
   currency, signed by a dedicated Minima key, payout pinned to the owner's Savings, pooled vault.
2. **The daily cash-out limit: none** (changed from the recommendation). The limit, window and claimed block are
   removed; ports 4, 5 and 6 stay reserved and unused for a possible later registration version (4.5).
3. **A global brake: none**, as recommended.
4. **Screens: as recommended**: Add from Savings (left) and Move to Savings (right) in the Instant pop-up, both
   opening the shared Send sheet preset with My Instant payments / My Savings; the same two as chips; rows
   "To Instant payments" / "To Savings"; statuses ending Added / Received; the pending amount as a wordless + figure;
   the Wallet total not dipping during a load. The app build comes later.
5. **Retirement: no time-based retirement** (changed from the recommendation). No 5-year sweep, no successor; the
   retirement path is the always-open exit, and nothing is ever swept (section 6).
6. **Retire "Add test credit" with a fresh account version**, as recommended (section 9).
7. **Registration timing: automatic** at the first load or first offload in a currency, as recommended.

**Still open, before the first on-chain transaction:**

8. Approve [`STEP2-PRESEED-01`](STEP2-PRESEED-01.md) (dust on lab node 9101; 6 atoms, all returned) and, after it
   closes green and the app is built, [`STEP2-DEMO-01`](STEP2-DEMO-01.md) (the cast, 100 Winiwa in, 25, 35 and 40
   out). Both are DRAFT, awaiting approval.
9. The final addresses in section 1 (the first coins at new covenant addresses are your call).
10. The witness node for two-node evidence: DevNodesSet 9201 (proposed) or a phone.
11. If the dedicated key cannot sign in the pre-seed (HP5): stop and approve a second pre-seed with a `newaddress`
    key (proposed), rather than switching inside the run.
12. The QR leg of the demo: the laptop webcam or the fallback, fixed before the run.
13. **Before anything public:** approve the drafted posts with the explorer links.

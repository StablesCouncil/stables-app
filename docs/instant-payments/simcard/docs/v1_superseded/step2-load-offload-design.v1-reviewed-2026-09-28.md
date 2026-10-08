# Instant payments, step 2: loading from and offloading to the chain

**Date:** 2026-09-28. **Status:** design and dry-run measurement only, waiting for Chuck's gate. No app code, no
chain writes. **Brief:** the founder's goal of 2026-09-28 ("really load the instant wallet with an onchain transaction
and off load it the same way with the receiving wallet and even more with a 3rd wallet... abstracting for now the
security of double spending"). **Builds on:** `chip-balance-design.md` section 0a (Stage 1, the app plays the chip),
`../stables-payment-layer-agent-brief.md` (v3 pivot, decisions 13 to 15), the shipped protocol
`website/dapp/3-test/assets/instant-protocol.js` (scheme 0x04, build 101).
**Measured on:** lab peer 9101, Minima **1.0.45.15**, RPC 9105, chain tip about block 2,338,900. Dry runs only
(`runscript`, `status`, `help`, local transaction builder with `txndelete`), plus in-process runs on the same node's
jar (`measure/java/KissRunScaled.java`, new: real 8-decimal token scaling) and an in-memory signature-size probe
(`measure/java/Step2SigSize.java`, new). Nothing was posted, signed, tracked or imported on any node.

**Tags.** VERIFIED = measured (receipt named) or read at the cited source. ASSUMED = design, arithmetic or
expectation, with the reason. Source citations `src/...` are the Minima source tree in
`work/scratch/minima-core-runtime-gap-2026-08-07/src/org/minima/` (1.1.2.6 build); where the lab node's 1.0.45.15
jar ran the same code, that is said. **Evidence level:** everything measured here is **L1** in the builder-kit sense
(lab node, one operator, dry runs) and **exploratory mode** under `EXPERIMENT_GOVERNANCE_STANDARD.md` section 3: it
cannot ratify anything. Nothing is L2 or L3.

**Receipts:** `../measure/receipts/step2_covenant_branches.json` (51 transactions, every input run),
`step2_txn_sizes.json`, `step2_probes.json`. **Scripts:** `../kiss/step2/`. **Tools:** `../measure/step2-*.mjs`,
`../measure/java/KissRunScaled.java`, `../measure/java/Step2SigSize.java`.

---

## Summary for Chuck

**Yes, the full demo is feasible** with two small covenants and no change to Minima:

1. **Load.** Wallet A sends, say, 100 Winiwa from Savings to a shared **vault** address. The coin it creates carries
   A's Instant account id. A's own node sees that transaction confirmed (3 blocks, about 2.5 minutes) and adds 100
   to A's Instant payments, once.
2. **Pay offline.** A pays B by tap, B pays C by QR. Unchanged from today: nothing touches the chain.
3. **Offload.** C (who never loaded anything) moves 25 to Savings. C's app takes 25 off C's Instant balance first,
   then sends one transaction that spends A's load coin from the vault, pays 25 to C's own Savings, and puts the
   other 75 back in the vault. B does the same with part of what is left. The vault is **pooled**: whoever holds
   Instant money can take it out, whoever loaded it.

**How a withdrawal is authorised (recommended design A).** Each account has one small **registration coin** per
currency on chain. It names three things: the account's dedicated withdrawal key, the account's own Savings
address, and how much has gone out today. A withdrawal must spend it, be signed by that key, pay only that Savings
address, and stay under the **daily cash-out limit** (proposed 1,000 per currency per day). The key is a separate
Minima key made for this purpose only, never used to hold Savings.

**The honest trust statement.** In this stage **the vault trusts the apps**. The chain makes sure money only enters
the vault as real loads, only leaves to the registered owner's own Savings, with that owner's key, under the daily
limit. It **cannot** know whether the app took the money off the Instant balance first. Someone with a modified app
or a hand-built transaction can therefore take up to the limit per day **from other people's loads**, and because
registering costs one atom of Winiwa, they can register as many accounts as they like. So the daily limit protects
against a buggy app or a stolen key, **not against a determined attacker**. That is acceptable only because the
tokens are valueless; the chip (Stage 2) is what fixes it. Section 4.7 states it in full.

**Measured (L1, dry runs).** All 51 covenant transactions behaved as designed (15 honest, 36 refusals). The heaviest
script uses **136 of 1,024** instructions (the registration coin); each vault coin costs **31**. A withdrawal is
**11.5 KB** with one vault coin and grows by 1.85 KB per extra coin: at most **20 coins** fit the Core companion's
reply cap, 30 fit the 64 KB transaction cap. A load is **7.8 KB**, a first load that also registers **8.1 KB**.

**The demo** (section 10): A is the Pixel 7 Pro, B the Pixel 7, C the web preview on the laptop against lab node
9101. Six on-chain transactions, all visible on the Minima explorer, the last of which leaves the vault empty.

**What you decide** (section 13): design A, the limit, the vault's successor address, the fresh account version that
retires "Add test credit", the screens, and then the preregistered test and the first on-chain transaction.

---

## 1. What the chain sees

| Object | Where | What it holds | Who can move it |
|---|---|---|---|
| **Load coin** | the vault address | the loaded amount, any currency; state: magic, account id, the loader's Savings address | a withdrawal (beside a registration coin), a merge, or retirement |
| **Change coin** | the vault address | what a withdrawal or merge returns; **no state** | the same |
| **Registration coin** | the registration address | one atom of any token (the app uses Winiwa); state: account id, withdrawal key, payout address, today's window, the currency it governs | only its own key: withdraw or close |
| **Withdrawal** | a transaction | registration coin (input 0) + vault coins in; payout, change, registration out | built by the owner's app, signed by the withdrawal key |

**Deployment order** (acyclic, VERIFIED by construction): the registration script names no address, so its address
comes first; the vault script names the registration address as a literal. Neither needs a deploy transaction: a
covenant exists once a coin sits at its address.

**Addresses of the measured texts** (VERIFIED, live node `runscript`, clean-invariant):

| Text | Address | Note |
|---|---|---|
| Registration, design A | `0x8E1CC987DBA05EAFE8967A8F51DFC3F5496CF0F82F4640980B934987994826B7` | fixed by limit 1,000, window 1,728, slack 20 |
| Vault | `0xC1EA8355E70CC00C70AD0AF3E15DEE4E3C5111A63F67376DC1EFBC64CC6ACE62` | **changes** when the real successor is chosen (decision 5) |

**Port map** (one state block per transaction, doctrine 1.1; the registration coin keeps it):

| Port | Meaning | Carried by |
|---|---|---|
| 0 | magic `0x53544931` ("STI1") | load and registration coins |
| 1 | account id: SHA-256 of the Instant P-256 public key (as `instant-protocol.js` computes it) | load and registration coins |
| 2 | dedicated withdrawal public key | registration (and a first load, harmlessly) |
| 3 | payout address: the owner's own Savings address | registration; also every load, so the loader's node keeps it (3.2) |
| 4, 5 | window start block, amount used in the window | registration |
| 6, 7, 8 | claimed block, amount, operation (1 withdraw, 2 close, 3 merge, 4 retire) | per spend |
| 10, 11 | vault change, registration dust | per spend |
| 12 | the currency (token id) this registration governs | registration |

---

## 2. The vault covenant (`kiss/step2/instant_vault.kiss`)

Generic by token id: every load of any currency is its own coin. Three branches (VERIFIED, receipt
`step2_covenant_branches.json`):

- **WITHDRAW (op 1):** input 0 must be at the registration address, this coin's currency must equal port 12 (which
  the registration coin pins), and output 1 must return the declared change to the vault **with no state**. 28 to 31
  instructions per vault coin. The registration coin does the rest (section 4.2).
- **MERGE (op 3), anyone:** vault coins of one currency become one coin that carries no state, exactly the sum. 39
  per coin. It exists to undo fragmentation (section 7); it needs no signature, so it works everywhere without an
  approval.
- **RETIRE (op 4), anyone, after about 5 years without movement:** each coin goes to a successor address fixed at
  deployment (section 6). 36 per coin.

Why change and merged coins carry no state: a vault coin with state naming an account would look like a new load for
that account. Forcing `keepstate FALSE` on every vault-bound output means **the only coins at the vault that carry an
account id are real loads**, paid in from outside (measured refusal `NEG_A_change_kept_with_state_fake_load`).
Minima's conservation rule is "outputs never exceed inputs, per token" (VERIFIED `src/objects/Transaction.java`
checkValid; the difference is burnt), so every branch pins its outputs to exactly the inputs; a skim or a burn is
refused (measured `NEG_A_change_skimmed_to_extra_output`, `NEG_V_MERGE_skims`).

---

## 3. Load

### 3.1 The transaction

A Savings send to the vault address with state `{0: magic, 1: account id, 3: my Savings address}` and
`storestate:true`. It is an ordinary Savings spend: the wallet signs its own coins, exactly as today's Send does
(`send` supports `state:{}`, VERIFIED `help command:send` on 1.0.45.15). **The first load in a currency also creates
the registration coin in the same transaction** (one atom of Winiwa to the registration address, state ports 0 to 5
and 12): both outputs carry the same state, which is harmless (section 5). Sizes (VERIFIED components, ASSUMED sums,
receipt `step2_txn_sizes.json`): **7.8 KB**, or **8.1 KB** with the registration, of which 4.1 KB is the wallet
signature. A Savings that needs several input coins adds about 1.85 KB per coin and 4.1 KB per extra signing key
(ASSUMED from the same parts); the app's existing auto-combine handles fragmented Savings.

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

### 4.2 The withdrawal transaction (`kiss/step2/instant_registration.kiss`)

Inputs: the account's registration coin for that currency at **input 0**, then vault coins of that currency. Outputs:
**0** the amount to the registered Savings address, **1** the change back to the vault (only if any), **last** the
registration coin re-created. The registration coin checks (VERIFIED, 129 to 136 instructions):

1. it is input 0; its magic, account id, key, payout and currency are unchanged (`SAMESTATE(0 3)`, `SAMESTATE(12 12)`);
2. it is **signed by the withdrawal key** stored in its own state (`SIGNEDBY(PREVSTATE(2))`);
3. the claimed block is within 20 blocks of the validating block, and the **daily window** is advanced correctly:
   a new window opens 1,728 blocks after the last one started, otherwise the amount is added to what was used; the
   total stays at or under the limit, and a negative "used" (a forged coin) is refused;
4. the change equals **everything of that currency coming in, minus its own dust if it is that currency, minus the
   amount** (`SUMINPUTS`, one instruction whatever the number of inputs, VERIFIED to run on 1.0.45.15 live,
   receipt `step2_probes.json`);
5. output 0 pays exactly the amount, in that currency, to the registered payout address; the output count is exact;
   the registration coin comes back to its own address with its state.

Each vault coin checks that input 0 is a registration coin, that its currency is the one the registration names, and
that output 1 is its change (section 2). So the whole transaction is valid only if every input agrees.

Measured refusals (all `success=false` on the input named, receipt `step2_covenant_branches.json`): over the daily
limit on the same day, one atom over the limit in one go, unsigned, signed by another key, payout redirected in the
output or in the state, key swapped in the state, change skimmed to an extra output, change understated, change kept
with state (a fake load), a vault coin of another currency, no registration at input 0, a vault coin alone, the
registration not at input 0, a stale or future claimed block, the window not advanced, a forged negative usage, the
registration re-created elsewhere or without state, an extra keepstate output at the vault, and a registration for
xWiniwa pointed at Winiwa.

### 4.3 How the vault authorises a withdrawal: four designs compared

| | **A. Registration coin + dedicated Minima key** (recommended) | **C. Registration coin + app-held SHA-256 hash chain** | **B. The loader's key inside each load coin** | **D. The vault checks the Instant P-256 key** |
|---|---|---|---|---|
| Pooled (C can spend what A loaded) | yes | yes | **no**: only the loader can take out its own loads, so C (who never loaded) cannot offload. Fails the goal | n/a |
| Authorisation on chain | `SIGNEDBY` a key pinned in the registration coin | reveal the next link: `SHA2(link) EQ head`, the new head is the link | `SIGNEDBY` per coin | impossible: KISS has no elliptic-curve check (brief, verified facts) |
| Instructions, registration input (VERIFIED) | 129 to 136 | 138 to 143 | | |
| Withdrawal size, one vault coin (VERIFIED parts) | **11.5 KB** (4.1 KB of it the signature) | **7.4 KB** | | |
| Needs `txnsign` | yes: one approval per offload in a MiniDapp in read mode, Admin pairing on Core | **no**: works in read mode and on Core without Admin | | |
| Where the secret lives | the node's wallet, as a key used for nothing else | the app's own store, beside the Instant key: physically separate from the node | | |
| Front-running | **impossible**: every witness signature is verified against the transaction id (VERIFIED `src/system/brains/TxPoWChecker.java` checkSignatures), so a changed transaction loses its signature | **possible**: anyone who sees the link in the mempool can post a competing withdrawal with another amount (measured `C_FRONTRUN_same_link_other_amount_still_valid`: valid). It still pays only the owner, but not the amount the owner's app debited | | |
| Uses | 262,144 signatures per default key (brief, verified facts) | the chain length set at registration (for example 10,000), then re-register | | |
| Maturity | the Minima-native pattern; the app already signs a covenant spend with an explicit key (order cancel, `test-channel-bootstrap.js` line 4638, L2 on V9) | a new pattern of ours, L1 only | | |

**Recommendation: A.** It is the standard Minima pattern, the app already uses it, and nothing in the mempool can be
turned against the owner. C is the fallback if one approval per offload in the MiniDapp turns out to be unacceptable:
it is cheaper and approval-free, at the price of the front-running exposure and an app-held secret chain.

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
recreates the same index (ASSUMED). The Instant balance itself lives in the WebView's store and is lost with the app
data anyway (Stage 1: like cash). The registration coin's close branch lets the owner retire it while the key exists.

### 4.5 The daily cash-out limit

- **Where:** in the registration coin's own state (window start, amount used), advanced by every withdrawal and
  checked on chain. **Proposed:** 1,000 per currency per window of 1,728 blocks (about a day at 50 s, 22.5 to 23.5
  hours at the measured 47 to 49 s). The window is fixed from its first withdrawal: it opens with a withdrawal and
  closes 1,728 blocks later.
- **Per currency:** each registration coin governs one currency (port 12), so Winiwa and xWiniwa each have their own
  limit. The limit is a constant in the script (an owner cannot raise it); the same number applies to every currency.
  For real money of different values each currency needs its own number (a small table in the script), to be set
  before any real value (decision 2).
- **The app refuses in place** before debiting when the amount is above what is left today (law 11): "You can move
  400.00 Winiwa to Savings today."
- **What it bounds, honestly:** a buggy app, and a stolen withdrawal key (which, with the payout pinned, can only move
  pool money into the owner's own Savings). **It does not bound an attacker**, because the limit belongs to a
  registration *coin* and registration coins are free to create (section 4.7).

### 4.6 Failures, retries and contention

- **Registration coin busy:** it is re-spent by every withdrawal, so one account makes one withdrawal per currency per
  block; the next waits for the previous to confirm (ASSUMED behaviour of the builder; the same as today's vault lanes).
- **Vault coin taken by someone else's withdrawal:** the loser's transaction is refused ("input already spent"); the
  app rebuilds with other coins under the same withdrawal id. Selection prefers coins not in the mempool
  (`coins ... checkmempool:true`, VERIFIED on 1.0.45.15 help) and picks at random among coins large enough.
- **Claimed block too old** (mined more than 20 blocks after the claim): rebuilt with a fresh claim.
- **Not enough in the vault:** the app refuses before debiting ("Instant payments cannot move this much to Savings
  right now") and says what can move.

### 4.7 What an attacker could do (the honest statement)

**What the chain guarantees** (VERIFIED by the 36 measured refusals):
- nothing leaves the vault except to a registered payout address, beside that registration coin, signed by its key;
- the change always returns to the vault, exactly, and never carries state, so no withdrawal can manufacture a load;
- a registration coin's key, payout, account id and currency cannot be changed by whoever spends it;
- one registration coin moves at most the limit per currency per window.

**What the chain cannot know:** the Instant balance. Payments never touch the chain, so the vault cannot tell whether
the app debited first. So:
- **A modified app, or anyone with a hand-built transaction, can withdraw up to the limit per day per registration
  coin without having any Instant balance.** The money comes from other people's loads: the pool becomes
  under-backed, and whoever offloads last finds it short.
- **Registration coins are free** (one atom of any token each; anyone can create a coin at any address with any
  state, doctrine 1.2), and one transaction can create many of them. So in practice the limit does not bound such an
  attacker: the vault can be emptied as fast as blocks allow.
- A modified app can also credit itself without loading, and pay the same money twice offline. Those are the
  double-spend questions the founder put aside for this stage, and they are the same trust: **trusted software**.
- **What does bound an attacker** (for later, decision 3): a global daily brake on the vault (the chip-balance
  appendix D.5 lane brake, about 170 instructions, at the cost of one withdrawal per lane per block), or Stage 2,
  where the chip's own signed debit authorises the withdrawal.
- An outsider with no registration and no key cannot move anything (measured `NEG_A_no_registration_at_input_0`,
  `NEG_A_vault_coin_alone`); anyone can merge vault coins, which moves nothing out.

---

## 5. Registration

- **What:** one coin per account per currency at the registration address, holding **one atom of any token** (the app
  uses Winiwa, which every wallet gets from the faucet) and naming the currency it governs in port 12. So C, who holds
  no xWiniwa in Savings, can still register to move xWiniwa out (measured
  `A_WITHDRAW_xWiniwa_via_Winiwa_dust_registration`).
- **Cost:** one feeless transaction, **7.9 KB** (VERIFIED parts), one atom locked; or nothing extra when it rides the
  first load (8.1 KB instead of 7.8 KB). One registration per transaction per currency, because all keepstate
  outputs of a transaction share one state (doctrine 1.1).
- **When:** automatically, **at the first load in a currency, or at the first offload in a currency**, whichever
  comes first. At a first offload the app registers, waits one block (a coin must be in a block before it can be
  spent), then withdraws: about one extra minute, shown as the status **Preparing** on the same row. In a MiniDapp the
  registration is one more approval.
- **Close:** the owner can close a registration (signed; the atom returns to the payout address; 37 instructions,
  8.5 KB). Key rotation or a new Savings address = close and register again.
- **Forged registrations:** anyone can place a coin at the registration address with any state. The script makes that
  exactly equivalent to registering: the limit is a constant, a negative usage is refused, and a coin naming a
  victim's account id with the forger's key pays only the forger's own address. The victim's app ignores coins that do
  not carry its own key.

---

## 6. Retirement and visibility

- **Vault retirement branch (founder law):** after 3,153,600 blocks (about 5 years) without movement, anyone may move
  a vault coin to a **successor address fixed at deployment** (measured, 36 instructions; early, redirected and
  misstated retirements refused). The successor is a decision (decision 5): the measured text carries a placeholder,
  and choosing the real one changes the vault address. The chain of successors has to end somewhere. Recommended for
  this valueless test deployment: the successor is a **second vault of the same design** (the same text with its own successor; it names the same
  registration address, so every registration can still withdraw from it) whose own successor is an unspendable
  address (the address of `RETURN FALSE`). Dormant money moves once, stays withdrawable for another 5 years, and only
  then is burnt. The second vault's address is computed first, then the first vault's. Before any real value the
  successor is a governance decision.
- **Registration coins** hold one atom; the owner's close branch is their exit. **Load and change coins** leave only
  through the vault's three branches.
- **Visibility (pruning).** A node that did not track the vault when a coin was created cannot see it once it is older
  than the unpruned window, about 1,080 to 1,440 blocks, 15 to 17 hours (doctrine 5.4; memory
  `project_vault_pruning_window_risk`). Consequences: every app tracks the vault from its first start (forward
  capture); a loader's own loads and an owner's own registration coin are relevant to their nodes anyway (3.2); a
  fresh install after a quiet day sees no old vault coins, so its offload says **Proof unavailable** (four-state law),
  never zero, until activity or an anchor snapshot. Recommended: extend the existing anchor snapshot (which already
  carries the faucet and xWiniwa vault proofs) to carry the largest Instant vault coins. Not needed for the demo, where
  all three wallets track the vault before the first load.

---

## 7. Contention and sizes

**Sizes** (VERIFIED parts, ASSUMED sums; receipt `step2_txn_sizes.json`; one real provable coin measured on the live
builder, extra covenant inputs at 1,854 bytes each, an upper bound; one signature measured at 4,125 bytes; header
allowance 1,200 bytes; Core reply check 2 x size + 4,000 <= 100,000):

| Transaction | Size | 64 KB cap | Core reply cap |
|---|---|---|---|
| Load | 7.8 KB | yes | yes |
| First load + registration | 8.1 KB | yes | yes |
| Registration alone | 7.9 KB | yes | yes |
| Withdrawal A, 1 / 2 / 5 / 10 vault coins | 11.5 / 13.3 / 18.9 / 28.2 KB | yes | yes |
| Withdrawal A, 20 vault coins | 46.7 KB | yes | yes (the most) |
| Withdrawal A, 25 / 30 vault coins | 56.0 / 65.2 KB | yes (30 is the most) | **no** |
| Withdrawal C, 1 vault coin | 7.4 KB | yes | yes |
| Close | 8.5 KB | yes | yes |
| Merge 2 / 10 vault coins | 5.9 / 20.7 KB | yes | yes |

**Rule for the app:** at most **10 vault coins per withdrawal** (28 KB, comfortable on every platform); if more would
be needed, merge first (no signature, no approval) or move less. Instructions do not limit it: the registration input
is constant (136) whatever the number of vault coins, and each vault coin runs its own 31.

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
Our state is under 400 bytes, with at most 3 outputs and 2 of them keepstate: far inside. The same output limit caps
how many registration coins one transaction can create (about 14), which does not change section 4.7.

---

## 8. Per-platform feasibility

| Platform | Load | Register | Offload (design A) | Offload (design C) | Notes |
|---|---|---|---|---|---|
| **Standalone Android** (A, B) | yes | yes | **yes**, signed in-process | yes | the embedded node is 1.1.1.26: register the clean single-line script (its multi-line `newscript` crash, `ensureCovenantTracked`); NFC for payments |
| **MiniDapp** (read mode) | one approval | one approval | **one approval per offload** (`txnsign` queues, VERIFIED `CommandRunner.java` write list) | **no approval** (`txnpost` is not a write command) | the debit waits for the approval; a refusal reverses it |
| **Core companion** | needs Admin | needs Admin | **needs Admin** | yes without Admin (ASSUMED: script-only posts work as the faucet claim does) | read-only pairing shows the feature with an honest refusal (law 4) |
| **Web preview** (C in the demo) | yes (RPC) | yes | yes | yes | dev surface only; needs the lab node and its CORS proxy (`dev-up.ps1 -DevNodes 1`) |

The script texts parse and run on 1.0.45.15 (VERIFIED live). On the embedded 1.1.1.26 and on Core 1.2.5 / 1.6.11 the
same KISS functions are ASSUMED (`SUMINPUTS`, `SIGNEDBY`, `@BLOCK` and `@COINAGE` are long-standing); Phase 3 checks.

---

## 9. What people see (founder language)

**Loading and offloading are a Send to your other account.** Proposal:
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
- **An offload above today's limit, or above what the vault can pay, is refused in place** with the reason, before
  anything is debited (law 11).
- Minimal information: no "vault", "registration", "covenant" or "on-chain" anywhere a person reads. StablesAgent
  explains if asked.

**Retiring "Add test credit": a fresh account version.** Proposal:
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

### 10.1 Cast

| Wallet | Device | Savings | Instant account | Payments |
|---|---|---|---|---|
| **A** | Pixel 7 Pro, standalone app (Chuck's primary phone) | its embedded node | new v2 account | NFC |
| **B** | Pixel 7 (GrapheneOS), standalone app | its embedded node | new v2 account | NFC with A, QR with C |
| **C** | web preview on the laptop (`http://localhost:8080/dapp/3-test/`) against lab node 9101 over RPC | lab node 9101's wallet (it holds Winiwa, V9 reference section 4) | new v2 account in the browser | QR |

B pays C by QR: C shows its receiver code on the laptop screen, B's camera reads it, B confirms, B shows the payment
QR, and **the laptop's webcam reads it** (ASSUMED: the laptop has a webcam). Fallback if not: C runs in Chrome on the
Pixel 7 Pro over USB (`adb reverse tcp:8080 tcp:8080` and the proxy port), which keeps `localhost` a secure context
for WebCrypto and the camera; it is still a separate wallet (lab node 9101) and a separate account.

### 10.2 What Chuck does

0. **Before:** the agent builds the feature (flag off by default), installs it on both phones (`adb install -r`,
   force-stop first, never uninstall), starts the preview and lab node 9101, and runs the pre-seed gate (10.3). All
   three wallets have Winiwa from the faucet.
1. **A loads (online).** On the Pixel 7 Pro: Wallet, tap Instant payments, **Add from Savings**, 100 Winiwa, Confirm
   send. The app returns to the Wallet with "+100.00" on the Instant row; about 2.5 minutes later the row reads
   Added and Instant payments shows 100. (On chain: the load, plus A's registration.)
2. **Airplane mode** on both phones.
3. **A pays B 60 by tap** (Send, Instant payments, hold the phones together). B's Wallet shows "Payment detected.
   Final: 60".
4. **B pays C 25 by QR** (C on the laptop: Receive, Instant payments; B scans, confirms, shows the QR to the webcam).
   C shows 25.
5. **Phones back online.** On the laptop, **C: Move to Savings, 25.** Status Preparing (C registers: one transaction,
   about a minute), then Broadcasted, Confirming, Received: lab node 9101's Savings +25. (On chain: C's
   registration, then C's withdrawal, which spends A's load coin.)
6. **B: Move to Savings, 35** on the Pixel 7. Preparing, then Received. (On chain: B's registration, B's withdrawal,
   which spends the 75 change coin.)
7. **A: Move to Savings, 40** on the Pixel 7 Pro (A registered at step 1). (On chain: A's withdrawal takes the last
   40; the vault is empty.) Every unit that went in came out, to three different wallets.

### 10.3 Pre-seed gate (before step 1; builder-kit standing gate 1)

From lab node 9101 with dust, after Chuck's approval: register the scripts on the node (clean form); one registration,
a load of 2 atoms, a withdrawal of 1 atom (payout, change, registration), a merge and a close, each `txncheck` clean
before posting. Then the refusal set on **real** coins, **built and checked, never posted**: over the limit, unsigned,
payout redirected, change kept with state, change skimmed, wrong currency. For each refusal keep the exported
transaction, its hash, the full `txncheck` result, the expected failed clause, and proof the coins are still unspent
(`EXPERIMENT_GOVERNANCE_STANDARD.md` section 5). Confirmation seen by two nodes (lab node and one phone).

### 10.4 What the explorer shows

Links take the form `https://explorer.minima.global/search?q=<txpowid>` and
`https://explorer.minima.global/address/<vault address>` (the app's configured explorer, `runtime-config.js`):
- **The load:** A's Savings coins in; out, a coin at the vault address (the load, 100 Winiwa) and one atom at the
  registration address. Whether the explorer displays the state (the account id) is ASSUMED unknown.
- **Each withdrawal:** in, a registration coin and a vault coin (C's spends **A's load coin**, the pooled moment); out,
  25 to C's Savings address, 75 back to the vault, the registration coin again.
- **The vault address page** over time: 100, then 75, then 40, then nothing.

### 10.5 Evidence to capture

Per `EXPERIMENT_GOVERNANCE_STANDARD.md` section 5: run id and time; the script texts' SHA-256 and addresses; the build
iteration and its hash; node versions (embedded 1.1.1.26 on both phones, 1.0.45.15 on the lab node); every txpow id,
block and confirmation count, seen from two nodes; the vault's coin ids and amounts before and after each step; each
wallet's Savings balance before and after; screenshots of each Wallet and activity row (`adb exec-out screencap` on
the phones, a browser capture for C); the app's `[instant]` log lines (logcat) with the load coin ids, withdrawal ids
and credits; the explorer pages. Screenshots are taken **by the agent over adb**, never by hand-copying numbers.

### 10.6 Approvals needed before anything is posted

Under the standard, a formal run needs a **prospective record** (16 fields, section 2) and a reviewed scope before it
starts, and the builder-kit gates need the founder for anything outward-facing. Proposed records, for Chuck to
approve or change:

| Field | STEP2-PRESEED-01 | STEP2-DEMO-01 |
|---|---|---|
| Question | Do the deployed vault and registration texts behave on mainnet as measured in dry runs? | Can a real load, two offline payments and three real offloads run end to end across three wallets? |
| Hypothesis | Honest dust spends settle; the six refusals fail `txncheck` on the named clause | Each step settles; the vault ends empty; every Instant figure matches the chain |
| Initial conditions | lab node 9101 synced, scripts registered, about 10 atoms of Winiwa | the pre-seed gate green; both phones on the feature build; C on the preview; all online |
| Falsifier | an honest spend refused, or a refusal accepted | any credit without its load, any offload paying another address, a vault balance that does not reach zero |
| Stop condition | the first unexpected result | the first unexpected result, or a transaction not mined within 20 blocks twice |
| Evidence | 10.3 artifacts | 10.5 artifacts |
| Level sought | L2 (valueless mainnet, own tests) | L2 |
| Budget | about 30 minutes, dust | about 45 minutes, 100 Winiwa that all comes back |

**Approvals, in order:**
1. **Before implementation:** decisions 1 to 7 in section 13.
2. **Before the first on-chain transaction:** the two prospective records above, the vault's final address (after the
   successor is chosen), and the amounts. This is the first coin at a new covenant address holding tokens, which the
   chip-balance design already marked as Chuck's call.
3. **Before posting anything publicly** (explorer links on X or Telegram): the drafted comms, per the publish laws
   (full on-chain ids with explorer links, no em dashes).

---

## 11. Measured numbers (receipts)

**Covenant branches** (VERIFIED, `step2_covenant_branches.json`: 51 transactions, 15 honest, 36 refusals,
**0 unexpected**; every input of each transaction run in-process on the 1.0.45.15 jar with 8-decimal token scaling;
instructions per input):

| Branch | Registration input | Each vault coin | Notes |
|---|---|---|---|
| Withdraw, fresh window / same day / after a day | 131 / 136 / 136 | 31 / 31 / 28 | 8-decimal amounts, e.g. 25.12345678 out, 74.87654322 back |
| Withdraw with 2, 5, 10, 20 vault coins | 131 each | 31 each | the registration cost does not grow |
| Withdraw xWiniwa, registration holding Winiwa dust | 129 | 31 | |
| Close | 37 | | refused unsigned (19), redirected (37) |
| Merge (anyone) | | 39 | refused: skim, second output, kept state, mixed currency |
| Retire after about 5 years | | 36 | refused: early (19), redirected, misstated |
| Design C withdraw | 138 to 143 | 28 to 31 | front-run with the same link: **valid** |

**Live cross-check** (VERIFIED): the transaction-free core of the withdrawal (`kiss/step2/reg_core_runscript.kiss`)
counts **74 instructions on the live node and 74 in-process**; the live node refuses it unsigned (15) and with the
window not advanced (74). All five texts parse on the live node and are clean-invariant.

**Probes** (VERIFIED, `step2_probes.json`): `GETINAMT`, `@AMOUNT` and `SUMINPUTS` read 8-decimal token units exactly at
scale 36 and one atom off is refused; `@COINAGE` works and marks a script non-monotonic; `SUMINPUTS` runs on the live
1.0.45.15 node. Finding: the doctrine's trap form `VERIFYOUT(@AMOUNT ...)` under keepstate **passes** in-process at
8 decimals, so this method does not reproduce the recorded on-chain failure; the scripts keep the doctrine's pinned-port
form anyway.

**Signature** (VERIFIED, `Step2SigSize.java` on the node jar): a default key (64 x 3) signature adds **4,125 bytes** to
a transaction and verifies; key generation plus first signature took 1.3 + 2.4 s in one run and 6 + 14 s in a cold
one on this laptop (not a phone figure).

---

## 12. What remains unverified

| Item | Status | Risk | Closes in |
|---|---|---|---|
| **Mining** any of these spends on mainnet | not done (no chain writes) | the **unreproduced `basic:false` per-branch complexity risk** (doctrine trap table; USDw plan 5.0) could refuse a branch that passes here. Low here: the heaviest branch is 136 instructions with no large products (the recorded failure involved two comparisons of products near 1e16) | pre-seed gate (10.3) |
| The vault and registration spends through `txncheck` on a real node | not done (needs real coins at the addresses) | `VERIFYOUT`/keepstate details only exist on chain (doctrine: `runscript` cannot see them) | pre-seed gate |
| Sizes | parts measured, sums ASSUMED; per-input size is an upper bound | small | pre-seed gate, from the posted transactions |
| `txnsign publickey:` with a `keys action:new` key | ASSUMED (the proven cancel path used a default key) | if refused, use a dedicated `newaddress` key (also never a change address) | implementation, one lab run |
| Embedded 1.1.1.26 and Core 1.2.5 / 1.6.11 KISS and `coins` filters | ASSUMED | a missing filter only costs reply size | implementation |
| `txpow onchain:` on the phones | used today by the app for Savings (VERIFIED in code); ASSUMED identical for loads | | demo |
| `send` with `state:{}` producing the load coin as designed | ASSUMED from `help` (the app may build it with `txncreate` instead) | | implementation |
| A load whose phone was away longer than the unpruned window (3.2 edge case) | designed as Proof unavailable; recovery path not designed | a pending load that never credits (the money stays in the pool) | implementation |
| The relevance of a coin through a state variable (3.2 tracking) | VERIFIED in the 1.1.2.6 source only | if 1.1.1.26 differs, the vault tracking (`trackall`) still finds the coins | implementation |
| The laptop's webcam for the B to C leg | ASSUMED | fallback in 10.1 | demo prep |
| Explorer shows state | unknown | cosmetic | demo |
| Phone signing time | unmeasured | slower offload confirm | demo |

---

## 13. Decisions for Chuck (recommendation first)

1. **How the vault authorises a withdrawal.** Recommend **design A**: a registration coin per account per currency,
   signed by a dedicated Minima key, payout pinned to the owner's Savings. Alternative: **design C** (an app-held
   hash chain): no approval per offload in a MiniDapp and the secret stays out of the node, but a mempool watcher can
   make a withdrawal of a different amount (still only to the owner).
2. **The daily cash-out limit.** Recommend **1,000 per currency per day (1,728 blocks)**, per registration, fixed in
   the script. Please confirm you accept what it does and does not do: it stops a buggy app or a stolen key, **not** an
   attacker with a modified app, because registrations are free.
3. **A real brake for later.** Recommend **none for the demo** (valueless tokens), and deciding before any real value
   between a global daily vault brake (lanes; bounds total loss, costs throughput) and waiting for Stage 2 chips.
4. **Screens.** Recommend the Instant pop-up's **Add from Savings** (left) and **Move to Savings** (right), both
   opening the shared Send sheet preset with **My Instant payments** / **My Savings**; the same two as chips in Send;
   rows "To Instant payments" / "To Savings"; statuses ending **Added** / **Received**; the pending amount as a
   wordless + figure; the Wallet total not dipping during a load.
5. **The vault's successor** (retirement after about 5 years dormant). Recommend, for this valueless test deployment,
   a second vault of the same design, whose own successor is an unspendable address (section 6): dormant money moves
   once and stays withdrawable for another 5 years before it is burnt. It must be fixed before deployment because it
   sets the final vault address. Before real value, governance chooses.
6. **Retire "Add test credit"** by a **fresh account version**: new key and store, scheme 0x05, 0x04 refused, the old
   test figure frozen and shown once as "Test credit retired". Alternative: wipe the test figure silently (not
   recommended: law 4).
7. **Registration timing.** Recommend **automatic at the first load or first offload in a currency** (one extra minute
   and, in a MiniDapp, one extra approval, shown as Preparing on the same row).
8. **Before the first on-chain transaction:** approve STEP2-PRESEED-01 and STEP2-DEMO-01 (section 10.6), the cast
   (A Pixel 7 Pro, B Pixel 7, C the web preview on lab node 9101) and 100 Winiwa as the demo amount.
9. **Before anything public:** approve the drafted posts with the explorer links.

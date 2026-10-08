# Phase 0 research: Stables payment account

**Date:** 2026-09-27. **Status:** complete. **Gate passed 2026-09-27:** Chuck accepted all six recommendations under "Decisions needed now". They are recorded as founder decisions 7 to 12 in the brief.
**Brief:** `../stables-payment-layer-agent-brief.md` (v2).
**Evidence level:** L1 throughout. Everything comes from documents, source code and published measurements. Nothing has been run on our hardware, our nodes or our phones.
**Tags:** VERIFIED means checked at the cited source. ASSUMED means analysis or inference, with the reason given.

---

## Summary for Chuck

**Verdict: no blocker. Go to Phase 1.** Nothing found makes the design impossible. The risk is concentrated in one place: **whether the chain can check a coin and pay the right victim within Minima's limits.** Those limits are 1,024 instructions per script, where every piece of an expression counts, and 64 KB per transaction (measured). Phase 1 answers this with real measurements before any app code is written.

**What we learned**

1. **The chip is fast enough.** Our SHA-256 signature takes between 0.06 s and 1.5 s per payment on the NXP J3R180, depending on the scheme. Making a chip's one-time keys is slow (1 to 3 s each), so keys are made by the vendor at manufacture, or in the background on a SIM.
2. **The best scheme for safety is the biggest on the wire.**
   - Lamport stays roughly safe even after a cheater signs twice, and its proof of cheating is small. But each hop adds about 16 KB, so only about 3 hops fit in one 64 KB cashing transaction.
   - Winternitz is 8× smaller, but once a key signs twice, bystanders can forge with it, which reopens the "redirect the payout" attack.
   - Phase 1 decides. The lean is Lamport with a low hop cap.
3. **Nobody has done this without an authority.** The central-bank designs (the BIS's Project Polaris and the ECB's digital euro) and cashu all fall back on a central operator when hardware is broken. Our approach (proofs of cheating plus bonds) has to be proven from scratch.
4. **New attack: a cheater claims against their own bond.** A cheater can pay the same coin to several fake receivers they control, then claim part of their own slashed bond as a "victim". Part of every slashed bond must therefore be burned.
5. **The central banks independently chose the same model as you.** The ECB's digital euro lets offline money be re-spent immediately and relies on secure elements plus limits. Its law sets offline limits to cover at least 72 hours of necessities, a good anchor for our freshness window. Polaris says software-only wallets should get only a few offline hops, which matches our phone-only tier.
6. **Where each tier works:**

| Platform | Phone-only tier | Chip tier | Offline transport |
|---|---|---|---|
| Stables Android app (standalone) | Yes | Yes (card over NFC, SIM) | NFC and QR |
| Core companion app | Yes | Possible (decide later) | NFC and QR |
| MiniDapp inside Minima, and web | Yes | No (no access to NFC or SIM) | QR only |
| iPhone | Yes | Reads chip cards only | QR to iPhones; can read Android phones |

   iPhones can't act as a card outside the EU and have no SIM access at all (Apple's rules).
7. **All the chip and NFC work is new.** There's no NFC, SIM or smart-card code in the apps today. Everything else we need already exists: the apps build custom covenant transactions today (vault, faucet), and QR payments, biometrics and invoices are already in place.

**Decisions needed now** (product and economics; my recommendation first)

1. **When a cheater's bond is slashed, how much is burned and how much goes to victims?** Recommend: start at half burned and half paid to claimants in proportion, after a claim window. The Phase 1 simulation will tune the split.
2. **Hop cap for phone-only money: 1 or 2?**
   - 1 means a receiver must cash before re-spending, which contradicts "spendable offline right away".
   - Recommend **2**, so a receiver can re-spend once.
3. **Who bears a loss?** Recommend keeping "whoever cashes second, compensated from the bonds". The ECB does the same. Known downside: it hits people who are rarely online hardest, so their default offline limits should be lower.
4. **Privacy.** A coin carries its last few hops, so a receiver sees the anonymous device IDs of its recent holders (not names). Recommend accepting this for version 1.
5. **Must vendors load the published, open-source Stables applet?** Recommend **yes**. It's what makes "chip tier" mean something, and the vendor's bond backs the promise.
6. **After locking a card, do vendors keep the keys that manage it?**
   - Keeping them lets vendors ship security updates. Destroying them means the card can never be updated.
   - Recommend **keep**: a vendor that abuses the keys loses its bond.

**Decisions that can wait** (Phases 4 and 6; recommendations noted)

- **App naming:** adopt "Instant balance" and remove "on chain" from app copy. Stables' public vocabulary avoids "on-chain" and "settlement". *Recommend yes (Phase 4).*
- **NFC permission** in both Android apps. *Recommend yes (Phase 4).*
- **Chip support** in the Core companion too, or the standalone app only first. *Recommend standalone first.*
- **MiniDapp:** one Minima approval each time money is loaded into the payment account. *Acceptable; it's the existing norm.*
- **PIN for external card payments:** *recommend a PIN above the existing quick-pay limit, and phone confirmation below it.*
- **iPhone scope** as in the table. *Accept; these are Apple's rules.*
- **Which phone takes the test SIM** (the carrier moves to eSIM). *Decide at Phase 6.*

---

## 1. The concentrated risk: checking coins on chain

**Limits that apply**

| Limit | Value | Status |
|---|---|---|
| KISS instructions per script | 1,024; every expression counts (constants, variables, operators, calls) | VERIFIED (node source) |
| Heavy scripts failing to mine below 1,024 | `basic:false`, per-branch complexity budget; open | VERIFIED as a recorded doctrine (`MINIMA_BUILDING_DOCTRINE.md`, `USDW_CHAIN_BUILD_PLAN.md` §5) |
| Transaction (TxPoW) size | 65,536 bytes ("TxPoW size too large 95243/65536", 2026-09-03) | VERIFIED (measured, memory note `project_notes_fit_auto_combine_v56`) |
| Core companion reply size | 100,000 characters; `txnbasics` hits it first | VERIFIED (measured, same note) |
| Core companion request size | 128,000 characters | VERIFIED (`CommandPolicy.java:12`) |
| MiniDapp in read mode | `txnsign` and `sign` queue for manual approval | VERIFIED (`CommandRunner.java:627-631`) |

**Signature scheme comparison (J3R180, SHA-256 in hardware)**

| | Lamport, secrets from chip AES | Lamport, secrets from SHA-256 | Winternitz, 4 bits per chain | Winternitz, 8 bits per chain (Minima's) |
|---|---|---|---|---|
| Chip time per payment | about 0.06 s | about 0.7 s | about 1.5 s (2.7 s worst) | about 11 s (21 s worst): ruled out |
| Chip time to make one key | about 1.4 s | about 2.6 s | about 2.75 s | about 22 s |
| Bytes per hop | about 16 KB (8 KB from chip + 8 KB from phone) | same | about 2.1 KB plus a Merkle proof | about 1.1 KB |
| Hops per 64 KB cashing transaction | about 3 | about 3 | about 20 | n/a |
| Safe after a key signs twice | roughly yes | roughly yes | **no**: bystanders may forge | no |
| Proof of cheating on chain | 2 hashes + Merkle proofs (small) | same | two full signature checks (large) | n/a |

Sources and status:
- Timings: ASSUMED arithmetic from VERIFIED measurements of SHA-256 on the J3R180 (2.56 ms for 32 bytes, 13.6 ms for 512 bytes) and AES-256 (2.48 ms for 512 bytes), JCAlgTest scalability data.
- Behaviour after signing twice: VERIFIED, Groot Bruinderink and Hülsing, SAC 2017: Lamport "only slowly degrades", while for Winternitz "typical parameters do not provide any reasonable level of security under two-message attacks".
- Hops per transaction: ASSUMED arithmetic.

**Lean going into Phase 1:** Lamport, with secrets derived from the chip's AES (they never touch the chain; only their SHA-256 hashes do). Hop cap at most 3 if cashing happens in one transaction. Optimistic cashing (post a commitment, then challenge within a window) is the route if more hops are needed.

**Phase 1 must still measure:**
- the instruction count of one full Lamport check in `runscript`, and how many co-spent coins it needs if split;
- the real transaction size of a 1-, 2- and 3-hop cashing;
- whether cashing and fraud proofs can be authorised by the script alone (no `txnsign`), so they work in the MiniDapp's read mode and on Core without Admin (the faucet claim already works this way, VERIFIED `test-channel-bootstrap.js:7730-7735`);
- all of the above on the three node versions in use: 1.0.45.15 (Test12), 1.1.1.26 (embedded, with a known `newscript` crash on large scripts) and 1.6.11 (phone Core).

**Addendum (late Phase 0 finding): Minima already ships a hash-based signature that a script checks on chain.**
- The embedded node (1.1.1.26) has a `sphincs` command. Its KISS script, `KISSVM_SPHINCS_SCRIPT` (`scratch/minima-core-runtime-gap-2026-08-07/src/org/minima/utils/sphincs/SPHINCSUtils.java:22`), checks a FORS/HORST few-time signature:
  - one `CHECKSIG` certifies the FORS root;
  - then 16 rounds, each with two `PROOF` checks and one `SHA3`;
  - all signature data is carried in transaction state variables (ports 0-79, 100 and 101; `setupTransaction`, lines 72-111).
- VERIFIED by reading the source; not yet run.
- It hashes with SHA-3, so a chip can't produce it. But it is a shipped, within-limits reference for Phase 1's crux measurement.
- It is a few-time scheme, so signing twice does not by itself reveal a pair of secrets. A proof of cheating would need two full checks.
- The `sphincs` command is not in the Core companion allowlist.

## 2. Security lessons from prior art

- **Operating model:** Polaris names three offline modes: fully offline, intermittently offline and staged offline. Stables is **intermittently offline**: received value is spendable at once, with periodic syncing. Polaris accepts lower-security devices for this mode "along with an appropriate synchronisation regime", and says software suits "only a few consecutive offline payments". VERIFIED (Polaris handbook §3.2 and §5.5.2; design guide §3.1.2).
- **Limits catalogue** to use as a Phase 1 checklist:
  - maximum holding;
  - maximum payment;
  - maximum *number* of offline transactions before going online;
  - maximum cumulative offline amount;
  - maximum without authentication;
  - counterparty block list.

  VERIFIED (Polaris §5.5.11). Polaris gives no numbers.
- **The ECB's digital euro:**
  - "Funds can be immediately re-spent offline", with local final settlement.
  - Secure elements must ensure "atomicity … in the event of a power outage".
  - Mutual device authentication, with online reconciliation as "the ultimate line of defence".
  - The law requires offline limits covering necessities for at least 72 hours.
  - One chosen vendor, G+D.

  VERIFIED (ECB April 2024, July 2025, October 2025 and April 2026 documents; EU Council mandate, December 2025, Arts. 37 and 37a).
- **No precedent for an authority-free fallback.** Polaris uses block lists and risk systems; the ECB uses online reconciliation; cashu uses its mint. VERIFIED.
- **Coins must grow with each transfer.** This is a proven lower bound for transferable e-cash (Chaum and Pedersen, 1992). The hop cap is therefore required by the design, not a tuning choice. VERIFIED.
- **Precedent for our coin format:** Blokzijl and Koning (De Nederlandsche Bank and TU Delft) chain ownership signatures inside each coin and find the cheater where two copies' chains first differ. VERIFIED (arXiv 2407.13776).
- **Self-claim attack:** the cheater pays their own fake receivers and claims against their own bond. ASSUMED analysis. The fraud-profitability formula must include the share the cheater can claw back.
- **Loss rule critique:** "second to cash bears the loss" concentrates losses on poorly connected users. VERIFIED (OMFIF commentary, September 2026).
- **cashu-javacard lessons** (MIT, JCOP4 J3R180; VERIFIED from its security model, decisions log, applet source and hardware test report):
  - Allocate all memory at install. A 288-byte leak per signature would have bricked cards after a few hundred taps while the simulator stayed green.
  - Run a self-test at install.
  - Validate on the host before burning a slot.
  - An iPhone NFC framing error once burned a slot with no signature delivered.
  - Its "sign twice" protection is weak for our purposes: it signs whatever 32 bytes the reader sends, and a `SIGN_ARBITRARY` command signs without using a slot. That's fine with a mint behind it, but unsafe for us.
  - Reusable: the applet skeleton, command dispatch, slot table, PIN pattern, jCardSim tests, the pyscard host tool, the GlobalPlatformPro flow, and the iOS Core NFC setup.

## 3. The app side

Findings from reading the source (L0 to L1):

- **How the app sends commands on each platform:**
  - Web preview: an HTTP proxy to the node's RPC port.
  - MiniDapp: `MDS.cmd` to the host node; write commands need approval.
  - Standalone Android: the WebView intercepts `/rpc/` and runs the command in-process on one thread with a 240 s timeout.
  - Core companion: an IPC broadcast to Minima Core, with an allowlist that fails closed.
  - One function decides the transport (`stablesNodeCommandTransport`, `index.html:24030`). VERIFIED.
- **Custom covenant transactions already work on all four platforms.** The pattern is `txncreate` → `txninput` → `txnoutput` → `txnstate` → `txnsign` → `txnbasics` → `txncheck` → `txnpost`, used for the vault mint/burn, faucet claim and order fills. `runscript` already runs everywhere. VERIFIED (`test-channel-bootstrap.js:4426`, `:7739`, `:3822`, `:987`).
- **No NFC, host card emulation, OMAPI or smart-card code exists, and no NFC permission is declared in either app.** VERIFIED (manifests; search of both Android projects and `3-test`).
- **Where the code goes:** the protocol, `SecureElement`, `VirtualCard` and `ForgedCard` live in shared JS in `3-test`, keeping four-platform parity. Native Android code only moves bytes:
  - `IsoDep` for cards;
  - `SEService` for the SIM;
  - a `HostApduService` for phone-to-phone taps, which needs a native message queue because Android freezes the WebView's JS in the background. VERIFIED (the background freeze is measured, memory note).
- **VirtualCard secrets never go in `localStorage`.** On Android, use a Keystore-wrapped secret held natively, with the "key used" mark committed before any signature is released. ASSUMED design.
- **Option (d) is effectively ruled out.** Minima-native signatures for phone-only payments would need one approval per payment in the MiniDapp and would use node wallet keys, which conflicts with key separation. VERIFIED facts; ASSUMED conclusion.
- **Reuse:**
  - The retail invoice QR: a random 16-byte payment ID, 15-minute expiry and state port 255, reusable as the receiver nonce and QR request format (`retail-payment.js:29-53`).
  - Align offline limits with the existing quick-pay defaults: 50 per quick payment, 500 as the significant-payment threshold, 200 daily (`payment-security.js:17-19`).
  - The Omnia handover's clause "No Stables balance exists by trust" (§3) and its public vocabulary (§19).
- **Side observation outside this project:** the standalone app's command allowlist is not enforced (`mAllowUnknownCommands = true`, `StablesActivity.java:883`). Worth a separate review; this report doesn't act on it.

## 4. Chips, SIM and tools

**Chip (NXP J3R180)** (VERIFIED, JCAlgTest)

| SHA-256 input | 16 B | 32 B | 64 B | 128 B | 256 B | 512 B |
|---|---|---|---|---|---|---|
| Time | 2.23 ms | 2.56 ms | 3.64 ms | 4.95 ms | 7.87 ms | 13.6 ms |

- Atomic copy to persistent memory takes 3.2 to 5.6 ms. Transaction commit cost is unmeasured (ASSUMED 10 to 30 ms).
- Free memory: 139,360 bytes persistent, 4,084 bytes transient.
- Memory needed (ASSUMED sizing):
  - per one-time key: 1 "used" bit (65,536 keys = 8 KB);
  - an optional coin table at about 48 bytes per coin;
  - a Lamport signature is larger than transient RAM, so it streams out in about 37 commands.
- Sending 8 KB over NFC takes an estimated 0.3 to 1.5 s (ASSUMED).

**Simulators and tools** (VERIFIED from their source and docs unless noted)

- **jCardSim cannot prove atomicity.** Its transaction calls only count depth and roll nothing back, every memory query returns 32,767, and there is no power-loss simulation. It also offers SHA-3, which the real chip lacks. So we need our own tearing harness, the real CAP file built in CI, and the Java Card 3.0.4 API as the target (it runs on both the J3R180 and the SJA5; the 3.0.4 part is ASSUMED).
- **vsmartcard's Android Smart Card Emulator** runs jCardSim applets over host card emulation. It's useful as a reference and a phone-to-phone harness, but its applets are hardcoded, so adding ours means rebuilding it.
- **GlobalPlatformPro:**
  - J3R180: default keys `404142…4F`, SCP02 or SCP03; `--lock` replaces the keys; `--secure-card` is irreversible; 3 to 10 wrong key attempts can brick the card.
  - SJA5: SCP02 with the card's own keys; 3 wrong ADM1 attempts lock it permanently.
- **Card locking for the chip tier:** a card still on default keys lets anyone load applets, so it must never count as chip tier (ASSUMED threat model). For SIMs, the vendor must also rotate the over-the-air keysets and lock the ARA-M rules with `aram_lock`, which needs ARA-M applet v0.1.0 or later.

**SIM access from the app (OMAPI)** (VERIFIED unless noted)

- **Stock Pixel 7 / 7 Pro:** the device configuration declares SIM access for apps, and a logical channel is required.
- **Access rule on the SJA5:**
  - pySim: `aram_store_ref_ar_do --aid <AID> --device-app-id <cert hash> --apdu-always`;
  - or GlobalPlatformPro: `-acr-add`;
  - both apps share signing certificate `dabb1b2a…`, so one rule should cover both (ASSUMED).
- **GrapheneOS:**
  - The same feature is declared, and apps open logical channels in practice.
  - One vendor SIM-service crash was reported on a Pixel 8a.
  - Nothing is published for a Pixel 7 with an SJA5.
- **No mobile service:** GSMA test specifications require SIM channel access in flight mode, but compliance on Pixel is ASSUMED and is Phase 6 test #1.
- **Hardware:** Pixel 7 and 7 Pro take one physical SIM plus eSIM, in dual-SIM-dual-standby.
- **Unmeasured:** the SJA5 accepts only 255-byte commands, and its speed and per-command latency through the phone are unpublished.

**iPhone** (VERIFIED)

- **Reading cards:** Core NFC reads custom Java Card applets declared in the app.
- **Acting as a card:** EEA only, from iOS 17.4, and only for an EEA company with regulatory permission. Outside the EEA, Apple's platform requires a commercial agreement and lists no peer-to-peer use.
- **SIM:** no API.

## 5. Carried into Phase 1 (technical decisions; no founder input needed)

1. **The chip computes what it signs.** The applet builds the digest from its own stored data: coin ID, amount, bound key index, receiver root, receiver nonce and scheme version. There is no "sign anything" command.
2. **Commit, then emit.** One Java Card transaction records {key index used, digest} and deletes the coin. Only then does the signature stream out, and the chip may re-send *the same* signature for the same digest, so a torn tap loses nothing.
3. **Scheme lean:** Lamport with AES-derived secrets. Drop Winternitz with 8 bits per chain for chips.
4. **Keys are generated by the vendor at manufacture** (contact reader), or in the background on SIMs. Key renewal is a long session, never a tap.
5. **Every coin and certificate carries a scheme/version byte.**
6. **Applet rules:**
   - allocate memory only at install, enforced by a source scan;
   - run an install-time self-test;
   - never count jCardSim results as evidence;
   - build the CAP against Java Card 3.0.4.
7. **Cashing and fraud proofs are authorised by the script alone where possible** (no signature), so they work without approvals.
8. **The on-chain record left by a first cashing must stay provable** for at least the freshness window plus the challenge window. Check this against Minima pruning (see memory note `project_vault_pruning_window_risk`).
9. **The fraud-profitability formula includes the self-claim clawback,** and the payout rule burns a share and pays in proportion after a claim window.
10. **Phase 1 measurement needs one lab node** (`dev-up.ps1 -DevNodes 1`) for `runscript` and size tests. These are read-only commands; nothing is posted.

## 6. Shopping list for Phase 6

| Item | Price found | Status |
|---|---|---|
| NXP J3R180 dual-interface, unfused, default keys (10) | €120 excl. VAT (United Access) | VERIFIED; confirm SCP02 vs SCP03 before ordering |
| ACS ACR1252U-M1 contactless reader | $44.32 (GoToTags) | VERIFIED |
| sysmoISIM-SJA5-9FV 10-pack with ADM keys | €80.92 incl. VAT (sysmocom) | VERIFIED; confirm the KIC/KID/KIK keys and ARA-M v0.1.0+ are included |
| ACS ACR39U contact reader | about $20 to 35 | ASSUMED |
| Nano-SIM adapter | about €5 | ASSUMED |
| Carrier eSIM for the phone that takes the SJA5 | carrier dependent | |

## 7. Sources

**Prior art**
- cashu-javacard: https://github.com/lnflash/cashu-javacard (docs/SECURITY-MODEL.md, docs/DECISIONS.md, docs/HARDWARE_TEST_REPORT_2026-09-22.j3r180.md, applet source)
- BIS Project Polaris handbook (May 2023): https://www.bis.org/publications/project-polaris-handbook-offline-payments-cbdc.pdf
- Polaris design guide (October 2023): https://www.bis.org/publ/othp79.htm
- ECB offline digital euro (April 2024): https://www.ecb.europa.eu/euro/digital_euro/timeline/profuse/shared/pdf/ecb.degov240411_item3updateofflinedigitaleuro.en.pdf
- ECB progress reports (July and October 2025): https://www.ecb.europa.eu/euro/digital_euro/progress/shared/pdf/ecb.deprp202507.en.pdf and https://www.ecb.europa.eu/euro/digital_euro/progress/html/ecb.deprp202510.en.html
- ECB offline presentation (April 2026): https://www.ecb.europa.eu/euro/digital_euro/timeline/profuse/shared/pdf/ecb.dep260409_Item_1_ECB_Presentation_Offline_Digital_Euro.en.pdf
- EU Council mandate (December 2025): https://data.consilium.europa.eu/doc/document/ST-16695-2025-INIT/en/pdf
- OMFIF commentary (September 2026): https://www.omfif.org/2026/09/the-offline-digital-euro-when-the-secure-element-fails-what-remains/
- Chaum and Pedersen, transferred cash grows in size: https://link.springer.com/chapter/10.1007/3-540-47555-9_32
- Chaum and Pedersen, wallet databases with observers: https://link.springer.com/chapter/10.1007/3-540-48071-4_7
- Groot Bruinderink and Hülsing, "Oops, I did it again" (SAC 2017): https://eprint.iacr.org/2016/1042
- Blokzijl and Koning: https://arxiv.org/abs/2407.13776

**Chips, SIM, tools, iOS**
- JCAlgTest J3R180 run time and scalability: https://www.fi.muni.cz/~xsvenda/jcalgtest/run_time/NXPJCOP4J3R180SECIDP71.html and https://www.fi.muni.cz/~xsvenda/jcalgtest/scalability/NXPJCOP4J3R180SECIDP71.html
- JCAlgTest J3R180 algorithm support: https://github.com/crocs-muni/jcalgtest_results
- Software SHA-3 on Java Card: https://github.com/crocs-muni/OptimizedJCAlgs
- sysmoISIM-SJA5 manual: https://sysmocom.de/manuals/sysmoisim-sja5-manual.pdf
- jCardSim: https://github.com/licel/jcardsim (`SimulatorRuntime.java`, `PersistentSimulatorRuntime.java`, `MessageDigestImpl.java`)
- vsmartcard: https://frankmorgner.github.io/vsmartcard/ACardEmulator/README.html and https://frankmorgner.github.io/vsmartcard/remote-reader/README.html
- GlobalPlatformPro: https://github.com/martinpaljak/GlobalPlatformPro (wiki: Keys, Lifecycle-management)
- Android OMAPI and UICC: https://source.android.com/docs/core/connect/uicc and https://android.googlesource.com/platform/packages/apps/SecureElement/+/refs/heads/main/src/com/android/se/Terminal.java
- Pixel 7 device configuration (stock and GrapheneOS): https://android.googlesource.com/device/google/pantah/+/186d6a9157238428f21111a4fd59d586de57e6ef/device-panther.mk and https://github.com/GrapheneOS/device_google_pantah/blob/14/device-panther.mk
- pySim shell (ARA-M rules): https://downloads.osmocom.org/docs/pysim/master/html/shell.html
- ARA-M lock: https://www.mail-archive.com/gerrit-log@lists.osmocom.org/msg195348.html
- ARA-M applet: https://github.com/bertrandmartel/aram-applet
- GrapheneOS issues: https://github.com/GrapheneOS/os-issue-tracker/issues/6275, /8478, /7706
- OpenEUICC: https://github.com/estkme-group/openeuicc
- Pixel dual SIM: https://support.google.com/pixelphone/answer/9449293
- GrapheneOS usage: https://grapheneos.org/usage
- Apple host card emulation (EEA): https://developer.apple.com/support/hce-transactions-in-apps
- Apple NFC and SE platform: https://developer.apple.com/support/nfc-se-platform/
- Apple forums (Core NFC AIDs, SIM access): https://developer.apple.com/forums/thread/122314 and https://developer.apple.com/forums/thread/805964
- Shop pages: https://www.united-access.com/produkt/jcop-4-nxp-j3r180-dual-interface-smart-card-df-10-pcs/ , https://store.gototags.com/acs-acr1252u-nfc-usb-reader/ , https://shop.sysmocom.de/sysmoISIM-SJA5-9FV-SIM-USIM-ISIM-Card-10-pack-with-ADM-keys-9FV-chip/sysmoISIM-SJA5-9FV-10p-adm

**Repo (read only)**
- Minima node source: `1_development/stream_1_app/work/scratch/minima-core-runtime-gap-2026-08-07/src/org/minima/`
- App: `1_development/stream_1_app/website/dapp/3-test/` (`index.html`, `assets/test-channel-bootstrap.js`, `assets/lib/mds.js`, `retail-payment.js`, `payment-security.js`)
- Android: `standalone-android/stables-android/` (`StablesActivity.java`, `StablesJsBridge.java`, manifest) and `stables-core-android/` (`CommandPolicy.java`, `NodeIpc.java`, README)

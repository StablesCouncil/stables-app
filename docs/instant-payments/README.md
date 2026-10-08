# Stables Instant payments: design, implementation and evidence

Built on MINIMA.

This documentation snapshot explains what we have built, what our tests demonstrate and what remains unfinished. Prepared on 2026-10-08. The secure-chip system is a research implementation, not a deployed product for real value.

## Start here

Stables separates Savings, which holds on-chain tokens, from an Instant balance that can pass between devices. Loading moves tokens into a vault. Local payments exchange signed messages. Withdrawing returns tokens from the vault to Savings.

The current app implements these payment rules in ordinary software. The proposed next stage puts the signing keys, balance and payment rules inside a certified secure chip. Revised covenants would accept a withdrawal authorisation only from a registered chip and prevent repeated redemption.

**The current deployed software vault does not enforce the secure-chip withdrawal scheme.** Putting the applet on a chip would not, by itself, upgrade that vault.

## What the two terms mean

### Chip-compatible signature verifier

This means Minima KISS script code that checks withdrawal signatures which our proposed Java Card program can generate using SHA-256. The experimental signature scheme is called LX16. Its verification is split across five helper coins because the complete check is too large for one script's instruction limit.

The simulator-generated signatures have passed the verifier in Minima's actual scripting engine. Complete cumulative withdrawals have also now been mined on mainnet using those signatures, with all checks enabled. Altered signatures, repeated authorisations and payout attacks were refused. This establishes the tested mechanism; independent review of LX16 remains necessary.

See the [signature cross-check](simcard/applet/results/lx16-crosscheck.md), [helper script](simcard/kiss/lx16_helper_K5_P255.kiss) and [signature implementation](simcard/applet/src/main/javacard/org/stables/card/Lx16.java).

### Simulated secure-chip implementation

This means an actual Java Card program, or applet, compiled for the Java Card 3.0.4 API and executed in jCardSim on a computer. It keeps balances, checks incoming payments, commits debits before emitting payments, and creates withdrawal authorisations after recording their debits.

This is executable software intended for a chip. It is not a physical secure chip, and simulation does not demonstrate resistance to extraction, cloning, rollback, power interruption on silicon or physical attacks. The instrumented interruption harness models Java Card transaction semantics.

See the [applet implementation](simcard/applet/src/main/javacard/org/stables/card/StablesApplet.java), [simulator status](simcard/docs/simulator-status.md) and [hardware requirements](simcard/docs/card-capabilities.md).

## Can the complete Minima withdrawal path be tested without hardware?

Yes. The simulated applet can generate a withdrawal authorisation under laboratory keys registered for the test. Minima verifies the signature and transaction data; it cannot directly observe whether a physical chip produced them. The proposed covenant checks should remain enabled. There is no need to weaken authentication or skip signature verification to perform this test.

The existing Card-to-Savings mainnet test exercised the Stage 1 software-trusting covenants, authorised by a normal Minima wallet key. It established that those covenants can release vault tokens, restrict the payout and conserve amounts. It did not exercise the complete Stage 2 transaction that verifies the chip-compatible signature across helper inputs, records the redeemed withdrawal total, and releases vault funds through the proposed D1 and D2 path.

**That complete test has now passed.** On 2026-10-08, [CHIP-WITHDRAW-01-R4](simcard/evidence/CHIP-WITHDRAW-01-R4/CLOSURE_REPORT.md) mined four complete D1/D2 transactions with simulated-applet signatures and purpose-created valueless tokens. The first cumulative authorisation paid 250; the second authorisation totalled 290 and paid only 40 more. Both lab peers confirmed the same blocks. All eight invalid constructions were refused and never posted. The final reserve plus payouts conserved the original 600 units. Physical chip security remains a separate validation task.

## Evidence and its limits

The October 8 campaign below was executed in this session. Earlier reports remain supplied historical records; preparing this documentation does not rerun them or upgrade the deployed app vault.

| Component | Supplied evidence | What it demonstrates |
|---|---|---|
| Software vault | [Mainnet closure report](simcard/evidence/STEP2-PRESEED-01-R1/CLOSURE_REPORT.md) | Deposits, withdrawals, output restrictions and conservation for the Stage 1 software-trusting covenants. It does not demonstrate chip authentication. |
| Alice to Bob to Carol | [Three-wallet closure report](simcard/evidence/INSTANT-ABC-01-R3/CLOSURE_REPORT.md) | Loading, two local QR payments, reuse of received value and withdrawal, with valueless Winiwa. |
| Recovery in the app | [Edge-case closure report](simcard/evidence/INSTANT-EDGE-01-R1/CLOSURE_REPORT.md) | The recorded browser recovery and duplicate-handling cases. Phones and physical NFC were outside that run. |
| Applet logic | [Unit tests](simcard/applet/results/unit-tests-shipped-build.md) | 42 tests passed in the supplied current report, including success and refusal paths. |
| Untrusted relay | [Relay tests](simcard/applet/results/relay-results-shipped-build.md) | 56 simulator cases passed in the supplied report. The chain model used here is not a full mined Minima transaction. |
| Interruptions | [Tear harness](simcard/applet/results/tear-results.md), [mutation check](simcard/applet/results/mutation-check.md) | 465 modeled interruption points and deliberately broken implementations used as negative controls. |
| Chip signature check | [LX16 cross-check](simcard/applet/results/lx16-crosscheck.md) | 39 checks, including live-node KISS dry runs accepting simulated-chip signatures and refusing invalid ones. |
| Covenant branches | [82-case receipt](simcard/measure/receipts/balance_covenant_branches.json), [design section 5](simcard/docs/chip-balance-design.md) | Original branch logic measured in-process using Minima's own Java implementation; the signature core was also cross-checked on a live node. |
| Cumulative withdrawal revision | [Revised script](simcard/kiss/balance/chip_account_v2_cumulative.kiss), [before/after simulator comparison](simcard/applet/results/prefix-check.md) | Simulator evidence for handling delayed and out-of-order authorisations. Full revised covenant branch validation is still required. |
| Complete cumulative withdrawal on mainnet | [R4 closure](simcard/evidence/CHIP-WITHDRAW-01-R4/CLOSURE_REPORT.md), [frozen source](simcard/evidence/CHIP-WITHDRAW-01-R4/captured-sources/), [exports](simcard/evidence/CHIP-WITHDRAW-01-R4/exports/), [validator and final state](simcard/evidence/CHIP-WITHDRAW-01-R4/closure.json) | Four complete D1/D2 transactions mined, eight attacks refused, payouts 250 + 40, reserve 310. Current baseline variants, with cumulative debit and without deferred caps/windows. |

Older summary documents quote 40 unit tests and 47 relay cases. The supplied individual reports contain the later counts above. Their original dates and caveats remain relevant. The revised covenant comments refer to `d1-order-check.md`, which is absent from the supplied source snapshot; that referenced report is not presented here as verified evidence.

## What remains before a final product

1. Install and validate the applet on real hardware, including secure randomness, memory, atomic writes, interruption recovery, communication and performance.
2. Establish secure provisioning and certification that bind registered keys to the approved chip and software. Protect the balance and payment logic, not just the private key.
3. Authenticate credits so a chip cannot accept fabricated funding or payments from an uncertified peer.
4. Complete the other covenant branches and long-term availability checks, confirm production registration/address bindings, and integrate chip authorisations into the app.
5. Extend the now-demonstrated mainnet withdrawal path to the complete production key-tree, renewal and application flows. The lab used eight registered applet public keys and tested two withdrawals; it did not validate every production branch or parameter.
6. Obtain independent review of LX16 and the complete protocol and implementation before using real value.

The cumulative withdrawal rule records how much a chip has authorised in total and pays only the difference from what the chain has already redeemed. The complete revised D1/D2 baseline path is now demonstrated on mainnet for the named test cases. The original older covenant set still includes deferred controls and has not been fully revalidated as a whole.

We have demonstrated the complete tested Minima withdrawal mechanism, assuming the hardware and certification provide the required guarantees. Real hardware and the final integrated product remain unfinished.

## Documentation map

- [Current chip-balance design](simcard/docs/chip-balance-design.md): funding, payments, withdrawals, certification, tested branches and outstanding checks.
- [Complete mainnet withdrawal results](simcard/evidence/CHIP-WITHDRAW-01-R4/CLOSURE_REPORT.md), [prospective protocol](simcard/docs/CHIP-WITHDRAW-01-R4.md), [baseline candidate generator](simcard/measure/balance-baseline-covenants.mjs).
- [Stage 1 load and withdrawal design](simcard/docs/step2-load-offload-design.md): the current software-trusting vault, including its security limits.
- [Simulator package and hardware validation plan](simcard/docs/simulator-status.md).
- [Card capability requirements](simcard/docs/card-capabilities.md).
- [Distance payments](simcard/docs/card-pay-at-distance.md): signed requests and delivery in the current test app.
- [Project brief and design pivot](simcard/stables-payment-layer-agent-brief.md).
- [Initial hardware research](simcard/docs/phase-0-research.md): historical estimates, not measurements of our applet on hardware.
- [Original signature research](simcard/docs/payment-account-design.md): the notes model is superseded; its signature research remains relevant.
- [Covenant source](simcard/kiss/), [applet source and harnesses](simcard/applet/src/), [measurement tools](simcard/measure/), [simulator tools](simcard/sim/).
- [Current app payment format](app/instant-protocol.js), [payment delivery](app/instant-balance.js), [on-chain load, withdrawal and delivery envelope](app/instant-chain.js).
- [Source and publication hashes](manifest.json).

The `v1_superseded` documentation and original notes-model scripts are historical references, not the current protocol. Deferred broken-chip controls in older measured covenants are not automatically part of the founder-approved baseline. Read this index and the current chip-balance design before using historical material.

Some original documents link to wider Stables repository rules, laboratory run directories or node binaries. Those external dependencies are not included in this focused public snapshot. The publication check records such links in `review.json`; an unresolved historical link is not proof that an experiment passed.

## Reproducing the simulator work

The applet source, build definition, dependency lock, build tools, host harnesses and before-fix source are included. Downloaded dependencies, compiled binaries and credential material are not.

The existing Windows build script expects JDK 17 at its recorded local installation path. Review `simcard/applet/tools/build.ps1` and adjust that JDK path for your machine before running it. The dependency downloader checks hashes against `deps.lock.json`.

From `simcard/applet`, run:

```powershell
pwsh -File tools/build.ps1 -Quick
```

This builds the applet and runs the source scan, unit tests and relay tests. To include modeled interruptions and the other offline harnesses without a Minima node, run:

```powershell
pwsh -File tools/build.ps1 -NoLabNode
```

The full build without `-NoLabNode` also uses read-only `runscript` and `mmrcreate` calls against a locally configured Minima laboratory node. The supplied cross-check expects loopback RPC port 9105. Read the scripts before changing those settings. Measurement tools that construct or post transactions are historical laboratory tools, not part of the offline quick build; do not run them against wallets holding real value.

No simulator-generated key or test fixture is a production credential. Certification, hardware validation and production deployment are separate work.

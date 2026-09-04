# Stables

**Be your bank.**

Stables is a sovereign banking protocol built on the [Minima](https://www.minima.global) blockchain.
This repository distributes the Stables applications and the documents that go with them.

Minima is a blockchain where every user runs a complete node on their own phone. Stables is built the
same way: the app carries the node, the node carries the wallet, and the keys never leave the device.
There is no Stables server holding your money, and no account for anyone to freeze.

> **This is a test.** Everything published here today is a community test build using **valueless test
> assets**. It is not a financial product, the tokens are worth nothing, and it must not be treated as
> a place to keep value. Please read [Known limitations](docs/KNOWN_LIMITATIONS.md) before installing.

---

## Where Stables is

Stables moves through four stages. Each stage is a channel of the same application, and the
[links hub](https://stablescouncil.org/links.html) on the website shows which one is active.

| Stage | What it is | Status |
|---|---|---|
| **Showcase** | A presentation of the product direction, with local simulation. Not a live on-chain product. | Superseded. Three drops, the last (`v00.00.03`) in April 2026. |
| **Demo** | The demo channel on Minima, with demo-only assets and no Stables production token on-chain. | Superseded. Frozen at `v0.0.0.3.45` (2026-06-18). |
| **Test** | Real on-chain work on Minima mainnet with valueless test tokens, Winiwa and xWiniwa. | **Active. This is where we are.** |
| **Prod** | The production Stables layer, with real stablecoins on Minima, declared by the Council. | Not started. |

### What has been done

- The showcase and the demo took Stables from a story to a working wallet on Minima: balances,
  activity, sending and receiving, a payment-protection model, a MiniDapp package and an Android app.
- On 2026-09-03 the Council decided to publish the **standalone Android app first**, on its own,
  rather than hold it for a coordinated set. `v0.0.11.38` was the first published test build;
  `v0.0.11.39` followed the same day.
- On 2026-09-04, `v0.0.11.53` shipped after fourteen reviewed iterations in one day: the app says
  when its node is out of date and resyncs it with one confirmation; nothing is reported as failed
  while the node still holds it; payment progress shows the time of every step and an honest
  Broadcasting step; fingerprint or face is offered in the open beside the payment code; every
  figure carries thousands separators.
- Every operation in the test scope (claim, mint, burn, send, receive) has been run end to end on
  Minima mainnet and reconciled against the node's own records, including on a node synced from
  scratch.

### Where we are

The Test stage, with **one published application**: the standalone Android app, which runs its own
Minima node. The assets are valueless. The scope is claim, mint, burn, send and receive, exactly as
described below; everything outside it is present in the app but refuses to run. What we need now
is people installing it, using it, and telling us what they find.

### What is ahead

1. **The other builds of the same application**, one at a time, each published when it reaches the
   standalone app's standard: the MiniDapp package for MinimaOS, the web build, and the companion
   app for people who already run Minima Core. The MiniDapp package is furthest along.
2. **Desktop** (Windows, macOS, Linux): a planned prototype, not scheduled.
3. **Beyond the test scope**, only by a later Council decision and not before: USDw and the
   stablecoin layer, an on-chain trading venue, the Coverage Fund, merchant tools and the Ambassador
   program. All of it is designed and documented; none of it is shipped software.
4. **Prod**, declared by the Council when the test has proven what it must.

## What you can do in this build

| You can | You cannot yet |
|---|---|
| Run a full Minima node inside the app | Use USDw or any stablecoin |
| Claim valueless test Winiwa from the faucet | Trade, place orders, or provide liquidity |
| Send and receive Winiwa and xWiniwa | Buy, sell or convert real value |
| Mint xWiniwa from Winiwa, one for one | Use the Coverage Fund |
| Burn xWiniwa back to Winiwa, one for one | Rely on any of it for money |
| Inspect balances, activity, confirmations and node state | |

Pages for unfinished parts of the product are present and readable, but their operations state that
they activate in a later version and refuse to run. Nothing that cannot be done is hidden; nothing
that is unavailable pretends to work.

## Applications

| Application | Package | Node | Who it is for |
|---|---|---|---|
| **Stables** (standalone) | `org.stablescouncil.stables` | Runs its own Minima node inside the app | The long-term product. One install, nothing else needed |
| **Stables for Minima Core** | `org.stablescouncil.stables.core` | Uses your existing Minima Core node | People already running Minima Core who do not want a second node |
| **Stables MiniDapp** | — | The node hosting MiniDapps | Installing into a Minima node you already run |

Install one. The standalone app and the Core companion each expect to be the only Stables on the
device; running several Minima nodes on one phone makes all of them slow.

Windows, macOS and Linux are planned. They are not released.

## Install

Full instructions, including how to check that the file you downloaded is the file we built, are in
**[docs/INSTALL.md](docs/INSTALL.md)**.

The short version for Android:

1. Download the `.apk` from [Releases](https://github.com/StablesCouncil/stables-app/releases).
2. Compare its SHA-256 against the checksum published with the release.
3. Allow your browser or file manager to install unknown apps, then open the file.
4. Give it time on first run. The node has a chain to catch up on.

**Never uninstall the app to update it.** Installing a newer release over the top keeps your wallet.
Uninstalling deletes it, and without your Vault key that is final.

## Your keys

The app generates a Minima **Vault key** (a seed phrase) on the device. It is the only thing that can
restore your wallet. It is not sent anywhere, it is not recoverable by us, and there is no reset.
Back it up before you put anything in the wallet you would miss. See
**[docs/SECURITY.md](docs/SECURITY.md)**.

## Documentation

| Document | What it covers |
|---|---|
| [Install and verify](docs/INSTALL.md) | Downloading, checking the file, installing, updating, moving to a new phone |
| [Architecture](docs/ARCHITECTURE.md) | How the app, the node and the wallet fit together, and why there is no server |
| [Security](docs/SECURITY.md) | The Vault key, what the app can and cannot do, and how to report a problem |
| [Testing guide](docs/TESTING.md) | What to try, what to look for, and how to report what you find |
| [Known limitations](docs/KNOWN_LIMITATIONS.md) | What is unfinished, unproven, or deliberately switched off |
| [Releases](docs/RELEASES.md) | Version numbering, artifact naming, checksums and the update path |
| [Changelog](CHANGELOG.md) | What changed in each release |

## Reporting a problem

- **In the app:** the Feedback page sends a structured report.
- **Community:** [Stables Community on Telegram](https://t.me/stablescommunity).
- **Security issues:** please read [docs/SECURITY.md](docs/SECURITY.md) first and do not open a public
  issue for anything that could put someone's funds at risk.

Tell us what you did, what you expected, and what happened instead. A transaction id and the version
from the app's Settings page turn a report into something we can act on.

## Links

- Website: [stablescouncil.org](https://stablescouncil.org)
- Council: [github.com/StablesCouncil](https://github.com/StablesCouncil)
- Minima: [minima.global](https://www.minima.global)

## Licence

[GNU Affero General Public License v3.0](LICENSE).

Chosen deliberately. A bank you cannot be locked out of only works if the software can be inspected,
and AGPL means any fork stays open too, including one offered to people over a network. Nobody can
take Stables, close it, and hand it back to your users as something they can no longer read.

## Status and honesty

Stables is under active development by a small team. The protocol design for stablecoins, reserves,
governance and the trading venue exists and is documented, but it is **not** in this build and is not
proven. Where this repository says something has been tested, it means exactly what it says and no
more. Where something is unproven, it is listed in
[Known limitations](docs/KNOWN_LIMITATIONS.md).

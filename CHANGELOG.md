# Changelog

Every entry describes what changed for the person using the app. Technical detail lives in the
release notes for each version.

Versions are `v<generation>.<line>.<iteration>`; the iteration increases on every build that changes
the application, so a version names exactly one artifact. See [docs/RELEASES.md](docs/RELEASES.md).

Each release below is the standalone Android app. The scope is the Winiwa and xWiniwa test described
in the [README](README.md), with the boundaries stated in [Known limitations](docs/KNOWN_LIMITATIONS.md).
The release notes on the [Releases](https://github.com/StablesCouncil/stables-app/releases) page carry
the checksums and the detail.

## v0.0.11.53, 2026-09-04

- Your bank tells you when it is out of date. A phone that has been offline too long to catch up on
  its own says so on the Wallet page, in place of the balance, and offers one action: Resync with
  the network. Settings, Network says how far behind the bank is and whether the gap is closing.
- Nothing is called failed while your node still has it. A faucet claim the node can see waits; a
  claim that genuinely fails hands the faucet countdown back.
- Payment progress shows the time each step finished and how long the current step has run.
  Broadcasting says when the bank has no peers to relay to; Settings, Network reads Alone or how
  many nodes it is connected to.
- Fingerprint or face is offered in the open, beside the payment code, under Payment protection.
- Commas for thousands everywhere, in every figure and every amount field.
- Opening the app asks the node once for what several parts want at the same moment. Mint and burn
  work on a fresh node. StablesAgent answers on the first try. Send sits on the right and Receive on
  the left wherever both are offered. Recent activity has See all.

## v0.0.11.39, 2026-09-03

- The payment-received notification names the token the way a person does. A Minima token name can
  arrive as a JSON object; v0.0.11.38 showed it raw.

## v0.0.11.38, 2026-09-03

First published build.

- Network contribution: Pause, Minimum, Balanced or Maximum decides how much the phone helps run
  Minima on battery; the charger always runs at full speed. Under it: TxPoW today and in total, time
  online today, the device hash rate and a daily chart.
- The open app uses about a third of the battery it did.
- Notes in your hands: each token on Wallet management has Manage, showing the exact notes with
  amount and age. Pick the notes, choose how many to end with, see the transaction size against the
  64 KB network limit, and rebuild.
- Errors in plain words: a transaction that is too large says so in kilobytes and offers Manage notes.
- One placement rule for every action; a sheet closes with its Back, never a Cancel button; burn
  confirmations are red.
- Security: Payment protection and Confirmation policy as two sections, a one-level 3-block default.
- Payments show the time each step completed; Broadcasted is its own step.

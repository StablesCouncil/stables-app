# Security

## Reporting a vulnerability

**Do not open a public issue for anything that could put someone's funds or keys at risk.**

Contact the Council privately through [Stables Council on Telegram](https://t.me/StablesCouncilOfficial)
and say that you have a security report. We will give you a private channel. Tell us what you found,
how to reproduce it, and what you think it allows. We will tell you what we intend to do and when.

Please do not test findings against anyone else's wallet.

## Your Vault key

The app creates a Minima **Vault key**, a seed phrase, on your device.

- It is generated on the phone and stored by the node in the app's private storage.
- It is **never** transmitted. There is no copy on any server we run.
- It is the **only** way to restore your wallet. We cannot reset it, recover it, or identify you.
- Anyone who has it has your funds.

Write it down, on paper, offline. Do not photograph it, do not put it in a notes app, do not send it
to anyone, and do not type it into any website. Nobody from Stables will ever ask you for it.
Any message that does is an attempt to rob you.

## What the app does with keys

- Transactions are signed **on the device**, by the node inside the app.
- The app has no Stables account, login, or custody. There is nothing for us to hold.
- The standalone build exposes its node over a private in-app channel only. It does not open a
  network port for the node's command interface.
- The Core companion talks to a Minima Core you already run, through Android's package-scoped
  messaging, with an explicit permission you grant in Core. It does not start a node of its own.

## What the app cannot do

- It cannot recover your wallet without your Vault key.
- It cannot reverse a confirmed transaction. Nothing on a blockchain can.
- It cannot tell you that a counterparty is honest.

## Test assets have no value

Winiwa and xWiniwa in this build are **valueless test assets**. They are not money, they are not
backed by anything, and they are not tradeable. Anyone offering to buy them, or asking you to send
them somewhere to "unlock" or "upgrade" them, is running a scam.

## Scams to expect

Blockchain communities attract fraud, and a young project attracts more of it. Expect:

- fake "support" accounts messaging you first, especially after you post a problem publicly;
- people asking for your Vault key or seed phrase "to help";
- fake versions of this app hosted somewhere other than this repository;
- fake giveaways, airdrops, or "claim" links;
- someone claiming to be the founder or the Council in a direct message.

We will never contact you first asking for keys, funds, or remote access. Download the app only from
this repository's Releases page, and check the checksum.

## Reporting a scam

Tell the [community group](https://t.me/stablescommunity). Warning other people quickly is worth more
than being certain.

## Scope of what has been tested

This is a test build. Claim, mint, burn, send, receive, restart recovery and refusal behaviour have
been exercised on real devices with valueless assets, and the results are recorded. That is
development evidence at the level observed. It is **not** an audit, it is not an independent
reproduction, and it is not a statement that the app is safe to hold value in. See
[Known limitations](KNOWN_LIMITATIONS.md).

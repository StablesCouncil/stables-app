# Paying with the Stables card at a distance

**Status:** Phase 1 (person to person) BUILT in 3-test 0.0.12.062, not published, not yet run between two funded
wallets. Phase 2 (merchants and ambassadors) DESIGNED, not built.
**Decisions:** D122 (a scanned code never pays by itself), D123 (signed payment requests), both in
`work/Machinery/decisions/`.
**Code:** `website/dapp/3-test/assets/instant-protocol.js` (format, signing, checks), `instant-balance.js` (screens),
`payment-security.js` (`cardDistanceCap`).
**Parent design:** `chip-balance-design.md` §4.5.

## 1. What the founder asked and decided (2026-10-06)

The Stables card paid only by tap (D093). The founder asked for its QR function to pay at a distance: an online shop,
or a person who is not next to you. Rulings:

1. **Card payments at a distance are allowed**, never without Confirm send, and with a cap (200 by default).
2. **Merchant identity:** every protection that does not depend on a website. That means remembering a payee's key
   on first payment, warnings, and later an in-app directory vouched for by ambassadors.
3. **No reliance on a website or any external party: everything is app to app.** A code travels whole: as a QR, as
   pasted text, or as a `stables:` link sent through any messaging app. No server looks anything up. A short hash
   alone is not enough, because the payer's app would have to fetch the request somewhere.
4. **Codes that do not come from a phone next to you always ask to confirm** (D122).

The founder's premise for the physical card: the receiving device gets proof that the payment comes from a genuine
card with genuine coins, whatever the channel. The payment text's optional `Attestation:` line already travels on
every channel for this. Today's phone-only card does not fill it, so until the physical card exists, the cap is what
limits a payment at a distance.

## 2. The ways a card payment travels

| Way | Who starts it | What proves who is paid | Confirm |
|---|---|---|---|
| Tap (NFC) | Phones held together | Four centimetres: the other phone is the one in front of you | One touch within the card's one-touch level (D060/D098) |
| Code (QR, paste or `stables:` link) | "Pay with a code" on Pay | The request's signature plus what the card remembers of that key | Always Confirm send (D122); refused above the cap |

The tap stays the card's way. "Pay with a code" and "Share a payment request" open the code way for that opening of
the sheet only. A phone without NFC, and the web, open on the code way directly.

## 3. The signed payment request (format)

A request is the card's receiver code with five more lines, all signed by the payee's own card key, the P-256 key
whose SHA-256 is the `Payee` id:

```
Stables offline receiver
Scheme: 0x53544205
Token ID: 0x<64 hex>
Asset: Winiwa
Amount: 2.5                       (optional)
Payee: <base64url, 32 bytes>
Payee key: <base64url, 65 bytes>
Address: 0x<64 hex>               (where the payment is sent over the network, D087)
Name: <base64url of UTF-8>        (the payee's bank name, up to 40 characters; optional)
Reference: <base64url of UTF-8>   (an order or a bill, up to 60 characters; optional)
Request: <32 hex>                 (one-time id)
Expires: <milliseconds since 1970>
Request signature: <base64url, 64 bytes, r||s>
```

**Signed bytes:** the UTF-8 of ten lines joined by a newline:
`STBR` | `1` | payee id (hex) | token id (hex) | amount in atoms (empty for none) | address (upper case, empty for
none) | name (base64url) | reference (base64url) | request id | expires.
They are signed with ECDSA P-256 over SHA-256 (`requestMessage`, `verifyRequest`).

**Encoding.** The name and reference are base64url text because the parser rebuilds a one-line paste by splitting on
known labels, so free text containing "Amount:" or a line break would otherwise corrupt the code.

**Payment text.** A payment made for a request carries two more lines, `Request:` and `Reference:`. They are **not**
in the payment's signed bytes, which are still the 198 bytes of scheme 0x05. They only let the receiver match the
payment to its request. The amount, the currency and the payee are signed as before.

**Rules when a code is read** (`checkReceiver`; each refusal moves nothing):

| Situation | Code | What the person reads |
|---|---|---|
| Any signed field changed, or the key replaced | `request-altered` | This payment request has been changed since it was made. Do not pay it. |
| Past `Expires` | `request-expired` | This payment request has expired. Ask for a new one. |
| This card already paid this request id | `request-paid` | You already paid this payment request. (Checked again inside the debit.) |
| A `Name:` or `Reference:` with no signature | `request-unsigned` | The name cannot be checked. A name nobody signed is a name anybody could write. |

A plain receiver code (no request lines) still works as before: in person, by tap.

## 4. What the payer sees before Confirm send

Under the code field the card shows who signed the request:

- **The name** the request carries (or "No name given").
- **One line in its tone:**
  - green "Paid before (n times)" when this card has paid that key before;
  - amber "First payment to this payee. Check it is who you expect.";
  - red "You paid "<name>" before with a different key. This may not be them." when another key was paid under the
    same name. This is how a swapped code shows itself;
  - amber "This code is not a signed request: it names nobody." for a plain code at a distance.
- **Reference, validity and a short key** (first and last four characters of the payee id) to compare with the payee.

**Remembering payees.** The card stores `payee:<id>` (name, count, first and last payment) and `request:<id>` (paid)
records in its own IndexedDB `meta` store, written in the same transaction as the debit. A thief who signs a copy of a
shop's request with their own key produces a valid signature, so it is the remembered key and the clash warning that
catch it, not the signature alone.

## 5. Cap and confirmation

- **The cap:** a payment by code is refused above the card's one-touch day level (`cardDistanceCap`, 200 in the main
  currency by default; it follows the levels the person sets on the card). Confirm send is off and the line says why
  (law 11); the press checks again.
- **Confirmation:** a payment by code always needs Confirm send (D122), with the payment code where the payment tiers
  ask for it.

## 6. Delivery

The payment goes over the Minima network in the D087 envelope: one atom to the request's `Address`, with the payment
text in the state. That is about 20 to 25 seconds. The receiver's phone reads it from its history (`takeCarrier`) and
credits it, and the request id and reference are kept on its journal entry. Nothing passes through a server. A code
way payment keeps the network route after Send closes (`code.far`). With no node, the payment is shown as its QR, as
before.

## 7. Phase 2 (designed, not built): merchants and ambassadors

**Merchant codes.**
- **Per-order code:** what Phase 1 already makes. Amount, reference and a 24-hour expiry, best for an online shop:
  the shop's app matches the reference and marks the order paid.
- **Fixed code** for a sign or a website footer: shop key, name and signature, with no amount or reference. The
  customer types the amount. The same identity checks apply. It belongs in My shop, not on the card.

**Ambassador vouching, app to app and on the chain.** It builds on the programme draft
(`website/ambassadorsprogramdesc.html`):
- anyone may register as an ambassador;
- a "Verified" listing costs 16 Big Macs, or 15 with an ambassador, for 12 months;
- the fee is split 8 to the onboarding ambassador, 1 to their mentor, and 6 or more to the Council.

The steps:
1. The shop's app creates its shop key and shows its STBL code (`STBL-XXXX-XXXX-XXXX-XXXX`) to the ambassador. The
   Ambassadors page already loads this code.
2. The ambassador checks the shop in person: premises, owner, activity.
3. The ambassador's app signs "this shop key belongs to this name, at this place, until this date" with the
   ambassador's own registered key.
4. The shop's app countersigns and posts one listing transaction. It pays the fee, split as above, and leaves a coin
   holding the shop key, name, place, expiry, and the ambassador's key and signature.
5. The payer's app finds a live listing for the shop key on the chain itself and shows "Verified shop, vouched by
   <ambassador>, until <date>".

**What it does and does not prove.**
- The badge costs a fraud the listing fee and leaves a public record of who vouched. It is not a guarantee, because
  anyone can become an ambassador, so remembering keys stays the first protection.
- Names can repeat, so the confirm screen always shows the place and the ambassador with the name.
- Ambassadors need their own small on-chain registration for their signatures to be checkable.

**The one technical point.** A new install sees only recent coins, so older listings could be invisible to it. The
"help new installs" proof can carry a fingerprint of the directory (like the faucet and vault), and listings renew
every 12 months.

**Open for the founder before Phase 2:**
- Is the listing fee charged in test Winiwa in the test release?
- Who can remove a bad listing before the Council is open?
- Is there a fixed checklist the ambassador's signature confirms?

## 8. Not built yet (next slices)

- **Opening a `stables:` link from another app on Android.** The app already reads a pasted link. Opening one needs:
  - an intent filter on `StablesActivity` (the manifest has none today);
  - `onCreate` / `onNewIntent` handling;
  - an `evaluateJavascript` hand-off to the Pay form.

  This needs an APK build.
- **Activity rows naming the payee and the reference.** Both are stored on the journal entries (`peerName`,
  `reference`) but not drawn yet.
- Phase 2 above.

## 9. How to test person to person (Phase 1)

**On the laptop** (the INSTANT-ABC harness, `reference_three_profile_instant_harness`):
1. Use two browser profiles, each on its own lab node (9101 and 9201 through their proxies), each with a funded
   card (Add to the card from Savings). The web has no NFC, so the card opens on the code way.
2. **A**, on Get paid: amount, reference, then Copy (or Share, which gives a `stables:` link).
3. **B**, on Pay: paste the code or the link. Check the signer panel ("First payment to this payee"). Press Confirm
   send.
4. The payment goes over the network. A's card credits it within about 25 seconds. A second payment of the same
   request is refused.
5. Paste a copy with a changed amount: it is refused as changed.

**On phones:**
- The Pro opens the card on the tap; "Pay with a code" and "Share a payment request" switch it.
- Until the Android link handling exists, send the request text (Copy) and paste it on the other phone.
- One device can later play the merchant, then the ambassador, once Phase 2 exists.

**Verified so far (2026-10-06):**
- Protocol unit test, 19 of 19: round trip; name with a colon; one-line paste; tampering with amount, address and
  name; a thief's re-signed copy flagged by the clash; paying twice refused; expiry; the receiver keeps the request
  and reference; the payment signature unchanged; plain codes unchanged.
- `verify-instant-balance.mjs` PASS.
- Browser: Get paid makes a verified request named "Lab wallet A" with its reference, address and hint. Pay fills the
  form from a pasted request and from a link, and shows "First payment to this payee". A tampered copy is refused.
- **Not yet run:** a payment between two funded cards.

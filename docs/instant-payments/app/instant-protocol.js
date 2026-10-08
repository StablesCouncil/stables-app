/*
 * Stables Instant balance: the offline checking account's protocol core (scheme 0x05, build 103).
 *
 * BUILD 103 (step 2, simcard/docs/step2-load-offload-design.md version 2, founder decisions of
 * 2026-09-28): the balance is now LOADED from Savings on chain and OFFLOADED back to Savings on chain
 * (instant-chain.js builds those transactions; this file keeps the balance they move). "Add test
 * credit" is retired with a FRESH ACCOUNT VERSION: a new P-256 key in a new store
 * (stables-instant-v2), speaking scheme byte 0x05. Scheme 0x05 is 0x04 with nothing else changed
 * (the same 198 signed bytes, the same texts); 0x04 joins the refused legacy versions, so a payment
 * made from a test-credit account can never reach a real balance, even by a tap. The old account is
 * frozen, not spendable and not counted: readRetired() reads its figure (never writing, never
 * creating the old store) so the app can show it as "Test credit retired" (law 4: nothing
 * disappears silently). The unbacked test credit function is gone.
 *   Loads:    recordLoad / updateLoad keep the app's own record of a load it built (the fast path);
 *             creditLoad credits a load ONCE PER LOAD COIN ID (the seen key load:<coinid>, written in
 *             the same durable transaction as the credit, exactly as receive() writes a payment and
 *             its seen key), whichever path finds it first (the app's own record or a vault scan).
 *   Offloads: beginOffload DEBITS FIRST (one durable transaction, keyed by the withdrawal id, so one
 *             press can never debit twice), updateOffload follows the withdrawal, and restoreOffload
 *             gives the amount back ONLY while nothing has been posted (a posted withdrawal is never
 *             restored: it is followed to the chain, or rebuilt under the same id).
 *   chainInfo / setChainInfo keep the account's on-chain identity: its dedicated withdrawal key (the
 *             public key only; the private key lives in the node's wallet), its Savings payout
 *             address, and its registration coin per currency.
 * Every journal entry of the new account is named INSTANT-5-..., so no row of the retired account
 * (INSTANT-OUT-1 and so on, still in the activity history) can collide with a new one.
 *
 * The rest of this header is the offline protocol as built in builds 100 to 102 (scheme 0x04), which
 * 0x05 carries unchanged.
 *
 * Stage 1 of the chip-balance design (simcard/docs/chip-balance-design.md, sections 0a, 3 and 4):
 * the app plays the chip ("software chip"). One ECDSA P-256 key per account, a balance PER
 * CURRENCY, one monotonic payment counter and a journal, all in one durable store. Payments move
 * between two devices and never touch a node or the network.
 *
 * UX law 22 (founder 2026-09-28) made the Instant balance work exactly like Savings: the receiver
 * shows a code straight away and the payer scans it, enters the amount and confirms. UX law 23
 * (founder 2026-09-28, after build 99): "In instant payment we need the same amount and currency
 * selector". So the Instant balance holds the same currencies Savings offers, and scheme 0x04
 * carries the CURRENCY (its token id) inside the signed payment bytes and in the payment text:
 *
 *   Receiver: receiverCode(opts)      -> the receiver's code: scheme, the currency asked for, an
 *                                        OPTIONAL amount (the Savings Receive's "Amount (optional)"),
 *                                        receiver account id and public key (and the reserved
 *                                        Attestation line). With no amount it is the same text
 *                                        every time for the same currency. It is not signed: it
 *                                        only fills the payer's form, and the payer confirms.
 *   Payer:    pay(code, amount, opts) -> COMMIT FIRST (one durable transaction: debit THAT
 *                                        currency, counter + 1, the exact signed payment stored),
 *                                        THEN the payment text. The payer generates a 16-byte
 *                                        payment id (an identifier only). A second commit with the
 *                                        same payment id returns the stored payment: never a second
 *                                        debit for one confirmation.
 *   Receiver: receive(paymentText)    -> verify the signature (which covers the currency); refuse
 *                                        a payment named for another receiver and a duplicate
 *                                        (payer id + counter; the counter is one per account, not
 *                                        one per currency); credit THAT currency durably. Final at
 *                                        the moment it is received.
 *
 * No expiry and no receiver nonce: a payment stays valid until the NAMED receiver credits it, and
 * only that receiver can credit it, only once. A torn transfer (the receiver missed it) is finished
 * by re-showing the SAME stored payment from the payer's "Paid offline" row; it is never signed a
 * second time.
 *
 * Signed bytes (ECDSA P-256 over SHA-256), 198 bytes:
 *   "STBO" | version 0x05 (0x04 before build 103) | payer id (32) | payer public key (65) | payee id (32)
 *   | token id (32) | amount atoms (u64 BE) | counter (u64 BE) | payment id (16)
 *
 * Text: the retail invoice's "Label: value" lines. Payment ID = 0x535442 | scheme byte 05 | the
 * 16-byte payment id (hex, the retail Payment ID shape); the receiver code has no payment, so it
 * names its scheme as "Scheme: 0x53544205". The currency travels as "Token ID: 0x<64 hex>", the
 * retail invoice's own label for it, followed by "Asset: <name>" for a person reading the text; the
 * name must be the one this app gives that token id, or the text is refused as damaged. Amount is a
 * plain decimal (8 places at most, integer atoms inside). Account ids, public keys and the
 * signature are base64url (no padding). A one-line field strips line breaks; the parser puts each
 * known "Label:" back on its own line, so the same text reads whether it was scanned, pasted, or
 * typed into a single-line field.
 *
 * Which currencies exist is the app's to say: configureCurrencies([{code, label, tokenId}]) is
 * given the same set Savings offers (the app's own token registry). A token id this app does not
 * offer is refused ('asset'). Schemes 0x02 (step 1, request + nonce, builds 97 and 98) and 0x03
 * (one currency, build 99) are refused with an honest message: their data was test-only. A balance
 * kept by build 99 (one figure, no currency) is read as the currency it was in (opts.legacyTokenId,
 * Winiwa), so nobody's test figure silently changes.
 *
 * Honest scope (Stage 1): this is trusted SOFTWARE. A modified app could credit itself. That is
 * acceptable only for valueless test tokens; Stage 2 moves the key and balance into a secure chip.
 *
 * Hooks kept for later steps, unused now:
 *   - keyStore is a small interface {kind, create(), publicKey(), sign(bytes)}. Step 1 uses WebCrypto
 *     (non-extractable private key persisted in IndexedDB). Step 1b swaps in an Android Keystore
 *     implementation (StrongBox) without touching this protocol: it must return the RAW 65-byte
 *     uncompressed P-256 public key (strip the X.509 SubjectPublicKeyInfo header) and a 64-byte
 *     r||s signature (convert Keystore's DER output) over SHA-256 of the same message bytes.
 *   - Optional "Attestation:" line in both the receiver code and the payment (field `att`). Absent
 *     in step 1. Parsers carry it through; verifiers ignore it when absent and do not act on it yet.
 *     The attestation certificate chain binds the PUBLIC KEY, which the payment signature already
 *     covers, so `att` does not need to be inside the signed bytes.
 *   - The scheme byte lets a later rule arrive as a new version without a redesign (0x04 and 0x05 are two).
 *
 * Signed payment requests (build 0.0.12.062, Machinery D123; simcard/docs/card-pay-at-distance.md): for paying at a
 * distance the receiver code may carry Name and Reference (base64url UTF-8), a one-time Request id, Expires and a
 * Request signature by the payee key over requestMessage ("STBR", version 1). checkReceiver refuses a changed, expired or
 * already paid request; a name never travels unsigned. A payment for a request repeats Request and Reference unsigned,
 * for matching only: the signed payment bytes above are unchanged.
 *
 * Runs in the browser (window.StablesInstantProtocol) and in Node (module.exports) for unit tests.
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.StablesInstantProtocol = api;
})(typeof window !== 'undefined' ? window : globalThis, function (G) {
  'use strict';

  /* ---------- constants ---------- */
  var VERSION = 5;                         // scheme byte: 0x05 = 0x04 (per currency) on the fresh, loadable account (build 103)
  var LEGACY_VERSIONS = [2, 3, 4];         // 0x02 step 1 (request/nonce), 0x03 one currency, 0x04 the test-credit account: test-only data, refused
  var ROW = 'INSTANT-5-';                  // the new account's journal ids, apart from the retired account's INSTANT-OUT-n
  var DB_NAME = 'stables-instant-v2';      // the new account's store (build 103)
  var RETIRED_DB_NAME = 'stables-instant-v1';   // the test-credit account's store: read, never written
  var ID_PREFIX = '0x535442';              // "STB": the retail Payment ID family (0x53544201 = on-chain invoice)
  var DOMAIN = [0x53, 0x54, 0x42, 0x4f];   // "STBO": domain tag for the signed payment bytes
  var DECIMALS = 8;
  var SCALE = BigInt('100000000');
  var MAX_ATOMS = BigInt('9223372036854775807');
  var HEAD_RECEIVER = 'Stables offline receiver';
  var HEAD_PAYMENT = 'Stables offline payment';
  var HEAD_LEGACY_REQUEST = 'Stables offline request';   // scheme 0x02 only
  var MESSAGE_BYTES = 4 + 1 + 32 + 65 + 32 + 32 + 8 + 8 + 16;
  /* Every label a payload can carry, longest first where one is a prefix of another. */
  var LABEL_RE = /\s*(Payment ID|Token ID|Scheme|Amount|Asset|Payee key|Payer key|Payee|Address|Link|Counter|Signature|Attestation|Expires|Request signature|Request|Reference|Name)\s*:/g;
  /* A signed payment request (D123, build 0.0.12.062): the receiver code's own signature, by the payee's card key. */
  var REQUEST_DOMAIN = 'STBR';
  var REQUEST_VERSION = '1';
  var REQUEST_NAME_MAX = 40;               // characters, after UTF-8 decoding
  var REQUEST_REFERENCE_MAX = 60;

  /* ---------- errors: a code for tests and logic, a plain sentence for people ---------- */
  var MESSAGES = {
    'malformed': 'This QR code is not a readable offline payment.',
    'version': 'This offline code needs a newer version of Stables.',
    'old-scheme': 'This code comes from an older test version of Stables and can no longer be used. Nothing was moved.',
    'asset': 'This offline code is in a currency Stables does not offer here. Nothing was moved.',
    'amount-invalid': 'Enter an amount above zero, with at most 8 decimal places.',
    'bad-code': 'This receiver code is damaged. Ask the receiver to show it again.',
    'self': 'This is your own Stables card code.',
    'insufficient': 'Your Stables card balance is too low for this payment.',
    'busy': 'Another payment is still being recorded. Try again.',
    'wrong-receiver': 'This payment is for another account. It was not credited.',
    'bad-signature': 'This payment failed its signature check. It was not credited.',
    'duplicate': 'This payment was already received.',
    'no-key': 'Your Stables card has no signing key yet.',
    'unavailable': 'This device cannot hold a Stables card.',
    'request-altered': 'This payment request has been changed since it was made. Do not pay it. Nothing was moved.',
    'request-expired': 'This payment request has expired. Ask for a new one. Nothing was moved.',
    'request-paid': 'You already paid this payment request. Nothing was moved.',
    'request-unsigned': 'This code carries a name without a signature, so the name cannot be checked. Nothing was moved.',
    'posted': 'This move to Savings was already sent to the network, so it is followed there and not reversed.',
    'unknown': 'There is no such move on this Stables card.'
  };
  function InstantError(code, message) {
    var e = new Error(message || MESSAGES[code] || code);
    e.code = code;
    e.instant = true;
    return e;
  }

  /* ---------- bytes ---------- */
  function toHex(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return s;
  }
  function fromHex(hex) {
    var h = String(hex || '').replace(/^0x/i, '');
    if (h.length % 2 || /[^0-9a-f]/i.test(h)) throw InstantError('malformed');
    var out = new Uint8Array(h.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
    return out;
  }
  /* Keys, ids and signatures travel as base64url in the QR text: a third fewer characters than hex,
     which keeps the payment code about two QR versions less dense for a camera reading a screen.
     The token id is the exception: it travels as the 0x hex a person can match in an explorer, and
     under the retail invoice's own label (Token ID). */
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function hexToB64u(hex) {
    var b = fromHex(hex), out = '', i;
    for (i = 0; i + 2 < b.length; i += 3) {
      var n = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2];
      out += B64[n >> 18 & 63] + B64[n >> 12 & 63] + B64[n >> 6 & 63] + B64[n & 63];
    }
    if (b.length - i === 1) { out += B64[b[i] >> 2] + B64[(b[i] & 3) << 4]; }
    else if (b.length - i === 2) { var m = (b[i] << 8) | b[i + 1]; out += B64[m >> 10] + B64[m >> 4 & 63] + B64[(m & 15) << 2]; }
    return out;
  }
  function b64uToHex(text, bytes) {
    var s = String(text || '');
    if (!/^[A-Za-z0-9_-]+$/.test(s) || s.length !== Math.ceil(bytes * 4 / 3)) return null;
    var bits = 0, acc = 0, out = [];
    for (var i = 0; i < s.length; i++) {
      acc = (acc << 6) | B64.indexOf(s[i]);
      bits += 6;
      if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 255); acc &= (1 << bits) - 1; }
    }
    if (out.length !== bytes || (acc & ((1 << bits) - 1)) !== 0) return null;   // canonical form only
    return toHex(out);
  }
  /* Free text (a name, a reference) travels as base64url of its UTF-8 bytes: it may hold a colon or a label word,
     which the one-line repair (normalize) would otherwise split. */
  function textToB64u(s) {
    var bytes = new TextEncoder().encode(String(s == null ? '' : s));
    return bytes.length ? hexToB64u(toHex(bytes)) : '';
  }
  function b64uToText(s) {
    var t = String(s || '');
    if (!t || t.length % 4 === 1) return null;
    var hex = b64uToHex(t, Math.floor(t.length * 3 / 4));
    if (hex == null) return null;
    try { return new TextDecoder('utf-8', { fatal: true }).decode(fromHex(hex)); } catch (_) { return null; }
  }
  function writeU64(buf, offset, value) {
    var v = BigInt(value);
    for (var i = 7; i >= 0; i--) { buf[offset + i] = Number(v & BigInt(255)); v = v >> BigInt(8); }
  }
  function subtleOf(env) {
    var c = (env && env.crypto) || G.crypto;
    return c && c.subtle ? c.subtle : null;
  }
  function randomBytes(n, env) {
    var c = (env && env.crypto) || G.crypto;
    if (!c || typeof c.getRandomValues !== 'function') throw InstantError('unavailable');
    var b = new Uint8Array(n);
    c.getRandomValues(b);
    return b;
  }
  async function sha256(bytes, subtle) {
    return new Uint8Array(await subtle.digest('SHA-256', bytes));
  }
  /** A fresh 16-byte payment id (hex). The payer's; an identifier only, never a security value. */
  function newPaymentId(env) { return toHex(randomBytes(16, env)); }

  /* ---------- amounts: integer atoms at 8 decimals, never floating point ---------- */
  function parseAmount(value) {
    var s = String(value == null ? '' : value).replace(/,/g, '').trim();
    var m = s.match(/^(\d+)(?:\.(\d*))?$/);
    if (!m) throw InstantError('amount-invalid');
    var frac = m[2] || '';
    if (frac.length > DECIMALS) throw InstantError('amount-invalid');
    var atoms = BigInt(m[1]) * SCALE + BigInt((frac + '00000000').slice(0, DECIMALS));
    if (atoms <= BigInt(0) || atoms > MAX_ATOMS) throw InstantError('amount-invalid');
    return atoms;
  }
  /** Canonical decimal text used inside QR payloads: no commas, no trailing zeros. */
  function atomsToDecimal(atoms) {
    var a = BigInt(atoms);
    var neg = a < BigInt(0);
    if (neg) a = -a;
    var whole = (a / SCALE).toString();
    var frac = (a % SCALE).toString().padStart(DECIMALS, '0').replace(/0+$/, '');
    return (neg ? '-' : '') + whole + (frac ? '.' + frac : '');
  }
  /** Display text: commas for thousands (UX law 18a), at least two decimals, never more than eight. */
  function formatAmount(atoms) {
    var dec = atomsToDecimal(atoms);
    var neg = dec.charAt(0) === '-';
    if (neg) dec = dec.slice(1);
    var parts = dec.split('.');
    var frac = (parts[1] || '');
    if (frac.length < 2) frac = (frac + '00').slice(0, 2);
    return (neg ? '-' : '') + parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + frac;
  }

  /* ---------- currencies: the set the app offers, each named once ---------- */
  var CURRENCIES = [];
  /** A token id as 64 lowercase hex characters (no 0x), or null. */
  function tokenHex(value) {
    var h = String(value == null ? '' : value).trim().toLowerCase().replace(/^0x/, '');
    return /^[0-9a-f]{64}$/.test(h) ? h : null;
  }
  /**
   * The currencies an Instant balance may hold: [{code, label, tokenId}]. The app passes the same
   * set Savings offers; a later call replaces the set. Returns the set it kept.
   */
  function configureCurrencies(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (c) {
      var id = tokenHex(c && c.tokenId);
      var label = String((c && c.label) || '').trim();
      if (!id || !label) return;
      if (out.some(function (x) { return x.tokenId === id || x.label === label; })) return;
      out.push({ code: String((c && c.code) || label), label: label, tokenId: id });
    });
    CURRENCIES = out;
    return currencies();
  }
  function currencies() { return CURRENCIES.map(function (c) { return { code: c.code, label: c.label, tokenId: c.tokenId }; }); }
  /** The currency a token id names, or null when this app does not offer it. */
  function currencyOf(tokenId) {
    var id = tokenHex(tokenId);
    for (var i = 0; i < CURRENCIES.length; i++) if (CURRENCIES[i].tokenId === id) return { code: CURRENCIES[i].code, label: CURRENCIES[i].label, tokenId: id };
    return null;
  }
  function requireCurrency(tokenId) {
    var c = currencyOf(tokenId);
    if (!c) throw InstantError('asset');
    return c;
  }

  /* ---------- payload text (the retail invoice's "Label: value" lines and Payment ID) ---------- */
  function schemeTag() { return ID_PREFIX + '0' + VERSION.toString(16); }
  function paymentIdText(idHex) { return schemeTag() + idHex; }

  function encodeReceiver(r) {
    var cur = requireCurrency(r.tokenId);
    var lines = [
      HEAD_RECEIVER,
      'Scheme: ' + schemeTag(),
      'Token ID: 0x' + cur.tokenId,
      'Asset: ' + cur.label
    ];
    if (r.amount != null) lines.push('Amount: ' + atomsToDecimal(r.amount));
    lines.push('Payee: ' + hexToB64u(r.payeeId));
    lines.push('Payee key: ' + hexToB64u(r.payeeKey));
    // The receiver's own Savings address (build 0.0.12.021, D087): where the payer's phone sends the
    // payment over the network, so the receiver never has to scan anything. Optional: a code without it
    // is paid by the second scan, as before. Not signed, like the rest of this code: a payment is bound
    // to the Payee, so a carrier sent to a wrong address can only be lost, never cashed by someone else.
    if (r.address) lines.push('Address: ' + r.address);
    // The one-time Bluetooth link of this Receive (build 0.0.12.028, D092): the payer's phone finds exactly this
    // phone by it and hands the payment over directly. Optional: without it the address (network) is used.
    if (r.link) lines.push('Link: ' + r.link);
    // A signed payment request (D123): who asks (Name), for what (Reference), once (Request) and until when
    // (Expires), signed with the payee's card key over requestMessage. Without these lines the code is the plain,
    // unsigned receiver code it always was (paid in person by tap).
    if (r.request) {
      if (r.request.nameB64) lines.push('Name: ' + r.request.nameB64);
      if (r.request.referenceB64) lines.push('Reference: ' + r.request.referenceB64);
      lines.push('Request: ' + r.request.id);
      lines.push('Expires: ' + String(r.request.expiresAt));
      lines.push('Request signature: ' + hexToB64u(r.request.signature));
    }
    if (r.att) lines.push('Attestation: ' + String(r.att));
    return lines.join('\n');
  }

  /**
   * The bytes a payee signs for a payment request (D123): UTF-8 of ten lines,
   *   "STBR" | "1" | payee id (hex) | token id (hex) | amount atoms ("" for none) | address ("" for none)
   *   | name (base64url, "" for none) | reference (base64url, "" for none) | request id (hex) | expires (ms)
   * signed with ECDSA P-256 over SHA-256 by the key whose SHA-256 is the payee id. Changing any of them, or
   * replacing the key, breaks the signature.
   */
  function requestMessage(r) {
    return new TextEncoder().encode([
      REQUEST_DOMAIN, REQUEST_VERSION, String(r.payeeId).toLowerCase(), tokenHex(r.tokenId),
      r.amount == null ? '' : BigInt(r.amount).toString(), r.address ? String(r.address).toUpperCase() : '',
      r.nameB64 || '', r.referenceB64 || '', String(r.requestId).toLowerCase(), String(r.expiresAt)
    ].join('\n'));
  }

  /** True when a parsed receiver code's request signature holds for its own payee key. */
  async function verifyRequest(code, subtle) {
    try {
      if (!code || !code.request) return false;
      var key = await subtle.importKey('raw', fromHex(code.payeeKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      return await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, fromHex(code.request.signature), requestMessage({
        payeeId: code.payeeId, tokenId: code.tokenId, amount: code.amount, address: code.address,
        nameB64: code.request.nameB64, referenceB64: code.request.referenceB64, requestId: code.request.id, expiresAt: code.request.expiresAt
      }));
    } catch (_) {
      return false;
    }
  }

  function encodePayment(p) {
    var cur = requireCurrency(p.tokenId);
    var lines = [
      HEAD_PAYMENT,
      'Payment ID: ' + paymentIdText(p.paymentId),
      'Amount: ' + atomsToDecimal(p.amount),
      'Token ID: 0x' + cur.tokenId,
      'Asset: ' + cur.label,
      'Payee: ' + hexToB64u(p.payeeId),
      'Payer key: ' + hexToB64u(p.payerKey),
      'Counter: ' + String(p.counter),
      'Signature: ' + hexToB64u(p.signature)
    ];
    // Which request this pays (D123). NOT in the signed bytes: it only lets the receiver match the payment to its
    // request. The amount, currency and payee it moves are signed above.
    if (p.requestId) lines.push('Request: ' + p.requestId);
    if (p.referenceB64) lines.push('Reference: ' + p.referenceB64);
    if (p.att) lines.push('Attestation: ' + String(p.att));
    return lines.join('\n');
  }

  /**
   * The canonical multi-line form of a payload, whatever way it arrived: a one-line field strips the
   * line breaks ("...receiverScheme: 0x..."), and a copy can turn them into spaces. Values never
   * contain a colon, so every "Label:" is put back on a line of its own.
   */
  function normalize(text) {
    return String(text == null ? '' : text).replace(/\r\n?/g, '\n').trim().replace(LABEL_RE, '\n$1:');
  }

  /** Which offline payload this is, WITHOUT validating it: 'receiver', 'payment', 'legacy' or ''. */
  function kindOf(text) {
    var first = normalize(text).split('\n')[0].trim().toLowerCase();
    if (first === HEAD_RECEIVER.toLowerCase()) return 'receiver';
    if (first === HEAD_PAYMENT.toLowerCase()) return 'payment';
    if (first === HEAD_LEGACY_REQUEST.toLowerCase()) return 'legacy';
    return '';
  }

  function schemeByte(hexByte) {
    var v = parseInt(hexByte, 16);
    if (LEGACY_VERSIONS.indexOf(v) >= 0) throw InstantError('old-scheme');
    if (v !== VERSION) throw InstantError('version');
    return v;
  }

  /**
   * The currency a payload names. A missing token id or name is damage; a token id this app does not
   * offer is a refusal of its own; a name that is not the one this app gives that token id means
   * the text was changed, so it is refused as damaged (the token id is what the payer signed).
   */
  function checkCurrency(fields) {
    var id = tokenHex(fields['token id']);
    if (!id || !/^0x/i.test(String(fields['token id'] || '')) || !fields.asset) throw InstantError('malformed');
    var cur = currencyOf(id);
    if (!cur) throw InstantError('asset');
    if (String(fields.asset) !== cur.label) throw InstantError('malformed');
    return cur;
  }

  /**
   * Parse a receiver code or a payment. Returns null for text that is not an offline payload at all
   * (so a scanner can fall through to its other formats); throws an InstantError for a damaged one,
   * and 'old-scheme' for anything made by an earlier test scheme (0x02, 0x03).
   */
  function parse(text) {
    var norm = normalize(text);
    var kind = kindOf(norm);
    if (!kind) return null;
    if (kind === 'legacy') throw InstantError('old-scheme');
    var fields = {};
    norm.split('\n').slice(1).forEach(function (line) {
      var m = line.match(/^\s*([A-Za-z][A-Za-z ]*?)\s*:\s*(.*?)\s*$/);
      if (m) fields[m[1].toLowerCase()] = m[2];
    });
    var out = { type: kind, version: VERSION, att: fields.attestation ? String(fields.attestation) : null };
    if (kind === 'receiver') {
      var sm = String(fields.scheme || '').toLowerCase().match(/^0x535442([0-9a-f]{2})$/);
      if (!sm) throw InstantError('malformed');
      schemeByte(sm[1]);
      var rcur = checkCurrency(fields);
      var rid = b64uToHex(fields.payee, 32);
      var rkey = b64uToHex(fields['payee key'], 65);
      if (!rid || !rkey || rkey.slice(0, 2) !== '04') throw InstantError('malformed');
      out.tokenId = rcur.tokenId;
      out.currency = rcur;
      out.amount = null;
      if (fields.amount != null && fields.amount !== '') {
        try { out.amount = parseAmount(fields.amount); } catch (_) { throw InstantError('malformed'); }
      }
      out.payeeId = rid;
      out.payeeKey = rkey;
      out.address = null;
      if (fields.address != null && fields.address !== '') {
        if (!/^0x[0-9a-fA-F]{64}$/.test(String(fields.address))) throw InstantError('malformed');
        out.address = '0x' + String(fields.address).slice(2).toUpperCase();
      }
      out.link = null;
      if (fields.link != null && fields.link !== '') {
        if (!/^[0-9a-fA-F]{16}$/.test(String(fields.link))) throw InstantError('malformed');
        out.link = String(fields.link).toLowerCase();
      }
      // D123: a signed payment request. Its lines come together or not at all, and a name never travels unsigned:
      // a name nobody signed would be a name anybody could write.
      out.request = null;
      var hasRequest = ['request', 'expires', 'request signature'].some(function (k) { return fields[k] != null && fields[k] !== ''; });
      if (!hasRequest && ((fields.name != null && fields.name !== '') || (fields.reference != null && fields.reference !== ''))) throw InstantError('request-unsigned');
      if (hasRequest) {
        var rqId = String(fields.request || '').toLowerCase();
        var rqExp = String(fields.expires || '');
        var rqSig = b64uToHex(fields['request signature'], 64);
        if (!/^[0-9a-f]{32}$/.test(rqId) || !/^\d{1,16}$/.test(rqExp) || !rqSig) throw InstantError('malformed');
        var nameB64 = fields.name ? String(fields.name) : '';
        var refB64 = fields.reference ? String(fields.reference) : '';
        var name = nameB64 ? b64uToText(nameB64) : '';
        var reference = refB64 ? b64uToText(refB64) : '';
        if (name == null || reference == null || name.length > REQUEST_NAME_MAX || reference.length > REQUEST_REFERENCE_MAX) throw InstantError('malformed');
        out.request = { id: rqId, expiresAt: Number(rqExp), signature: rqSig, name: name, reference: reference,
          nameB64: nameB64, referenceB64: refB64 };
      }
      return out;
    }
    var id = String(fields['payment id'] || '').toLowerCase();
    var idm = id.match(/^0x535442([0-9a-f]{2})([0-9a-f]{32})$/);
    if (!idm) throw InstantError('malformed');
    schemeByte(idm[1]);
    var cur = checkCurrency(fields);
    var amount;
    try { amount = parseAmount(fields.amount); } catch (_) { throw InstantError('malformed'); }
    var payee = b64uToHex(fields.payee, 32);
    var pkey = b64uToHex(fields['payer key'], 65);
    var sig = b64uToHex(fields.signature, 64);
    var counter = Number(fields.counter);
    if (!payee || !pkey || pkey.slice(0, 2) !== '04' || !sig || !/^\d+$/.test(String(fields.counter || ''))
      || !Number.isSafeInteger(counter) || counter < 1) throw InstantError('malformed');
    out.paymentId = idm[2];
    out.tokenId = cur.tokenId;
    out.currency = cur;
    out.amount = amount;
    out.payeeId = payee;
    out.payerKey = pkey;
    out.signature = sig;
    out.counter = counter;
    // D123: the request it pays and its reference, unsigned (matching only); damaged values are dropped, never fatal.
    out.requestId = /^[0-9a-f]{32}$/i.test(String(fields.request || '')) ? String(fields.request).toLowerCase() : null;
    var payRef = fields.reference ? b64uToText(fields.reference) : null;
    out.reference = payRef && payRef.length <= REQUEST_REFERENCE_MAX ? payRef : null;
    return out;
  }

  /** The exact bytes the payer signs (see the header). */
  function paymentMessage(p) {
    var out = new Uint8Array(MESSAGE_BYTES);
    var o = 0;
    var token = tokenHex(p.tokenId);
    if (!token) throw InstantError('malformed');
    out.set(DOMAIN, o); o += 4;
    out[o++] = VERSION;
    out.set(fromHex(p.payerId), o); o += 32;
    out.set(fromHex(p.payerKey), o); o += 65;
    out.set(fromHex(p.payeeId), o); o += 32;
    out.set(fromHex(token), o); o += 32;
    writeU64(out, o, p.amount); o += 8;
    writeU64(out, o, p.counter); o += 8;
    out.set(fromHex(p.paymentId), o); o += 16;
    return out;
  }

  async function accountIdForKey(keyHex, subtle) {
    return toHex(await sha256(fromHex(keyHex), subtle));
  }

  async function verifyPayment(p, subtle) {
    try {
      var payerId = await accountIdForKey(p.payerKey, subtle);
      var key = await subtle.importKey('raw', fromHex(p.payerKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      var ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, fromHex(p.signature), paymentMessage({
        payerId: payerId, payerKey: p.payerKey, payeeId: p.payeeId, tokenId: p.tokenId, amount: p.amount, counter: p.counter, paymentId: p.paymentId
      }));
      return ok ? payerId : null;
    } catch (_) {
      return null;
    }
  }

  /* ---------- key store: WebCrypto, non-extractable private key persisted in the backend ---------- */
  function createWebCryptoKeyStore(backend, env) {
    var subtle = subtleOf(env);
    var cache = null;
    async function load() {
      if (cache) return cache;
      var rec = await backend.run('readonly', function (tx) { return tx.get('meta', 'signing'); });
      if (rec) cache = rec;
      return cache;
    }
    return {
      kind: 'webcrypto',
      create: async function () {
        var existing = await load();
        if (existing) return fromHex(existing.publicRaw);
        if (!subtle) throw InstantError('unavailable');
        var pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
        var raw = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
        var rec = { k: 'signing', kind: 'webcrypto', privateKey: pair.privateKey, publicKey: pair.publicKey,
          publicRaw: toHex(raw), createdAt: Date.now() };
        var stored = await backend.run('readwrite', async function (tx) {
          var cur = await tx.get('meta', 'signing');
          if (cur) return cur;           // another tab won the race: keep ITS key
          tx.put('meta', rec);
          return rec;
        });
        cache = stored;
        return fromHex(stored.publicRaw);
      },
      publicKey: async function () {
        var r = await load();
        return r ? fromHex(r.publicRaw) : null;
      },
      sign: async function (bytes) {
        var r = await load();
        if (!r) throw InstantError('no-key');
        return new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, r.privateKey, bytes));
      }
    };
  }

  /* ---------- storage backends ----------
   * backend.run(mode, fn): fn(tx) may only await tx.get/tx.getAll (never crypto or network), so the
   * whole body is ONE transaction. It commits durably before run() resolves; a throw rolls back.
   * (The step 1 database also holds a "requests" store; schemes 0x03 and 0x04 have no requests and
   * never open it, so an existing database needs no upgrade.) */
  var STORES = ['meta', 'outgoing', 'seen', 'journal'];
  var KEY_PATHS = { meta: 'k', requests: 'nonce', outgoing: 'ref', seen: 'key', journal: 'id' };

  function createIndexedDbBackend(env) {
    var idb = (env && env.indexedDB) || G.indexedDB;
    var name = (env && env.dbName) || DB_NAME;
    var dbPromise = null;
    function open() {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise(function (resolve, reject) {
        if (!idb || typeof idb.open !== 'function') { reject(InstantError('unavailable')); return; }
        var req;
        try { req = idb.open(name, 1); } catch (e) { reject(InstantError('unavailable')); return; }
        req.onupgradeneeded = function () {
          var db = req.result;
          STORES.concat(['requests']).forEach(function (s) {
            if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: KEY_PATHS[s] });
          });
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(InstantError('unavailable')); };
        req.onblocked = function () { reject(InstantError('unavailable')); };
      });
      dbPromise.catch(function () { dbPromise = null; });
      return dbPromise;
    }
    function wrap(request) {
      return new Promise(function (resolve, reject) {
        request.onsuccess = function () { resolve(request.result); };
        request.onerror = function () { reject(request.error); };
      });
    }
    return {
      kind: 'indexeddb',
      open: open,
      run: async function (mode, fn) {
        var db = await open();
        var t;
        try {
          t = mode === 'readwrite' ? db.transaction(STORES, 'readwrite', { durability: 'strict' }) : db.transaction(STORES, 'readonly');
        } catch (_) {
          t = db.transaction(STORES, mode === 'readwrite' ? 'readwrite' : 'readonly');
        }
        var done = new Promise(function (resolve, reject) {
          t.oncomplete = function () { resolve(); };
          t.onabort = function () { reject(t.error || InstantError('busy')); };
          t.onerror = function () { /* onabort follows */ };
        });
        var tx = {
          get: function (store, key) { return wrap(t.objectStore(store).get(key)).then(function (v) { return v === undefined ? null : v; }); },
          getAll: function (store) { return wrap(t.objectStore(store).getAll()); },
          put: function (store, value) { t.objectStore(store).put(value); }
        };
        var result;
        try {
          result = await fn(tx);
        } catch (e) {
          try { t.abort(); } catch (_) { /* already finished */ }
          await done.catch(function () {});
          throw e;
        }
        await done;
        return result;
      }
    };
  }

  /** In-memory backend with the same all-or-nothing transaction semantics (Node unit tests). */
  function createMemoryBackend() {
    var data = {};
    STORES.forEach(function (s) { data[s] = new Map(); });
    var queue = Promise.resolve();
    function copy(v) { return v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v; }
    function copyKeep(v) {
      // The signing record holds CryptoKey objects, which a JSON copy would destroy.
      if (v && typeof v === 'object' && v.k === 'signing') return Object.assign({}, v);
      return copy(v);
    }
    return {
      kind: 'memory',
      data: data,
      run: function (mode, fn) {
        var job = queue.then(async function () {
          var staged = [];
          var tx = {
            get: async function (store, key) {
              for (var i = staged.length - 1; i >= 0; i--) {
                if (staged[i].store === store && staged[i].value[KEY_PATHS[store]] === key) return copyKeep(staged[i].value);
              }
              return data[store].has(key) ? copyKeep(data[store].get(key)) : null;
            },
            getAll: async function (store) {
              var m = new Map(data[store]);
              staged.forEach(function (w) { if (w.store === store) m.set(w.value[KEY_PATHS[store]], w.value); });
              return Array.from(m.values()).map(copyKeep);
            },
            put: function (store, value) {
              if (mode !== 'readwrite') throw new Error('readonly transaction');
              staged.push({ store: store, value: copyKeep(value) });
            }
          };
          var result = await fn(tx);           // a throw discards `staged`: nothing was written
          staged.forEach(function (w) { data[w.store].set(w.value[KEY_PATHS[w.store]], w.value); });
          return result;
        });
        queue = job.catch(function () {});
        return job;
      }
    };
  }

  /* ---------- the account ---------- */
  function createAccount(opts) {
    var backend = opts.backend;
    var keys = opts.keyStore;
    var env = opts.env || null;
    var subtle = subtleOf(env);
    var now = opts.now || function () { return Date.now(); };
    var legacyToken = tokenHex(opts.legacyTokenId);
    var identity = null;

    function blankAccount(idHex) { return { k: 'account', id: idHex, balances: {}, counter: 0, createdAt: now() }; }

    /**
     * The balances of a stored account record, per token id (hex, no 0x), as BigInt. A record kept by
     * build 99 has ONE figure ("balance") and no currency: it is read as the legacy currency (Winiwa).
     */
    function balancesOf(acct) {
      var out = {};
      if (!acct) return out;
      var b = acct.balances || {};
      Object.keys(b).forEach(function (t) { out[t] = BigInt(b[t]); });
      if (acct.balance != null && legacyToken) out[legacyToken] = (out[legacyToken] || BigInt(0)) + BigInt(acct.balance);
      return out;
    }
    /** Write one currency's figure back, folding a build 99 figure in the first time the record is written. */
    function setBalance(acct, token, value) {
      var all = balancesOf(acct);
      all[token] = value;
      acct.balances = {};
      Object.keys(all).forEach(function (t) { acct.balances[t] = all[t].toString(); });
      if (legacyToken) delete acct.balance;
    }
    function balanceIn(acct, token) { return balancesOf(acct)[token] || BigInt(0); }

    async function readIdentity() {
      if (identity) return identity;
      var key = await keys.publicKey();
      if (!key) return null;
      var keyHex = toHex(key);
      identity = { key: keyHex, id: await accountIdForKey(keyHex, subtle) };
      return identity;
    }

    /** Created on first use: the key pair, then the account record. Idempotent. */
    async function ensure() {
      if (!subtle) throw InstantError('unavailable');
      var me = await readIdentity();
      if (!me) {
        await keys.create();
        me = await readIdentity();
      }
      await backend.run('readwrite', async function (tx) {
        var acct = await tx.get('meta', 'account');
        if (!acct) tx.put('meta', blankAccount(me.id));
      });
      return me;
    }

    /**
     * {exists, id, counter, balances}: balances maps EVERY offered currency's token id to its figure
     * (a currency never received reads 0, which is proven: the account record is the whole truth).
     */
    async function state() {
      var me = await readIdentity();
      var acct = await backend.run('readonly', function (tx) { return tx.get('meta', 'account'); });
      var held = balancesOf(acct);
      var balances = {};
      CURRENCIES.forEach(function (c) { balances[c.tokenId] = BigInt(0); });
      Object.keys(held).forEach(function (t) { balances[t] = held[t]; });
      return {
        exists: !!(me && acct),
        id: me ? me.id : null,
        balances: balances,
        counter: acct ? acct.counter : 0
      };
    }

    function journalEntry(kind, amount, extra) {
      var e = { kind: kind, amount: amount.toString(), ts: now() };
      Object.keys(extra || {}).forEach(function (k) { e[k] = extra[k]; });
      return e;
    }

    /* ---------- loads and offloads (build 103, step 2): the balance moves to and from Savings ----------
     * The chain side (instant-chain.js) builds, signs and follows the transactions; this is where the
     * balance they move is kept, in the same durable store as the payments. Journal entries:
     *   load    INSTANT-5-LOAD-<load id>     status building | posted | credited | failed
     *   offload INSTANT-5-OFFLOAD-<wid>      status committed | preparing | merging | building | posted
     *                                        | received | restored
     * Only creditLoad adds to a balance, only beginOffload takes from one, and only restoreOffload
     * gives an offload back; every other change is a record of where the transaction got to. */
    var LOAD_OPEN = ['building', 'posted'];
    var OFFLOAD_UNPOSTED = ['committed', 'preparing', 'merging', 'building'];
    var RECORD_FIELDS = ['status', 'stage', 'note', 'coinid', 'txnid', 'txpowid', 'block', 'depth', 'inputs', 'regCoinid',
      'regTxnid', 'regToken', 'payoutCoinid', 'regNextCoinid', 'mergeCoinid', 'mergeTxnid', 'postedAt', 'attempt', 'settled',
      'awaitingApproval', 'steps', 'proof', 'receivedAt', 'everPosted', 'label',
      'payout', 'from', 'mergeRound'];   // 0.0.12.044: the Savings address a move was picked for (D103)
    function hexId(value, bytes) {
      var h = String(value == null ? '' : value).trim().toLowerCase().replace(/^0x/, '');
      return new RegExp('^[0-9a-f]{' + (bytes * 2) + '}$').test(h) ? h : null;
    }
    function loadEntryId(lid) { return ROW + 'LOAD-' + lid; }
    function offloadEntryId(wid) { return ROW + 'OFFLOAD-' + wid; }
    function patchRecord(entry, patch) {
      Object.keys(patch || {}).forEach(function (k) {
        if (RECORD_FIELDS.indexOf(k) >= 0) entry[k] = patch[k];
      });
      entry.updatedAt = now();
      return entry;
    }
    function positiveAtoms(value) {
      var a;
      try { a = BigInt(value); } catch (_) { throw InstantError('amount-invalid'); }
      if (a <= BigInt(0) || a > MAX_ATOMS) throw InstantError('amount-invalid');
      return a;
    }

    /**
     * The app's own record of a load it is building (the fast path of design section 3.2). No
     * balance changes here: a load is credited only by creditLoad, once its coin is 3 blocks deep.
     *   rec {lid (16 bytes hex), amount (atoms), tokenId}
     */
    async function recordLoad(rec) {
      var lid = hexId(rec && rec.lid, 16);
      if (!lid) throw InstantError('malformed');
      var amount = positiveAtoms(rec.amount);
      var cur = requireCurrency(rec.tokenId);
      await ensure();
      return backend.run('readwrite', async function (tx) {
        var existing = await tx.get('journal', loadEntryId(lid));
        if (existing) return existing;
        var entry = journalEntry('load', amount, { id: loadEntryId(lid), lid: lid, tokenId: cur.tokenId, status: 'building' });
        tx.put('journal', entry);
        return entry;
      });
    }

    /** Where a load got to. It never credits, and a credited load is not changed any more. */
    async function updateLoad(lid, patch) {
      var id = loadEntryId(hexId(lid, 16) || '');
      return backend.run('readwrite', async function (tx) {
        var entry = await tx.get('journal', id);
        if (!entry || entry.kind !== 'load') throw InstantError('unknown');
        if (entry.status === 'credited') return entry;
        if (patch && patch.status === 'credited') throw InstantError('malformed');   // only creditLoad credits
        patchRecord(entry, patch);
        if (patch && patch.coinid) entry.coinid = hexId(patch.coinid, 32) || entry.coinid;
        tx.put('journal', entry);
        return entry;
      });
    }

    /**
     * Credit a load coin, ONCE PER COIN ID (design section 3.2): the credit and the seen key
     * load:<coinid> are written in one durable transaction, so whichever path finds the load first
     * (the app's own record, or a scan of the vault for coins naming this account) credits it and
     * every later one gets 'duplicate'. The amount and currency are the coin's own, as the chain has
     * them. A load this app recorded is updated in place (one row per load, law 2); one it did not
     * (made elsewhere for this account) gets an entry of its own.
     *   c {coinid, amount (atoms), tokenId, lid (optional), block, source}
     * Returns {status: 'credited' | 'duplicate', entry}.
     */
    async function creditLoad(c) {
      var coinid = hexId(c && c.coinid, 32);
      if (!coinid) throw InstantError('malformed');
      var amount = positiveAtoms(c.amount);
      var cur = requireCurrency(c.tokenId);
      var lid = hexId(c.lid, 16);
      await ensure();
      var seenKey = 'load:' + coinid;
      return backend.run('readwrite', async function (tx) {
        var entry = lid ? await tx.get('journal', loadEntryId(lid)) : null;
        if (!entry) {
          var all = await tx.getAll('journal');
          for (var i = 0; i < all.length; i++) if (all[i].kind === 'load' && all[i].coinid === coinid) { entry = all[i]; break; }
        }
        if (await tx.get('seen', seenKey)) return { status: 'duplicate', entry: entry };
        var acct = await tx.get('meta', 'account');
        var next = balanceIn(acct, cur.tokenId) + amount;
        if (next > MAX_ATOMS) throw InstantError('amount-invalid');
        setBalance(acct, cur.tokenId, next);
        var ts = now();
        if (!entry) entry = journalEntry('load', amount, { id: loadEntryId(coinid.slice(0, 32)), lid: coinid.slice(0, 32), source: String(c.source || 'scan') });
        if (entry.amount !== amount.toString()) entry.recordedAmount = entry.amount;   // the chain's figure is the one credited
        entry.amount = amount.toString();
        entry.tokenId = cur.tokenId;
        entry.coinid = coinid;
        entry.status = 'credited';
        entry.creditedAt = ts;
        if (c.block != null) entry.block = Number(c.block) || entry.block;
        entry.updatedAt = ts;
        tx.put('meta', acct);
        tx.put('seen', { key: seenKey, coinid: coinid, amount: amount.toString(), tokenId: cur.tokenId, ts: ts });
        tx.put('journal', entry);
        return { status: 'credited', entry: entry };
      });
    }

    /**
     * Move to Savings, step one: DEBIT FIRST (design section 4.1), in one durable transaction keyed
     * by the withdrawal id, before anything is built. The same id again returns the stored entry and
     * never debits twice; the same id for another amount or currency is refused. A balance that
     * cannot cover the amount is refused before any debit ('insufficient', as pay() refuses).
     *   o {wid (16 bytes hex), amount (atoms), tokenId}
     * Returns {status: 'debited' | 'existing', entry}.
     */
    async function beginOffload(o) {
      var wid = hexId(o && o.wid, 16);
      if (!wid) throw InstantError('malformed');
      var amount = positiveAtoms(o.amount);
      var cur = requireCurrency(o.tokenId);
      await ensure();
      return backend.run('readwrite', async function (tx) {
        var existing = await tx.get('journal', offloadEntryId(wid));
        if (existing) {
          if (existing.amount !== amount.toString() || existing.tokenId !== cur.tokenId) throw InstantError('busy');
          return { status: 'existing', entry: existing };
        }
        var acct = await tx.get('meta', 'account');
        var bal = balanceIn(acct, cur.tokenId);
        if (bal < amount) throw insufficient(bal, amount, cur.tokenId);
        setBalance(acct, cur.tokenId, bal - amount);
        var entry = journalEntry('offload', amount, { id: offloadEntryId(wid), wid: wid, tokenId: cur.tokenId, status: 'committed', attempt: 1 });
        tx.put('meta', acct);
        tx.put('journal', entry);
        return { status: 'debited', entry: entry };
      });
    }

    /** Where a move to Savings got to. Never a balance change, and never back to "restored". */
    /**
     * The TxPoW id of an Add or a Remove, once found (build 0.0.12.056; founder 2026-10-05: "link to the explorer will be
     * added at a later stage, please add them now"). A move found by its coin at depth has its block but not its TxPoW
     * id, and a credited or received record refuses every other patch; this sets that one field, once, in any state.
     */
    async function noteTxpowid(kind, key, txpowid) {
      var t = String(txpowid || '');
      if (!/^0x[0-9a-fA-F]{64}$/.test(t)) throw InstantError('malformed');
      var id = kind === 'load' ? loadEntryId(hexId(key, 16) || '') : offloadEntryId(hexId(key, 16) || '');
      return backend.run('readwrite', async function (tx) {
        var entry = await tx.get('journal', id);
        if (!entry || entry.kind !== kind) throw InstantError('unknown');
        if (entry.txpowid) return entry;
        entry.txpowid = t;
        tx.put('journal', entry);
        return entry;
      });
    }

    async function updateOffload(wid, patch) {
      var id = offloadEntryId(hexId(wid, 16) || '');
      return backend.run('readwrite', async function (tx) {
        var entry = await tx.get('journal', id);
        if (!entry || entry.kind !== 'offload') throw InstantError('unknown');
        if (entry.status === 'restored') return entry;
        if (patch && patch.status === 'restored') throw InstantError('malformed');   // only restoreOffload restores
        patchRecord(entry, patch);
        tx.put('journal', entry);
        return entry;
      });
    }

    /**
     * Give an offload back, ONLY while the app can prove nothing was posted (design section 4.1: the
     * build failed before txnpost, or the node refused the post, or the person refused the approval).
     * Idempotent: a restored entry stays restored and is credited once. A posted withdrawal is never
     * restored ('posted'): it is followed on the chain, or rebuilt under the same id.
     */
    async function restoreOffload(wid, note) {
      var id = offloadEntryId(hexId(wid, 16) || '');
      return backend.run('readwrite', async function (tx) {
        var entry = await tx.get('journal', id);
        if (!entry || entry.kind !== 'offload') throw InstantError('unknown');
        if (entry.status === 'restored') return { status: 'existing', entry: entry };
        if (OFFLOAD_UNPOSTED.indexOf(entry.status) < 0) throw InstantError('posted');
        var acct = await tx.get('meta', 'account');
        var next = balanceIn(acct, entry.tokenId) + BigInt(entry.amount);
        if (next > MAX_ATOMS) throw InstantError('amount-invalid');
        setBalance(acct, entry.tokenId, next);
        entry.status = 'restored';
        entry.restoredAt = now();
        entry.updatedAt = entry.restoredAt;
        if (note) entry.note = String(note);
        tx.put('meta', acct);
        tx.put('journal', entry);
        return { status: 'restored', entry: entry };
      });
    }

    /** The journal entries of one kind ('load' | 'offload'), oldest first. */
    async function entries(kind) {
      var all = await journal();
      return all.filter(function (e) { return !kind || e.kind === kind; });
    }
    /** The loads not yet credited or failed: the "+X" beside the Instant figure (law 19). */
    async function openLoads() {
      return (await entries('load')).filter(function (e) { return LOAD_OPEN.indexOf(e.status) >= 0; });
    }

    /**
     * The account's on-chain identity (design section 4.4 and 5): {withdrawKey, payout,
     * registrations: {<token hex>: {coinid, status, txnid, regToken}}}. The withdrawal key is a
     * PUBLIC key; its private half lives in the node's wallet and signs only withdrawals.
     */
    async function chainInfo() {
      var rec = await backend.run('readonly', function (tx) { return tx.get('meta', 'chain'); });
      return rec || { k: 'chain', withdrawKey: '', payout: '', registrations: {} };
    }
    /** Merge into it: top-level fields replace, registrations merge per currency (null removes one). */
    async function setChainInfo(patch) {
      return backend.run('readwrite', async function (tx) {
        var rec = (await tx.get('meta', 'chain')) || { k: 'chain', withdrawKey: '', payout: '', registrations: {} };
        Object.keys(patch || {}).forEach(function (k) {
          if (k === 'registrations') {
            rec.registrations = rec.registrations || {};
            Object.keys(patch.registrations || {}).forEach(function (t) {
              if (patch.registrations[t] === null) delete rec.registrations[t];
              else rec.registrations[t] = Object.assign({}, rec.registrations[t] || {}, patch.registrations[t]);
            });
          } else if (k !== 'k') {
            rec[k] = patch[k];
          }
        });
        rec.updatedAt = now();
        tx.put('meta', rec);
        return rec;
      });
    }

    /**
     * This account's receiver code, shown straight away (law 22), in the currency asked for and with
     * an optional amount (law 23, the Savings Receive's "Amount (optional)"). The key pair is created
     * on first use, so showing the code is what brings the account into being.
     *   opts.tokenId  the currency asked for (default: the first offered currency)
     *   opts.amount   atoms, or null for no amount
     */
    async function receiverCode(extra) {
      var me = await ensure();
      var token = tokenHex(extra && extra.tokenId) || (CURRENCIES[0] && CURRENCIES[0].tokenId);
      var cur = requireCurrency(token);
      var amount = null;
      if (extra && extra.amount != null) {
        amount = BigInt(extra.amount);
        if (amount <= BigInt(0) || amount > MAX_ATOMS) throw InstantError('amount-invalid');
      }
      var address = (extra && extra.address) ? '0x' + String(extra.address).slice(2).toUpperCase() : null;
      // D123: a payment request to share (paying at a distance): named, referenced, one-time and dated, and signed
      // with this card's own key so the payer's phone can tell it was not changed on the way.
      var request = null;
      if (extra && extra.request) {
        var name = String(extra.request.name || '').trim().slice(0, REQUEST_NAME_MAX);
        var reference = String(extra.request.reference || '').trim().slice(0, REQUEST_REFERENCE_MAX);
        var ttl = Number(extra.request.ttlMs) > 0 ? Number(extra.request.ttlMs) : 24 * 60 * 60 * 1000;
        request = { id: newPaymentId(env), expiresAt: now() + ttl, nameB64: textToB64u(name), referenceB64: textToB64u(reference),
          name: name, reference: reference };
        request.signature = toHex(await keys.sign(requestMessage({ payeeId: me.id, tokenId: cur.tokenId, amount: amount,
          address: address, nameB64: request.nameB64, referenceB64: request.referenceB64, requestId: request.id, expiresAt: request.expiresAt })));
      }
      return { id: me.id, tokenId: cur.tokenId, amount: amount, address: address, request: request,
        text: encodeReceiver({ tokenId: cur.tokenId, amount: amount, payeeId: me.id, payeeKey: me.key, address: address, link: extra && extra.link, request: request, att: extra && extra.att }) };
    }

    /**
     * Check a receiver code for paying it, with NO debit and no signature: the payer's "is this code
     * payable by me" step, run when the code is scanned. Returns the parsed code.
     */
    async function checkReceiver(codeText) {
      if (!subtle) throw InstantError('unavailable');
      var code = typeof codeText === 'string' ? parse(codeText) : codeText;
      if (!code || code.type !== 'receiver') throw InstantError('malformed');
      if ((await accountIdForKey(code.payeeKey, subtle)) !== code.payeeId) throw InstantError('bad-code');
      var me = await readIdentity();
      if (me && code.payeeId === me.id) throw InstantError('self');
      // D123: a signed request must still be exactly what its payee signed, still current, and not paid before.
      if (code.request) {
        if (!(await verifyRequest(code, subtle))) throw InstantError('request-altered');
        if (now() > code.request.expiresAt) throw InstantError('request-expired');
        var paid = await backend.run('readonly', function (tx) { return tx.get('meta', 'request:' + code.request.id); });
        if (paid) { var pe = InstantError('request-paid'); pe.paidAt = paid.ts; throw pe; }
      }
      return code;
    }

    /**
     * What this card knows of a payee (D123): whether it paid that key before (and under which name), and whether
     * ANOTHER key was paid under the same name, which is how a swapped code shows itself. Read-only.
     *   {known, count, lastPaid, name, clash: null | {name, count, lastPaid}}
     */
    async function payeeInfo(code) {
      var all = await backend.run('readonly', function (tx) { return tx.getAll('meta'); });
      var mine = null, clash = null;
      var name = code && code.request ? String(code.request.name || '').trim().toLowerCase() : '';
      all.forEach(function (r) {
        if (!r || typeof r.k !== 'string' || r.k.indexOf('payee:') !== 0) return;
        if (r.payeeId === code.payeeId) mine = r;
        else if (name && String(r.name || '').trim().toLowerCase() === name && (!clash || r.lastPaid > clash.lastPaid)) clash = r;
      });
      return { known: !!mine, count: mine ? mine.count : 0, lastPaid: mine ? mine.lastPaid : null, name: mine ? (mine.name || '') : '',
        clash: clash ? { name: clash.name, count: clash.count, lastPaid: clash.lastPaid } : null };
    }

    function insufficient(balance, amount, token) {
      var err = InstantError('insufficient');
      err.balance = balance;
      err.amount = amount;
      err.tokenId = token;
      return err;
    }

    /**
     * Pay a receiver code. Returns {status:'paid'|'existing', payment, entry}. Refusals throw BEFORE
     * any debit. The commit (debit of the chosen currency, counter, stored signed payment) happens in
     * one durable transaction and only its result is ever returned, so nothing is emitted before the
     * commit.
     *   payOpts.tokenId    the currency paid (default: the one the code asks for)
     *   payOpts.paymentId  the confirmation's own id. A second commit with it returns the stored
     *                      payment (a double press cannot debit twice); a fresh id when none is given.
     */
    async function pay(codeText, amountAtoms, payOpts) {
      if (!subtle) throw InstantError('unavailable');
      var amount;
      try { amount = BigInt(amountAtoms); } catch (_) { throw InstantError('amount-invalid'); }
      if (amount <= BigInt(0) || amount > MAX_ATOMS) throw InstantError('amount-invalid');
      var code = await checkReceiver(codeText);
      var cur = requireCurrency((payOpts && payOpts.tokenId) || code.tokenId);
      var token = cur.tokenId;
      var paymentId = payOpts && payOpts.paymentId ? String(payOpts.paymentId).toLowerCase() : newPaymentId(env);
      if (!/^[0-9a-f]{32}$/.test(paymentId)) throw InstantError('malformed');
      var me = await ensure();
      if (code.payeeId === me.id) throw InstantError('self');
      var ref = paymentId;
      function sameIntent(stored) {
        return stored.payeeId === code.payeeId && String(stored.amount) === amount.toString() && stored.tokenId === token;
      }

      for (var attempt = 0; attempt < 4; attempt++) {
        var snap = await backend.run('readonly', async function (tx) {
          return { acct: await tx.get('meta', 'account'), out: await tx.get('outgoing', ref) };
        });
        if (snap.out) {
          if (!sameIntent(snap.out)) throw InstantError('busy');
          return { status: 'existing', payment: snap.out, entry: null };
        }
        var balance = balanceIn(snap.acct, token);
        if (balance < amount) throw insufficient(balance, amount, token);
        var counter = snap.acct.counter + 1;
        var message = paymentMessage({ payerId: me.id, payerKey: me.key, payeeId: code.payeeId, tokenId: token,
          amount: amount, counter: counter, paymentId: paymentId });
        var signature = toHex(await keys.sign(message));   // outside any transaction; not emitted yet
        var rq = code.request || null;
        var text = encodePayment({ paymentId: paymentId, tokenId: token, amount: amount, payeeId: code.payeeId,
          payerKey: me.key, counter: counter, signature: signature,
          requestId: rq ? rq.id : null, referenceB64: rq ? rq.referenceB64 : null });
        var expectCounter = snap.acct.counter;
        var result = await backend.run('readwrite', async function (tx) {
          var acct = await tx.get('meta', 'account');
          var existing = await tx.get('outgoing', ref);
          if (existing) {
            if (!sameIntent(existing)) throw InstantError('busy');
            return { status: 'existing', payment: existing, entry: null };
          }
          if (acct.counter !== expectCounter) return { retry: true };
          // D123: a request is paid once, checked again inside the same transaction that debits.
          if (rq && (await tx.get('meta', 'request:' + rq.id))) throw InstantError('request-paid');
          var bal = balanceIn(acct, token);
          if (bal < amount) throw insufficient(bal, amount, token);
          setBalance(acct, token, bal - amount);
          acct.counter = counter;
          var ts = now();
          var payment = { ref: ref, paymentId: paymentId, counter: counter, amount: amount.toString(), tokenId: token,
            payeeId: code.payeeId, text: text, ts: ts };
          var entryExtra = { id: ROW + 'OUT-' + counter, counter: counter, paymentId: paymentId, peer: code.payeeId, ref: ref, tokenId: token };
          if (rq) {
            payment.requestId = rq.id; payment.payeeName = rq.name || ''; payment.reference = rq.reference || '';
            entryExtra.requestId = rq.id; entryExtra.peerName = rq.name || ''; entryExtra.reference = rq.reference || '';
            tx.put('meta', { k: 'request:' + rq.id, ref: ref, payeeId: code.payeeId, ts: ts });
          }
          var entry = journalEntry('out', amount, entryExtra);
          entry.ts = ts;
          // D123: remember this payee's key (and the name its signed request gave), so the next code can be checked.
          var known = await tx.get('meta', 'payee:' + code.payeeId);
          tx.put('meta', { k: 'payee:' + code.payeeId, payeeId: code.payeeId,
            name: (rq && rq.name) ? rq.name : (known ? known.name || '' : ''),
            count: (known ? known.count : 0) + 1, firstPaid: known ? known.firstPaid : ts, lastPaid: ts });
          tx.put('meta', acct);
          tx.put('outgoing', payment);
          tx.put('journal', entry);
          return { status: 'paid', payment: payment, entry: entry };
        });
        if (!result.retry) return result;
      }
      throw InstantError('busy');
    }

    /**
     * Receive a payment (from ANY delivery channel: a scan, pasted text, or later Bluetooth or NFC).
     * Returns {status:'credited', entry}; every refusal throws, uncredited.
     */
    async function receive(paymentText, info) {
      if (!subtle) throw InstantError('unavailable');
      var via = String((info && info.via) || '');            // app state: the channel it came by (build 107)
      var p = typeof paymentText === 'string' ? parse(paymentText) : paymentText;
      if (!p || p.type !== 'payment') throw InstantError('malformed');
      var token = requireCurrency(p.tokenId).tokenId;
      var me = await readIdentity();
      if (!me || p.payeeId !== me.id) throw InstantError('wrong-receiver');
      var payerId = await verifyPayment(p, subtle);
      if (!payerId) throw InstantError('bad-signature');
      if (payerId === me.id) throw InstantError('self');
      var seenKey = payerId + ':' + p.counter;
      return backend.run('readwrite', async function (tx) {
        if (await tx.get('seen', seenKey)) throw InstantError('duplicate');
        var acct = await tx.get('meta', 'account');
        var next = balanceIn(acct, token) + p.amount;
        if (next > MAX_ATOMS) throw InstantError('amount-invalid');
        setBalance(acct, token, next);
        var inExtra = { id: ROW + 'IN-' + payerId + '-' + p.counter, counter: p.counter,
          paymentId: p.paymentId, peer: payerId, tokenId: token, via: via };
        // D123: the request it says it pays, and its reference, for the receiver's row (unsigned: matching only).
        if (p.requestId) inExtra.requestId = p.requestId;
        if (p.reference) inExtra.reference = p.reference;
        var entry = journalEntry('in', p.amount, inExtra);
        tx.put('meta', acct);
        tx.put('seen', { key: seenKey, paymentId: p.paymentId, amount: p.amount.toString(), tokenId: token, ts: entry.ts });
        tx.put('journal', entry);
        return { status: 'credited', entry: entry };
      });
    }

    async function journal() {
      var all = await backend.run('readonly', function (tx) { return tx.getAll('journal'); });
      return all.sort(function (a, b) { return a.ts - b.ts; });
    }

    async function outgoing(ref) {
      return backend.run('readonly', function (tx) { return tx.get('outgoing', ref); });
    }

    /**
     * Record that the receiver's phone confirmed it holds this payment (build 101: delivery by NFC,
     * where the receiver answers "credited", or "duplicate" for one it already credited). The payer's
     * "Paid offline" row then reads "Received". App state, NOT protocol: no balance, counter, signature
     * or payment text changes, and nothing is sent anywhere. Written once; a second confirmation keeps
     * the first. Returns the payment's journal entry (carrying `delivered`), or null for an unknown ref.
     */
    async function markDelivered(ref, info) {
      var key = String(ref || '');
      if (!key) return null;
      return backend.run('readwrite', async function (tx) {
        var out = await tx.get('outgoing', key);
        if (!out) return null;
        var entry = await tx.get('journal', ROW + 'OUT-' + out.counter);
        if (entry && entry.ref !== key) entry = null;
        if (out.delivered) return entry;
        var d = { ts: now(), via: String((info && info.via) || ''), result: String((info && info.result) || '') };
        out.delivered = d;
        tx.put('outgoing', out);
        if (entry) { entry.delivered = d; tx.put('journal', entry); }
        return entry;
      });
    }

    /**
     * The network carrier of a stored payment (build 0.0.12.021, D087): {coinid, txnid, to, at, inputs,
     * dustToken}, merged into what was recorded, on the outgoing record and its journal entry. The payment
     * itself never changes: a re-sent carrier carries the SAME stored text.
     */
    async function setCarrier(ref, patch) {
      var key = String(ref || '');
      if (!key) return null;
      return backend.run('readwrite', async function (tx) {
        var out = await tx.get('outgoing', key);
        if (!out) return null;
        var entry = await tx.get('journal', ROW + 'OUT-' + out.counter);
        if (entry && entry.ref !== key) entry = null;
        var c = {};
        Object.keys(out.carrier || {}).forEach(function (k) { c[k] = out.carrier[k]; });
        Object.keys(patch || {}).forEach(function (k) { c[k] = patch[k]; });
        out.carrier = c;
        tx.put('outgoing', out);
        if (entry) { entry.carrier = c; tx.put('journal', entry); }
        return entry;
      });
    }

    /**
     * The on-chain record of a payment that arrived over the network (build 0.0.12.029; founder 2026-10-04: "the receiving
     * from instant transaction is shown received but no link to onchain transaction in the explorer, if the link is not
     * available, the transaction should not be presented as finished"). Attached to the receiver's journal entry for that
     * payment (found from the payment text: payer id + counter), once; later patches (its block) merge in. App state only:
     * no balance or counter changes. Returns the entry, or null when this account holds no such payment.
     */
    async function attachChain(paymentText, patch) {
      var p = typeof paymentText === 'string' ? parse(paymentText) : paymentText;
      if (!p || p.type !== 'payment' || !subtle) return null;
      var payerId = await accountIdForKey(p.payerKey, subtle);
      var id = ROW + 'IN-' + payerId + '-' + p.counter;
      return updateChain(id, patch);
    }
    async function updateChain(id, patch) {
      return backend.run('readwrite', async function (tx) {
        var entry = await tx.get('journal', String(id || ''));
        if (!entry || entry.kind !== 'in') return null;
        var c = {};
        Object.keys(entry.chain || {}).forEach(function (k) { c[k] = entry.chain[k]; });
        Object.keys(patch || {}).forEach(function (k) { if (patch[k] != null && patch[k] !== '') c[k] = patch[k]; });
        if (!c.at) c.at = now();
        entry.chain = c;
        tx.put('journal', entry);
        return entry;
      });
    }

    return { ensure: ensure, state: state, receiverCode: receiverCode, attachChain: attachChain, updateChain: updateChain,
      checkReceiver: checkReceiver, payeeInfo: payeeInfo, pay: pay, receive: receive, journal: journal, outgoing: outgoing,
      markDelivered: markDelivered, setCarrier: setCarrier,
      recordLoad: recordLoad, updateLoad: updateLoad, creditLoad: creditLoad, openLoads: openLoads,
      beginOffload: beginOffload, updateOffload: updateOffload, restoreOffload: restoreOffload, noteTxpowid: noteTxpowid,
      entries: entries, chainInfo: chainInfo, setChainInfo: setChainInfo };
  }

  /**
   * The retired test-credit account (build 103): its figure per currency, read-only. Nothing is ever
   * written to its store, and a device that never had one does not get an empty one created by the
   * look: the open is aborted in onupgradeneeded (a store that did not exist has oldVersion 0). A
   * build 99 record (one figure, no currency) reads as the legacy currency, as it always did.
   * Resolves {balances: {<token hex>: BigInt}, counter, id} or null (no retired account).
   */
  function readRetired(env, legacyTokenId) {
    var idb = (env && env.indexedDB) || G.indexedDB;
    var name = (env && env.dbName) || RETIRED_DB_NAME;
    var legacy = tokenHex(legacyTokenId);
    return new Promise(function (resolve) {
      if (!idb || typeof idb.open !== 'function') { resolve(null); return; }
      var req, created = false;
      try { req = idb.open(name); } catch (_) { resolve(null); return; }
      req.onupgradeneeded = function (ev) {
        if (!ev || !ev.oldVersion) { created = true; try { req.transaction.abort(); } catch (_) { /* resolves below */ } }
      };
      req.onerror = function () { resolve(null); };
      req.onblocked = function () { resolve(null); };
      req.onsuccess = function () {
        var db = req.result;
        if (created || !db.objectStoreNames.contains('meta')) { try { db.close(); } catch (_) { /* ignore */ } resolve(null); return; }
        var t;
        try { t = db.transaction(['meta'], 'readonly'); } catch (_) { try { db.close(); } catch (e2) { /* ignore */ } resolve(null); return; }
        var get = t.objectStore('meta').get('account');
        get.onsuccess = function () {
          var acct = get.result;
          try { db.close(); } catch (_) { /* ignore */ }
          if (!acct) { resolve(null); return; }
          var out = {};
          var b = acct.balances || {};
          Object.keys(b).forEach(function (k) { var t2 = tokenHex(k); if (t2) out[t2] = BigInt(b[k]); });
          if (acct.balance != null && legacy) out[legacy] = (out[legacy] || BigInt(0)) + BigInt(acct.balance);
          resolve({ balances: out, counter: acct.counter || 0, id: acct.id || null });
        };
        get.onerror = function () { try { db.close(); } catch (_) { /* ignore */ } resolve(null); };
      };
    });
  }

  return {
    VERSION: VERSION, LEGACY_VERSIONS: LEGACY_VERSIONS, DECIMALS: DECIMALS, MESSAGE_BYTES: MESSAGE_BYTES,
    ROW_PREFIX: ROW, DB_NAME: DB_NAME, RETIRED_DB_NAME: RETIRED_DB_NAME, readRetired: readRetired,
    MESSAGES: MESSAGES, InstantError: InstantError,
    toHex: toHex, fromHex: fromHex, newPaymentId: newPaymentId, tokenHex: tokenHex,
    parseAmount: parseAmount, atomsToDecimal: atomsToDecimal, formatAmount: formatAmount,
    configureCurrencies: configureCurrencies, currencies: currencies, currencyOf: currencyOf,
    normalize: normalize, kindOf: kindOf, parse: parse, encodeReceiver: encodeReceiver, encodePayment: encodePayment,
    paymentMessage: paymentMessage, verifyPayment: verifyPayment, accountIdForKey: accountIdForKey,
    requestMessage: requestMessage, verifyRequest: verifyRequest, textToB64u: textToB64u, b64uToText: b64uToText,
    createWebCryptoKeyStore: createWebCryptoKeyStore,
    createIndexedDbBackend: createIndexedDbBackend, createMemoryBackend: createMemoryBackend,
    createAccount: createAccount
  };
});

/*
 * Stables Instant balance: the Wallet rows, its screen, the Instant side of Send and Receive, the
 * scanner hand-off, the delivery channels, and the arrival.
 *
 * Law 21 (founder 2026-09-28): one Send/Receive pair; the account is chosen inside Send and Receive
 * and remembered; tapping the Instant balance opens a screen holding all of its actions.
 * Law 22 (founder 2026-09-28, after hand-testing build 98): "switching to instant payment should
 * stay on the same interface as main balance, only the color should make it clear that this is an
 * instant payment, the process should be the same".
 * Law 23 (founder 2026-09-28, after build 99): "In instant payment we need the same amount and
 * currency selector. As soon an amount incoming is detected, the wallet page should be displayed
 * with a message confirming the received amount, all this must stay as it is for the regular
 * onchain UX". So, with registered pieces only:
 *   - The Instant balance holds the SAME currencies Savings offers (the Savings Send and Receive
 *     currency getter, never a list of its own), each with its own balance (scheme 0x04 signs the
 *     currency's token id; instant-protocol.js).
 *   - Wallet (M-CMP-ACCOUNT-HOME): directly under Receive and Send, one currency row per currency,
 *     drawn exactly as the Savings rows are (the same .ccy-sec-row: mark, name, figure, converted
 *     figure), the main currency first. A tap on any row opens the Instant balance screen.
 *   - The Instant balance screen (M-CMP-DETAIL, the shared detail screen a currency row opens): the
 *     same rows, and the temporary test credit with the same amount field and currency picker.
 *   - Send with Instant balance chosen (M-CMP-TRANSACTION): the Savings Send, element for element,
 *     its currency picker offering the Savings currencies with their Instant balances. "Confirm
 *     send" is refused IN PLACE (disabled, with the reason written under it) while the chosen
 *     currency's Instant balance cannot cover the amount (law 11). Commit first; then the payment
 *     goes to the delivery channel.
 *   - Receive with Instant balance chosen (M-CMP-RECEIVE): the Savings Receive: the code at once,
 *     its text with Copy, the optional amount and its currency (the code follows them, as the
 *     Savings code does), and the row of quiet commands, here "Scan payment" and "Paste payment".
 *   - Arrival: the moment a payment is credited, whichever channel carried it, the app does what it
 *     does when an on-chain payment is detected: stablesPresentIncomingPaymentInWallet, the SAME
 *     function tx-mirror's incoming signal ends in (close Receive, the Wallet, Recent activity in
 *     view, the same "Payment detected" message with the amount). Its one honest difference: an
 *     Instant payment is final, so the message says "Final" where the on-chain one says "Awaiting
 *     confirmation".
 * Only the colour differs, and it is the stylesheet's job (machinery-wallet.css, Machinery D057),
 * keyed off the sheet's data-payment-account. Which account a sheet shows, and the remembered
 * choice, belong to the shell (index.html, stablesChoosePaymentAccount).
 *
 * Founder answers (2026-09-28, after build 100; Machinery D059), built in build 101:
 *   - the account is called "Instant payments" in everything a person reads (internal identifiers,
 *     the "instant" preference value and the ids, stay);
 *   - the Wallet total counts it (walletHoldings(), read by index.html updateGlobalUI);
 *   - "automatic delivery of the payment is by NFC (the second scan remains only as a fallback where
 *     NFC is absent)". The "nfc" delivery channel below (standalone Android app only: its bridge
 *     exists nowhere else) is preferred while NFC is on. The receiver's phone answers as a card while
 *     its Instant Receive shows a code; the payer's phone reads: the receiver's code while Send waits
 *     for one (so a whole payment can be made with no camera), the stored payment after Confirm send
 *     ("Hold the phones together"). The receiver credits it through acceptPayment, exactly as a scan
 *     would, and answers the payer's phone; the payer records "Received" (markDelivered). A torn tap
 *     re-sends the SAME stored payment on the next tap and is credited once. Where NFC is absent
 *     (web, MiniDapp, Core companion, a phone without it) nothing changes: the QR is the channel.
 *     Where it is off, the sheet says so and offers the NFC settings; the QR still works.
 *     AMENDED in build 114 (founder laws 28 and 29, Machinery D072): where the phone has NFC, tap or QR
 *     is the person's explicit choice ("By tap (NFC)" / "By QR code"), and the way chosen is the whole
 *     screen: by QR code nothing about NFC is drawn and the phone's NFC side is off; by tap nothing
 *     about a QR is drawn. "Show QR code instead" is gone. See "by tap or by QR code" below.
 *
 * ONE TAP (founder 2026-09-28, build 102; Machinery D060). Build 101 needed two taps (read the code,
 * confirm, tap again). Now a tap is a whole payment: in ONE NFC session the payer's phone reads the
 * receiver's code, this page commits the debit and signs for exactly that receiver, the payment is
 * handed over, and the receiver's answer comes back ("Received"). The native side reads the code and
 * asks this page ({type:'tap', session, text}) with the link held open; the page answers nfcTapPay
 * (committed first, then the stored payment) or nfcTapDecline (nothing paid in this tap).
 *   - Payer sets the amount (paying a friend): amount and currency, "Confirm send" FIRST (payment code
 *     if the tier requires it), then "Hold the phones together" (pay.armed) and one tap. A code that
 *     asks for another amount or currency than the one confirmed is refused in place ("Not paid"),
 *     and nothing is paid.
 *   - Receiver sets the amount (shop style): Send with Instant payments open, one tap. The code's
 *     amount and currency fill the form; within the payer's quick-pay limit and daily quick-pay cap
 *     (StablesPaymentSecurity.classifyTier, the same tiers the Savings Send uses) it is paid in that
 *     same tap; above it the payer confirms (payment code if the tier requires it) and taps again.
 *   - Commit before emit, and the torn tap, are unchanged: only a committed payment's stored text is
 *     ever handed over, and a tap torn after the commit leaves that SAME payment armed for the next
 *     tap, credited once. The QR fallback is unchanged.
 *
 * STEP 2 (build 103; founder decisions of 2026-09-28, simcard/docs/step2-load-offload-design.md v2;
 * Machinery D061). The balance is now real: it is LOADED from Savings and OFFLOADED back to Savings
 * on chain, on the two covenants STEP2-PRESEED-01-R1 proved on mainnet. This file stays the offline
 * side and the screens; every node command lives in instant-chain.js (created here with the node
 * adapter test-channel-bootstrap.js provides), so the payment path itself still makes no node call.
 *   - The Instant payments pop-up (law 21) holds its two actions, "Add from Savings" (left) and
 *     "Move to Savings" (right, law 17), the Wallet's own Receive/Send pair element. Each opens the
 *     SHARED Send sheet already set: Add from Savings on Savings with the recipient "My Instant
 *     payments"; Move to Savings on Instant payments with the recipient "My Savings". The same two
 *     recipients are chips in the Send sheet. The same amount, currency, Confirm send and protection
 *     tiers as any send (law 23). SUPERSEDED in build 104 by law 25: "Add" and "Remove" on their own
 *     transfer screen, and no own-account recipient or chip in Send (below).
 *   - One row per operation (law 2): "To Instant payments" and "To Savings", the status in the status
 *     (law 13): Sending, Broadcasted, On-chain, Confirming n/3, then Added (a load) or Received (a move
 *     to Savings); Preparing while a first registration or a merge happens; Not sent when nothing
 *     moved. Step times go to the shared store (law 14). Land on the Wallet (law 1); no toasts (law 3).
 *   - The settling amount on the currency row, with no words (law 19): "+X" on the Instant payments row
 *     while a load waits for its three confirmations, "+X" on the Savings row while a move to Savings
 *     settles (activity-contacts.js counts that row). The Wallet total does not dip during a load.
 *   - A load is credited once per load coin id at three confirmations (the protocol's creditLoad). A
 *     move to Savings debits first, and is given back only while nothing was posted.
 *   - "Add test credit" is retired with a FRESH ACCOUNT (scheme 0x05, store stables-instant-v2). The
 *     old account's figure is read, never written, and shown as "Test credit retired" in the pop-up
 *     and as one activity row (law 4: nothing disappears); it is not counted anywhere.
 *   - Law 24 (founder 2026-09-29): a payment a TAP carries asks for the payment code above quick pay,
 *     always (tierFor); Savings' own tiers are unchanged.
 *
 * ADD AND REMOVE (build 104; UX law 25, founder 2026-09-29 starting the demo on build 103: "the
 * button should be add and remove to instant payment, the following screen looks really bad with all
 * elements touching each other and these page are really not intuitive"; Machinery D062). Moving money
 * between the person's own two accounts is a simple transfer, never a disguised payment. The chain side
 * (instant-chain.js, the load and the move to Savings, their rows and the "+X") is build 103's, unchanged.
 *   - The Instant payments screen: the account's total in its own colour (the Wallet's account-truth
 *     block, converted the way the Wallet total is), "Ready to pay offline", then "Remove" (left) and
 *     "Add" (right, law 17), then the currency rows (name and amount only), then the retired test
 *     credit as ONE muted line.
 *   - Add and Remove open ONE transfer screen (#instantMoveModal, M-CMP-TRANSACTION, the Mint canon):
 *     From -> To with what each account holds in the chosen currency, the money field (half, MAX, the
 *     amount with commas, the one currency dropdown), the reason it cannot run, and one commit naming
 *     the action ("Add 100 Winiwa"). No recipient field, no address book, no account switch, no chip:
 *     build 103's "My Instant payments" / "My Savings" recipients in the Send sheet are gone, so Send is
 *     only ever a payment. The Savings tiers still decide a payment code, invisibly.
 *   - The Wallet's Instant rows are the same clean rows.
 *   SUPERSEDED in build 105: the two screens are one page (below).
 *
 * ONE PAGE (build 105; law 25 as amended by the founder 2026-09-29 after testing build 104: "We have one
 * intermediairy windows there that we can get rid of, by clicking on of the asset in instant payments we
 * should get directly on a page where we add and remove any of the token, please combine these, otherwise the
 * UI is much better"; Machinery D063). A tap on any Instant payments row opens ONE page (#instantMoveModal),
 * on that row's currency, with nothing in between: the total in amber and "Ready to pay offline", the
 * direction "Remove | Add" (the registered segmented control, Add trailing and chosen by default, law 17),
 * From -> To, the money field with every currency Instant payments holds, the reason, the one commit
 * ("Add 100 Winiwa"), what the account holds of each currency, and the retired test credit. The direction
 * turns the form round in place; it opens nothing. The chain side and the commit's path are build 104's.
 *
 * PROGRESS AND THE NOTICE (build 106; UX law 26, founder 2026-09-29 during the live demo on build 105:
 * "adding to instant, in the transaction, we should be able to see the progression. for now the message demo
 * notice only appears when we close the window, make it pop up on top and make the message in the same format
 * and font as others, it is for now too big"; Machinery D064). An Add or a Remove shows its progress in the
 * transaction exactly as a Savings send does: its row opens the shared transaction details, whose "View
 * progress" opens the Savings send's progress view and tracker (index.html stablesShowSendResultModal,
 * stablesSendProgressHtml) with the same steps and the same shared step times (laws 14, 15). The tracker is
 * fed by progressOf below, from the SAME record the row is drawn from (one reading, two views). The explorer
 * notice that opened behind the transaction's window is the app's one notice element now (activity-contacts.js
 * openTxExplorer). Landing on the Wallet with no message after confirming is unchanged (laws 1, 3).
 *
 * Names: a currency CODE ('WINIMA') is never shown; the label comes from currencyDisplayLabel, and
 * a code and a label are compared only through stablesSameAssetName (law 7: never MINIMA, never
 * WINIMA). No node call and no network call anywhere on the offline payment path. Balances, keys and
 * journal live in IndexedDB; a device without WebCrypto or IndexedDB keeps every surface and refuses
 * in place. One activity row per operation.
 */
(function (W) {
  'use strict';
  var P = W.StablesInstantProtocol;
  var CC = W.StablesInstantChainCore;                   // instant-chain.js: the on-chain side (build 103)
  var D = W.document;
  var LEGACY_CODE = 'WINIMA';                           // build 99's one-figure balance was Winiwa
  var UNAVAILABLE = (P && P.MESSAGES && P.MESSAGES.unavailable) || 'This device cannot hold a Stables card.';
  var QR_SIZE = 248;                                    // the Savings Receive code's own size: the most a code is drawn
  var QR_FIT = 198;                                     // what fits the code frame (232 wide, 1 px border, 14 px padding,
                                                        // the 2 px wrapper) when the frame cannot be measured
  var PICKERS = ['instantPayCcy', 'instantRecvCcy', 'instantMoveCcy'];
  var MOVE_CCY = 'instantMoveCcy';                      // the Instant payments page's currency picker (builds 104, 105)
  var SAVINGS = 'Savings';                              // the two accounts, by the names a person reads
  var INSTANT = 'Stables card';
  var RETIRED_ROW = 'INSTANT-RETIRED-V1';               // the one row that summarises the retired test credit

  var state = { status: 'loading', balances: null };     // loading | ready | unavailable
  var account = null;
  var chain = null;                                      // instant-chain.js create(): load, offload, follow
  var chainEntries = [];                                 // the journal's load and offload records, for display
  // The Instant payments page (build 105, law 25 as amended): which way the form runs ('add' Savings ->
  // Instant payments, chosen on opening; 'remove' the reverse), a press in progress, and the reason the last
  // press was refused.
  var move = { dir: 'add', busy: false, reason: '' };
  var currencyList = [];                                 // [{code, label, tokenId}]: the Savings set
  var scan = { mode: null, home: null, next: null };      // where the one scanner currently lives
  var recv = { code: null, drawn: 0 };                   // the receiver code text on screen
  var pay = { code: null, source: 'manual', showing: null, committing: false, intent: null,
    view: null, note: null, delivered: false, armed: null };
  // How a payment is handed over (founder law 29, build 114, Machinery D072): 'nfc' (by tap) or 'qr',
  // the person's own choice in Send and Receive, one preference for both, kept on the device by the
  // shell (index.html, stables_instant_way_v1) and read once here.
  var wayChosen = '';
  var nfc = { mode: '', ref: '', code: '' };             // what the native side was last told (build 101)
  var tap = { session: '' };                             // a one tap waiting for this page's answer (build 102)
  function now() { try { return W.performance && W.performance.now ? W.performance.now() : Date.now(); } catch (_) { return Date.now(); } }

  function el(id) { return D.getElementById(id); }
  function setText(id, text) { var e = el(id); if (e) e.textContent = text; }
  function setLine(id, text) { var e = el(id); if (e) { e.textContent = text || ''; e.hidden = !text; } }
  function show(id, on) { var e = el(id); if (e) e.hidden = !on; }
  function ready() { return state.status === 'ready' && !!account; }
  function isOpen(id) { var e = el(id); return !!(e && e.classList.contains('open')); }
  /** True when the Send or Receive sheet is open AND showing the Instant balance (law 21). */
  function sheetShows(id) {
    return isOpen(id) && typeof W.stablesPaymentAccountView === 'function' && W.stablesPaymentAccountView(id) === 'instant';
  }
  function log(message) { try { console.log('[instant] ' + message); } catch (_) { /* ignore */ } }
  /** The one-line text equivalent of a payload: a single-line field shows it, the parser reads it. */
  function oneLine(text) { return String(text || '').replace(/\n/g, ' '); }

  function supported() {
    return !!(P && typeof BigInt === 'function' && W.crypto && W.crypto.subtle && W.indexedDB);
  }

  /* ---------- currencies: the Savings set, named the Savings way ---------- */
  /** The currency codes Savings offers in Send and Receive (law 23: the same set, the same getter). */
  function savingsCodes() {
    var get = W.__VAULT_DD_GET_CODES && W.__VAULT_DD_GET_CODES.sendCcy;
    var list = null;
    try { list = typeof get === 'function' ? get() : null; } catch (_) { list = null; }
    return Array.isArray(list) && list.length ? list.slice() : [LEGACY_CODE];
  }
  function labelOf(code) { return typeof W.currencyDisplayLabel === 'function' ? W.currencyDisplayLabel(code) : String(code || ''); }
  function tokenOfCode(code) {
    var R = W.StablesRetail;
    return P && R && typeof R.tokenId === 'function' ? P.tokenHex(R.tokenId(code)) : null;
  }
  /** Tell the protocol which currencies exist: the Savings codes, each with its token id and label. */
  function syncCurrencies() {
    if (!P) return [];
    var list = [];
    savingsCodes().forEach(function (code) {
      var tokenId = tokenOfCode(code);
      if (tokenId) list.push({ code: code, label: labelOf(code), tokenId: tokenId });
    });
    currencyList = P.configureCurrencies(list);
    return currencyList;
  }
  /** The currency a picker value names. Code and label meet only in stablesSameAssetName. */
  function currencyForCode(code) {
    var c = String(code || '');
    for (var i = 0; i < currencyList.length; i++) {
      var cur = currencyList[i];
      if (cur.code === c) return cur;
      if (typeof W.stablesSameAssetName === 'function' && W.stablesSameAssetName(cur.code, c)) return cur;
    }
    return null;
  }
  function currencyForToken(tokenId) {
    var t = P ? P.tokenHex(tokenId) : null;
    for (var i = 0; i < currencyList.length; i++) if (currencyList[i].tokenId === t) return currencyList[i];
    return null;
  }
  /** A journal entry or payment from build 99 names no currency: it was Winiwa. */
  function currencyOfRecord(rec) { return currencyForToken(rec && rec.tokenId) || currencyForCode(LEGACY_CODE) || currencyList[0] || null; }
  function primaryCode() { try { return typeof W.stablesGetPrimaryCcy === 'function' ? W.stablesGetPrimaryCcy() : ''; } catch (_) { return ''; } }
  /** The currency a sheet starts on: the main currency when the Instant balance offers it (as Savings does). */
  function defaultCurrency() { return currencyForCode(primaryCode()) || currencyList[0] || null; }
  /* A FUNDED DEFAULT (build 0.0.12.057; founder 2026-10-05: "again if one currency has no balance, the other one should be
     the default one in the currency menu, apply this everywhere", met on the Graphene bringing xWiniwa back on chain).
     The currency a paying menu opens on is the one asked for, or the main one, as long as the side that pays holds some;
     when it holds none, the first currency (Savings order) that it does hold. Nothing held anywhere: the main one. */
  function cardHolds(cur) { return cur ? balanceOf(cur.tokenId) > BigInt(0) : false; }
  function savingsHolds(cur) { var a = cur ? savingsAtoms(cur.code) : null; return a != null && a > BigInt(0); }
  function fundedCurrency(cur, holds) {
    if (cur && holds(cur)) return cur;
    var list = orderedCurrencies();
    for (var i = 0; i < list.length; i++) if (holds(list[i])) return list[i];
    return cur || defaultCurrency();
  }
  /** The rows in Savings order: the main currency first, then the others as the Savings list has them. */
  function orderedCurrencies() {
    var first = currencyForCode(primaryCode());
    var out = first ? [first] : [];
    currencyList.forEach(function (c) { if (!first || c.tokenId !== first.tokenId) out.push(c); });
    return out;
  }
  function balanceOf(tokenId) {
    return state.balances && state.balances[tokenId] != null ? state.balances[tokenId] : BigInt(0);
  }
  function money(atoms, cur) { return P.formatAmount(atoms) + ' ' + (cur ? cur.label : ''); }
  function messageOf(e) {
    if (e && e.code === 'insufficient' && e.balance != null && e.amount != null) {
      var cur = currencyForToken(e.tokenId);
      return 'Your Stables card holds ' + money(e.balance, cur) + '. This payment is ' + money(e.amount, cur) + '.';
    }
    return (e && e.instant) ? e.message : 'Something went wrong. Nothing was moved.';
  }

  /* ---------- the pickers: the one dropdown, holding the Savings currencies ---------- */
  function pickerCurrency(id) {
    var h = el(id);
    return currencyForCode(h ? h.value : '') || defaultCurrency();
  }
  function setPicker(id, cur) {
    var h = el(id);
    if (!h || !cur) return;
    h.value = cur.code;
    syncPicker(id);
  }
  function syncPicker(id) {
    // The Instant payments page's list shows what the FROM account holds of each currency (mode
    // 'instant-move'); the Send and Receive lists show the Instant balances (mode 'instant').
    try { if (el(id) && typeof W.syncVaultCurrencyDropdownTrigger === 'function') W.syncVaultCurrencyDropdownTrigger(id, id === MOVE_CCY ? 'instant-move' : 'instant'); } catch (_) { /* ignore */ }
  }
  /** A picker built after the page loaded (the one on the Instant balance screen) is bound here. */
  function bindPicker(id) {
    try {
      var get = W.__VAULT_DD_GET_CODES && W.__VAULT_DD_GET_CODES[id];
      if (typeof W.refreshVaultCurrencyDropdown === 'function' && typeof get === 'function') W.refreshVaultCurrencyDropdown(id, get, 'instant');
      if (typeof W.bindVaultCurrencyDropdownOpen === 'function') W.bindVaultCurrencyDropdownOpen(id);
    } catch (_) { /* the hidden value still decides */ }
  }

  /* ---------- the rows: the Savings row element, name and amount only (law 25) ---------- */
  /**
   * Law 25 (founder 2026-09-29): "clean currency rows: name and amount only". Build 100 to 103 drew the
   * Savings row's qualifier line and converted figure too, and for a currency whose full name IS its
   * label (xWiniwa) the qualifier printed the name a second time, while a zero balance printed a stray
   * "-" as its converted figure. The row keeps the Savings row element (DAT-001: mark, name, figure) and
   * its settling "+X" (law 19); the total at the top of the Instant payments page carries the
   * converted value, once.
   */
  function drawList(listId, clickable) {
    var list = el(listId);
    if (!list || !currencyList.length) return;
    var rows = orderedCurrencies();
    var key = rows.map(function (c) { return c.code; }).join('|');
    if (list.dataset.instantRows !== key) {
      // One currency row per currency: the Savings row's own element and classes.
      list.innerHTML = rows.map(function (c) {
        return '<div class="ccy-sec-row" data-instant-ccy="' + c.code + '" data-asset="' + c.code + '"' +
          (clickable ? ' onclick="stablesOpenCardScreen(\'pay\', this.dataset.instantCcy)"' : '') + '>' +
          '<div><div class="ccy-sec-tag"></div></div>' +
          '<div class="wallet-right"><div class="ccy-sec-amt bal-amount"></div></div>' +
          '</div>';
      }).join('');
      list.dataset.instantRows = key;
    }
    var mode = typeof W.getCurrencyVisualMode === 'function' ? W.getCurrencyVisualMode() : 'icons';
    Array.prototype.forEach.call(list.querySelectorAll('.ccy-sec-row'), function (row) {
      var cur = currencyForCode(row.dataset.instantCcy);
      if (!cur) return;
      var atoms = balanceOf(cur.tokenId);
      var tag = row.querySelector('.ccy-sec-tag');
      if (tag) tag.innerHTML = (typeof W.currencyPrefixHtml === 'function' ? W.currencyPrefixHtml(cur.code, mode) : '') + cur.label;
      // Four-state truth: unknown is never painted as zero. "Unavailable" is a refusal, not a figure
      // (its reason is written on the Instant payments page).
      var amt = row.querySelector('.ccy-sec-amt');
      if (amt) amt.textContent = ready() ? P.formatAmount(atoms) : (state.status === 'unavailable' ? 'Unavailable' : '—');
      // Law 19: a load still waiting for its three confirmations is NOT in the figure above, so its
      // amount sits beside it on its own, "+100.00", with no words, until it is credited: the same
      // element the Savings rows use (.ccy-pending-delta), and the row pulses like a settling one.
      var right = row.querySelector('.wallet-right');
      var delta = right ? right.querySelector('.ccy-pending-delta') : null;
      var pending = ready() ? pendingLoadAtoms(cur.tokenId) : BigInt(0);
      if (right && pending > BigInt(0)) {
        if (!delta) {
          delta = D.createElement('div');
          delta.className = 'ccy-pending-delta bal-amount';
          delta.setAttribute('aria-live', 'polite');
          right.appendChild(delta);
        }
        delta.textContent = '+' + P.formatAmount(pending);
        delta.hidden = false;
      } else if (delta) {
        delta.hidden = true;
        delta.textContent = '';
      }
      row.classList.toggle('ccy-sec-row--settling', pending > BigInt(0));
    });
  }

  /* ---------- loads and moves to Savings in flight (build 103) ---------- */
  /** A load's amount while it waits for its confirmations: posted, not yet credited or failed. */
  function pendingLoadAtoms(tokenId) {
    var sum = BigInt(0);
    chainEntries.forEach(function (e) {
      if (e.kind === 'load' && e.status === 'posted' && e.tokenId === tokenId) sum += BigInt(e.amount);
    });
    return sum;
  }
  /**
   * The retired test-credit account as ONE tidy muted line at the foot of the Instant payments page
   * (law 25): "Test credit retired · 150.00 Winiwa". Never hidden while it holds something (law 4),
   * never clickable, never counted. Build 103 drew it as currency rows, whose qualifier wrapped under
   * the mark ("Test / credit retired").
   */
  /**
   * The retired test credit is no longer shown anywhere (founder law 31, 2026-09-30: "let's get rid of Test credit
   * retired, we have to present the app as we will hand it over to the users"). The old store (stables-instant-v1)
   * is never opened by this build; a row an earlier build wrote for it is forgotten at boot (forgetRetiredRow).
   */
  function retiredRows() { return []; }

  /**
   * The account's total, converted into the main currency exactly as the Wallet total converts it
   * (index.html stablesWalletRateIntoPrimary, the Savings rate; a holding that cannot be priced makes
   * the figure "—" rather than a smaller false one). What is READY to pay offline: a load still
   * confirming is not in it (its "+X" sits on its row). null while unknown (law 5).
   */
  function instantTotal() {
    if (!ready()) return null;
    var rate = W.stablesWalletRateIntoPrimary;
    var total = 0, unpriced = false;
    currencyList.forEach(function (c) {
      var amount = Number(P.atomsToDecimal(balanceOf(c.tokenId)));
      if (!(amount > 0)) return;
      var r = typeof rate === 'function' ? rate(c.code) : (currencyForCode(primaryCode()) === c ? 1 : null);
      if (r == null) { unpriced = true; return; }
      total += amount * r;
    });
    if (unpriced && !(total > 0)) return { text: '—' };
    var main = primaryCode();
    var dec = typeof W.decimalsForCcyForUI === 'function' ? W.decimalsForCcyForUI(main) : 2;
    var unit = typeof W.displayCcyCodeForUI === 'function' ? W.displayCcyCodeForUI(main) : labelOf(main);
    return { text: Number(total).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }), unit: unit };
  }
  /** The Instant payments page's account truth: the total in the account's colour, its unit and state. */
  function drawTotal() {
    var fig = el('instantTotal');
    if (!fig) return;
    var t = instantTotal();
    var unavailable = state.status === 'unavailable';
    fig.textContent = unavailable ? 'Unavailable' : (t ? t.text : '—');
    fig.classList.toggle('w-total--state', unavailable);
    setText('instantTotalUnit', t && t.unit ? t.unit + ' equivalent' : '');
    setText('instantTotalCaption', unavailable ? UNAVAILABLE : (ready() ? 'Ready to pay offline' : ''));
  }

  function render() {
    var ok = ready();
    drawList('instantBalanceList', true);
    // The Instant payments page (build 105): its total, its form, what it holds of each currency, the
    // retired test credit. A device that cannot hold the account says so once, under the total.
    if (moveOpen()) {
      drawTotal();
      drawMove();
      drawList('instantSheetList', false);
    }
    // Send: the Available line of the Savings Send, from this balance in the chosen currency
    // (four-state: unknown is "-").
    var payCur = pickerCurrency('instantPayCcy');
    setText('instantPayAvail', ok && payCur ? 'Available: ' + money(balanceOf(payCur.tokenId), payCur) : (state.status === 'unavailable' ? 'Available: unavailable' : 'Available:  - '));
    // A device that cannot hold the balance says so where the flow would act (law 4, law 11).
    var refusal = state.status === 'unavailable' ? UNAVAILABLE : (nfcState() === 'absent' && !far ? NO_NFC : '');
    setLine('instantPayState', refusal);
    ['instantScanPaymentBtn', 'instantPastePaymentBtn'].forEach(function (id) { var b = el(id); if (b) b.disabled = !ok; });
    if (state.status === 'unavailable') {
      if (scan.mode) unmountScanner();
      var host = el('instantRecvQr');
      if (host && sheetShows('recvModal')) { host.classList.remove('recv-qr-host--ready'); host.textContent = UNAVAILABLE; }
    }
    PICKERS.forEach(syncPicker);
    checkFunds();
    drawWay();
    syncNfc();
  }

  function refresh() {
    return account.state().then(function (s) {
      var before = balancesKey();
      state.status = 'ready';
      state.balances = s.balances;
      render();
      // The Wallet total counts Instant payments (founder, after build 100), so a changed figure
      // redraws it (index.html updateGlobalUI reads walletHoldings()).
      if (balancesKey() !== before) redrawTotal();
      return s;
    });
  }
  function balancesKey() {
    if (!state.balances) return state.status;
    return Object.keys(state.balances).sort().map(function (t) { return t + '=' + state.balances[t]; }).join(',');
  }
  function redrawTotal() {
    try { if (typeof W.updateGlobalUI === 'function') W.updateGlobalUI(); } catch (_) { /* the rows still show the figure */ }
  }

  /* ---------- activity: one row per operation, projected from the durable journal ---------- */
  /**
   * Where a payment got to (law 13: the status says it, the title never does): "Received" once the
   * receiver's phone confirmed it (NFC, build 101); before that, what this phone did with it, the
   * hold-the-phones view ("Waiting for tap") or its QR ("QR shown"; a scanned QR is never confirmed
   * back, so it stays "QR shown" unless a later tap confirms it).
   */
  function outStatus(entry, how) {
    if (entry && entry.delivered) return entry.delivered.via === 'network' ? 'Sent' : 'Received';
    // Over the network (D087): "Sending" while this phone builds the envelope; "Broadcasted" the moment it is on the
    // network, because that is when the receiver's phone sees and credits it (founder 2026-10-06, D125: "the graphene
    // received the payment way before the pro got the confirmation"); "Sent" once it is in a block. One that could not go
    // out is shown as its QR, as before.
    var c = entry && entry.carrier;
    if (c && c.state === 'posted') return 'Broadcasted';
    if (c && (c.state === 'sending' || c.state === 'ble')) return 'Sending';
    if (how === 'network') return 'Sending';
    return how === 'nfc' ? 'Waiting for tap' : 'QR shown';
  }
  function rowFor(entry, how) {
    if (entry && (entry.kind === 'load' || entry.kind === 'offload')) return rowForChain(entry);
    var cur = currencyOfRecord(entry);
    var amount = Number(P.atomsToDecimal(BigInt(entry.amount)));
    var row = {
      id: entry.id, instant: true, localOrigin: true, minimaOnChain: false, ccy: cur ? cur.label : '', ts: entry.ts,
      status: 'Final', category: 'Stables card'
    };
    if (entry.kind === 'out') {
      // Over the network (D087) it was not offline: "Paid" / "Received", in the Instant payments category.
      // D093: the Stables card's own words, whatever carried it.
      row.title = 'Paid'; row.dir = 'out'; row.amt = -amount; row.offlineStatus = outStatus(entry, how);
      row.instantRef = entry.ref; row.icon = '↗';
      // Build 0.0.12.057: delivered over the network, the payment has a transaction on the chain: its link.
      if (entry.carrier && entry.carrier.txpowid) { row.explorerTxId = String(entry.carrier.txpowid); row.block = Number(entry.carrier.block) || 0; }
    } else {
      row.title = 'Received'; row.dir = 'in'; row.amt = amount; row.offlineStatus = 'final';
      /* Over the network (build 0.0.12.029, founder 2026-10-04: "no link to onchain transaction in the explorer, if the
         link is not available, the transaction should not be presented as finished"): the envelope's transaction is the
         link, and the row reads "Receiving" until it is in a block deep enough for the person's confirmation setting. */
      var ch = entry.chain;
      if (ch && ch.txpowid) {
        row.explorerTxId = String(ch.txpowid);
        if (!(Number(ch.block) > 0)) { row.offlineStatus = 'Receiving'; row.status = 'Receiving'; }
        else row.block = Number(ch.block);
      } else if (entry.via === 'network') { row.offlineStatus = 'Receiving'; row.status = 'Receiving'; }
      row.icon = '↙';
    }
    return row;
  }

  /**
   * A load ("To Instant payments") or a move to Savings ("To Savings"): ONE row per operation (law 2),
   * its title saying what it is and its status where it got to (law 13). Money moving between the
   * person's own two accounts has no sign and no colour, as combining notes does (dir 'self').
   */
  function chainStatus(e) {
    if (e.awaitingApproval) return 'Waiting for approval';
    var load = e.kind === 'load';
    if (load && e.status === 'credited') return 'Added';
    if (!load && e.status === 'received') return 'Received';
    if ((load && e.status === 'failed') || (!load && e.status === 'restored')) return 'Not sent';
    if (e.proof === 'unavailable') return 'Proof unavailable';
    if (e.proof === 'stuck') return 'Not received yet';
    if (!load && (e.status === 'preparing' || e.status === 'merging')) return 'Preparing';
    if (e.status === 'building' || e.status === 'committed') return 'Sending';
    if (!(Number(e.block) > 0)) return 'Broadcasted';
    var depth = Number(e.depth) || 0;
    var t = confirmBlocksFor(e);
    return depth <= 0 ? 'On-chain' : 'Confirming ' + Math.min(t, depth) + '/' + t;
  }
  function rowForChain(e) {
    var cur = currencyOfRecord(e);
    var load = e.kind === 'load';
    var st = chainStatus(e);
    return {
      id: e.id, instant: true, instantChain: e.kind, localOrigin: true, minimaOnChain: false,
      dir: 'self', icon: load ? '↗' : '↙', title: load ? 'To Stables card' : 'To Savings',
      counterparty: load ? 'Stables card' : 'Savings', category: 'Stables card',
      ccy: cur ? cur.label : '', amt: Number(P.atomsToDecimal(BigInt(e.amount))), ts: e.ts,
      status: st, offlineStatus: st, note: e.note || '', explorerTxId: e.txpowid ? String(e.txpowid) : '',
      block: Number(e.block) || 0, awaitingApproval: !!e.awaitingApproval,
      // The Savings currency row carries this amount as "+X" while the withdrawal settles (law 19).
      // A move whose proof is unavailable cannot settle any more: it must not pulse the Wallet total or carry "+X" on
      // Savings for ever (founder's Pro, 2026-10-04: a Remove from 3.6 days earlier kept the total flashing; build 0.0.12.024).
      instantSettling: !load && (e.status === 'posted' || e.status === 'received') && !e.settled && e.proof !== 'stuck' && e.proof !== 'unavailable'
    };
  }
  /**
   * The progress of an Add or a Remove (founder law 26, build 106: "adding to instant, in the transaction, we
   * should be able to see the progression"), in the form the Savings send's tracker takes
   * (index.html stablesSendProgressHtml): the same five steps, the same shared step times (laws 14 and 15),
   * read from the SAME record the row is drawn from (chainStatus above), so the two cannot disagree:
   *   row "Preparing"      -> the first step in progress, "Preparing" (a first Remove in a currency while
   *                           its registration settles on the chain, or a merge; build 103);
   *   row "Sending"        -> "Sending" in progress (building, then signed and handed to the node);
   *   row "Broadcasted"    -> Ready, Sent and Broadcasted done (the node took it and relayed it);
   *   row "On-chain"       -> in a block (depth 0);
   *   row "Confirming n/3" -> "Confirming (n/3 blocks)", n the depth;
   *   row "Added" / "Received" -> the last step done, "Added (3/3 blocks)" or "Received (3/3 blocks)";
   *   row "Not sent"       -> the step in progress marked failed.
   * The words of a move between the person's own accounts replace the three a payment uses (readyLabel,
   * broadcastedSub, settledLabel); onChain carries the row's own block test. The TxPoW id is given only
   * once the record has its block, so "View transaction" opens a real explorer page.
   */
  /* The confirmations an Add or a Remove waits for (build 0.0.12.026, founder 2026-10-04: "in the transaction
     progress, we have confirming 0/3, it should be 0/1"): the person's own setting for that amount, as a Savings
     payment uses (StablesPaymentSecurity.confirmationTargetFor; default 1 block since 0.0.12.025). instant-chain.js
     credits and receives at the same number (create opts.confirmBlocks). */
  function confirmBlocksFor(e) {
    var ps = W.StablesPaymentSecurity;
    var b = NaN;
    try {
      var atoms = BigInt(String((e && e.amount) || '0'));
      if (ps && typeof ps.confirmationTargetFor === 'function') b = Number(ps.confirmationTargetFor({ fiatTotal: fiatOf(atoms, currencyOfRecord(e)) }).blocks);
    } catch (_) { b = NaN; }
    return b >= 1 && b <= 30 ? Math.floor(b) : 1;
  }
  function progressOf(e) {
    var CONFIRM_BLOCKS = confirmBlocksFor(e);
    var load = e.kind === 'load';
    var done = load ? e.status === 'credited' : e.status === 'received';
    var failed = (load && e.status === 'failed') || (!load && e.status === 'restored');
    var posted = done || e.status === 'posted';
    var block = Number(e.block) || 0;
    var preparing = !load && (e.status === 'preparing' || e.status === 'merging');
    // One short line under the step (the tracker breaks a long line anywhere, as it must for a TxPoW id).
    var sub = e.awaitingApproval ? 'Waiting for your approval'
      : (!preparing ? '' : (e.status === 'merging' ? 'Combining coins first' : 'Registering on the chain'));
    var p = {
      found: true, failed: failed, instantChain: e.kind,
      built: posted || !!e.txnid, sent: posted, mined: posted,
      onChain: done || block > 0, confirmed: done,
      confirmations: done ? CONFIRM_BLOCKS : (block > 0 ? Math.min(CONFIRM_BLOCKS, Math.max(0, Number(e.depth) || 0)) : 0),
      target: CONFIRM_BLOCKS,
      txid: block > 0 && e.txpowid ? String(e.txpowid) : '', pendingTxnId: '',
      rowId: e.id, startedAt: Number(e.ts) || 0,
      buildingLabel: preparing ? 'Preparing' : 'Sending', readyLabel: 'Ready',
      broadcastedSub: 'On the network.', settledLabel: load ? 'Added' : 'Received'
    };
    if (sub) p.phaseSub = sub;
    return p;
  }
  /**
   * The progress of a tap or QR payment (founder law 27, build 107: "we need the view progress for all transactions
   * including the instant payments ones"; his order: "first I want to see what is onchain first and instant payment
   * coming onchain on the receiving phone, then NFC and communication mean"). The ONE tracker draws the steps this
   * gives it (index.html stablesSendProgressHtml, `steps`), read from the SAME journal record the row is drawn from:
   *   1. Backed on-chain: the money paid is Instant payments money loaded on the Minima chain (the Add);
   *   2. the payment: for the payer, "Payment ready" (signed on this phone), then "Received" once the receiving
   *      phone answered (markDelivered: NFC); for the receiver, "Received" (checked and credited, final);
   *   3. the channel it travelled by: "By NFC tap" or "By QR code" (no internet).
   * A QR payment is never confirmed back to the payer, so its "Received" step waits without spinning (idle), and
   * the words say so. The times are the record's own (ts, delivered.ts), shown by the tracker where it watched
   * nothing live (knownTimes); it never stamps a time it did not see.
   */
  function progressOfPayment(e) {
    var out = e.kind === 'out';
    var row = typeof W.stablesGetUserActivityRowById === 'function' ? W.stablesGetUserActivityRowById(e.id) : null;
    var delivered = e.delivered && typeof e.delivered === 'object' ? e.delivered : null;
    var via = out ? String((delivered && delivered.via) || (row && row.offlineStatus === 'QR shown' ? 'qr' : (row && row.offlineStatus === 'Waiting for tap' ? 'nfc' : ''))) : String(e.via || '');
    if (out && e.carrier && e.carrier.state !== 'failed') via = e.carrier.state === 'ble' ? 'bluetooth' : 'network';
    if (out && delivered && delivered.via === 'bluetooth') via = 'bluetooth';
    // The first instant after the commit, before the carrier is recorded: the row already says "Sending" (it is going
    // out by Bluetooth or the network), never "Hold the phones together".
    if (out && !delivered && !e.carrier && row && row.offlineStatus === 'Sending') via = bleNow() === 'on' ? 'bluetooth' : 'network';
    var bt = via === 'bluetooth';
    var channel = bt ? 'By Bluetooth' : via === 'nfc' ? 'By NFC tap' : (via === 'qr' || via === 'screen' ? 'By QR code' : (via === 'text' ? 'By pasted text' : (via === 'network' ? 'Over the Minima network' : 'Offline')));
    var net = via === 'network';
    var steps = [{ key: 'backed', past: 'Backed on-chain', done: true, sub: 'Stables card money loaded on the Minima chain' }];
    var known = { backed: 0 };
    if (out) {
      var qr = via === 'qr';
      steps.push({ key: 'built', present: 'Preparing payment', past: 'Payment ready', done: true, sub: 'Signed on this phone' });
      // Law 28 (build 114): while it is in flight the line says what to do next, never what has not happened.
      if (bt) {
        /* By Bluetooth (D092): each step of the hand-over, as it happens (the native side reports searching,
           connecting, sending), then the receiving phone's own answer. */
        var bs = (e.carrier && e.carrier.step) || 'searching';
        var bWords = { searching: 'Finding the receiver’s phone', connecting: 'Connecting to the receiver’s phone', sending: 'Sending by Bluetooth' };
        steps.push({ key: 'sent', present: bWords[bs] || 'Sending by Bluetooth', past: 'Sent by Bluetooth', done: !!delivered,
          sub: delivered ? 'Handed over directly, phone to phone.' : 'Keep the phones close (usually about a second).' });
        steps.push({ key: 'received', present: 'Waiting for the receiver’s phone', past: 'Received', done: !!delivered,
          sub: delivered ? 'The receiving phone checked and credited it. Final.' : 'The receiving phone checks it and answers.' });
        known.sent = Number(e.carrier && e.carrier.at) || 0;
        if (delivered) known.received = Number(delivered.ts) || 0;
      } else if (net) {
        /* Founder 2026-10-04 (build 0.0.12.028): "we should have a constant progression displayed ... the app should
           constantly communicate what is going on". Each step says what is happening now, from the payment's record. */
        var c = e.carrier || {};
        var out2 = c.state === 'posted' || c.state === 'on-chain' || !!delivered;
        // D125: the receiver's phone credits it from the network, before any block, so the payer is told at the same
        // moment ("Broadcasted"), and the block only makes it final ("In a block"), as a Savings send says it (law 15).
        steps.push({ key: 'sent', present: c.attempt > 1 ? 'Sending again' : 'Sending', past: 'Broadcasted', done: out2,
          sub: out2 ? 'On the network. The receiver’s phone can see it now.' : ((c.bleFailed ? 'Bluetooth did not reach the receiver’s phone, so it goes by the network ' : 'Your phone is building and sending it ') + '(about 20 seconds).') });
        var blk = Number(c.block) || 0;
        steps.push({ key: 'received', present: 'Waiting for the block', past: 'In a block', done: !!delivered,
          sub: delivered ? (blk ? 'In block ' + blk.toLocaleString('en-US') + ' at the receiver’s address. Final.' : 'In a block at the receiver’s address. Final.')
            : (out2 ? 'The block makes it final, usually within a minute.' : 'Next: on the network, where the receiver’s phone sees it.') });
        known.sent = Number(c.at) || 0;
      } else {
        steps.push({ key: 'received', present: qr ? 'QR shown' : 'Waiting for tap', past: 'Received', done: !!delivered, idle: qr,
          sub: delivered ? 'The receiving phone credited it. Final.' : (qr ? 'Show the code to the receiver’s camera. It is final on their phone once scanned.' : 'Hold the phones together to hand it over') });
      }
      steps.push({ key: 'channel', present: channel, past: channel, done: !!delivered || qr || net || bt, idle: true, sub: net ? 'Internet on both phones' : 'No internet needed' });
      known.built = Number(e.ts) || 0;
      if (delivered) { known.received = Number(delivered.ts) || 0; known.channel = Number(delivered.ts) || 0; }
      else if (qr) known.channel = Number(e.ts) || 0;
    } else if (e.chain && e.chain.txpowid) {
      var inBlock = Number(e.chain.block) > 0;
      steps.push({ key: 'received', past: 'Received', done: true, sub: 'Checked and credited on this phone.' });
      steps.push({ key: 'onchain', present: 'Waiting for the block', past: 'On chain', done: inBlock,
        sub: inBlock ? 'Its transaction is in block ' + Number(e.chain.block).toLocaleString('en-US') + '. Final.' : 'Its transaction is on the network, on its way into a block.' });
      steps.push({ key: 'channel', past: channel, done: true, sub: 'Internet on both phones' });
      known.received = Number(e.ts) || 0;
      if (inBlock) known.onchain = Number(e.chain.at) || 0;
    } else {
      steps.push({ key: 'received', past: 'Received', done: true, sub: 'Checked and credited on this phone. Final at the tap.' });
      steps.push({ key: 'channel', past: channel, done: true, sub: via === 'network' ? 'Internet on both phones' : 'No internet needed' });
      known.received = Number(e.ts) || 0; known.channel = Number(e.ts) || 0;
    }
    return { found: true, failed: false, instantPayment: e.kind, steps: steps, knownTimes: known,
      confirmed: out ? !!delivered : !(e.chain && e.chain.txpowid && !(Number(e.chain.block) > 0)), built: true, sent: true, mined: false, onChain: false, confirmations: 0, target: 0,
      txid: !out && e.chain && Number(e.chain.block) > 0 ? String(e.chain.txpowid) : '', pendingTxnId: '', rowId: e.id, startedAt: Number(e.ts) || 0 };
  }
  /** The journal as last read (payments and moves), so a row's progress is read without an async round trip. */
  var journalCache = {};
  function remember(entry) { if (entry && entry.id) journalCache[entry.id] = entry; }
  /** The progress of the Add, Remove or payment behind an activity row id, or null when this is not one. */
  function progressById(id) {
    var key = String(id || '');
    for (var i = 0; i < chainEntries.length; i++) if (chainEntries[i].id === key) return progressOf(chainEntries[i]);
    var e = journalCache[key];
    if (e && (e.kind === 'out' || e.kind === 'in')) return progressOfPayment(e);
    return null;
  }
  /** Law 14: the time each step completed, in the shared store, stamped once when first seen done: the
   *  tracker's own steps, from progressOf, so what is stamped and what is drawn are one reading. */
  function stampSteps(e) {
    if (typeof W.stablesStepTimes !== 'function' || !e) return;
    var p = progressOf(e);
    try {
      W.stablesStepTimes([e.id], {
        built: p.built, sent: p.sent, broadcast: p.mined, mined: p.onChain, confirmed: p.confirmed
      }, e.ts);
    } catch (_) { /* a remembered timing is a convenience */ }
  }
  function appendRow(entry, how) {
    remember(entry);
    if (entry && typeof W.stablesAppendUserActivityRow === 'function') W.stablesAppendUserActivityRow(rowFor(entry, how));
  }
  /** The payer's row as it stands, for its status only (one row per payment, law 2: same id). */
  function outRow(p) {
    var id = p && p.counter != null ? P.ROW_PREFIX + 'OUT-' + p.counter : '';
    return id && typeof W.stablesGetUserActivityRowById === 'function' ? W.stablesGetUserActivityRowById(id) : null;
  }
  /** The person changed how the payment is handed over (law 29): the row says which, unless received. */
  function markWay(p, how) {
    var row = outRow(p);
    var status = outStatus(null, how);
    if (!row || row.offlineStatus === 'Received' || row.offlineStatus === 'Sent' || row.offlineStatus === 'Sending' || row.offlineStatus === 'Broadcasted' || row.offlineStatus === status || typeof W.stablesAppendUserActivityRow !== 'function') return;
    var copy = {};
    Object.keys(row).forEach(function (k) { copy[k] = row[k]; });
    copy.offlineStatus = status;
    W.stablesAppendUserActivityRow(copy);
  }
  function syncActivity() {
    return account.journal().then(function (entries) {
      entries.forEach(function (entry) {
        remember(entry);
        var have = typeof W.stablesGetUserActivityRowById === 'function' ? W.stablesGetUserActivityRowById(entry.id) : null;
        if (entry.kind === 'load' || entry.kind === 'offload') {
          // The row follows its record: re-drawn whenever the status it would show has moved.
          var row = rowForChain(entry);
          if (!have || have.offlineStatus !== row.offlineStatus || have.instantSettling !== row.instantSettling
            || have.explorerTxId !== row.explorerTxId || have.note !== row.note || have.title !== row.title || have.category !== row.category) appendRow(entry);
          stampSteps(entry);
          return;
        }
        // A confirmation recorded while the row was away (another session, a lost row) is carried in, and a
        // payment sent over the network follows its envelope (D087).
        var want = entry.kind === 'out' && (entry.delivered || entry.carrier) ? outStatus(entry)
          : (entry.kind === 'in' && (entry.chain || entry.via === 'network') ? rowFor(entry).offlineStatus : null);
        var drawn = rowFor(entry);
        if (!have || (want && have.offlineStatus !== want) || have.title !== drawn.title || have.category !== drawn.category) appendRow(entry);
      });
      forgetRetiredRow();
    });
  }
  /** The "Test credit retired" activity row an earlier build wrote (builds 103 to 107) is forgotten (law 31). */
  var retiredForgotten = false;                          // once per session: the removal persists in the list's own store
  function forgetRetiredRow() {
    if (retiredForgotten || typeof W.stablesGetUserActivityRowById !== 'function' || typeof W.stablesForgetActivityRow !== 'function') return;
    retiredForgotten = true;
    if (W.stablesGetUserActivityRowById(RETIRED_ROW)) { try { W.stablesForgetActivityRow(RETIRED_ROW); } catch (_) { /* next boot */ } }
  }

  /* ---------- the Instant payments page: ONE page, opened by the rows (build 105, law 25 as amended, D063) ----------
   * Founder 2026-09-29, after testing build 104: "We have one intermediairy windows there that we can get rid
   * of, by clicking on of the asset in instant payments we should get directly on a page where we add and
   * remove any of the token, please combine these, otherwise the UI is much better". Build 104 opened the
   * Instant payments screen (the total, Remove / Add, the rows) and, from it, the Add / Remove transfer
   * screen: two windows for one decision. They are ONE page (#instantMoveModal in index.html,
   * M-CMP-TRANSACTION in the Mint canon, where a direction choice leads the form), opened directly by a tap on
   * any Instant payments row, on that row's currency, with Add chosen:
   *   total     the account's total in its colour (the Wallet's account truth), "Ready to pay offline";
   *   direction "Remove | Add", the registered segmented control (radio semantics), Add trailing and chosen
   *             when the page opens (law 17); it turns the form below round in place and opens nothing;
   *   From->To  Savings -> Instant payments (Add) or the reverse (Remove), each account with what it holds
   *             in the chosen currency; the Instant payments account wears its colour (--am, D057);
   *   amount    the money field (half, MAX, commas, the one currency dropdown listing every currency
   *             Instant payments holds), MAX being what the FROM account holds;
   *   reason    why it cannot run, in place (law 11), including the chain's refusals before any debit;
   *   commit    one button naming the action, "Add 100 Winiwa" / "Remove 40 Winiwa", disabled while it
   *             cannot work;
   *   rows      what Instant payments holds of each currency, name and amount, "+X" while a load confirms;
   *   retired   the retired test credit, one muted line.
   * No recipient field, no address book, no account switch, no chip (law 25). The payment code follows the
   * Savings tiers exactly as builds 103 and 104 did (a prompt only when the tier asks), with no tier label.
   * Confirming lands on the Wallet (law 1) with build 103's one row and "+X" (laws 2, 19); no message
   * (law 3). The chain side (instant-chain.js) is untouched. */
  function chainAvailability() {
    if (!chain) return { ok: false, reason: CC ? UNAVAILABLE : 'Moving money to and from Savings is not available in this version.' };
    if (chainBlocked) return { ok: false, reason: chainBlocked };
    return chain.availability();
  }
  var chainBlocked = '';

  function moveOpen() { return isOpen('instantMoveModal'); }

  /** What Savings holds of a currency, as the Savings Send reads it (its spendable figure), or null
   *  while the Savings balance is not yet proven and shows nothing (law 5: unknown is not zero). */
  function savingsShows(code) {
    try {
      if (typeof W.getVaultBalance !== 'function') return null;
      var v = Number(W.getVaultBalance(code));
      if (!Number.isFinite(v)) return null;
      var proven = typeof W.stablesWalletProofDisplayState !== 'function' || W.stablesWalletProofDisplayState() === 'ready';
      return (proven || v > 0) ? v : null;
    } catch (_) { return null; }
  }
  /** The same figure in atoms, through the Savings Send's own MAX rule (vaultBalanceToMaxInputString). */
  function savingsAtoms(code) {
    var v = savingsShows(code);
    if (v == null) return null;
    if (!(v > 0)) return BigInt(0);
    var text = typeof W.vaultBalanceToMaxInputString === 'function' ? W.vaultBalanceToMaxInputString(code, v) : String(v);
    try { return P.parseAmount(text); } catch (_) { return BigInt(0); }
  }
  /**
   * A Savings figure as the Savings Send's "Available" shows it (index.html fmtAvailVaultQty): cut, never
   * rounded up, to the hundredth, so the screen never shows more than can move. MAX still fills the exact
   * spendable figure, as the Savings Send's MAX does.
   */
  function savingsFigure(atoms) {
    if (atoms == null) return null;
    var cent = BigInt(1000000);                        // 0.01 in atoms (eight decimals)
    return atoms - (atoms % cent);
  }
  /** An amount as a person typed it: grouped, no forced decimals ("Add 100 Winiwa", "Add 1,000.5 Winiwa"). */
  function plainAmount(atoms) {
    var parts = P.atomsToDecimal(atoms).split('.');
    return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (parts[1] ? '.' + parts[1] : '');
  }
  /* ---------- the Savings address a move uses (D103, build 0.0.12.044) ----------
   * Founder 2026-10-05: "when we bring back onchain from the card and even in the other side, we should be able to
   * specify the wallet address to use, ... presenting the balance and utxo count per address and letting the user pick
   * one". Add takes its coins from the picked address only (its change comes back there); Remove pays the picked
   * address (a first move to an address registers it, one short "Preparing" step, because the frozen registration pays
   * only the address it records). Remembered per direction; "Stables chooses" (Add) and the main address (Remove) when
   * none is picked or the picked one no longer appears. */
  /* Kept in the card's own store (the chain info record), like everything else the card remembers; never browser storage. */
  var moveAddr = { add: '', remove: '' }, moveAddrLoaded = false;
  var addrCache = { token: '', list: [], registered: [], payout: '' };
  function loadMoveAddr() {
    if (moveAddrLoaded || !account || typeof account.chainInfo !== 'function') return Promise.resolve();
    return account.chainInfo().then(function (info) {
      var v = (info && info.addressPick) || {};
      moveAddr = { add: String(v.add || ''), remove: String(v.remove || '') };
      moveAddrLoaded = true;
    }, function () { /* the defaults stand */ });
  }
  function saveMoveAddr() {
    if (!account || typeof account.setChainInfo !== 'function') return;
    account.setChainInfo({ addressPick: { add: moveAddr.add, remove: moveAddr.remove } }).catch(function () { /* this session keeps it */ });
  }
  function shortAddr(a) {
    if (!a) return '';
    var mx = String(a.mx || '');
    var id = mx && /^Mx/i.test(mx) ? mx : String(a.address || a);
    return id.length > 14 ? id.slice(0, 8) + '…' + id.slice(-5) : id;
  }
  function addrEntry(address) {
    var a = String(address || '').toLowerCase();
    for (var i = 0; i < addrCache.list.length; i++) if (addrCache.list[i].address === a) return addrCache.list[i];
    return null;
  }
  function pickedAddress(dir) { return dir === 'remove' ? moveAddr.remove : moveAddr.add; }
  function drawAddrRow(s) {
    var btn = el('instantMoveAddrBtn');
    if (!btn) return;
    var dir = s ? s.dir : (move.dir === 'remove' ? 'remove' : 'add');
    var picked = pickedAddress(dir);
    var e = picked ? addrEntry(picked) : null;
    var name;
    if (dir === 'add') name = picked ? (e ? shortAddr(e) : shortAddr({ address: picked })) : 'Stables chooses';
    else name = picked ? (e ? shortAddr(e) : shortAddr({ address: picked })) : 'My main address';
    setText('instantMoveAddrName', name);
  }
  function addrNode() { return W.__STABLES_INSTANT_NODE__ || null; }
  /* Build 0.0.12.048 (founder 2026-10-05: "the address picker should be better presented, now we don't get it and in there
     we should be able to scroll our 64 addresses"). A pop-up of its own over the card page: what is being chosen and
     why, then every address in a scrolling list (Remove: all the wallet's addresses; Add: those holding the currency),
     each with its short id, a tag (main, fresh, used before) and its balance and notes. A tap outside closes it. */
  function toggleAddresses() {
    var modal = el('cardAddrModal'), list = el('instantMoveAddrList'), btn = el('instantMoveAddrBtn');
    if (!modal || !list) return;
    var cur = pickerCurrency(MOVE_CCY);
    var n = addrNode();
    if (!cur || !n || typeof n.addresses !== 'function') return;
    var dir = move.dir === 'remove' ? 'remove' : 'add';
    setText('cardAddrTitle', dir === 'add' ? 'Take from which Savings address?' : 'Send to which Savings address?');
    setText('cardAddrNote', dir === 'add'
      ? 'The ' + cur.label + ' comes from this address only, and its change goes back to it.'
      : 'The ' + cur.label + ' arrives at this address. The first move to a new address takes one short preparing step.');
    modal.classList.add('open');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    list.innerHTML = '<div class="xs mu card-addr-list__wait">Reading your Savings addresses…</div>';
    var token = '0x' + cur.tokenId;
    Promise.all([n.addresses(token), chain && typeof chain.registeredPayouts === 'function' ? chain.registeredPayouts(token) : Promise.resolve({ registered: [], payout: '' })])
      .then(function (r) {
        addrCache = { token: cur.tokenId, list: r[0] || [], registered: (r[1] && r[1].registered) || [], payout: (r[1] && r[1].payout) || '' };
        renderAddresses(cur);
        drawMove();
        // Then, a moment later: fresh or used before, and (Remove) every other address of the wallet.
        if (typeof n.addressUsage === 'function') n.addressUsage(addrCache.list, dir === 'remove').then(function (marked) {
          if (addrCache.token !== cur.tokenId || !marked) return;
          addrCache.list = marked;
          if (modal.classList.contains('open')) renderAddresses(cur);
        }, function () { /* stays unmarked */ });
      }, function (e) {
        list.innerHTML = '<div class="xs ui-tone-danger card-addr-list__wait">Your Savings addresses could not be read. ' + esc((e && e.message) || '') + '</div>';
      });
  }
  function closeAddresses() {
    var modal = el('cardAddrModal'), btn = el('instantMoveAddrBtn');
    if (modal) modal.classList.remove('open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function renderAddresses(cur) {
    var list = el('instantMoveAddrList');
    if (!list) return;
    var dir = move.dir === 'remove' ? 'remove' : 'add';
    var picked = pickedAddress(dir);
    var rows = [];
    var opt = function (value, title, tags, sub, on) {
      return '<button type="button" role="option" aria-selected="' + (on ? 'true' : 'false') + '" class="card-addr-opt mx-action' + (on ? ' card-addr-opt--on' : '') + '"'
        + ' data-addr="' + esc(value) + '" onclick="stablesInstantPickAddress(this.getAttribute(\'data-addr\'))">'
        + '<span class="card-addr-opt__title">' + esc(sub) + '</span>'
        + '<span class="card-addr-opt__top"><span class="card-addr-opt__sub xs mu">' + esc(title) + '</span>'
        + tags.map(function (t) { return '<span class="card-addr-tag card-addr-tag--' + t[0] + '">' + esc(t[1]) + '</span>'; }).join('') + '</span></button>';
    };
    if (dir === 'add') rows.push(opt('', 'Notes from any of your addresses', [], 'Stables chooses', !picked));
    var count = 0;
    addrCache.list.forEach(function (a) {
      if (dir === 'add' && !(a.amount > 0)) return;
      count++;
      var amount = Number(a.amount || 0).toLocaleString('en-US', { maximumFractionDigits: 8 });
      /* Build 0.0.12.050 (founder: "the user should know directly if this address has a balance and it should be labelled one or
         the other, used or never used"): the balance is the first thing on the row, then the address, tagged Used or Never used. */
      var sub = a.notes > 0 ? amount + ' ' + cur.label + ' · ' + a.notes + (a.notes === 1 ? ' note' : ' notes') : 'Empty';
      var tags = [];
      var isMain = a.address === addrCache.payout || (!addrCache.payout && a.main);
      if (dir === 'remove' && isMain) tags.push(['main', 'main']);
      if (a.used === true) tags.push(['used', 'Used']);
      else if (a.used === false) tags.push(['fresh', 'Never used']);
      var on = dir === 'remove' ? (picked ? picked === a.address : isMain) : picked === a.address;
      rows.push(opt(a.address, shortAddr(a), tags, sub, on));
    });
    list.innerHTML = rows.join('') || '<div class="xs mu card-addr-list__wait">No Savings address holds ' + esc(cur.label) + '.</div>';
    var reading = !!(W.stablesAddressUsage && typeof W.stablesAddressUsage.complete === 'function' && !W.stablesAddressUsage.complete());
    setText('cardAddrCount', (count ? count + (count === 1 ? ' address' : ' addresses') : '') + (reading ? (count ? ' · ' : '') + 'history still being read' : ''));
  }
  function pickAddress(value) {
    var dir = move.dir === 'remove' ? 'remove' : 'add';
    var v = String(value || '').toLowerCase();
    if (dir === 'remove' && v && v === addrCache.payout) v = '';     // the main address is the default
    if (dir === 'remove') moveAddr.remove = v; else moveAddr.add = v;
    saveMoveAddr();
    log('card address for ' + dir + ': ' + (v || (dir === 'add' ? 'Stables chooses' : 'main')));
    closeAddresses();
    move.reason = '';
    drawMove();
  }
  /** A picked Add address that no longer holds the currency falls back to "Stables chooses". */
  function addFromAtoms(cur) {
    if (!moveAddr.add || addrCache.token !== cur.tokenId) return null;
    var e = addrEntry(moveAddr.add);
    if (!e) return null;
    try { return P.parseAmount(String(e.amount)); } catch (_) { return null; }
  }
  function moveNames(dir) {
    return dir === 'remove' ? { from: INSTANT, to: SAVINGS } : { from: SAVINGS, to: INSTANT };
  }

  /**
   * Everything the form shows, decided in one place: the two accounts' figures, the amount, and the one
   * reason it cannot run (law 11), or none. An amount still being typed ("0.", "") is not a mistake: the
   * commit just waits for it.
   */
  function moveState() {
    var dir = move.dir === 'remove' ? 'remove' : 'add';
    var names = moveNames(dir);
    var cur = pickerCurrency(MOVE_CCY);
    var s = { dir: dir, names: names, cur: cur, from: null, to: null, fromShown: null, toShown: null, atoms: null, reason: '', ok: false };
    if (!ready()) { s.reason = state.status === 'unavailable' ? UNAVAILABLE : ''; return s; }
    if (!cur) { s.reason = messageOf(P.InstantError('asset')); return s; }
    var inst = balanceOf(cur.tokenId);
    var sav = savingsAtoms(cur.code);
    s.from = dir === 'add' ? sav : inst;
    s.to = dir === 'add' ? inst : sav;
    // What each side SHOWS (a Savings figure cut to the hundredth, as the Savings Send shows it).
    s.fromShown = dir === 'add' ? savingsFigure(sav) : inst;
    var fromAddr = dir === 'add' ? addFromAtoms(cur) : null;          // D103: the picked Savings address
    if (fromAddr != null) { s.from = fromAddr; s.fromShown = savingsFigure(fromAddr); }
    s.toShown = dir === 'add' ? inst : savingsFigure(sav);
    try { s.atoms = P.parseAmount(((el('instantMoveAmt') || {}).value) || ''); } catch (_) { s.atoms = null; }
    var avail = chainAvailability();
    if (!avail.ok) { s.reason = avail.reason; return s; }
    if (s.from != null && s.from <= BigInt(0)) { s.reason = names.from + ' holds no ' + cur.label + '.'; return s; }
    if (s.atoms != null && s.from != null && s.atoms > s.from) {
      s.reason = names.from + ' holds ' + money(s.fromShown, cur) + '. This is ' + money(s.atoms, cur) + '.';
      return s;
    }
    s.reason = move.reason;                            // what the chain said about the last press, until the next change
    s.ok = s.atoms != null && !move.busy && !move.reason;
    return s;
  }

  /** Draw the form from moveState(): the direction, From -> To, the reason, the commit. */
  function drawMove() {
    var s = moveState();
    var verb = s.dir === 'remove' ? 'Remove' : 'Add';
    // The direction choice shows which way the form runs: the segmented control's selected state, exposed
    // as a checked radio (M-EL-SEGMENTED-CONTROL: not colour alone), the chosen one the one Tab reaches.
    [['instantDirRemove', 'remove'], ['instantDirAdd', 'add']].forEach(function (pair) {
      var b = el(pair[0]);
      if (!b) return;
      var on = s.dir === pair[1];
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    var modal = el('instantMoveModal');
    if (modal) modal.setAttribute('data-instant-move', s.dir);
    setText('instantMoveFromName', s.names.from);
    setText('instantMoveToName', s.names.to);
    drawAddrRow(s);
    var figure = function (atoms) { return atoms == null || !s.cur ? '—' : money(atoms, s.cur); };
    setText('instantMoveFromAmt', figure(s.fromShown));
    setText('instantMoveToAmt', figure(s.toShown));
    // The Instant payments account wears its colour on whichever side it is (D057, D062).
    var from = el('instantMoveFrom'), to = el('instantMoveTo');
    if (from) { if (s.dir === 'remove') from.setAttribute('data-payment-account', 'instant'); else from.removeAttribute('data-payment-account'); }
    if (to) { if (s.dir === 'add') to.setAttribute('data-payment-account', 'instant'); else to.removeAttribute('data-payment-account'); }
    setLine('instantMoveReason', s.reason);
    var btn = el('instantMoveConfirmBtn');
    if (btn) {
      btn.textContent = verb + (s.atoms != null && s.cur ? ' ' + plainAmount(s.atoms) + ' ' + s.cur.label : '');
      btn.disabled = !s.ok;
    }
    // A MiniDapp asks the person to approve each move in Minima (D061 gap 6): said once, under the commit.
    var avail = chainAvailability();
    setLine('instantMoveNote', ready() && avail.ok && avail.approvals ? 'Minima asks you to approve each move.' : '');
    syncPicker(MOVE_CCY);
    return s;
  }

  /**
   * A tap on an Instant payments row on the Wallet (or on the Wallet's first-paint row): the page itself,
   * directly, on that row's currency (the main currency when the tap names none), with Add chosen (law 17)
   * and an empty amount. The page opens whatever the account's state: a device that cannot hold it, or a
   * balance still loading, is said on the page, never by keeping the page shut (laws 4, 5).
   */
  function openActions(code) {
    var modal = el('instantMoveModal');
    if (!modal) return;
    try { if (typeof W.vaultCcyDdCloseAll === 'function') W.vaultCcyDdCloseAll(); } catch (_) { /* no list open */ }
    move.dir = 'add';
    move.busy = false;
    move.reason = '';
    var amt = el('instantMoveAmt');
    if (amt) amt.value = '';
    setPicker(MOVE_CCY, currencyForCode(code) || fundedCurrency(defaultCurrency(), savingsHolds));
    modal.classList.add('open');
    var panel = modal.querySelector('.modal');
    if (panel) panel.scrollTop = 0;
    closeAddresses();
    loadMoveAddr().then(function () {
      if (moveOpen()) drawMove();
      // A remembered address is named the way the list names it (its Mx form): read the list quietly once.
      var cur = pickerCurrency(MOVE_CCY), n = addrNode();
      if ((moveAddr.add || moveAddr.remove) && cur && n && typeof n.addresses === 'function' && addrCache.token !== cur.tokenId) {
        n.addresses('0x' + cur.tokenId).then(function (list) {
          if (addrCache.token && addrCache.token !== cur.tokenId) return;
          addrCache = { token: cur.tokenId, list: list || [], registered: addrCache.registered || [], payout: addrCache.payout || '' };
          if (moveOpen()) drawMove();
        }, function () { /* the short 0x form stays */ });
      }
    });
    render();
    try { if (W.StablesPaymentSecurity && typeof W.StablesPaymentSecurity.renderCardLevels === 'function') W.StablesPaymentSecurity.renderCardLevels(); } catch (_) { /* the levels stay as drawn */ }
  }
  /** "Remove | Add": the direction of the form, turned round in place. The amount and the currency stay;
   *  an earlier refusal is forgotten (it was about the other direction). A press in flight keeps its way. */
  function setDirection(dir) {
    if (move.busy) return;
    move.dir = dir === 'remove' ? 'remove' : 'add';
    move.reason = '';
    // The side that pays changed: the menu follows to a currency it holds (a funded default).
    var was = pickerCurrency(MOVE_CCY), now = fundedCurrency(was, move.dir === 'remove' ? cardHolds : savingsHolds);
    if (now && (!was || now.tokenId !== was.tokenId)) setPicker(MOVE_CCY, now);
    closeAddresses();
    try { if (typeof W.vaultCcyDdCloseAll === 'function') W.vaultCcyDdCloseAll(); } catch (_) { /* no list open */ }
    drawMove();
  }
  /** Arrow keys, Home and End move the choice (M-EL-SEGMENTED-CONTROL keyboard contract), as the account
   *  choice in Send and Receive does (index.html stablesPaymentAccountKey). */
  function directionKey(event) {
    var keys = { ArrowLeft: 'remove', ArrowUp: 'remove', Home: 'remove', ArrowRight: 'add', ArrowDown: 'add', End: 'add' };
    var dir = event && keys[event.key];
    if (!dir) return;
    event.preventDefault();
    setDirection(dir);
    var b = el(dir === 'remove' ? 'instantDirRemove' : 'instantDirAdd');
    if (b && typeof b.focus === 'function') b.focus();
  }
  /** Back, or a tap outside: the page closes onto the Wallet it was opened from. Nothing sits between. */
  function closeMove() {
    var modal = el('instantMoveModal');
    if (modal) modal.classList.remove('open');
    try { if (typeof W.vaultCcyDdCloseAll === 'function') W.vaultCcyDdCloseAll(); } catch (_) { /* no list open */ }
    move.busy = false;
    move.reason = '';
    var amt = el('instantMoveAmt');
    if (amt) amt.value = '';
  }

  /** The amount or the currency changed: the page follows, and an earlier refusal is forgotten. */
  function moveInput() {
    move.reason = '';
    drawMove();
  }
  /** MAX: everything the FROM account holds of the chosen currency (Savings through its own MAX rule). */
  function moveMax() {
    var input = el('instantMoveAmt');
    var s = moveState();
    if (!input || !s.cur || s.from == null) return;
    input.value = s.from > BigInt(0) ? P.atomsToDecimal(s.from) : '';
    try { if (typeof W.stablesFormatFinancialAmountInput === 'function') W.stablesFormatFinancialAmountInput(input); } catch (_) { /* ignore */ }
    moveInput();
  }

  /**
   * The commit: the load or the move to Savings runs exactly as build 103 ran it. No payment code and no fingerprint
   * (founder 2026-10-04, build 0.0.12.029): "moving from savings to instant payment should not trigger the safety sets
   * as finger scan or security code, everything that is within the user's account, swap between currency, minting,
   * burning and so on should not be subject to security steps, only external sending should be". The money never
   * leaves the person's own two accounts.
   */
  function confirmMove() {
    if (move.busy) return;
    var s = drawMove();
    if (!s.ok) return;
    if (s.dir === 'add') startLoad(s.atoms, s.cur); else startOffload(s.atoms, s.cur);
  }

  /** Add: the record and its row first, then the Wallet, then the chain (instant-chain.js, build 103). */
  function startLoad(atoms, cur) {
    var lid = P.newPaymentId();
    move.busy = true;
    drawMove();
    account.recordLoad({ lid: lid, amount: atoms, tokenId: cur.tokenId }).then(function (entry) {
      chainChanged(entry);
      closeMove();
      if (typeof W.navigate === 'function') W.navigate('wallet');   // law 1; the row is the feedback (law 3)
      return chain.load({ lid: lid, tokenId: '0x' + cur.tokenId, atoms: atoms, label: cur.label, from: moveAddr.add || undefined });
    }).then(function () {
      // Posted: the Savings figure drops as for any send; the amount waits beside the Instant figure.
      try { if (typeof W.stablesApplySavingsSpend === 'function') W.stablesApplySavingsSpend(cur.code, Number(P.atomsToDecimal(atoms)), cur.label); } catch (_) { /* node truth follows */ }
      return reloadChain();
    }).then(function () { follow(false); }).catch(function (e) {
      log('load not sent: ' + (e && (e.code || e.message)));
      move.busy = false;
      // Refused before anything was recorded: the screen is still open and says so, in place.
      if (moveOpen()) { move.reason = messageOf(e); drawMove(); }
      reloadChain().then(function () { follow(false); });
    });
  }

  /** A refusal of a move to Savings, in plain words, with what can move when the vault is short. */
  function offloadMessage(e, cur) {
    if (e && e.code === 'vault-short' && e.available != null) {
      return 'Stables card cannot move this much to Savings right now. ' + money(BigInt(e.available), cur) + ' can move.';
    }
    if (e && e.code === 'insufficient' && e.balance != null) {
      return 'Your Stables card holds ' + money(BigInt(e.balance), cur) + '. This is ' + money(BigInt(e.amount), cur) + '.';
    }
    return (e && e.message) || 'Something went wrong. Nothing was moved.';
  }

  /**
   * Remove: a MOVE TO SAVINGS. The refusals that need no debit come first, in place on the transfer
   * screen (law 11): the balance (moveState already), a registration this node cannot see, what the
   * vault can pay (offloadPreflight). Then the DEBIT (one durable commit, design section 4.1), the row,
   * the Wallet, and the build. Build 103's order, unchanged.
   */
  function startOffload(atoms, cur) {
    if (move.busy) return;
    move.busy = true;
    drawMove();
    var payoutPick = moveAddr.remove || undefined;     // D103: the Savings address this move pays (the main one when none)
    chain.offloadPreflight({ tokenId: '0x' + cur.tokenId, atoms: atoms, payout: payoutPick }).then(function () {
      var wid = P.newPaymentId();
      return account.beginOffload({ wid: wid, amount: atoms, tokenId: cur.tokenId }).then(function (r) {
        chainChanged(r.entry);
        closeMove();
        if (typeof W.navigate === 'function') W.navigate('wallet');   // law 1; the row is the feedback (law 3)
        refresh().catch(function () {});
        chain.offload({ wid: wid, tokenId: '0x' + cur.tokenId, atoms: atoms, label: cur.label, payout: payoutPick }).then(function () {
          return reloadChain();
        }, function (e) {
          log('move to Savings not sent: ' + (e && (e.code || e.message)));
          return reloadChain().then(function () { return refresh(); });
        }).then(function () { follow(false); });
      });
    }).catch(function (e) {
      move.busy = false;
      move.reason = offloadMessage(e, cur);
      drawMove();
    });
  }

  /* ---------- following the chain (build 103) ---------- */
  /** A load or move record moved: its row, its step times, the "+X", the Wallet total. */
  function chainChanged(entry) {
    if (!entry || (entry.kind !== 'load' && entry.kind !== 'offload')) return;
    var i = chainEntries.findIndex(function (e) { return e.id === entry.id; });
    if (i >= 0) chainEntries[i] = entry; else chainEntries.push(entry);
    appendRow(entry);
    stampSteps(entry);
    if (entry.status === 'credited' || entry.status === 'restored') refresh().catch(function () {});
    render();
    redrawTotal();
  }
  function reloadChain() {
    if (!account) return Promise.resolve();
    return account.entries().then(function (all) {
      chainEntries = all.filter(function (e) { return e.kind === 'load' || e.kind === 'offload'; });
      render();
      redrawTotal();
      return syncActivity();
    });
  }
  /**
   * The follow loop: advance every open record against the chain (credit loads at three
   * confirmations, finish moves to Savings). It runs only while something is open, and only while
   * the app is visible (stablesRepeatWhileVisible, the battery law); the first pass after the node
   * connects also tracks both covenants and scans the vault for loads made for this account.
   */
  /*
   * Build 0.0.12.017 (INSTANT-EDGE-01): a request to follow that lands WHILE a pass is running is no longer
   * lost. Found on the lab: an Add pressed while the app's first pass after a restart was still running
   * (a slow node) asked to follow, the busy pass ignored it, then finished with nothing open, because it
   * had read the records before the Add existed, and stopped the loop. The Add was mined and never credited
   * until the app was reopened. `again` remembers the request; the pass then runs once more and the loop
   * stops only when a pass that started after the last request finds nothing open. A pass that has not
   * finished after TICK_STALL_MS (a node call that never answered) no longer blocks every later one.
   */
  var followTimer = null, ticking = false, firstPass = true, again = false, tickStarted = 0;
  var TICK_STALL_MS = 3 * 60 * 1000;
  function follow(scan) {
    if (!chain) return;
    if (scan) firstPass = true;
    again = true;
    tick();
    if (!followTimer && typeof W.stablesRepeatWhileVisible === 'function') followTimer = W.stablesRepeatWhileVisible('instant-chain', tick, 15000);
  }
  function tick() {
    if (!chain) return;
    if (ticking && Date.now() - tickStarted < TICK_STALL_MS) return;
    if (ticking) log('follow: the previous pass has not finished in ' + Math.round(TICK_STALL_MS / 60000) + ' minutes; starting another');
    if (!chain.availability().ok) return;              // no node yet: the next tick tries again
    ticking = true;
    tickStarted = Date.now();
    again = false;
    var scan = firstPass;
    var track = scan ? chain.ensureTracked().catch(function (e) {
      if (e && e.code === 'phantom') chainBlocked = e.message;
      log('tracking: ' + (e && (e.code || e.message)));
    }) : Promise.resolve();
    track.then(function () { return chain.advance({ scan: scan }); }).then(function (open) {
      return advanceCarriers().then(function (c) { return open || c; }, function () { return open; });
    }).then(function (open) {
      firstPass = false;
      ticking = false;
      // Stop only when nothing is open AND nobody asked to follow while this pass ran.
      if (!open && !again && followTimer && typeof W.stablesStopRepeat === 'function') { W.stablesStopRepeat(followTimer); followTimer = null; }
      return reloadChain();
    }).then(function () {
      if (again) tick();                                 // a request made during the pass: one more pass now
    }).catch(function (e) {
      ticking = false;
      log('follow: ' + (e && (e.code || e.message)));
    });
  }

  /**
   * Every app helps keep the shared pool usable (build 0.0.12.039; founder: "if the pool for the Stables cards is fully
   * autonomous couldn't we face the same issue ... won't be able to cash out because too many UTXO?"). No server: while
   * the app is visible and idle, about every ten minutes (with a random skip, so phones do not all merge at once), one
   * merge of small pool coins per currency when the pool holds many (instant-chain.js tidyVault). Never while this app
   * moves money or has Send, Receive or the card's window open.
   */
  var tidyTimer = null, tidying = false;
  var TIDY_EVERY_MS = 10 * 60 * 1000;
  function startPoolTidy() {
    if (tidyTimer || !chain || typeof W.stablesRepeatWhileVisible !== 'function') return;
    tidyTimer = W.stablesRepeatWhileVisible('instant-pool-tidy', poolTidyTick, TIDY_EVERY_MS);
  }
  function poolTidyTick() {
    if (!chain || tidying || ticking || Math.random() < 0.5) return;
    if (!chain.availability().ok || chain.busy().length) return;
    if (isOpen('sendModal') || isOpen('recvModal') || isOpen('instantMoveModal')) return;
    tidying = true;
    var list = currencyList.slice();
    (function next(i) {
      if (i >= list.length) { tidying = false; return; }
      chain.tidyVault(list[i].tokenId).then(function (r) {
        if (r && r.merged) log('pool tidy: ' + r.merged + ' ' + list[i].label + ' coins merged');
      }, function (e) { log('pool tidy: ' + (e && (e.code || e.message))); }).then(function () { next(i + 1); });
    })(0);
  }

  /** Test hook (lab proofs): one tidy pass now, every currency, without the random skip; resolves the results. */
  W.__STABLES_TEST_POOL_TIDY__ = function () {
    if (!chain) return Promise.resolve(null);
    return Promise.all(currencyList.map(function (c) { return chain.tidyVault(c.tokenId).then(function (r) { return { label: c.label, result: r }; }, function (e) { return { label: c.label, error: e && (e.code || e.message) }; }); }));
  };

  /* ---------- the one scanner, moved into whichever Instant flow needs it ---------- */
  function mountScanner(slotId, mode, start) {
    var strip = el('sendCamStrip');
    var slot = el(slotId);
    if (!strip || !slot) return;
    if (!scan.home) { scan.home = strip.parentNode; scan.next = strip.nextSibling; }
    if (strip.parentNode !== slot) slot.appendChild(strip);
    scan.mode = mode;
    strip.style.display = '';
    if (start === false) return;
    try {
      if (W.__STABLES_SEND_CAM_ACTIVE && typeof W.stablesStopSendCam === 'function') W.stablesStopSendCam(false);
      if (typeof W.stablesStartSendCam === 'function') W.stablesStartSendCam();
    } catch (_) { /* the photo path stays */ }
  }
  /**
   * The scanner stays in place with its camera OFF and the Camera control offered. Used after a
   * refusal: restarting the camera straight away would read the same code again, over and over,
   * while it is still in front of the lens.
   */
  function parkScanner(slotId, mode) {
    mountScanner(slotId, mode, false);
    try { if (typeof W.stablesStopSendCam === 'function') W.stablesStopSendCam(true); } catch (_) { /* ignore */ }
  }
  function unmountScanner() {
    var strip = el('sendCamStrip');
    if (scan.mode) { try { if (typeof W.stablesStopSendCam === 'function') W.stablesStopSendCam(false); } catch (_) { /* ignore */ } }
    scan.mode = null;
    if (strip && scan.home && strip.parentNode !== scan.home) {
      scan.home.insertBefore(strip, scan.next && scan.next.parentNode === scan.home ? scan.next : null);
    }
  }
  /** After a good scan the strip steps aside exactly as it does in the Savings Send. */
  function stowScanner() {
    try { if (typeof W.stablesStopSendCam === 'function') W.stablesStopSendCam(false); } catch (_) { /* ignore */ }
    var strip = el('sendCamStrip');
    if (strip) strip.style.display = 'none';
  }

  /* ---------- QR codes: the Savings Receive code's renderer settings, in the same frame ---------- */
  /**
   * The code is drawn to fit INSIDE its frame (build 0.0.12.011, INSTANT-ABC-01-R1). The frame is 232 px wide
   * with 14 px of padding and clips what overflows; a 248 px code lost about 8 px on every side, the outer
   * ring of its finder squares included, and the app's own scanner could not read the receiver code or the
   * payment from the screen (only the enlarged view could). The size comes from the frame as laid out, so a
   * narrower screen gets a smaller code, never a clipped one.
   */
  function qrSizeFor(host) {
    var room = 0;
    try {
      var cs = W.getComputedStyle ? W.getComputedStyle(host) : null;
      var pad = cs ? (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) : 0;
      room = Math.floor(host.clientWidth - pad - 4);   // 4: the wrapper's 2 px padding on each side
    } catch (_) { room = 0; }
    if (!(room >= 120)) room = QR_FIT;                  // not laid out yet (a hidden sheet): the frame's own figure
    return Math.min(QR_SIZE, room);
  }
  function renderQr(hostId, text, emptyText) {
    var host = el(hostId);
    if (!host) return;
    host.classList.remove('recv-qr-host--ready');
    host.replaceChildren();
    if (!text) { host.textContent = emptyText || ''; return; }
    if (typeof W.QRCode !== 'function') { host.textContent = 'QR library not loaded.'; return; }
    try {
      var inner = D.createElement('div');
      inner.style.cssText = 'display:inline-block;line-height:0;padding:2px';
      host.appendChild(inner);
      // Black on white, level L: the Savings Receive code's settings, for a camera reading a screen.
      var size = qrSizeFor(host);
      /* Drawn in SCREEN pixels, so it fills its frame (founder 2026-10-04, build 0.0.12.020: "the QR code are
         smaller than the place reserved for them and are difficult to scan. make them as they were using the
         whole space"). qrcode.js draws whole pixels per module; counted in CSS pixels that left a 2-px grid of
         138 px in a 198-px frame. Counted in the phone's own pixels (devicePixelRatio, 2.625 on a Pixel 7) the
         grid is 7 screen pixels a module and the code about 184 px wide, still with every module the same size. */
      var dpr = Math.max(1, Math.min(4, Number(W.devicePixelRatio) || 1));
      var dev = Math.floor(size * dpr);
      // quiet: 1 module of white inside the canvas, not the library's 4. The frame is white with 14 px of padding
      // and the wrapper adds 2, so the scanner still gets more than the 4-module quiet zone it needs, and the
      // black code itself takes the space.
      new W.QRCode(inner, { text: text, width: dev, height: dev, quiet: 1, colorDark: '#000000', colorLight: '#ffffff',
        correctLevel: W.QRCode.CorrectLevel ? W.QRCode.CorrectLevel.L : 1 });
      // Whole pixels per module. qrcode.js draws its bitmap at the largest whole number of pixels per module that
      // fits the width it is given (quiet zone included), then stretches it with pixelated scaling: at 198 px a 2 px
      // grid became modules of 2 and 3 px, which the scanner rejects. Shown at its own size in screen pixels, the
      // grid stays even.
      var cv = inner.querySelector('canvas');
      if (cv && cv.width > 0 && cv.width <= dev) { cv.style.width = (cv.width / dpr) + 'px'; cv.style.height = (cv.height / dpr) + 'px'; }
      host.classList.add('recv-qr-host--ready');
    } catch (e) {
      host.replaceChildren();
      host.textContent = 'Could not build the QR code.';
    }
  }
  function enlarge(which) {
    var text = which === 'pay' ? (pay.showing && pay.showing.text) : recv.code;
    if (!text || typeof W.stablesOpenReceiveQrBig !== 'function') return;
    W.stablesOpenReceiveQrBig(text);
  }

  /* ---------- by tap or by QR code: an explicit choice (founder laws 28 and 29, build 114, Machinery D072) ----------
   * Law 29: "the NFC or QR code reading options should be made clear and when the qr code is scanned
   * nothing related to the NFC should be displayed on both phones." Both sheets carry ONE choice, "By tap
   * (NFC)" or "By QR code" (the registered segmented control), where the phone has NFC; where it has
   * none, QR is the only way and nothing about NFC is drawn. The chosen way is the whole screen:
   *   by tap:  no camera, no receiver-code field, no QR, no "Scan payment"; the status banner says what
   *            to do ("Hold the phones together ..."), and the phone's NFC side is live;
   *   by QR:   the camera, the codes and their text; no banner, and the phone's NFC side is OFF (the
   *            receiver answers no tap, the payer's reader rests), so a tap cannot cut across it.
   * Law 28: every line shown while a payment is in flight says what to do next, never what has not
   * happened. One preference for Send and Receive, kept on the device.
   */
  /* THE STABLES CARD PAYS BY TAP ONLY (founder 2026-10-04, build 0.0.12.030, Machinery D093): "redesign Instant payments
     as a virtual Stables card, for instant payment NFC only and QR plus Bluetooth for payments from savings". The card is
     the stage-1 software chip; in production the balance lives on a chip (SIM or card) that pays by NFC. So there is no
     "By QR code" way any more: the choice is hidden and the way is always the tap. A device without NFC (the web preview,
     the MiniDapp, the Core companion) says so plainly and cannot pay or receive with the card; Add and Remove still work. */
  /* PAYING AT A DISTANCE (founder 2026-10-06, build 0.0.12.062; Machinery D123): "we will need the QR code function for
     the Stables Card to pay from distance". The tap stays first. "Pay with a code" and "Share a payment request" open the
     code way for that opening of the sheet: Get paid makes a SIGNED request (name, reference, one-time id, 24 hours; see
     instant-protocol.js requestMessage), Pay reads one scanned, pasted or opened from a stables: link, checks it (not
     changed, not expired, not paid before), says who signed it (paid before, first payment, or a known name under a
     different key), never pays without Confirm send (D122), refuses above the distance cap, and sends the payment over
     the Minima network (the D087 envelope), app to app with no server. A device without NFC opens on the code way. */
  var far = false;
  var REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
  function wayNow() {
    if (state.status === 'unavailable') return 'qr';
    return far ? 'qr' : 'nfc';
  }
  /** A payment made the code way keeps that way after the sheet closes (commit closes Send before the hand-over). */
  function notByTap(code) { return wayNow() !== 'nfc' || !!(code && code.far); }
  function setFar(on) {
    if (pay.committing || tap.session) return;
    far = !!on;
    if (sheetShows('sendModal')) {
      resetForm();
      formView();
      render();
      renderWho(null);
      if (far) mountScanner('instantPayScanSlot', 'pay', true);
      else if (scan.mode === 'pay') unmountScanner();
    }
    if (sheetShows('recvModal')) {
      recvError('');
      render();
      drawReceiverCode();
    }
    syncNfc();
  }
  /** A stables: link carries the whole code (app to app; no website reads it). Anything else is returned as it came. */
  function fromLink(raw) {
    var s = String(raw == null ? '' : raw).trim();
    var m = /^stables:(?:\/\/)?pay\?c=([A-Za-z0-9_-]+)$/i.exec(s);
    if (!m || !P || typeof P.b64uToText !== 'function') return s;
    var text = P.b64uToText(m[1]);
    return text || s;
  }
  function linkOf(text) { return 'stables:pay?c=' + P.textToB64u(text); }
  /** The person's own name for a request they share: the shell keeps it (the Instant files keep no preferences). */
  function myName() {
    try { return typeof W.stablesMyDisplayName === 'function' ? String(W.stablesMyDisplayName() || '').trim() : ''; } catch (_) { return ''; }
  }
  /** The cap on one payment made by code, in the main currency (the card's one-touch day level, 200 by default). */
  function distanceCap() {
    var ps = W.StablesPaymentSecurity;
    return ps && typeof ps.cardDistanceCap === 'function' ? ps.cardDistanceCap() : null;   // the figure lives in payment-security.js
  }
  function distanceCapProblem(atoms, cur) {
    if (atoms == null || !cur) return '';
    var cap = distanceCap(), fiat = fiatOf(atoms, cur);
    if (cap == null) return 'Payment protection is not loaded, so a payment by code cannot be checked. Nothing was moved.';
    if (!(cap > 0) || fiat <= cap + 1e-9) return '';
    var ps = W.StablesPaymentSecurity;
    var fmt = function (n) { return ps && typeof ps.formatPrimaryAmount === 'function' ? ps.formatPrimaryAmount(n) : String(n); };
    var unit = ps && typeof ps.displayPrimaryCcy === 'function' ? ' ' + ps.displayPrimaryCcy() : '';
    return 'A payment by code is limited to ' + fmt(cap) + unit + '. This one is ' + fmt(fiat) + unit + '.';
  }
  /** Who signed the code in the Pay form, as the payer must see it before Confirm send. Built with text nodes only. */
  function renderWho(code, info) {
    var box = el('instantPayWho');
    if (!box) return;
    box.replaceChildren();
    if (!code || !far) { box.hidden = true; return; }
    var add = function (cls, text) { var d = D.createElement('div'); d.className = cls; d.textContent = text; box.appendChild(d); return d; };
    var rq = code.request;
    add('instant-who__name', rq && rq.name ? rq.name : 'No name given');
    var tone = 'amber', line;
    if (!rq) line = 'This code is not a signed request: it names nobody. Pay it only if you know where it came from.';
    else if (info && info.known) { tone = 'ok'; line = 'Paid before (' + info.count + (info.count === 1 ? ' time' : ' times') + ').'; }
    else if (info && info.clash) { tone = 'danger'; line = 'You paid “' + info.clash.name + '” before with a different key. This may not be them.'; }
    else line = 'First payment to this payee. Check it is who you expect.';
    add('instant-who__line instant-who__line--' + tone, line);
    var meta = [];
    if (rq && rq.reference) meta.push('Reference: ' + rq.reference);
    if (rq) meta.push('Valid until ' + new Date(rq.expiresAt).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }));
    meta.push('Key ' + String(code.payeeId).slice(0, 4).toUpperCase() + '…' + String(code.payeeId).slice(-4).toUpperCase());
    add('instant-who__meta', meta.join(' · '));
    box.hidden = false;
  }
  function shareRequest() {
    if (!recv.code || !far) return;
    var link = linkOf(recv.code);
    var fallback = function () {
      try { if (W.navigator && W.navigator.clipboard && W.navigator.clipboard.writeText) W.navigator.clipboard.writeText(link); } catch (_) { /* ignore */ }
    };
    try {
      if (W.navigator && typeof W.navigator.share === 'function') W.navigator.share({ title: 'Stables payment request', text: link }).catch(function () {});
      else fallback();
    } catch (_) { fallback(); }
  }
  var NO_NFC = 'The Stables card pays by holding two phones together (NFC). This device has no NFC: use the Stables app on an Android phone with NFC.';
  function chooseWay(w) {
    w = w === 'qr' ? 'qr' : 'nfc';
    if (nfcState() === 'absent' || w === wayNow()) return;
    if (pay.committing || tap.session) return;       // a commit or a tap is deciding: the choice waits for it
    wayChosen = w;
    if (typeof W.stablesSetInstantWay === 'function') W.stablesSetInstantWay(w);
    if (w === 'qr') askBle(sheetShows('sendModal') ? 'pay' : 'recv');
    pay.note = null;
    if (sheetShows('sendModal')) {
      if (pay.showing) {
        // The SAME stored payment, offered the other way; its row says which.
        var p = pay.showing;
        showPayment(p);
        markWay(p, w);
      } else {
        // A confirmation waiting for a tap that will not come: back to the form, what was typed kept.
        if (pay.armed) { pay.intent = null; formView(); }
        // A code a camera read is not carried into the tap: the tap reads the receiver itself.
        if (w === 'nfc' && pay.code && pay.source !== 'nfc') {
          pay.code = null;
          pay.source = 'manual';
          var to = el('instantPayTo'); if (to) to.value = '';
          payError('');
        }
        if (w === 'qr' && payWantsCamera()) mountScanner('instantPayScanSlot', 'pay', true);
        else if (scan.mode === 'pay') unmountScanner();
        updateTier();
      }
    }
    if (sheetShows('recvModal')) {
      if (scan.mode === 'receive') unmountScanner();
      showPaste(false);
      recvError('');
    }
    render();
  }
  /** Arrow keys, Home and End move the choice (M-EL-SEGMENTED-CONTROL keyboard contract). */
  function wayKey(event) {
    var keys = { ArrowLeft: 'nfc', ArrowUp: 'nfc', Home: 'nfc', ArrowRight: 'qr', ArrowDown: 'qr', End: 'qr' };
    var w = keys[event.key];
    if (!w) return;
    event.preventDefault();
    chooseWay(w);
    var btn = event.currentTarget && event.currentTarget.querySelector('[data-instant-way="' + w + '"]');
    if (btn) btn.focus();
  }
  /** The choice as drawn, and what each way shows of the two sheets. */
  function drawWay() {
    var offered = false;                             // D093: the card pays by tap only; no choice is offered
    var w = wayNow();
    ['instantPayWay', 'instantRecvWay'].forEach(function (id) {
      var box = el(id);
      if (!box) return;
      box.hidden = !offered;
      Array.prototype.forEach.call(box.querySelectorAll('[data-instant-way]'), function (b) {
        var on = b.getAttribute('data-instant-way') === w;
        b.classList.toggle('active', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
    });
    var qr = w === 'qr';
    show('instantPayScanSlot', qr);
    show('instantPayToRow', qr);
    show('instantRecvQrPart', qr);
    show('instantRecvQrActions', qr && !far);       // D123: a shared request is paid over the network, never scanned back
    // D123: the way to the code ("Pay with a code", "Share a payment request") and back to the tap where the phone has NFC.
    var ok = ready(), hasNfc = nfcState() !== 'absent';
    show('instantPayFarRow', ok && !far && !pay.tapSteps);   // D127: not while a tap payment completes
    show('instantPayTapRow', ok && far && hasNfc);
    show('instantRecvFarRow', ok && !far);
    show('instantRecvTapRow', ok && far && hasNfc);
    show('instantRecvRefRow', ok && far);
    show('instantRecvShareBtn', ok && far);
    if (!far) renderWho(null);
    recvNextLine();
  }

  /* ---------- delivery: how a committed payment reaches its receiver (the seam) ----------
   * Law 22: the second scan (the receiver scanning the payer's screen) is a TEMPORARY fallback, and
   * an automatic channel replaces it: the founder chose NFC (2026-09-28, after build 100; the
   * "nfc" channel below, build 101). Both ends of a delivery are one small interface:
   *   payer:    channel.offer(payment)  after the commit, hand the STORED payment over (never a new
   *                                     signature: a re-show from the "Paid offline" row offers the
   *                                     same stored payment again);
   *   receiver: channel.listen()        wait for a payment; whatever arrives is handed to
   *                                     acceptPayment(text, channelId), the ONE path into receive()
   *                                     for every channel, pasted text included.
   * 'screen' is always registered: offer draws the payment QR in the Send sheet, listen mounts the
   * scanner in the Receive sheet ("Scan payment", which always asks for the screen channel by name).
   * 'nfc' is registered where the native NFC bridge exists (the standalone Android app) and, being
   * registered last, is preferred while available() is true (NFC present AND on); otherwise the
   * screen channel is the fallback. NFC listens by itself: the receiver's phone answers taps while its
   * Instant Receive shows a code (syncNfc), so no button starts it. The protocol does not change: a
   * payment is the same text whichever channel carries it, and every channel's arrival ends in the
   * same Wallet arrival (law 23).
   */
  var channels = [];
  function registerDeliveryChannel(ch) {
    if (!ch || !ch.id || typeof ch.offer !== 'function' || typeof ch.listen !== 'function') throw new Error('not a delivery channel');
    channels = channels.filter(function (c) { return c.id !== ch.id; });
    channels.unshift(ch);                                  // the newest registered channel is preferred
  }
  function channelFor() {
    // Law 29 (build 114): the person's choice decides. Where the phone has no NFC the choice is QR
    // (wayNow); with NFC switched off the tap view says so and offers the settings, never a QR.
    var chosen = channelById(wayNow() === 'nfc' ? 'nfc' : 'screen');
    if (chosen) return chosen;
    for (var i = 0; i < channels.length; i++) {
      try { if (!channels[i].available || channels[i].available()) return channels[i]; } catch (_) { /* next */ }
    }
    return null;
  }
  function channelById(id) {
    for (var i = 0; i < channels.length; i++) if (channels[i].id === id) return channels[i];
    return null;
  }
  function deliver(payment) {
    var ch = channelFor();
    if (ch) ch.offer(payment);
  }
  /** Receiving through one channel by name ("Scan payment" asks for 'screen'). */
  function listen(id) {
    var ch = channelById(id);
    if (ch && (!ch.available || ch.available())) ch.listen();
  }
  function stopListening() {
    channels.forEach(function (c) { try { if (typeof c.stop === 'function') c.stop(); } catch (_) { /* ignore */ } });
  }

  /**
   * Law 23: the arrival is the on-chain arrival. The Wallet, with the SAME message confirming the
   * amount, from the SAME function the on-chain detection calls (index.html,
   * stablesPresentIncomingPaymentInWallet). The row is marked final: the message says so instead
   * of "Awaiting confirmation", and no confirmation-progress pop-up is offered.
   */
  function arrived(entry) {
    var cur = currencyOfRecord(entry);
    var atoms = BigInt(entry.amount);
    var row = { id: entry.id, dir: 'in', instant: true, final: true, status: 'Final',
      amt: Number(P.atomsToDecimal(atoms)), amtText: P.formatAmount(atoms), ccy: cur ? cur.label : '' };
    if (typeof W.stablesPresentIncomingPaymentInWallet === 'function') {
      W.stablesPresentIncomingPaymentInWallet(row);
      return;
    }
    if (isOpen('recvModal') && typeof W.closeModal === 'function') W.closeModal('recvModal');
    if (typeof W.navigate === 'function') W.navigate('wallet');
  }

  /**
   * The one way a payment is taken into this account, whichever channel carried it. `report`, when a
   * channel gives one, hears the verdict the moment it is known ('credited', 'duplicate' or
   * 'refused' with the refusal's code), before anything is drawn: the NFC channel answers the payer's
   * phone with it while the phones are still together.
   */
  function acceptPayment(raw, via, report) {
    var told = false;
    function tell(status, reason) {
      if (told || typeof report !== 'function') return;
      told = true;
      try { report(status, reason || ''); } catch (_) { /* the payment itself is unaffected */ }
    }
    if (!ready()) { tell('refused', 'unavailable'); receiveRefused(P.InstantError('unavailable'), via); return Promise.resolve(null); }
    return account.receive(raw, { via: via === 'nfc' ? 'nfc' : (via === 'screen' ? 'qr' : String(via || '')) }).then(function (res) {
      tell('credited', '');
      appendRow(res.entry);
      // D095: by tap, the Receive sheet says it first ("Received" and the amount), with a vibration, then the Wallet.
      if (via === 'nfc' && sheetShows('recvModal')) {
        recv.tapBanner = { tone: 'success', icon: '\u2713', title: 'Received', body: '+' + money(BigInt(res.entry.amount), currencyOfRecord(res.entry)) };
        banner('instantRecvNfc', recv.tapBanner);
        // D127: the receiver's steps, each with its time: received, checked and credited, confirmation sent to the payer.
        var tr = Date.now();
        recv.tapSteps = [
          { label: 'Payment received', state: 'done', at: tr },
          { label: 'Checked and credited', state: 'done', at: tr },
          { label: 'Confirmation sent', state: 'done', at: tr }
        ];
        drawTapSteps('instantRecvSteps', recv.tapSteps);
        buzz([60, 40, 60]);
        return new Promise(function (done) { setTimeout(done, 3000); }).then(function () {
          stopListening();
          unmountScanner();
          return refresh().catch(function () { /* the arrival still shows */ });
        }).then(function () { arrived(res.entry); return res; });
      }
      // Final at the moment it is received. The row, the balance and the arrival message are the
      // feedback, exactly as for an on-chain arrival (law 23).
      stopListening();
      if (isOpen('sendModal') && typeof W.closeModal === 'function') W.closeModal('sendModal');
      unmountScanner();
      return refresh().catch(function () { /* the arrival still shows */ }).then(function () {
        arrived(res.entry);
        return res;
      });
    }).catch(function (e) {
      var code = (e && e.code) || 'error';
      log('receive refused (' + (via || '?') + '): ' + (e && (e.code || e.message)));
      // A duplicate by NFC is the payer's phone asking again after a torn tap: the receiver already
      // has it, the payer is told so, and the receiver's screen has nothing new to say.
      tell(code === 'duplicate' ? 'duplicate' : 'refused', code);
      // Over the network (D087) nobody is looking at a scanner: a payment read twice, or a carrier that does
      // not hold a good payment, is logged and nothing is said.
      if (!((via === 'nfc' || via === 'bluetooth') && code === 'duplicate') && via !== 'network') receiveRefused(e, via);
      return null;
    });
  }
  function receiveRefused(e, via) {
    var text = messageOf(e);
    if (sheetShows('recvModal')) {
      recvError(text);
      if (scan.mode === 'receive') parkScanner('instantRecvScanSlot', 'receive');
    } else if (sheetShows('sendModal')) {
      payError(text);
      if (scan.mode === 'pay') parkScanner('instantPayScanSlot', 'pay');
    } else if (isOpen('sendModal')) {
      savingsScanRefusal(text);
    } else if (typeof W.showToast === 'function') {
      W.showToast(text, { tone: 'amber' });
    }
  }

  /* The screen channel: the payer's screen and the receiver's camera. */
  registerDeliveryChannel({
    id: 'screen',
    available: function () { return true; },
    offer: function (payment) { showPayment(payment); },
    listen: function () { mountScanner('instantRecvScanSlot', 'receive', true); },
    stop: function () { if (scan.mode === 'receive') unmountScanner(); }
  });

  /* ---------- Receive, Instant balance chosen: the code at once, the optional amount and currency ---------- */
  function recvError(text) {
    var hint = el('instantRecvHint');
    if (!hint) return;
    hint.textContent = text || recvNext();
    hint.classList.toggle('ui-tone-danger', !!text);
    hint.hidden = !hint.textContent && wayNow() === 'nfc';   // by tap the line holds its place only when it speaks
  }
  /**
   * Law 28 (build 114): with nothing to report, the line says what to do next. By QR code only: by tap,
   * the status banner says it ("Hold the phones together").
   */
  function recvNext() {
    if (ready() && sheetShows('recvModal') && nfcState() === 'absent' && !far) return NO_NFC;
    if (!ready() || wayNow() !== 'qr' || !recv.code || !sheetShows('recvModal')) return '';
    // D123: a shared request reaches the payer by any app; the payment comes back over the Minima network.
    if (far) return recv.code.indexOf('Address:') >= 0 ? 'Send this request to the payer. It can be paid once, within 24 hours.'
      : 'Connect your node to be paid at a distance.';
    if (scan.mode === 'receive') return 'Scan the code on the payer’s phone.';
    // D087: a code with this phone's address is paid over the network; nothing is scanned back.
    return recv.code && recv.code.indexOf('Address:') >= 0 ? 'Show this code to the payer’s camera.'
      : 'Show this code to the payer’s camera, then press Scan payment.';
  }
  /** Redraw that line, unless it is saying what went wrong. */
  function recvNextLine() {
    var hint = el('instantRecvHint');
    if (!hint) return;
    if (!hint.classList.contains('ui-tone-danger')) hint.textContent = recvNext();
    hint.hidden = !hint.textContent && wayNow() === 'nfc';
  }

  /** The requested amount, as the Savings Receive reads it: empty or unreadable means none. */
  function requestedAtoms() {
    var input = el('instantRecvAmt');
    var raw = String((input && input.value) || '').replace(/,/g, '').trim();
    if (!raw) return null;
    try { return P.parseAmount(raw); } catch (_) { return null; }
  }

  /** This phone's Savings address for the receiver code (D087), or null where there is no node to receive with. */
  var recvAddress = null;
  function receiveAddress() {
    if (recvAddress) return Promise.resolve(recvAddress);
    if (!chain || !chainAvailability().ok || typeof chain.payoutAddress !== 'function') return Promise.resolve(null);
    var asked = chain.payoutAddress().then(function (a) { recvAddress = a || null; return recvAddress; }, function () { return null; });
    asked.then(function (a) {   // arrived after the code was drawn without it: draw it again, now with it
      if (a && sheetShows('recvModal') && recv.code && recv.code.indexOf('Address:') < 0) drawReceiverCode();
    });
    // A slow node never holds the code back: after two seconds it is drawn without the address.
    return Promise.race([asked, new Promise(function (r) { setTimeout(function () { r(null); }, 2000); })]);
  }

  /** Draw the receiver code for the chosen currency and amount (law 22: at once; law 23: they follow). */
  function drawReceiverCode() {
    if (!ready() || !sheetShows('recvModal')) return;
    var cur = pickerCurrency('instantRecvCcy');
    if (!cur) { renderQr('instantRecvQr', '', messageOf(P.InstantError('asset'))); return; }
    var ticket = ++recv.drawn;
    // Showing the code is the first use of the account: its key pair is made here if it is new.
    // D087 (build 0.0.12.021): the code carries this phone's Savings address, where the payer's phone sends
    // the payment, so nothing has to be scanned back. Without a node the code has no address and the
    // payment comes by the second scan, as before.
    // D123: the code way shares a SIGNED request (name, optional reference, one-time, 24 hours); the tap's code stays plain.
    var request = far ? { name: myName(), reference: String((el('instantRecvRef') || {}).value || '').trim(), ttlMs: REQUEST_TTL_MS } : null;
    receiveAddress().then(function (address) {
      return account.receiverCode({ tokenId: cur.tokenId, amount: requestedAtoms(), address: address, link: far ? null : bleLinkForReceive(), request: request });
    }).then(function (r) {
      if (ticket !== recv.drawn || !sheetShows('recvModal')) return;
      recv.code = r.text;
      renderQr('instantRecvQr', r.text);
      var t = el('instantRecvCodeText');
      if (t) t.value = oneLine(r.text);
      recvNextLine();
      syncNfc();                                   // the phone answers taps with THIS code (by tap only)
      return refresh();
    }).catch(function (e) { recvError(messageOf(e)); });
  }

  function enterReceive(opts) {
    nfcState(true);                                // a person opened it: ask the phone afresh
    if (opts && opts.opening) far = nfcState() === 'absent';   // D123: each opening starts on the tap; no NFC, on the code way
    recv.link = null;                              // D092: a new one-time Bluetooth link for this Receive
    recv.tapSteps = null;                          // D127: a new opening shows no old steps
    recv.tapBanner = null;
    bleRefresh();
    askBle('recv');
    recvError('');
    showPaste(false);
    // Opening Receive starts on the main currency, as the Savings Receive does; switching account
    // inside an open sheet keeps what was chosen.
    // Build 0.0.12.059 (founder 2026-10-05: "even the get paid, by default it should be the currency the user has in his wallet"):
    // the currency held on the card, else in Savings; nothing held anywhere, the main one.
    if (opts && opts.opening) setPicker('instantRecvCcy', fundedCurrency(defaultCurrency(), function (c) { return cardHolds(c) || savingsHolds(c); }));
    render();
    if (state.status === 'unavailable') return;
    if (!ready()) { renderQr('instantRecvQr', '', ''); return; }
    drawReceiverCode();
  }

  function requestInput() { recvError(''); drawReceiverCode(); }

  function leaveReceive() {
    ble.asked.recv = false;
    if (scan.mode === 'receive') unmountScanner();
    showPaste(false);
    recvError('');
    syncNfc();
  }

  function scanPayment() {
    if (!ready()) { recvError(UNAVAILABLE); return; }
    showPaste(false);
    listen('screen');
    recvError('');                                 // (after the scanner is in: the line says to scan)
  }

  function showPaste(on) {
    show('instantRecvPasteRow', on);
    var input = el('instantRecvPaste');
    if (input && !on) input.value = '';
    var btn = el('instantPastePaymentBtn');
    if (btn) btn.setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  function togglePaste() {
    var row = el('instantRecvPasteRow');
    var on = !!(row && row.hidden);
    if (on && scan.mode === 'receive') unmountScanner();
    showPaste(on);
    recvError('');
    if (on) { var input = el('instantRecvPaste'); if (input) input.focus(); }
  }

  /* ---------- Send, Instant balance chosen: the Savings steps ---------- */
  function payError(text) {
    var e = el('instantPayError');
    if (!e) return;
    e.textContent = text || '';
    delete e.dataset.funds;
  }
  function formView() {
    if (pay.armed) { try { log('a confirmation was cleared by: ' + String(new Error().stack || '').split('\n').slice(2, 4).map(function (l) { return l.trim(); }).join(' < ')); } catch (_) { /* ignore */ } }
    pay.showing = null;
    pay.view = null;
    pay.note = null;
    pay.delivered = false;
    pay.armed = null;
    pay.armedQuick = null;
    show('instantPayForm', true);
    show('instantPayShow', false);
    show('instantPayArmedOffer', false);
  }
  /** The Send sheet's camera is wanted while this flow waits for a code, exactly as for Savings: by QR
   *  code only (law 29: by tap there is no camera). */
  function payWantsCamera() {
    return ready() && sheetShows('sendModal') && wayNow() === 'qr' && !pay.showing && !pay.code && !pay.armed;
  }

  function resetForm() {
    pay.tapSteps = null;                           // D127
    pay.code = null;
    pay.source = 'manual';
    pay.intent = null;
    pay.committing = false;
    var to = el('instantPayTo'); if (to) to.value = '';
    var amt = el('instantPayAmt'); if (amt) amt.value = '';
    payError('');
    updateTier();
    checkFunds();
  }

  function enterPay(opts) {
    nfcState(true);                                // a person opened it: ask the phone afresh
    if (opts && opts.opening) far = nfcState() === 'absent';   // D123: each opening starts on the tap; no NFC, on the code way
    bleRefresh();
    askBle('pay');
    resetForm();
    formView();
    // Opening Send starts on the main currency, as the Savings Send does.
    if (opts && opts.opening) setPicker('instantPayCcy', fundedCurrency(defaultCurrency(), cardHolds));
    render();
    // A device that cannot hold the balance gets its refusal line and no scanner: a scanner that
    // could only refuse would be a control that can only fail (law 11).
    if (state.status === 'unavailable') return;
    // On opening, the shell's own timer starts the camera, exactly as for Savings. By tap there is none.
    if (wayNow() === 'qr') mountScanner('instantPayScanSlot', 'pay', !(opts && opts.opening));
    else if (scan.mode === 'pay') unmountScanner();
  }

  function leavePay() {
    ble.asked.pay = false;
    if (scan.mode === 'pay') unmountScanner();
    resetForm();
    formView();
    syncNfc();
  }

  /**
   * A receiver code arrives in the recipient field: scanned, pasted, or typed. A code that asks for
   * a currency or an amount fills them in, as a Savings QR with an amount does; the payer can still
   * change both before confirming.
   */
  function setCode(raw, source) {
    var to = el('instantPayTo');
    var parsed = null;
    raw = fromLink(raw);                           // D123: a stables: link carries the whole code
    payError('');
    renderWho(null);
    try { parsed = P.parse(raw); } catch (e) { pay.code = null; payError(messageOf(e)); updateTier(); checkFunds(); return false; }
    if (!parsed) { pay.code = null; updateTier(); checkFunds(); return false; }
    if (parsed.type !== 'receiver') {
      pay.code = null;
      payError(parsed.type === 'payment' ? 'This is a payment. Receive it from Receive with Stables card chosen.' : safeMessage('malformed'));
      updateTier();
      checkFunds();
      return false;
    }
    pay.code = parsed;
    pay.source = source || 'manual';
    pay.intent = null;
    if (to) to.value = oneLine(raw.indexOf('\n') >= 0 ? raw : P.normalize(raw));
    var cur = currencyForToken(parsed.tokenId);
    if (cur) setPicker('instantPayCcy', cur);
    if (parsed.amount != null) {
      var amt = el('instantPayAmt');
      if (amt) {
        amt.value = P.atomsToDecimal(parsed.amount);
        try { if (typeof W.stablesFormatFinancialAmountInput === 'function') W.stablesFormatFinancialAmountInput(amt); } catch (_) { /* ignore */ }
      }
    }
    render();                                      // (and syncNfc: a code is in, the reader rests)
    if (!ready()) { updateTier(); return true; }
    // Checked at once, like an address: the payer learns now, not at the end, that the code is theirs
    // or damaged. Nothing is debited or signed here.
    // D123: a signed request is also checked for changes, expiry and an earlier payment, and its signer is named.
    account.checkReceiver(parsed).then(function () {
      updateTier(); checkFunds();
      if (far && pay.code === parsed) return account.payeeInfo(parsed).then(function (info) { if (pay.code === parsed) renderWho(parsed, info); });
    }).catch(function (e) {
      // The refusal is the last word on the line (the balance check below would otherwise write over it).
      if (pay.code === parsed) { pay.code = null; renderWho(null); updateTier(); checkFunds(); syncNfc(); payError(messageOf(e)); }
    });
    updateTier();
    return true;
  }
  function safeMessage(code) { return (P && P.MESSAGES && P.MESSAGES[code]) || 'This QR code is not a readable offline payment.'; }

  function pasteCode(ev) {
    var text = '';
    try { text = ((ev.clipboardData || W.clipboardData).getData('text') || '').trim(); } catch (_) { text = ''; }
    text = fromLink(text);                         // D123: a pasted stables: link is its code
    // A one-line field would strip the code's line breaks; read the clipboard text itself instead.
    if (text && P && P.kindOf(text)) {
      ev.preventDefault();
      if (setCode(text, 'manual')) focusAmount();
    }
  }
  function codeInput(input) {
    var text = fromLink(String((input && input.value) || '').trim());
    if (!text) { pay.code = null; renderWho(null); payError(''); updateTier(); checkFunds(); syncNfc(); return; }
    if (P && P.kindOf(text)) { if (setCode(text, 'manual') && !pay.showing) focusAmount(); }
    else { pay.code = null; updateTier(); checkFunds(); renderNfc(); }
  }
  function focusAmount() {
    var amt = el('instantPayAmt');
    if (amt && typeof amt.focus === 'function') { try { amt.focus({ preventScroll: true }); } catch (_) { amt.focus(); } }
  }

  function readAmount() {
    var input = el('instantPayAmt');
    return P.parseAmount(input ? input.value : '');
  }
  function setMax() {
    var input = el('instantPayAmt');
    var cur = pickerCurrency('instantPayCcy');
    if (!input || !ready() || !cur) return;
    var have = balanceOf(cur.tokenId);
    input.value = have > BigInt(0) ? P.atomsToDecimal(have) : '';
    try { if (typeof W.stablesFormatFinancialAmountInput === 'function') W.stablesFormatFinancialAmountInput(input); } catch (_) { /* ignore */ }
    amountInput();
  }
  /** The amount changes what one tap would do (D060): the banner before a confirmation follows it. */
  function amountInput() { payError(''); pay.note = null; pay.confirmedFor = null; updateTier(); checkFunds(); syncConfirmShown(); renderNfc(); }

  /**
   * Law 11: a live button that can only fail is a defect. While the chosen currency's Instant
   * balance is known and cannot cover the payment (nothing held, or less than the amount typed),
   * "Confirm send" is disabled and the reason is written in its error line, in place. Unknown is
   * not zero (law 5): nothing is refused while the balance is still loading.
   */
  function fundsProblem() {
    if (!ready()) return null;
    var cur = pickerCurrency('instantPayCcy');
    if (!cur) return null;
    var have = balanceOf(cur.tokenId);
    var atoms = null;
    try { atoms = readAmount(); } catch (_) { atoms = null; }
    if (atoms != null && atoms > have) return { cur: cur, balance: have, amount: atoms };
    if (have <= BigInt(0)) return { cur: cur, balance: have, amount: null };
    return null;
  }
  function checkFunds() {
    var line = el('instantPayError');
    var btn = el('instantPayConfirmBtn');
    var problem = fundsProblem();
    // By tap with NFC switched off, a confirmation could only wait for a tap that cannot come (law 11):
    // the banner says "NFC is off" and offers the settings.
    var noTap = wayNow() === 'nfc' && nfcState() !== 'on';
    // D123: a payment by code has a cap; above it the button is off and the line says why (law 11).
    var capped = '';
    if (!problem && far) { var ca = null; try { ca = readAmount(); } catch (_) { ca = null; } capped = distanceCapProblem(ca, pickerCurrency('instantPayCcy')); }
    if (btn && !pay.committing) btn.disabled = !ready() || !!problem || noTap || !!capped;
    if (!line) return;
    if (problem) {
      line.textContent = problem.amount != null
        ? 'Your Stables card holds ' + money(problem.balance, problem.cur) + '. This payment is ' + money(problem.amount, problem.cur) + '.'
        : 'Your Stables card holds no ' + problem.cur.label + '.';
      line.dataset.funds = '1';
    } else if (capped) {
      line.textContent = capped;
      line.dataset.funds = '1';
    } else if (line.dataset.funds) {
      line.textContent = '';
      delete line.dataset.funds;
    }
  }

  /** An amount in the main currency, the unit the quick-pay limit and the daily cap are kept in. */
  function fiatOf(atoms, cur) {
    var ps = W.StablesPaymentSecurity;
    var amount = Number(P.atomsToDecimal(atoms));
    var code = cur ? cur.code : LEGACY_CODE;
    return ps && typeof ps.fiatEquivalent === 'function' ? ps.fiatEquivalent(amount, code) : amount;
  }
  /**
   * The shared payment protection decides, as for Savings: protected amounts need the payment code.
   * "Confirm send" never takes the quick-pay path (it is a press, not a scanned or tapped request);
   * a request read BY TAP within quick pay is paid inside the tap instead (quickTap, build 102).
   *
   * UX law 24 (founder 2026-09-29, D060 gap 4 decided: "yes always ask for the code above the
   * quick-pay limit"): a payment a TAP carries (a request read by tap, pay.source 'nfc', or a
   * confirmation that arms the tap, byTap) goes without the payment code only within quick pay: the
   * quick-pay limit AND the day's remaining quick-pay room (withinQuickRoom, the same classifyTier
   * question quickTap asks). Above that it ALWAYS asks for the payment code, like a card asking for its
   * PIN above the contactless limit: the Savings "Standard pay" tier (confirm without a code) never
   * applies to a tap. A payment by QR and a move to Savings keep the Savings tiers, unchanged.
   */
  function tierFor(atoms, cur, byTap) {
    var ps = W.StablesPaymentSecurity;
    if (!ps || typeof ps.classifyTier !== 'function') return 'standard';
    /* D098 (build 0.0.12.036): a payment the card carries takes the card's own levels (one touch / Confirm / payment code
       or fingerprint, each per payment, day and week), set by the payer on the card's window; law 24's "always the code
       above quick pay" is replaced by the payer's own Confirm level (founder: "the one touch, confirmation or pin/bio
       confirmation should be set"). */
    if ((byTap || pay.source === 'nfc') && typeof ps.cardTier === 'function') {
      var step = ps.cardTier(fiatOf(atoms, cur));
      return step === 'tap' ? 'quick' : (step === 'confirm' ? 'standard' : 'protected');
    }
    if (byTap || pay.source === 'nfc') return withinQuickRoom(atoms, cur) ? 'quick' : 'protected';
    var tier = ps.classifyTier({ fiatTotal: fiatOf(atoms, cur), recipientCount: 1, source: pay.source, contactTier: 'inherit', qrHasAmount: false, nodeWritable: true });
    return tier === 'quick' ? 'standard' : tier;
  }
  /** Within the quick-pay limit and the day's remaining quick-pay room (whatever the undo setting says). */
  function withinQuickRoom(atoms, cur) {
    var ps = W.StablesPaymentSecurity;
    if (!ps || typeof ps.classifyTier !== 'function') return false;
    if (typeof ps.cardTier === 'function') return ps.cardTier(fiatOf(atoms, cur)) === 'tap';   // D098: the card's one-touch level
    return ps.classifyTier({ fiatTotal: fiatOf(atoms, cur), recipientCount: 1, source: 'qr', contactTier: 'inherit', qrHasAmount: true, nodeWritable: true }) === 'quick';
  }
  /**
   * Shop style (build 102, D060): a request read by tap is paid in that same tap when the Savings
   * tiers call it quick pay: the SAME classifyTier call the Savings Send makes for a scanned request
   * with an amount (source 'qr', qrHasAmount), so the quick-pay switch, the limit (50 by default) and
   * the daily cap all apply exactly as they do there. A person who chose the quick-pay undo window is
   * never paid inside a tap, because a tap cannot give that window: they confirm first.
   * Returns {fiat} for a payment the tap may make, or null.
   */
  function quickTap(atoms, cur) {
    var ps = W.StablesPaymentSecurity;
    if (!ps || typeof ps.classifyTier !== 'function') return null;
    var fiat = fiatOf(atoms, cur);
    /* D098 (build 0.0.12.036): the payer's own one-tap limit decides ("a maximal amount that is done in one touch"). */
    if (typeof ps.cardTier === 'function') return ps.cardTier(fiat) === 'tap' ? { fiat: fiat } : null;
    var settings = typeof ps.getSettings === 'function' ? ps.getSettings() : null;
    if (settings && settings.quickPayUndo) return null;
    var tier = ps.classifyTier({ fiatTotal: fiat, recipientCount: 1, source: 'qr', contactTier: 'inherit', qrHasAmount: true, nodeWritable: true });
    return tier === 'quick' ? { fiat: fiat } : null;
  }
  /** What one tap may still pay at once, in the main currency (the limit, less what the day's cap has used). */
  function quickRoomText() {
    var ps = W.StablesPaymentSecurity;
    if (!ps || typeof ps.getSettings !== 'function') return '';
    if (typeof ps.cardTapRoom !== 'function') return '';
    var room = ps.cardTapRoom();                        // D098: one touch, less what today and this week used
    if (!(room > 0)) return '';
    return (typeof ps.formatPrimaryAmount === 'function' ? ps.formatPrimaryAmount(room) : String(room))
      + ' ' + (typeof ps.displayPrimaryCcy === 'function' ? ps.displayPrimaryCcy() : '');
  }
  function updateTier() {
    syncConfirmShown();
    var hint = el('instantPayTierHint');
    var btn = el('instantPayConfirmBtn');
    var ps = W.StablesPaymentSecurity;
    var atoms = null;
    try { atoms = readAmount(); } catch (_) { atoms = null; }
    // Paying a friend by tap (no code in the form, NFC on) is a tapped payment too: its tier is shown
    // before Confirm, so a payment code asked above quick pay (law 24) is never a surprise.
    var byTap = wayNow() === 'nfc' && !pay.code && atoms != null && nfcState() === 'on';
    if ((!pay.code && !byTap) || atoms == null || !ps) {
      if (hint) hint.style.display = 'none';
      if (btn && !pay.committing) btn.textContent = 'Confirm send';
      return;
    }
    var tier = tierFor(atoms, pickerCurrency('instantPayCcy'), byTap);
    if (hint) {
      hint.textContent = ps.tierLabel(tier) + (tier === 'protected' ? ' · payment code required' : '');
      hint.style.display = '';
    }
    if (btn && !pay.committing) btn.textContent = tier === 'protected' ? 'Confirm protected send' : 'Confirm send';
  }
  /** D095: on the card, within quick pay a typed amount is paid by the tap itself, so there is no Confirm to press. */
  function syncConfirmShown() {
    var btn = el('instantPayConfirmBtn');
    if (!btn) return;
    var atoms = null;
    try { atoms = readAmount(); } catch (_) { atoms = null; }
    var cur = pickerCurrency('instantPayCcy');
    var direct = wayNow() === 'nfc' && nfcState() === 'on' && ready() && cur && atoms != null && atoms > BigInt(0)
      && balanceOf(cur.tokenId) >= atoms && !!quickTap(atoms, cur) && !pay.armed;
    btn.hidden = direct;
  }

  /**
   * "Confirm send": the Savings Send's own press, then the commit. With NFC on and no receiver code
   * yet (paying a friend, build 102), the press confirms the amount and currency and ARMS the tap
   * instead: the tap reads the receiver's code and the commit happens inside it (onNfcTap). With a code
   * already in (scanned, pasted, or read by an earlier tap) the commit happens here, as before.
   */
  function confirmSend() {
    if (pay.committing || pay.armed) return;
    payError('');
    if (!ready()) { payError(UNAVAILABLE); return; }
    var codeText = fromLink(String((el('instantPayTo') || {}).value || '').trim());
    // D095: on the card, Confirm send readies the card for the tap that pays (with the other phone's code read or not).
    var byTap = wayNow() === 'nfc' && nfcState() === 'on';
    if (!pay.code && !byTap) {
      var parsed = null;
      try { parsed = P.parse(codeText); } catch (e) { payError(messageOf(e)); return; }
      if (!parsed || parsed.type !== 'receiver') { payError('Scan or paste the receiver’s Stables card code.'); return; }
      pay.code = parsed;
    }
    var atoms;
    try { atoms = readAmount(); } catch (e) { payError(messageOf(e)); return; }
    var cur = pickerCurrency('instantPayCcy');
    if (!cur) { payError(messageOf(P.InstantError('asset'))); return; }
    var capProblem = far ? distanceCapProblem(atoms, cur) : '';
    if (capProblem) { payError(capProblem); return; }          // D123: checked again at the press
    var code = pay.code;
    if (code && far) code.far = true;                          // D123: the hand-over follows the code way after Send closes
    (byTap ? Promise.resolve(null) : account.checkReceiver(code)).then(function () {
      return account.state();
    }).then(function (s) {
      var have = s.balances[cur.tokenId] || BigInt(0);
      if (have < atoms) {
        var e = P.InstantError('insufficient');
        e.balance = have;
        e.amount = atoms;
        e.tokenId = cur.tokenId;
        throw e;
      }
      // One id per confirmation: a second press, or a retry after the payment-code prompt, commits
      // the same payment again and gets the stored one back, never a second debit.
      if (!pay.intent) pay.intent = P.newPaymentId();
      var intent = pay.intent;
      // Law 24: a confirmation that arms the tap is a tapped payment: within quick pay it goes without
      // the payment code (and counts against the day's quick-pay room when the tap pays it), above it
      // the code is asked, always.
      var tier = tierFor(atoms, cur, byTap);
      pay.armedQuick = byTap && tier === 'quick' ? { fiat: fiatOf(atoms, cur) } : null;
      var go = byTap ? function () { arm(atoms, intent, cur); } : function () { commit(code, atoms, intent, cur); };
      var ps = W.StablesPaymentSecurity;
      if (ps && typeof ps.requiresPaymentCode === 'function' && ps.requiresPaymentCode(tier)) {
        ps.requestPaymentCode(function (ok) { if (ok) go(); });
        return;
      }
      go();
    }).catch(function (e) { payFailed(e); });
  }

  /**
   * Confirmed, waiting for the tap (paying a friend, build 102, D060): "Hold the phones together"
   * with the amount, and "Change amount". Nothing is debited or signed yet; the tap does both, for the
   * receiver it reads. The camera steps aside (the tap reads the code).
   */
  function arm(atoms, intent, cur) {
    if (!sheetShows('sendModal') || nfcState() !== 'on' || wayNow() !== 'nfc') return;   // the tap went away meanwhile: the form stays
    pay.armed = { atoms: atoms, cur: cur, intent: intent };
    /* D097 (founder's Pro, build 0.0.12.034): "even the 222 xWiniwa are not sending". He confirmed (payment code), the
       screen showed "Hold the phones together to pay", yet the tap at 21:10:42 found no confirmation (it had been
       cleared by a redraw before the tap) and only read the request. The confirmation is now also kept apart, for
       5 minutes, until Send closes or another amount is typed, and a tap honours it whatever the screen did. */
    pay.confirmedFor = { atoms: atoms, cur: cur, intent: intent, at: Date.now() };
    pay.note = null;
    unmountScanner();
    show('instantPayForm', false);
    show('instantPayShow', true);
    ['instantPayQrWrap', 'instantPayTextRow'].forEach(function (id) { show(id, false); });
    show('instantPayArmedOffer', false);              // D097: no "Change amount" (founder: "we don't need that button"); Back closes Send
    setText('instantPayAmtShown', money(atoms, cur));
    syncNfc();
  }

  /** "Change amount": back to the form with what was typed, nothing paid; a new press confirms again. */
  function changeAmount() {
    if (!pay.armed || pay.committing || tap.session) return;
    pay.intent = null;
    formView();
    render();
    updateTier();
    if (payWantsCamera()) mountScanner('instantPayScanSlot', 'pay', true);
    focusAmount();
  }

  function commit(code, atoms, intent, cur, quick) {
    if (pay.committing) return;
    pay.committing = true;
    var btn = el('instantPayConfirmBtn');
    if (btn) btn.disabled = true;
    // COMMIT FIRST: account.pay() debits the chosen currency, advances the counter and stores the
    // signed payment in one durable transaction. Only what that commit returned is ever handed to a
    // delivery channel.
    account.pay(code, atoms, { paymentId: intent, tokenId: cur.tokenId }).then(function (res) {
      pay.committing = false;
      pay.intent = null;
      // D098: every card payment counts toward the card's day and week levels.
      var ps = W.StablesPaymentSecurity;
      if (res.status === 'paid' && ps && typeof ps.recordCardSpend === 'function') ps.recordCardSpend(fiatOf(atoms, cur));
      var network = canSendOverNetwork(code);
      if (res.entry) appendRow(res.entry, network ? 'network' : wayNow());
      if (typeof W.navigate === 'function') W.navigate('wallet');   // law 1: Back lands on the Wallet
      handOver(res.payment, code);
      return refresh();
    }).catch(function (e) {
      pay.committing = false;
      payFailed(e);
      refresh().catch(function () {});
    });
  }

  /* ---------- ONE SCAN (build 0.0.12.021, founder 2026-10-04; Machinery D087) ----------
   * "One scan only, the receiver shows his code and the payer scans and confirms, the payment goes directly.
   * It works directly if the receiver specified an amount or the sender did, if not the sender has to enter
   * the amount and confirm. Same with NFC. What we have on chain, from Savings, is good, we just need to
   * replicate it for instant payment as much as possible."
   *   1. The scan fills the form (payee, currency, the code's amount) and the payer confirms, with the payment
   *      code where the tier asks for it. (Until 0.0.12.060 a scan within quick pay paid at once; D122 ended that:
   *      a scan cannot prove the other phone is next to you.)
   *   2. The payment goes to the receiver the way a Savings payment does, over the Minima network
   *      (handOver -> sendOverNetwork: instant-chain.js sendCarrier, one atom to the address in the receiver's
   *      code with the payment in the state). The receiver's phone reads it from its history and credits it
   *      (takeCarrier): nobody scans anything back.
   *   3. Where it cannot go out (no node, no internet, no Savings coin for the one-atom envelope, a code
   *      without an address), nothing is lost: the payment is already stored and is shown as its QR for the
   *      receiver to scan, exactly as before. Paying by tap is unchanged (the tap carries it both ways).
   */
  /* ---------- Bluetooth (founder 2026-10-04, build 0.0.12.028; Machinery D092) ----------
   * "we need direct connection for instant payment ... bluetooth is also interesting ... we would need a message to
   * activate bluetooth". The receiver's code carries a one-time Link while its phone listens (InstantBle on the
   * standalone Android app); after the scan the payer's phone hands the STORED payment over directly and the receiving
   * phone answers with its verdict. About a second, no internet. If it cannot be handed over (Bluetooth off, the other
   * phone out of reach, 12 s), the payment goes over the network (sendOverNetwork) as before; with no address either,
   * its QR is shown. Where there is no Bluetooth bridge (web, MiniDapp, Core companion) nothing here runs.
   */
  var ble = { state: '', pending: {}, listening: '', asked: {} };
  function bleBridge() { var b = W.StablesNative; return b && typeof b.bleState === 'function' && typeof b.blePay === 'function' ? b : null; }
  function bleNow() {
    var b = bleBridge();
    if (!b) return 'absent';
    if (!ble.state) { try { ble.state = String(b.bleState() || 'absent'); } catch (_) { ble.state = 'absent'; } }
    return ble.state;
  }
  function bleRefresh() { ble.state = ''; bleNow(); renderBleOffers(); }
  function bleLinkForReceive() {
    if (bleNow() !== 'on' || wayNow() === 'nfc') return null;
    if (!recv.link) recv.link = P.newPaymentId().slice(0, 16);
    return recv.link;
  }
  /** The phone listens while (and only while) Receive by QR shows a code carrying its Link. */
  function syncBle() {
    var b = bleBridge();
    if (!b) return;
    var want = (bleNow() === 'on' && ready() && sheetShows('recvModal') && wayNow() === 'qr' && recv.link && recv.code && recv.code.indexOf('Link: ' + recv.link) >= 0) ? recv.link : '';
    if (want !== ble.listening) { ble.listening = want; try { b.bleReceiverSet(want); } catch (_) { /* ignore */ } }
    renderBleOffers();
  }
  /** "Turn on Bluetooth" in Send and Receive (by QR code), while it is off or not allowed. */
  function renderBleOffers() { /* build 0.0.12.029: the question is a pop-up (askBle), not a line under the code */ }
  /* "the turn on bluetooth message should be a pop-up if bluetooth is not activated, for now under the qr code the user
     will miss it" (founder 2026-10-04, build 0.0.12.029). Once per opening of Send or Receive on Instant payments by QR
     code, while Bluetooth is off or not allowed: the shared confirm pop-up; its button asks the phone (permission,
     then Bluetooth). Closing it keeps the network path. */
  function askBle(sheet) {
    if (ble.asked[sheet]) return;
    var st = bleNow();
    if (!(st === 'off' || st === 'no-permission') || wayNow() !== 'qr' || !ready() || typeof W.stablesConfirm !== 'function') return;
    ble.asked[sheet] = true;
    W.stablesConfirm({
      title: 'Turn on Bluetooth',
      message: 'Payments go from phone to phone by Bluetooth in about a second. Without it a payment takes about 20 seconds over the Minima network.',
      confirmText: 'Turn on Bluetooth'
    }).then(function (ok) { if (ok) enableBle(); });
  }
  function enableBle() { var b = bleBridge(); if (b) { try { b.bleEnable(); } catch (_) { /* ignore */ } } }
  function sendByBluetooth(payment, code) {
    ble.pending[payment.ref] = { payment: payment, code: code };
    account.setCarrier(payment.ref, { state: 'ble', step: 'searching', link: code.link, to: code.address || '', at: Date.now() }).then(function (entry) {
      if (entry) appendRow(entry, 'network');
      var b = bleBridge();
      if (!b) { bleFallback(payment, code.address || '', 'no-bridge'); return; }
      b.blePay(code.link, payment.ref, payment.text);
    }).catch(function (e) { log('bluetooth start: ' + (e && e.message)); bleFallback(payment, code.address || '', 'record'); });
  }
  /** Bluetooth could not hand it over: by the network if the code gave an address, else its QR. */
  function bleFallback(payment, address, why) {
    delete ble.pending[payment.ref];
    log('bluetooth hand-over failed (' + why + ')' + (address ? ': sending over the network' : ': showing the QR'));
    account.setCarrier(payment.ref, { bleFailed: why }).then(function () {
      if (address && chain && chainAvailability().ok) sendOverNetwork(payment, address, 1);
      else {
        account.setCarrier(payment.ref, { state: 'failed', note: 'Bluetooth: ' + why }).then(function (entry) {
          if (entry) appendRow(entry, 'qr');
          deliver(payment);
        });
      }
    });
  }
  function onBleEvent(ev) {
    if (!ev) return;
    // Savings payments by Bluetooth (D094, savings-ble.js) share the radio: their messages and hand-overs go there.
    var SB = W.StablesSavingsBle;
    if (SB) {
      if (ev.type === 'payment' && /^\{"stables":"stables-savings"/.test(String(ev.text || ''))) { SB.onPayment(ev); return; }
      if ((ev.type === 'delivery' || ev.type === 'step') && /^savings-/.test(String(ev.ref || ''))) { if (ev.type === 'delivery') SB.onDelivery(ev); return; }
      if (ev.type === 'state') { try { SB.onState(ev); } catch (_) { /* ignore */ } }
    }
    if (!account) return;
    if (ev.type === 'state') { ble.state = String(ev.state || ''); renderBleOffers(); if (sheetShows('recvModal')) drawReceiverCode(); return; }
    if (ev.type === 'step') {
      account.setCarrier(String(ev.ref || ''), { step: String(ev.step || '') }).then(function (entry) { if (entry) remember(entry); });
      return;
    }
    if (ev.type === 'delivery') {
      var ref = String(ev.ref || ''), st = String(ev.status || '');
      var pend = ble.pending[ref];
      if (st === 'credited' || st === 'duplicate') {
        delete ble.pending[ref];
        log('bluetooth hand-over ' + st + ' in ' + ev.ms + ' ms');
        account.markDelivered(ref, { via: 'bluetooth', result: st }).then(function () {
          return account.setCarrier(ref, { state: 'ble-done', ms: Number(ev.ms) || 0 });
        }).then(function (entry) { if (entry) appendRow(entry); });
        return;
      }
      if (st.indexOf('refused:') === 0) {
        // The receiving phone checked it and said no: another hand-over would be refused the same way.
        delete ble.pending[ref];
        account.setCarrier(ref, { state: 'failed', note: 'Refused by the receiving phone (' + st.slice(8) + ')' }).then(function (entry) { if (entry) appendRow(entry, 'qr'); });
        if (typeof W.showToast === 'function') W.showToast('The receiving phone refused this payment (' + st.slice(8) + ').', { tone: 'amber' });
        return;
      }
      if (pend) bleFallback(pend.payment, (pend.code && pend.code.address) || '', st.replace(/^failed:/, ''));
      else account.outgoing(ref).then(function (pmt) { if (pmt && !pmt.delivered) bleFallback(pmt, (pmt.carrier && pmt.carrier.to) || '', st); });
      return;
    }
    if (ev.type === 'payment') {
      var id = String(ev.id || '');
      var b = bleBridge();
      acceptPayment(String(ev.text || ''), 'bluetooth', function (status, reason) {
        if (b) { try { b.bleReceiverResult(id, status === 'refused' ? 'refused:' + (reason || 'refused') : status); } catch (_) { /* ignore */ } }
      });
    }
  }
  W.stablesBleEvent = function (ev) { try { onBleEvent(ev); } catch (e) { log('bluetooth event: ' + (e && e.message)); } };
  W.stablesInstantBleEnable = enableBle;

  /* A SCANNED CODE NEVER PAYS BY ITSELF (founder 2026-10-06, build 0.0.12.061; Machinery D122). Build 0.0.12.021 paid
     at once when the code (or the payer, before scanning) gave an amount within quick pay. A scan cannot prove the
     other phone is next to you: a QR on a web page, a screen far away or a sticker over a shop's code reads the same,
     so a swapped code was paid without anyone looking. Now the scan fills the form (payee, currency, amount) and the
     payer presses Confirm send, as D087's own words asked ("the payer scans and confirms, the payment goes directly").
     A tap (NFC, D060) keeps one touch within quick pay: four centimetres is proof of being next to the other phone. */
  /* The moment a payment leaves, a small pop-up (closed with one tap) follows it step by step (founder 2026-10-04,
     build 0.0.12.028: "as soon a transaction is triggered, we need a little pop-up (easy to close) showing what is
     going on"). It is the one progress view (stablesShowSendResultModal) that "View progress" opens, reading this
     payment's record live (progressById), so the pop-up, the row and the details never disagree. */
  function showPaymentProgress(payment) {
    if (typeof W.stablesShowSendResultModal !== 'function' || !payment) return;
    var cur = currencyOfRecord(payment);
    try {
      W.stablesShowSendResultModal({
        title: 'Progress', status: 'Paid', amount: money(BigInt(payment.amount), cur), address: '', txid: '',
        pendingOnChain: true, progressTitle: 'Status', rowId: P.ROW_PREFIX + 'OUT-' + payment.counter, openProgress: true,
        receiverNote: false, note: 'You can close this. Activity keeps updating.'
      });
    } catch (e) { log('progress pop-up: ' + (e && e.message)); }
  }
  function canSendOverNetwork(code) {
    return !!(code && code.address && notByTap(code) && chain && chainAvailability().ok && typeof chain.sendCarrier === 'function');
  }
  function handOver(payment, code) {
    if (code && code.link && notByTap(code) && bleNow() === 'on') {
      if (isOpen('sendModal') && typeof W.closeModal === 'function') W.closeModal('sendModal');
      sendByBluetooth(payment, code);
      showPaymentProgress(payment);
      return;
    }
    // Just after the app opened, its node connection may still be coming up: wait for it (up to 10 s) rather than fall
    // back to the QR at once (seen in the lab, build 0.0.12.029: a payment made seconds after a reload showed its QR).
    if (code && code.address && notByTap(code) && chain && !chainAvailability().ok && !(handOver.waited > 0)) {
      if (isOpen('sendModal') && typeof W.closeModal === 'function') W.closeModal('sendModal');
      showPaymentProgress(payment);
      var t0 = Date.now();
      (function wait() {
        if (chainAvailability().ok || Date.now() - t0 > 10000) { handOver.waited = 1; try { handOver(payment, code); } finally { handOver.waited = 0; } return; }
        setTimeout(wait, 500);
      })();
      return;
    }
    if (canSendOverNetwork(code)) {
      // As after a Savings send: the sheet closes and the Wallet shows the row going out ("Sending").
      if (isOpen('sendModal') && typeof W.closeModal === 'function') W.closeModal('sendModal');
      sendOverNetwork(payment, code.address, 1);
      showPaymentProgress(payment);
      return;
    }
    deliver(payment);
  }
  function sendOverNetwork(payment, to, attempt) {
    var cur = currencyOfRecord(payment);
    return account.setCarrier(payment.ref, { to: to, state: 'sending', attempt: attempt, at: Date.now() }).then(function (entry) {
      if (entry) appendRow(entry);
      return chain.sendCarrier({ text: payment.text, to: to, tokenId: '0x' + payment.tokenId, label: cur ? cur.label : '' });
    }).then(function (c) {
      return account.setCarrier(payment.ref, { state: 'posted', coinid: c.coinid, txnid: c.txnid, inputs: c.inputs, dustToken: c.dustToken, at: Date.now() });
    }).then(function (entry) {
      if (entry) appendRow(entry);
      follow();
    }).catch(function (e) {
      log('carrier not sent: ' + (e && (e.code || e.message)));
      return account.setCarrier(payment.ref, { state: 'failed', note: (e && e.message) || '' }).then(function (entry) {
        if (entry) appendRow(entry, 'qr');
        if (attempt <= 1) deliver(payment);      // nothing went out: the receiver scans it, as before
      });
    });
  }
  /** Carriers on their way: delivered once in a block; one dropped from the mempool goes again (the same text). */
  var CARRIER_TRIES = 3;
  var carrierIdTried = {};
  function advanceCarriers() {
    if (!account || !chain || typeof chain.carrierState !== 'function') return Promise.resolve(false);
    return account.journal().then(function (entries) {
      // A Bluetooth hand-over the app lost (closed in the middle): after 30 s it goes by the network instead.
      entries.forEach(function (e) {
        if (e.kind !== 'out' || e.delivered || !e.carrier || e.carrier.state !== 'ble' || ble.pending[e.ref]) return;
        if (Date.now() - Number(e.carrier.at || 0) < 30000) return;
        account.outgoing(e.ref).then(function (pmt) { if (pmt) bleFallback(pmt, e.carrier.to || '', 'lost'); });
      });
      var incoming = entries.filter(function (e) { return e.kind === 'in' && e.chain && e.chain.txpowid && !(Number(e.chain.block) > 0); });
      var inChecks = incoming.map(function (e) {
        return Promise.all([chain.node.cmd('txpow onchain:' + e.chain.txpowid, 'reading a received payment', 30000), chain.node.tip()]).then(function (res) {
          var q = res[0] || {}, tip = Number(res[1]) || 0, block = Number(q.block) || 0;
          if (!(q.found === true || q.found === 'true') || !block) return true;
          if (tip - block + 1 < confirmBlocksFor(e)) return true;
          return account.updateChain(e.id, { block: block }).then(function (entry) { if (entry) appendRow(entry); return false; });
        }, function () { return true; });
      });
      // Build 0.0.12.057: network payments delivered before their TxPoW id was kept get it now, once a session each.
      entries.forEach(function (e) {
        var c = e.carrier;
        if (e.kind !== 'out' || !c || c.state !== 'on-chain' || c.txpowid || !c.txnid || !(Number(c.block) > 0) || carrierIdTried[e.ref]) return;
        if (typeof chain.txpowInBlock !== 'function') return;
        carrierIdTried[e.ref] = true;
        chain.txpowInBlock(Number(c.block), c.txnid).then(function (id) {
          if (!id) return null;
          log('carrier ' + e.ref + ': TxPoW ' + id.slice(0, 12) + '…');
          return account.setCarrier(e.ref, { txpowid: id }).then(function (entry) { if (entry) appendRow(entry); });
        }).catch(function (err) { log('carrier ' + e.ref + ' TxPoW: ' + (err && (err.code || err.message))); });
      });
      var open = entries.filter(function (e) { return e.kind === 'out' && e.carrier && e.carrier.state === 'posted' && !e.delivered; });
      return open.reduce(function (p, e) {
        return p.then(function (any) {
          return chain.carrierState(e.carrier).then(function (st) {
            if (st.depth != null) {
              return account.markDelivered(e.ref, { via: 'network', result: 'on-chain' }).then(function (entry) {
                return account.setCarrier(e.ref, { state: 'on-chain', block: st.block, txpowid: st.txpowid || '' });
              }).then(function (entry) { if (entry) appendRow(entry); return any; });
            }
            if (st.dropped) {
              var n = Number(e.carrier.attempt || 1);
              if (n >= CARRIER_TRIES) return account.setCarrier(e.ref, { state: 'failed', note: 'Not delivered over the network' }).then(function (entry) { if (entry) appendRow(entry, 'qr'); return any; });
              return account.outgoing(e.ref).then(function (pmt) { if (pmt) sendOverNetwork(pmt, e.carrier.to, n + 1); return true; });
            }
            return true;
          }, function (err) { log('carrier ' + e.ref + ': ' + (err && (err.code || err.message))); return true; });
        });
      }, Promise.resolve(false)).then(function (anyOut) {
        return Promise.all(inChecks).then(function (ins) { return anyOut || ins.some(Boolean); });
      });
    });
  }

  /**
   * The receiving side of the network channel: tx-mirror hands every transaction it reads from this node's
   * history here first. One carrying an Instant payment (instant-chain.js carrierText) is never a Savings
   * row; when the payment inside names THIS account it is received through the one receive path, exactly
   * as a scan or a tap is (acceptPayment), and is final at that moment. The payer's own carrier, or anyone
   * else's, is simply not ours. A payment read twice (the live read, then a later history pass) is credited
   * once: the protocol's duplicate refusal, said nowhere.
   */
  var carriersTaken = {};
  function takeCarrier(txpow) {
    var text = CC && typeof CC.carrierText === 'function' ? CC.carrierText(txpow) : '';
    if (!text) return false;
    var id = String((txpow && txpow.txpowid) || '');
    if (!account || !ready()) return true;                 // a later pass takes it, once the account is open
    if (id && carriersTaken[id]) return true;
    if (id) carriersTaken[id] = true;
    var parsed = null;
    try { parsed = P.parse(text); } catch (_) { parsed = null; }
    if (!parsed || parsed.type !== 'payment') return true;
    var outs = (txpow && txpow.body && txpow.body.txn && txpow.body.txn.outputs) || [];
    var meta = { txpowid: id, coinid: String((outs[0] && outs[0].coinid) || '') };
    account.ensure().then(function (me) {
      if (!me || String(me.id).toLowerCase() !== String(parsed.payeeId).toLowerCase()) return null;
      // Credited now (or already, a duplicate said nowhere); either way the payment gets its on-chain record.
      return acceptPayment(text, 'network').then(function () { return account.attachChain(text, meta); }).then(function (entry) {
        if (entry) { appendRow(entry); follow(); }
      });
    }).catch(function (e) { log('carrier: ' + (e && (e.code || e.message))); });
    return true;
  }

  function payFailed(e) {
    log('pay refused: ' + (e && (e.code || e.message)));
    if (!sheetShows('sendModal')) return;
    formView();
    render();
    payError(messageOf(e));
    updateTier();
  }

  /**
   * A channel's offer, drawn from the STORED payment in the Send sheet, the way the person chose (law
   * 29, build 114). By tap: the status banner ("Hold the phones together to hand it over", D059) and the
   * amount, nothing about a QR. By QR code: the payment QR with its line and its text, nothing about
   * NFC, and the phone's reader rests (syncNfc). The choice above the sheet switches between the two
   * for the same stored payment (chooseWay); it replaces build 101's "Show QR code instead".
   */
  function showPayment(p) {
    if (!sheetShows('sendModal')) {
      // A "Paid offline" row opens Send on Instant payments for THIS payment; the person's
      // remembered choice is not touched (law 21).
      if (isOpen('sendModal') && typeof W.closeModal === 'function') W.closeModal('sendModal');
      if (typeof W.stablesOpenPaymentSheet === 'function') W.stablesOpenPaymentSheet('sendModal', 'instant');
    }
    if (!pay.showing || pay.showing.ref !== p.ref) pay.note = null;
    pay.showing = p;
    pay.delivered = false;
    pay.armed = null;
    pay.view = wayNow();
    unmountScanner();
    payError('');
    show('instantPayForm', false);
    show('instantPayShow', true);
    show('instantPayArmedOffer', false);
    var legacy = false;
    try { P.parse(p.text); } catch (e) { legacy = e && e.code === 'old-scheme'; }
    pay.legacy = legacy;
    var qr = pay.view === 'qr' || legacy;
    show('instantPayQrWrap', qr);
    show('instantPayTextRow', qr);                 // the text is the QR's equivalent: by QR code only
    // A payment made by an earlier test scheme (0x02, 0x03) can no longer be received: say so
    // instead of drawing a code that can only be refused.
    if (qr) renderQr('instantPayQr', legacy ? '' : p.text, legacy ? P.MESSAGES['old-scheme'] : '');
    setText('instantPayAmtShown', money(BigInt(p.amount), currencyOfRecord(p)));
    var text = el('instantPayText');
    if (text) text.value = oneLine(p.text);
    syncNfc();
  }

  /* ---------- the scanner's hand-off ---------- */
  /**
   * An Instant balance code read by the Send sheet while SAVINGS is chosen. Savings cannot pay it,
   * and the account is the person's choice (law 21): the app says which account can, and does not
   * switch accounts behind their back. The camera stays off (it would only read the same code
   * again); the Camera control and the account choice are both right there.
   */
  function savingsScanRefusal(text) {
    if (!isOpen('sendModal')) {
      if (typeof W.showToast === 'function') W.showToast(text, { tone: 'amber' });
      return;
    }
    try { if (typeof W.stablesStopSendCam === 'function') W.stablesStopSendCam(true); } catch (_) { /* ignore */ }
    var strip = el('sendCamStrip');
    if (strip) strip.style.display = '';
    var status = el('sendCamStatus');
    if (status) { status.textContent = text; status.style.display = ''; }
  }

  /**
   * Called by the scanner (stablesOnSendCamResult) BEFORE any other format is tried. Returns true
   * when the scan was an offline payload, or when an Instant flow hosts the scanner (then any other
   * code is refused in place instead of filling the on-chain Send form behind it).
   */
  function handleScan(raw) {
    raw = fromLink(raw);                           // D123: a QR may carry a stables: link
    var kind = P ? P.kindOf(raw) : '';
    var mode = scan.mode;
    if (!kind) {
      if (!mode) return false;
      if (mode === 'receive') { recvError('Scan the payment on the payer’s phone.'); parkScanner('instantRecvScanSlot', 'receive'); }
      else { payError('This is not a Stables card code.'); parkScanner('instantPayScanSlot', 'pay'); }
      return true;
    }
    if (kind === 'legacy') {
      var old = P.MESSAGES['old-scheme'];
      if (mode === 'receive') { recvError(old); parkScanner('instantRecvScanSlot', 'receive'); }
      else if (mode === 'pay') { payError(old); parkScanner('instantPayScanSlot', 'pay'); }
      else savingsScanRefusal(old);
      return true;
    }
    if (!ready()) {
      if (mode === 'receive') { recvError(UNAVAILABLE); unmountScanner(); }
      else if (mode === 'pay') payError(UNAVAILABLE);
      else savingsScanRefusal(UNAVAILABLE);
      return true;
    }
    if (kind === 'receiver') {
      if (mode === 'pay') {
        // A payment the scan started is under way: the camera reading the code again changes nothing.
        if (pay.committing) { stowScanner(); return true; }
        // D122: the scan fills the form and stops; Confirm send pays. The amount field is focused only when empty.
        if (setCode(raw, 'qr')) { stowScanner(); if (!pay.code || pay.code.amount == null) focusAmount(); }
        else parkScanner('instantPayScanSlot', 'pay');
      } else if (mode === 'receive') {
        recvError('This is a receiver code. Scan the payment on the payer’s phone.');
        parkScanner('instantRecvScanSlot', 'receive');
      } else {
        savingsScanRefusal('This is a Stables card code. Choose Stables card to pay it.');
      }
      return true;
    }
    // A payment: every channel ends in the same receive path.
    acceptPayment(raw, 'screen');
    return true;
  }

  /** The text equivalent of a scan on the receiving side: a payment pasted into its field. */
  function pasted(input) {
    var text = String((input && input.value) || '').trim();
    if (!text) return;
    var kind = P ? P.kindOf(text) : '';
    if (!kind) { recvError('This is not an offline payment.'); return; }
    if (kind === 'legacy') { recvError(P.MESSAGES['old-scheme']); return; }
    if (kind === 'receiver') { recvError('This is a receiver code. Paste the payment from the payer’s phone.'); return; }
    input.value = '';
    recvError('');
    acceptPayment(text, 'text');
  }

  /* ---------- the NFC channel (build 101, Machinery D059; the standalone Android app) ----------
   * The native side (StablesActivity, InstantNfcService, InstantNfc) moves bytes; this page decides.
   *   receiver: nfcReceiverSet(code)  the phone answers taps with this code (and takes payments)
   *             while the Instant Receive shows it; '' switches the card side off.
   *   payer:    nfcReaderSet(mode, ref, text)  'code' (ONE TAP, build 102) while Send waits for a
   *             receiver code or a confirmed payment waits for its receiver, 'deliver' with the STORED
   *             payment while it is on screen, 'off' otherwise;
   *             nfcTapPay(session, ref, text) / nfcTapDecline(session, reason)  this page's answer to
   *             a code read by tap, while the link is held open.
   *   events:   window.stablesNfcEvent({type:'state'|'payment'|'tap'|'tapend'|'code'|'delivery'|'bench', ...}).
   * The texts are the same 0x04 texts the QR carries; a payment taken by tap goes through
   * acceptPayment like any other, and its verdict is reported back to the payer's phone.
   */
  function nfcBridge() {
    var b = W.StablesNative;
    return b && typeof b.nfcAvailable === 'function' && typeof b.nfcEnabled === 'function'
      && typeof b.nfcReaderSet === 'function' && typeof b.nfcReceiverSet === 'function' ? b : null;
  }
  /**
   * Call a bridge method with EXACTLY the arguments given: Android's JavaBridge picks a method by its
   * argument count, so nfcAvailable(undefined, undefined, undefined) is "Method not found" (found on
   * the Pixel 7, build 101, before this was right).
   */
  function nfcCall(name) {
    var bridge = nfcBridge();
    if (!bridge || typeof bridge[name] !== 'function') return undefined;
    var a = Array.prototype.slice.call(arguments, 1);
    try {
      if (a.length === 0) return bridge[name]();
      if (a.length === 1) return bridge[name](a[0]);
      if (a.length === 2) return bridge[name](a[0], a[1]);
      return bridge[name](a[0], a[1], a[2]);
    } catch (e) { log('nfc ' + name + ' failed: ' + (e && e.message)); return undefined; }
  }
  /**
   * 'absent' (no bridge, or no NFC on this phone), 'off' (NFC switched off) or 'on'. Asked of the
   * phone once, then kept: the native side reports every change (the adapter switching, the app
   * coming back from the NFC settings) as a 'state' event, and a sheet asks again as it opens
   * (fresh), so nothing polls the bridge.
   */
  var nfcKnown = '';
  function nfcState(fresh) {
    if (!nfcBridge()) return 'absent';
    if (nfcKnown && !fresh) return nfcKnown;
    nfcKnown = !nfcCall('nfcAvailable') ? 'absent' : (nfcCall('nfcEnabled') ? 'on' : 'off');
    return nfcKnown;
  }

  /**
   * Tell the native side what this screen wants, only when it changed; then draw the notices.
   * Reader 'code' is the ONE-TAP mode (build 102): a tap reads the receiver's code and asks this page,
   * which may pay in the same session. It is armed while Send waits for a code, and while a confirmed
   * payment waits for its receiver (pay.armed). The reader is never re-pointed while a tap waits for
   * this page's answer (tap.session): the native side holds the link open for that answer.
   */
  /* OPTION C, THE WALLET ANSWERS A TAP (build 0.0.12.053; founder 2026-10-05: "that should be an option that the Wallet page
     itself answering a tap, by default it should be on and there should be an icon there indicating it"). While the Wallet
     is the thing on screen (no sheet, no Home, the app in front) the phone keeps its reader on as the card's Pay screen
     does. A tap opens the Pay screen and is decided there exactly as on it: within one touch it pays in that tap; above,
     the screen stays open asking to confirm; without an amount, it asks for one. */
  // The preference is kept by the shell (index.html): the card's files keep keys and balances in IndexedDB only.
  function walletTapOn() {
    return typeof W.stablesWalletTapOn === 'function' ? !!W.stablesWalletTapOn() : true;
  }
  function setWalletTap(on) {
    if (typeof W.stablesSetWalletTapPref === 'function') W.stablesSetWalletTapPref(!!on);
    log('the Wallet answers a tap: ' + (on ? 'on' : 'off'));
    syncNfc();
  }
  function walletListens() {
    if (!walletTapOn() || document.hidden) return false;
    var page = document.querySelector('.page.active:not(.page--peek)');
    if (!page || page.id !== 'page-wallet') return false;
    return !document.querySelector('.mback.open, .dback.open');
  }
  function renderWalletTap(st) {
    var icon = el('walletTapIcon');
    if (icon) {
      icon.hidden = !(walletTapOn() && st !== 'absent' && nfcBridge());
      icon.setAttribute('data-live', walletListens() && st === 'on' ? '1' : '0');
    }
    var box = el('instantWalletTap');
    if (box && box.checked !== walletTapOn()) box.checked = walletTapOn();
  }
  function syncNfc() {
    syncBle();
    var st = nfcState();
    if (nfcBridge()) {
      // Law 29 (build 114): by QR code the phone's NFC side is off, both as receiver and as payer.
      var byTap = wayNow() === 'nfc';
      var code = (st === 'on' && byTap && ready() && sheetShows('recvModal') && recv.code) ? recv.code : '';
      if (code !== nfc.code) { nfc.code = code; nfcCall('nfcReceiverSet', code); }
      if (!tap.session) {
        var mode = 'off', ref = '', text = '';
        if (st === 'on' && byTap && ready() && (sheetShows('sendModal') || walletListens())) {
          if (pay.showing && !pay.delivered && !pay.legacy) { mode = 'deliver'; ref = pay.showing.ref; text = pay.showing.text; }
          // D095/D096: the reader stays on until a payment is made. A tap that only read the other phone (no amount yet)
          // must leave it on, so the next tap, with the amount typed, reads again and pays (founder's Pro, build 0.0.12.032:
          // "holding the phone together doesn't work now": after the first read the reader was off).
          else if (!pay.showing && !pay.committing) mode = 'code';
        }
        if (mode !== nfc.mode || ref !== nfc.ref) { nfc.mode = mode; nfc.ref = ref; nfcCall('nfcReaderSet', mode, ref, text); }
      }
    }
    renderNfc(st);
    renderWalletTap(st);
  }

  /** One status banner per sheet (M-EL-STATUS, mx-status-banner; D059): off, hold, or an outcome. */
  function banner(id, spec) {
    var box = el(id);
    if (!box) return;
    if (!spec) { box.hidden = true; return; }
    box.hidden = false;
    if (spec.tone) box.setAttribute('data-tone', spec.tone); else box.removeAttribute('data-tone');
    setText(id + 'Icon', spec.icon);
    setText(id + 'Title', spec.title);
    setText(id + 'Body', spec.body);
    show(id + 'Action', !!spec.settings);
  }
  var HOLD = '\u2194';                              // two-way arrow: the two phones
  function nfcOff(verb) {
    return { tone: 'warning', icon: '!', title: 'NFC is off', settings: true,
      body: 'Turn it on to ' + verb + ' by holding the phones together.' };
  }
  function renderNfc(st) {
    st = st || nfcState();
    // Law 29 (build 114): the banner belongs to the tap. By QR code nothing about NFC is drawn.
    var usable = ready() && st !== 'absent' && wayNow() === 'nfc';
    // Receive: say how the payment arrives; say it plainly when NFC is off.
    var recvSpec = null;
    if (usable && sheetShows('recvModal')) {
      if (st === 'off') recvSpec = nfcOff('receive');
      else if (recv.tapSteps && recv.tapBanner) recvSpec = recv.tapBanner;   // D127: the arrival stays said while its steps show
      else if (recv.code) recvSpec = { icon: HOLD, title: 'Hold the phones together', body: 'The payer\u2019s phone pays by tap.' };
    }
    banner('instantRecvNfc', recvSpec);
    // Send (build 102, D060): NFC off; "Hold the phones together" BEFORE a confirmation (a tap reads
    // the other phone's request and, within quick pay, pays it); AFTER it, law 28 (build 114): what the
    // person does next AND where the payment stands, in those words: confirmed and waiting for the tap
    // that pays it (HOLD_ARMED), or signed and waiting to be handed over (HOLD_SIGNED); and what the
    // last tap did.
    var paySpec = null;
    if (usable && sheetShows('sendModal')) {
      if (st === 'off') paySpec = nfcOff('pay');
      // D127: once the payment went over, the banner says what is happening now: waiting for the other phone's answer.
      else if (pay.tapSteps && !pay.tapSteps.confirmedAt && !pay.tapSteps.failed && !pay.note) paySpec = HOLD_WAITING;
      else if (pay.showing && !pay.legacy) paySpec = pay.note || HOLD_SIGNED;
      // D127: a request the first tap read, confirmed since: the second tap is "once more".
      else if (pay.armed) paySpec = pay.note || (pay.code && pay.source === 'nfc' ? HOLD_ARMED_AGAIN : HOLD_ARMED);
      else if (!pay.showing) {
        // D097: the card cannot cover the amount: the panel itself says so, in red (the founder's Pro had 0 Winiwa and
        // only a disabled Confirm to show for it).
        var fp = fundsProblem();
        paySpec = fp ? { tone: 'danger', icon: '!', title: 'Not enough on your card',
          body: fp.amount != null ? 'Your Stables card holds ' + money(fp.balance, fp.cur) + '. This payment is ' + money(fp.amount, fp.cur) + '.'
            : 'Your Stables card holds no ' + fp.cur.label + '.' } : (pay.note || holdBefore());   // 0.0.12.038: what the last tap found
      }
    }
    banner('instantPayNfc', paySpec);
    drawTapSteps('instantPaySteps', usable && sheetShows('sendModal') ? payTapSteps() : null);
    drawTapSteps('instantRecvSteps', usable && sheetShows('recvModal') ? recv.tapSteps : null);
  }
  var HOLD_ARMED = { icon: HOLD, title: 'Hold the phones together to pay', body: 'The payment is made when the phones touch.' };
  var HOLD_ARMED_AGAIN = { icon: HOLD, title: 'Hold the phones together once more', body: 'Confirmed. The payment is made when the phones touch again.' };
  var HOLD_WAITING = { icon: HOLD, title: 'Keep the phones together', body: 'Waiting for the other phone’s confirmation.' };

  /* EACH STEP OF A TAP, SAID AS IT HAPPENS (founder 2026-10-07, build 0.0.12.066, Machinery D127): "it must be clearly
     presented each step, message sent or received, waiting for confirmation then the confirmation we have". The payer
     sees: Payment sent, Waiting for the other phone's confirmation, Confirmed; the receiver: Payment received, Checked and
     credited, Confirmation sent. Each done step carries its time. */
  function payTapSteps() {
    var t = pay.tapSteps;
    if (!t) return null;
    var confirmed = !!t.confirmedAt;
    return [
      { label: 'Payment sent', state: 'done', at: t.sentAt },
      { label: confirmed ? 'Confirmed by the other phone' : (t.failed ? 'No confirmation' : 'Waiting for confirmation'),
        state: confirmed ? 'done' : (t.failed ? 'failed' : 'now'), at: t.confirmedAt || t.failedAt || 0 },
      { label: 'Paid', state: confirmed ? 'done' : 'next', at: t.confirmedAt || 0 }
    ];
  }
  function stepTime(ms) {
    if (!ms) return '';
    try { return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); } catch (_) { return ''; }
  }
  function drawTapSteps(id, steps) {
    var list = el(id);
    if (!list) return;
    list.replaceChildren();
    if (!steps || !steps.length) { list.hidden = true; return; }
    var marks = { done: '✓', now: '•', next: '○', failed: '✕' };
    steps.forEach(function (s) {
      var li = D.createElement('li');
      li.className = 'tap-step tap-step--' + s.state;
      var mark = D.createElement('span'); mark.className = 'tap-step__mark'; mark.setAttribute('aria-hidden', 'true'); mark.textContent = marks[s.state] || '';
      var label = D.createElement('span'); label.className = 'tap-step__label'; label.textContent = s.label;
      var time = D.createElement('span'); time.className = 'tap-step__time'; time.textContent = s.state === 'done' || s.state === 'failed' ? stepTime(s.at) : '';
      li.appendChild(mark); li.appendChild(label); li.appendChild(time);
      list.appendChild(li);
    });
    list.hidden = false;
  }
  var HOLD_SIGNED = { icon: HOLD, title: 'Hold the phones together to hand it over', body: 'The payment is signed and waiting on this phone.' };
  /**
   * Before anything is confirmed. With an amount in the form (typed, or filled by a code) the person is
   * told to confirm first; otherwise what one tap pays at once: a request up to the quick-pay room, or,
   * with quick pay off or used up, only a read of the request.
   */
  function holdBefore() {
    var typed = false;
    try { typed = readAmount() != null; } catch (_) { typed = false; }
    var room = typed ? '' : quickRoomText();
    var atoms = null;
    try { atoms = readAmount(); } catch (_) { atoms = null; }
    var cur = pickerCurrency('instantPayCcy');
    if (typed && cur && atoms != null && quickTap(atoms, cur)) return { icon: HOLD, title: 'Hold near the other phone to pay', body: money(atoms, cur) };
    var body = typed ? 'Confirm send, then hold the phones together.'
      : (room ? 'Type the amount, or tap: a request up to ' + room + ' is paid in one tap.' : 'Type the amount, then hold the phones together.');
    return { icon: HOLD, title: 'Hold the phones together', body: body };
  }

  /** What a tap that did not end in "received" means for the payer, in plain words. */
  var REFUSED_BY_OTHER_PHONE = {
    'wrong-receiver': 'That phone is not the receiver of this payment.',
    'asset': 'That phone does not offer this currency.',
    'unavailable': 'That phone cannot hold a Stables card.',
    'version': 'That phone needs a newer version of Stables.',
    'old-scheme': 'That phone could not read this payment.',
    'malformed': 'That phone could not read this payment.',
    'bad-signature': 'That phone could not verify this payment.',
    'amount-invalid': 'That phone cannot take this amount.',
    'busy': 'That phone was busy. Hold the phones together again.'
  };
  /** A short vibration where the phone allows it (the end of a tap, as a card terminal beeps). */
  function buzz(pattern) { try { if (W.navigator && typeof W.navigator.vibrate === 'function') W.navigator.vibrate(pattern); } catch (_) { /* ignore */ } }
  function deliveryNote(ev) {
    var again = 'Hold the phones together again.';
    switch (ev && ev.status) {
      case 'lost': return { icon: HOLD, title: 'Hold the phones together', body: 'The phones moved apart. ' + again };
      case 'no-answer': return { icon: HOLD, title: 'Hold the phones together', body: 'The other phone did not answer. ' + again };
      case 'not-stables': return { icon: HOLD, title: 'Hold the phones together', body: 'That was not a phone showing Stables.' };
      // Law 28 (build 114): the payment is still in flight (stored, waiting), so the banner says what to do.
      case 'not-open': return { tone: 'warning', icon: '!', title: 'Get the other phone ready', body: 'Open Receive there with Stables card chosen, then hold the phones together again.' };
      default: return { tone: 'danger', icon: '!', title: 'Check the other phone', body: REFUSED_BY_OTHER_PHONE[ev && ev.reason] || 'That phone refused this payment.' };
    }
  }

  /** Receiver: a whole payment came by tap. Its verdict goes back to the payer's phone. */
  function onNfcPayment(ev) {
    var id = String(ev.id || '');
    acceptPayment(String(ev.text || ''), 'nfc', function (status, reason) {
      nfcCall('nfcReceiverResult', id, status, reason);
    });
  }
  /** Payer: a tap that could not read the receiver's code (the page was not asked; nothing was paid). */
  function onNfcCode(ev) {
    nfc.mode = '';                                 // re-tell the native side what this screen wants
    if (sheetShows('sendModal') && !pay.showing && !pay.committing) {
      if (pay.armed) {
        if (ev.status === 'not-open' || ev.status === 'lost' || ev.status === 'not-stables') pay.note = deliveryNote(ev);
      } else if (!pay.code && ev.status === 'not-open') {
        payError('Open Receive on the other phone, with Stables card chosen.');
      }
    }
    syncNfc();
  }

  /* ---------- ONE TAP (build 102, founder 2026-09-28; Machinery D060) ----------
   * The native side has read the receiver's code and holds the link open while this page decides:
   *   nfcTapPay(session, ref, text)   committed and signed for exactly that receiver: hand it over;
   *   nfcTapDecline(session, reason)  nothing paid in this tap ('filled': the code only filled the
   *                                   form; 'mismatch'; or a refusal code).
   * The answer goes back BEFORE any drawing, so the phones are held together for the commit, the
   * signature and the hand-over only. Everything else (the row, the Wallet, the "Hold the phones
   * together" view) follows the answer.
   */
  function onNfcTap(ev) {
    var session = String((ev && ev.session) || '');
    if (!session) return;
    tap.session = session;
    var t0 = now();
    var answered = false;
    function answer(r) {
      if (answered) return;
      answered = true;
      var late = tap.session !== session;         // the phone gave up waiting ('tapend' page-timeout)
      if (r && r.payment) {
        nfcCall('nfcTapPay', session, r.payment.ref, r.payment.text);
        pay.tapSteps = { ref: r.payment.ref, sentAt: Date.now() };   // D127: step 1 done, step 2 (the answer) begins
      }
      else nfcCall('nfcTapDecline', session, (r && r.reason) || 'declined');
      if (tap.session === session) tap.session = '';
      log('tap: ' + (r && r.payment ? 'paid' : 'nothing paid (' + ((r && r.reason) || 'declined') + ')') + ', page ' + Math.round(now() - t0) + ' ms' + (late ? ', after the tap ended' : ''));
      if (r && typeof r.after === 'function') { try { r.after(late); } catch (e) { log('tap after: ' + (e && e.message)); } }
      syncNfc();
    }
    var decided;
    try { decided = decideTap(String((ev && ev.text) || '')); } catch (e) { decided = { reason: 'error' }; }
    Promise.resolve(decided).then(answer, function () { answer({ reason: 'error' }); });
  }

  /** What this tap does with the code it read: pay now ({payment, after}) or not ({reason}). */
  function decideTap(text) {
    if (!sheetShows('sendModal') && ready() && walletListens() && typeof W.stablesOpenCardScreen === 'function') {
      log('tap: answered from the Wallet; the Pay screen decides it');
      W.stablesOpenCardScreen('pay');                 // option C: then exactly the Pay screen's own decision
    }
    if (!ready() || !sheetShows('sendModal') || pay.showing || pay.committing) return { reason: 'not-ready' };
    var code = null;
    try { code = P.parse(text); } catch (e) { payError(messageOf(e)); return { reason: (e && e.code) || 'malformed' }; }
    if (!code || code.type !== 'receiver') { payError(safeMessage('malformed')); return { reason: 'malformed' }; }
    var confirmed = pay.armed || freshConfirmation();
    return confirmed ? payConfirmed(code, confirmed) : payRequest(text, code);
  }
  function freshConfirmation() {
    var c = pay.confirmedFor;
    return c && Date.now() - c.at < 5 * 60 * 1000 ? c : null;
  }

  /**
   * Paying a friend: the amount and currency were confirmed before the tap. The code names the
   * receiver; if it asks for another amount or currency than the one confirmed, nothing is paid and
   * the reason is said in place ("Not paid"). Otherwise the confirmed payment is committed for it.
   */
  function payConfirmed(code, confirmed) {
    var a = confirmed || pay.armed;
    var why = askedOtherwise(code, a);
    if (why) {
      pay.note = { tone: 'danger', icon: '!', title: 'Not paid', body: why };
      renderNfc();
      return { reason: 'mismatch' };
    }
    // Within quick pay (law 24) the tap's payment counts against the day's quick-pay room.
    return commitTap(code, a.atoms, a.intent, a.cur, pay.armedQuick || null);
  }
  /** The reason a code asks for something other than what was confirmed, or ''. */
  function askedOtherwise(code, a) {
    var asked = currencyForToken(code.tokenId);
    var mine = money(a.atoms, a.cur);
    if (!asked || asked.tokenId !== a.cur.tokenId) return 'That phone asks for ' + (asked ? asked.label : 'another currency') + '. You confirmed ' + mine + '.';
    if (code.amount != null && code.amount !== a.atoms) return 'That phone asks for ' + money(code.amount, asked) + '. You confirmed ' + mine + '.';
    return '';
  }

  /**
   * Shop style: nothing was confirmed, so the code's request fills the form exactly as a scan does.
   * Within quick pay (the Savings tiers) the request is paid in this same tap; otherwise the person
   * confirms first ('filled'), with the payment code if the tier asks for it, and taps again. A request
   * is never paid in the tap when the person had typed a different amount or currency, when the balance
   * cannot cover it (refused in place), or when it carries no amount.
   */
  function payRequest(text, code) {
    var before = typedPayment();
    if (!setCode(text, 'nfc')) return { reason: 'refused' };
    stowScanner();
    var cur = currencyForToken(code.tokenId);
    if (code.amount == null || !cur) {
      /* THE SHOP-CARD WAY (founder 2026-10-04, build 0.0.12.032, Machinery D095): "tap, signal is gone, signal it's coming
         on the other side, done!". An amount the payer typed before the tap, within quick pay, is paid by THIS tap: no
         Confirm, no second tap. (His Pro: the first tap only read the code, Confirm then signed a payment that waited
         for a second tap, which never came, so nothing arrived.) */
      if (cur && before && before.cur && before.cur.tokenId === cur.tokenId && balanceOf(cur.tokenId) >= before.atoms) {
        var q = quickTap(before.atoms, cur);
        if (q) return commitTap(code, before.atoms, P.newPaymentId(), cur, q);
        return aboveOneTouch(before.atoms, cur);
      }
      log('tap: read the request; ' + (cur ? 'no amount on either phone' : 'currency not on this card'));
      focusAmount();
      pay.note = { icon: HOLD, title: 'Enter the amount', body: 'Then hold the phones together once more to pay.' };
      renderNfc();
      return { reason: 'filled' };
    }
    if (before && (before.atoms !== code.amount || before.cur.tokenId !== cur.tokenId)) { log('tap: not paid, the typed amount differs from the request'); return { reason: 'filled' }; }
    if (balanceOf(cur.tokenId) < code.amount) { log('tap: not paid, the card holds less than the request'); return { reason: 'filled' }; }
    var quick = quickTap(code.amount, cur);
    if (!quick) return aboveOneTouch(code.amount, cur);
    return commitTap(code, code.amount, P.newPaymentId(), cur, quick);
  }
  /**
   * A tap the card's levels keep from paying at once (build 0.0.12.038; founder's Pro: three taps read a 22 Winiwa
   * request and said nothing, then Confirm and a fourth tap paid). The panel now says why and what to do, with the
   * one-touch room, and the log names the level.
   */
  function aboveOneTouch(atoms, cur) {
    var ps = W.StablesPaymentSecurity;
    var step = ps && typeof ps.cardTier === 'function' ? ps.cardTier(fiatOf(atoms, cur)) : 'code';
    var room = quickRoomText();
    log('tap: not paid at once, ' + money(atoms, cur) + ' is at the ' + step + ' level (one touch up to ' + (room || 'off') + ')');
    pay.note = {
      icon: HOLD,
      // D127 (founder 2026-10-07): "we should say then hold the phones together once more if confirmation is needed".
      title: step === 'confirm' ? 'Press Confirm send, then hold the phones together once more' : 'Confirm with your code, then hold the phones together once more',
      body: money(atoms, cur) + ' is above one touch' + (room ? ' (up to ' + room + ' now)' : '') + '. Set the levels on your Stables card.'
    };
    renderNfc();
    return { reason: 'filled' };
  }
  /** The amount and currency the person had typed before the tap, or null. */
  function typedPayment() {
    var atoms = null;
    try { atoms = readAmount(); } catch (_) { atoms = null; }
    return atoms == null ? null : { atoms: atoms, cur: pickerCurrency('instantPayCcy') };
  }

  /**
   * COMMIT FIRST, inside the tap: account.pay() debits, advances the counter and stores the signed
   * payment in one durable transaction; only what it returned goes back to the native side. A quick
   * payment counts against the daily quick-pay cap, as a Savings quick pay does.
   */
  function commitTap(code, atoms, intent, cur, quick) {
    pay.committing = true;
    return account.pay(code, atoms, { paymentId: intent, tokenId: cur.tokenId }).then(function (res) {
      pay.committing = false;
      pay.armed = null;
      pay.confirmedFor = null;
      pay.intent = null;
      var ps = W.StablesPaymentSecurity;
      if (res.status === 'paid' && ps && typeof ps.recordCardSpend === 'function') ps.recordCardSpend(fiatOf(atoms, cur));   // D098: day and week
      if (res.status === 'paid' && typeof W.stablesPaymentTone === 'function') W.stablesPaymentTone('sent');                  // build 0.0.12.059
      return { payment: res.payment, after: function (late) { committedInTap(res, late); } };
    }, function (e) {
      pay.committing = false;
      if (pay.armed) pay.note = { tone: 'danger', icon: '!', title: 'Not paid', body: messageOf(e) };
      else payError(messageOf(e));
      render();
      return { reason: (e && e.code) || 'error' };
    });
  }
  /** After the answer went back: the row, the Wallet under the sheet, and the payment on screen. */
  function committedInTap(res, late) {
    if (res.entry) appendRow(res.entry, 'nfc');
    if (typeof W.navigate === 'function') W.navigate('wallet');   // law 1: Back lands on the Wallet
    deliver(res.payment);
    if (late && pay.showing && pay.showing.ref === res.payment.ref) {
      // The phones were apart before the payment was handed over: it waits, stored, for the next tap.
      pay.note = { icon: HOLD, title: 'Hold the phones together', body: 'Hold the phones together again to finish.' };
      renderNfc();
    }
    refresh().catch(function () {});
  }

  /** The native side ended a tap that handed nothing over (declined, or the page answered too late). */
  function onNfcTapEnd(ev) {
    if (ev && ev.session && tap.session === ev.session) tap.session = '';
    nfc.mode = '';                                 // re-tell the native side what this screen wants
    syncNfc();
  }

  /* ---------- the tap bench (build 102; adb only, InstantNfcBench -> StablesActivity.runTapBench) ----------
   * Measures, on the phone, the page's part of a one tap with the real WebView, IndexedDB, WebCrypto and
   * bridge: the payer's parse, commit and signature (the same account.pay the tap makes) and the
   * receiver's check and credit. Two THROWAWAY accounts in their own databases, deleted at the end: the
   * person's own Instant payments are never read or written. Timings go to the console (logcat).
   */
  var BENCH_DBS = ['stables-instant-bench-payer', 'stables-instant-bench-payee'];
  var bench = null;
  function benchAccount(name) {
    var backend = P.createIndexedDbBackend({ dbName: name });
    return P.createAccount({ backend: backend, keyStore: P.createWebCryptoKeyStore(backend), legacyTokenId: tokenOfCode(LEGACY_CODE) });
  }
  function onNfcBench(ev) {
    var session = String(ev.session || '');
    var t0 = now();
    var no = function (reason) { nfcCall('nfcTapDecline', session, reason); };
    if (!supported() || !currencyList.length) { if (session) no('unsupported'); return; }
    if (ev.phase === 'setup') {
      var cur = currencyForCode(LEGACY_CODE) || currencyList[0];
      bench = { payer: benchAccount(BENCH_DBS[0]), payee: benchAccount(BENCH_DBS[1]), cur: cur };
      // The payer's throwaway account is funded through the load credit (the test credit is gone,
      // build 103): a made-up coin id in a throwaway store that is deleted at the end of the bench.
      bench.payer.creditLoad({ coinid: P.newPaymentId() + P.newPaymentId(), amount: P.parseAmount('1000'), tokenId: cur.tokenId, source: 'bench' }).then(function () {
        return bench.payee.receiverCode({ tokenId: cur.tokenId });
      }).then(function (r) {
        log('bench: ready in ' + Math.round(now() - t0) + ' ms');
        nfcCall('nfcTapPay', session, 'bench-setup', r.text);
      }).catch(function (e) { no('setup-' + ((e && e.code) || 'error')); });
    } else if (ev.phase === 'tap') {
      if (!bench) { no('no-bench'); return; }
      var code = null;
      try { code = P.parse(String(ev.text || '')); } catch (e) { no('malformed'); return; }
      bench.payer.pay(code, P.parseAmount('1'), { paymentId: P.newPaymentId(), tokenId: bench.cur.tokenId }).then(function (res) {
        var ms = Math.round(now() - t0);
        nfcCall('nfcTapPay', session, res.payment.ref, res.payment.text);
        log('bench: payer commit and signature ' + ms + ' ms');
      }).catch(function (e) { no((e && e.code) || 'error'); });
    } else if (ev.phase === 'receive') {
      var id = String(ev.id || '');
      if (!bench) { nfcCall('nfcReceiverResult', id, 'refused', 'no-bench'); return; }
      bench.payee.receive(String(ev.text || '')).then(function () {
        nfcCall('nfcReceiverResult', id, 'credited', '');
        log('bench: receiver check and credit ' + Math.round(now() - t0) + ' ms');
      }).catch(function (e) {
        var c = (e && e.code) || 'error';
        nfcCall('nfcReceiverResult', id, c === 'duplicate' ? 'duplicate' : 'refused', c);
      });
    } else if (ev.phase === 'cleanup') {
      bench = null;
      var gone = BENCH_DBS.map(function (name) {
        return new Promise(function (res) {
          try { var r = W.indexedDB.deleteDatabase(name); r.onsuccess = r.onerror = r.onblocked = function () { res(); }; } catch (_) { res(); }
        });
      });
      Promise.all(gone).then(function () { no('done'); });
    }
  }
  /** Payer: what the receiver's phone answered about the payment on screen. */
  function onNfcDelivery(ev) {
    nfc.mode = '';                                 // the reader may have rested itself
    var ok = ev.status === 'credited' || ev.status === 'duplicate';
    if (ok && account && ev.ref) {
      // "Received": the one confirmation the payer can have. Recorded on the stored payment.
      account.markDelivered(ev.ref, { via: 'nfc', result: ev.status }).then(function (entry) {
        if (entry) appendRow(entry);
      }).catch(function (e) { log('delivery record failed: ' + (e && (e.code || e.message))); });
    }
    var p = pay.showing;
    // D127: the answer is the step the payer waits for; it is recorded whatever the screen shows.
    if (!pay.tapSteps || pay.tapSteps.ref !== ev.ref) pay.tapSteps = { ref: ev.ref, sentAt: Date.now() };
    if (ok) pay.tapSteps.confirmedAt = Date.now();
    else { pay.tapSteps.failed = true; pay.tapSteps.failedAt = Date.now(); }
    if (!p || p.ref !== ev.ref || !sheetShows('sendModal')) { syncNfc(); return; }
    if (ok) {
      pay.delivered = true;
      // D095: the terminal's end state, said and felt (a short vibration), then the Wallet with the row "Received".
      pay.note = { tone: 'success', icon: '\u2713', title: 'Paid', body: money(BigInt(p.amount), currencyOfRecord(p)) + ' \u00b7 received by the other phone' };
      syncNfc();
      buzz([60, 40, 60]);
      // D127: long enough to read the three steps and their times before the Wallet.
      setTimeout(function () {
        if (typeof W.closeModal === 'function') W.closeModal('sendModal');
        if (typeof W.navigate === 'function') W.navigate('wallet');
      }, 3000);
      return;
    }
    pay.note = deliveryNote(ev);
    syncNfc();
  }
  /** NFC switched on or off (or the app came back): the preferred channel follows it. */
  function onNfcState(ev) {
    if (ev && typeof ev.available === 'boolean' && typeof ev.enabled === 'boolean') nfcKnown = !ev.available ? 'absent' : (ev.enabled ? 'on' : 'off');
    else nfcState(true);
    nfc.mode = '';
    pay.note = null;                               // an earlier tap's outcome no longer describes the state
    if (pay.armed && nfcState() !== 'on' && !pay.committing) {
      // A confirmed payment waiting for a tap that can no longer come: back to the form, what was typed
      // kept. The banner says "NFC is off" with the settings; "By QR code" is the other way (law 29).
      pay.intent = null;
      formView();
    }
    // A stored payment on screen stays in the way the person chose: with NFC now off the banner says so.
    render();                                      // (the choice, the Confirm button, and syncNfc)
  }
  W.stablesNfcEvent = function (ev) {
    try {
      if (!ev || typeof ev !== 'object') return;
      if (ev.type === 'payment') onNfcPayment(ev);
      else if (ev.type === 'tap') onNfcTap(ev);
      else if (ev.type === 'tapend') onNfcTapEnd(ev);
      else if (ev.type === 'bench') onNfcBench(ev);
      else if (ev.type === 'code') onNfcCode(ev);
      else if (ev.type === 'delivery') onNfcDelivery(ev);
      else if (ev.type === 'state') onNfcState(ev);
    } catch (e) { log('nfc event failed: ' + (e && e.message)); }
  };
  function openNfcSettings() { nfcCall('nfcOpenSettings'); }

  /* The NFC channel: registered only where the native bridge exists, and registered AFTER the
     screen channel, so it is preferred whenever it is available (NFC present and on). */
  if (nfcBridge()) registerDeliveryChannel({
    id: 'nfc',
    available: function () { return nfcState() === 'on'; },
    offer: function (payment) { showPayment(payment); },
    listen: function () { syncNfc(); },
    stop: function () { syncNfc(); }
  });

  /* ---------- lifecycle hooks called from the shell ---------- */
  function onAccountView(id, acc, opts) {
    // Send is only ever a payment (law 25, build 104): a move between the person's own accounts has
    // its own page (build 105), so no opening of this sheet is preset with a recipient.
    if (id === 'sendModal') { if (acc === 'instant') enterPay(opts); else leavePay(); }
    if (id === 'recvModal') { if (acc === 'instant') enterReceive(opts); else leaveReceive(); }
  }

  function onClose(id) {
    if ((id === 'recvModal' || id === 'sendModal') && !pay.committing) far = false;   // D123: the code way lasts one opening
    if (id === 'recvModal') {
      if (scan.mode === 'receive') unmountScanner();
      showPaste(false);
    }
    if (id === 'sendModal') {
      pay.showing = null;
      pay.view = null;
      pay.note = null;
      pay.delivered = false;
      pay.armed = null;                            // closing Send cancels a confirmation that paid nothing yet
      pay.confirmedFor = null;
      pay.armedQuick = null;
      if (scan.mode === 'pay') unmountScanner();
      if (!pay.committing) resetForm();
    }
    syncNfc();
  }

  /** A currency chosen in one of the Instant pickers (index.html __VAULT_DD_ON_PICK). */
  function onCurrencyPick(id) {
    if (id === 'instantPayCcy') { payError(''); render(); updateTier(); }
    else if (id === 'instantRecvCcy') { recvError(''); drawReceiverCode(); }
    else if (id === MOVE_CCY) moveInput();
  }

  /**
   * Every Instant row opens the shared Transaction details (founder law 27, build 107: every transaction offers
   * "View progress"). Before build 107 a "Paid offline" row re-showed its payment and a receipt opened nothing.
   * Re-showing a torn transfer is still there, as "Show payment again" in the details (reshow below).
   */
  function openRow(id) { return false; }
  /** A torn transfer is finished here: the SAME stored payment is offered again, never re-signed. One the
   *  receiver's phone already confirmed ("Received") has nothing left to hand over. */
  function reshow(id) {
    var row = typeof W.stablesGetUserActivityRowById === 'function' ? W.stablesGetUserActivityRowById(id) : null;
    if (!row || !row.instant || row.dir !== 'out' || !row.instantRef || !account) return false;
    account.outgoing(row.instantRef).then(function (p) { if (p && !p.delivered) deliver(p); });
    return true;
  }

  function copyText(which) {
    var text = which === 'code' ? recv.code : (pay.showing && pay.showing.text);
    var field = el(which === 'code' ? 'instantRecvCodeText' : 'instantPayText');
    if (!text) return;
    var fallback = function () { if (field) { try { field.select(); } catch (_) { /* ignore */ } } };
    try {
      // The canonical multi-line text is copied; the field shows it on one line. No toast (law 3).
      if (W.navigator && W.navigator.clipboard && W.navigator.clipboard.writeText) W.navigator.clipboard.writeText(text).then(function () {}, fallback);
      else fallback();
    } catch (_) { fallback(); }
  }

  /* ---------- boot ---------- */
  function init() {
    syncCurrencies();
    render();
    if (!supported() || !currencyList.length) {
      state.status = 'unavailable';
      log('unavailable: ' + (currencyList.length ? 'WebCrypto or IndexedDB missing' : 'no currency registry'));
      render();
      redrawTotal();
      return;
    }
    try {
      // Build 103: the FRESH account (scheme 0x05) in its own store. The test-credit account in
      // stables-instant-v1 is only ever read (readRetired), never written, and counts nowhere.
      var backend = P.createIndexedDbBackend({ dbName: P.DB_NAME });
      account = P.createAccount({ backend: backend, keyStore: P.createWebCryptoKeyStore(backend), legacyTokenId: tokenOfCode(LEGACY_CODE) });
      var cfg = (W.STABLES_CONFIG || {}).INSTANT_CHAIN;
      if (CC && cfg && W.__STABLES_INSTANT_NODE__) {
        chain = CC.create({ config: cfg, account: account, node: W.__STABLES_INSTANT_NODE__, protocol: P, onChange: chainChanged, log: log, confirmBlocks: confirmBlocksFor });
      }
    } catch (e) {
      state.status = 'unavailable';
      render();
      return;
    }
    refresh().then(reloadChain).then(function () {
      log('ready' + (nfcBridge() ? ' (nfc ' + nfcState() + ')' : '') + (chain ? ', chain ' + chainAvailability().ok : ', no chain'));
      // Track both covenants, scan the vault for loads made for this account, and follow what is open.
      follow(true);
      startPoolTidy();
      // A Receive sheet already open on the Instant balance draws its code now.
      if (sheetShows('recvModal')) enterReceive({});
    }).catch(function (e) {
      log('unavailable: ' + (e && (e.code || e.message)));
      account = null;
      state.status = 'unavailable';
      render();
      redrawTotal();
    });
  }

  W.stablesInstantTakeCarrier = takeCarrier;
  W.stablesInstantOpenActions = openActions;
  W.stablesInstantSetWalletTap = setWalletTap;
  W.stablesInstantSetDirection = setDirection;
  /** The swap arrow between the two boxes (build 0.0.12.048): Add <-> Remove, with the arrow's half turn. */
  W.stablesInstantFlipDirection = function () {
    if (typeof W.stablesFlipTurn === 'function') W.stablesFlipTurn(el('instantMoveFlip'));
    setDirection(move.dir === 'remove' ? 'add' : 'remove');
  };
  W.stablesInstantDirectionKey = directionKey;
  W.stablesInstantCloseMove = closeMove;
  W.stablesInstantMoveInput = moveInput;
  W.stablesInstantMoveMax = moveMax;
  W.stablesInstantConfirmMove = confirmMove;
  W.stablesInstantToggleAddresses = toggleAddresses;
  W.stablesInstantPickAddress = pickAddress;
  W.stablesInstantCloseAddresses = closeAddresses;
  W.stablesInstantScanPayment = scanPayment;
  W.stablesInstantTogglePaste = togglePaste;
  W.stablesInstantPasted = pasted;
  W.stablesInstantPasteCode = pasteCode;
  W.stablesInstantCodeInput = codeInput;
  W.stablesInstantAmountInput = amountInput;
  W.stablesInstantRequestInput = requestInput;
  W.stablesInstantSetMax = setMax;
  W.stablesInstantConfirmSend = confirmSend;
  W.stablesInstantCopy = copyText;
  W.stablesInstantEnlarge = enlarge;
  W.stablesInstantChooseWay = chooseWay;
  W.stablesInstantWayKey = wayKey;
  W.stablesInstantChangeAmount = changeAmount;
  W.stablesInstantOpenNfcSettings = openNfcSettings;
  W.stablesInstantFar = setFar;                    // D123: "Pay with a code" / "Share a payment request", and back to the tap
  W.stablesInstantShareRequest = shareRequest;
  W.StablesInstant = {
    handleScan: handleScan,
    isPayload: function (text) { return !!(P && P.kindOf(fromLink(text))); },
    isRowId: function (id) { return /^INSTANT-/.test(String(id || '')); },
    openRow: openRow,
    reshow: reshow,
    /**
     * The progress of the Add or Remove behind an activity row (build 106, founder law 26), in the Savings
     * send tracker's own form, read from the record the row is drawn from; null for any other row. The
     * shared tracker asks for it through stablesGetSendProgressById (activity-contacts.js).
     */
    progress: progressById,
    onAccountView: onAccountView,
    onClose: onClose,
    syncTap: function () { syncNfc(); },
    /* Build 0.0.12.057 (founder 2026-10-05: "27 sec between on chain and confirm, is this solely the app?"). The chain
       decides when the next block comes; the app added up to 15 s more, looking only every 15 s. While an Add, a Remove
       or a network payment is open (the follow timer runs), a new block is looked at at once. Nothing open: nothing read. */
    onNewBlock: function () { if (followTimer && chain) { again = true; tick(); } },
    onCurrencyPick: onCurrencyPick,
    payWantsCamera: payWantsCamera,
    /** D087: Receive shows a code with this phone's address, so a payment can arrive over the network now. */
    receiveWaitsOnNetwork: function () { return !!(ready() && sheetShows('recvModal') && wayNow() === 'qr' && recv.code && recv.code.indexOf('Address:') >= 0); },
    /**
     * The Instant payments page's currency list (mode 'instant-move', builds 104, 105): each row shows what the FROM
     * account holds of that currency, Savings for Add and Instant payments for Remove ("-" while unknown).
     */
    moveBalanceText: function (code) {
      var cur = currencyForCode(code);
      if (!ready() || !cur) return '-';
      var atoms = move.dir === 'remove' ? balanceOf(cur.tokenId) : savingsFigure(savingsAtoms(cur.code));
      return atoms == null ? '-' : P.formatAmount(atoms);
    },
    moveBalanceNumber: function (code) {
      var cur = currencyForCode(code);
      if (!ready() || !cur) return 0;
      var atoms = move.dir === 'remove' ? balanceOf(cur.tokenId) : savingsAtoms(cur.code);
      return atoms == null ? 0 : Number(P.atomsToDecimal(atoms));
    },
    /** The on-chain side (instant-chain.js), for the runtime harness: availability, its node adapter. */
    chain: function () { return chain; },
    /** The delivery seam (see above): a Bluetooth or NFC channel registers here. */
    registerDeliveryChannel: registerDeliveryChannel,
    acceptPayment: acceptPayment,
    /** One currency's Instant balance as a picker's row figure ("-" while unknown, four-state truth). */
    balanceText: function (code) {
      var cur = currencyForCode(code);
      return ready() && cur ? P.formatAmount(balanceOf(cur.tokenId)) : '-';
    },
    /**
     * What the Wallet total counts (founder 2026-09-28, after build 100: "the top total includes the
     * Instant payments balance"): [{code, amount}] per currency, in the codes the Savings rows use, so
     * index.html converts them with the Savings rate. null while the balance is still loading
     * (unknown is not zero, law 5); [] on a device that cannot hold one.
     */
    walletHoldings: function () {
      if (state.status === 'unavailable') return [];
      if (!ready()) return null;
      // A load in flight (build 103, design decision 4: "the Wallet total not dipping during a load"):
      // it has left Savings and is not yet in the Instant figure, so the total counts it here.
      return currencyList.map(function (c) { return { code: c.code, amount: Number(P.atomsToDecimal(balanceOf(c.tokenId) + pendingLoadAtoms(c.tokenId))) }; });
    },
    /** The same figure as a number, for ordering a picker (held currencies first). */
    balanceNumber: function (code) {
      var cur = currencyForCode(code);
      return ready() && cur ? Number(P.atomsToDecimal(balanceOf(cur.tokenId))) : 0;
    },
    currencies: function () { return currencyList.map(function (c) { return { code: c.code, label: c.label, tokenId: c.tokenId }; }); },
    snapshot: function () {
      var balances = null;
      if (state.balances) {
        balances = {};
        currencyList.forEach(function (c) { balances[c.label] = P.atomsToDecimal(balanceOf(c.tokenId)); });
      }
      return { status: state.status, balances: balances, scanner: scan.mode,
        channels: channels.map(function (c) { return c.id; }),
        nfc: { state: nfcState(), receiving: !!nfc.code, reader: nfc.mode || 'off', tap: tap.session || '' },
        armed: pay.armed ? { amount: P.atomsToDecimal(pay.armed.atoms), currency: pay.armed.cur.label } : null,
        way: wayNow(),
        paying: pay.showing ? { ref: pay.showing.ref, view: pay.view, delivered: pay.delivered } : null,
        move: { open: moveOpen(), dir: move.dir, busy: move.busy, reason: move.reason },
        chain: { available: chainAvailability(), open: chainEntries.filter(function (e) { return ['building', 'posted', 'committed', 'preparing', 'merging'].indexOf(e.status) >= 0; }).length,
          records: chainEntries.map(function (e) { return { id: e.id, kind: e.kind, status: e.status, amount: P.atomsToDecimal(BigInt(e.amount)), depth: e.depth == null ? null : e.depth, note: e.note || '' }; }) },
        retired: retiredRows().map(function (r) { return { currency: r.cur.label, amount: P.atomsToDecimal(r.atoms) }; }) };
    }
  };

  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init);
  else init();
})(window);

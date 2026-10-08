package org.stables.host;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * A model of what the chain does with a chip's defund vouchers (the chip account coin's D1 branch, then D2 paying the
 * owner's payout address), so the harnesses can deliver vouchers to "the chain" in any order and check where the value
 * ends up. One account per chip id, as registered: highest key index used u = 0 and defunded total D = 0.
 *
 * Two rules, selected with -Dstables.d1:
 *  - "cumulative" (default; kiss/balance/chip_account_v2_cumulative.kiss, gap fix 2026-09-29): the voucher's field at
 *    offset 4 is the chip's cumulative defunded total Dv. Accepted only with key index i > u and Dv > D; pays Dv - D;
 *    then u = i and D = Dv.
 *  - "per-voucher" (the measured kiss/balance/chip_account.kiss, before the fix): the field is the amount y of that
 *    defund alone. Accepted only with i > u; pays y; then u = i and D = D + y.
 * Both check the LX16 signature with Lx16Ref (the Java port of measure/ots.mjs) against the chip's own key i. Key-tree
 * membership, the helper coins and the deferred checks are not modelled here; crosscheck/d1-order-check.mjs runs the
 * real KISS scripts (dry runs on the lab node) on card-made vouchers in the same orders.
 */
public final class ChainModel {
    private ChainModel() { }

    public static final boolean CUMULATIVE = !"per-voucher".equals(System.getProperty("stables.d1", "cumulative"));

    public static String rule() {
        return CUMULATIVE ? "cumulative (chip_account_v2_cumulative.kiss)" : "per-voucher (chip_account.kiss, before the fix)";
    }

    static final class Account {
        long u;
        long d;
        long paid;
        final List<String> log = new ArrayList<String>();
    }

    private static final Map<String, Account> ACCOUNTS = new HashMap<String, Account>();

    /** A fresh chain for a fresh world (called by every new Lab). */
    static void reset() {
        ACCOUNTS.clear();
    }

    private static Account acc(byte[] chipId) {
        String k = Hex.x(chipId);
        Account a = ACCOUNTS.get(k);
        if (a == null) {
            a = new Account();
            ACCOUNTS.put(k, a);
        }
        return a;
    }

    /** Total the chain has paid to this chip's owner. */
    public static long paid(Card c) {
        return acc(c.chipId()).paid;
    }

    public static long paid(byte[] chipId) {
        return acc(chipId).paid;
    }

    /**
     * Posts a voucher (message 52, LX16 signature R and C, the chip's public key pk for index i): D1 then D2. Returns
     * the amount paid, or -1 when the chain refuses it (nothing changes).
     */
    public static long post(byte[] chipId, byte[] msg, byte[] r, byte[] c, byte[] pk) {
        Account a = acc(chipId);
        long i = Hex.u32(msg, 0);
        long field = Hex.u64(msg, 4);
        byte[] d = Lx16Ref.voucherDigest(chipId, msg);
        if (!Lx16Ref.verify(pk, d, r, c)) {
            a.log.add("refused key " + i + ": signature");
            return -1;
        }
        if (i <= a.u) {
            a.log.add("refused key " + i + ": key index not above " + a.u);
            return -1;
        }
        long y = CUMULATIVE ? field - a.d : field;
        if (y <= 0) {
            a.log.add("refused key " + i + ": nothing to pay");
            return -1;
        }
        a.u = i;
        a.d = CUMULATIVE ? field : a.d + field;
        a.paid += y;
        a.log.add("paid " + Hex.units(y) + " for key " + i);
        return y;
    }

    /** The phone reads voucher vi from the chip (header and the streamed signature) and posts it. */
    public static long post(Card card, int vi) {
        byte[] hdr = card.defundRead(vi, 0xFF);
        byte[] msg = Hex.sub(hdr, 1, 52);
        byte[][] sig = card.defundSignature(vi);
        byte[] pk = Hex.sub(card.lxPubkey((int) Hex.u32(msg, 0)), 160, 32);
        return post(card.chipId(), msg, sig[0], sig[1], pk);
    }

    /** Ring indexes of the chip's committed vouchers, newest (highest key index) first. */
    public static List<Integer> vouchersNewestFirst(Card card) {
        List<int[]> v = new ArrayList<int[]>();
        for (int k = 0; k < 4; k++) {
            byte[] rec = card.voucherRecord(k);
            if (rec[0] == 1) {
                v.add(new int[] { k, Hex.u16(rec, 2) });
            }
        }
        v.sort((x, y) -> Integer.compare(y[1], x[1]));
        List<Integer> out = new ArrayList<Integer>();
        for (int[] x : v) {
            out.add(x[0]);
        }
        return out;
    }

    /**
     * The documented settlement: the phone re-reads every voucher still in the chip's ring and posts each one. Under the
     * cumulative rule any order works (the newest pays everything not yet paid); newestFirst also shows that the older
     * ones are then refused without loss. Under the per-voucher rule the design required key order (oldest first).
     * Returns the total paid by this call.
     */
    public static long settle(Card card, boolean newestFirst) {
        List<Integer> order = vouchersNewestFirst(card);
        if (!newestFirst) {
            java.util.Collections.reverse(order);
        }
        long total = 0;
        for (int vi : order) {
            long p = post(card, vi);
            if (p > 0) {
                total += p;
            }
        }
        return total;
    }

    /**
     * Value the chain still owes this chip's owner and that posting what the chip holds can still claim: read from the
     * voucher records the chip exposes (GET_STATE), never from the chip's own counters, so a voucher that can no longer
     * be claimed (stranded) is not counted. Cumulative: the best voucher still above both u and D. Per-voucher: every
     * voucher above u (posted in key order).
     */
    public static long recoverable(Card card, int slot) {
        Account a = acc(card.chipId());
        long best = 0, sum = 0;
        for (int k = 0; k < 4; k++) {
            byte[] rec = card.voucherRecord(k);
            if (rec[0] != 1 || rec[1] != slot) {
                continue;
            }
            long i = Hex.u16(rec, 2);
            long field = Hex.u64(rec, 4 + 4);
            if (i <= a.u) {
                continue;
            }
            if (CUMULATIVE) {
                best = Math.max(best, field - a.d);
            } else {
                sum += field;
            }
        }
        return CUMULATIVE ? best : sum;
    }

    public static String log(Card c) {
        return String.join("; ", acc(c.chipId()).log);
    }
}

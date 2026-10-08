package org.stables.host;

import java.util.ArrayList;
import java.util.List;

import org.stables.card.BenchApplet;
import org.stables.card.StablesApplet;

/**
 * A small world for the tests: bonded vendors on the accepted list, a foreign vendor that is not, the registry
 * (accepted vendors and owner revocations, append only), two currencies, and cards personalised the way a vendor would
 * (issuer key, certificate over the on-card key, PIN, PUK, currencies, the current snapshot, a pre-load by FUND).
 */
public final class Lab {
    public static final byte[] USDW = Hex.sha256(Hex.ascii("stables-test-usdw"));
    public static final byte[] WINIWA = Hex.sha256(Hex.ascii("stables-test-winiwa"));
    public static final byte[] PIN = Hex.ascii("1234");
    public static final byte[] PUK = Hex.ascii("87654321");
    public static final long PL_PAY = Hex.atoms(50);
    public static final long PL_TOT = Hex.atoms(150);

    public final Vendor v1 = new Vendor("V1");
    public final Vendor v2 = new Vendor("V2");
    public final Vendor foreign = new Vendor("FOREIGN");
    public final List<byte[]> vendors = new ArrayList<byte[]>();
    public final List<byte[]> revocations = new ArrayList<byte[]>();
    public long snapVersion = 1;
    public long block = 2340000;
    public final List<Card> cards = new ArrayList<Card>();

    public Lab() {
        vendors.add(v1.entry());
        vendors.add(v2.entry());
        ChainModel.reset(); // each world has its own chain (chip accounts start at u = 0, D = 0)
    }

    public byte[] snapshotHeader(Vendor signer) {
        return signer.snapshotHeader(snapVersion, block, vendors, revocations);
    }

    /** A new, personalised, locked card with the given pre-loads (atoms) in USDw (slot 0) and Winiwa (slot 1). */
    public Card card(String name, Vendor issuer, long usdw, long winiwa) {
        return card(name, issuer, usdw, winiwa, true);
    }

    public Card card(String name, Vendor issuer, long usdw, long winiwa, boolean withBench) {
        SimCard sc = new SimCard(name);
        sc.install(SimCard.AID_APPLET, StablesApplet.class);
        if (withBench) {
            sc.install(SimCard.AID_BENCH, BenchApplet.class);
        }
        sc.select(SimCard.AID_APPLET);
        Card c = new Card(sc);
        c.persoIssuer(issuer.entry());
        c.persoCert(issuer.certify(c.pubkey()));
        c.persoPin(PIN);
        c.persoPuk(PUK);
        c.persoCurrency(USDW, PL_PAY, PL_TOT, true);
        c.persoCurrency(WINIWA, PL_PAY, PL_TOT, false);
        // the vendor loads the current registry snapshot at manufacture (6.2); a foreign issuer signs its own
        c.loadSnapshot(issuer.snapshotHeader(snapVersion, block, vendors, revocations), vendors, revocations);
        byte[] id = c.chipId();
        if (usdw > 0) {
            c.fund(issuer.fundVoucher(id, USDW, 1, usdw, usdw));
        }
        if (winiwa > 0) {
            c.fund(issuer.fundVoucher(id, WINIWA, 1, winiwa, winiwa));
        }
        c.persoLock();
        cards.add(c);
        return c;
    }

    /** The owner revokes a chip on chain (6.1); the next snapshot carries it. */
    public void revoke(Card c) {
        revocations.add(Hex.sub(c.chipId(), 0, 8));
        snapVersion++;
        block += 10;
    }

    public void pushSnapshot(Card c, Vendor signer) {
        c.loadSnapshot(snapshotHeader(signer), vendors, revocations);
    }

    public static byte[] token(int slot) {
        return slot == 0 ? USDW : WINIWA;
    }
}

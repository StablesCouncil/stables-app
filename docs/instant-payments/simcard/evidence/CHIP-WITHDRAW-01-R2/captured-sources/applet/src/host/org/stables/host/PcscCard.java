package org.stables.host;

import java.util.List;

import javax.smartcardio.Card;
import javax.smartcardio.CardChannel;
import javax.smartcardio.CardTerminal;
import javax.smartcardio.CommandAPDU;
import javax.smartcardio.ResponseAPDU;
import javax.smartcardio.TerminalFactory;

/**
 * A real card through a PC/SC reader (for example the ACS ACR1252U), for when cards exist (chip-balance-design.md
 * 0b.2). It only sends APDUs to an applet that GlobalPlatformPro already loaded; it never authenticates to the card
 * manager, so it cannot lock or brick a card. Status: compiled and tested only for "no reader present" (no card yet).
 */
public final class PcscCard implements Apdu {
    private final CardChannel ch;
    private final String name;

    private PcscCard(CardChannel ch, String name) {
        this.ch = ch;
        this.name = name;
    }

    public static List<CardTerminal> readers() throws Exception {
        return TerminalFactory.getDefault().terminals().list();
    }

    /** Connects to the first reader whose name contains the given text (any reader if it is empty). */
    public static PcscCard open(String readerPart) throws Exception {
        for (CardTerminal t : readers()) {
            if (readerPart.isEmpty() || t.getName().contains(readerPart)) {
                Card c = t.connect("*");
                return new PcscCard(c.getBasicChannel(), t.getName());
            }
        }
        throw new IllegalStateException("no PC/SC reader matching '" + readerPart + "'");
    }

    public String name() {
        return name;
    }

    public boolean select(byte[] aid) {
        byte[] r = transmit(Hex.cat(new byte[] { 0x00, (byte) 0xA4, 0x04, 0x00, (byte) aid.length }, aid));
        return r[r.length - 2] == (byte) 0x90 && r[r.length - 1] == 0;
    }

    public byte[] transmit(byte[] command) {
        try {
            ResponseAPDU r = ch.transmit(new CommandAPDU(command));
            return r.getBytes();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}

package org.stables.host;

/**
 * One card, reached by APDUs. Implemented by SimCard (jCardSim) and PcscCard (a real card through a PC/SC reader),
 * so the benchmark and the functional tests drive a simulated card now and a real one later with the same code.
 */
public interface Apdu {
    /** Sends a command APDU and returns the response data followed by SW1 SW2. */
    byte[] transmit(byte[] command);

    /** Selects an applet by AID; returns true on 9000. */
    boolean select(byte[] aid);

    String name();
}

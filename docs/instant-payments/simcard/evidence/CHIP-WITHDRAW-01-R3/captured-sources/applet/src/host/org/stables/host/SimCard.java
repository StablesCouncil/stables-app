package org.stables.host;

import com.licel.jcardsim.base.Simulator;
import com.licel.jcardsim.base.SimulatorRuntime;

import javacard.framework.AID;
import javacard.framework.Applet;

/**
 * A simulated card: one jCardSim runtime per card, so two or three cards can talk through the relay in one JVM.
 * powerCycle() models a card leaving the field: the runtime is reset, CLEAR_ON_RESET and CLEAR_ON_DESELECT memory is
 * cleared (jCardSim's reset() clears only CLEAR_ON_RESET, VERIFIED in its source), and the applet is selected again.
 */
public final class SimCard implements Apdu {
    public static final byte[] AID_APPLET = Hex.h("F05354424C0101");
    public static final byte[] AID_BENCH = Hex.h("F05354424C0102");

    /** Raised to the host when the instrumented layer cut this card's power during the last command. */
    public static final class Torn extends RuntimeException {
        public final String card;

        Torn(String card) {
            super("power cut on " + card);
            this.card = card;
        }
    }

    /** Raised when the harness cuts the exchange after an APDU: the card acted, its response never arrived. */
    public static final class Cut extends RuntimeException {
        public final String card;
        public final boolean power;

        Cut(String card, boolean power) {
            super((power ? "power lost after the response of " : "response lost from ") + card);
            this.card = card;
            this.power = power;
        }
    }

    /** Global APDU counter across all simulated cards, and the harness's cut plan (-1 = none). */
    public static int globalApdus;
    public static int cutAfter = -1;
    public static boolean cutPower;

    private final SimulatorRuntime rt;
    private final Simulator sim;
    private final String name;
    private byte[] selected;
    public int apdus;
    public int powerCycles;

    public SimCard(String name) {
        this(name, new SimulatorRuntime());
    }

    /** With a custom runtime (for example one that reports a small commit buffer, to test the self-test). */
    public SimCard(String name, SimulatorRuntime runtime) {
        this.name = name;
        this.rt = runtime;
        this.sim = new Simulator(runtime);
    }

    public String name() {
        return name;
    }

    public byte[] selected() {
        return selected;
    }

    /** Installs an applet with GlobalPlatform-style install parameters: AID length | AID | 0 | 0. */
    public void install(byte[] aid, Class<? extends Applet> cls) {
        byte[] params = Hex.cat(new byte[] { (byte) aid.length }, aid, new byte[] { 0, 0 });
        sim.installApplet(new AID(aid, (short) 0, (byte) aid.length), cls, params, (short) 0, (byte) params.length);
        TearControl.endOfApdu();
    }

    public boolean select(byte[] aid) {
        selected = aid;
        byte[] cmd = Hex.cat(new byte[] { 0x00, (byte) 0xA4, 0x04, 0x00, (byte) aid.length }, aid);
        byte[] r = sim.transmitCommand(cmd);
        return r.length >= 2 && r[r.length - 2] == (byte) 0x90 && r[r.length - 1] == 0;
    }

    public byte[] transmit(byte[] command) {
        apdus++;
        byte[] r = sim.transmitCommand(command);
        TearControl.endOfApdu();
        if (TearControl.torn()) {
            powerCycle();
            throw new Torn(name);
        }
        if (++globalApdus == cutAfter) {
            if (cutPower) {
                powerCycle();
            }
            throw new Cut(name, cutPower);
        }
        return r;
    }

    /**
     * Simulator only: a copy of one persistent field of the installed applet (for state no command exposes, such as
     * the LX16 used-key bitmap). Read-only inspection; the tests never write through it.
     */
    public byte[] peekField(byte[] aid, String field) {
        try {
            java.lang.reflect.Method m = SimulatorRuntime.class.getDeclaredMethod("getApplet", AID.class);
            m.setAccessible(true);
            Object applet = m.invoke(rt, new AID(aid, (short) 0, (byte) aid.length));
            java.lang.reflect.Field f = applet.getClass().getDeclaredField(field);
            f.setAccessible(true);
            return ((byte[]) f.get(applet)).clone();
        } catch (Exception e) {
            throw new RuntimeException("cannot read " + field, e);
        }
    }

    /** The card leaves the field and comes back: transient memory is lost, persistent memory stays. */
    public void powerCycle() {
        powerCycles++;
        rt.reset();
        try {
            java.lang.reflect.Method m = com.licel.jcardsim.base.TransientMemory.class.getDeclaredMethod("clearOnDeselect");
            m.setAccessible(true);
            m.invoke(rt.getTransientMemory());
        } catch (Exception e) {
            throw new RuntimeException("cannot clear CLEAR_ON_DESELECT memory", e);
        }
        TearControl.clearTorn();
        if (selected != null) {
            select(selected);
        }
    }
}

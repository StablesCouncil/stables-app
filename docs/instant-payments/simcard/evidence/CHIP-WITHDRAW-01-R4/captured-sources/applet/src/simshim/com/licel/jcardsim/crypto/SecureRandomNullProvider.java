package com.licel.jcardsim.crypto;

import java.security.SecureRandom;

/**
 * TEST SHIM for jCardSim 3.0.6.0 only (never part of the applet or a CAP).
 *
 * jCardSim's own class of this name is an UNSEEDED SHA-1 DigestRandomGenerator, used by KeyPairImpl (key generation)
 * and AsymmetricSignatureImpl (ECDSA nonces) (VERIFIED in its source). So every simulated card gets the SAME key
 * pair, and ECDSA nonces repeat. That is a simulator artefact, not a card property, but it would make every
 * multi-card test meaningless (all chips would share one identity). This replacement, placed ahead of the jCardSim jar
 * on the class path, draws from the platform SecureRandom instead. RandomData is seeded the same way through
 * jCardSim's own switch -Dcom.licel.jcardsim.randomdata.secure=1.
 */
class SecureRandomNullProvider extends SecureRandom {
    private static final long serialVersionUID = 1L;

    SecureRandomNullProvider() {
        super();
    }
}

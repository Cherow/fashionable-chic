
package com.fashionablechic.wardrobe.util;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

public final class ImageHashUtil {

    private ImageHashUtil() {
        // Utility class: no instances needed.
    }

    public static String sha256(byte[] imageBytes) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashBytes = digest.digest(imageBytes);

            return HexFormat.of().formatHex(hashBytes);

        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(
                    "SHA-256 algorithm is unavailable", e
            );
        }
    }
}

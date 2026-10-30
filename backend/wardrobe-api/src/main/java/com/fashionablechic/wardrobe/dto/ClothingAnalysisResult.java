
package com.fashionablechic.wardrobe.dto;

public record ClothingAnalysisResult(
        String name,
        String category,
        String colour,
        String itemType,
        double confidence
) {
}

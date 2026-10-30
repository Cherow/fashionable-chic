
package com.fashionablechic.wardrobe.service;

import com.fashionablechic.wardrobe.dto.ClothingAnalysisResult;

import java.io.IOException;

public interface ClothingAnalysisService {

    ClothingAnalysisResult analyzeImage(byte[] imageBytes)
            throws IOException;
}

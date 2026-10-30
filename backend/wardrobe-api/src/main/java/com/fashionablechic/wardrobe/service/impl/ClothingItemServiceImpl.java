
package com.fashionablechic.wardrobe.service.impl;

import com.fashionablechic.wardrobe.dto.ClothingAnalysisResult;
import com.fashionablechic.wardrobe.entity.ClothingItem;
import com.fashionablechic.wardrobe.repository.ClothingItemRepository;
import com.fashionablechic.wardrobe.service.ClothingAnalysisService;
import com.fashionablechic.wardrobe.service.ClothingItemService;
import com.fashionablechic.wardrobe.service.ImageKitUploadService;
import com.fashionablechic.wardrobe.util.ImageHashUtil;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

@Service
public class ClothingItemServiceImpl implements ClothingItemService {

    private final ClothingItemRepository clothingItemRepository;
    private final ImageKitUploadService imageKitUploadService;
    private final ClothingAnalysisService clothingAnalysisService;

    public ClothingItemServiceImpl(
            ClothingItemRepository clothingItemRepository,
            ImageKitUploadService imageKitUploadService,
            ClothingAnalysisService clothingAnalysisService) {

        this.clothingItemRepository = clothingItemRepository;
        this.imageKitUploadService = imageKitUploadService;
        this.clothingAnalysisService = clothingAnalysisService;
    }

    /**
     * Creates a wardrobe item from an uploaded image.
     *
     * Flow:
     * 1. Validate the image.
     * 2. Calculate its SHA-256 hash.
     * 3. Return the existing item if the exact image was uploaded before.
     * 4. Ask the AI to classify the image.
     * 5. Upload the image to ImageKit.
     * 6. Save the classification and image URL to MySQL.
     */
    @Override
    @Transactional
    public ClothingItem createWithImage(MultipartFile image) throws IOException {

        // 1. Validate the uploaded image.
        if (image == null || image.isEmpty()) {
            throw new IllegalArgumentException(
                    "Please upload a clothing image.");
        }

        String contentType = image.getContentType();

        if (contentType == null ||
                !contentType.toLowerCase().startsWith("image/")) {
            throw new IllegalArgumentException(
                    "The uploaded file must be an image.");
        }

        // 2. Read the image once and calculate its hash.
        byte[] imageBytes = image.getBytes();
        String imageHash = ImageHashUtil.sha256(imageBytes);

        // 3. Avoid reprocessing an exact duplicate image.
        Optional<ClothingItem> existingItem =
                clothingItemRepository.findByImageHash(imageHash);

        if (existingItem.isPresent()) {
            return existingItem.get();
        }

        // 4. Analyze the image using the configured AI provider.
        ClothingAnalysisResult analysis =
                clothingAnalysisService.analyzeImage(imageBytes);

        // 5. Upload the image to ImageKit.
        ImageKitUploadService.UploadedImage uploadedImage =
                imageKitUploadService.upload(image);

        String imageUrl = uploadedImage.url()
                .orElseThrow(() -> new IOException(
                        "ImageKit did not return an image URL."));

        // 6. Map the AI result and image details to the entity.
        ClothingItem clothingItem = new ClothingItem();

        clothingItem.setName(analysis.name());
        clothingItem.setCategory(analysis.category());
        clothingItem.setColor(analysis.colour());
        clothingItem.setItemType(analysis.itemType());
        clothingItem.setConfidence(analysis.confidence());
        clothingItem.setImageUrl(imageUrl);
        clothingItem.setImageHash(imageHash);

        // 7. Persist the wardrobe item.
        return clothingItemRepository.save(clothingItem);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ClothingItem> findAll() {
        return clothingItemRepository.findAll();
    }

    @Override
    @Transactional(readOnly = true)
    public ClothingItem findById(Long id) {
        return clothingItemRepository.findById(id)
                .orElseThrow(() -> new RuntimeException(
                        "Clothing item not found with ID: " + id));
    }

    @Override
    @Transactional
    public void deleteById(Long id) {
        if (!clothingItemRepository.existsById(id)) {
            throw new RuntimeException(
                    "Clothing item not found with ID: " + id);
        }

        clothingItemRepository.deleteById(id);
    }
}

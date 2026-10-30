package com.fashionablechic.wardrobe.service.impl;

import com.fashionablechic.wardrobe.service.ImageKitUploadService;
import io.imagekit.client.ImageKitClient;
import io.imagekit.models.files.FileUploadParams;
import io.imagekit.models.files.FileUploadResponse;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Optional;
import java.util.UUID;

@Service
public class ImageKitUploadServiceImpl implements ImageKitUploadService {

    private static final String WARDROBE_FOLDER =
            "/fashionable_chic";

    private final ImageKitClient imageKitClient;

    public ImageKitUploadServiceImpl(ImageKitClient imageKitClient) {
        this.imageKitClient = imageKitClient;
    }

    @Override
    public UploadedImage upload(MultipartFile image) throws IOException {
        validateImage(image);

        String originalFilename = image.getOriginalFilename();
        String filename = UUID.randomUUID() + "-"
                + (originalFilename == null ? "clothing-image" : originalFilename);

        FileUploadParams params = FileUploadParams.builder()
                .file(image.getBytes())
                .fileName(filename)
                .folder(WARDROBE_FOLDER)
                .build();

        FileUploadResponse response = imageKitClient.files().upload(params);

        return new UploadedImage(String.valueOf(Optional.of(response.fileId())), response.url());
    }

    private void validateImage(MultipartFile image) {
        if (image == null || image.isEmpty()) {
            throw new IllegalArgumentException("An image is required.");
        }

        String contentType = image.getContentType();

        if (contentType == null || !contentType.startsWith("image/")) {
            throw new IllegalArgumentException(
                    "The uploaded file must be an image."
            );
        }
    }
}
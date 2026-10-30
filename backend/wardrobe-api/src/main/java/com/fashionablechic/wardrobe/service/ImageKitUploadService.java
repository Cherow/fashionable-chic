package com.fashionablechic.wardrobe.service;

import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

public interface ImageKitUploadService {

    UploadedImage upload(MultipartFile image) throws IOException;

    record UploadedImage(String fileId, java.util.Optional<String> url) {
    }
}
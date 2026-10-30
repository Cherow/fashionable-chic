
package com.fashionablechic.wardrobe.service;

import com.fashionablechic.wardrobe.entity.ClothingItem;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

public interface ClothingItemService {

    ClothingItem createWithImage(MultipartFile image)
            throws IOException;

    List<ClothingItem> findAll();

    ClothingItem findById(Long id);

    void deleteById(Long id);
}

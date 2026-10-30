
package com.fashionablechic.wardrobe.controller;

import com.fashionablechic.wardrobe.entity.ClothingItem;
import com.fashionablechic.wardrobe.service.ClothingItemService;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@RestController
@CrossOrigin(origins = "http://localhost:3000")
@RequestMapping("/api/v1/clothing-items")
public class ClothingItemController {

    private final ClothingItemService clothingItemService;

    public ClothingItemController(
            ClothingItemService clothingItemService) {
        this.clothingItemService = clothingItemService;
    }

    // Upload an image and let AI classify the clothing item.
    @PostMapping(
            value = "/with-image",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    @ResponseStatus(HttpStatus.CREATED)
    public ClothingItem createWithImage(
            @RequestParam("image") MultipartFile image)
            throws IOException {

        return clothingItemService.createWithImage(image);
    }

    // Retrieve all wardrobe items.
    @GetMapping
    public List<ClothingItem> findAll() {
        return clothingItemService.findAll();
    }

    // Retrieve one wardrobe item by ID.
    @GetMapping("/{id}")
    public ClothingItem findById(@PathVariable Long id) {
        return clothingItemService.findById(id);
    }

    // Delete a wardrobe item.
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteById(@PathVariable Long id) {
        clothingItemService.deleteById(id);
    }
}


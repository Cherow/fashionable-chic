package com.fashionablechic.wardrobe.repository;

import com.fashionablechic.wardrobe.entity.ClothingItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ClothingItemRepository
        extends JpaRepository<ClothingItem, Long> {

    boolean existsByImageHash(String imageHash);

    Optional<ClothingItem> findByImageHash(String imageHash);
}
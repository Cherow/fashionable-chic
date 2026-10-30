
package com.fashionablechic.wardrobe.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.RequiredArgsConstructor;

import java.util.Optional;

@Entity
@Table(name = "clothing_items")
@Data
@RequiredArgsConstructor
public class ClothingItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;
    @Column(name = "image_hash", length = 64)
    private String imageHash;

    private String category;
    private String color;
    private String imageUrl;

    private String itemType;

    @Column
    private Double confidence;


}

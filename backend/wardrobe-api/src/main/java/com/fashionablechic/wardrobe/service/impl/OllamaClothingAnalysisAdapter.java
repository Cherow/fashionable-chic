
package com.fashionablechic.wardrobe.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashionablechic.wardrobe.dto.ClothingAnalysisResult;
import com.fashionablechic.wardrobe.service.ClothingAnalysisService;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.io.IOException;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class OllamaClothingAnalysisAdapter
        implements ClothingAnalysisService {

    private static final Duration REQUEST_TIMEOUT =
            Duration.ofSeconds(120);

    private static final Set<String> ALLOWED_CATEGORIES = Set.of(
            "Dresses",
            "Tops",
            "Bottoms",
            "Shoes",
            "Bags",
            "Accessories"
    );

    private final WebClient webClient;

    private final ObjectMapper objectMapper;
    private final String model;

    public OllamaClothingAnalysisAdapter(
            WebClient.Builder webClientBuilder,
            ObjectMapper objectMapper,
            @Value("${ai.ollama.base-url}")
            String baseUrl,
            @Value("${ai.ollama.model}")
            String model) {

        this.webClient = webClientBuilder
                .baseUrl(baseUrl)
                .build();

        this.objectMapper = objectMapper;
        this.model = model;
    }

    @Override
    public ClothingAnalysisResult analyzeImage(byte[] imageBytes)
            throws IOException {

        if (imageBytes == null || imageBytes.length == 0) {
            throw new IllegalArgumentException(
                    "Image bytes must not be empty."
            );
        }

        String base64Image =
                Base64.getEncoder().encodeToString(imageBytes);

        String prompt = """
                You are the image classification engine for Fashionable Chic.

                Analyze the supplied fashion product image.

                Return ONLY one valid JSON object with these fields:
                {
                  "name": "specific product name",
                  "category": "Dresses, Tops, Bottoms, Shoes, Bags, or Accessories",
                  "colour": "main visible colour",
                  "itemType": "specific type of item",
                  "confidence": 0.0
                }

                CLASSIFICATION RULES:
                - Choose exactly one allowed category.
                - Dresses: dresses and one-piece dress garments.
                - Tops: blouses, shirts, T-shirts, sweaters and similar upper-body garments.
                - Bottoms: trousers, jeans, skirts and shorts.
                - Shoes: heels, sneakers, sandals, boots and other footwear.
                - Bags: handbags, backpacks, totes and similar bags.
                - Accessories: earrings, necklaces, bracelets, belts,
                  scarves, watches and similar accessories.
                - Use a specific, concise product name.
                - Describe only visible attributes.
                - Do not invent brands, materials or gemstones.
                - If the image is not a recognizable fashion item,
                  return an empty category and low confidence.
                - Confidence must be a number between 0 and 1.
                - Do not include Markdown fences or additional commentary.
                """;

        Map<String, Object> requestBody = Map.of(
                "model", model,
                "stream", false,
                "format", "json",
                "messages", List.of(
                        Map.of(
                                "role", "user",
                                "content", prompt,
                                "images", List.of(base64Image)
                        )
                ),
                "options", Map.of(
                        "temperature", 0.1,
                        "num_predict", 300
                )
        );

        String responseBody;

        try {
            responseBody = webClient.post()
                    .uri("/api/chat")
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(requestBody)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block(REQUEST_TIMEOUT);

        } catch (WebClientResponseException e) {
            throw new IOException(
                    "Image analysis provider returned HTTP status "
                            + e.getStatusCode().value(),
                    e
            );
        } catch (RuntimeException e) {
            throw new IOException(
                    "Failed to communicate with the image analysis provider.",
                    e
            );
        }

        if (responseBody == null || responseBody.isBlank()) {
            throw new IOException(
                    "The image analysis provider returned an empty response."
            );
        }

        JsonNode responseJson;

        try {
            responseJson = objectMapper.readTree(responseBody);
        } catch (Exception e) {
            throw new IOException(
                    "Could not parse the provider response.",
                    e
            );
        }

        JsonNode contentNode =
                responseJson.path("message").path("content");

        if (!contentNode.isTextual()
                || contentNode.asText().isBlank()) {
            throw new IOException(
                    "The image analysis provider returned no analysis."
            );
        }

        JsonNode resultJson;

        try {
            resultJson = objectMapper.readTree(contentNode.asText());
        } catch (Exception e) {
            throw new IOException(
                    "The model did not return valid classification JSON.",
                    e
            );
        }

        String name = readRequiredText(resultJson, "name");
        String category = readRequiredText(resultJson, "category");
        String colour = readRequiredText(resultJson, "colour");
        String itemType = readRequiredText(resultJson, "itemType");

        JsonNode confidenceNode = resultJson.path("confidence");

        if (!confidenceNode.isNumber()) {
            throw new IOException(
                    "The model returned an invalid confidence score."
            );
        }

        double confidence = confidenceNode.asDouble();

        if (!Double.isFinite(confidence)
                || confidence < 0.0
                || confidence > 1.0) {
            throw new IOException(
                    "Confidence must be between 0 and 1."
            );
        }

        if (!ALLOWED_CATEGORIES.contains(category)) {
            throw new IOException(
                    "Unsupported clothing category: " + category
            );
        }

        if (name.length() > 150
                || colour.length() > 50
                || itemType.length() > 100) {
            throw new IOException(
                    "The model returned classification fields that are too long."
            );
        }

        return new ClothingAnalysisResult(
                name,
                category,
                colour,
                itemType,
                confidence
        );
    }

    private String readRequiredText(JsonNode json, String field)
            throws IOException {

        JsonNode value = json.path(field);

        if (!value.isTextual() || value.asText().isBlank()) {
            throw new IOException(
                    "The model returned a missing or invalid field: " + field
            );
        }

        return value.asText().trim();
    }
}


import { NextResponse } from "next/server";


const allowedCategories = [
    "Dresses",
    "Tops",
    "Bottoms",
    "Shoes",
    "Bags",
    "Accessories",
] as const;

type ClothingCategory = (typeof allowedCategories)[number];

interface ClothingAnalysis {
    isClothing: boolean;
    category: ClothingCategory;
    colour: string;
    itemType: string;
    confidence: number;
}

const classificationSchema = {
    type: "object",
    properties: {
        isClothing: { type: "boolean" },
        category: {
            type: "string",
            enum: [...allowedCategories],
        },
        colour: { type: "string" },
        itemType: { type: "string" },
        confidence: { type: "number" },
    },
    required: [
        "isClothing",
        "category",
        "colour",
        "itemType",
        "confidence",
    ],
    additionalProperties: false,
};

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const image = body.image;

        if (typeof image !== "string") {
            return NextResponse.json(
                { error: "Please provide a clothing photo." },
                { status: 400 }
            );
        }

        // Accept an image data URL from the existing frontend.
        const match = image.match(
            /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/
        );

        if (!match) {
            return NextResponse.json(
                {
                    error: "Please upload a JPG, PNG, or WebP image.",
                },
                { status: 400 }
            );
        }

        const base64Image = match[2];

        // Check the decoded image size before sending it to Ollama.
        const estimatedBytes = Math.floor((base64Image.length * 3) / 4);

        if (estimatedBytes > 5 * 1024 * 1024) {
            return NextResponse.json(
                { error: "Please use an image smaller than 5 MB." },
                { status: 413 }
            );
        }

        // Ollama is running in Docker and exposed on Windows port 11434.
        const ollamaResponse = await fetch(
            "http://localhost:11434/api/generate",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "gemma3:4b",
                    stream: false,
                    format: classificationSchema,
                    images: [base64Image],
                    options: {
                        temperature: 0,
                    },
                    prompt: `
You are the clothing classification assistant for Fashionable Chic.

Analyze the supplied image and identify the main fashion item.

Rules:
1. If the image does not contain a recognizable clothing or fashion
   item, set isClothing to false.
2. Choose exactly one category from:
   Dresses, Tops, Bottoms, Shoes, Bags, Accessories.
3. Dresses means a one-piece dress.
4. Tops means shirts, blouses, T-shirts, sweaters and similar
   upper-body garments that are not dresses.
5. Bottoms means trousers, jeans, skirts, shorts and similar items.
6. Shoes means footwear.
7. Bags means handbags, backpacks and similar bags.
8. Accessories means jewellery, belts, scarves and other
   fashion accessories.
9. Describe the visible colour or combination of colours.
10. Give a short, specific item type, such as "Blouse", "Jeans",
    "Maxi dress", "Sneakers" or "Handbag".
11. Identify the main item, not the background or a person.
12. If the image is unclear or the item is uncertain, use a
    low confidence score.
13. Confidence is a rough estimate, not a calibrated probability.
14. Do not invent details that cannot be seen.

Return only data matching the required JSON schema.
          `,
                }),
                signal: AbortSignal.timeout(120_000),
            }
        );

        if (!ollamaResponse.ok) {
            console.error(
                "Ollama returned an error:",
                ollamaResponse.status,
                await ollamaResponse.text()
            );

            return NextResponse.json(
                {
                    error:
                        "The local AI service could not analyze this photo. Please try again.",
                },
                { status: 502 }
            );
        }

        const ollamaData = await ollamaResponse.json();

        if (typeof ollamaData.response !== "string") {
            return NextResponse.json(
                { error: "The AI returned an empty result. Please try again." },
                { status: 502 }
            );
        }

        let result: ClothingAnalysis;

        try {
            result = JSON.parse(ollamaData.response);
        } catch {
            console.error(
                "Ollama returned invalid JSON:",
                ollamaData.response
            );

            return NextResponse.json(
                { error: "The AI returned an invalid result. Please try again." },
                { status: 502 }
            );
        }

        // Validate the model's response before returning it to the frontend.
        if (
            typeof result.isClothing !== "boolean" ||
            !allowedCategories.includes(result.category) ||
            typeof result.colour !== "string" ||
            typeof result.itemType !== "string" ||
            typeof result.confidence !== "number" ||
            !Number.isFinite(result.confidence)
        ) {
            return NextResponse.json(
                { error: "The AI returned incomplete clothing details." },
                { status: 502 }
            );
        }

        if (!result.isClothing) {
            return NextResponse.json(
                {
                    error:
                        "This photo doesn't appear to show a recognizable fashion item. Please try another photo.",
                },
                { status: 422 }
            );
        }

        if (!result.colour.trim() || !result.itemType.trim()) {
            return NextResponse.json(
                {
                    error: "The AI couldn't identify the colour or item type clearly.",
                },
                { status: 422 }
            );
        }

        result.confidence = Math.max(
            0,
            Math.min(1, result.confidence)
        );

        return NextResponse.json(result);
    } catch (error) {
        console.error("Clothing analysis failed:", error);

        const isTimeout =
            error instanceof Error && error.name === "TimeoutError";

        return NextResponse.json(
            {
                error: isTimeout
                    ? "The AI took too long to analyze the photo. Please try again."
                    : "Something went wrong while analyzing the photo.",
            },
            { status: 500 }
        );
    }
}

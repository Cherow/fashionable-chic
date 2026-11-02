
"use client";

import { useEffect, useState } from "react";

const categories = [
  { name: "All items", icon: "✦" },
  { name: "Dresses", icon: "👗" },
  { name: "Tops", icon: "👚" },
  { name: "Bottoms", icon: "👖" },
  { name: "Shoes", icon: "👠" },
  { name: "Bags", icon: "👜" },
  { name: "Accessories", icon: "💍" },
];

const PAGE_SIZE = 8;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const API_BASE_URL =
  process.env.NEXT_PUBLIC_WARDROBE_API_URL ?? "http://localhost:8081";

type ClothingCategory =
  | "Dresses"
  | "Tops"
  | "Bottoms"
  | "Shoes"
  | "Bags"
  | "Accessories";

type ClothingItem = {
  id: number;
  name: string;
  category: ClothingCategory;
  colour: string;
  image: string;
};

type BackendClothingItem = {
  id: number;
  name: string;
  category: string;
  color?: string | null;
  imageUrl?: string | null;
  itemType?: string | null;
  confidence?: number | null;
};

type UploadStatus = "idle" | "analyzing";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const validCategories = categories
  .filter((category) => category.name !== "All items")
  .map((category) => category.name);

function isClothingCategory(
  value: unknown
): value is ClothingCategory {
  return (
    typeof value === "string" &&
    validCategories.includes(value)
  );
}

export default function Home() {
  const [activeCategory, setActiveCategory] =
    useState("All items");

  const [items, setItems] = useState<ClothingItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [wardrobeError, setWardrobeError] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [uploadStatus, setUploadStatus] =
    useState<UploadStatus>("idle");

  const [search, setSearch] = useState("");
  const [colourFilter, setColourFilter] =
    useState("All colours");
  const [sortOrder, setSortOrder] = useState("newest");
  const [visibleCount, setVisibleCount] =
    useState(PAGE_SIZE);

  // AI Stylist chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");

  const [chatMessages, setChatMessages] =
    useState<ChatMessage[]>([
      {
        role: "assistant",
        content:
          "Hi, lovely! ✨ I'm your Fashionable Chic stylist. Ask me what clothes you own, or let's create an outfit using your wardrobe.",
      },
    ]);

  // Load existing wardrobe items from Spring Boot.
  useEffect(() => {
    const controller = new AbortController();

    async function loadWardrobe() {
      setIsLoadingItems(true);
      setWardrobeError("");

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/v1/clothing-items`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error(
            `Could not load wardrobe (HTTP ${response.status}).`
          );
        }

        const data: BackendClothingItem[] =
          await response.json();

        const loadedItems: ClothingItem[] = data.map(
          (item) => {
            if (!isClothingCategory(item.category)) {
              throw new Error(
                `Unsupported category returned for item ${item.id}.`
              );
            }

            return {
              id: item.id,
              name:
                item.name ||
                item.itemType ||
                "Unnamed clothing item",
              category: item.category,
              colour: item.color?.trim() || "Not specified",
              image: item.imageUrl || "",
            };
          }
        );

        setItems(loadedItems);
      } catch (err) {
        if (
          err instanceof Error &&
          err.name === "AbortError"
        ) {
          return;
        }

        setWardrobeError(
          err instanceof Error
            ? `${err.message} Make sure Spring Boot is running and the backend allows requests from the frontend.`
            : "Could not load your wardrobe. Please refresh the page."
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingItems(false);
        }
      }
    }

    void loadWardrobe();

    return () => controller.abort();
  }, []);

  function resetFilters() {
    setSearch("");
    setColourFilter("All colours");
    setSortOrder("newest");
    setVisibleCount(PAGE_SIZE);
  }

  function openModal() {
    setIsModalOpen(true);
    setError("");
    setUploadStatus("idle");
  }

  function closeModal() {
    setIsModalOpen(false);
    setFile(null);
    setPreview("");
    setError("");
    setUploadStatus("idle");
  }

  function handlePhotoChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) return;

    if (
      !["image/jpeg", "image/png", "image/webp"].includes(
        selectedFile.type
      )
    ) {
      setError("Please choose a JPG, PNG, or WebP image.");
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      setError("Please choose an image smaller than 5 MB.");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      setFile(selectedFile);
      setPreview(String(reader.result));
      setError("");
      setUploadStatus("idle");
    };

    reader.onerror = () => {
      setError(
        "We couldn't read that photo. Please try again."
      );
    };

    reader.readAsDataURL(selectedFile);
  }

  // Upload the original image to Spring Boot.
  // Spring Boot handles Ollama, ImageKit and MySQL.
  async function uploadClothing() {
    if (!file) {
      setError("Please choose a clothing photo first.");
      return;
    }

    setError("");
    setUploadStatus("analyzing");

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch(
        `${API_BASE_URL}/api/v1/clothing-items/with-image`,
        {
          method: "POST",
          body: formData,
        }
      );

      const responseText = await response.text();

      let data: BackendClothingItem;

      try {
        data = JSON.parse(
          responseText
        ) as BackendClothingItem;
      } catch {
        throw new Error(
          responseText ||
          "The backend returned an unreadable response."
        );
      }

      if (!response.ok) {
        const errorData = data as unknown as {
          message?: string;
          error?: string;
        };

        throw new Error(
          errorData.message ||
          errorData.error ||
          `Upload failed (HTTP ${response.status}).`
        );
      }

      if (
        typeof data.id !== "number" ||
        typeof data.name !== "string" ||
        !isClothingCategory(data.category) ||
        typeof data.imageUrl !== "string" ||
        !data.imageUrl
      ) {
        throw new Error(
          "The backend returned incomplete clothing item details."
        );
      }

      const savedItem: ClothingItem = {
        id: data.id,
        name: data.name,
        category: data.category,
        colour: data.color?.trim() || "Not specified",
        image: data.imageUrl,
      };

      // Avoid showing the same database record twice
      // when the backend detects an identical image.
      setItems((currentItems) => {
        const alreadyExists = currentItems.some(
          (item) => item.id === savedItem.id
        );

        return alreadyExists
          ? currentItems.map((item) =>
              item.id === savedItem.id
                ? savedItem
                : item
            )
          : [...currentItems, savedItem];
      });

      setWardrobeError("");
      setActiveCategory(savedItem.category);
      resetFilters();
      closeModal();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while uploading the photo."
      );

      setUploadStatus("idle");
    }
  }

  function selectCategory(category: string) {
    setActiveCategory(category);
    resetFilters();
  }

  // Send the complete conversation history to the AI stylist.
  async function sendChatMessage(suggestion?: string) {
    const message = (suggestion ?? chatInput).trim();

    if (!message || chatLoading) return;

    setChatError("");
    setChatInput("");

    // Build the conversation history BEFORE updating React state.
    // This includes all previous messages and the current user message.
    const conversationHistory: ChatMessage[] = [
      ...chatMessages,
      { role: "user", content: message },
    ];

    // Display the user's message immediately.
    setChatMessages(conversationHistory);

    setChatLoading(true);

    try {
      const response = await fetch("/api/stylist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,

          // Important: send the previous conversation to Ollama.
          history: conversationHistory,

          // Send the current wardrobe information.
          wardrobe: items.map((item) => ({
            name: item.name,
            category: item.category,
            colour: item.colour,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Your stylist couldn't respond."
        );
      }

      if (
        typeof data.reply !== "string" ||
        !data.reply.trim()
      ) {
        throw new Error(
          "The stylist returned an empty response."
        );
      }

      setChatMessages((current) => [
        ...current,
        { role: "assistant", content: data.reply },
      ]);
    } catch (err) {
      setChatError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setChatLoading(false);
    }
  }

  const categoryItems =
    activeCategory === "All items"
      ? items
      : items.filter(
          (item) => item.category === activeCategory
        );

  const availableColours = [
    ...new Set(
      categoryItems
        .map((item) => item.colour)
        .filter(
          (colour) => colour !== "Not specified"
        )
    ),
  ].sort();

  const visibleItems = categoryItems
    .filter((item) => {
      const query = search.trim().toLowerCase();

      const matchesSearch =
        item.name.toLowerCase().includes(query) ||
        item.colour.toLowerCase().includes(query);

      const matchesColour =
        colourFilter === "All colours" ||
        item.colour === colourFilter;

      return matchesSearch && matchesColour;
    })
    .sort((a, b) =>
      sortOrder === "newest"
        ? b.id - a.id
        : a.id - b.id
    );

  const displayedItems = visibleItems.slice(
    0,
    visibleCount
  );

  return (
    <main className="min-h-screen bg-[#faf8f3] text-[#292b25]">
      <nav className="flex items-center justify-between border-b border-[#e7e2d7] px-6 py-5 md:px-12">
        <a href="/" className="font-serif text-2xl">
          Fashionable Chic
        </a>

        <span className="hidden text-sm text-[#686c5c] sm:block">
          Your style. Your story.
        </span>

        <button
          onClick={openModal}
          className="rounded-full bg-[#78816b] px-5 py-3 text-sm text-white transition hover:bg-[#626b57]"
        >
          + Add clothing
        </button>
      </nav>

      <section className="mx-auto max-w-6xl px-6 py-12 md:px-12">
        {isLoadingItems && (
          <p
            className="mb-6 text-sm text-[#686c5c]"
            role="status"
          >
            Loading your wardrobe...
          </p>
        )}

        {wardrobeError && (
          <div
            className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            role="alert"
          >
            {wardrobeError}
          </div>
        )}

        {activeCategory === "All items" ? (
          <>
            <p className="text-sm uppercase tracking-[0.25em] text-[#78816b]">
              Your personal space
            </p>

            <h1 className="mt-3 font-serif text-4xl md:text-5xl">
              My Wardrobe
            </h1>

            <p className="mt-3 max-w-xl leading-7 text-[#686c5c]">
              Everything you own, all in one place.
              Discover new combinations and make every
              outfit count.
            </p>

            <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {categories.map((category) => {
                const count =
                  category.name === "All items"
                    ? items.length
                    : items.filter(
                        (item) =>
                          item.category === category.name
                      ).length;

                return (
                  <button
                    key={category.name}
                    onClick={() =>
                      selectCategory(category.name)
                    }
                    className="rounded-2xl border border-[#e7e2d7] bg-white p-5 text-left transition hover:border-[#78816b] hover:bg-[#e9e7dc]"
                  >
                    <span className="text-2xl">
                      {category.icon}
                    </span>

                    <p className="mt-4 font-medium">
                      {category.name}
                    </p>

                    <p className="mt-1 text-xs text-[#858779]">
                      {count}{" "}
                      {count === 1 ? "item" : "items"}
                    </p>
                  </button>
                );
              })}
            </div>

            <p className="mt-6 text-center text-sm text-[#858779]">
              Choose a category to explore your collection.
            </p>

            {items.length > 0 && (
              <div className="mt-10">
                <h2 className="font-serif text-2xl">
                  Recently in your wardrobe
                </h2>

                <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                  {items
                    .slice()
                    .sort((a, b) => b.id - a.id)
                    .slice(0, 4)
                    .map((item) => (
                      <article
                        key={item.id}
                        className="overflow-hidden rounded-2xl border border-[#e7e2d7] bg-white"
                      >
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.name}
                            loading="lazy"
                            className="h-56 w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-56 items-center justify-center bg-[#f4f0e7] text-sm text-[#858779]">
                            Image unavailable
                          </div>
                        )}

                        <div className="p-4">
                          <h3 className="font-medium">
                            {item.name}
                          </h3>

                          <p className="mt-1 text-sm text-[#686c5c]">
                            {item.colour}
                          </p>

                          <p className="mt-2 text-xs text-[#858779]">
                            {item.category}
                          </p>
                        </div>
                      </article>
                    ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <button
              onClick={() =>
                selectCategory("All items")
              }
              className="mb-6 text-sm text-[#78816b] hover:underline"
            >
              ← Back to wardrobe
            </button>

            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-[#78816b]">
                  Your collection
                </p>

                <h1 className="mt-2 font-serif text-4xl">
                  {activeCategory}
                </h1>

                <p className="mt-2 text-sm text-[#686c5c]">
                  {categoryItems.length}{" "}
                  {categoryItems.length === 1
                    ? "item"
                    : "items"}{" "}
                  in this category
                </p>
              </div>

              <button
                onClick={openModal}
                className="rounded-full bg-[#78816b] px-5 py-3 text-sm text-white hover:bg-[#626b57]"
              >
                + Add clothing
              </button>
            </div>

            {categoryItems.length > 0 && (
              <div className="mt-8 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                <div className="sm:col-span-2 md:col-span-1">
                  <label
                    htmlFor="wardrobe-search"
                    className="mb-2 block text-sm font-medium"
                  >
                    Search
                  </label>

                  <input
                    id="wardrobe-search"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setVisibleCount(PAGE_SIZE);
                    }}
                    placeholder="Search name or colour..."
                    className="w-full rounded-xl border border-[#d8d5ca] bg-white px-4 py-3 outline-none focus:border-[#78816b]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="colour-filter"
                    className="mb-2 block text-sm font-medium"
                  >
                    Filter by colour
                  </label>

                  <select
                    id="colour-filter"
                    value={colourFilter}
                    onChange={(event) => {
                      setColourFilter(event.target.value);
                      setVisibleCount(PAGE_SIZE);
                    }}
                    className="w-full rounded-xl border border-[#d8d5ca] bg-white px-4 py-3 outline-none focus:border-[#78816b]"
                  >
                    <option>All colours</option>

                    {availableColours.map((colour) => (
                      <option key={colour} value={colour}>
                        {colour}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="sort-order"
                    className="mb-2 block text-sm font-medium"
                  >
                    Sort by
                  </label>

                  <select
                    id="sort-order"
                    value={sortOrder}
                    onChange={(event) => {
                      setSortOrder(event.target.value);
                      setVisibleCount(PAGE_SIZE);
                    }}
                    className="w-full rounded-xl border border-[#d8d5ca] bg-white px-4 py-3 outline-none focus:border-[#78816b]"
                  >
                    <option value="newest">
                      Recently added
                    </option>
                    <option value="oldest">
                      Oldest added
                    </option>
                  </select>
                </div>
              </div>
            )}

            {visibleItems.length === 0 ? (
              <div className="mt-8 rounded-3xl border border-dashed border-[#d3d2c4] bg-[#f4f0e7] px-6 py-12 text-center">
                <span className="text-4xl">✳</span>

                <h2 className="mt-4 font-serif text-2xl">
                  {categoryItems.length === 0
                    ? `Your ${activeCategory.toLowerCase()} collection is empty`
                    : "No matching items"}
                </h2>

                <p className="mt-2 text-sm text-[#686c5c]">
                  {categoryItems.length === 0
                    ? "Add your first item to start building this collection."
                    : "Try another search or change your colour filter."}
                </p>

                {categoryItems.length === 0 && (
                  <button
                    onClick={openModal}
                    className="mt-5 rounded-full bg-[#78816b] px-6 py-3 text-sm text-white hover:bg-[#626b57]"
                  >
                    + Add clothing
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                  {displayedItems.map((item) => (
                    <article
                      key={item.id}
                      className="overflow-hidden rounded-2xl border border-[#e7e2d7] bg-white"
                    >
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.name}
                          loading="lazy"
                          className="h-56 w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-56 items-center justify-center bg-[#f4f0e7] text-sm text-[#858779]">
                          Image unavailable
                        </div>
                      )}

                      <div className="p-4">
                        <h2 className="font-medium">
                          {item.name}
                        </h2>

                        <p className="mt-1 text-sm text-[#686c5c]">
                          {item.colour}
                        </p>

                        <p className="mt-2 text-xs text-[#858779]">
                          {item.category}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="mt-8 text-center">
                  <p className="mb-3 text-sm text-[#686c5c]">
                    Showing {displayedItems.length} of{" "}
                    {visibleItems.length} matching items
                  </p>

                  {displayedItems.length <
                    visibleItems.length && (
                    <button
                      onClick={() =>
                        setVisibleCount(
                          (count) => count + PAGE_SIZE
                        )
                      }
                      className="rounded-full border border-[#78816b] px-6 py-3 text-sm transition hover:bg-[#78816b] hover:text-white"
                    >
                      Load 8 more
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* Occasions and AI Stylist */}
        <section className="mt-14 grid gap-4 border-t border-[#e7e2d7] pt-8 sm:grid-cols-2">
          <div className="rounded-2xl bg-[#e9e7dc] p-6">
            <span className="text-2xl">🗓️</span>

            <h2 className="mt-3 font-serif text-xl">
              My Occasions
            </h2>

            <p className="mt-2 text-sm leading-6 text-[#686c5c]">
              Organize your wardrobe for church, office,
              weddings and every special moment.
            </p>
          </div>

          <div className="rounded-2xl bg-[#eee5df] p-6">
            <span className="text-2xl">✨</span>

            <h2 className="mt-3 font-serif text-xl">
              Your AI Stylist
            </h2>

            <p className="mt-2 text-sm leading-6 text-[#686c5c]">
              Your wardrobe, your personal stylist. Ask
              questions and discover outfits using clothes
              you already own.
            </p>

            <button
              type="button"
              onClick={() =>
                setChatOpen((open) => !open)
              }
              className="mt-4 rounded-full bg-[#78816b] px-5 py-3 text-sm text-white hover:bg-[#626b57]"
            >
              {chatOpen
                ? "Close stylist"
                : "Chat with your stylist"}
            </button>

            {chatOpen && (
              <div className="mt-5 rounded-2xl border border-[#e7e2d7] bg-[#faf8f3] p-4">
                <div
                  aria-live="polite"
                  className="max-h-96 space-y-3 overflow-y-auto"
                >
                  {chatMessages.map((message, index) => (
                    <div
                      key={index}
                      className={`rounded-xl p-3 text-sm leading-6 ${
                        message.role === "user"
                          ? "ml-6 bg-[#e9e7dc]"
                          : "mr-6 border border-[#e7e2d7] bg-white"
                      }`}
                    >
                      <p className="mb-1 text-xs font-semibold text-[#78816b]">
                        {message.role === "user"
                          ? "You"
                          : "Fashionable Chic"}
                      </p>

                      <p className="whitespace-pre-wrap">
                        {message.content}
                      </p>
                    </div>
                  ))}

                  {chatLoading && (
                    <p className="text-sm text-[#686c5c]">
                      Your stylist is thinking...
                    </p>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    "What clothes do I have?",
                    "Suggest an outfit",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      disabled={chatLoading}
                      onClick={() =>
                        void sendChatMessage(suggestion)
                      }
                      className="rounded-full border border-[#78816b] px-3 py-2 text-xs hover:bg-[#e9e7dc] disabled:opacity-50"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>

                <form
                  className="mt-4 flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void sendChatMessage();
                  }}
                >
                  <input
                    value={chatInput}
                    onChange={(event) =>
                      setChatInput(event.target.value)
                    }
                    placeholder="Ask your stylist..."
                    maxLength={2000}
                    disabled={chatLoading}
                    className="min-w-0 flex-1 rounded-xl border border-[#d8d5ca] bg-white px-3 py-3 text-sm outline-none focus:border-[#78816b]"
                  />

                  <button
                    type="submit"
                    disabled={
                      chatLoading || !chatInput.trim()
                    }
                    className="rounded-xl bg-[#78816b] px-4 py-3 text-sm text-white hover:bg-[#626b57] disabled:opacity-50"
                  >
                    Send
                  </button>
                </form>

                {chatError && (
                  <p
                    role="alert"
                    className="mt-3 text-sm text-red-700"
                  >
                    {chatError}
                  </p>
                )}

                <p className="mt-3 text-xs leading-5 text-[#858779]">
                  {items.length} wardrobe{" "}
                  {items.length === 1 ? "item" : "items"}{" "}
                  available to your stylist. Chat history and
                  wardrobe items are currently kept in memory.
                </p>
              </div>
            )}
          </div>
        </section>
      </section>

      <footer className="border-t border-[#e7e2d7] px-6 py-8 text-center text-sm text-[#686c5c]">
        Fashionable Chic · Fashion is personal.
      </footer>

      {/* Clothing upload modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeModal();
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-title"
            className="my-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-[#faf8f3] p-6 shadow-2xl sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[#78816b]">
                  Grow your collection
                </p>

                <h2
                  id="upload-title"
                  className="mt-2 font-serif text-3xl"
                >
                  Add clothing
                </h2>

                <p className="mt-2 text-sm text-[#686c5c]">
                  Upload a photo and let AI identify your item.
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                aria-label="Close upload form"
                className="rounded-full px-3 py-2 text-xl hover:bg-[#e9e7dc]"
              >
                ×
              </button>
            </div>

            <div className="mt-6 space-y-5">
              {uploadStatus === "idle" && (
                <>
                  <label
                    htmlFor="clothing-photo"
                    className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[#b8b9a9] bg-white p-4 text-center hover:bg-[#f4f0e7]"
                  >
                    {preview ? (
                      <img
                        src={preview}
                        alt="Selected clothing preview"
                        className="max-h-72 rounded-xl object-contain"
                      />
                    ) : (
                      <>
                        <span className="text-4xl">📷</span>

                        <span className="mt-3 text-sm font-medium">
                          Choose a clothing photo
                        </span>

                        <span className="mt-1 text-xs text-[#686c5c]">
                          JPG, PNG or WebP · Max 5 MB
                        </span>
                      </>
                    )}
                  </label>

                  <input
                    id="clothing-photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handlePhotoChange}
                    className="block w-full text-sm"
                  />

                  {error && (
                    <p
                      role="alert"
                      className="text-sm text-red-700"
                    >
                      {error}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => void uploadClothing()}
                    disabled={!file}
                    className="w-full rounded-full bg-[#78816b] px-6 py-3 text-sm text-white hover:bg-[#626b57] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Upload and identify
                  </button>
                </>
              )}

              {uploadStatus === "analyzing" && (
                <div className="py-10 text-center">
                  {preview && (
                    <img
                      src={preview}
                      alt="Clothing being uploaded"
                      className="mx-auto mb-5 max-h-48 rounded-2xl object-contain"
                    />
                  )}

                  <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#d8d5ca] border-t-[#78816b]" />

                  <h3 className="mt-5 font-serif text-2xl">
                    Adding your item
                  </h3>

                  <p className="mt-2 text-sm text-[#686c5c]">
                    We're identifying your beautiful piece and adding
                    it to your personal wardrobe. Just a moment, lovely!
                  </p>
                </div>
              )}

              {error && uploadStatus === "analyzing" && (
                <p
                  role="alert"
                  className="text-sm text-red-700"
                >
                  {error}
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

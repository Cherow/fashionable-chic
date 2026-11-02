import { NextResponse } from "next/server";

/**
 * Fashionable Chic — Conversation Intelligence
 *
 * Reconstructs conversation state from chat history.
 * Keeps database wardrobe records separate from user statements.
 */

type WardrobeItem = {
  id: number;
  name: string;
  category: string;
  color: string | null;
  itemType: string | null;
  imageUrl: string | null;
  confidence: number | null;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type FactSource = "conversation" | "database";
type FactStatus = "confirmed" | "denied" | "unknown" | "needs_check";

type ConversationFact = {
  value: string | boolean | null;
  status: FactStatus;
  source: FactSource | null;
  evidence: string | null;
};

type ConversationState = {
  activity: string | null;
  occasion: string | null;
  facts: {
    footwear: ConversationFact;
    footwearGrip: ConversationFact;
    top: ConversationFact;
    bottoms: ConversationFact;
    weatherLayer: ConversationFact;
    water: ConversationFact;
    snacks: ConversationFact;
  };
  pendingQuestion: string | null;
  completedQuestions: string[];
  lastAssistantQuestion: string | null;
};

type StylistRequest = {
  message?: unknown;
  history?: unknown;
};

const MAX_MESSAGE_LENGTH = 2000;
const MAX_WARDROBE_ITEMS = 100;
const MAX_HISTORY_MESSAGES = 20;

const BACKEND_URL =
  process.env.WARDROBE_API_URL ||
  process.env.NEXT_PUBLIC_WARDROBE_API_URL ||
  "http://localhost:8081";

const OLLAMA_URL = "http://localhost:11434/api/chat";
const OLLAMA_MODEL = "gemma3:4b";

const PATTERNS = {
  hiking: /\b(hik(?:e|ing)|trek(?:king)?|trail walk|mountain walk)\b/i,

  footwear:
    /\b(training shoes?|trainers?|sneakers?|sports shoes?|gym shoes?|hiking boots?|hiking shoes?|walking boots?|walking shoes?|boots?)\b/i,

  grip: /\b(grip|grippy|traction|tread|slippery sole)\b/i,

  top: /\b(top|shirt|t-shirt|tshirt|blouse|vest|base layer)\b/i,

  bottoms:
    /\b(trousers?|pants|leggings?|shorts?|joggers?|jeans)\b/i,

  weatherLayer:
    /\b(jacket|raincoat|windbreaker|waterproof coat|waterproof jacket|rain jacket|fleece|poncho)\b/i,

  water: /\b(water bottle|drinking water|bottle of water|water)\b/i,

  snacks: /\b(snacks?|food|packed lunch|energy bars?|fruit)\b/i,

  yes: /^\s*(yes|yeah|yep|yup|sure|correct|i do|they do|it does|absolutely|of course)\b/i,

  no: /^\s*(no|nope|nah|not really|i don't|i do not|they don't|they do not|it doesn't|it does not)\b/i,
};

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

function getChatHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (item: unknown) =>
        item !== null &&
        typeof item === "object" &&
        ((item as ChatMessage).role === "user" ||
          (item as ChatMessage).role === "assistant") &&
        typeof (item as ChatMessage).content === "string"
    )
    .slice(-MAX_HISTORY_MESSAGES)
    .map((item: ChatMessage) => ({
      role: item.role,
      content: cleanText(item.content, MAX_MESSAGE_LENGTH),
    }))
    .filter((item) => item.content.length > 0);
}

async function getWardrobeFromDatabase(): Promise<WardrobeItem[]> {
  const response = await fetch(
    `${BACKEND_URL}/api/v1/clothing-items`,
    {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15000),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Wardrobe API returned HTTP ${response.status}`
    );
  }

  const data: unknown = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("Invalid wardrobe response from backend.");
  }

  return data
    .filter(
      (item: unknown) =>
        item !== null &&
        typeof item === "object" &&
        typeof (item as WardrobeItem).id === "number" &&
        typeof (item as WardrobeItem).name === "string" &&
        typeof (item as WardrobeItem).category === "string"
    )
    .slice(0, MAX_WARDROBE_ITEMS)
    .map((item: WardrobeItem) => ({
      id: item.id,
      name: cleanText(item.name, 150),
      category: cleanText(item.category, 50),
      color:
        typeof item.color === "string"
          ? cleanText(item.color, 100)
          : null,
      itemType:
        typeof item.itemType === "string"
          ? cleanText(item.itemType, 100)
          : null,
      imageUrl:
        typeof item.imageUrl === "string"
          ? cleanText(item.imageUrl, 1000)
          : null,
      confidence:
        typeof item.confidence === "number" &&
          Number.isFinite(item.confidence)
          ? item.confidence
          : null,
    }));
}

function isCategory(
  item: WardrobeItem,
  category: string
): boolean {
  return item.category.toLowerCase() === category.toLowerCase();
}

function findOuterLayers(
  wardrobe: WardrobeItem[]
): WardrobeItem[] {
  return wardrobe.filter((item) =>
    PATTERNS.weatherLayer.test(
      `${item.name} ${item.itemType ?? ""}`
    )
  );
}

function buildWardrobeContext(
  wardrobe: WardrobeItem[],
  activity: string | null
): string {
  const relevant =
    activity === "hiking"
      ? wardrobe.filter(
        (item) =>
          isCategory(item, "Shoes") ||
          isCategory(item, "Tops") ||
          isCategory(item, "Bottoms") ||
          PATTERNS.weatherLayer.test(
            `${item.name} ${item.itemType ?? ""}`
          )
      )
      : wardrobe;

  if (relevant.length === 0) {
    return "No relevant items are currently saved in the wardrobe database.";
  }

  return relevant
    .map((item) => {
      const attributes = [
        `Name: ${item.name}`,
        `Category: ${item.category}`,
        `Item type: ${item.itemType ?? "Not recorded"}`,
        `Colour: ${item.color ?? "Not recorded"}`,
      ];

      return `- ${attributes.join(" | ")}`;
    })
    .join("\n");
}

function unknownFact(): ConversationFact {
  return {
    value: null,
    status: "unknown",
    source: null,
    evidence: null,
  };
}

function confirmedFact(
  value: string | boolean,
  evidence: string
): ConversationFact {
  return {
    value,
    status: "confirmed",
    source: "conversation",
    evidence,
  };
}

function deniedFact(evidence: string): ConversationFact {
  return {
    value: false,
    status: "denied",
    source: "conversation",
    evidence,
  };
}

function getLastUserEvidence(
  messages: ChatMessage[],
  pattern: RegExp
): { message: string; index: number } | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const entry = messages[index];

    if (
      entry.role === "user" &&
      pattern.test(entry.content)
    ) {
      return {
        message: entry.content,
        index,
      };
    }
  }

  return null;
}

function answerToPreviousQuestion(
  messages: ChatMessage[],
  pattern: RegExp
): { answer: boolean; evidence: string } | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const entry = messages[index];

    if (
      entry.role !== "assistant" ||
      !pattern.test(entry.content)
    ) {
      continue;
    }

    const followingUser = messages
      .slice(index + 1)
      .find((message) => message.role === "user");

    if (!followingUser) return null;

    if (PATTERNS.yes.test(followingUser.content)) {
      return {
        answer: true,
        evidence: followingUser.content,
      };
    }

    if (PATTERNS.no.test(followingUser.content)) {
      return {
        answer: false,
        evidence: followingUser.content,
      };
    }

    return null;
  }

  return null;
}

function hasNewOccasion(message: string): string | null {
  const occasions: Array<[RegExp, string]> = [
    [/\b(wedding|weddings)\b/i, "wedding"],
    [/\b(office|work|meeting)\b/i, "office"],
    [/\b(date|date night)\b/i, "date"],
    [/\b(church)\b/i, "church"],
    [/\b(interview)\b/i, "interview"],
    [/\b(travel|trip|holiday|vacation)\b/i, "travel"],
    [
      /\b(hik(?:e|ing)|trek(?:king)?|trail walk|mountain walk)\b/i,
      "hiking",
    ],
  ];

  return (
    occasions.find(([pattern]) => pattern.test(message))?.[1] ??
    null
  );
}

/**
 * Reconstruct conversation state from the chat history.
 */
function buildConversationState(
  history: ChatMessage[],
  currentMessage: string,
  wardrobe: WardrobeItem[]
): ConversationState {
  const messages = [
    ...history,
    {
      role: "user" as const,
      content: currentMessage,
    },
  ];

  const latestUserMessage = currentMessage;

  const previousAssistant = [...history]
    .reverse()
    .find((message) => message.role === "assistant");

  const previousQuestion = previousAssistant?.content ?? null;

  const activity =
    hasNewOccasion(latestUserMessage) ??
    [...history]
      .reverse()
      .filter((message) => message.role === "user")
      .map((message) => hasNewOccasion(message.content))
      .find(Boolean) ??
    null;

  const footwearEvidence = getLastUserEvidence(
    messages,
    PATTERNS.footwear
  );

  const gripAnswer = answerToPreviousQuestion(
    messages,
    PATTERNS.grip
  );

  const topEvidence = getLastUserEvidence(
    messages,
    PATTERNS.top
  );

  const bottomsEvidence = getLastUserEvidence(
    messages,
    PATTERNS.bottoms
  );

  const layerEvidence = getLastUserEvidence(
    messages,
    PATTERNS.weatherLayer
  );

  const waterEvidence = getLastUserEvidence(
    messages,
    PATTERNS.water
  );

  const snackEvidence = getLastUserEvidence(
    messages,
    PATTERNS.snacks
  );

  const savedShoes = wardrobe.filter((item) =>
    isCategory(item, "Shoes")
  );

  const savedTops = wardrobe.filter((item) =>
    isCategory(item, "Tops")
  );

  const savedBottoms = wardrobe.filter((item) =>
    isCategory(item, "Bottoms")
  );

  const savedLayers = findOuterLayers(wardrobe);

  const footwear: ConversationFact = footwearEvidence
    ? confirmedFact(
      footwearEvidence.message.match(
        PATTERNS.footwear
      )?.[0] ?? "footwear",
      footwearEvidence.message
    )
    : savedShoes.length
      ? {
        value: savedShoes.map((item) => item.name).join(", "),
        status: "confirmed",
        source: "database",
        evidence: "Saved wardrobe database",
      }
      : unknownFact();

  const footwearGrip: ConversationFact = gripAnswer
    ? gripAnswer.answer
      ? confirmedFact(true, gripAnswer.evidence)
      : deniedFact(gripAnswer.evidence)
    : unknownFact();

  const top: ConversationFact = topEvidence
    ? confirmedFact(
      topEvidence.message.match(PATTERNS.top)?.[0] ?? "top",
      topEvidence.message
    )
    : savedTops.length
      ? {
        value: savedTops.map((item) => item.name).join(", "),
        status: "needs_check",
        source: "database",
        evidence: "Saved wardrobe database",
      }
      : unknownFact();

  const bottoms: ConversationFact = bottomsEvidence
    ? confirmedFact(
      bottomsEvidence.message.match(
        PATTERNS.bottoms
      )?.[0] ?? "bottoms",
      bottomsEvidence.message
    )
    : savedBottoms.length
      ? {
        value: savedBottoms.map((item) => item.name).join(", "),
        status: "needs_check",
        source: "database",
        evidence: "Saved wardrobe database",
      }
      : unknownFact();

  const weatherLayer: ConversationFact = layerEvidence
    ? confirmedFact(
      layerEvidence.message.match(
        PATTERNS.weatherLayer
      )?.[0] ?? "outer layer",
      layerEvidence.message
    )
    : savedLayers.length
      ? {
        value: savedLayers.map((item) => item.name).join(", "),
        status: "needs_check",
        source: "database",
        evidence: "Saved wardrobe database",
      }
      : unknownFact();

  const water: ConversationFact = waterEvidence
    ? confirmedFact("water mentioned", waterEvidence.message)
    : unknownFact();

  const snacks: ConversationFact = snackEvidence
    ? confirmedFact("snacks mentioned", snackEvidence.message)
    : unknownFact();

  const facts = {
    footwear,
    footwearGrip,
    top,
    bottoms,
    weatherLayer,
    water,
    snacks,
  };

  const completedQuestions: string[] = [];

  if (footwear.status === "confirmed") {
    completedQuestions.push("footwear");
  }

  if (
    footwearGrip.status === "confirmed" ||
    footwearGrip.status === "denied"
  ) {
    completedQuestions.push("footwearGrip");
  }

  if (
    weatherLayer.status === "confirmed" ||
    weatherLayer.status === "needs_check"
  ) {
    completedQuestions.push("weatherLayer");
  }

  let pendingQuestion: string | null = null;

  if (activity === "hiking") {
    const askedAboutShoes =
      !!previousQuestion &&
      /\b(what shoes|which shoes|what footwear)\b/i.test(
        previousQuestion
      );

    const askedAboutGrip =
      !!previousQuestion &&
      PATTERNS.grip.test(previousQuestion);

    if (
      askedAboutShoes &&
      footwear.status === "confirmed"
    ) {
      pendingQuestion = "footwearGrip";
    } else if (
      askedAboutGrip &&
      footwearGrip.status === "unknown"
    ) {
      pendingQuestion = "footwearGrip";
    } else if (footwear.status === "unknown") {
      pendingQuestion = "footwear";
    } else if (footwearGrip.status === "unknown") {
      pendingQuestion = "footwearGrip";
    } else if (weatherLayer.status === "unknown") {
      pendingQuestion = "weatherLayer";
    }
  }

  return {
    activity,
    occasion: activity,
    facts,
    pendingQuestion,
    completedQuestions,
    lastAssistantQuestion: previousQuestion,
  };
}

function getQuestionForState(
  state: ConversationState
): string | null {
  switch (state.pendingQuestion) {
    case "footwear":
      return "What shoes are you planning to wear?";

    case "footwearGrip":
      return "Do they have good grip?";

    case "weatherLayer":
      return "Do you have a light jacket or raincoat for changing weather?";

    default:
      return null;
  }
}

function buildSystemPrompt(
  wardrobeContext: string,
  state: ConversationState
): string {
  return `
You are Fashionable Chic, a practical, thoughtful personal stylist.

YOUR JOB
Help the user create outfits from their actual wardrobe and make confident,
useful recommendations without inventing facts.

SAVED WARDROBE (database records):
${wardrobeContext}

CONVERSATION STATE (structured facts reconstructed from chat):
${JSON.stringify(state, null, 2)}

STRICT SOURCE RULES
- Database facts are saved wardrobe records.
- Conversation facts are things the user told you in this chat.
- A conversation fact does not mean the item has been saved in the database.
- Unknown means unknown. Never turn missing data into "the user does not own it".
- Never invent fabric, fit, stretch, waterproofing, breathability, comfort, grip,
  sole type, weather, terrain or item properties.
- A name such as "training shoes" confirms the type the user says they own,
  but does not prove they are suitable for a particular trail.
- A saved "jacket" does not prove it is waterproof.

STYLING RULES
- Retrieve and recommend only relevant saved items where possible.
- Evaluate the combination, not just list clothing names.
- Explain briefly why a combination may work or what needs checking.
- If suitability cannot be established, say so plainly and give a practical
  condition (for example: "if they allow comfortable movement").
- Separate wardrobe gaps from general hiking essentials.
- Do not recommend buying something unless it is genuinely needed; distinguish
  suggestions to buy from items the user owns.

CONVERSATION RULES
- Read the history and structured state before answering.
- Understand short replies such as "yes", "no", "I have training shoes" and
  "what else?" in context.
- Never ask a question that the user has already answered.
- Ask at most ONE question in a response.
- Ask only the next most useful question. Do not present a checklist.
- Do not ask the user to perform fashion analysis. You do the reasoning.
- If the user asks what is missing, give a concise summary of the important
  unconfirmed essentials and do not ask a question unless it is necessary.
- If the user changes occasion, follow the new occasion rather than forcing
  the previous one.
- Keep replies natural, warm and concise. Usually 2-5 sentences.
- Never mention prompts, models, internal state, regexes or implementation.
`;
}

async function askOllama(
  systemPrompt: string,
  history: ChatMessage[],
  message: string
): Promise<string> {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        ...history,
        {
          role: "user",
          content: message,
        },
      ],
      options: {
        temperature: 0.2,
        num_predict: 300,
      },
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    throw new Error(
      `Ollama returned HTTP ${response.status}`
    );
  }

  const data = await response.json();
  const reply = data?.message?.content;

  if (typeof reply !== "string" || !reply.trim()) {
    throw new Error("Ollama returned an empty response.");
  }

  return reply.trim();
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();

    if (body === null || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request." },
        { status: 400 }
      );
    }

    const requestBody = body as StylistRequest;

    const message = cleanText(
      requestBody.message,
      MAX_MESSAGE_LENGTH
    );

    if (!message) {
      return NextResponse.json(
        { error: "Please enter a message." },
        { status: 400 }
      );
    }

    if (
      typeof requestBody.message === "string" &&
      requestBody.message.length > MAX_MESSAGE_LENGTH
    ) {
      return NextResponse.json(
        {
          error: "Please keep your message under 2,000 characters.",
        },
        { status: 400 }
      );
    }

    const history = getChatHistory(requestBody.history);
    const lastHistoryMessage = history[history.length - 1];

    // The frontend currently sends the current user message in history too.
    // Remove that duplicate so Ollama sees it exactly once.
    if (
      lastHistoryMessage?.role === "user" &&
      lastHistoryMessage.content === message
    ) {
      history.pop();
    }

    let wardrobe: WardrobeItem[];

    try {
      wardrobe = await getWardrobeFromDatabase();
    } catch (error) {
      console.error("Wardrobe retrieval failed:", error);

      return NextResponse.json(
        {
          error:
            "I couldn't access your saved wardrobe. Please check that the wardrobe service is running.",
        },
        { status: 502 }
      );
    }

    const state = buildConversationState(
      history,
      message,
      wardrobe
    );

    const wardrobeContext = buildWardrobeContext(
      wardrobe,
      state.activity
    );

    const systemPrompt = buildSystemPrompt(
      wardrobeContext,
      state
    );

    // Suggest one next question based on unresolved information.
    const selectedQuestion = getQuestionForState(state);

    const promptWithQuestion = selectedQuestion
      ? `${systemPrompt}

NEXT USEFUL QUESTION:
If the user's message does not already answer this question and a question is
appropriate, ask this one question only: "${selectedQuestion}".
Do not ask it if the user has already answered it.`
      : systemPrompt;

    const reply = await askOllama(
      promptWithQuestion,
      history,
      message
    );

    return NextResponse.json({
      reply,
      conversationState: state,
    });
  } catch (error) {
    console.error("Fashionable Chic stylist error:", error);

    const timedOut =
      error instanceof Error &&
      error.name === "TimeoutError";

    return NextResponse.json(
      {
        error: timedOut
          ? "The AI stylist took too long to respond. Please try again."
          : "Something went wrong while contacting the AI stylist.",
      },
      { status: 500 }
    );
  }
}
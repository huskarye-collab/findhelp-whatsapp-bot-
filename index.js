
const express = require("express");
const OpenAI = require("openai");

const app = express();
app.use(express.json({ limit: "20kb" }));

const PORT = process.env.PORT || 3000;
const BOT_NAME = "FindHelp";
const VERSION = "2.0.0";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const RULES = [
  "Be respectful to everyone.",
  "No harassment or bullying.",
  "No dangerous activities.",
  "No spam or scams.",
  "Protect personal information."
];

const COMMANDS = [
  "!Ban @user",
  "!Kick @user",
  "!Unban @user",
  "!Mute @user",
  "!Warn @user",
  "!Rules",
  "!Help",
  "!Info"
];

const SYSTEM_PROMPT = `
You are FindHelp, a friendly AI assistant and safety helper.

You should:
- Answer questions clearly.
- Explain educational topics.
- Give useful and responsible advice.
- Recognize emergencies and encourage contacting emergency services.
- Never pretend you have contacted emergency services.
- Never encourage dangerous activities.
- Be respectful and concise.
`;

// OPENAI AI
async function askOpenAI(prompt) {
  if (!openai) throw new Error("OpenAI key missing");

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt }
    ]
  });

  return response.choices[0].message.content;
}

// GEMINI BACKUP
async function askGemini(prompt) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Gemini key missing");
  }

  const { GoogleGenAI } = await import("@google/genai");

  const gemini = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
  });

  const response = await gemini.models.generateContent({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    contents: `${SYSTEM_PROMPT}\n\nUser: ${prompt}`
  });

  return response.text;
}

// AUTOMATIC AI BACKUP
async function getAIResponse(prompt) {
  try {
    return {
      provider: "OpenAI",
      answer: await askOpenAI(prompt)
    };
  } catch (error) {
    console.error("OpenAI error:", error.message);
  }

  try {
    return {
      provider: "Gemini",
      answer: await askGemini(prompt)
    };
  } catch (error) {
    console.error("Gemini error:", error.message);
  }

  return {
    provider: "None",
    answer: "I'm temporarily unavailable. Please try again later."
  };
}

// HOME
app.get("/", (req, res) => {
  res.send(`${BOT_NAME} v${VERSION} is online!`);
});

// MESSAGE HANDLER
app.post("/message", async (req, res) => {
  try {
    if (
      process.env.WEBHOOK_SECRET &&
      req.get("x-webhook-secret") !== process.env.WEBHOOK_SECRET
    ) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { message, sender, isAdmin } = req.body;

    if (
      typeof message !== "string" ||
      typeof sender !== "string" ||
      message.length > 4000
    ) {
      return res.status(400).json({
        error: "Invalid message or sender."
      });
    }

    const text = message.trim();
    const lower = text.toLowerCase();

    // HELP
    if (lower === "!help") {
      return res.json({
        reply: COMMANDS.join("\n") +
          "\n\nMention FindHelp or @FindHelp to chat with AI."
      });
    }

    // INFO
    if (lower === "!info") {
      return res.json({
        reply: `${BOT_NAME} v${VERSION}\nAI Group Assistant & Safety Bot.`
      });
    }

    // RULES
    if (lower === "!rules") {
      return res.json({
        reply: "GROUP RULES\n\n" +
          RULES.map((rule, i) => `${i + 1}. ${rule}`).join("\n")
      });
    }

    // MODERATION COMMANDS
    const match = text.match(
      /^!(ban|kick|unban|mute|warn)\s+(.+)$/i
    );

    if (match) {
      if (isAdmin !== true) {
        return res.json({
          reply: "Only verified group administrators can use this command."
        });
      }

      return res.json({
        action: match[1].toUpperCase() + "_REQUEST",
        target: match[2].trim(),
        reply: "Moderation request received. WhatsApp integration is required."
      });
    }

    // AI MENTION DETECTION
    const mentioned =
      /\bfindhelp\b/i.test(text) ||
      /@findhelp/i.test(text);

    if (!mentioned) {
      return res.json({ ignored: true });
    }

    const prompt = text.replace(/@?findhelp/gi, "").trim();

    if (!prompt) {
      return res.json({
        reply: "Hello! I'm FindHelp. How can I help you?"
      });
    }

    const result = await getAIResponse(prompt);

    return res.json({
      reply: result.answer,
      ai: result.provider
    });

  } catch (error) {
    console.error("FindHelp error:", error);

    return res.status(500).json({
      error: "Internal server error."
    });
  }
});

app.listen(PORT, () => {
  console.log(`${BOT_NAME} v${VERSION} running on port ${PORT}`);
});

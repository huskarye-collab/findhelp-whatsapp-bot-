const express = require("express");
const OpenAI = require("openai");
const crypto = require("crypto");

const app = express();
app.use(express.json({
  limit: "100kb",
  verify: (req, res, buffer) => {
    req.rawBody = Buffer.from(buffer);
  }
}));

const PORT = process.env.PORT || 3000;
const BOT_NAME = "FindHelp";
const VERSION = "2.2.0";
const GRAPH_API_VERSION = process.env.WHATSAPP_API_VERSION || "v23.0";

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

const SYSTEM_PROMPT = `
You are FindHelp, a friendly AI assistant and safety helper.
Answer clearly and concisely. Explain educational topics and give responsible advice.
Never encourage dangerous or illegal activities, harassment, scams, or sharing private information.
If someone may be in immediate danger, encourage them to contact local emergency services or a trusted person.
Never claim that you contacted emergency services or took an action you did not take.
`;

async function askOpenAI(prompt) {
  if (!openai) throw new Error("OpenAI key missing");

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt }
    ]
  });

  return response.choices[0]?.message?.content?.trim() ||
    "I couldn't prepare an answer. Please try again.";
}

async function askGemini(prompt) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Gemini key missing");
  }

  const { GoogleGenAI } = await import("@google/genai");
  const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const response = await gemini.models.generateContent({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    contents: `${SYSTEM_PROMPT}\n\nUser: ${prompt}`
  });

  return response.text || "I couldn't prepare an answer. Please try again.";
}

async function getAIResponse(prompt) {
  try {
    return { provider: "OpenAI", answer: await askOpenAI(prompt) };
  } catch (error) {
    console.error("OpenAI error:", error.message);
  }

  try {
    return { provider: "Gemini", answer: await askGemini(prompt) };
  } catch (error) {
    console.error("Gemini error:", error.message);
  }

  return {
    provider: "None",
    answer: "I'm temporarily unavailable. Please try again later."
  };
}

function isValidMetaSignature(req) {
  const appSecret = process.env.META_APP_SECRET;
  const signature = req.get("x-hub-signature-256");

  if (!appSecret || !signature || !req.rawBody) return false;

  const expected = "sha256=" + crypto
    .createHmac("sha256", appSecret)
    .update(req.rawBody)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature);

  return expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

async function sendWhatsAppText(to, body) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    throw new Error("WhatsApp Cloud API credentials are not configured");
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: String(body).slice(0, 4000) }
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("WhatsApp send error:", JSON.stringify(result));
    throw new Error("WhatsApp message could not be sent");
  }

  return result;
}

function makeCommandReply(text) {
  const command = text.trim().toLowerCase();

  if (command === "!help") {
    return "FINdHELP COMMANDS\n!Help - Show commands\n!Rules - Show safety rules\n!Info - Bot information\n\nSend me a message to chat with the AI assistant.";
  }

  if (command === "!info") {
    return `FindHelp v${VERSION}\nAI assistant and safety helper.`;
  }

  if (command === "!rules") {
    return "SAFETY RULES\n\n" +
      RULES.map((rule, index) => `${index + 1}. ${rule}`).join("\n");
  }

  if (/^!(ban|kick|unban|mute|warn)\b/i.test(command)) {
    return "Those moderation commands are not available through the official WhatsApp Cloud API. I can provide safety guidance, but I cannot ban, kick, or mute WhatsApp group members.";
  }

  return null;
}

async function handleIncomingMessage(message) {
  if (!message || message.type !== "text" || !message.from) return;

  const incomingText = message.text?.body?.trim();
  if (!incomingText) return;

  const commandReply = makeCommandReply(incomingText);
  let reply = commandReply;

  if (!reply) {
    const result = await getAIResponse(incomingText);
    reply = result.answer;
  }

  await sendWhatsAppText(message.from, reply);
}

async function processWebhook(payload) {
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== "messages") continue;

      const messages = change.value?.messages || [];
      for (const message of messages) {
        try {
          await handleIncomingMessage(message);
        } catch (error) {
          console.error("Incoming WhatsApp message error:", error.message);
        }
      }
    }
  }
}

app.get("/", (req, res) => {
  res.send(`${BOT_NAME} v${VERSION} is online!`);
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    bot: BOT_NAME,
    version: VERSION,
    whatsappConfigured: Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_PHONE_NUMBER_ID &&
      process.env.META_APP_SECRET &&
      process.env.WHATSAPP_VERIFY_TOKEN
    )
  });
});

app.get("/version", (req, res) => {
  res.json({ name: BOT_NAME, version: VERSION });
});

// Bird API: send one approved WhatsApp template to the configured test recipient.
// Keep BIRD_API_KEY and BIRD_SEND_ENDPOINT_SECRET in Railway Variables, never in source code.
async function sendBirdTestTemplate() {
  if (!process.env.BIRD_API_KEY) {
    throw new Error("BIRD_API_KEY is not configured");
  }
  if (!process.env.BIRD_TEST_TO) {
    throw new Error("BIRD_TEST_TO is not configured");
  }

  // Bird's SDK is ESM-only; dynamic import keeps this CommonJS app compatible.
  const { BirdClient } = await import("@messagebird/sdk");
  const bird = new BirdClient({ apiKey: process.env.BIRD_API_KEY });

  return bird.whatsapp.send({
    to: process.env.BIRD_TEST_TO,
    template: {
      slug: "bird_delivery_update",
      parameters: {
        ref: "FH-TEST-001",
        date: new Date().toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric"
        })
      }
    }
  });
}

app.post("/bird/test-send", async (req, res) => {
  const endpointSecret = process.env.BIRD_SEND_ENDPOINT_SECRET;
  const authorization = req.get("authorization") || "";

  if (!endpointSecret || authorization !== `Bearer ${endpointSecret}`) {
    return res.sendStatus(401);
  }

  try {
    const message = await sendBirdTestTemplate();
    return res.status(202).json({
      ok: true,
      messageId: message.id,
      status: message.status
    });
  } catch (error) {
    console.error("Bird WhatsApp send error:", error.message);
    return res.status(502).json({
      ok: false,
      error: "Bird could not accept the test message. Check the Railway variables and Bird template setup."
    });
  }
});


// Meta webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    process.env.WHATSAPP_VERIFY_TOKEN &&
    token === process.env.WHATSAPP_VERIFY_TOKEN &&
    typeof challenge === "string"
  ) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// WhatsApp Cloud API webhook
app.post("/webhook", (req, res) => {
  if (!isValidMetaSignature(req)) {
    return res.sendStatus(401);
  }

  // Acknowledge Meta quickly; process messages after responding.
  res.sendStatus(200);
  processWebhook(req.body).catch(error => {
    console.error("Webhook processing error:", error.message);
  });
});

app.listen(PORT, () => {
  console.log(`${BOT_NAME} v${VERSION} running on port ${PORT}`);
});

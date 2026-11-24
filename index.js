
const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const BOT_NAME = "FindHelp";
const VERSION = "1.1.0";

const RULES = [
  "Be respectful to everyone.",
  "No harassment or bullying.",
  "No dangerous or illegal activities.",
  "No spam or scams.",
  "Keep personal information private."
];

const commands = [
  "!Ban @user",
  "!Kick @user",
  "!Unban @user",
  "!Mute @user",
  "!Warn @user",
  "!Rules",
  "!Help",
  "!Info"
];

// Home route
app.get("/", (req, res) => {
  res.send(`${BOT_NAME} is online!`);
});

// Command and message handler
app.post("/message", async (req, res) => {
  try {
    const { message, sender, isAdmin } = req.body;

    if (!message || !sender) {
      return res.status(400).json({
        error: "Message and sender are required."
      });
    }

    const text = message.trim();
    const lower = text.toLowerCase();

    // HELP
    if (lower === "!help") {
      return res.json({
        reply:
          "🤖 FindHelp Commands\n\n" +
          commands.join("\n") +
          "\n\nAI: Mention FindHelp or @FindHelp."
      });
    }

    // INFO
    if (lower === "!info") {
      return res.json({
        reply:
          `🤖 ${BOT_NAME}\n` +
          `Version: ${VERSION}\n` +
          "AI Group Assistant and Safety Moderator."
      });
    }

    // RULES
    if (lower === "!rules") {
      return res.json({
        reply: "📜 GROUP RULES\n\n" +
          RULES.map((rule, i) => `${i + 1}. ${rule}`).join("\n")
      });
    }

    // ADMIN COMMANDS
    const match = text.match(
      /^!(ban|kick|unban|mute|warn)\s+(.+)$/i
    );

    if (match) {
      const action = match[1].toLowerCase();
      const target = match[2].trim();

      if (!isAdmin) {
        return res.json({
          reply: "⛔ Only group administrators can use this command."
        });
      }

      if (!target) {
        return res.json({
          reply: "Please specify a valid member."
        });
      }

      const actionNames = {
        ban: "BAN",
        kick: "KICK",
        unban: "UNBAN",
        mute: "MUTE",
        warn: "WARN"
      };

      return res.json({
        action: `${actionNames[action]}_REQUEST`,
        target,
        reply:
          `✅ ${action.toUpperCase()} request received for ${target}.\n` +
          "WhatsApp moderation integration is required to execute it."
      });
    }

    // AI ACTIVATION
    const mentionsBot =
      /\bfindhelp\b/i.test(text) ||
      /@findhelp/i.test(text);

    if (!mentionsBot) {
      return res.json({
        ignored: true
      });
    }

    return res.json({
      aiRequest: true,
      sender,
      prompt: text,
      reply:
        "Hello! I'm FindHelp. My AI connection is being configured. " +
        "I'll be ready to answer your questions soon!"
    });

  } catch (error) {
    console.error("FindHelp Error:", error);

    return res.status(500).json({
      error: "FindHelp encountered an internal error."
    });
  }
});

app.listen(PORT, () => {
  console.log(
    `${BOT_NAME} v${VERSION} is running on port ${PORT}`
  );
});


const express = require("express");

const app = express();
app.use(express.json());

const PREFIX = "!";

const config = {
  name: "FindHelp",
  version: "1.0.0",
  aiTrigger: ["findhelp", "@findhelp"]
};

// Basic health check for hosting
app.get("/", (req, res) => {
  res.send("FindHelp is online!");
});

// Incoming message handler
app.post("/message", async (req, res) => {
  try {
    const { message, sender, isAdmin } = req.body;

    if (!message || !sender) {
      return res.status(400).json({
        error: "Missing message or sender"
      });
    }

    const text = message.trim();
    const lower = text.toLowerCase();

    // Admin commands
    if (lower.startsWith("!ban ")) {
      if (!isAdmin) {
        return res.json({
          reply: "Only group administrators can use this command."
        });
      }

      return res.json({
        action: "BAN_REQUEST",
        target: text.slice(5).trim(),
        reply: "Ban request received. WhatsApp integration required."
      });
    }

    if (lower === "!rules") {
      return res.json({
        reply: "Group rules: Be respectful, avoid spam, and keep everyone safe."
      });
    }

    if (lower.startsWith("!warn ")) {
      if (!isAdmin) {
        return res.json({
          reply: "Only group administrators can use this command."
        });
      }

      return res.json({
        action: "WARN_REQUEST",
        target: text.slice(6).trim()
      });
    }

    // AI activation only when mentioned
    const mentioned = config.aiTrigger.some(trigger =>
      lower.includes(trigger)
    );

    if (!mentioned) {
      return res.json({ ignored: true });
    }

    return res.json({
      reply: "Hello! I'm FindHelp. My AI connection is not configured yet, but I'm ready to help!"
    });

  } catch (error) {
    console.error("FindHelp error:", error);

    res.status(500).json({
      error: "Internal server error"
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`FindHelp is running on port ${PORT}`);
});

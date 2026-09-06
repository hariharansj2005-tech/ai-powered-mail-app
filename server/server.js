require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const { PubSub } = require("@google-cloud/pubsub");
const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = 5000;

app.use(cors({ origin: true }));
app.use(express.json());

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

const TOKEN_PATH = path.join(__dirname, "token.json");

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT;
const TOPIC_ID = "gmail-mail-updates";
const SUBSCRIPTION_ID = "gmail-mail-updates-sub";

const TOPIC_NAME = `projects/${PROJECT_ID}/topics/${TOPIC_ID}`;

const pubsub = new PubSub({
  projectId: PROJECT_ID,
  keyFilename: path.join(__dirname, "gmail-pubsub-key.json"),
});

const subscription = pubsub.subscription(SUBSCRIPTION_ID);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

let currentHistoryId = null;
let watchExpiration = null;

const sseClients = new Set();

/* =========================
   BASIC HELPERS
========================= */

function getHeader(headers, name) {
  const header = headers?.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase()
  );

  return header?.value || "";
}

function decodeBase64Url(data) {
  if (!data) return "";

  return Buffer.from(
    data.replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  ).toString("utf8");
}

function htmlToText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractEmailBody(payload) {
  if (!payload) return "";

  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (Array.isArray(payload.parts)) {
    let htmlBody = "";

    for (const part of payload.parts) {
      const mimeType = part.mimeType || "";

      if (mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }

      if (mimeType === "text/html" && part.body?.data) {
        htmlBody = decodeBase64Url(part.body.data);
      }

      const nested = extractEmailBody(part);

      if (nested) {
        if (mimeType === "text/plain") {
          return nested;
        }

        if (!htmlBody) {
          htmlBody = nested;
        }
      }
    }

    if (htmlBody) {
      return htmlToText(htmlBody);
    }
  }

  return "";
}

async function getGmailClient() {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error("Gmail is not connected. Please connect Google first.");
  }

  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials(token);

  return google.gmail({
    version: "v1",
    auth: oauth2Client,
  });
}

/* =========================
   REAL-TIME SSE
========================= */

function broadcastMailboxUpdate(data = {}) {
  const message = `data: ${JSON.stringify({
    type: "mailbox_updated",
    ...data,
  })}\n\n`;

  for (const client of sseClients) {
    try {
      client.write(message);
    } catch {
      sseClients.delete(client);
    }
  }
}

app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.flushHeaders?.();

  res.write(
    `data: ${JSON.stringify({
      type: "connected",
    })}\n\n`
  );

  sseClients.add(res);

  req.on("close", () => {
    sseClients.delete(res);
  });
});

/* =========================
   GMAIL WATCH
========================= */

async function startGmailWatch() {
  try {
    const gmail = await getGmailClient();

    const response = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName: TOPIC_NAME,
        labelIds: ["INBOX", "SENT"],
      },
    });

    currentHistoryId = response.data.historyId || null;
    watchExpiration = response.data.expiration || null;

    console.log("Gmail Watch started successfully.");
    console.log("History ID:", currentHistoryId);
    console.log("Expiration:", watchExpiration);
  } catch (error) {
    console.error(
      "Gmail Watch error:",
      error.response?.data || error.message
    );
  }
}

/* =========================
   PUB/SUB LISTENER
========================= */

async function handlePubSubMessage(message) {
  try {
    const rawData = message.data
      ? Buffer.from(message.data, "base64").toString("utf8")
      : "{}";

    const notification = JSON.parse(rawData);

    console.log("Gmail Pub/Sub notification received.");
    console.log(notification);

    const newHistoryId = notification.historyId;

    if (newHistoryId) {
      currentHistoryId = newHistoryId;
    }

    /*
      Gmail has notified us that the mailbox changed.
      Tell every connected React client to refresh its data.
    */
    broadcastMailboxUpdate({
      historyId: newHistoryId || null,
    });

    message.ack();
  } catch (error) {
    console.error("Pub/Sub message error:", error);
    message.ack();
  }
}

function startPubSubListener() {
  subscription.on("message", handlePubSubMessage);

  subscription.on("error", (error) => {
    console.error("Pub/Sub subscription error:", error.message);
  });

  console.log(
    `Listening to Pub/Sub subscription: ${SUBSCRIPTION_ID}`
  );
}

/* =========================
   BASIC ROUTES
========================= */

app.get("/", (req, res) => {
  res.json({
    message: "AI Powered Mail App Backend",
    status: "running",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    gmailWatch: Boolean(currentHistoryId),
    realtimeClients: sseClients.size,
  });
});

/* =========================
   GOOGLE AUTH
========================= */

app.get("/auth/google", (req, res) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GMAIL_SCOPE],
  });

  res.redirect(authUrl);
});

app.get("/oauth2callback", async (req, res) => {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(req.query.code);

    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

    await startGmailWatch();

    res.send(`
      <h1>Gmail Connected Successfully</h1>
      <p>You can close this window and return to the application.</p>
    `);
  } catch (error) {
    console.error(error);
    res.status(500).send("Google authentication failed.");
  }
});

/* =========================
   GMAIL PROFILE
========================= */

app.get("/api/gmail/profile", async (req, res) => {
  try {
    const gmail = await getGmailClient();

    const response = await gmail.users.getProfile({
      userId: "me",
    });

    res.json({
      connected: true,
      emailAddress: response.data.emailAddress,
      messagesTotal: response.data.messagesTotal,
      threadsTotal: response.data.threadsTotal,
    });
  } catch (error) {
    res.status(500).json({
      connected: false,
      error: error.message,
    });
  }
});

/* =========================
   INBOX
========================= */

app.get("/api/gmail/messages", async (req, res) => {
  try {
    const gmail = await getGmailClient();

    const maxResults = Number(req.query.maxResults) || 50;
    const q = req.query.q || "";

    const response = await gmail.users.messages.list({
      userId: "me",
      labelIds: ["INBOX"],
      maxResults,
      q,
    });

    const messages = response.data.messages || [];

    const detailedMessages = await Promise.all(
      messages.map(async (message) => {
        const detail = await gmail.users.messages.get({
          userId: "me",
          id: message.id,
          format: "metadata",
          metadataHeaders: [
            "From",
            "To",
            "Subject",
            "Date",
            "Message-ID",
            "References",
          ],
        });

        const payload = detail.data.payload;

        const labels = detail.data.labelIds || [];

        return {
          id: detail.data.id,
          threadId: detail.data.threadId,
          from: getHeader(payload.headers, "From"),
          to: getHeader(payload.headers, "To"),
          subject: getHeader(payload.headers, "Subject"),
          date: getHeader(payload.headers, "Date"),
          snippet: detail.data.snippet || "",
          unread: labels.includes("UNREAD"),
        };
      })
    );

    res.json(messages.length ? detailedMessages : []);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: error.message,
    });
  }
});

/* =========================
   EMAIL DETAIL
========================= */

app.get("/api/gmail/messages/:id", async (req, res) => {
  try {
    const gmail = await getGmailClient();

    const response = await gmail.users.messages.get({
      userId: "me",
      id: req.params.id,
      format: "full",
    });

    const payload = response.data.payload;
    const headers = payload.headers || [];

    res.json({
      id: response.data.id,
      threadId: response.data.threadId,
      from: getHeader(headers, "From"),
      to: getHeader(headers, "To"),
      subject: getHeader(headers, "Subject"),
      date: getHeader(headers, "Date"),
      body: extractEmailBody(payload),
      snippet: response.data.snippet || "",
      unread: (response.data.labelIds || []).includes("UNREAD"),
      messageId: getHeader(headers, "Message-ID"),
      references: getHeader(headers, "References"),
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/* =========================
   READ / UNREAD
========================= */

app.patch("/api/gmail/messages/:id/read", async (req, res) => {
  try {
    const gmail = await getGmailClient();

    await gmail.users.messages.modify({
      userId: "me",
      id: req.params.id,
      requestBody: {
        removeLabelIds: ["UNREAD"],
      },
    });

    broadcastMailboxUpdate();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

app.patch("/api/gmail/messages/:id/unread", async (req, res) => {
  try {
    const gmail = await getGmailClient();

    await gmail.users.messages.modify({
      userId: "me",
      id: req.params.id,
      requestBody: {
        addLabelIds: ["UNREAD"],
      },
    });

    broadcastMailboxUpdate();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/* =========================
   TRASH
========================= */

app.delete("/api/gmail/messages/:id", async (req, res) => {
  try {
    const gmail = await getGmailClient();

    await gmail.users.messages.trash({
      userId: "me",
      id: req.params.id,
    });

    broadcastMailboxUpdate();

    res.json({
      success: true,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/* =========================
   SENT
========================= */

app.get("/api/gmail/sent", async (req, res) => {
  try {
    const gmail = await getGmailClient();

    const response = await gmail.users.messages.list({
      userId: "me",
      labelIds: ["SENT"],
      maxResults: 50,
    });

    const messages = response.data.messages || [];

    const detailedMessages = await Promise.all(
      messages.map(async (message) => {
        const detail = await gmail.users.messages.get({
          userId: "me",
          id: message.id,
          format: "metadata",
          metadataHeaders: [
            "From",
            "To",
            "Subject",
            "Date",
            "Message-ID",
            "References",
          ],
        });

        const payload = detail.data.payload;

        return {
          id: detail.data.id,
          threadId: detail.data.threadId,
          from: getHeader(payload.headers, "From"),
          to: getHeader(payload.headers, "To"),
          subject: getHeader(payload.headers, "Subject"),
          date: getHeader(payload.headers, "Date"),
          snippet: detail.data.snippet || "",
          unread: false,
        };
      })
    );

    res.json(messages.length ? detailedMessages : []);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/* =========================
   SEND EMAIL
========================= */

app.post("/api/gmail/send", async (req, res) => {
  try {
    const gmail = await getGmailClient();

    const {
      to,
      subject,
      body,
      threadId,
      inReplyTo,
      references,
    } = req.body;

    if (!to || !body) {
      return res.status(400).json({
        error: "Recipient and body are required.",
      });
    }

    let rawMessage = "";

    rawMessage += `To: ${to}\r\n`;
    rawMessage += `Subject: ${subject || ""}\r\n`;

    if (inReplyTo) {
      rawMessage += `In-Reply-To: ${inReplyTo}\r\n`;
    }

    if (references) {
      rawMessage += `References: ${references}\r\n`;
    }

    rawMessage += `Content-Type: text/plain; charset="UTF-8"\r\n`;
    rawMessage += `\r\n`;
    rawMessage += body;

    const encodedMessage = Buffer.from(rawMessage)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const requestBody = {
      raw: encodedMessage,
    };

    if (threadId) {
      requestBody.threadId = threadId;
    }

    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody,
    });

    broadcastMailboxUpdate();

    res.json({
      success: true,
      id: response.data.id,
      threadId: response.data.threadId,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: error.message,
    });
  }
});

/* =========================
   AI SMART REPLY
========================= */

app.post("/api/ai/reply", async (req, res) => {
  try {
    const {
      from,
      subject,
      body,
      instruction = "Write a professional reply.",
    } = req.body;

    const prompt = `
You are an AI email assistant inside a Gmail web application.

Generate a professional reply to the email below.

Email sender:
${from}

Email subject:
${subject}

Original email:
${body}

User instruction:
${instruction}

Requirements:
- Reply directly to the original email.
- Be concise and natural.
- Do not invent facts.
- Do not mention AI.
- Do not include a subject line.
- Return ONLY the email body.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
    });

    res.json({
      reply: response.text.trim(),
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: error.message,
    });
  }
});

/* =========================
   AI COMMAND
========================= */

app.post("/api/ai/command", async (req, res) => {
  try {
    const { command } = req.body;

    if (!command) {
      return res.status(400).json({
        error: "Command is required.",
      });
    }

    const prompt = `
You are an AI command parser inside a Gmail web application.

Convert the user's natural-language command into JSON.

Allowed actions:
- show_inbox
- show_sent
- show_unread
- search
- compose
- open_email
- clear
- unknown

Return ONLY valid JSON using exactly this structure:

{
  "action": "",
  "query": "",
  "recipient": "",
  "subject": "",
  "body": "",
  "message": ""
}

Rules:

show_inbox:
action = "show_inbox"

show_sent:
action = "show_sent"

show_unread:
action = "show_unread"
query should normally be:
"is:unread"

search:
Create a Gmail search query.
Examples:
"show unread emails from GitHub"
=> query: "from:github.com is:unread"

"emails from John"
=> query: "from:John"

compose:
Extract recipient, subject and body.

open_email:
Extract the important email subject/sender/keyword into query or message.

User command:
${command}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const result = JSON.parse(response.text);

    res.json(result);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: error.message,
    });
  }
});

/* =========================
   ERROR HANDLING
========================= */

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
  });
});
/* =========================
   START SERVER
========================= */

app.listen(PORT, async () => {
  console.log(`Backend running at http://localhost:${PORT}`);

  startPubSubListener();

  if (fs.existsSync(TOKEN_PATH)) {
    await startGmailWatch();
  } else {
    console.log("Gmail not connected yet.");
  }
});
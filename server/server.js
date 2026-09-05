require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

/*
  Gmail permissions

  gmail.modify allows the application to:
  - read emails
  - search emails
  - modify email state
  - send emails
*/
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
];

const TOKEN_PATH = path.join(__dirname, "token.json");

/*
  Google OAuth client
*/
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

/*
  Home route
*/
app.get("/", (req, res) => {
  res.send("AI Powered Mail App backend is running.");
});

/*
  Start Google OAuth
*/
app.get("/auth/google", (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  res.redirect(authUrl);
});

/*
  Google OAuth callback
*/
app.get("/oauth2callback", async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).send(
        "Authorization code is missing."
      );
    }

    const { tokens } = await oauth2Client.getToken(code);

    oauth2Client.setCredentials(tokens);

    fs.writeFileSync(
      TOKEN_PATH,
      JSON.stringify(tokens, null, 2)
    );

    res.send(`
      <html>
        <head>
          <title>Gmail Connected</title>
        </head>
        <body style="
          font-family: Arial;
          padding: 40px;
          text-align: center;
        ">
          <h2>Gmail connected successfully! ✅</h2>
          <p>
            You can close this browser tab and
            return to the AI Powered Mail App.
          </p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("OAuth error:", error);

    res.status(500).send(
      "Gmail authorization failed."
    );
  }
});

/*
  Get authenticated Gmail client
*/
function getGmailClient() {
  if (!fs.existsSync(TOKEN_PATH)) {
    return null;
  }

  const tokens = JSON.parse(
    fs.readFileSync(TOKEN_PATH, "utf8")
  );

  oauth2Client.setCredentials(tokens);

  return google.gmail({
    version: "v1",
    auth: oauth2Client,
  });
}

/*
  Check Gmail connection/profile
*/
app.get("/api/gmail/profile", async (req, res) => {
  try {
    const gmail = getGmailClient();

    if (!gmail) {
      return res.status(401).json({
        connected: false,
        message: "Gmail is not connected yet.",
      });
    }

    const profile =
      await gmail.users.getProfile({
        userId: "me",
      });

    res.json({
      connected: true,
      email: profile.data.emailAddress,
      messagesTotal: profile.data.messagesTotal,
      threadsTotal: profile.data.threadsTotal,
    });
  } catch (error) {
    console.error(
      "Gmail profile error:",
      error
    );

    res.status(500).json({
      connected: false,
      message: "Unable to access Gmail.",
      error: error.message,
    });
  }
});

/*
  Get Gmail inbox messages
*/
app.get("/api/gmail/messages", async (req, res) => {
  try {
    const gmail = getGmailClient();

    if (!gmail) {
      return res.status(401).json({
        connected: false,
        message: "Gmail is not connected yet.",
      });
    }

    const response =
      await gmail.users.messages.list({
        userId: "me",
        labelIds: ["INBOX"],
        maxResults: 20,
      });

    const messageList =
      response.data.messages || [];

    const messages = await Promise.all(
      messageList.map(async (message) => {
        const detail =
          await gmail.users.messages.get({
            userId: "me",
            id: message.id,
            format: "metadata",
            metadataHeaders: [
              "From",
              "To",
              "Subject",
              "Date",
            ],
          });

        const headers =
          detail.data.payload?.headers || [];

        const getHeader = (name) => {
          const header = headers.find(
            (h) =>
              h.name.toLowerCase() ===
              name.toLowerCase()
          );

          return header
            ? header.value
            : "";
        };

        return {
          id: detail.data.id,

          threadId:
            detail.data.threadId,

          from: getHeader("From"),

          to: getHeader("To"),

          subject:
            getHeader("Subject"),

          date:
            getHeader("Date"),

          snippet:
            detail.data.snippet || "",

          unread:
            (
              detail.data.labelIds || []
            ).includes("UNREAD"),
        };
      })
    );

    res.json({
      connected: true,
      count: messages.length,
      messages,
    });
  } catch (error) {
    console.error(
      "Gmail messages error:",
      error
    );

    res.status(500).json({
      connected: false,
      message:
        "Unable to fetch Gmail messages.",
      error: error.message,
    });
  }
});

/*
  Send Gmail email
*/
app.post("/api/gmail/send", async (req, res) => {
  try {
    const {
      to,
      subject,
      body,
    } = req.body;

    /*
      Validate input
    */
    if (!to || !subject || !body) {
      return res.status(400).json({
        success: false,
        message:
          "To, subject and body are required.",
      });
    }

    /*
      Get Gmail client
    */
    const gmail = getGmailClient();

    if (!gmail) {
      return res.status(401).json({
        success: false,
        message:
          "Gmail is not connected.",
      });
    }

    /*
      Create email
    */
    const emailLines = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      body,
    ];

    const rawMessage =
      emailLines.join("\r\n");

    /*
      Gmail requires Base64URL encoding
    */
    const encodedMessage =
      Buffer.from(rawMessage)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

    /*
      Send through Gmail API
    */
    const response =
      await gmail.users.messages.send({
        userId: "me",

        requestBody: {
          raw: encodedMessage,
        },
      });

    res.json({
      success: true,
      message:
        "Email sent successfully.",

      messageId:
        response.data.id,

      threadId:
        response.data.threadId,
    });
  } catch (error) {
    console.error(
      "Gmail send error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Unable to send email.",
      error: error.message,
    });
  }
});

/*
  Start backend server
*/
app.listen(PORT, () => {
  console.log(
    `Backend server running at http://localhost:${PORT}`
  );
});
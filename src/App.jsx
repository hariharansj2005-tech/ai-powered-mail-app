import { useEffect, useRef, useState } from "react";

const API_URL = "http://localhost:5000";

function App() {
  // ---------------------------------------
  // State
  // ---------------------------------------

  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);

  const [currentFolder, setCurrentFolder] = useState("inbox");
  const [viewFilter, setViewFilter] = useState("all");

  const [showCompose, setShowCompose] = useState(false);

  const [composeData, setComposeData] = useState({
    to: "",
    subject: "",
    body: "",
    threadId: "",
    inReplyTo: "",
    references: "",
  });

  const [userCommand, setUserCommand] = useState("");
  const [aiMessage, setAiMessage] = useState("");

  const [loading, setLoading] = useState(false);
  const [openingEmail, setOpeningEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const [error, setError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  const skipNextFolderLoad = useRef(false);

  // ---------------------------------------
  // API helper
  // ---------------------------------------

  async function parseResponse(response) {
    const text = await response.text();

    let data = {};

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(
        text || `Server returned HTTP ${response.status}`
      );
    }

    if (!response.ok) {
      throw new Error(
        data.error || `Request failed with HTTP ${response.status}`
      );
    }

    return data;
  }

  // ---------------------------------------
  // Support both API response formats
  // ---------------------------------------

  function getMessageList(data) {
    if (Array.isArray(data)) {
      return data;
    }

    if (Array.isArray(data?.messages)) {
      return data.messages;
    }

    return [];
  }

  // ---------------------------------------
  // Load Inbox
  // ---------------------------------------

  async function loadEmails(query = "") {
    try {
      setLoading(true);
      setError("");

      const url = query
        ? `${API_URL}/api/gmail/messages?q=${encodeURIComponent(query)}`
        : `${API_URL}/api/gmail/messages`;

      const response = await fetch(url);
      const data = await parseResponse(response);

      const messageList = getMessageList(data);

      console.log("Inbox emails received:", messageList);

      setEmails(messageList);

      return messageList;
    } catch (err) {
      console.error("Inbox error:", err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------
  // Load Sent
  // ---------------------------------------

  async function loadSentEmails() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`${API_URL}/api/gmail/sent`);
      const data = await parseResponse(response);

      const messageList = getMessageList(data);

      console.log("Sent emails received:", messageList);

      setEmails(messageList);

      return messageList;
    } catch (err) {
      console.error("Sent error:", err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------
  // Folder Load
  // ---------------------------------------

  useEffect(() => {
    if (skipNextFolderLoad.current) {
      skipNextFolderLoad.current = false;
      return;
    }

    setSelectedEmail(null);
    setViewFilter("all");
    setSearchText("");

    if (currentFolder === "inbox") {
      loadEmails();
    } else if (currentFolder === "sent") {
      loadSentEmails();
    }
  }, [currentFolder]);

  // ---------------------------------------
  // REAL-TIME GMAIL → PUB/SUB → REACT
  // ---------------------------------------

  useEffect(() => {
    const eventSource = new EventSource(
      `${API_URL}/api/events`
    );

    eventSource.onopen = () => {
      console.log("Real-time connection established.");
      setRealtimeConnected(true);
    };

    eventSource.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        console.log("Real-time event:", data);

        if (data.type === "connected") {
          setRealtimeConnected(true);
          return;
        }

        if (data.type === "mailbox_updated") {
          console.log(
            "Mailbox changed. Refreshing current folder..."
          );

          if (currentFolder === "inbox") {
            if (!selectedEmail && !showCompose) {
              await loadEmails();
              setAiMessage(
                "Inbox updated automatically from Gmail."
              );
            }
          } else if (currentFolder === "sent") {
            if (!selectedEmail && !showCompose) {
              await loadSentEmails();
            }
          }
        }
      } catch (err) {
        console.error(
          "Real-time event error:",
          err
        );
      }
    };

    eventSource.onerror = () => {
      console.warn(
        "Real-time connection interrupted."
      );

      setRealtimeConnected(false);
    };

    return () => {
      eventSource.close();
      setRealtimeConnected(false);
    };
  }, [
    currentFolder,
    selectedEmail,
    showCompose,
  ]);

  // ---------------------------------------
  // Fallback Inbox Refresh
  // ---------------------------------------

  useEffect(() => {
    if (currentFolder !== "inbox") {
      return;
    }

    const interval = setInterval(() => {
      if (
        !selectedEmail &&
        !showCompose
      ) {
        loadEmails();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [
    currentFolder,
    selectedEmail,
    showCompose,
  ]);

  // ---------------------------------------
  // Compose
  // ---------------------------------------

  function openBlankCompose() {
    setError("");

    setComposeData({
      to: "",
      subject: "",
      body: "",
      threadId: "",
      inReplyTo: "",
      references: "",
    });

    setShowCompose(true);
  }

  // ---------------------------------------
  // Extract email address
  // ---------------------------------------

  function extractEmailAddress(value) {
    if (!value) {
      return "";
    }

    const match = value.match(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
    );

    return match ? match[0] : value.trim();
  }

  // ---------------------------------------
  // Open Email
  // ---------------------------------------

  async function openEmail(email) {
    if (!email?.id) {
      return;
    }

    try {
      setOpeningEmail(true);
      setError("");

      const response = await fetch(
        `${API_URL}/api/gmail/messages/${email.id}`
      );

      const data = await parseResponse(response);

      setSelectedEmail(data);

      if (email.unread) {
        try {
          const readResponse = await fetch(
            `${API_URL}/api/gmail/messages/${email.id}/read`,
            {
              method: "PATCH",
            }
          );

          if (readResponse.ok) {
            setEmails((previous) =>
              previous.map((item) =>
                item.id === email.id
                  ? { ...item, unread: false }
                  : item
              )
            );
          }
        } catch (readError) {
          console.error(
            "Read update error:",
            readError
          );
        }
      }
    } catch (err) {
      console.error(
        "Open email error:",
        err
      );

      setError(err.message);
    } finally {
      setOpeningEmail(false);
    }
  }

  // ---------------------------------------
  // Close Email
  // ---------------------------------------

  function closeEmail() {
    setSelectedEmail(null);
  }

  // ---------------------------------------
  // Smart Reply
  // ---------------------------------------

  async function replyToEmail(email) {
    try {
      setError("");

      setAiMessage(
        "Gemini is reading the email and drafting a reply..."
      );

      setSending(true);

      const response = await fetch(
        `${API_URL}/api/ai/reply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: email.from,
            subject: email.subject,
            body:
              email.body ||
              email.snippet ||
              "",
            instruction:
              "Write a professional, natural and concise reply to this email.",
          }),
        }
      );

      const data = await parseResponse(response);

      if (!data.reply) {
        throw new Error(
          "Gemini returned an empty reply."
        );
      }

      const recipient =
        extractEmailAddress(email.from);

      let replySubject =
        email.subject || "";

      if (
        !replySubject
          .toLowerCase()
          .startsWith("re:")
      ) {
        replySubject =
          `Re: ${replySubject}`;
      }

      setComposeData({
        to: recipient,
        subject: replySubject,
        body: data.reply,
        threadId:
          email.threadId || "",
        inReplyTo:
          email.messageId || "",
        references:
          email.references || "",
      });

      setShowCompose(true);

      setAiMessage(
        "Gemini generated a context-aware reply. Review it before sending."
      );
    } catch (err) {
      console.error(
        "AI reply error:",
        err
      );

      setError(err.message);
      setAiMessage("");
    } finally {
      setSending(false);
    }
  }

  // ---------------------------------------
  // Forward Email
  // ---------------------------------------

  function forwardEmail(email) {
    if (!email) {
      return;
    }

    const forwardSubject =
      email.subject
        ? email.subject
            .toLowerCase()
            .startsWith("fwd:")
          ? email.subject
          : `Fwd: ${email.subject}`
        : "Fwd: No subject";

    const originalMessage = `
---------- Forwarded message ----------
From: ${email.from || ""}
Date: ${email.date || ""}
Subject: ${email.subject || "No subject"}
To: ${email.to || ""}

${email.body || email.snippet || ""}

---------- End forwarded message ----------
`;

    setComposeData({
      to: "",
      subject: forwardSubject,
      body: `\n\n${originalMessage}`,
      threadId: "",
      inReplyTo: "",
      references: "",
    });

    setShowCompose(true);

    setAiMessage(
      "Forward window opened. Enter the recipient and review the message before sending."
    );
  }

  // ---------------------------------------
  // Send Email
  // ---------------------------------------

  async function sendEmail() {
    try {
      setError("");

      if (!composeData.to.trim()) {
        setError(
          "Please enter a recipient email address."
        );
        return;
      }

      if (!composeData.body.trim()) {
        setError(
          "Please enter an email message."
        );
        return;
      }

      const confirmed =
        window.confirm(
          `Are you sure you want to send this email?\n\n` +
            `To: ${composeData.to}\n` +
            `Subject: ${
              composeData.subject ||
              "(No subject)"
            }`
        );

      if (!confirmed) {
        return;
      }

      setSending(true);

      const response = await fetch(
        `${API_URL}/api/gmail/send`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            to: composeData.to,
            subject:
              composeData.subject,
            body: composeData.body,
            threadId:
              composeData.threadId,
            inReplyTo:
              composeData.inReplyTo,
            references:
              composeData.references,
          }),
        }
      );

      const data =
        await parseResponse(response);

      console.log(
        "Email sent:",
        data
      );

      setShowCompose(false);

      setComposeData({
        to: "",
        subject: "",
        body: "",
        threadId: "",
        inReplyTo: "",
        references: "",
      });

      setAiMessage(
        "Email sent successfully."
      );

      if (currentFolder === "sent") {
        await loadSentEmails();
      }
    } catch (err) {
      console.error(
        "Send error:",
        err
      );

      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  // ---------------------------------------
  // Delete / Trash
  // ---------------------------------------

  async function deleteEmail(email) {
    if (!email?.id) {
      return;
    }

    const confirmed =
      window.confirm(
        "Move this email to Trash?"
      );

    if (!confirmed) {
      return;
    }

    try {
      setError("");

      const response =
        await fetch(
          `${API_URL}/api/gmail/messages/${email.id}`,
          {
            method: "DELETE",
          }
        );

      await parseResponse(response);

      setEmails((previous) =>
        previous.filter(
          (item) =>
            item.id !== email.id
        )
      );

      setSelectedEmail(null);

      setAiMessage(
        "Email moved to Trash."
      );
    } catch (err) {
      console.error(
        "Delete error:",
        err
      );

      setError(err.message);
    }
  }

  // ---------------------------------------
  // AI Command
  // ---------------------------------------

  async function handleAICommand(
    commandOverride = null
  ) {
    const command =
      commandOverride !== null
        ? commandOverride
        : userCommand;

    if (!command.trim()) {
      return;
    }

    try {
      setAiLoading(true);
      setError("");

      setAiMessage(
        "Gemini is processing your request..."
      );

      const response =
        await fetch(
          `${API_URL}/api/ai/command`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              command,
            }),
          }
        );

      const data =
        await parseResponse(response);

      console.log(
        "AI command:",
        data
      );

      const action =
        data.action;

      if (action === "show_inbox") {
        skipNextFolderLoad.current =
          true;

        setCurrentFolder("inbox");
        setSelectedEmail(null);
        setViewFilter("all");
        setSearchText("");

        const results =
          await loadEmails();

        setAiMessage(
          `Inbox opened. ${results.length} emails loaded.`
        );
      } else if (
        action === "show_sent"
      ) {
        skipNextFolderLoad.current =
          true;

        setCurrentFolder("sent");
        setSelectedEmail(null);
        setViewFilter("all");
        setSearchText("");

        const results =
          await loadSentEmails();

        setAiMessage(
          `Sent folder opened. ${results.length} emails loaded.`
        );
      } else if (
        action === "show_unread"
      ) {
        skipNextFolderLoad.current =
          true;

        setCurrentFolder("inbox");
        setSelectedEmail(null);
        setViewFilter("unread");
        setSearchText("");

        const results =
          await loadEmails(
            "is:unread"
          );

        setAiMessage(
          `Found ${results.length} unread emails.`
        );
      } else if (
        action === "search"
      ) {
        skipNextFolderLoad.current =
          true;

        setCurrentFolder("inbox");
        setSelectedEmail(null);
        setViewFilter("all");
        setSearchText("");

        const query =
          data.query ||
          command;

        const results =
          await loadEmails(query);

        setAiMessage(
          `Found ${results.length} matching emails.`
        );
      } else if (
        action === "compose"
      ) {
        setComposeData({
          to:
            data.recipient ||
            "",
          subject:
            data.subject ||
            "",
          body:
            data.body ||
            "",
          threadId: "",
          inReplyTo: "",
          references: "",
        });

        setShowCompose(true);

        if (data.recipient) {
          setAiMessage(
            `Compose window opened for ${data.recipient}.`
          );
        } else {
          setAiMessage(
            "Compose window opened. Tell me the recipient, subject and message if you want me to fill it."
          );
        }
      } else if (
        action === "open_email"
      ) {
        let targetEmail = null;

        const subject =
          data.subject
            ?.toLowerCase() ||
          "";

        const message =
          data.message
            ?.toLowerCase() ||
          "";

        const query =
          data.query || "";

        targetEmail =
          emails.find((email) => {
            const emailSubject =
              email.subject
                ?.toLowerCase() ||
              "";

            const from =
              email.from
                ?.toLowerCase() ||
              "";

            const snippet =
              email.snippet
                ?.toLowerCase() ||
              "";

            if (
              subject &&
              emailSubject.includes(
                subject
              )
            ) {
              return true;
            }

            if (
              subject &&
              subject.includes(
                emailSubject
              )
            ) {
              return true;
            }

            if (
              message &&
              emailSubject.includes(
                message
              )
            ) {
              return true;
            }

            if (
              query &&
              (
                emailSubject.includes(
                  query.toLowerCase()
                ) ||
                from.includes(
                  query.toLowerCase()
                ) ||
                snippet.includes(
                  query.toLowerCase()
                )
              )
            ) {
              return true;
            }

            return false;
          });

        if (!targetEmail) {
          let gmailQuery =
            data.query || "";

          if (
            !gmailQuery &&
            data.subject
          ) {
            gmailQuery =
              `subject:"${data.subject}"`;
          }

          if (!gmailQuery) {
            gmailQuery =
              command;
          }

          const results =
            await loadEmails(
              gmailQuery
            );

          if (results.length > 0) {
            targetEmail =
              results[0];
          }
        }

        if (!targetEmail) {
          throw new Error(
            "I could not find the requested email."
          );
        }

        await openEmail(
          targetEmail
        );

        setAiMessage(
          `Opened email: ${
            targetEmail.subject ||
            "No subject"
          }`
        );
      } else if (
        action === "clear"
      ) {
        skipNextFolderLoad.current =
          true;

        setCurrentFolder("inbox");
        setSelectedEmail(null);
        setViewFilter("all");
        setSearchText("");

        const results =
          await loadEmails();

        setAiMessage(
          `Inbox cleared. Showing ${results.length} emails.`
        );
      } else {
        setAiMessage(
          data.message ||
            "I could not understand that command. Try something like: show my unread emails from GitHub."
        );
      }

      setUserCommand("");
    } catch (err) {
      console.error(
        "AI command error:",
        err
      );

      setError(err.message);
      setAiMessage("");
    } finally {
      setAiLoading(false);
    }
  }

  // ---------------------------------------
  // Quick AI command helper
  // ---------------------------------------

  function handleAICommandWithText(text) {
    setUserCommand(text);
    handleAICommand(text);
  }

  // ---------------------------------------
  // Search
  // ---------------------------------------
  const filteredEmails =
    emails.filter((email) => {
      if (
        viewFilter === "unread" &&
        !email.unread
      ) {
        return false;
      }

      if (!searchText.trim()) {
        return true;
      }

      const search =
        searchText.toLowerCase();

      return (
        email.subject
          ?.toLowerCase()
          .includes(search) ||
        email.from
          ?.toLowerCase()
          .includes(search) ||
        email.snippet
          ?.toLowerCase()
          .includes(search)
      );
    });

  // ---------------------------------------
  // Render
  // ---------------------------------------

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f7fb",
        fontFamily:
          "Arial, Helvetica, sans-serif",
        color: "#1f2937",
      }}
    >
      {/* Header */}

      <header
        style={{
          height: "70px",
          background: "#ffffff",
          borderBottom:
            "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          justifyContent:
            "space-between",
          padding: "0 28px",
          boxSizing: "border-box",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "24px",
              fontWeight: "700",
            }}
          >
            AI Powered Mail
          </div>

          <div
            style={{
              fontSize: "13px",
              color: "#6b7280",
              marginTop: "3px",
            }}
          >
            Gmail + Gemini AI
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              fontSize: "12px",
              color: realtimeConnected
                ? "#15803d"
                : "#9ca3af",
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <span>
              ●
            </span>
            {realtimeConnected
              ? "Real-time connected"
              : "Real-time disconnected"}
          </div>

          <button
            onClick={() => {
              setSelectedEmail(null);
              setShowCompose(false);

              if (
                currentFolder ===
                "inbox"
              ) {
                loadEmails();
              } else {
                loadSentEmails();
              }
            }}
            style={{
              border:
                "1px solid #d1d5db",
              background: "#ffffff",
              borderRadius: "8px",
              padding:
                "9px 15px",
              cursor: "pointer",
            }}
          >
            ↻ Refresh
          </button>
        </div>
      </header>

      {/* Main Layout */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "220px minmax(0, 1fr) 320px",
          minHeight:
            "calc(100vh - 70px)",
        }}
      >
        {/* Sidebar */}

        <aside
          style={{
            background: "#ffffff",
            borderRight:
              "1px solid #e5e7eb",
            padding:
              "24px 15px",
          }}
        >
          <button
            onClick={
              openBlankCompose
            }
            style={{
              width: "100%",
              background:
                "#2563eb",
              color:
                "#ffffff",
              border: "none",
              borderRadius:
                "9px",
              padding: "13px",
              fontWeight:
                "700",
              cursor:
                "pointer",
              marginBottom:
                "22px",
            }}
          >
            + Compose
          </button>

          <button
            onClick={() => {
              setCurrentFolder(
                "inbox"
              );
              setViewFilter(
                "all"
              );
            }}
            style={{
              width: "100%",
              textAlign:
                "left",
              padding:
                "12px",
              border: "none",
              borderRadius:
                "8px",
              background:
                currentFolder ===
                  "inbox" &&
                viewFilter ===
                  "all"
                  ? "#eef2ff"
                  : "transparent",
              cursor:
                "pointer",
              marginBottom:
                "5px",
            }}
          >
            📥 Inbox
          </button>

          <button
            onClick={() => {
              setCurrentFolder(
                "sent"
              );
              setViewFilter(
                "all"
              );
            }}
            style={{
              width: "100%",
              textAlign:
                "left",
              padding:
                "12px",
              border: "none",
              borderRadius:
                "8px",
              background:
                currentFolder ===
                "sent"
                  ? "#eef2ff"
                  : "transparent",
              cursor:
                "pointer",
              marginBottom:
                "5px",
            }}
          >
            📤 Sent
          </button>

          <button
            onClick={async () => {
              setCurrentFolder(
                "inbox"
              );
              setViewFilter(
                "unread"
              );
              setSelectedEmail(
                null
              );

              skipNextFolderLoad.current =
                true;

              await loadEmails(
                "is:unread"
              );
            }}
            style={{
              width: "100%",
              textAlign:
                "left",
              padding:
                "12px",
              border: "none",
              borderRadius:
                "8px",
              background:
                viewFilter ===
                "unread"
                  ? "#eef2ff"
                  : "transparent",
              cursor:
                "pointer",
              marginBottom:
                "5px",
            }}
          >
            📩 Unread
          </button>

          <button
            disabled
            style={{
              width: "100%",
              textAlign:
                "left",
              padding:
                "12px",
              border: "none",
              background:
                "transparent",
              color:
                "#9ca3af",
              cursor:
                "not-allowed",
              marginBottom:
                "5px",
            }}
          >
            ⭐ Starred
          </button>

          <button
            disabled
            style={{
              width: "100%",
              textAlign:
                "left",
              padding:
                "12px",
              border: "none",
              background:
                "transparent",
              color:
                "#9ca3af",
              cursor:
                "not-allowed",
            }}
          >
            🗑️ Trash
          </button>
        </aside>

        {/* Email List / Detail */}

        <main
          style={{
            padding: "20px",
            overflow:
              "auto",
          }}
        >
          {selectedEmail ? (
            <div
              style={{
                background:
                  "#ffffff",
                borderRadius:
                  "12px",
                padding:
                  "28px",
                minHeight:
                  "600px",
                boxSizing:
                  "border-box",
              }}
            >
              <button
                onClick={
                  closeEmail
                }
                style={{
                  border:
                    "none",
                  background:
                    "transparent",
                  cursor:
                    "pointer",
                  marginBottom:
                    "20px",
                }}
              >
                ← Back
              </button>

              <h1
                style={{
                  fontSize:
                    "25px",
                  marginBottom:
                    "10px",
                }}
              >
                {selectedEmail.subject ||
                  "No subject"}
              </h1>

              <div
                style={{
                  color:
                    "#6b7280",
                  marginBottom:
                    "20px",
                }}
              >
                <div>
                  <strong>
                    From:
                  </strong>{" "}
                  {selectedEmail.from ||
                    ""}
                </div>

                <div>
                  <strong>
                    To:
                  </strong>{" "}
                  {selectedEmail.to ||
                    ""}
                </div>

                <div>
                  <strong>
                    Date:
                  </strong>{" "}
                  {selectedEmail.date ||
                    ""}
                </div>
              </div>

              <div
                style={{
                  whiteSpace:
                    "pre-wrap",
                  lineHeight:
                    "1.7",
                  minHeight:
                    "300px",
                  padding:
                    "20px 0",
                }}
              >
                {selectedEmail.body ||
                  selectedEmail.snippet ||
                  "No message content."}
              </div>

              <div
                style={{
                  display:
                    "flex",
                  gap: "10px",
                  flexWrap:
                    "wrap",
                  borderTop:
                    "1px solid #e5e7eb",
                  paddingTop:
                    "20px",
                }}
              >
                <button
                  onClick={() =>
                    replyToEmail(
                      selectedEmail
                    )
                  }
                  disabled={
                    sending
                  }
                  style={{
                    background:
                      "#7c3aed",
                    color:
                      "#ffffff",
                    border:
                      "none",
                    borderRadius:
                      "8px",
                    padding:
                      "10px 18px",
                    cursor:
                      "pointer",
                  }}
                >
                  ✨ Smart Reply
                </button>

                <button
                  onClick={() =>
                    forwardEmail(
                      selectedEmail
                    )
                  }
                  style={{
                    background:
                      "#2563eb",
                    color:
                      "#ffffff",
                    border:
                      "none",
                    borderRadius:
                      "8px",
                    padding:
                      "10px 18px",
                    cursor:
                      "pointer",
                  }}
                >
                  ↗ Forward
                </button>

                <button
                  onClick={() =>
                    deleteEmail(
                      selectedEmail
                    )
                  }
                  style={{
                    background:
                      "#ffffff",
                    color:
                      "#dc2626",
                    border:
                      "1px solid #fecaca",
                    borderRadius:
                      "8px",
                    padding:
                      "10px 18px",
                    cursor:
                      "pointer",
                  }}
                >
                  🗑️ Trash
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                background:
                  "#ffffff",
                borderRadius:
                  "12px",
                overflow:
                  "hidden",
              }}
            >
              <div
                style={{
                  padding:
                    "20px",
                  borderBottom:
                    "1px solid #e5e7eb",
                }}
              >
                <h2
                  style={{
                    margin:
                      "0 0 14px 0",
                  }}
                >
                  {currentFolder ===
                  "sent"
                    ? "Sent"
                    : viewFilter ===
                      "unread"
                    ? "Unread"
                    : "Inbox"}
                </h2>

                <input
                  value={
                    searchText
                  }
                  onChange={(
                    event
                  ) =>
                    setSearchText(
                      event
                        .target
                        .value
                    )
                  }
                  placeholder="Search emails..."
                  style={{
                    width:
                      "100%",
                    boxSizing:
                      "border-box",
                    padding:
                      "11px 13px",
                    border:
                      "1px solid #d1d5db",
                    borderRadius:
                      "8px",
                    outline:
                      "none",
                  }}
                />
              </div>

              {loading ? (
                <div
                  style={{
                    padding:
                      "50px",
                    textAlign:
                      "center",
                    color:
                      "#6b7280",
                  }}
                >
                  Loading emails...
                </div>
              ) : filteredEmails.length ===
                0 ? (
                <div
                  style={{
                    padding:
                      "50px",
                    textAlign:
                      "center",
                    color:
                      "#6b7280",
                  }}
                >
                  No emails found.
                </div>
              ) : (
                filteredEmails.map(
                  (email) => (
                    <button
                      key={
                        email.id
                      }
                      onClick={() =>
                        openEmail(
                          email
                        )
                      }
                      style={{
                        width:
                          "100%",
                        textAlign:
                          "left",
                        border:
                          "none",
                        borderBottom:
                          "1px solid #f0f0f0",
                        background:
                          email.unread
                            ? "#f8faff"
                            : "#ffffff",
                        padding:
                          "17px 20px",
                        cursor:
                          "pointer",
                      }}
                    >
                      <div
                        style={{
                          display:
                            "flex",
                          justifyContent:
                            "space-between",
                          gap: "15px",
                        }}
                      >
                        <strong
                          style={{
                            fontWeight:
                              email.unread
                                ? "700"
                                : "500",
                          }}
                        >
                          {email.from ||
                            "Unknown sender"}
                        </strong>

                        <span
                          style={{
                            fontSize:
                              "12px",
                            color:
                              "#9ca3af",
                          }}
                        >
                          {email.date ||
                            ""}
                        </span>
                      </div>

                      <div
                        style={{
                          marginTop:
                            "7px",
                          fontWeight:
                            email.unread
                              ? "700"
                              : "500",
                        }}
                      >
                        {email.subject ||
                          "(No subject)"}
                      </div>

                      <div
                        style={{
                          marginTop:
                            "5px",
                          color:
                            "#6b7280",
                          fontSize:
                            "13px",
                          whiteSpace:
                            "nowrap",
                          overflow:
                            "hidden",
                          textOverflow:
                            "ellipsis",
                        }}
                      >
                        {email.snippet ||
                          ""}
                      </div>
                    </button>
                  )
                )
              )}
            </div>
          )}
        </main>

        {/* AI Assistant */}

        <aside
          style={{
            background:
              "#ffffff",
            borderLeft:
              "1px solid #e5e7eb",
            padding: "20px",
          }}
        >
          <div
            style={{
              fontSize:
                "21px",
              fontWeight:
                "700",
              marginBottom:
                "6px",
            }}
          >
            ✨ AI Assistant
          </div>

          <p
            style={{
              color:
                "#6b7280",
              fontSize:
                "13px",
              lineHeight:
                "1.5",
            }}
          >
            Control your mailbox using natural
            language.
          </p>

          <div
            style={{
              display:
                "grid",
              gap: "8px",
              marginBottom:
                "15px",
            }}
          >
            <button
              onClick={() =>
                handleAICommandWithText(
                  "show my unread emails"
                )
              }
              style={
                quickButtonStyle
              }
              disabled={
                aiLoading
              }
            >
              Show unread emails
            </button>

            <button
              onClick={() =>
                handleAICommandWithText(
                  "show my sent emails"
                )
              }
              style={
                quickButtonStyle
              }
              disabled={
                aiLoading
              }
            >
              Show sent emails
            </button>

            <button
              onClick={() =>
                handleAICommandWithText(
                  "compose an email"
                )
              }
              style={
                quickButtonStyle
              }
              disabled={
                aiLoading
              }
            >
              Compose email
            </button>
          </div>

          <textarea
            value={
              userCommand
            }
            onChange={(
              event
            ) =>
              setUserCommand(
                event.target
                  .value
              )
            }
            placeholder="Example: open the email with subject [Spotify] Please verify your device"
            rows={5}
            style={{
              width:
                "100%",
              boxSizing:
                "border-box",
              resize:
                "vertical",
              padding:
                "12px",
              border:
                "1px solid #d1d5db",
              borderRadius:
                "8px",
              outline:
                "none",
              fontFamily:
                "inherit",
              fontSize:
                "13px",
            }}
          />

          <button
            onClick={() =>
              handleAICommand()
            }
            disabled={
              aiLoading
            }
            style={{
              width:
                "100%",
              marginTop:
                "10px",
              padding:
                "12px",
              background:
                "#111827",
              color:
                "#ffffff",
              border:
                "none",
              borderRadius:
                "8px",
              cursor:
                aiLoading
                  ? "not-allowed"
                  : "pointer",
              opacity:
                aiLoading
                  ? 0.6
                  : 1,
              fontWeight:
                "700",
            }}
          >
            {aiLoading
              ? "Thinking..."
              : "Ask AI"}
          </button>

          {aiMessage && (
            <div
              style={{
                marginTop:
                  "15px",
                padding:
                  "12px",
                borderRadius:
                  "8px",
                background:
                  "#f3f4f6",
                fontSize:
                  "13px",
                lineHeight:
                  "1.5",
              }}
            >
              {aiMessage}
            </div>
          )}

          {error && (
            <div
              style={{
                marginTop:
                  "15px",
                padding:
                  "12px",
                borderRadius:
                  "8px",
                background:
                  "#fef2f2",
                color:
                  "#b91c1c",
                fontSize:
                  "13px",
                lineHeight:
                  "1.5",
              }}
            >
              {error}
            </div>
          )}
        </aside>
      </div>

      {/* Compose Modal */}

      {showCompose && (
        <div
          style={{
            position:
              "fixed",
            inset: 0,
            background:
              "rgba(0,0,0,0.45)",
            display:
              "flex",
            alignItems:
              "center",
            justifyContent:
              "center",
            padding:
              "20px",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              width:
                "min(760px, 100%)",
              background:
                "#ffffff",
              borderRadius:
                "14px",
              padding:
                "25px",
              boxSizing:
                "border-box",
            }}
          >
            <div
              style={{
                display:
                  "flex",
                justifyContent:
                  "space-between",
                alignItems:
                  "center",
                marginBottom:
                  "20px",
              }}
            >
              <h2
                style={{
                  margin: 0,
                }}
              >
                Compose Email
              </h2>

              <button
                onClick={() =>
                  setShowCompose(
                    false
                  )
                }
                style={{
                  border:
                    "none",
                  background:
                    "transparent",
                  fontSize:
                    "22px",
                  cursor:
                    "pointer",
                }}
              >
                ×
              </button>
            </div>

            <input
              value={
                composeData.to
              }
              onChange={(
                event
              ) =>
                setComposeData({
                  ...composeData,
                  to: event
                    .target
                    .value,
                })
              }
              placeholder="To"
              style={
                composeInputStyle
              }
            />

            <input
              value={
                composeData.subject
              }
              onChange={(
                event
              ) =>
                setComposeData({
                  ...composeData,
                  subject:
                    event
                      .target
                      .value,
                })
              }
              placeholder="Subject"
              style={
                composeInputStyle
              }
            />

            <textarea
              value={
                composeData.body
              }
              onChange={(
                event
              ) =>
                setComposeData({
                  ...composeData,
                  body: event
                    .target
                    .value,
                })
              }
              placeholder="Write your email..."
              rows={14}
              style={{
                ...composeInputStyle,
                resize:
                  "vertical",
              }}
            />

            <div
              style={{
                display:
                  "flex",
                justifyContent:
                  "flex-end",
                gap: "10px",
                marginTop:
                  "15px",
              }}
            >
              <button
                onClick={() =>
                  setShowCompose(
                    false
                  )
                }
                style={{
                  padding:
                    "11px 18px",
                  border:
                    "none",
                  background:
                    "transparent",
                  cursor:
                    "pointer",
                }}
              >
                Cancel
              </button>

              <button
                onClick={
                  sendEmail
                }
                disabled={
                  sending
                }
                style={{
                  padding:
                    "11px 22px",
                  border:
                    "none",
                  borderRadius:
                    "8px",
                  background:
                    "#2563eb",
                  color:
                    "#ffffff",
                  cursor:
                    sending
                      ? "not-allowed"
                      : "pointer",
                  opacity:
                    sending
                      ? 0.6
                      : 1,
                  fontWeight:
                    "700",
                }}
              >
                {sending
                  ? "Sending..."
                  : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------
// Styles
// ---------------------------------------

const quickButtonStyle = {
  width: "100%",
  padding: "10px",
  border:
    "1px solid #e5e7eb",
  background:
    "#ffffff",
  borderRadius:
    "8px",
  cursor:
    "pointer",
  textAlign:
    "left",
};

const composeInputStyle = {
  width: "100%",
  boxSizing:
    "border-box",
  padding: "12px",
  border:
    "1px solid #d1d5db",
  borderRadius:
    "8px",
  marginBottom:
    "10px",
  fontFamily:
    "inherit",
  fontSize:
    "14px",
  outline:
    "none",
};
export default App;

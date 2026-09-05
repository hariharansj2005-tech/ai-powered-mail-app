import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://localhost:5000";

function App() {
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [showCompose, setShowCompose] = useState(false);

  const [composeData, setComposeData] = useState({
    to: "",
    subject: "",
    body: "",
  });

  const [userCommand, setUserCommand] = useState("");

  const [aiMessage, setAiMessage] = useState(
    "Hello! I can help you manage your email."
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [sending, setSending] = useState(false);

  // -----------------------------------------
  // LOAD REAL GMAIL INBOX
  // -----------------------------------------

  const loadEmails = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `${API_URL}/api/gmail/messages`
      );

      const responseText = await response.text();

      let data;

      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(
          `Backend returned an invalid response. HTTP status: ${response.status}`
        );
      }

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to load Gmail messages."
        );
      }

      if (!data.connected) {
        throw new Error("Gmail is not connected.");
      }

      setEmails(data.messages || []);
    } catch (err) {
      console.error("Load Gmail error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load emails when app starts
  useEffect(() => {
    loadEmails();
  }, []);

  // -----------------------------------------
  // OPEN BLANK COMPOSE
  // -----------------------------------------

  const openBlankCompose = () => {
    setComposeData({
      to: "",
      subject: "",
      body: "",
    });

    setShowCompose(true);
  };

  // -----------------------------------------
  // CLEAN TEXT
  // -----------------------------------------

  const cleanText = (text) => {
    return text
      .replace(/^["']|["']$/g, "")
      .trim();
  };

  // -----------------------------------------
  // AI COMMAND HANDLING
  // -----------------------------------------

  const sendAICommand = () => {
    const command = userCommand.trim();

    if (!command) {
      return;
    }

    const lower = command.toLowerCase();

    // -----------------------------------------
    // SHOW UNREAD EMAILS
    // -----------------------------------------

    if (
      lower.includes("unread") ||
      lower.includes("show unread") ||
      lower.includes("unread emails")
    ) {
      const unreadEmails = emails.filter(
        (email) => email.unread
      );

      if (unreadEmails.length > 0) {
        setSearchText("");

        setAiMessage(
          `I found ${unreadEmails.length} unread email${
            unreadEmails.length > 1 ? "s" : ""
          }.`
        );
      } else {
        setSearchText("");

        setAiMessage(
          "You don't have any unread emails."
        );
      }

      setUserCommand("");
      return;
    }

    // -----------------------------------------
    // SHOW RECENT EMAILS
    // -----------------------------------------

    if (
      lower.includes("recent") ||
      lower.includes("latest") ||
      lower.includes("new emails")
    ) {
      setSearchText("");

      setAiMessage(
        "I'm showing your latest Gmail messages."
      );

      setUserCommand("");
      return;
    }

    // -----------------------------------------
    // COMPOSE EMAIL
    // -----------------------------------------

    const composeIntent =
      lower.includes("send an email") ||
      lower.includes("compose an email") ||
      lower.includes("write an email") ||
      lower.includes("compose email") ||
      lower.includes("write email");

    if (composeIntent) {
      let to = "";
      let subject = "";
      let body = "";

      // Find email address
      const emailMatch = command.match(
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
      );

      if (emailMatch) {
        to = emailMatch[0];
      }

      // Find subject
      const subjectMatch = command.match(
        /subject\s+(.+?)(?:\s+and\s+body\s+|\s+body\s+|$)/i
      );

      if (subjectMatch) {
        subject = cleanText(subjectMatch[1]);
      }

      // Find body
      const bodyMatch = command.match(
        /body\s+(.+)$/i
      );

      if (bodyMatch) {
        body = cleanText(bodyMatch[1]);
      }

      setComposeData({
        to,
        subject,
        body,
      });

      setShowCompose(true);

      setAiMessage(
        "I prepared the email for you. Please review it before sending."
      );

      setUserCommand("");
      return;
    }

    // -----------------------------------------
    // SEARCH EMAILS
    // -----------------------------------------

    if (
      lower.includes("search") ||
      lower.includes("find") ||
      lower.includes("show emails")
    ) {
      let searchValue = command
        .replace(/^search\s+/i, "")
        .replace(/^find\s+/i, "")
        .replace(/^show emails\s+/i, "")
        .trim();

      searchValue = cleanText(searchValue);

      if (searchValue) {
        setSearchText(searchValue);

        setAiMessage(
          `Showing emails matching "${searchValue}".`
        );
      } else {
        setAiMessage(
          "Please tell me what you want me to search for."
        );
      }

      setUserCommand("");
      return;
    }

    // -----------------------------------------
    // UNKNOWN COMMAND
    // -----------------------------------------

    setAiMessage(
      "I can help you search emails, show unread emails, or compose an email."
    );

    setUserCommand("");
  };

  // -----------------------------------------
  // SEND REAL GMAIL EMAIL
  // -----------------------------------------

  const sendEmail = async () => {
    if (!composeData.to.trim()) {
      alert(
        "Please enter a recipient email address."
      );
      return;
    }

    if (!composeData.subject.trim()) {
      alert("Please enter a subject.");
      return;
    }

    if (!composeData.body.trim()) {
      alert("Please enter the email body.");
      return;
    }

    try {
      setSending(true);

      console.log("Sending email:", composeData);

      const response = await fetch(
        `${API_URL}/api/gmail/send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: composeData.to.trim(),
            subject: composeData.subject.trim(),
            body: composeData.body.trim(),
          }),
        }
      );

      // Read response as TEXT first.
      // This prevents JSON.parse errors from hiding
      // the actual backend response.
      const responseText = await response.text();

      console.log(
        "Backend response:",
        response.status,
        responseText
      );

      let data;

      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error(
          "JSON parse error:",
          parseError
        );

        throw new Error(
          `Backend returned an invalid response. HTTP ${response.status}.`
        );
      }

      if (!response.ok) {
        throw new Error(
          data.message ||
            data.error ||
            "Unable to send email."
        );
      }

      if (!data.success) {
        throw new Error(
          data.message ||
            "Email was not sent."
        );
      }

      // SUCCESS
      alert("✅ Email sent successfully!");

      setAiMessage(
        "Your email was sent successfully through Gmail."
      );

      setShowCompose(false);

      setComposeData({
        to: "",
        subject: "",
        body: "",
      });

    } catch (err) {
      console.error(
        "Send email error:",
        err
      );

      alert(
        `Failed to send email: ${err.message}`
      );
    } finally {
      setSending(false);
    }
  };

  // -----------------------------------------
  // FILTER EMAILS
  // -----------------------------------------

  const filteredEmails = emails.filter(
    (email) => {
      if (!searchText.trim()) {
        return true;
      }

      const search =
        searchText.toLowerCase();

      return (
        email.from
          ?.toLowerCase()
          .includes(search) ||
        email.to
          ?.toLowerCase()
          .includes(search) ||
        email.subject
          ?.toLowerCase()
          .includes(search) ||
        email.snippet
          ?.toLowerCase()
          .includes(search)
      );
    }
  );

  // -----------------------------------------
  // GET SENDER NAME
  // -----------------------------------------

  const getSenderName = (from) => {
    if (!from) {
      return "Unknown sender";
    }

    const match = from.match(
      /^"?([^"<]+)"?\s*</
    );

    if (match) {
      return match[1].trim();
    }

    return from;
  };

  // -----------------------------------------
  // UI
  // -----------------------------------------

  return (
    <div className="mail-app">

      {/* =====================================
          SIDEBAR
      ====================================== */}

      <aside className="sidebar">

        <div className="logo">
          ✉️ AI Mail
        </div>

        <button
          className="compose-button"
          onClick={openBlankCompose}
        >
          ＋ Compose
        </button>

        <nav>

          <button className="nav-item active">
            📥 Inbox
            <span>{emails.length}</span>
          </button>

          <button className="nav-item">
            📤 Sent
          </button>

          <button className="nav-item">
            ⭐ Starred
          </button>

          <button className="nav-item">
            🗑️ Trash
          </button>

        </nav>

        <div className="sidebar-bottom">

          <button
            className="connect-button"
            onClick={() => {
              window.location.href =
                `${API_URL}/auth/google`;
            }}
          >
            🔗 Connect Gmail
          </button>

        </div>

      </aside>

      {/* =====================================
          MAIN CONTENT
      ====================================== */}

      <main className="main-content">

        {/* HEADER */}

        <header className="top-bar">

          <div>
            <h1>Inbox</h1>

            <p>
              Real Gmail messages
            </p>
          </div>

          <button
            className="refresh-button"
            onClick={loadEmails}
            disabled={loading}
          >
            🔄 {loading ? "Loading..." : "Refresh"}
          </button>

        </header>

        {/* SEARCH */}

        <div className="search-box">

          <span>🔍</span>

          <input
            type="text"
            placeholder="Search emails..."
            value={searchText}
            onChange={(e) =>
              setSearchText(e.target.value)
            }
          />

        </div>

        {/* ERROR */}

        {error && (
          <div className="error-message">
            ❌ {error}
          </div>
        )}

        {/* LOADING */}

        {loading ? (

          <div className="empty-state">

            <h2>
              Loading Gmail...
            </h2>

            <p>
              Fetching your real inbox messages.
            </p>

          </div>

        ) : (

          <div className="mail-layout">

            {/* =================================
                EMAIL LIST
            ================================== */}

            <section className="email-list">

              {filteredEmails.length === 0 ? (

                <div className="empty-state">

                  <h2>
                    No emails found
                  </h2>

                  <p>
                    Try another search.
                  </p>

                </div>

              ) : (

                filteredEmails.map(
                  (email) => (

                    <button
                      key={email.id}
                      className={`email-row ${
                        email.unread
                          ? "unread"
                          : ""
                      }`}
                      onClick={() =>
                        setSelectedEmail(email)
                      }
                    >

                      {/* AVATAR */}

                      <div className="email-avatar">

                        {getSenderName(
                          email.from
                        )
                          .charAt(0)
                          .toUpperCase()}

                      </div>

                      {/* EMAIL CONTENT */}

                      <div className="email-content">

                        <div className="email-top">

                          <strong>
                            {getSenderName(
                              email.from
                            )}
                          </strong>

                          <span>
                            {email.date
                              ? new Date(
                                  email.date
                                ).toLocaleString()
                              : ""}
                          </span>

                        </div>

                        <div className="email-subject">

                          {email.subject ||
                            "(No subject)"}

                        </div>

                        <div className="email-snippet">

                          {email.snippet}

                        </div>

                      </div>

                      {/* UNREAD DOT */}

                      {email.unread && (
                        <div className="unread-dot"></div>
                      )}

                    </button>

                  )
                )

              )}

            </section>

            {/* =================================
                EMAIL DETAIL
            ================================== */}

            <section className="email-detail">

              {selectedEmail ? (

                <div>

                  <button
                    className="close-detail"
                    onClick={() =>
                      setSelectedEmail(null)
                    }
                  >
                    ← Back
                  </button>

                  <h2>
                    {selectedEmail.subject ||
                      "(No subject)"}
                  </h2>

                  <div className="detail-sender">

                    <strong>
                      {getSenderName(
                        selectedEmail.from
                      )}
                    </strong>

                    <span>
                      {selectedEmail.from}
                    </span>

                  </div>

                  <div className="detail-info">

                    To:{" "}
                    {selectedEmail.to}

                  </div>

                  <div className="detail-info">

                    {selectedEmail.date}

                  </div>

                  <hr />

                  <p className="detail-body">

                    {selectedEmail.snippet}

                  </p>

                  {/* REPLY */}

                  <button
                    className="reply-button"
                    onClick={() => {

                      setComposeData({
                        to: selectedEmail.from,
                        subject: `Re: ${
                          selectedEmail.subject ||
                          ""
                        }`,
                        body: "",
                      });

                      setShowCompose(true);

                    }}
                  >
                    ↩️ Reply
                  </button>

                </div>

              ) : (

                <div className="empty-detail">

                  <div>📧</div>

                  <h2>
                    Select an email
                  </h2>

                  <p>
                    Choose an email from your real
                    Gmail inbox.
                  </p>

                </div>

              )}

            </section>

          </div>

        )}

        {/* =====================================
            AI ASSISTANT
        ====================================== */}

        <section className="ai-assistant">

          <div className="ai-header">

            <div>

              <strong>
                🤖 AI Assistant
              </strong>

              <p>
                {aiMessage}
              </p>

            </div>

          </div>

          {/* AI INPUT */}

          <div className="ai-input">

            <input
              type="text"
              placeholder='Try: "Show my unread emails"'
              value={userCommand}
              onChange={(e) =>
                setUserCommand(
                  e.target.value
                )
              }
              onKeyDown={(e) => {

                if (e.key === "Enter") {
                  sendAICommand();
                }

              }}
            />

            <button
              onClick={sendAICommand}
            >
              Send
            </button>

          </div>

          {/* QUICK COMMANDS */}

          <div className="quick-commands">

            <button
              onClick={() => {

                const unreadCount =
                  emails.filter(
                    (email) =>
                      email.unread
                  ).length;

                setSearchText("");

                setAiMessage(
                  `You have ${unreadCount} unread email${
                    unreadCount !== 1
                      ? "s"
                      : ""
                  }.`
                );

              }}
            >
              Show unread
            </button>

            <button
              onClick={() => {

                setSearchText("");

                setAiMessage(
                  "Showing your recent Gmail messages."
                );

              }}
            >
              Recent emails
            </button>

            <button
              onClick={openBlankCompose}
            >
              Compose email
            </button>

          </div>

        </section>

      </main>

      {/* =====================================
          COMPOSE MODAL
      ====================================== */}

      {showCompose && (

        <div className="modal-overlay">

          <div className="compose-modal">

            {/* COMPOSE HEADER */}

            <div className="compose-header">

              <h2>
                New Email
              </h2>

              <button
                onClick={() => {

                  if (!sending) {
                    setShowCompose(false);
                  }

                }}
                disabled={sending}
              >
                ✕
              </button>

            </div>

            {/* TO */}

            <input
              type="email"
              placeholder="To"
              value={composeData.to}
              onChange={(e) =>
                setComposeData({
                  ...composeData,
                  to: e.target.value,
                })
              }
              disabled={sending}
            />

            {/* SUBJECT */}

            <input
              type="text"
              placeholder="Subject"
              value={composeData.subject}
              onChange={(e) =>
                setComposeData({
                  ...composeData,
                  subject: e.target.value,
                })
              }
              disabled={sending}
            />

            {/* BODY */}

            <textarea
              placeholder="Write your message..."
              value={composeData.body}
              onChange={(e) =>
                setComposeData({
                  ...composeData,
                  body: e.target.value,
                })
              }
              disabled={sending}
            />

            {/* ACTIONS */}

            <div className="compose-actions">

              <button
                onClick={() =>
                  setShowCompose(false)
                }
                disabled={sending}
              >
                Cancel
              </button>

              <button
                className="send-button"
                onClick={sendEmail}
                disabled={sending}
              >
                {sending
                  ? "Sending..."
                  : "📤 Send Email"}
              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}
export default App;
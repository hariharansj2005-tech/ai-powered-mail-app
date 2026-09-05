import { useState } from "react";
import "./App.css";

function App() {
  const [emails, setEmails] = useState([
    {
      id: 1,
      sender: "Sarah Johnson",
      subject: "Project Update",
      preview: "Here is the latest update about our project...",
      time: "Today, 9:30 AM",
      unread: true,
    },
    {
      id: 2,
      sender: "David Miller",
      subject: "Meeting Tomorrow",
      preview: "Are we still meeting tomorrow at 3 PM?",
      time: "Today, 8:15 AM",
      unread: true,
    },
    {
      id: 3,
      sender: "Google",
      subject: "Security Alert",
      preview: "A new sign-in was detected on your account.",
      time: "Yesterday",
      unread: false,
    },
  ]);

  const [aiMessage, setAiMessage] = useState(
    "Hi! 👋 I can help you manage your emails."
  );

  const [showCompose, setShowCompose] = useState(false);

  const handleAICommand = (command) => {
    if (command === "unread") {
      const unreadEmails = emails.filter((email) => email.unread);

      if (unreadEmails.length === 0) {
        setAiMessage("You have no unread emails.");
      } else {
        setAiMessage(
          `You have ${unreadEmails.length} unread emails: ${unreadEmails
            .map((email) => email.subject)
            .join(", ")}.`
        );
      }
    }

    if (command === "recent") {
      setAiMessage(
        `Your recent emails are: ${emails
          .map((email) => email.subject)
          .join(", ")}.`
      );
    }

    if (command === "compose") {
      setShowCompose(true);
      setAiMessage("Sure! Let's compose a new email.");
    }
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-icon">✉</div>
          <div>
            <h2>AI Mail</h2>
            <p>Smart Email</p>
          </div>
        </div>

        <button
          className="compose-button"
          onClick={() => handleAICommand("compose")}
        >
          + Compose
        </button>

        <div className="menu">
          <div className="menu-item active">
            📥 Inbox <span>{emails.length}</span>
          </div>

          <div className="menu-item">📤 Sent</div>
        </div>

        <div className="settings">⚙ Settings</div>
      </aside>

      <main className="main-content">
        <div className="inbox-header">
          <div>
            <h1>Inbox</h1>
            <p>Your latest messages</p>
          </div>

          <div className="header-icons">
            🔍 🔔
          </div>
        </div>

        <div className="email-list">
          {emails.map((email) => (
            <div className="email-card" key={email.id}>
              <div className="avatar">
                {email.sender.charAt(0)}
              </div>

              <div className="email-content">
                <div className="email-top">
                  <strong>{email.sender}</strong>
                  <span>{email.time}</span>
                </div>

                <h3>{email.subject}</h3>
                <p>{email.preview}</p>
              </div>

              {email.unread && <div className="unread-dot"></div>}
            </div>
          ))}
        </div>
      </main>

      <aside className="ai-panel">
        <div className="ai-header">
          <div>
            <h2>🤖 AI Assistant</h2>
            <p>Ready to help</p>
          </div>

          <div className="online-dot"></div>
        </div>

        <div className="ai-message">
          {aiMessage}
        </div>

        <button
          className="ai-command"
          onClick={() => handleAICommand("unread")}
        >
          Show unread emails
        </button>

        <button
          className="ai-command"
          onClick={() => handleAICommand("recent")}
        >
          Find recent emails
        </button>

        <button
          className="ai-command"
          onClick={() => handleAICommand("compose")}
        >
          Compose an email
        </button>

        <div className="ai-input">
          <input
            type="text"
            placeholder="Ask AI to manage your mail..."
          />

          <button>➤</button>
        </div>
      </aside>

      {showCompose && (
        <div className="compose-overlay">
          <div className="compose-box">
            <div className="compose-header">
              <h2>Compose Email</h2>

              <button onClick={() => setShowCompose(false)}>
                ✕
              </button>
            </div>

            <input
              type="email"
              placeholder="To"
            />

            <input
              type="text"
              placeholder="Subject"
            />

            <textarea
              placeholder="Write your email..."
              rows="8"
            ></textarea>

            <button
              className="send-button"
              onClick={() => {
                alert("Email ready to send!");
                setShowCompose(false);
              }}
            >
              Send Email
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
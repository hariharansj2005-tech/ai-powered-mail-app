import { useState } from "react";
import "./App.css";

const sampleEmails = [
  {
    id: 1,
    sender: "Sarah Johnson",
    email: "sarah@example.com",
    subject: "Project Update",
    preview: "Here is the latest update about our project...",
    body: "Hi,\n\nHere is the latest update about our project. We completed the first phase and are now working on the second phase.\n\nThanks,\nSarah",
    date: "Today, 9:30 AM",
    unread: true,
  },
  {
    id: 2,
    sender: "David Miller",
    email: "david@example.com",
    subject: "Meeting Tomorrow",
    preview: "Are we still meeting tomorrow at 3 PM?",
    body: "Hi,\n\nAre we still meeting tomorrow at 3 PM?\n\nRegards,\nDavid",
    date: "Today, 8:15 AM",
    unread: true,
  },
  {
    id: 3,
    sender: "Google",
    email: "notifications@google.com",
    subject: "Security Alert",
    preview: "A new sign-in was detected on your account.",
    body: "A new sign-in was detected on your Google account.",
    date: "Yesterday",
    unread: false,
  },
];

function App() {
  const [activeView, setActiveView] = useState("inbox");
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [showCompose, setShowCompose] = useState(false);

  const openEmail = (email) => {
    setSelectedEmail(email);
    setActiveView("detail");
  };

  const goToInbox = () => {
    setSelectedEmail(null);
    setActiveView("inbox");
  };

  return (
    <div className="app">

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-icon">✉</div>
          <div>
            <h2>AI Mail</h2>
            <span>Smart Email</span>
          </div>
        </div>

        <button
          className="compose-button"
          onClick={() => setShowCompose(true)}
        >
          ＋ Compose
        </button>

        <nav className="navigation">
          <button
            className={activeView === "inbox" ? "nav-item active" : "nav-item"}
            onClick={goToInbox}
          >
            <span>📥</span>
            Inbox
            <span className="count">3</span>
          </button>

          <button
            className={activeView === "sent" ? "nav-item active" : "nav-item"}
            onClick={() => {
              setSelectedEmail(null);
              setActiveView("sent");
            }}
          >
            <span>📤</span>
            Sent
          </button>
        </nav>

        <div className="sidebar-bottom">
          <button className="nav-item">
            <span>⚙</span>
            Settings
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <main className="main">

        {/* Header */}
        <header className="header">
          <div>
            <h1>
              {activeView === "inbox" && "Inbox"}
              {activeView === "sent" && "Sent"}
              {activeView === "detail" && "Email"}
            </h1>

            <p>
              {activeView === "inbox" &&
                "Your latest messages"}
              {activeView === "sent" &&
                "Emails you have sent"}
              {activeView === "detail" &&
                "Email details"}
            </p>
          </div>

          <div className="header-actions">
            <button className="icon-button">🔍</button>
            <button className="icon-button">🔔</button>
          </div>
        </header>

        {/* Inbox */}
        {activeView === "inbox" && (
          <section className="email-list">
            {sampleEmails.map((email) => (
              <button
                className={`email-card ${
                  email.unread ? "unread" : ""
                }`}
                key={email.id}
                onClick={() => openEmail(email)}
              >
                <div className="avatar">
                  {email.sender.charAt(0)}
                </div>

                <div className="email-content">
                  <div className="email-top">
                    <strong>{email.sender}</strong>
                    <span>{email.date}</span>
                  </div>

                  <h3>{email.subject}</h3>
                  <p>{email.preview}</p>
                </div>

                {email.unread && <div className="unread-dot"></div>}
              </button>
            ))}
          </section>
        )}

        {/* Sent */}
        {activeView === "sent" && (
          <section className="empty-state">
            <div className="empty-icon">📤</div>
            <h2>Sent Emails</h2>
            <p>
              Your sent emails will appear here once Gmail
              integration is connected.
            </p>
          </section>
        )}

        {/* Email Detail */}
        {activeView === "detail" && selectedEmail && (
          <section className="email-detail">
            <button className="back-button" onClick={goToInbox}>
              ← Back to Inbox
            </button>

            <div className="detail-header">
              <div className="avatar large">
                {selectedEmail.sender.charAt(0)}
              </div>

              <div>
                <h2>{selectedEmail.subject}</h2>
                <p>
                  From: {selectedEmail.sender} (
                  {selectedEmail.email})
                </p>
              </div>
            </div>

            <div className="detail-date">
              {selectedEmail.date}
            </div>

            <div className="email-body">
              {selectedEmail.body.split("\n").map((line, index) => (
                <p key={index}>{line || "\u00A0"}</p>
              ))}
            </div>

            <div className="detail-actions">
              <button
                className="secondary-button"
                onClick={() => setShowCompose(true)}
              >
                ↩ Reply
              </button>

              <button
                className="secondary-button"
                onClick={() => setShowCompose(true)}
              >
                ↗ Forward
              </button>
            </div>
          </section>
        )}

      </main>

      {/* AI Assistant */}
      <aside className="assistant">
        <div className="assistant-header">
          <div>
            <h2>🤖 AI Assistant</h2>
            <span>Ready to help</span>
          </div>
          <div className="status-dot"></div>
        </div>

        <div className="assistant-messages">
          <div className="ai-message">
            Hi! 👋 I can help you manage your emails.
          </div>

          <div className="suggestions">
            <button>
              Show unread emails
            </button>

            <button>
              Find recent emails
            </button>

            <button>
              Compose an email
            </button>
          </div>
        </div>

        <div className="assistant-input">
          <input
            type="text"
            placeholder="Ask AI to manage your mail..."
          />
          <button>➤</button>
        </div>
      </aside>

      {/* Compose Modal */}
      {showCompose && (
        <div className="modal-overlay">
          <div className="compose-modal">

            <div className="compose-header">
              <h2>New Message</h2>

              <button
                onClick={() => setShowCompose(false)}
              >
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
              placeholder="Write your message..."
              rows="8"
            />

            <div className="compose-actions">
              <button
                className="secondary-button"
                onClick={() => setShowCompose(false)}
              >
                Cancel
              </button>

              <button
                className="send-button"
                onClick={() => {
                  alert("Send functionality will be connected to Gmail next.");
                  setShowCompose(false);
                }}
              >
                Send ✈
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

export default App;
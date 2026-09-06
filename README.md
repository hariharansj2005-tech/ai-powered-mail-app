# AI-Powered Mail Web Application

An AI-powered mail web application connected to Gmail, where users can control their mailbox using natural-language commands.

## Features

### Gmail Integration

- Real Gmail Inbox
- Real Gmail Sent folder
- Open and read individual emails
- Mark emails as read
- Search Gmail messages
- Move emails to Trash

### AI Assistant

The AI assistant understands natural-language commands and controls the mail interface.

Examples:

- Show my unread emails
- Show my sent emails
- Show my unread emails from GitHub
- Open the email with subject [GitHub] Please verify your device
- Compose an email to someone with a subject and message

### AI Compose

The assistant can understand a compose request and automatically fill:

- Recipient
- Subject
- Message body

The user reviews the message before sending.

### Smart Reply

Gemini generates a context-aware reply based on the selected email.

The generated reply is placed directly into the compose window for user review.

### Forward

Users can forward an existing email with the original message included.

### Confirmation

Sending an email requires user confirmation before the Gmail API sends it.

Moving an email to Trash also requires confirmation.

## Real-Time Gmail Sync

Gmail changes are received through:

Gmail  
↓  
Gmail Watch  
↓  
Google Cloud Pub/Sub  
↓  
Pub/Sub Subscription  
↓  
Node.js Backend  
↓  
React Frontend  
↓  
Updated Inbox UI

The application uses Gmail push notifications through Google Cloud Pub/Sub.

The backend starts a Gmail watch and listens to the Pub/Sub subscription. When Gmail detects a mailbox change, the notification is received by the backend and the mail interface can be updated automatically.

## Technology Stack

### Frontend

- React
- Vite
- JavaScript
- HTML/CSS

### Backend

- Node.js
- Express.js

### APIs and AI

- Gmail API
- Google Cloud Pub/Sub
- Google Gemini API

### Authentication

- Google OAuth 2.0

## Architecture

```text
                         Gmail
                           |
                       Gmail API
                           |
                    Node.js Backend
                     /            \
                    /              \
               Gmail API        Gemini API
                  |                  |
              Mail Data          AI Commands
                  |                  |
                  +--------+---------+
                           |
                       React UI
                           |
                    AI Assistant
```

## Real-Time Architecture

```text
Gmail Mailbox
      |
      | Gmail Watch
      v
Google Cloud Pub/Sub
      |
      | Subscription
      v
Node.js Backend
      |
      | Mailbox Update Event
      v
React Frontend
      |
      v
Updated Inbox UI
```

## AI Command Flow

```text
User Command
      |
      v
React AI Assistant
      |
      | POST /api/ai/command
      v
Node.js Backend
      |
      v
Gemini API
      |
      | Structured Action
      v
Node.js Backend
      |
      +-------------------+
      |                   |
      v                   v
   Gmail API          Compose / UI
      |                   |
      +---------+---------+
                |
                v
          React Mail UI
```

### Example AI Command

```text
"Show my unread emails from GitHub"
                |
                v
            Gemini AI
                |
                v
          action = search
                |
                v
     query = from:github.com
             is:unread
                |
                v
            Gmail API
                |
                v
        Filtered Inbox UI
```

## Example AI Commands

```text
Show my unread emails

Show my sent emails

Show my unread emails from GitHub

Search emails from LinkedIn

Open the email with subject [GitHub] Please verify your device

Compose an email

Compose an email to test@example.com with subject Project Update and message Hello, I wanted to share the project update with you.
```

## API Endpoints

### Gmail

```text
GET    /api/gmail/profile
GET    /api/gmail/messages
GET    /api/gmail/messages/:id
PATCH  /api/gmail/messages/:id/read
PATCH  /api/gmail/messages/:id/unread
DELETE /api/gmail/messages/:id
GET    /api/gmail/sent
POST   /api/gmail/send
```

### AI

```text
POST /api/ai/command
POST /api/ai/reply
```

### Real-Time Events

```text
GET /api/events
```

## Setup and Run

### 1. Install frontend dependencies

```bash
npm install
```

### 2. Install backend dependencies

```bash
cd server
npm install
```

### 3. Configure environment variables

Create:

```text
server/.env
```

Add the required Google OAuth and Gemini configuration.

Do not commit API keys, OAuth credentials, tokens, or service-account keys to GitHub.

### 4. Start the backend

From the `server` directory:

```bash
node server.js
```

Backend:

```text
http://localhost:5000
```

### 5. Start the frontend

From the project root:

```bash
npm run dev
```

Frontend:

```text
http://localhost:5173
```

## Architecture and Tradeoffs

The application uses React for the user interface and Node.js/Express for backend API communication.

The Gmail API is used for real mailbox data instead of mock emails.

Gemini is used to understand natural-language commands and generate context-aware replies.

Google Cloud Pub/Sub is used with Gmail Watch for mailbox change notifications.

For development, the architecture prioritizes a simple and practical implementation that can be tested locally while keeping the main responsibilities separated between the frontend, backend, Gmail API, Gemini API, and Pub/Sub.

## Security

Sensitive credentials are kept outside the source code.

The following files are excluded from Git:

```text
.env
credentials.json
token.json
gmail-pubsub-key.json
```

API keys, OAuth secrets, access tokens, and service-account credentials must never be committed to the repository.

## Improvements

Possible future improvements include:

- Thread-based conversation view
- Rich email formatting
- Attachments
- Starred email support
- Trash folder
- Advanced Gmail filters
- Better error recovery
- Automated tests
- Production deployment
- Improved responsive design
- Additional AI mailbox actions

## Project Goal

The goal of this project is to demonstrate a real Gmail-connected mail client where AI does more than provide chat responses.

The AI assistant can understand user intent and control the mail application's interface, including searching, filtering, opening emails, composing messages, and generating replies.
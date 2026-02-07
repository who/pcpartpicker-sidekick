# PCPartPicker Sidekick — MVP PRD

## Overview

PCPartPicker Sidekick is a conversational PC build assistant. Users describe a build goal and budget in natural language, and the system uses Claude 4.6 to interpret requirements, browse PCPartPicker via headless Playwright, and assemble a parts list — saved directly to the user's PCPartPicker account.

## Problem

Manually researching and selecting compatible PC parts within a budget is time-consuming. Users must cross-reference prices, compatibility, and reviews across many categories. This tool automates the browsing, filtering, and selection workflow while keeping the user in control of key decisions.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js / TypeScript |
| AI | Anthropic Claude 4.6 API (`claude-opus-4-6`) |
| Browser automation | Playwright (headless Chromium) |
| Frontend | Simple local web UI (single-page, chat-style) |
| Server | Express (or Fastify) with WebSocket for streaming chat |
| Config | `.env` file for credentials and API key |

## Architecture

```
┌──────────────┐       WebSocket       ┌──────────────────┐
│  Browser UI  │◄─────────────────────►│   Node Server    │
│  (chat page) │                       │                  │
└──────────────┘                       │  ┌────────────┐  │
                                       │  │ Claude 4.6 │  │
                                       │  │  (agent)   │  │
                                       │  └─────┬──────┘  │
                                       │        │         │
                                       │  ┌─────▼──────┐  │
                                       │  │ Playwright  │  │
                                       │  │ (headless)  │  │
                                       │  └─────┬──────┘  │
                                       └────────┼─────────┘
                                                │
                                       ┌────────▼─────────┐
                                       │  pcpartpicker.com │
                                       └──────────────────┘
```

## Environment Variables (`.env`)

```
PCPARTPICKER_USERNAME=<email>
PCPARTPICKER_PASSWORD=<password>
ANTHROPIC_API_KEY=<claude-api-key>
```

## User Flow

1. **User opens the web UI** — a simple local chat interface served on `localhost`.
2. **User describes a build** — e.g., *"I want a mid-range gaming PC for 1440p, budget around $1,200. I'd like an AMD CPU and at least 32 GB of RAM."*
3. **Claude analyzes the prompt** — determines which part categories are needed and what information is missing.
4. **Dynamic Q&A** — Claude asks follow-up questions as needed based on how specific the initial prompt is. Could be zero questions (very specific prompt) or several (vague prompt). Examples:
   - "Do you have a preference for GPU brand — NVIDIA or AMD?"
   - "Do you need Wi-Fi on the motherboard?"
   - "Any preference on case size — full tower, mid tower, or compact?"
5. **Claude builds a search plan** — a structured list of part categories to search with filters (price range, specs, brand).
6. **Playwright browses PCPartPicker** — for each category, the system:
   - Navigates to the relevant category page
   - Applies filters (price, specs, ratings)
   - Scrapes top results (name, price, rating, key specs)
   - Feeds results back to Claude for selection
7. **Claude selects parts** — picks the best option per category considering budget allocation, compatibility, and user preferences.
8. **User reviews the build** — the full parts list is presented in the chat with prices, totals, and reasoning. The user can request swaps (e.g., *"swap the GPU for something cheaper"*).
9. **Save to PCPartPicker** — once approved, Playwright logs into the user's PCPartPicker account and saves the list using PCPartPicker's saved list feature so it appears in their account.

## Core Components

### 1. Chat Server (`src/server.ts`)

- Express server serving the static web UI
- WebSocket endpoint for real-time chat streaming
- Session management for one active conversation

### 2. Claude Agent (`src/agent.ts`)

- Manages the conversation with Claude 4.6
- System prompt defines the agent's role: PC build advisor
- Tool-use pattern — Claude is given tools to:
  - `search_parts(category, filters)` — trigger a Playwright search
  - `ask_user(question)` — send a follow-up question to the user
  - `propose_build(parts[])` — present the build for review
  - `save_list(parts[])` — trigger the save flow
- Claude decides dynamically how many questions to ask and when to search

### 3. Playwright Controller (`src/browser.ts`)

- Manages a single headless Chromium instance
- Key actions:
  - `login()` — authenticate with PCPartPicker credentials
  - `searchCategory(category, filters)` — navigate, filter, scrape results
  - `saveList(parts[])` — add parts to a list and save it
- Handles PCPartPicker's page structure (selectors, pagination, filters)
- Returns structured data (not raw HTML) to the agent

### 4. Web UI (`public/index.html`)

- Single HTML file with inline CSS/JS (keep it minimal)
- Chat message list with user/assistant bubbles
- Text input + send button
- Displays parts list in a formatted table when proposed
- Approve / request changes buttons on the proposed build

## Part Categories

The system supports all standard PCPartPicker categories. Claude dynamically selects which are needed based on the user's request:

- CPU
- CPU Cooler
- Motherboard
- Memory (RAM)
- Storage (SSD/HDD)
- Video Card (GPU)
- Case
- Power Supply (PSU)
- Operating System
- Case Fans
- Monitor
- Peripherals (keyboard, mouse, etc.)

Users can also explicitly include/exclude categories (e.g., *"I already have a case and monitor"*).

## Budget Strategy

- **Default: budget-optimized** — maximize performance-per-dollar within the stated budget
- **Respect explicit preferences** — if the user names a specific part or brand, prioritize that even if it's not the cheapest option
- **Budget allocation** — Claude allocates budget across categories based on build purpose (e.g., gaming builds allocate more to GPU)
- **Over-budget warning** — if user preferences push the total over budget, flag it and suggest alternatives

## MVP Scope

### In Scope

- Single-user, local-only (runs on localhost)
- One active conversation/build at a time
- Login to PCPartPicker, browse parts, save a list
- Conversational build flow with dynamic Q&A
- Part selection with price + compatibility awareness
- Save completed list to user's PCPartPicker account
- Basic error handling (login failure, part not found, network issues)

### Out of Scope (Post-MVP)

- Multi-user / auth / deployment
- Build comparison or history
- Price tracking / alerts
- Benchmark data integration
- PCPartPicker compatibility checker integration (rely on Claude's knowledge for MVP)
- Part reviews / detailed analysis
- Mobile-responsive UI
- Persistent conversation history

## File Structure

```
pcpartpicker-sidekick/
├── .env                  # Credentials (git-ignored)
├── .gitignore
├── package.json
├── tsconfig.json
├── PRD.md
├── public/
│   └── index.html        # Chat UI (single file)
├── src/
│   ├── index.ts          # Entry point — starts server
│   ├── server.ts         # Express + WebSocket server
│   ├── agent.ts          # Claude 4.6 conversation + tool orchestration
│   ├── browser.ts        # Playwright controller for PCPartPicker
│   └── types.ts          # Shared TypeScript types
```

## Key Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| PCPartPicker page structure changes break selectors | Keep selectors in a single config object; easy to update |
| Rate limiting or bot detection | Add human-like delays between actions; use a real browser fingerprint via Playwright |
| Claude hallucinating part names/prices | Always ground selections in scraped data; Claude selects from real results only |
| Login flow changes (CAPTCHA, 2FA) | MVP assumes simple email/password login; document as a known limitation |
| Budget math errors | Claude proposes the build; server-side code validates the total before presenting |

## Success Criteria

The MVP is successful if a user can:

1. Open the web UI and describe a PC build in plain English
2. Answer a few clarifying questions from the assistant
3. Receive a complete, priced parts list that fits their budget
4. Approve the list and find it saved in their PCPartPicker account
5. Complete the entire flow in under 5 minutes

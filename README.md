# pcpartpicker-sidekick

Conversational PC build assistant using Claude 4.6 and Playwright to browse PCPartPicker and assemble parts lists.

Describe the PC you want in plain English, answer a few clarifying questions, and get a priced parts list saved directly to your PCPartPicker account.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- A [PCPartPicker](https://pcpartpicker.com/) account
- An [Anthropic API key](https://console.anthropic.com/)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in the project root with your credentials:

   ```
   PCPARTPICKER_USERNAME=your_username
   PCPARTPICKER_PASSWORD=your_password
   ANTHROPIC_API_KEY=sk-ant-...
   ```

## Usage

Start the development server:

```bash
npm run dev
```

Open http://localhost:3000 in your browser. Type a description of the PC you want to build (e.g. "I want a mid-range gaming PC for 1440p, budget around $1,200, AMD CPU, at least 32 GB of RAM") and the assistant will:

1. Ask clarifying questions about your needs
2. Search PCPartPicker for compatible parts
3. Propose a build with prices and reasoning
4. Save the approved build to your PCPartPicker account

## Commands

```bash
npm run dev      # Start dev server (with hot reload)
npm run build    # Compile TypeScript to dist/
npm run lint     # Run ESLint
npm run format   # Auto-fix lint issues
npm test         # Run tests
```

## Tech Stack

- **Language**: TypeScript
- **Runtime**: Node.js
- **Framework**: Express + WebSocket (ws)
- **AI**: Anthropic Claude 4.6
- **Browser Automation**: Playwright
- **Linter**: ESLint

## Ortus Automation

This project was scaffolded with [Ortus](https://github.com/who/ortus), which provides AI-powered development workflows including PRD-to-issues decomposition and automated implementation loops. See the ortus/ directory for scripts and prompts.

## License

MIT

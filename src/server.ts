import http from "node:http";
import path from "node:path";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { Agent } from "./agent.js";
import { BrowserController } from "./browser.js";
import { checkOverBudget } from "./budget.js";
import { ErrorType, ERROR_MESSAGES } from "./types.js";
import type {
  PartCategory,
  PartResult,
  SearchFilters,
  WsMessageIn,
  WsMessageOut,
  WsProposalPart,
} from "./types.js";

interface Session {
  agent: Agent;
  browser: BrowserController;
  ws: WebSocket;
  active: boolean;
  pendingQuestion: ((answer: string) => void) | null;
}

interface ServerInstance {
  app: express.Application;
  server: http.Server;
  wss: WebSocketServer;
  start: () => void;
}

function send(ws: WebSocket, msg: WsMessageOut): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function classifyError(err: unknown): ErrorType {
  if (!(err instanceof Error)) return ErrorType.NETWORK_ERROR;

  const msg = err.message.toLowerCase();

  if (
    msg.includes("net::err") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("etimedout") ||
    msg.includes("fetch failed") ||
    msg.includes("network")
  ) {
    return ErrorType.NETWORK_ERROR;
  }

  if (
    msg.includes("browser has been closed") ||
    msg.includes("target closed") ||
    msg.includes("browser.newcontext") ||
    msg.includes("browser disconnected")
  ) {
    return ErrorType.BROWSER_CRASH;
  }

  if (
    msg.includes("rate limit") ||
    msg.includes("overloaded") ||
    msg.includes("529") ||
    msg.includes("api key") ||
    msg.includes("authentication") ||
    msg.includes("401") ||
    msg.includes("invalid x-api-key") ||
    msg.includes("invalid api key")
  ) {
    return ErrorType.API_ERROR;
  }

  return ErrorType.NETWORK_ERROR;
}

function sendError(
  ws: WebSocket,
  errorType: ErrorType,
  technicalDetails: string,
): void {
  const friendlyMessage = ERROR_MESSAGES[errorType];
  console.error(`[${errorType}] ${technicalDetails}`);
  send(ws, { type: "error", content: friendlyMessage });
}

function formatResultsTable(results: PartResult[]): string {
  if (results.length === 0) {
    return "No results found matching the search criteria.";
  }

  const lines: string[] = [
    `Found ${results.length} results:`,
    "",
    "| Name | Price | Rating | Specs | URL |",
    "|------|-------|--------|-------|-----|",
  ];

  for (const r of results) {
    const rating = r.rating !== null ? `${r.rating}/5` : "N/A";
    const specs = Object.entries(r.specs)
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ");
    lines.push(
      `| ${r.name} | $${r.price.toFixed(2)} | ${rating} | ${specs} | ${r.url} |`,
    );
  }

  return lines.join("\n");
}

async function teardownSession(session: Session): Promise<void> {
  session.active = false;

  if (session.pendingQuestion) {
    const resolve = session.pendingQuestion;
    session.pendingQuestion = null;
    resolve("User disconnected.");
  }

  if (session.ws.readyState === WebSocket.OPEN) {
    session.ws.close();
  }

  await BrowserController.resetInstance();
  console.log("Session torn down");
}

function setupSession(ws: WebSocket): Session {
  const agent = new Agent();
  const browser = BrowserController.getInstance();

  const session: Session = { agent, browser, ws, active: true, pendingQuestion: null };

  // Register search_parts tool handler — searches PCPartPicker via browser
  agent.onTool("search_parts", async (input) => {
    const category = input.category as PartCategory;

    const doSearch = async (): Promise<string> => {
      await session.browser.launch();

      const filters: SearchFilters = {
        priceMin: (input.price_min as number) ?? null,
        priceMax: (input.price_max as number) ?? null,
        brand: (input.brand as string) ?? null,
        specs: {},
        minRating: (input.min_rating as number) ?? null,
      };

      const results = await session.browser.searchCategory(category, filters);
      return formatResultsTable(results);
    };

    try {
      return await doSearch();
    } catch (err: unknown) {
      const errorType = classifyError(err);
      const detail =
        err instanceof Error ? err.message : "Unknown search error";

      // Attempt one browser restart on crash
      if (errorType === ErrorType.BROWSER_CRASH) {
        console.error(`[BROWSER_CRASH] Search failed, attempting restart: ${detail}`);
        sendError(ws, ErrorType.BROWSER_CRASH, detail);
        try {
          await BrowserController.resetInstance();
          session.browser = BrowserController.getInstance();
          return await doSearch();
        } catch (retryErr: unknown) {
          const retryDetail =
            retryErr instanceof Error
              ? retryErr.message
              : "Unknown error on retry";
          sendError(ws, ErrorType.BROWSER_CRASH, `Restart failed: ${retryDetail}`);
          throw new Error(
            "Browser crashed and could not be restarted. Please try again later.",
          );
        }
      }

      if (errorType === ErrorType.NETWORK_ERROR) {
        sendError(ws, ErrorType.NETWORK_ERROR, detail);
      } else {
        sendError(ws, ErrorType.SEARCH_FAILED, detail);
      }
      throw new Error(
        `Could not find parts for ${category}. Please try again.`,
      );
    }
  });

  // Register ask_user tool handler — pauses until user responds
  agent.onTool("ask_user", (input) => {
    const question = input.question as string;
    send(ws, { type: "question", content: question });

    const ASK_USER_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

    return new Promise<string>((resolve) => {
      const timer = setTimeout(() => {
        session.pendingQuestion = null;
        resolve("User did not respond in time.");
      }, ASK_USER_TIMEOUT_MS);

      session.pendingQuestion = (answer: string) => {
        clearTimeout(timer);
        resolve(answer);
      };
    });
  });

  // Register propose_build tool handler — sends proposal to client
  agent.onTool("propose_build", (input) => {
    const parts = input.parts as WsProposalPart[];
    const total = input.total as number;
    const budget = input.budget as number;
    const budgetCheck = checkOverBudget(budget, total);

    send(ws, {
      type: "proposal",
      parts,
      total,
      budget,
      overBudget: budgetCheck.overBudget,
      overBudgetAmount: budgetCheck.amount,
      overBudgetPercentage: budgetCheck.percentage,
    });

    const PROPOSE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

    return new Promise<string>((resolve) => {
      const timer = setTimeout(() => {
        session.pendingQuestion = null;
        resolve("User did not respond to the build proposal in time.");
      }, PROPOSE_TIMEOUT_MS);

      session.pendingQuestion = (answer: string) => {
        clearTimeout(timer);
        resolve(answer);
      };
    });
  });

  // Register save_list tool handler — saves approved build to PCPartPicker
  agent.onTool("save_list", async (input) => {
    const parts = input.parts as { name: string; url: string; category: string }[];
    const listName = input.list_name as string;

    console.log(
      `save_list: saving ${parts.length} parts as "${listName}"`,
    );

    const doSave = async (): Promise<string> => {
      await session.browser.launch();

      // Ensure logged in before saving
      if (!session.browser.isLoggedIn) {
        const loginResult = await session.browser.login();
        if (!loginResult.success) {
          const reason = loginResult.error ?? "invalid credentials";
          sendError(
            ws,
            ErrorType.LOGIN_FAILED,
            `Login failed during save: ${reason}`,
          );
          throw new Error(
            `Could not log into PCPartPicker: ${reason}`,
          );
        }
      }

      const result = await session.browser.saveList(parts, listName);

      console.log(
        `save_list: saved "${result.listName}" — ${result.partsAdded} added, ${result.partsFailed.length} failed — ${result.url}`,
      );

      return JSON.stringify({
        url: result.url,
        listName: result.listName,
        partsAdded: result.partsAdded,
        partsFailed: result.partsFailed,
      });
    };

    try {
      return await doSave();
    } catch (err: unknown) {
      const errorType = classifyError(err);
      const detail =
        err instanceof Error ? err.message : "Unknown save error";

      // Already handled login failure above — re-throw as-is
      if (errorType === ErrorType.LOGIN_FAILED || detail.includes("Could not log into")) {
        throw err;
      }

      // Attempt one browser restart on crash
      if (errorType === ErrorType.BROWSER_CRASH) {
        console.error(`[BROWSER_CRASH] Save failed, attempting restart: ${detail}`);
        sendError(ws, ErrorType.BROWSER_CRASH, detail);
        try {
          await BrowserController.resetInstance();
          session.browser = BrowserController.getInstance();
          return await doSave();
        } catch (retryErr: unknown) {
          const retryDetail =
            retryErr instanceof Error
              ? retryErr.message
              : "Unknown error on retry";
          sendError(ws, ErrorType.BROWSER_CRASH, `Restart failed: ${retryDetail}`);
          throw new Error(
            "Browser crashed and could not be restarted. Please try again later.",
          );
        }
      }

      if (errorType === ErrorType.NETWORK_ERROR) {
        sendError(ws, ErrorType.NETWORK_ERROR, detail);
      }
      throw err;
    }
  });

  ws.on("message", (data) => {
    let parsed: WsMessageIn;
    try {
      parsed = JSON.parse(data.toString()) as WsMessageIn;
    } catch {
      send(ws, { type: "error", content: "Invalid JSON message" });
      return;
    }

    if (parsed.type === "approve" || parsed.type === "change") {
      if (session.pendingQuestion) {
        const resolve = session.pendingQuestion;
        session.pendingQuestion = null;
        const answer =
          parsed.type === "approve"
            ? "User approved the build."
            : `User requested changes: ${parsed.content}`;
        resolve(answer);
      }
      return;
    }

    if (parsed.type === "message") {
      // If there's a pending question (ask_user), resolve it with user's answer
      if (session.pendingQuestion) {
        const resolve = session.pendingQuestion;
        session.pendingQuestion = null;
        resolve(parsed.content);
        return;
      }

      // Otherwise forward to agent as a new message
      session.agent
        .sendMessage(parsed.content, (text) => {
          send(ws, { type: "response", content: text, done: false });
        })
        .then(() => {
          send(ws, { type: "response", content: "", done: true });
        })
        .catch((err: unknown) => {
          const detail =
            err instanceof Error ? err.message : "Agent error";
          sendError(ws, classifyError(err), detail);
          // Send done signal so the UI re-enables input
          send(ws, { type: "response", content: "", done: true });
        });
      return;
    }
  });

  ws.on("close", () => {
    console.log("WebSocket client disconnected");
    teardownSession(session).catch((err: unknown) => {
      console.error("Error during session teardown:", err);
    });
    currentSession = null;
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
  });

  return session;
}

export function createServer(): ServerInstance {
  const app = express();
  const port = process.env.PORT || 3000;

  app.use(express.static(path.join(process.cwd(), "public")));

  const server = http.createServer(app);

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", async (ws) => {
    console.log("WebSocket client connected");

    // Tear down previous session if one exists
    if (currentSession) {
      console.log("Tearing down previous session for new connection");
      await teardownSession(currentSession);
    }

    currentSession = setupSession(ws);
  });

  function start(): void {
    server.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });

    const shutdown = async () => {
      console.log("Shutting down server...");
      if (currentSession) {
        await teardownSession(currentSession);
        currentSession = null;
      }
      wss.clients.forEach((client) => client.close());
      server.close(() => {
        console.log("Server closed");
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => void shutdown());
    process.on("SIGINT", () => void shutdown());
  }

  return { app, server, wss, start };
}

let currentSession: Session | null = null;

import http from "node:http";
import path from "node:path";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { Agent } from "./agent.js";
import { BrowserController } from "./browser.js";
import type {
  PartCategory,
  PartResult,
  SearchFilters,
  WsMessageIn,
  WsMessageOut,
  WsProposalPart,
} from "./types.js";

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

  wss.on("connection", (ws) => {
    console.log("WebSocket client connected");

    const agent = new Agent();
    const browser = BrowserController.getInstance();
    let pendingQuestion: ((answer: string) => void) | null = null;

    // Register search_parts tool handler — searches PCPartPicker via browser
    agent.onTool("search_parts", async (input) => {
      await browser.launch();

      const filters: SearchFilters = {
        priceMin: (input.price_min as number) ?? null,
        priceMax: (input.price_max as number) ?? null,
        brand: (input.brand as string) ?? null,
        specs: {},
        minRating: (input.min_rating as number) ?? null,
      };

      const results = await browser.searchCategory(
        input.category as PartCategory,
        filters,
      );

      return formatResultsTable(results);
    });

    // Register ask_user tool handler — pauses until user responds
    agent.onTool("ask_user", (input) => {
      const question = input.question as string;
      send(ws, { type: "question", content: question });

      const ASK_USER_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

      return new Promise<string>((resolve) => {
        const timer = setTimeout(() => {
          pendingQuestion = null;
          resolve("User did not respond in time.");
        }, ASK_USER_TIMEOUT_MS);

        pendingQuestion = (answer: string) => {
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

      send(ws, { type: "proposal", parts, total, budget });

      return new Promise<string>((resolve) => {
        pendingQuestion = (answer: string) => {
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

      await browser.launch();

      const result = await browser.saveList(parts, listName);

      console.log(
        `save_list: saved "${result.listName}" — ${result.partsAdded} added, ${result.partsFailed.length} failed — ${result.url}`,
      );

      return JSON.stringify({
        url: result.url,
        listName: result.listName,
        partsAdded: result.partsAdded,
        partsFailed: result.partsFailed,
      });
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
        if (pendingQuestion) {
          const resolve = pendingQuestion;
          pendingQuestion = null;
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
        if (pendingQuestion) {
          const resolve = pendingQuestion;
          pendingQuestion = null;
          resolve(parsed.content);
          return;
        }

        // Otherwise forward to agent as a new message
        agent
          .sendMessage(parsed.content, (text) => {
            send(ws, { type: "response", content: text, done: false });
          })
          .then(() => {
            send(ws, { type: "response", content: "", done: true });
          })
          .catch((err: unknown) => {
            const message =
              err instanceof Error ? err.message : "Agent error";
            send(ws, { type: "error", content: message });
          });
        return;
      }
    });

    ws.on("close", () => {
      console.log("WebSocket client disconnected");
      if (pendingQuestion) {
        const resolve = pendingQuestion;
        pendingQuestion = null;
        resolve("User disconnected.");
      }
    });

    ws.on("error", (err) => {
      console.error("WebSocket error:", err.message);
    });
  });

  function start(): void {
    server.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });

    const shutdown = () => {
      console.log("Shutting down server...");
      wss.clients.forEach((client) => client.close());
      server.close(() => {
        console.log("Server closed");
        process.exit(0);
      });
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  }

  return { app, server, wss, start };
}

import http from "node:http";
import path from "node:path";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { Agent } from "./agent.js";
import type {
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
    let pendingQuestion: ((answer: string) => void) | null = null;

    // Register ask_user tool handler — pauses until user responds
    agent.onTool("ask_user", (input) => {
      const question = input.question as string;
      send(ws, { type: "question", content: question });

      return new Promise<string>((resolve) => {
        pendingQuestion = resolve;
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
      pendingQuestion = null;
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

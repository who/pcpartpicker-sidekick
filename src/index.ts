import "./config.js";
import { createServer } from "./server.js";

process.on("unhandledRejection", (reason: unknown) => {
  console.error(
    "Unhandled promise rejection:",
    reason instanceof Error ? reason.stack ?? reason.message : reason,
  );
});

process.on("uncaughtException", (err: Error) => {
  console.error("Uncaught exception:", err.stack ?? err.message);
  // Allow the process to continue — the server can still serve other requests
});

const { start } = createServer();
start();

import http from "node:http";
import path from "node:path";
import express from "express";

interface ServerInstance {
  app: express.Application;
  server: http.Server;
  start: () => void;
}

export function createServer(): ServerInstance {
  const app = express();
  const port = process.env.PORT || 3000;

  app.use(express.static(path.join(process.cwd(), "public")));

  const server = http.createServer(app);

  function start(): void {
    server.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });

    const shutdown = () => {
      console.log("Shutting down server...");
      server.close(() => {
        console.log("Server closed");
        process.exit(0);
      });
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  }

  return { app, server, start };
}

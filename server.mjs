import { createServer } from "node:http";

import next from "next";

import { attachSocketServer } from "./socket-server.mjs";

const port = Number.parseInt(process.env.PORT || "3000", 10);
const hostname = process.env.HOSTNAME || "0.0.0.0";
const dev = !process.argv.includes("--production");

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = dev ? "development" : "production";
}

let handle = null;

const httpServer = createServer((request, response) => {
  if (!handle) {
    response.statusCode = 503;
    response.end("Server is starting.");
    return;
  }

  handle(request, response);
});

const app = next({
  dev,
  hostname,
  port,
  httpServer,
});

app
  .prepare()
  .then(() => {
    handle = app.getRequestHandler();
    attachSocketServer(httpServer);

    httpServer.listen(port, hostname, () => {
      console.log(
        `> Server listening at http://${hostname}:${port} as ${
          dev ? "development" : "production"
        }`,
      );
    });
  })
  .catch((error) => {
    console.error("Failed to start custom server.", error);
    process.exit(1);
  });

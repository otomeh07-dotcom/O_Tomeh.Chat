const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PORT = Number(process.env.PORT || 5500);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  let pathname = decodeURIComponent(requestUrl.pathname);

  if (pathname === "/") {
    pathname = "/index.html";
  }

  const safePath = path.normalize(path.join(ROOT, pathname));
  if (!safePath.startsWith(ROOT)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  fs.readFile(safePath, (error, data) => {
    if (error) {
      if (error.code === "ENOENT") {
        fs.readFile(path.join(ROOT, "index.html"), (fallbackError, fallbackData) => {
          if (fallbackError) {
            response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
            response.end("Internal Server Error");
            return;
          }

          response.writeHead(200, { "Content-Type": MIME_TYPES[".html"] });
          response.end(fallbackData);
        });
        return;
      }

      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Internal Server Error");
      return;
    }

    const extension = path.extname(safePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    response.end(data);
  });
});

server.listen(PORT, HOST, () => {
  const interfaces = os.networkInterfaces();
  const networkAddress = Object.values(interfaces)
    .flat()
    .find((item) => item && item.family === "IPv4" && !item.internal)?.address;

  console.log(`O_Tomeh.Chat is running at http://localhost:${PORT}/`);
  if (networkAddress) {
    console.log(`Network URL: http://${networkAddress}:${PORT}/`);
  }
});

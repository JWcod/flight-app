// Local dev server: serves static files + auto-saves flight data to disk.
// Run: node server.js  (or double-click launch.command)

const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const PORT = 8765;
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, "data", "flights.json");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function readFlights() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeFlights(flights) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(flights, null, 2), "utf8");
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  // GET /api/flights — read from disk
  if (url.pathname === "/api/flights" && req.method === "GET") {
    const flights = readFlights();
    res.writeHead(200, { "Content-Type": "application/json", ...CORS });
    res.end(JSON.stringify(flights));
    return;
  }

  // POST /api/save — write to disk
  if (url.pathname === "/api/save" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const flights = JSON.parse(body);
        if (!Array.isArray(flights)) throw new Error("Expected array");
        writeFlights(flights);
        res.writeHead(200, { "Content-Type": "application/json", ...CORS });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(400, CORS);
        res.end(`{"ok":false,"error":${JSON.stringify(e.message)}}`);
      }
    });
    return;
  }

  // Static file serving
  let filePath = path.normalize(
    path.join(ROOT, url.pathname === "/" ? "index.html" : url.pathname)
  );
  // Security: block path traversal outside project root
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    res.writeHead(403, CORS);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, CORS);
      res.end("Not Found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "text/plain", ...CORS });
    res.end(data);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://localhost:${PORT}`;
  console.log(`✈️  My Flight Log 已啟動：${url}`);
  console.log(`   資料檔案：${DATA_FILE}`);
  console.log(`   按 Ctrl+C 停止`);
  // Open in default browser (macOS)
  exec(`open "${url}"`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ 埠 ${PORT} 已被使用，請先關閉其他視窗後再重試。`);
  } else {
    console.error("Server error:", err);
  }
  process.exit(1);
});

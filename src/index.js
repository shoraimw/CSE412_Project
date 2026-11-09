import express from "express";
import cors from "cors";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import ridesRouter from "./routes/rides.js";
import { registerSocket } from "./socket.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5000;

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend files for both paths (/frontend and root/ride)
const frontendPath = path.join(__dirname, "../../frontend");
app.use("/frontend", express.static(frontendPath));
app.use(express.static(path.join(frontendPath, "ride")));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
app.set("io", io);
registerSocket(io);

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/rides", ridesRouter);

server.listen(PORT, () => console.log(`DRIVE server running on http://localhost:${PORT}`));
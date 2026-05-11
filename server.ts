import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import fs from "fs";
import https from "https";
import loki from "lokijs";

const dbMemory = new loki("hextech_memory.json");
const matchHistory = dbMemory.addCollection("match_history");

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Memory Bank API
  app.post("/api/history", (req, res) => {
    const entry = matchHistory.insert(req.body);
    res.json(entry);
  });

  app.get("/api/history", (req, res) => {
    res.json(matchHistory.find().slice(-10).reverse());
  });

  // Helper to read lockfile - Wide-net search strategy
  const getLockfileData = () => {
    const commonPaths = [
      'C:\\Riot Games\\League of Legends\\lockfile',
      'C:\\Riot Games\\League of Legends\\Game\\lockfile',
      path.join(process.env.LOCALAPPDATA || '', 'Riot Games/Riot Client/Config/lockfile'),
      'C:\\ProgramData\\Riot Games\\Metadata\\league_of_legends.live\\lockfile',
      'D:\\Riot Games\\League of Legends\\lockfile',
      'E:\\Riot Games\\League of Legends\\lockfile'
    ];

    for (const lockfilePath of commonPaths) {
      try {
        if (fs.existsSync(lockfilePath)) {
          const content = fs.readFileSync(lockfilePath, "utf8");
          const [name, pid, port, password, protocol] = content.split(":");
          console.log(`[Proxy] Found lockfile at: ${lockfilePath}`);
          return { name, pid, port, password, protocol };
        }
      } catch (e) {}
    }
    return null;
  };

  // LCU Proxy with Atomic Import Support
  app.all("/api/lcu/*", async (req, res) => {
    const targetPath = (req.params as any)[0];
    const lockfile = getLockfileData();
    if (!lockfile) {
      // Mock data for demo/fallback
      if (targetPath.includes("lol-champ-select/v1/session")) {
        return res.json({
          timer: { phase: "FINALIZATION", adjustedTimeLeftInPhase: 15000 },
          localPlayerCellId: 0,
          myTeam: [{ championId: 136, cellId: 0, assignedPosition: 'utility' }],
          theirTeam: [{ championId: 64, cellId: 5 }],
        });
      }
      return res.status(503).json({ error: "Local LCU not found." });
    }

    const url = `${lockfile.protocol}://127.0.0.1:${lockfile.port}/${targetPath}`;
    const auth = Buffer.from(`riot:${lockfile.password}`).toString("base64");

    try {
      const response = await axios({
        method: req.method,
        url,
        data: req.body,
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      });
      res.json(response.data);
    } catch (error: any) {
      res.status(error.response?.status || 500).send(error.response?.data || error.message);
    }
  });

  // Atomic Rune Import: GET -> DELETE -> POST
  app.post("/api/lcu-rune-import", async (req, res) => {
    const lockfile = getLockfileData();
    if (!lockfile) return res.status(503).json({ error: "Local LCU not found." });

    const auth = Buffer.from(`riot:${lockfile.password}`).toString("base64");
    const headers = { Authorization: `Basic ${auth}`, "Content-Type": "application/json" };
    const agent = new https.Agent({ rejectUnauthorized: false });
    const baseUrl = `${lockfile.protocol}://127.0.0.1:${lockfile.port}`;

    try {
      // 1. GET current pages
      const pages = await axios.get(`${baseUrl}/lol-perks/v1/pages`, { headers, httpsAgent: agent });
      const currentPage = pages.data.find((p: any) => p.isEditable);
      
      if (currentPage) {
        // 2. DELETE current page
        await axios.delete(`${baseUrl}/lol-perks/v1/pages/${currentPage.id}`, { headers, httpsAgent: agent });
      }

      // 3. POST new page
      const newPageResponse = await axios.post(`${baseUrl}/lol-perks/v1/pages`, {
        ...req.body,
        current: true
      }, { headers, httpsAgent: agent });

      res.json(newPageResponse.data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Live Client Data Proxy
  app.get("/api/liveclientdata/*", async (req, res) => {
    const targetPath = (req.params as any)[0];
    const url = `https://127.0.0.1:2999/liveclientdata/${targetPath}`;

    try {
      const response = await axios({
        method: "GET",
        url,
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      });
      res.json(response.data);
    } catch (error: any) {
      if (targetPath.includes("allgamedata")) {
        return res.json({
          activePlayer: { summonerName: "Summoner", items: [{ name: "Tear of the Goddess" }] },
          allPlayers: [
            { championName: "Aurelion Sol", summonerName: "Summoner", team: "ORDER", items: [] },
            { championName: "Zed", team: "CHAOS", items: [{ name: "Long Sword" }] }
          ]
        });
      }
      res.status(503).json({ error: "Live client API not found." });
    }
  });

  // Vite setup...
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

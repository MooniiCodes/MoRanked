import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = 3000;

  // Leaderboard state
  const players: Record<string, { name: string; elo: number; rank: string }> = {};

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join", (data: { name: string; elo: number; rank: string }) => {
      players[socket.id] = data;
      broadcastLeaderboard();
    });

    socket.on("update-elo", (data: { elo: number; rank: string }) => {
      if (players[socket.id]) {
        players[socket.id].elo = data.elo;
        players[socket.id].rank = data.rank;
        broadcastLeaderboard();
      }
    });

    socket.on("disconnect", () => {
      delete players[socket.id];
      broadcastLeaderboard();
    });

    function broadcastLeaderboard() {
      const leaderboard = Object.values(players)
        .sort((a, b) => b.elo - a.elo)
        .slice(0, 10);
      io.emit("leaderboard-update", leaderboard);
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

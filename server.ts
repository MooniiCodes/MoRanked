import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "mo-ranked-secret-key-123";
const db = new Database("database.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    elo INTEGER DEFAULT 0,
    rank TEXT DEFAULT 'Unranked',
    streak INTEGER DEFAULT 1,
    is_admin INTEGER DEFAULT 0,
    is_leaderboard_banned INTEGER DEFAULT 0,
    banned_until TEXT DEFAULT NULL
  )
`);

// Migrations for existing databases
try {
  db.prepare("ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE users ADD COLUMN banned_until TEXT DEFAULT NULL").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE users ADD COLUMN streak INTEGER DEFAULT 1").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE users ADD COLUMN is_leaderboard_banned INTEGER DEFAULT 0").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE users ADD COLUMN is_permanent_ban INTEGER DEFAULT 0").run();
} catch (e) {}

// Promote MrMoonii to admin
try {
  db.prepare("UPDATE users SET is_admin = 1 WHERE username = ?").run("MrMoonii");
} catch (e) {
  console.error("Failed to promote MrMoonii:", e);
}

async function startServer() {
  const app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = 3000;

  // Middleware to check admin
  const isAdmin = (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "No token" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      const user = db.prepare("SELECT is_admin FROM users WHERE id = ?").get(decoded.id) as any;
      if (user?.is_admin) {
        req.user = decoded;
        next();
      } else {
        res.status(403).json({ error: "Forbidden" });
      }
    } catch (err) {
      console.error("Admin check failed:", err);
      res.status(401).json({ error: "Invalid token" });
    }
  };

  // Auth Routes
  app.post("/api/auth/signup", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Missing fields" });

    try {
      const userCount = (db.prepare("SELECT COUNT(*) as count FROM users").get() as any).count;
      const isAdmin = userCount === 0 ? 1 : 0; // First user is admin

      const hashedPassword = await bcrypt.hash(password, 10);
      const stmt = db.prepare("INSERT INTO users (username, password, is_admin) VALUES (?, ?, ?)");
      const result = stmt.run(username, hashedPassword, isAdmin);
      const userId = Number(result.lastInsertRowid);
      const token = jwt.sign({ id: userId, username }, JWT_SECRET);
      res.json({ token, user: { username, elo: 0, rank: "Unranked", isAdmin } });
    } catch (err: any) {
      console.error("Signup error:", err);
      if (err.code === "SQLITE_CONSTRAINT") return res.status(400).json({ error: "Username taken" });
      res.status(500).json({ error: "Server error during signup" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    try {
      const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      if (user.banned_until && new Date(user.banned_until) > new Date()) {
        return res.status(403).json({ 
          error: "Banned", 
          bannedUntil: user.banned_until,
          isPermanent: !!user.is_permanent_ban
        });
      }

      const token = jwt.sign({ id: user.id, username }, JWT_SECRET);
      res.json({ token, user: { username: user.username, elo: user.elo, rank: user.rank, isAdmin: user.is_admin } });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ error: "Server error during login" });
    }
  });

  app.get("/api/auth/me", (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "No token" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      const user = db.prepare("SELECT username, elo, rank, streak, is_admin, is_leaderboard_banned, banned_until, is_permanent_ban FROM users WHERE id = ?").get(decoded.id) as any;
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (user.banned_until && new Date(user.banned_until) > new Date()) {
        return res.status(403).json({ 
          error: "Banned", 
          bannedUntil: user.banned_until,
          isPermanent: !!user.is_permanent_ban
        });
      }

      res.json({ user: { ...user, isAdmin: user.is_admin } });
    } catch (err) {
      console.error("Auth check failed:", err);
      res.status(401).json({ error: "Invalid token" });
    }
  });

  // Admin Routes
  app.get("/api/admin/users", isAdmin, (req, res) => {
    const users = db.prepare("SELECT id, username, elo, rank, streak, is_admin, is_leaderboard_banned, banned_until FROM users").all();
    res.json({ users });
  });

  app.post("/api/admin/ban", isAdmin, (req, res) => {
    const { userId, durationMinutes, isPermanent } = req.body;
    const bannedUntil = isPermanent 
      ? '9999-12-31T23:59:59.999Z' 
      : new Date(Date.now() + durationMinutes * 60000).toISOString();
    
    db.prepare("UPDATE users SET banned_until = ?, is_permanent_ban = ? WHERE id = ?").run(bannedUntil, isPermanent ? 1 : 0, userId);
    
    // Kick the user if they are online
    Object.keys(players).forEach(socketId => {
      if (players[socketId].userId === userId) {
        io.to(socketId).emit("kick", { 
          reason: isPermanent ? "You have been permanently banned." : `You have been banned until ${new Date(bannedUntil).toLocaleString()}`,
          bannedUntil,
          isPermanent: !!isPermanent
        });
      }
    });

    res.json({ success: true, bannedUntil });
  });

  app.post("/api/admin/kick", isAdmin, (req, res) => {
    const { userId, reason } = req.body;
    Object.keys(players).forEach(socketId => {
      if (players[socketId].userId === userId) {
        io.to(socketId).emit("kick", { reason: reason || "You have been kicked by an admin." });
      }
    });
    res.json({ success: true });
  });

  app.post("/api/admin/unban", isAdmin, (req, res) => {
    const { userId } = req.body;
    db.prepare("UPDATE users SET banned_until = NULL, is_permanent_ban = 0 WHERE id = ?").run(userId);
    res.json({ success: true });
  });

  app.post("/api/admin/leaderboard-ban", isAdmin, (req, res) => {
    const { userId, isBanned } = req.body;
    db.prepare("UPDATE users SET is_leaderboard_banned = ? WHERE id = ?").run(isBanned ? 1 : 0, userId);
    broadcastLeaderboard();
    res.json({ success: true });
  });

  app.post("/api/admin/set-streak-all", isAdmin, (req, res) => {
    const { streak } = req.body;
    db.prepare("UPDATE users SET streak = ?").run(streak);
    
    // Update all online players
    Object.keys(players).forEach(socketId => {
      players[socketId].streak = streak;
      io.to(socketId).emit("force-streak-update", { streak });
    });

    res.json({ success: true });
  });

  app.post("/api/admin/terminate", isAdmin, (req, res) => {
    const { userId } = req.body;
    // Permanent ban instead of deletion to prevent re-registration with same name
    db.prepare("UPDATE users SET banned_until = '9999-12-31T23:59:59.999Z', is_permanent_ban = 1 WHERE id = ?").run(userId);
    
    Object.keys(players).forEach(socketId => {
      if (players[socketId].userId === userId) {
        io.to(socketId).emit("kick", { 
          reason: "Your account has been terminated.",
          bannedUntil: '9999-12-31T23:59:59.999Z',
          isPermanent: true
        });
      }
    });
    res.json({ success: true });
  });

  app.post("/api/admin/promote", isAdmin, (req, res) => {
    const { userId, isAdmin: promoteToAdmin } = req.body;
    db.prepare("UPDATE users SET is_admin = ? WHERE id = ?").run(promoteToAdmin ? 1 : 0, userId);
    res.json({ success: true });
  });

  app.post("/api/admin/set-elo", isAdmin, (req, res) => {
    const { userId, elo, rank } = req.body;
    db.prepare("UPDATE users SET elo = ?, rank = ? WHERE id = ?").run(elo, rank, userId);
    
    // Update in-memory players and notify them
    Object.keys(players).forEach(socketId => {
      if (players[socketId].userId === userId) {
        players[socketId].elo = elo;
        players[socketId].rank = rank;
        io.to(socketId).emit("force-elo-update", { elo, rank });
      }
    });
    
    broadcastLeaderboard();
    res.json({ success: true });
  });

  app.post("/api/admin/set-streak", isAdmin, (req, res) => {
    const { userId, streak } = req.body;
    db.prepare("UPDATE users SET streak = ? WHERE id = ?").run(streak, userId);
    
    // Update in-memory players and notify them
    Object.keys(players).forEach(socketId => {
      if (players[socketId].userId === userId) {
        players[socketId].streak = streak;
        io.to(socketId).emit("force-streak-update", { streak });
      }
    });

    res.json({ success: true });
  });

  app.post("/api/admin/broadcast", isAdmin, (req, res) => {
    const { message } = req.body;
    io.emit("global-message", { message, from: "Admin" });
    res.json({ success: true });
  });

  // Leaderboard state
  const players: Record<string, { name: string; elo: number; rank: string; streak: number; isGuest: boolean; isAdmin: boolean; userId?: number }> = {};

  function broadcastLeaderboard() {
    // Fetch top 10 from DB: not banned, not leaderboard banned, not Unranked (ELO >= 100)
    const leaderboard = db.prepare(`
      SELECT username as name, elo, rank, streak, is_admin as isAdmin 
      FROM users 
      WHERE (banned_until IS NULL OR banned_until < ?) 
      AND is_leaderboard_banned = 0 
      AND rank != 'Unranked'
      ORDER BY elo DESC 
      LIMIT 10
    `).all(new Date().toISOString());
    
    io.emit("leaderboard-update", leaderboard);
  }

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join", (data: { name: string; elo: number; rank: string; streak?: number; isGuest: boolean; isAdmin: boolean; token?: string }) => {
      let userId: number | undefined;
      let streak = data.streak || 1;
      if (data.token) {
        try {
          const decoded = jwt.verify(data.token, JWT_SECRET) as any;
          userId = decoded.id;
          const user = db.prepare("SELECT streak FROM users WHERE id = ?").get(userId) as any;
          if (user) streak = user.streak;
        } catch (e) {}
      }
      players[socket.id] = { ...data, userId, streak };
      broadcastLeaderboard();
    });

    socket.on("update-elo", async (data: { elo: number; rank: string; token?: string }) => {
      if (players[socket.id]) {
        players[socket.id].elo = data.elo;
        players[socket.id].rank = data.rank;
        
        // Save to DB if not guest
        if (data.token) {
          try {
            const decoded = jwt.verify(data.token, JWT_SECRET) as any;
            db.prepare("UPDATE users SET elo = ?, rank = ? WHERE id = ?").run(data.elo, data.rank, decoded.id);
          } catch (err) {
            console.error("Failed to update DB elo:", err);
          }
        }
        
        broadcastLeaderboard();
      }
    });

    socket.on("disconnect", () => {
      delete players[socket.id];
      broadcastLeaderboard();
    });
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

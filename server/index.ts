import "dotenv/config";

import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

import { registerRoutes } from "./routes";
import { startExpiryScheduler } from './jobs/expireChallenges';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: false, limit: "50mb" }));

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true
  })
);

app.use((_req, res, next) => {
  res.header("Cache-Control", "no-cache, no-store, must-revalidate");
  res.header("Pragma", "no-cache");
  res.header("Expires", "0");
  next();
});

(async () => {
  const server = await registerRoutes(app);

  // Start automatic expiry scheduler (cancels unaccepted P2P challenges; marks admin group challenges pending)
  startExpiryScheduler();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    res.status(status).json({ message: err.message || "Internal Server Error" });
  });

  const distPublicPath = path.resolve(__dirname, "../dist/public");

  if (process.env.NODE_ENV === "development") {
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    if (fs.existsSync(distPublicPath)) {
      app.use(express.static(distPublicPath));
      app.get("*", (_req, res) => {
        res.sendFile(path.join(distPublicPath, "index.html"));
      });
    }
  }

  const port = Number(process.env.PORT || 5000);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true
    },
    () => {
      console.log(`✅ Server running on port ${port}`);
    }
  );
})();

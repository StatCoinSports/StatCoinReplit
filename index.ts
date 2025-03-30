import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import os from "os";
import process from "process";
import path from "path";

// Create flag to track if auth has been set up already
let authSetupComplete = false;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static files from the 'public' directory
app.use(express.static(path.join(process.cwd(), 'public')));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Export the setupAppAuth function to be used by both index.ts and routes.ts
export function setupAppAuth() {
  if (authSetupComplete) {
    console.log("Auth already set up, skipping duplicate setup");
    return;
  }
  
  console.log("Setting up authentication...");
  setupAuth(app);
  authSetupComplete = true;
}

(async () => {
  // Setup authentication first
  setupAppAuth();
  
  // Add health check endpoint (after auth is set up)
  app.get('/api/health', (req: Request, res: Response) => {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    const freeMem = os.freemem() / 1024 / 1024; // MB
    const totalMem = os.totalmem() / 1024 / 1024; // MB
    
    const healthData = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: `${Math.floor(uptime / 60)} minutes, ${Math.floor(uptime % 60)} seconds`,
      system: {
        freeMem: `${Math.round(freeMem)} MB`,
        totalMem: `${Math.round(totalMem)} MB`,
        memoryUsage: `${Math.round((1 - (freeMem / totalMem)) * 100)}%`,
        heapUsage: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB / ${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
      },
      auth: req.isAuthenticated ? req.isAuthenticated() : 'auth not initialized',
      user: req.isAuthenticated && req.isAuthenticated() ? {
        id: req.user?.id,
        username: req.user?.username,
      } : null
    };

    res.json(healthData);
  });
  
  // Add diagnostic endpoint for debugging auth issues
  app.get('/api/diagnostic', (req: Request, res: Response) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        message: 'Diagnostic endpoint not available in production'
      });
    }
    
    res.json({
      session: {
        authenticated: req.isAuthenticated ? req.isAuthenticated() : 'auth not initialized',
        user: req.user ? {
          id: req.user.id,
          username: req.user.username
        } : null,
        sessionID: req.sessionID,
        cookie: req.session?.cookie
      },
      headers: {
        host: req.headers.host,
        'user-agent': req.headers['user-agent'],
        cookie: req.headers.cookie || 'none',
        accept: req.headers.accept,
        'content-type': req.headers['content-type']
      },
      storage: {
        status: storage ? 'available' : 'unavailable',
        authSetupComplete
      }
    });
  });

  // Routes are registered after auth is set up
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    
    console.error('Server error:', err);
    
    // Send response
    res.status(status).json({ 
      message,
      error: process.env.NODE_ENV !== 'production' ? err.stack : undefined
    });
    
    // Don't rethrow in production to prevent server crashes
    if (process.env.NODE_ENV !== 'production') {
      throw err;
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();

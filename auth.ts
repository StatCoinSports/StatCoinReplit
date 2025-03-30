import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  console.log("Setting up authentication...");
  
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "crypto-sports-secret-key",
    resave: true,
    saveUninitialized: true,
    store: storage.sessionStore,
    cookie: {
      // Only use secure cookies in production with HTTPS
      secure: process.env.NODE_ENV === 'production',
      // Ensure cookies work in various environments
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
      path: '/',
      httpOnly: true,
    },
    // Add a name to avoid conflicts
    name: 'crypto-sports-session'
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      console.log(`Passport authentication attempt for: ${username}`);
      try {
        const user = await storage.getUserByUsername(username);
        
        if (!user) {
          console.log(`Authentication failed: User ${username} not found`);
          return done(null, false, { message: 'Invalid username or password' });
        }
        
        const passwordMatch = await comparePasswords(password, user.password);
        if (!passwordMatch) {
          console.log(`Authentication failed: Invalid password for ${username}`);
          return done(null, false, { message: 'Invalid username or password' });
        }
        
        console.log(`Authentication successful for: ${username}`);
        return done(null, user);
      } catch (error) {
        console.error('Error during authentication:', error);
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => {
    console.log(`Serializing user: ${user.username} (ID: ${user.id})`);
    done(null, user.id);
  });
  
  passport.deserializeUser(async (id: number, done) => {
    console.log(`Deserializing user ID: ${id}`);
    try {
      const user = await storage.getUser(id);
      
      if (!user) {
        console.log(`Deserialization failed: User with ID ${id} not found`);
        return done(null, false);
      }
      
      console.log(`Deserialized user: ${user.username}`);
      done(null, user);
    } catch (error) {
      console.error('Error deserializing user:', error);
      done(error);
    }
  });

  // Support both /api/register and /api/auth/register for flexibility
  const registerHandler = async (req: Request, res: Response, next: NextFunction) => {
    console.log("Register handler called with data:", { 
      username: req.body.username,
      email: req.body.email 
    });
    
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        console.log("Registration failed: Username already exists", req.body.username);
        return res.status(400).json({ message: "Username already exists" });
      }

      console.log("Creating new user:", req.body.username);
      const user = await storage.createUser({
        ...req.body,
        password: await hashPassword(req.body.password),
      });
      console.log("User created with ID:", user.id);

      req.login(user, (err: any) => {
        if (err) {
          console.error("Login after registration failed:", err);
          return next(err);
        }
        console.log("User logged in after registration:", user.username);
        res.status(201).json({
          id: user.id,
          username: user.username,
          email: user.email,
        });
      });
    } catch (error) {
      console.error("Register error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  };
  app.post("/api/register", registerHandler);
  app.post("/api/auth/register", registerHandler);

  // Authentication endpoints
  const loginHandler = (req: Request, res: Response) => {
    console.log("Login successful for user:", req.user!.username);
    res.status(200).json({
      id: req.user!.id,
      username: req.user!.username,
      email: req.user!.email,
    });
  };
  
  // Custom middleware to log auth attempts
  const logAuthAttempt = (req: Request, res: Response, next: NextFunction) => {
    console.log(`Login attempt for username: ${req.body.username}`);
    next();
  };
  
  app.post("/api/login", logAuthAttempt, passport.authenticate("local", {
    failureMessage: true
  }), loginHandler);
  
  app.post("/api/auth/login", logAuthAttempt, passport.authenticate("local", {
    failureMessage: true
  }), loginHandler);

  // Logout endpoints
  const logoutHandler = (req: Request, res: Response, next: NextFunction) => {
    console.log("Logout attempt for user:", req.user?.username || "unknown");
    req.logout((err: any) => {
      if (err) {
        console.error("Logout error:", err);
        return next(err);
      }
      console.log("Logout successful");
      res.sendStatus(200);
    });
  };
  app.post("/api/logout", logoutHandler);
  app.post("/api/auth/logout", logoutHandler);

  // User information endpoints
  const userHandler = (req: Request, res: Response) => {
    console.log("User info request, authenticated:", req.isAuthenticated());
    if (!req.isAuthenticated()) {
      console.log("Unauthorized user info request");
      return res.sendStatus(401);
    }
    console.log("Returning user info for:", req.user!.username);
    res.json({
      id: req.user!.id,
      username: req.user!.username,
      email: req.user!.email,
    });
  };
  app.get("/api/user", userHandler);
  app.get("/api/auth/user", userHandler);
}
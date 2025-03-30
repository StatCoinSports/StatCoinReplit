import express, { type Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAppAuth } from "./index";
import { z } from "zod";
import path from "path";
import { 
  insertUserSchema, 
  insertTransactionSchema,
  insertPortfolioHistorySchema,
  insertAchievementSchema,
  insertUserAchievementSchema
} from "../shared/schema";

// Middleware to check if user is authenticated
const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Ensure authentication is set up (only once)
  setupAppAuth();

  // Add a simple health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Server is running!' });
  });
  
  // prefix all routes with /api
  const apiRouter = "/api";

  // Auth routes should use passport from auth.ts
  
  // User routes
  app.post(`${apiRouter}/auth/register-old`, async (req: Request, res: Response) => {
    try {
      const userInput = insertUserSchema.parse(req.body);
      const existingUser = await storage.getUserByUsername(userInput.username);
      
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }
      
      const user = await storage.createUser(userInput);
      res.status(201).json({ 
        id: user.id, 
        username: user.username,
        email: user.email
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.post(`${apiRouter}/auth/login-old`, async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }
      
      const user = await storage.getUserByUsername(username);
      
      if (!user || user.password !== password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      res.status(200).json({ 
        id: user.id, 
        username: user.username,
        email: user.email
      });
    } catch (error) {
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Player routes
  app.get(`${apiRouter}/players`, async (req: Request, res: Response) => {
    try {
      const sport = req.query.sport as string | undefined;
      const players = await storage.getPlayers(sport);
      res.status(200).json(players);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch players" });
    }
  });

  app.get(`${apiRouter}/players/:id`, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid player ID" });
      }
      
      const player = await storage.getPlayer(id);
      
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      
      res.status(200).json(player);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch player" });
    }
  });

  // Token transaction routes
  app.post(`${apiRouter}/transactions/buy`, async (req: Request, res: Response) => {
    try {
      const { userId, playerId, amount, price } = req.body;
      
      if (!userId || !playerId || !amount || !price) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      // Check if player exists
      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      
      // Check if user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Create or update token holding
      let holding = await storage.getTokenHolding(userId, playerId);
      if (holding) {
        holding = await storage.updateTokenHolding(holding.id, {
          amount: holding.amount + amount,
          purchasePrice: price
        });
      } else {
        holding = await storage.createTokenHolding({
          userId,
          playerId,
          amount,
          purchasePrice: price,
          isStaked: false
        });
      }
      
      // Record transaction
      const transaction = await storage.createTransaction({
        userId,
        playerId,
        type: "buy",
        amount,
        price
      });
      
      // Update portfolio history
      const portfolio = await storage.getUserPortfolio(userId);
      await storage.updatePortfolioHistory({
        userId,
        totalValue: portfolio.totalValue.toString() // Convert to string to match schema
      });
      
      res.status(201).json({ transaction, holding });
    } catch (error) {
      res.status(500).json({ message: "Failed to buy token" });
    }
  });

  app.post(`${apiRouter}/transactions/sell`, async (req: Request, res: Response) => {
    try {
      const { userId, playerId, amount, price } = req.body;
      
      if (!userId || !playerId || !amount || !price) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      // Check if holding exists and has enough tokens
      const holding = await storage.getTokenHolding(userId, playerId);
      if (!holding) {
        return res.status(404).json({ message: "You don't own this token" });
      }
      
      if (holding.amount < amount) {
        return res.status(400).json({ message: "Not enough tokens to sell" });
      }
      
      if (holding.isStaked) {
        return res.status(400).json({ message: "Cannot sell staked tokens" });
      }
      
      // Update holding
      const updatedHolding = await storage.updateTokenHolding(holding.id, {
        amount: holding.amount - amount
      });
      
      // Record transaction
      const transaction = await storage.createTransaction({
        userId,
        playerId,
        type: "sell",
        amount,
        price
      });
      
      // Update portfolio history
      const portfolio = await storage.getUserPortfolio(userId);
      await storage.updatePortfolioHistory({
        userId,
        totalValue: portfolio.totalValue.toString() // Convert to string to match schema
      });
      
      res.status(200).json({ transaction, holding: updatedHolding });
    } catch (error) {
      res.status(500).json({ message: "Failed to sell token" });
    }
  });

  app.post(`${apiRouter}/transactions/swap`, async (req: Request, res: Response) => {
    try {
      const { userId, fromPlayerId, toPlayerId, amount } = req.body;
      
      if (!userId || !fromPlayerId || !toPlayerId || !amount) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      // Check if from player holding exists and has enough tokens
      const fromHolding = await storage.getTokenHolding(userId, fromPlayerId);
      if (!fromHolding) {
        return res.status(404).json({ message: "You don't own the source token" });
      }
      
      if (fromHolding.amount < amount) {
        return res.status(400).json({ message: "Not enough tokens to swap" });
      }
      
      if (fromHolding.isStaked) {
        return res.status(400).json({ message: "Cannot swap staked tokens" });
      }
      
      // Get player prices
      const fromPlayer = await storage.getPlayer(fromPlayerId);
      const toPlayer = await storage.getPlayer(toPlayerId);
      
      if (!fromPlayer || !toPlayer) {
        return res.status(404).json({ message: "Player not found" });
      }
      
      // Calculate swap amount (simple 1:1 for now)
      const fromValue = Number(fromPlayer.tokenPrice) * amount;
      const toAmount = Math.floor(fromValue / Number(toPlayer.tokenPrice));
      
      if (toAmount <= 0) {
        return res.status(400).json({ message: "Swap amount too small" });
      }
      
      // Update from holding
      await storage.updateTokenHolding(fromHolding.id, {
        amount: fromHolding.amount - amount
      });
      
      // Create or update to holding
      let toHolding = await storage.getTokenHolding(userId, toPlayerId);
      if (toHolding) {
        toHolding = await storage.updateTokenHolding(toHolding.id, {
          amount: toHolding.amount + toAmount
        });
      } else {
        toHolding = await storage.createTokenHolding({
          userId,
          playerId: toPlayerId,
          amount: toAmount,
          purchasePrice: toPlayer.tokenPrice,
          isStaked: false
        });
      }
      
      // Record transaction
      const transaction = await storage.createTransaction({
        userId,
        playerId: toPlayerId,
        fromPlayerId,
        type: "swap",
        amount: toAmount,
        price: toPlayer.tokenPrice
      });
      
      // Update portfolio history
      const portfolio = await storage.getUserPortfolio(userId);
      await storage.updatePortfolioHistory({
        userId,
        totalValue: portfolio.totalValue.toString() // Convert to string to match schema
      });
      
      res.status(200).json({ 
        transaction, 
        fromHolding: { ...fromHolding, amount: fromHolding.amount - amount },
        toHolding
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to swap tokens" });
    }
  });

  // Staking routes
  app.get(`${apiRouter}/staking/plans`, async (req: Request, res: Response) => {
    try {
      const plans = await storage.getStakingPlans();
      res.status(200).json(plans);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch staking plans" });
    }
  });

  app.post(`${apiRouter}/staking/stake`, async (req: Request, res: Response) => {
    try {
      const { userId, playerId, amount, planId } = req.body;
      
      if (!userId || !playerId || !amount || !planId) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      try {
        const holding = await storage.stakeTokens(userId, playerId, amount, planId);
        
        // Record transaction
        const player = await storage.getPlayer(playerId);
        if (!player) {
          return res.status(404).json({ message: "Player not found" });
        }
        
        const transaction = await storage.createTransaction({
          userId,
          playerId,
          type: "stake",
          amount,
          price: player.tokenPrice
        });
        
        res.status(200).json({ holding, transaction });
      } catch (error) {
        if (error instanceof Error) {
          return res.status(400).json({ message: error.message });
        }
        throw error;
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to stake tokens" });
    }
  });

  app.post(`${apiRouter}/staking/unstake`, async (req: Request, res: Response) => {
    try {
      const { userId, playerId } = req.body;
      
      if (!userId || !playerId) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      try {
        const holding = await storage.unstakeTokens(userId, playerId);
        
        // Record transaction
        const player = await storage.getPlayer(playerId);
        if (!player) {
          return res.status(404).json({ message: "Player not found" });
        }
        
        const transaction = await storage.createTransaction({
          userId,
          playerId,
          type: "unstake",
          amount: holding.amount,
          price: player.tokenPrice
        });
        
        res.status(200).json({ holding, transaction });
      } catch (error) {
        if (error instanceof Error) {
          return res.status(400).json({ message: error.message });
        }
        throw error;
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to unstake tokens" });
    }
  });

  // Portfolio routes
  app.get(`${apiRouter}/portfolio/:userId`, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const portfolio = await storage.getUserPortfolio(userId);
      res.status(200).json(portfolio);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch portfolio" });
    }
  });

  // Token holdings routes
  app.get(`${apiRouter}/holdings/:userId`, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const holdings = await storage.getUserTokens(userId);
      res.status(200).json(holdings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch token holdings" });
    }
  });

  // Transaction history routes
  app.get(`${apiRouter}/transactions/:userId`, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const transactions = await storage.getUserTransactions(userId);
      res.status(200).json(transactions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });
  
  // Achievement routes
  app.get(`${apiRouter}/achievements`, async (_req: Request, res: Response) => {
    try {
      const achievements = await storage.getAchievements();
      res.status(200).json(achievements);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch achievements" });
    }
  });
  
  app.get(`${apiRouter}/achievements/:userId`, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const userAchievements = await storage.getUserAchievements(userId);
      res.status(200).json(userAchievements);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user achievements" });
    }
  });
  
  app.post(`${apiRouter}/achievements/:userId/check`, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Check and update achievements based on user's current status
      const updatedAchievements = await storage.checkAndUpdateAchievements(userId);
      
      // Return completed achievements that we just updated
      const newlyCompleted = updatedAchievements.filter(ua => 
        ua.completed && ua.completedAt && 
        new Date().getTime() - ua.completedAt.getTime() < 60000 // completed within the last minute
      );
      
      res.status(200).json({
        achievements: updatedAchievements,
        newlyCompleted
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to check achievements" });
    }
  });
  
  // Demo account creation for easy testing
  app.get(`${apiRouter}/demo/setup`, async (req: Request, res: Response) => {
    try {
      // Create demo user if doesn't exist
      let user = await storage.getUserByUsername("demo");
      if (!user) {
        user = await storage.createUser({
          username: "demo",
          password: "password",
          email: "demo@example.com"
        });
        
        // Add some initial holdings for the demo user
        const players = await storage.getPlayers();
        
        // Buy some tokens
        for (let i = 0; i < Math.min(4, players.length); i++) {
          const player = players[i];
          await storage.createTokenHolding({
            userId: user.id,
            playerId: player.id,
            amount: 1 + Math.floor(Math.random() * 3),
            purchasePrice: player.tokenPrice,
            isStaked: false
          });
          
          await storage.createTransaction({
            userId: user.id,
            playerId: player.id,
            type: "buy",
            amount: 1,
            price: player.tokenPrice
          });
        }
        
        // Stake one of the tokens
        if (players.length > 0) {
          const stakingPlans = await storage.getStakingPlans();
          if (stakingPlans.length > 0) {
            const holding = await storage.getTokenHolding(user.id, players[0].id);
            if (holding && holding.amount >= 2) {
              await storage.stakeTokens(user.id, players[0].id, 2, stakingPlans[0].id);
              
              await storage.createTransaction({
                userId: user.id,
                playerId: players[0].id,
                type: "stake",
                amount: 2,
                price: players[0].tokenPrice
              });
            }
          }
        }
        
        // Create portfolio history
        const portfolio = await storage.getUserPortfolio(user.id);
        await storage.updatePortfolioHistory({
          userId: user.id,
          totalValue: portfolio.totalValue.toString() // Convert to string to match schema
        });
        
        // Initialize achievements
        await storage.checkAndUpdateAchievements(user.id);
      }
      
      res.status(200).json({ 
        message: "Demo account ready", 
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        }
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to create demo account" });
    }
  });

  // Serve player images from public folder
  app.use('/public', express.static('public'));

  const httpServer = createServer(app);
  return httpServer;
}

import { 
  users, User, InsertUser,
  players, Player, InsertPlayer,
  tokenHoldings, TokenHolding, InsertTokenHolding,
  transactions, Transaction, InsertTransaction,
  portfolioHistory, PortfolioHistory, InsertPortfolioHistory,
  stakingPlans, StakingPlan, InsertStakingPlan,
  achievements, Achievement, InsertAchievement,
  userAchievements, UserAchievement, InsertUserAchievement,
  Portfolio, NBAPlayerStats, NFLPlayerStats
} from "@shared/schema";

// modify the interface with any CRUD methods
// you might need

import session from "express-session";
import createMemoryStore from "memorystore";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);
const MemoryStore = createMemoryStore(session);

export interface IStorage {
  // Session store
  sessionStore: session.Store;
  
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Player methods
  getPlayer(id: number): Promise<Player | undefined>;
  getPlayers(sport?: string): Promise<Player[]>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  updatePlayerPrice(id: number, newPrice: number, priceChange: number): Promise<Player>;
  
  // Token holdings methods
  getUserTokens(userId: number): Promise<(TokenHolding & { player: Player })[]>;
  getTokenHolding(userId: number, playerId: number): Promise<TokenHolding | undefined>;
  createTokenHolding(holding: InsertTokenHolding): Promise<TokenHolding>;
  updateTokenHolding(id: number, updates: Partial<TokenHolding>): Promise<TokenHolding>;
  
  // Transaction methods
  getUserTransactions(userId: number): Promise<(Transaction & { player: Player, fromPlayer?: Player })[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  
  // Portfolio methods
  getUserPortfolio(userId: number): Promise<Portfolio>;
  updatePortfolioHistory(history: InsertPortfolioHistory): Promise<PortfolioHistory>;
  
  // Staking methods
  getStakingPlans(): Promise<StakingPlan[]>;
  createStakingPlan(plan: InsertStakingPlan): Promise<StakingPlan>;
  stakeTokens(userId: number, playerId: number, amount: number, planId: number): Promise<TokenHolding>;
  unstakeTokens(userId: number, playerId: number): Promise<TokenHolding>;
  
  // Achievement methods
  getAchievements(): Promise<Achievement[]>;
  getAchievement(id: number): Promise<Achievement | undefined>;
  createAchievement(achievement: InsertAchievement): Promise<Achievement>;
  getUserAchievements(userId: number): Promise<(UserAchievement & { achievement: Achievement })[]>;
  updateUserAchievementProgress(userId: number, achievementId: number, progress: number): Promise<UserAchievement>;
  checkAndUpdateAchievements(userId: number): Promise<(UserAchievement & { achievement: Achievement })[]>;
}

export class MemStorage implements IStorage {
  public sessionStore: session.Store;
  private users: Map<number, User>;
  private players: Map<number, Player>;
  private tokenHoldings: Map<number, TokenHolding>;
  private transactions: Map<number, Transaction>;
  private portfolioHistory: Map<number, PortfolioHistory>;
  private stakingPlans: Map<number, StakingPlan>;
  private achievements: Map<number, Achievement>;
  private userAchievements: Map<number, UserAchievement>;
  
  private userIdCounter: number;
  private playerIdCounter: number;
  private tokenHoldingIdCounter: number;
  private transactionIdCounter: number;
  private portfolioHistoryIdCounter: number;
  private stakingPlanIdCounter: number;
  private achievementIdCounter: number;
  private userAchievementIdCounter: number;

  constructor() {
    // Initialize session store
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000, // prune expired entries every 24h
    });
    
    // Initialize data maps
    this.users = new Map();
    this.players = new Map();
    this.tokenHoldings = new Map();
    this.transactions = new Map();
    this.portfolioHistory = new Map();
    this.stakingPlans = new Map();
    this.achievements = new Map();
    this.userAchievements = new Map();
    
    this.userIdCounter = 1;
    this.playerIdCounter = 1;
    this.tokenHoldingIdCounter = 1;
    this.transactionIdCounter = 1;
    this.portfolioHistoryIdCounter = 1;
    this.stakingPlanIdCounter = 1;
    this.achievementIdCounter = 1;
    this.userAchievementIdCounter = 1;
    
    // Initialize with sample staking plans
    this.initStakingPlans();
    
    // Initialize with sample players
    this.initPlayers();
    
    // Initialize trading achievements
    this.initAchievements();
    
    // Initialize admin user
    this.initAdminUser();
  }
  
  private async initAdminUser() {
    // Check if admin user already exists
    const existingAdmin = await this.getUserByUsername("admin");
    if (!existingAdmin) {
      // Create admin user with hashed password
      const salt = randomBytes(16).toString("hex");
      const buf = await scryptAsync("password123", salt, 64) as Buffer;
      const hashedPassword = `${buf.toString("hex")}.${salt}`;
      
      const admin = await this.createUser({
        username: "admin",
        password: hashedPassword,
        email: "admin@example.com",
        balance: "200" // Set 200 Stat Coin balance as string
      });
      
      // Add 60 tokens of each player to the admin account
      const players = await this.getPlayers();
      for (const player of players) {
        await this.createTokenHolding({
          userId: admin.id,
          playerId: player.id,
          amount: 60,
          purchasePrice: player.tokenPrice
        });
      }
      
      console.log("Admin user created: username=admin, password=password123, 200 Stat Coin balance, 60 tokens of each player");
    }
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userIdCounter++;
    const user: User = { 
      ...insertUser, 
      id,
      walletAddress: insertUser.walletAddress || null,
      balance: insertUser.balance || null,
      createdAt: new Date()
    };
    this.users.set(id, user);
    return user;
  }
  
  // Player methods
  async getPlayer(id: number): Promise<Player | undefined> {
    return this.players.get(id);
  }
  
  async getPlayers(sport?: string): Promise<Player[]> {
    const players = Array.from(this.players.values());
    if (sport) {
      return players.filter(player => player.sport === sport);
    }
    return players;
  }
  
  async createPlayer(insertPlayer: InsertPlayer): Promise<Player> {
    const id = this.playerIdCounter++;
    // Ensure stats are properly cast to the correct type
    const player = { 
      ...insertPlayer, 
      id,
      imageUrl: insertPlayer.imageUrl || null,
      priceChange: insertPlayer.priceChange || null,
      // Explicitly cast stats to the correct type
      stats: insertPlayer.sport === 'NBA' 
        ? insertPlayer.stats as NBAPlayerStats 
        : insertPlayer.stats as NFLPlayerStats
    };
    this.players.set(id, player);
    return player;
  }
  
  async updatePlayerPrice(id: number, newPrice: number, priceChange: number): Promise<Player> {
    const player = await this.getPlayer(id);
    if (!player) {
      throw new Error(`Player with id ${id} not found`);
    }
    
    const updatedPlayer = { 
      ...player, 
      tokenPrice: String(newPrice),
      priceChange: String(priceChange)
    };
    this.players.set(id, updatedPlayer);
    return updatedPlayer;
  }
  
  // Token holdings methods
  async getUserTokens(userId: number): Promise<(TokenHolding & { player: Player })[]> {
    const holdings = Array.from(this.tokenHoldings.values())
      .filter(holding => holding.userId === userId);
      
    return Promise.all(holdings.map(async holding => {
      const player = await this.getPlayer(holding.playerId);
      if (!player) {
        throw new Error(`Player with id ${holding.playerId} not found`);
      }
      return { ...holding, player };
    }));
  }
  
  async getTokenHolding(userId: number, playerId: number): Promise<TokenHolding | undefined> {
    return Array.from(this.tokenHoldings.values()).find(
      holding => holding.userId === userId && holding.playerId === playerId
    );
  }
  
  async createTokenHolding(insertHolding: InsertTokenHolding): Promise<TokenHolding> {
    const id = this.tokenHoldingIdCounter++;
    const holding = { 
      ...insertHolding, 
      id,
      isStaked: insertHolding.isStaked || false,
      stakingPlan: insertHolding.stakingPlan || null,
      stakingStart: insertHolding.stakingStart || null,
      stakingEnd: insertHolding.stakingEnd || null 
    };
    this.tokenHoldings.set(id, holding);
    return holding;
  }
  
  async updateTokenHolding(id: number, updates: Partial<TokenHolding>): Promise<TokenHolding> {
    const holding = this.tokenHoldings.get(id);
    if (!holding) {
      throw new Error(`Token holding with id ${id} not found`);
    }
    
    const updatedHolding = { ...holding, ...updates };
    this.tokenHoldings.set(id, updatedHolding);
    return updatedHolding;
  }
  
  // Transaction methods
  async getUserTransactions(userId: number): Promise<(Transaction & { player: Player, fromPlayer?: Player })[]> {
    const userTransactions = Array.from(this.transactions.values())
      .filter(transaction => transaction.userId === userId)
      .sort((a, b) => {
        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        return bTime - aTime;
      });
      
    return Promise.all(userTransactions.map(async transaction => {
      const player = await this.getPlayer(transaction.playerId);
      if (!player) {
        throw new Error(`Player with id ${transaction.playerId} not found`);
      }
      
      let fromPlayer = undefined;
      if (transaction.fromPlayerId) {
        fromPlayer = await this.getPlayer(transaction.fromPlayerId);
      }
      
      return { ...transaction, player, fromPlayer };
    }));
  }
  
  async createTransaction(insertTransaction: InsertTransaction): Promise<Transaction> {
    const id = this.transactionIdCounter++;
    const transaction: Transaction = { 
      ...insertTransaction, 
      id,
      timestamp: new Date(),
      fromPlayerId: insertTransaction.fromPlayerId || null
    };
    this.transactions.set(id, transaction);
    return transaction;
  }
  
  // Portfolio methods
  async getUserPortfolio(userId: number): Promise<Portfolio> {
    const tokens = await this.getUserTokens(userId);
    const transactions = await this.getUserTransactions(userId);
    
    const portfolioHistoryEntries = Array.from(this.portfolioHistory.values())
      .filter(entry => entry.userId === userId)
      .sort((a, b) => {
        const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return aTime - bTime;
      });
    
    let totalValue = 0;
    let nbaTokens = 0;
    let nflTokens = 0;
    let stakedTokens = 0;
    
    tokens.forEach(token => {
      const tokenValue = Number(token.amount) * Number(token.player.tokenPrice);
      totalValue += tokenValue;
      
      if (token.player.sport === 'NBA') {
        nbaTokens += token.amount;
      } else if (token.player.sport === 'NFL') {
        nflTokens += token.amount;
      }
      
      if (token.isStaked) {
        stakedTokens += token.amount;
      }
    });
    
    return {
      totalValue,
      nbaTokens,
      nflTokens,
      stakedTokens,
      tokens,
      transactions,
      history: portfolioHistoryEntries
    };
  }
  
  async updatePortfolioHistory(insertHistory: InsertPortfolioHistory): Promise<PortfolioHistory> {
    const id = this.portfolioHistoryIdCounter++;
    const history: PortfolioHistory = { 
      ...insertHistory, 
      id,
      timestamp: new Date()
    };
    this.portfolioHistory.set(id, history);
    return history;
  }
  
  // Staking methods
  async getStakingPlans(): Promise<StakingPlan[]> {
    return Array.from(this.stakingPlans.values());
  }
  
  async createStakingPlan(insertPlan: InsertStakingPlan): Promise<StakingPlan> {
    const id = this.stakingPlanIdCounter++;
    const plan = { 
      ...insertPlan, 
      id,
      description: insertPlan.description || null,
      isPopular: insertPlan.isPopular || null 
    };
    this.stakingPlans.set(id, plan);
    return plan;
  }
  
  async stakeTokens(userId: number, playerId: number, amount: number, planId: number): Promise<TokenHolding> {
    const holding = await this.getTokenHolding(userId, playerId);
    if (!holding) {
      throw new Error(`Token holding not found for user ${userId} and player ${playerId}`);
    }
    
    const plan = this.stakingPlans.get(planId);
    if (!plan) {
      throw new Error(`Staking plan with id ${planId} not found`);
    }
    
    if (amount > holding.amount) {
      throw new Error(`Not enough tokens to stake. Required: ${amount}, Available: ${holding.amount}`);
    }
    
    if (amount < plan.minTokens) {
      throw new Error(`Minimum tokens required for this plan: ${plan.minTokens}`);
    }
    
    const stakingStart = new Date();
    const stakingEnd = new Date(stakingStart);
    stakingEnd.setDate(stakingEnd.getDate() + plan.lockPeriodDays);
    
    const updatedHolding = await this.updateTokenHolding(holding.id, {
      isStaked: true,
      stakingPlan: plan.name,
      stakingStart,
      stakingEnd
    });
    
    return updatedHolding;
  }
  
  async unstakeTokens(userId: number, playerId: number): Promise<TokenHolding> {
    const holding = await this.getTokenHolding(userId, playerId);
    if (!holding) {
      throw new Error(`Token holding not found for user ${userId} and player ${playerId}`);
    }
    
    if (!holding.isStaked) {
      throw new Error('These tokens are not currently staked');
    }
    
    // Check if staking period is over
    const now = new Date();
    if (holding.stakingEnd && now < holding.stakingEnd) {
      throw new Error('Staking period is not over yet. Early unstaking may result in penalties.');
    }
    
    const updatedHolding = await this.updateTokenHolding(holding.id, {
      isStaked: false,
      stakingPlan: undefined,
      stakingStart: undefined,
      stakingEnd: undefined
    });
    
    return updatedHolding;
  }
  
  // Achievement methods
  async getAchievements(): Promise<Achievement[]> {
    return Array.from(this.achievements.values());
  }
  
  async getAchievement(id: number): Promise<Achievement | undefined> {
    return this.achievements.get(id);
  }
  
  async createAchievement(insertAchievement: InsertAchievement): Promise<Achievement> {
    const id = this.achievementIdCounter++;
    const achievement = { 
      ...insertAchievement, 
      id,
      image: insertAchievement.image || null 
    };
    this.achievements.set(id, achievement);
    return achievement;
  }
  
  async getUserAchievements(userId: number): Promise<(UserAchievement & { achievement: Achievement })[]> {
    // Get all achievements
    const allAchievements = await this.getAchievements();
    
    // Get existing user achievements
    const existingUserAchievements = Array.from(this.userAchievements.values())
      .filter(ua => ua.userId === userId);
    
    // For achievements the user doesn't have yet, create entries with progress 0
    const userAchievementMap = new Map<number, UserAchievement>();
    
    // Add existing achievements to the map
    existingUserAchievements.forEach(ua => {
      userAchievementMap.set(ua.achievementId, ua);
    });
    
    // Create entries for missing achievements
    const missingAchievements = allAchievements.filter(a => !userAchievementMap.has(a.id));
    
    for (const achievement of missingAchievements) {
      const userAchievement: UserAchievement = {
        id: this.userAchievementIdCounter++,
        userId,
        achievementId: achievement.id,
        completed: false,
        progress: 0,
        completedAt: null,
        createdAt: new Date()
      };
      
      this.userAchievements.set(userAchievement.id, userAchievement);
      userAchievementMap.set(achievement.id, userAchievement);
    }
    
    // Join with achievement data
    return Array.from(userAchievementMap.values()).map(ua => {
      const achievement = this.achievements.get(ua.achievementId);
      if (!achievement) {
        throw new Error(`Achievement with id ${ua.achievementId} not found`);
      }
      return { ...ua, achievement };
    }).sort((a, b) => {
      // Sort by completed first, then by progress
      if (a.completed && !b.completed) return -1;
      if (!a.completed && b.completed) return 1;
      return b.progress - a.progress;
    });
  }
  
  async updateUserAchievementProgress(userId: number, achievementId: number, progress: number): Promise<UserAchievement> {
    // Find the user achievement
    const userAchievement = Array.from(this.userAchievements.values())
      .find(ua => ua.userId === userId && ua.achievementId === achievementId);
    
    if (!userAchievement) {
      // Create it if it doesn't exist
      const newUserAchievement: UserAchievement = {
        id: this.userAchievementIdCounter++,
        userId,
        achievementId,
        completed: false,
        progress,
        completedAt: null,
        createdAt: new Date()
      };
      
      // Get the achievement to check if it's completed
      const achievement = await this.getAchievement(achievementId);
      if (!achievement) {
        throw new Error(`Achievement with id ${achievementId} not found`);
      }
      
      // Check if the achievement is now completed
      if (progress >= achievement.requirementValue) {
        newUserAchievement.completed = true;
        newUserAchievement.completedAt = new Date();
      }
      
      this.userAchievements.set(newUserAchievement.id, newUserAchievement);
      return newUserAchievement;
    }
    
    // Update the existing user achievement
    const achievement = await this.getAchievement(achievementId);
    if (!achievement) {
      throw new Error(`Achievement with id ${achievementId} not found`);
    }
    
    // Only update if the new progress is higher
    if (progress > userAchievement.progress) {
      userAchievement.progress = progress;
      
      // Check if the achievement is now completed
      if (!userAchievement.completed && progress >= achievement.requirementValue) {
        userAchievement.completed = true;
        userAchievement.completedAt = new Date();
      }
      
      this.userAchievements.set(userAchievement.id, userAchievement);
    }
    
    return userAchievement;
  }
  
  async checkAndUpdateAchievements(userId: number): Promise<(UserAchievement & { achievement: Achievement })[]> {
    // Get user's transactions, holdings, and portfolio
    const transactions = await this.getUserTransactions(userId);
    const holdings = await this.getUserTokens(userId);
    const portfolio = await this.getUserPortfolio(userId);
    
    // Get all achievements
    const achievements = await this.getAchievements();
    
    // Track achievements we need to update
    const updatedAchievements: UserAchievement[] = [];
    
    for (const achievement of achievements) {
      let progress = 0;
      
      // Calculate progress based on achievement type
      switch (achievement.requirement) {
        case 'total_transactions':
          progress = transactions.length;
          break;
        case 'total_buys':
          progress = transactions.filter(t => t.type === 'buy').length;
          break;
        case 'total_sells':
          progress = transactions.filter(t => t.type === 'sell').length;
          break;
        case 'total_swaps':
          progress = transactions.filter(t => t.type === 'swap').length;
          break;
        case 'total_value':
          progress = Math.floor(portfolio.totalValue);
          break;
        case 'different_players':
          progress = new Set(holdings.map(h => h.playerId)).size;
          break;
        case 'nba_players':
          progress = holdings.filter(h => h.player.sport === 'NBA').length;
          break;
        case 'nfl_players':
          progress = holdings.filter(h => h.player.sport === 'NFL').length;
          break;
        case 'staked_tokens':
          progress = holdings.filter(h => h.isStaked).length;
          break;
        default:
          continue;
      }
      
      // Update the achievement progress
      const userAchievement = await this.updateUserAchievementProgress(userId, achievement.id, progress);
      updatedAchievements.push(userAchievement);
    }
    
    // Return the updated achievements with their details
    return updatedAchievements.map(ua => {
      const achievement = this.achievements.get(ua.achievementId);
      if (!achievement) {
        throw new Error(`Achievement with id ${ua.achievementId} not found`);
      }
      return { ...ua, achievement };
    });
  }
  
  // Initialize with sample trading achievements
  private initAchievements() {
    // Trading volume achievements
    this.createAchievement({
      name: "First Trade",
      description: "Complete your first token transaction",
      image: "badge_first_trade.svg",
      requirement: "total_transactions",
      requirementValue: 1,
      rewardAmount: 50,
      category: "trade"
    });
    
    this.createAchievement({
      name: "Trading Novice",
      description: "Complete 5 token transactions",
      image: "badge_trading_novice.svg",
      requirement: "total_transactions",
      requirementValue: 5,
      rewardAmount: 100,
      category: "trade"
    });
    
    this.createAchievement({
      name: "Trading Enthusiast",
      description: "Complete 25 token transactions",
      image: "badge_trading_enthusiast.svg",
      requirement: "total_transactions",
      requirementValue: 25,
      rewardAmount: 250,
      category: "trade"
    });
    
    this.createAchievement({
      name: "Trading Expert",
      description: "Complete 100 token transactions",
      image: "badge_trading_expert.svg",
      requirement: "total_transactions",
      requirementValue: 100,
      rewardAmount: 500,
      category: "trade"
    });
    
    // Portfolio value achievements
    this.createAchievement({
      name: "Portfolio Starter",
      description: "Reach a portfolio value of $1,000",
      image: "badge_portfolio_starter.svg",
      requirement: "total_value",
      requirementValue: 1000,
      rewardAmount: 100,
      category: "portfolio"
    });
    
    this.createAchievement({
      name: "Portfolio Builder",
      description: "Reach a portfolio value of $5,000",
      image: "badge_portfolio_builder.svg",
      requirement: "total_value",
      requirementValue: 5000,
      rewardAmount: 250,
      category: "portfolio"
    });
    
    this.createAchievement({
      name: "Portfolio Manager",
      description: "Reach a portfolio value of $10,000",
      image: "badge_portfolio_manager.svg",
      requirement: "total_value",
      requirementValue: 10000,
      rewardAmount: 500,
      category: "portfolio"
    });
    
    // Diversity achievements
    this.createAchievement({
      name: "Diversifier",
      description: "Own tokens from 5 different players",
      image: "badge_diversifier.svg",
      requirement: "different_players",
      requirementValue: 5,
      rewardAmount: 150,
      category: "diversity"
    });
    
    this.createAchievement({
      name: "NBA Enthusiast",
      description: "Own tokens from 3 NBA players",
      image: "badge_nba_enthusiast.svg",
      requirement: "nba_players",
      requirementValue: 3,
      rewardAmount: 100,
      category: "sport"
    });
    
    this.createAchievement({
      name: "NFL Fan",
      description: "Own tokens from 3 NFL players",
      image: "badge_nfl_fan.svg",
      requirement: "nfl_players",
      requirementValue: 3,
      rewardAmount: 100,
      category: "sport"
    });
    
    // Staking achievements
    this.createAchievement({
      name: "Staking Beginner",
      description: "Stake your first player token",
      image: "badge_staking_beginner.svg",
      requirement: "staked_tokens",
      requirementValue: 1,
      rewardAmount: 75,
      category: "staking"
    });
    
    this.createAchievement({
      name: "Staking Enthusiast",
      description: "Stake tokens from 3 different players",
      image: "badge_staking_enthusiast.svg",
      requirement: "staked_tokens",
      requirementValue: 3,
      rewardAmount: 200,
      category: "staking"
    });
  }
  
  // Initialize with sample staking plans
  private initStakingPlans() {
    this.createStakingPlan({
      name: 'Rookie Stake',
      apy: '5',
      lockPeriodDays: 30,
      minTokens: 2,
      description: 'Entry-level staking plan with 5% APY',
      isPopular: false
    });
    
    this.createStakingPlan({
      name: 'All-Star Stake',
      apy: '8',
      lockPeriodDays: 90,
      minTokens: 5,
      description: 'Mid-level staking plan with 8% APY',
      isPopular: true
    });
    
    this.createStakingPlan({
      name: 'MVP Stake',
      apy: '12',
      lockPeriodDays: 180,
      minTokens: 10,
      description: 'Premium staking plan with 12% APY',
      isPopular: false
    });
  }
  
  // Initialize with sample players
  private initPlayers() {
    // NBA Players
    this.createPlayer({
      name: 'LeBron James',
      team: 'Los Angeles Lakers',
      sport: 'NBA',
      position: 'SF',
      imageUrl: '/players/nba/lebron-james.jpeg',
      stats: {
        ppg: 27.5,
        rpg: 8.3,
        apg: 10.2,
        fg_pct: 51.2,
        three_pct: 36.7
      } as NBAPlayerStats,
      tokenPrice: '2.65',
      priceChange: '0.15',
      totalSupply: 1000,
      availableSupply: 850
    });
    
    this.createPlayer({
      name: 'Stephen Curry',
      team: 'Golden State Warriors',
      sport: 'NBA',
      position: 'PG',
      imageUrl: '/players/nba/stephen-curry-new.png',
      stats: {
        ppg: 32.0,
        rpg: 5.2,
        apg: 6.3,
        fg_pct: 48.3,
        three_pct: 43.7
      } as NBAPlayerStats,
      tokenPrice: '2.98',
      priceChange: '0.21',
      totalSupply: 1000,
      availableSupply: 800
    });
    
    this.createPlayer({
      name: 'Giannis Antetokounmpo',
      team: 'Milwaukee Bucks',
      sport: 'NBA',
      position: 'PF',
      imageUrl: '/players/nba/giannis-antetokounmpo.webp',
      stats: {
        ppg: 29.2,
        rpg: 11.6,
        apg: 5.8,
        fg_pct: 58.0,
        three_pct: 30.1
      } as NBAPlayerStats,
      tokenPrice: "2.75",
      priceChange: "0.12",
      totalSupply: 1000,
      availableSupply: 820
    });
    
    this.createPlayer({
      name: 'Nikola Jokic',
      team: 'Denver Nuggets',
      sport: 'NBA',
      position: 'C',
      imageUrl: '/players/nba/nikola-jokic.webp',
      stats: {
        ppg: 26.8,
        rpg: 12.1,
        apg: 8.7,
        fg_pct: 57.5,
        three_pct: 38.2
      } as NBAPlayerStats,
      tokenPrice: "2.89",
      priceChange: "0.18",
      totalSupply: 1000,
      availableSupply: 840
    });
    
    // NFL Players
    this.createPlayer({
      name: 'Patrick Mahomes',
      team: 'Kansas City Chiefs',
      sport: 'NFL',
      position: 'QB',
      imageUrl: '/players/nfl/patrick-mahomes.png',
      stats: {
        pass_yds: 5250,
        pass_tds: 41,
        qbr: 78.5,
        rush_yds: 358
      } as NFLPlayerStats,
      tokenPrice: "2.55",
      priceChange: "-0.08",
      totalSupply: 1000,
      availableSupply: 900
    });
    
    this.createPlayer({
      name: 'Travis Kelce',
      team: 'Kansas City Chiefs',
      sport: 'NFL',
      position: 'TE',
      imageUrl: '/players/nfl/travis-kelce-new.jpeg',
      stats: {
        rec: 92,
        rec_yds: 1125,
        rec_tds: 12,
        yds: 1125
      } as NFLPlayerStats,
      tokenPrice: "2.25",
      priceChange: "0.45",
      totalSupply: 1000,
      availableSupply: 850
    });
    
    this.createPlayer({
      name: 'Josh Allen',
      team: 'Buffalo Bills',
      sport: 'NFL',
      position: 'QB',
      imageUrl: '/players/nfl/josh-allen.jpeg',
      stats: {
        pass_yds: 4544,
        pass_tds: 37,
        qbr: 75.3,
        rush_yds: 762,
        rush_tds: 7
      } as NFLPlayerStats,
      tokenPrice: "2.42",
      priceChange: "0.12",
      totalSupply: 1000,
      availableSupply: 880
    });
    
    this.createPlayer({
      name: 'JJ Watt',
      team: 'Houston Texans',
      sport: 'NFL',
      position: 'DE',
      imageUrl: '/players/nfl/jj-watt.webp',
      stats: {
        tackles: 64,
        sacks: 18,
        ints: 1
      } as NFLPlayerStats,
      tokenPrice: "1.95",
      priceChange: "-0.05",
      totalSupply: 1000,
      availableSupply: 920
    });
    
    // Extra NBA players
    this.createPlayer({
      name: 'Luka Doncic',
      team: 'Los Angeles Lakers',
      sport: 'NBA',
      position: 'PG',
      imageUrl: '/players/nba/luka-doncic-lakers.jpeg',
      stats: {
        ppg: 32.4,
        rpg: 8.6,
        apg: 9.1,
        fg_pct: 49.8,
        three_pct: 38.2
      } as NBAPlayerStats,
      tokenPrice: "2.95",
      priceChange: "0.48",
      totalSupply: 1000,
      availableSupply: 810
    });
    
    this.createPlayer({
      name: 'Ja Morant',
      team: 'Memphis Grizzlies',
      sport: 'NBA',
      position: 'PG',
      imageUrl: '/players/nba/ja-morant-new.jpeg',
      stats: {
        ppg: 26.2,
        rpg: 5.9,
        apg: 8.1,
        fg_pct: 47.5,
        three_pct: 30.7
      } as NBAPlayerStats,
      tokenPrice: "2.70",
      priceChange: "-0.15",
      totalSupply: 1000,
      availableSupply: 845
    });
    
    this.createPlayer({
      name: 'Kevin Durant',
      team: 'Phoenix Suns',
      sport: 'NBA',
      position: 'SF',
      imageUrl: '/players/nba/kevin-durant.webp',
      stats: {
        ppg: 28.5,
        rpg: 7.2,
        apg: 4.8,
        fg_pct: 53.2,
        three_pct: 41.5
      } as NBAPlayerStats,
      tokenPrice: "2.82",
      priceChange: "0.16",
      totalSupply: 1000,
      availableSupply: 830
    });
  }
}

export const storage = new MemStorage();

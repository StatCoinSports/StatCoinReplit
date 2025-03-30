import { pgTable, text, serial, integer, numeric, boolean, timestamp, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User schema
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull(),
  walletAddress: text("wallet_address"),
  balance: numeric("balance", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

// Player schema
export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  team: text("team").notNull(),
  sport: text("sport").notNull(), // NBA or NFL
  position: text("position").notNull(),
  imageUrl: text("image_url"),
  stats: json("stats").notNull().$type<PlayerStats>(),
  tokenPrice: numeric("token_price").notNull(),
  priceChange: numeric("price_change"), // Percentage change
  totalSupply: integer("total_supply").notNull(),
  availableSupply: integer("available_supply").notNull(),
});

export const insertPlayerSchema = createInsertSchema(players).omit({
  id: true,
});

// Token Holdings schema
export const tokenHoldings = pgTable("token_holdings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  playerId: integer("player_id").notNull().references(() => players.id),
  amount: integer("amount").notNull(),
  purchasePrice: numeric("purchase_price").notNull(),
  isStaked: boolean("is_staked").default(false),
  stakingPlan: text("staking_plan"),
  stakingStart: timestamp("staking_start"),
  stakingEnd: timestamp("staking_end"),
});

export const insertTokenHoldingSchema = createInsertSchema(tokenHoldings).omit({
  id: true,
});

// Transactions schema
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  playerId: integer("player_id").notNull().references(() => players.id),
  type: text("type").notNull(), // "buy", "sell", "swap", "stake", "unstake"
  amount: integer("amount").notNull(),
  price: numeric("price").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
  fromPlayerId: integer("from_player_id").references(() => players.id), // For swaps
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  timestamp: true,
});

// Portfolio Value History
export const portfolioHistory = pgTable("portfolio_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  totalValue: numeric("total_value").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const insertPortfolioHistorySchema = createInsertSchema(portfolioHistory).omit({
  id: true,
  timestamp: true,
});

// Staking Plans
export const stakingPlans = pgTable("staking_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  apy: numeric("apy").notNull(),
  lockPeriodDays: integer("lock_period_days").notNull(),
  minTokens: integer("min_tokens").notNull(),
  description: text("description"),
  isPopular: boolean("is_popular").default(false),
});

export const insertStakingPlanSchema = createInsertSchema(stakingPlans).omit({
  id: true,
});

// Type definitions
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Player = typeof players.$inferSelect;
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;

export type TokenHolding = typeof tokenHoldings.$inferSelect;
export type InsertTokenHolding = z.infer<typeof insertTokenHoldingSchema>;

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;

export type PortfolioHistory = typeof portfolioHistory.$inferSelect;
export type InsertPortfolioHistory = z.infer<typeof insertPortfolioHistorySchema>;

export type StakingPlan = typeof stakingPlans.$inferSelect;
export type InsertStakingPlan = z.infer<typeof insertStakingPlanSchema>;

// Player stats type definitions for the stats JSON column
export type NBAPlayerStats = {
  ppg: number; // points per game
  rpg: number; // rebounds per game
  apg: number; // assists per game
  fg_pct?: number; // field goal percentage
  three_pct?: number; // 3-point percentage
  ft_pct?: number; // free throw percentage
  spg?: number; // steals per game
  bpg?: number; // blocks per game
};

export type NFLPlayerStats = {
  pass_yds?: number; // passing yards
  pass_tds?: number; // passing touchdowns
  rush_yds?: number; // rushing yards
  rush_tds?: number; // rushing touchdowns
  rec?: number; // receptions
  rec_yds?: number; // receiving yards
  rec_tds?: number; // receiving touchdowns
  tackles?: number; // tackles
  sacks?: number; // sacks
  ints?: number; // interceptions
  qbr?: number; // quarterback rating
  yds?: number; // total yards
  tds?: number; // total touchdowns
};

export type PlayerStats = NBAPlayerStats | NFLPlayerStats;

// Portfolios don't need a separate table
// Achievement schema
export const achievements = pgTable("achievements", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  image: text("image"),
  requirement: text("requirement").notNull(),
  requirementValue: integer("requirement_value").notNull(),
  rewardAmount: integer("reward_amount").notNull(),
  category: text("category").notNull(), // trade, portfolio, staking, etc.
});

export const insertAchievementSchema = createInsertSchema(achievements).omit({
  id: true,
});

// User Achievement schema (junction table)
export const userAchievements = pgTable("user_achievements", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  achievementId: integer("achievement_id").notNull().references(() => achievements.id),
  completed: boolean("completed").notNull().default(false),
  progress: integer("progress").notNull().default(0),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserAchievementSchema = createInsertSchema(userAchievements).omit({
  id: true,
  createdAt: true,
});

export type Portfolio = {
  totalValue: number;
  nbaTokens: number;
  nflTokens: number;
  stakedTokens: number;
  tokens: (TokenHolding & { player: Player })[];
  transactions: (Transaction & { player: Player, fromPlayer?: Player })[];
  history: PortfolioHistory[];
};

export type Achievement = typeof achievements.$inferSelect;
export type InsertAchievement = z.infer<typeof insertAchievementSchema>;

export type UserAchievement = typeof userAchievements.$inferSelect;
export type InsertUserAchievement = z.infer<typeof insertUserAchievementSchema>;

# Crypto Sports Center

A decentralized blockchain-powered marketplace for NFL and NBA player token trading, enabling comprehensive digital asset exchanges and investment strategies.

## Key Features

- Buy, sell, and swap player tokens using Stat Coin
- Real-time sports token analytics
- Staking functionality with various reward plans
- Achievement system with badges and progress tracking
- Secure authentication system
- Portfolio management with detailed transaction history

## Technology Stack

- Frontend: React with TypeScript
- Backend: Node.js with Express
- State Management: TanStack Query
- UI Components: Shadcn/UI with Tailwind CSS
- Authentication: Passport.js with session management
- Storage: In-memory database (with Drizzle ORM schema)

## Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Start the development server: `npm run dev`
4. Navigate to `http://localhost:5000`

## GitHub Integration

### Setting Up GitHub Repository

1. Create a new GitHub repository
2. Add the following secrets in your GitHub repository settings:
   - `REPLIT_APP_URL`: The URL of your Replit app (e.g., https://crypto-sports-center.yourusername.repl.co)
   - `GITHUB_TOKEN`: GitHub automatically provides this secret for workflow actions

### Pushing from Replit to GitHub

```bash
# Initialize git (already done)
git init

# Add your GitHub repository as a remote
git remote add origin https://github.com/yourusername/crypto-sports-center.git

# Add changes and commit
git add .
git commit -m "Initial commit"

# Push to GitHub
git push -u origin main
```

### Pull Changes from GitHub to Replit

```bash
# Fetch and pull latest changes
git fetch
git pull origin main
```

## License

[MIT License](LICENSE)
# SplitEasy - Expense Splitting App

A modern, offline-first expense splitting application built with vanilla JavaScript and Supabase.

## 🚀 Quick Start

### Prerequisites
- Node.js (optional, for environment variable support)
- Python 3 (for local server)

### Option 1: Using Environment Variables (Recommended)

1. **Copy the example environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` and add your Supabase credentials:**
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key-here
   ```

3. **Generate config.js from environment variables:**
   ```bash
   npm run generate-config
   # or
   node scripts/generate-config.js
   ```

4. **Start the local server:**
   ```bash
   python -m http.server 8000
   ```
   Or use the npm script:
   ```bash
   npm run dev
   ```

5. Open: http://localhost:8000

### Option 2: Manual Config (Quick Start)

1. Create `js/config.js` with your Supabase credentials:
   ```javascript
   window.SUPABASECONFIG = {
       url: 'https://your-project.supabase.co',
       anonKey: 'your-anon-key-here'
   };
   ```
3. Start a local server:
   ```bash
   python -m http.server 8000
   ```
4. Open: http://localhost:8000

### Option 3: VS Code
1. Install "Live Server" extension
2. Right-click `index.html` → "Open with Live Server"

## ⚠️ Important

**Do NOT** just double-click `index.html` - you need a local web server because:
- Service Workers require `localhost` (not `file://`)
- CORS restrictions for Supabase
- Better localStorage support

## 📋 Features

- ✅ Create groups and split expenses
- ✅ Real-time balance calculations
- ✅ Supabase cloud sync (required)
- ✅ Progressive Web App (PWA)
- ✅ Mobile-optimized UI

## 🔧 Configuration

### Local Development

**Using Environment Variables (Recommended):**
1. Create `.env` file from `.env.example`
2. Add your Supabase credentials
3. Run `npm run generate-config` to generate `js/config.js`

**Manual Configuration:**
1. Create `js/config.js` with your Supabase credentials (see Option 2 above)

### GitHub Pages Deployment

The app uses GitHub Actions to automatically inject environment variables during deployment.

1. **Set up GitHub Secrets:**
   - Go to your repository → Settings → Secrets and variables → Actions
   - Add these secrets:
     - `SUPABASE_URL`: Your Supabase project URL
     - `SUPABASE_ANON_KEY`: Your Supabase anon key

2. **Push to main branch:**
   - The GitHub Action will automatically:
     - Generate `js/config.js` from secrets
     - Deploy to GitHub Pages

**Note:** `js/config.js` is gitignored and will be generated during deployment.

## 📁 Project Structure

- `index.html` - Main page
- `group-detail.html` - Group details
- `js/shared-utils.js` - Optimized utilities
- `js/shared-supabase.js` - Supabase config
- `js/shared-sync.js` - Database sync
- `css/style.css` - All styles
- `sw.js` - Service Worker
- `.env.example` - Environment variables template
- `scripts/generate-config.js` - Config generator script
- `.github/workflows/deploy.yml` - GitHub Actions deployment

## 🔐 Security

- `js/config.js` is gitignored (generated from environment variables)
- `.env` is gitignored (local development only)
- GitHub Secrets are used for production deployment
- Never commit sensitive credentials to the repository

## 🎯 Recent Updates

- ✅ Supabase-based architecture (no offline mode)
- ✅ Environment variable support
- ✅ GitHub Actions deployment
- ✅ Improved error handling and logging

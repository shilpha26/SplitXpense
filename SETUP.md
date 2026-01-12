# Setup Guide - Environment Variables

## Quick Setup

### Step 1: Create .env file

Create a `.env` file in the root directory with your Supabase credentials:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

### Step 2: Generate config.js

**Option A: Using npm (if you have Node.js installed)**
```bash
npm install
npm run generate-config
```

**Option B: Using Node.js directly**
```bash
node scripts/generate-config.js
```

**Option C: Manual (if you don't have Node.js)**
1. Create `js/config.js` with this content:
   ```javascript
   if (typeof window !== 'undefined' && (typeof window.SUPABASECONFIG === 'undefined' || window.SUPABASECONFIG === null)) {
       window.SUPABASECONFIG = {
           url: 'YOUR_SUPABASE_URL',
           anonKey: 'YOUR_SUPABASE_ANON_KEY'
       };
   }
   ```
2. Replace the placeholder values with your actual credentials

### Step 3: Start the server

```bash
python -m http.server 8000
```

Then open: http://localhost:8000

## For GitHub Pages Deployment

1. Go to your repository → **Settings** → **Secrets and variables** → **Actions**
2. Add these secrets:
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_ANON_KEY`: Your Supabase anon key
3. Push to the `main` branch
4. GitHub Actions will automatically generate `config.js` and deploy

## Environment Variables

- `SUPABASE_URL`: Your Supabase project URL (e.g., `https://xxxxx.supabase.co`)
- `SUPABASE_ANON_KEY`: Your Supabase anonymous/public key

You can find these in your Supabase dashboard under **Settings** → **API**.


# Quick Start Guide

## Step 1: Get Your API Keys

### Firebase Setup (5 minutes)

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Create Project"
3. Name it "email-tool", accept defaults
4. In left sidebar, click **Build → Realtime Database**
5. Click "Create Database"
6. Select region closest to you
7. Start in **Test Mode**
8. Go to **Project Settings** (gear icon, top left)
9. Click **Service Accounts** tab
10. Click **Generate New Private Key**
11. A JSON file downloads
12. Copy these values to `.env.local`:
    - `apiKey` → NEXT_PUBLIC_FIREBASE_API_KEY
    - `authDomain` → NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
    - `projectId` → NEXT_PUBLIC_FIREBASE_PROJECT_ID
    - `storageBucket` → NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    - `messagingSenderId` → NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
    - `appId` → NEXT_PUBLIC_FIREBASE_APP_ID
    - `databaseURL` → NEXT_PUBLIC_FIREBASE_DATABASE_URL

### Resend Setup (3 minutes)

1. Go to [Resend](https://resend.com) and sign up
2. Go to **API Keys** section
3. Create new API key
4. Copy the key to `.env.local` as `RESEND_API_KEY`

## Step 2: Configure Environment

Create `.env.local` in the project root:

```bash
# Copy from Firebase service account JSON
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyD...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=email-tool-abc123.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=email-tool-abc123
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=email-tool-abc123.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcd1234efgh5678
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://email-tool-abc123.firebaseio.com

# From Resend
RESEND_API_KEY=re_abc123def456ghi789jkl

# Optional (can override in app)
FROM_EMAIL=noreply@rccglp20youths.com
FROM_NAME=Email Tool
```

## Step 3: Install & Run

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open in browser
# http://localhost:3000
```

## Step 4: First Email

1. Click **📥 Import** tab
2. Create a test Excel file with columns:
   - `name` - e.g., "John Doe"
   - `email` - e.g., "john@example.com"
3. Drag & drop the file
4. Go to **✏️ Compose** tab
5. Write a test email:
   - Subject: `Welcome {{name}}!`
   - Body: `Hi {{name}}, thanks for joining!`
6. Click **👁 Preview** to see how it'll look
7. Go to **🚀 Send** tab
8. Click **Send** button
9. Watch the log for results

## Troubleshooting

### "Cannot read properties of undefined"
→ Missing `.env.local` - create it with credentials

### "Firebase connection refused"
→ Check NEXT_PUBLIC_FIREBASE_DATABASE_URL is correct
→ Database URL must end with `.firebaseio.com`

### "Resend API error"
→ Verify RESEND_API_KEY starts with `re_`
→ Check it's been copied correctly (no extra spaces)

### "Email preview shows undefined"
→ Normal if no contacts selected yet. Import contacts first.

### "Import not finding email column"
→ Make sure column header is one of: `email`, `Email`, `EMAIL`, or `e-mail`

## Next Steps

- Customize email templates in `/lib/emailTemplates.ts`
- Add more template types (welcome, reminder, etc.)
- Deploy to Vercel for production
- Add user authentication if needed

## Production Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Go to [Vercel](https://vercel.com)
3. Import project from GitHub
4. Add environment variables
5. Deploy (auto-redeploys on push)

### Environment on Vercel

Add same `.env.local` values as environment variables in Vercel project settings.

## Support

Check the README.md for:
- Full API documentation
- Project structure
- Custom template guide
- Docker deployment

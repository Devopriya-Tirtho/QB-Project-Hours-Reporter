# QuickBooks Project Hours Reporter

This is a full-stack application that connects to QuickBooks Online, fetches time activities for projects, and generates PDF and CSV reports which are then emailed to recipients.

## Setup Instructions

### 1. Configure Intuit Developer App
1. Go to the [Intuit Developer Portal](https://developer.intuit.com/).
2. Create a new app (select "QuickBooks Online and Payments").
3. Go to **Keys & OAuth** in your app settings.
4. Add the following Redirect URI:
   - Development: `http://localhost:3000/api/qb/callback`
   - Production: `<YOUR_APP_URL>/api/qb/callback`
5. Copy your **Client ID** and **Client Secret**.

### 2. Environment Variables
Add the following secrets to your AI Studio environment (or `.env` file locally):

```env
QUICKBOOKS_CLIENT_ID="your_client_id"
QUICKBOOKS_CLIENT_SECRET="your_client_secret"
QUICKBOOKS_REDIRECT_URI="https://your-app-url.run.app/api/qb/callback"
QUICKBOOKS_ENVIRONMENT="sandbox" # or "production"

# Email Configuration (SMTP)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your_email@gmail.com"
SMTP_PASS="your_app_password"
FROM_EMAIL="your_email@gmail.com"
```

### 3. Usage
1. Open the app.
2. Click **Connect QuickBooks** and complete the OAuth flow.
3. Search for a project/customer.
4. Select a date range.
5. Enter the recipient email address.
6. Click **Generate and Send Report**.

### 4. Deploy to Vercel

This app is fully configured for deployment on Vercel using Serverless Functions.

**Deployment Steps:**
1. Push your code to a GitHub repository.
2. Import the repository into Vercel.
3. Vercel will automatically detect the Vite frontend and configure the build settings.
4. Add the following **Environment Variables** in your Vercel project settings before deploying:
   - `QUICKBOOKS_CLIENT_ID`
   - `QUICKBOOKS_CLIENT_SECRET`
   - `QUICKBOOKS_ENVIRONMENT` (e.g., `production` or `sandbox`)
   - `FIREBASE_PROJECT_ID` (from your Firebase project settings)
   - `FIREBASE_CLIENT_EMAIL` (from your Firebase service account)
   - `FIREBASE_PRIVATE_KEY` (from your Firebase service account, ensure you include `\n` for newlines)
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL` (if using email features)
   
   *Note: You do NOT need to set `QUICKBOOKS_REDIRECT_URI` or `APP_URL` on Vercel. The app automatically uses the `VERCEL_URL` environment variable to construct the correct callback URL (e.g., `https://your-app.vercel.app/api/qb/callback`).*

5. **QuickBooks Setup:** Once deployed, copy your Vercel domain (e.g., `https://your-app.vercel.app/api/qb/callback`) and add it as a valid Redirect URI in your Intuit Developer Dashboard.
6. **Firebase Setup:** The app uses the Firebase Admin SDK on the server side to securely store QuickBooks tokens. Ensure your Firebase Service Account credentials are correct. No client-side Firebase configuration is required, and end-users do not need to log in to Firebase.

**Known Limitations:**
- Vercel Serverless Functions have a 10-second execution limit on the free tier (Hobby). If your QuickBooks project has a massive amount of time entries, the report generation might time out. The app includes a 15-second timeout on QuickBooks API calls to fail gracefully.

### 5. Features
- **OAuth 2.0**: Securely connects to QuickBooks and automatically refreshes tokens.
- **Reporting**: Generates PDF summaries and CSV detailed line items.
- **Email**: Automatically emails the generated reports.
- **AI Assistant**: Use natural language to fill out the report form.
- **History**: Keeps a log of all generated reports.

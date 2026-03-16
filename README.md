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

### 4. Features
- **OAuth 2.0**: Securely connects to QuickBooks and automatically refreshes tokens.
- **Reporting**: Generates PDF summaries and CSV detailed line items.
- **Email**: Automatically emails the generated reports.
- **AI Assistant**: Use natural language to fill out the report form.
- **History**: Keeps a log of all generated reports.

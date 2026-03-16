import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from './db.js';
import {
  getAuthUri,
  handleCallback,
  getAllProjects,
  getEmployeesAndVendors,
  fetchTimeActivities,
  normalizeTimeActivities,
  aggregateProjectHours,
  getValidToken
} from './quickbooks.js';
import { generatePdfReport, generateCsvReport } from './reports.js';
import { sendReportEmail } from './email.js';

const router = express.Router();

router.get('/qb/auth', (req, res) => {
  const url = getAuthUri();
  res.redirect(url);
});

router.get('/qb/callback', async (req, res) => {
  const { code, state, realmId, error } = req.query;
  if (error) {
    return res.status(400).send(`OAuth Error: ${error}`);
  }
  if (!code || !realmId) {
    return res.status(400).send('Missing code or realmId');
  }

  try {
    await handleCallback(code as string, realmId as string);
    res.send(`
      <html><body>
        <script>
          window.opener.postMessage({ type: 'QB_AUTH_SUCCESS' }, '*');
          window.close();
        </script>
        <p>Connected to QuickBooks successfully. You can close this window.</p>
      </body></html>
    `);
  } catch (err: any) {
    res.status(500).send(`Error connecting to QuickBooks: ${err.message}`);
  }
});

router.get('/qb/status', async (req, res) => {
  try {
    const row = db.prepare('SELECT connected_at FROM qb_tokens ORDER BY connected_at DESC LIMIT 1').get() as any;
    if (row) {
      // Test token validity
      await getValidToken();
      res.json({ connected: true, connectedAt: row.connected_at });
    } else {
      res.json({ connected: false });
    }
  } catch (err) {
    res.json({ connected: false, error: 'Token expired or invalid' });
  }
});

router.get('/qb/projects', async (req, res) => {
  try {
    const projects = await getAllProjects();
    res.json(projects);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/qb/employees', async (req, res) => {
  try {
    const { employees, vendors } = await getEmployeesAndVendors();
    res.json({
      employees: employees.map((e: any) => ({ id: e.Id, name: e.DisplayName, type: 'Employee' })),
      vendors: vendors.map((v: any) => ({ id: v.Id, name: v.DisplayName, type: 'Vendor' }))
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reports/generate', async (req, res) => {
  const { filters, recipientEmail, formats } = req.body;
  const reportId = uuidv4();
  
  try {
    // 1. Fetch data
    const rawData = await fetchTimeActivities(filters);
    if (!rawData || rawData.length === 0) {
      return res.status(404).json({ error: 'No time entries found for the selected filters.' });
    }

    // 2. Normalize and aggregate
    const normalized = normalizeTimeActivities(rawData);
    const aggregated = aggregateProjectHours(normalized);

    // 3. Generate reports
    const attachments = [];
    let pdfBuffer, csvString;

    if (formats.includes('pdf')) {
      pdfBuffer = await generatePdfReport(aggregated, filters);
      attachments.push({
        filename: `Project_Hours_${filters.projectName || 'Report'}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      });
    }

    if (formats.includes('csv')) {
      csvString = generateCsvReport(aggregated);
      attachments.push({
        filename: `Project_Hours_${filters.projectName || 'Report'}.csv`,
        content: csvString,
        contentType: 'text/csv'
      });
    }

    // 4. Send email
    const subject = `Project Hours Report - ${filters.projectName || 'All'} - ${filters.startDate || 'Any'} to ${filters.endDate || 'Any'}`;
    const body = `
      Project Hours Report Summary
      ----------------------------
      Project: ${filters.projectName || 'All'}
      Date Range: ${filters.startDate || 'Any'} to ${filters.endDate || 'Any'}
      Total Hours: ${aggregated.summary.totalHours}
      Billable Hours: ${aggregated.summary.billableHours}
      Non-Billable Hours: ${aggregated.summary.nonBillableHours}
      
      Please find the detailed report attached.
    `;

    await sendReportEmail(recipientEmail, subject, body, attachments);

    // 5. Log history
    const stmt = db.prepare(`
      INSERT INTO report_history (id, requested_by, requested_at, filters, recipient_email, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(reportId, 'User', Date.now(), JSON.stringify(filters), recipientEmail, 'Success');

    res.json({ 
      success: true, 
      reportId, 
      summary: aggregated.summary,
      pdfBase64: pdfBuffer ? pdfBuffer.toString('base64') : null,
      csvData: csvString || null
    });

  } catch (err: any) {
    console.error('Report generation error:', err);
    const stmt = db.prepare(`
      INSERT INTO report_history (id, requested_by, requested_at, filters, recipient_email, status, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(reportId, 'User', Date.now(), JSON.stringify(filters), recipientEmail, 'Failed', err.message);

    res.status(500).json({ error: err.message });
  }
});

router.get('/reports/history', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM report_history ORDER BY requested_at DESC LIMIT 50').all();
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

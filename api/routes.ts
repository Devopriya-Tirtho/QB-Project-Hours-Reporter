import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from './db';
import {
  getAuthUri,
  handleCallback,
  getAllProjects,
  getEmployeesAndVendors,
  fetchTimeActivities,
  normalizeTimeActivities,
  aggregateProjectHours,
  getValidToken
} from './quickbooks';
import { generatePdfReport, generateCsvReport } from './reports';

const router = express.Router();

router.get('/qb/auth', (req, res) => {
  const url = getAuthUri();
  res.redirect(url);
});

// Alias for frontend compatibility
router.get('/qb/connect', (req, res) => {
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
    const { realmId: newRealmId } = await handleCallback(code as string, realmId as string);
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
    const snapshot = await db.collection('qb_tokens').orderBy('connected_at', 'desc').limit(1).get();
    
    if (!snapshot.empty) {
      const row = snapshot.docs[0].data();
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

// Alias for frontend compatibility
router.get('/projects', async (req, res) => {
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

router.post('/reports/overview', async (req, res) => {
  const { filters } = req.body;
  try {
    const rawData = await fetchTimeActivities(filters);
    if (!rawData || rawData.length === 0) {
      return res.json({ 
        status: 'No activity', 
        hoursByMember: [], 
        dailyActivity: [], 
        missingEntries: [], 
        recentActivity: [] 
      });
    }

    const normalized = normalizeTimeActivities(rawData);
    
    // Status
    const totalHours = normalized.reduce((sum, row) => sum + row.decimal_hours, 0);
    let status = 'Active';
    if (totalHours === 0) status = 'No activity';
    else if (totalHours < 10) status = 'Low activity';

    // Hours by Team Member
    const memberMap = new Map();
    normalized.forEach(row => {
      const name = row.employeeName || row.vendorName || 'Unknown';
      memberMap.set(name, (memberMap.get(name) || 0) + row.decimal_hours);
    });
    const hoursByMember = Array.from(memberMap.entries())
      .map(([name, hours]) => ({ name, hours: Number(hours.toFixed(2)) }))
      .sort((a, b) => b.hours - a.hours);

    // Daily Activity
    const dailyMap = new Map();
    // Initialize all days in range if startDate and endDate are provided
    if (filters && filters.startDate && filters.endDate) {
      let curr = new Date(filters.startDate);
      const end = new Date(filters.endDate);
      while (curr <= end) {
        dailyMap.set(curr.toISOString().split('T')[0], 0);
        curr.setDate(curr.getDate() + 1);
      }
    }
    normalized.forEach(row => {
      if (row.txnDate) {
        const dateStr = row.txnDate.split('T')[0];
        dailyMap.set(dateStr, (dailyMap.get(dateStr) || 0) + row.decimal_hours);
      }
    });
    const dailyActivity = Array.from(dailyMap.entries())
      .map(([date, hours]) => ({ date, hours: Number(hours.toFixed(2)) }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const maxDailyHours = Math.max(...dailyActivity.map(d => d.hours), 8);

    // Recent Activity Snapshot
    const recentActivity = [...normalized]
      .sort((a, b) => new Date(b.txnDate || 0).getTime() - new Date(a.txnDate || 0).getTime())
      .slice(0, 10)
      .map(row => ({
        date: row.txnDate ? row.txnDate.split('T')[0] : 'Unknown',
        name: row.employeeName || row.vendorName || 'Unknown',
        hours: row.decimal_hours,
        description: row.description
      }));

    // Missing Time Entries: Find employees who logged time in the past 30 days but not in the selected date range
    const missingEntries: any[] = [];
    try {
      if (filters && filters.startDate) {
        const thirtyDaysAgo = new Date(filters.startDate);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const historicalFilters = {
          ...filters,
          startDate: thirtyDaysAgo.toISOString().split('T')[0],
          endDate: filters.startDate
        };
        
        const historicalData = await fetchTimeActivities(historicalFilters);
        if (historicalData && historicalData.length > 0) {
          const historicalNormalized = normalizeTimeActivities(historicalData);
          const historicalWorkers = new Set(
            historicalNormalized.map(row => row.employeeName || row.vendorName || 'Unknown')
          );
          
          // Remove workers who HAVE logged time in the current period
          const currentWorkers = new Set(hoursByMember.map(m => m.name));
          
          historicalWorkers.forEach(worker => {
            if (!currentWorkers.has(worker) && worker !== 'Unknown') {
              missingEntries.push({
                name: worker,
                reason: 'Logged time recently, but no hours in this period.'
              });
            }
          });
        }
      }
    } catch (e) {
      console.error('Failed to calculate missing entries:', e);
    }

    res.json({
      status,
      hoursByMember,
      dailyActivity,
      maxDailyHours,
      missingEntries,
      recentActivity
    });
  } catch (err: any) {
    console.error('Overview generation error:', err);
    res.status(500).json({ error: err?.message || 'Internal Server Error' });
  }
});

router.post('/reports/generate', async (req, res) => {
  const { filters, formats } = req.body;
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
    let pdfBuffer, csvString;

    if (formats && formats.includes('pdf')) {
      pdfBuffer = await generatePdfReport(aggregated, filters);
    }

    if (formats && formats.includes('csv')) {
      csvString = await generateCsvReport(aggregated);
    }

    // 4. Log history
    await db.collection('report_history').doc(reportId).set({
      id: reportId,
      requested_by: 'User',
      requested_at: Date.now(),
      filters: JSON.stringify(filters || {}),
      status: 'Success'
    });

    res.json({ 
      success: true, 
      reportId, 
      summary: aggregated.summary,
      pdfBase64: pdfBuffer ? pdfBuffer.toString('base64') : null,
      csvData: csvString || null
    });

  } catch (err: any) {
    console.error('Report generation error:', err);
    try {
      await db.collection('report_history').doc(reportId).set({
        id: reportId,
        requested_by: 'User',
        requested_at: Date.now(),
        filters: JSON.stringify(filters || {}),
        status: 'Failed',
        error_message: err?.message || String(err) || 'Unknown error'
      });
    } catch (dbErr) {
      console.error('Failed to log error to db:', dbErr);
    }

    res.status(500).json({ error: err?.message || 'Internal Server Error' });
  }
});

// Alias for frontend compatibility
router.post('/report', async (req, res) => {
  const { filters, formats } = req.body;
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
    let pdfBuffer, csvString;

    if (formats && formats.includes('pdf')) {
      pdfBuffer = await generatePdfReport(aggregated, filters);
    }

    if (formats && formats.includes('csv')) {
      csvString = await generateCsvReport(aggregated);
    }

    // 4. Log history
    await db.collection('report_history').doc(reportId).set({
      id: reportId,
      requested_by: 'User',
      requested_at: Date.now(),
      filters: JSON.stringify(filters || {}),
      status: 'Success'
    });

    res.json({ 
      success: true, 
      reportId, 
      summary: aggregated.summary,
      pdfBase64: pdfBuffer ? pdfBuffer.toString('base64') : null,
      csvData: csvString || null
    });

  } catch (err: any) {
    console.error('Report generation error:', err);
    try {
      await db.collection('report_history').doc(reportId).set({
        id: reportId,
        requested_by: 'User',
        requested_at: Date.now(),
        filters: JSON.stringify(filters || {}),
        status: 'Failed',
        error_message: err?.message || String(err) || 'Unknown error'
      });
    } catch (dbErr) {
      console.error('Failed to log error to db:', dbErr);
    }

    res.status(500).json({ error: err?.message || 'Internal Server Error' });
  }
});

router.get('/reports/history', async (req, res) => {
  try {
    const snapshot = await db.collection('report_history').orderBy('requested_at', 'desc').limit(50).get();
    const rows = snapshot.docs.map(doc => doc.data());
    res.json(rows);
  } catch (err: any) {
    console.error('Failed to fetch history:', err);
    res.status(500).json({ error: err.message });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ ok: true, service: "qb-project-hours-reporter" });
});

export default router;

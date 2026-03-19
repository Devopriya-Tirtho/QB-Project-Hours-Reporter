import axios from 'axios';
import db from './db.ts';
import { v4 as uuidv4 } from 'uuid';
import { doc, setDoc, getDoc, deleteDoc, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';

const QUICKBOOKS_CLIENT_ID = process.env.QUICKBOOKS_CLIENT_ID || '';
const QUICKBOOKS_CLIENT_SECRET = process.env.QUICKBOOKS_CLIENT_SECRET || '';
const QUICKBOOKS_REDIRECT_URI = process.env.QUICKBOOKS_REDIRECT_URI || 
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/api/qb/callback` : `${process.env.APP_URL}/api/qb/callback`);
const ENVIRONMENT = process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox'; // sandbox or production

const OAUTH_URL = ENVIRONMENT === 'sandbox' 
  ? 'https://appcenter.intuit.com/connect/oauth2' 
  : 'https://appcenter.intuit.com/connect/oauth2';

const TOKEN_URL = ENVIRONMENT === 'sandbox'
  ? 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
  : 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

const API_BASE_URL = ENVIRONMENT === 'sandbox'
  ? 'https://sandbox-quickbooks.api.intuit.com/v3/company'
  : 'https://quickbooks.api.intuit.com/v3/company';

export function getAuthUri() {
  const state = uuidv4();
  const params = new URLSearchParams({
    client_id: QUICKBOOKS_CLIENT_ID,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: QUICKBOOKS_REDIRECT_URI,
    state: state,
  });
  return `${OAUTH_URL}?${params.toString()}`;
}

export async function handleCallback(code: string, realmId: string) {
  const authHeader = Buffer.from(`${QUICKBOOKS_CLIENT_ID}:${QUICKBOOKS_CLIENT_SECRET}`).toString('base64');
  
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: QUICKBOOKS_REDIRECT_URI,
  });

  const response = await axios.post(TOKEN_URL, params.toString(), {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${authHeader}`,
    },
  });

  const { access_token, refresh_token, expires_in } = response.data;
  const token_expiry = Date.now() + (expires_in * 1000);

  await setDoc(doc(db, 'qb_tokens', realmId), {
    realmId,
    access_token,
    refresh_token,
    token_expiry,
    connected_at: Date.now()
  });
  
  return { realmId };
}

export async function getValidToken() {
  const q = query(collection(db, 'qb_tokens'), orderBy('connected_at', 'desc'), limit(1));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    throw new Error('QuickBooks not connected');
  }

  const row = snapshot.docs[0].data() as any;

  if (Date.now() >= row.token_expiry - 60000) { // Refresh 1 min before expiry
    const authHeader = Buffer.from(`${QUICKBOOKS_CLIENT_ID}:${QUICKBOOKS_CLIENT_SECRET}`).toString('base64');
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: row.refresh_token,
    });

    try {
      const response = await axios.post(TOKEN_URL, params.toString(), {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${authHeader}`,
        },
      });

      const { access_token, refresh_token, expires_in } = response.data;
      const token_expiry = Date.now() + (expires_in * 1000);

      await setDoc(doc(db, 'qb_tokens', row.realmId), {
        realmId: row.realmId,
        access_token,
        refresh_token,
        token_expiry,
        connected_at: row.connected_at
      });

      return { access_token, realmId: row.realmId };
    } catch (error: any) {
      console.error('Failed to refresh token', error.response?.data || error.message);
      
      if (error.response?.data?.error === 'invalid_grant') {
        // Token is invalid, force reconnection
        await deleteDoc(doc(db, 'qb_tokens', row.realmId));
        throw new Error('QuickBooks session expired. Please reconnect.');
      }
      
      throw new Error('Failed to refresh QuickBooks token. Please reconnect.');
    }
  }

  return { access_token: row.access_token, realmId: row.realmId };
}

async function qbApiCall(method: string, path: string, data?: any) {
  const { access_token, realmId } = await getValidToken();
  const url = `${API_BASE_URL}/${realmId}/${path}`;

  try {
    const response = await axios({
      method,
      url,
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      data,
    });
    return response.data;
  } catch (error: any) {
    const errorData = error.response?.data;
    console.error('QuickBooks API Error:', errorData ? JSON.stringify(errorData, null, 2) : error.message);
    
    let errorMessage = error.message;
    if (errorData) {
      const fault = errorData.Fault || errorData.fault;
      if (fault && fault.Error && fault.Error.length > 0) {
        errorMessage = fault.Error[0].Message || fault.Error[0].message || fault.Error[0].Detail || errorMessage;
      } else if (fault && fault.error && fault.error.length > 0) {
        errorMessage = fault.error[0].Message || fault.error[0].message || fault.error[0].Detail || errorMessage;
      }
    }
    
    throw new Error(`QuickBooks API Error: ${errorMessage}`);
  }
}

export async function getPreferences() {
  return qbApiCall('GET', 'preferences');
}

export async function queryQuickBooks(query: string) {
  return qbApiCall('GET', `query?query=${encodeURIComponent(query)}`);
}

let projectsCache: { data: any[] | null, timestamp: number } = { data: null, timestamp: 0 };
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

export async function getAllProjects() {
  if (projectsCache.data && (Date.now() - projectsCache.timestamp < CACHE_DURATION)) {
    return projectsCache.data;
  }

  let allCustomers: any[] = [];
  let startPosition = 1;
  const maxResults = 500;
  let fetchMore = true;

  while (fetchMore) {
    const query = `SELECT * FROM Customer WHERE Active IN (true, false) STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
    const result = await queryQuickBooks(query);
    const customers = result.QueryResponse.Customer || [];
    allCustomers = allCustomers.concat(customers);

    if (customers.length < maxResults) {
      fetchMore = false;
    } else {
      startPosition += maxResults;
    }
  }

  // Build map for ParentRef resolution
  const customerMap = new Map();
  allCustomers.forEach(c => customerMap.set(c.Id, c));

  const formattedProjects = allCustomers.map(c => {
    let name = c.DisplayName || `Customer ${c.Id}`;
    if (c.ParentRef && c.ParentRef.value) {
      const parent = customerMap.get(c.ParentRef.value);
      if (parent && parent.DisplayName) {
        name = `${parent.DisplayName} : ${name}`;
      }
    }
    return { id: c.Id, name };
  });

  // Sort alphabetically
  formattedProjects.sort((a, b) => a.name.localeCompare(b.name));

  projectsCache = {
    data: formattedProjects,
    timestamp: Date.now()
  };

  return formattedProjects;
}

export async function getEmployeesAndVendors() {
  const [employees, vendors] = await Promise.all([
    queryQuickBooks("SELECT * FROM Employee WHERE Active = true MAXRESULTS 500"),
    queryQuickBooks("SELECT * FROM Vendor WHERE Active = true MAXRESULTS 500")
  ]);
  return {
    employees: employees.QueryResponse.Employee || [],
    vendors: vendors.QueryResponse.Vendor || []
  };
}

export async function fetchTimeActivities(filters: any) {
  let conditions = [];

  if (filters.startDate) {
    conditions.push(`TxnDate >= '${filters.startDate}'`);
  }
  if (filters.endDate) {
    conditions.push(`TxnDate <= '${filters.endDate}'`);
  }
  if (filters.customerRef) {
    conditions.push(`CustomerRef = '${filters.customerRef}'`);
  }
  if (filters.employeeRef) {
    conditions.push(`EmployeeRef = '${filters.employeeRef}'`);
  }
  if (filters.vendorRef) {
    conditions.push(`VendorRef = '${filters.vendorRef}'`);
  }
  if (filters.itemRef) {
    conditions.push(`ItemRef = '${filters.itemRef}'`);
  }
  
  let baseQuery = "SELECT * FROM TimeActivity";
  if (conditions.length > 0) {
    baseQuery += " WHERE " + conditions.join(" AND ");
  }
  
  let allActivities: any[] = [];
  let startPosition = 1;
  const maxResults = 500;
  let fetchMore = true;

  while (fetchMore) {
    const query = `${baseQuery} STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
    const result = await queryQuickBooks(query);
    const activities = result.QueryResponse.TimeActivity || [];
    allActivities = allActivities.concat(activities);

    if (activities.length < maxResults) {
      fetchMore = false;
    } else {
      startPosition += maxResults;
    }
  }
  
  return allActivities;
}

export function normalizeTimeActivities(rawRows: any[]) {
  return rawRows.map(row => {
    const hours = row.Hours || 0;
    const minutes = row.Minutes || 0;
    const decimal_hours = hours + (minutes / 60);
    const hh_mm = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    
    return {
      id: row.Id,
      txnDate: row.TxnDate,
      nameOf: row.NameOf, // Employee or Vendor
      employeeRef: row.EmployeeRef?.value,
      employeeName: row.EmployeeRef?.name,
      vendorRef: row.VendorRef?.value,
      vendorName: row.VendorRef?.name,
      customerRef: row.ProjectRef?.value || row.CustomerRef?.value,
      customerName: row.ProjectRef?.name || row.CustomerRef?.name,
      itemRef: row.ItemRef?.value,
      itemName: row.ItemRef?.name,
      classRef: row.ClassRef?.value,
      className: row.ClassRef?.name,
      departmentRef: row.DepartmentRef?.value,
      departmentName: row.DepartmentRef?.name,
      billableStatus: row.BillableStatus,
      hours: hours,
      minutes: minutes,
      decimal_hours: Number(decimal_hours.toFixed(2)),
      hh_mm: hh_mm,
      description: row.Description || '',
      lastUpdated: row.MetaData?.LastUpdatedTime
    };
  });
}

export function aggregateProjectHours(normalizedRows: any[]) {
  const summary = {
    totalEntries: normalizedRows.length,
    totalHours: 0,
    billableHours: 0,
    nonBillableHours: 0,
    distinctEmployees: new Set(),
    distinctServiceItems: new Set(),
  };

  const byEmployee: Record<string, any> = {};
  const byServiceItem: Record<string, any> = {};

  normalizedRows.forEach(row => {
    summary.totalHours += row.decimal_hours;
    if (row.billableStatus === 'Billable') {
      summary.billableHours += row.decimal_hours;
    } else {
      summary.nonBillableHours += row.decimal_hours;
    }

    const workerName = row.employeeName || row.vendorName || 'Unknown';
    summary.distinctEmployees.add(workerName);
    
    if (!byEmployee[workerName]) {
      byEmployee[workerName] = { name: workerName, totalHours: 0, billableHours: 0, nonBillableHours: 0 };
    }
    byEmployee[workerName].totalHours += row.decimal_hours;
    if (row.billableStatus === 'Billable') {
      byEmployee[workerName].billableHours += row.decimal_hours;
    } else {
      byEmployee[workerName].nonBillableHours += row.decimal_hours;
    }

    const itemName = row.itemName || 'None';
    summary.distinctServiceItems.add(itemName);
    
    if (!byServiceItem[itemName]) {
      byServiceItem[itemName] = { name: itemName, totalHours: 0 };
    }
    byServiceItem[itemName].totalHours += row.decimal_hours;
  });

  return {
    summary: {
      ...summary,
      totalHours: Number(summary.totalHours.toFixed(2)),
      billableHours: Number(summary.billableHours.toFixed(2)),
      nonBillableHours: Number(summary.nonBillableHours.toFixed(2)),
      distinctEmployees: summary.distinctEmployees.size,
      distinctServiceItems: summary.distinctServiceItems.size,
    },
    byEmployee: Object.values(byEmployee).map(e => ({
      ...e,
      totalHours: Number(e.totalHours.toFixed(2)),
      billableHours: Number(e.billableHours.toFixed(2)),
      nonBillableHours: Number(e.nonBillableHours.toFixed(2)),
    })),
    byServiceItem: Object.values(byServiceItem).map(i => ({
      ...i,
      totalHours: Number(i.totalHours.toFixed(2)),
    })),
    details: normalizedRows
  };
}

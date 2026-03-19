import fs from 'fs';
import path from 'path';

export async function generatePdfReport(reportData: any, filters: any): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const buffers: Buffer[] = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      resolve(Buffer.concat(buffers));
    });

    // Header
    doc.fontSize(20).text('Project Hours Report', { align: 'center' });
    doc.moveDown();
    
    doc.fontSize(12).text(`Generated: ${new Date().toLocaleString()}`);
    doc.text(`Project: ${filters.projectName || 'All'}`);
    doc.text(`Date Range: ${filters.startDate || 'Any'} to ${filters.endDate || 'Any'}`);
    doc.moveDown();

    // Summary
    doc.fontSize(16).text('Summary', { underline: true });
    doc.fontSize(12).text(`Total Entries: ${reportData.summary.totalEntries}`);
    doc.text(`Total Hours: ${reportData.summary.totalHours}`);
    doc.text(`Billable Hours: ${reportData.summary.billableHours}`);
    doc.text(`Non-Billable Hours: ${reportData.summary.nonBillableHours}`);
    doc.text(`Distinct Employees/Vendors: ${reportData.summary.distinctEmployees}`);
    doc.text(`Distinct Service Types: ${reportData.summary.distinctServiceItems}`);
    doc.moveDown();

    // Breakdown by Employee
    doc.fontSize(16).text('Breakdown by Employee/Vendor', { underline: true });
    reportData.byEmployee.forEach((emp: any) => {
      doc.fontSize(12).text(`${emp.name}: ${emp.totalHours} hrs (Billable: ${emp.billableHours}, Non-Billable: ${emp.nonBillableHours})`);
    });
    doc.moveDown();

    // Breakdown by Service Type
    doc.fontSize(16).text('Breakdown by Service Type', { underline: true });
    reportData.byServiceItem.forEach((item: any) => {
      doc.fontSize(12).text(`${item.name}: ${item.totalHours} hrs`);
    });
    doc.moveDown();

    // Details snippet
    doc.fontSize(16).text('Detailed Line Items', { underline: true });
    reportData.details.forEach((detail: any, index: number) => {
      if (index > 50) return; // Limit details in PDF to avoid huge files
      doc.fontSize(10).text(`${detail.txnDate} | ${detail.employeeName || detail.vendorName} | ${detail.itemName} | ${detail.decimal_hours} hrs | ${detail.billableStatus}`);
      if (detail.description) {
        doc.fontSize(9).fillColor('gray').text(`  Desc: ${detail.description}`).fillColor('black');
      }
      doc.moveDown(0.5);
    });

    if (reportData.details.length > 50) {
      doc.fontSize(10).fillColor('blue').text(`... and ${reportData.details.length - 50} more entries. See CSV for full details.`);
    }

    doc.end();
  });
}

export async function generateCsvReport(reportData: any): Promise<string> {
  const json2csv = await import('json2csv');
  const Parser = json2csv.default ? json2csv.default.Parser : json2csv.Parser;
  const fields = [
    'txnDate',
    'employeeName',
    'vendorName',
    'customerName',
    'itemName',
    'className',
    'departmentName',
    'billableStatus',
    'decimal_hours',
    'hh_mm',
    'description'
  ];
  
  const opts = { fields };
  try {
    const parser = new Parser(opts);
    const csv = parser.parse(reportData.details);
    return csv;
  } catch (err) {
    console.error(err);
    return '';
  }
}

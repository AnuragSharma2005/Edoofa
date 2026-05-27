const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const fetch = require('node-fetch');
require('dotenv').config();

const CREDENTIALS_PATH = path.resolve('./credentials.json');
let googleSheetsClient = null;

// Initialize Google Sheets API Client
function initGoogleSheets() {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.log('[Sheets Service] credentials.json not found in root. Running in Local Storage / AppsScript Fallback Mode.');
    return null;
  }
  
  if (!spreadsheetId || spreadsheetId.trim() === '') {
    console.log('[Sheets Service] GOOGLE_SPREADSHEET_ID is missing in .env. Running in Local Storage / AppsScript Fallback Mode.');
    return null;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    
    googleSheetsClient = google.sheets({ version: 'v4', auth });
    console.log('[Sheets Service] Connected to Google Sheets API successfully.');

    // Ensure header row exists in sheet (A1:J1) so columns are self-describing
    const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
    ensureSheetHeaders(spreadsheetId, sheetName).catch(err => {
      console.error('[Sheets Service] Failed to ensure sheet headers:', err.message);
    });

    return googleSheetsClient;
  } catch (error) {
    console.error('[Sheets Service] Failed to initialize Google Sheets client:', error.message);
    return null;
  }
}

/**
 * Ensure the Google Sheet has the header row describing columns
 * Columns: Date, SequentialId, Student, Sender, Transcript, Summary, ActionItem, Priority, Sentiment, Timestamp
 */
async function ensureSheetHeaders(spreadsheetId, sheetName) {
  if (!googleSheetsClient) return;

  const headerRange = `${sheetName}!A1:J1`;
  try {
    const resp = await googleSheetsClient.spreadsheets.values.get({
      spreadsheetId,
      range: headerRange
    });

    const existing = (resp.data && resp.data.values && resp.data.values[0]) ? resp.data.values[0] : [];
    const desired = ['Date', 'SequentialId', 'Student', 'Sender', 'Transcript', 'Summary', 'ActionItem', 'Priority', 'Sentiment', 'Timestamp'];

    // If header is missing or mismatched, overwrite
    let needWrite = false;
    if (!existing || existing.length === 0) {
      needWrite = true;
    } else {
      // simple check: first cell should equal 'Date'
      if ((existing[0] || '').toString().trim().toLowerCase() !== 'date') {
        needWrite = true;
      }
    }

    if (needWrite) {
      await googleSheetsClient.spreadsheets.values.update({
        spreadsheetId,
        range: headerRange,
        valueInputOption: 'RAW',
        resource: { values: [desired] }
      });
      console.log('[Sheets Service] Header row written to sheet.');
    } else {
      console.log('[Sheets Service] Header row already present.');
    }
  } catch (error) {
    console.error('[Sheets Service] Error checking/writing header row:', error.message);
    throw error;
  }
}

/**
 * Post record to Apps Script endpoint (fallback)
 * @param {Object} record
 */
async function postToAppsScript(record) {
  const scriptUrl = process.env.APPS_SCRIPT_URL || process.env.APP_SCRIPT_URL;
  if (!scriptUrl) {
    console.log('[Sheets Service] APPS_SCRIPT_URL not configured. Cannot call Apps Script fallback.');
    return false;
  }

  try {
    const res = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    });

    const text = await res.text();
    try {
      const data = JSON.parse(text);
      if (data && data.ok) {
        console.log(`[Sheets Service] Apps Script fallback succeeded for ID: ${record.SequentialId || 'unknown'}`);
        return true;
      }
      console.error('[Sheets Service] Apps Script fallback returned error:', data);
      return false;
    } catch (parseErr) {
      // Likely an HTML response (login page or error page) — log a snippet to help debug
      console.error('[Sheets Service] Apps Script fallback returned non-JSON response. First 1000 chars:');
      console.error(text.slice(0, 1000));
      return false;
    }
  } catch (error) {
    console.error('[Sheets Service] Error calling Apps Script fallback:', error.message);
    return false;
  }
}

/**
 * Appends a record to Google Sheets (primary) or Apps Script fallback (secondary)
 * @param {Object} record - The processed student record
 * @returns {Promise<boolean>} - True if successfully uploaded, false otherwise
 */
async function appendToGoogleSheet(record) {
  // Re-check client in case it wasn't initialized or credentials were added during runtime
  if (!googleSheetsClient) {
    initGoogleSheets();
  }

  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';

  if (googleSheetsClient) {
    try {
      console.log(`[Sheets Service] Syncing record ${record.SequentialId} to Google Sheet via API...`);
      
      const values = [[
        record.Date,
        record.SequentialId,
        record.Student,
        record.Sender,
        record.Transcript,
        record.Summary,
        record.ActionItem,
        record.Priority,
        record.Sentiment,
        record.Timestamp
      ]];

      const resource = { values };
      
      await googleSheetsClient.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A:J`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        resource,
      });

      console.log(`[Sheets Service] Sync complete for ID: ${record.SequentialId}`);
      return true;
    } catch (error) {
      console.error(`[Sheets Service] Error writing to Google Sheet:`, error.message);
      console.log(`[Sheets Service] Recommended Fix: Ensure the Service Account Email in 'credentials.json' is added as an 'Editor' on the Google Sheet.`);
      // Fallthrough to Apps Script fallback below
    }
  } else {
    console.log('[Sheets Service] Google Sheets client not initialized, attempting Apps Script fallback if configured.');
  }

  // Apps Script fallback (if available)
  const appsResult = await postToAppsScript(record);
  if (appsResult) return true;

  console.log('[Sheets Service] Sync to Google Sheets skipped (running in Local-Only Mode).');
  return false;
}

// Initialize on startup
initGoogleSheets();

module.exports = {
  appendToGoogleSheet,
  initGoogleSheets
}

Edoofa Voice Note AI - Quick Setup

This project captures WhatsApp group voice notes, transcribes them, generates AI summaries, and syncs structured rows to Google Sheets.

Quick steps to enable Google Sheets sync (preferred - Service Account):

1. Create a Google Cloud Project and enable the Google Sheets API.
2. Create a Service Account and download the JSON key. Save it as `credentials.json` in the project root.
3. Share your Google Sheet with the service account email (Editor).
4. Copy the spreadsheet ID into `.env` as `GOOGLE_SPREADSHEET_ID`.
5. Restart the server: `node server.js`.

Apps Script fallback:

If you cannot use a service account, deploy an Apps Script `doPost` web app that appends rows to your sheet. Set `APPS_SCRIPT_URL` in `.env` and the app will POST there as a fallback when `credentials.json` is missing.

Test script:

Run the test script to verify Sheets connection (will use primary API, then fallback to Apps Script if present):

```bash
node scripts/test-sheet.js
```

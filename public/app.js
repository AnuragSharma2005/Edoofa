// Edoofa WhatsApp Voice Note AI Pipeline - Frontend Script

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const statusSubtext = document.getElementById('statusSubtext');
  const qrContainer = document.getElementById('qrContainer');
  const restartBotBtn = document.getElementById('restartBotBtn');
  
  const simulatorForm = document.getElementById('simulatorForm');
  const simStudentName = document.getElementById('simStudentName');
  const simSender = document.getElementById('simSender');
  const simAudioFile = document.getElementById('simAudioFile');
  const fileLabel = document.getElementById('fileLabel');
  const simulateSubmitBtn = document.getElementById('simulateSubmitBtn');

  const activityLog = document.getElementById('activityLog');
  const clearLogsBtn = document.getElementById('clearLogsBtn');

  const recordsTableBody = document.getElementById('recordsTableBody');
  const emptyRow = document.getElementById('emptyRow');
  const refreshRecordsBtn = document.getElementById('refreshRecordsBtn');

  // Settings Drawer Elements
  const settingsOverlay = document.getElementById('settingsOverlay');
  const openSettingsBtn = document.getElementById('openSettingsBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
  const settingsForm = document.getElementById('settingsForm');
  const settingOpenAIKey = document.getElementById('settingOpenAIKey');
  const settingGroqKey = document.getElementById('settingGroqKey');
  const settingSpreadsheetId = document.getElementById('settingSpreadsheetId');
  const settingSheetName = document.getElementById('settingSheetName');

  // Load existing records on boot
  fetchRecords();

  // Connect to SSE (Server-Sent Events) for real-time streaming updates!
  const eventSource = new EventSource('/api/events');

  eventSource.addEventListener('status_update', (e) => {
    try {
      const data = JSON.parse(e.data);
      updateWhatsAppStatus(data.status, data.qrUrl);
    } catch (err) {
      console.error('Error parsing status update event:', err);
    }
  });

  eventSource.addEventListener('pipeline_activity', (e) => {
    try {
      const data = JSON.parse(e.data);
      addLogEntry(data.step, data.student, data.message);
      
      // If success, refresh the records list or prepended new record!
      if (data.step === 'success' && data.data && data.data.record) {
        prependRecord(data.data.record);
        
        // Re-enable simulator button
        simulateSubmitBtn.disabled = false;
        simulateSubmitBtn.innerHTML = `<i class="fa-solid fa-play"></i> Run AI & Sheets Pipeline`;
      } else if (data.step === 'error') {
        // Re-enable on error
        simulateSubmitBtn.disabled = false;
        simulateSubmitBtn.innerHTML = `<i class="fa-solid fa-play"></i> Run AI & Sheets Pipeline`;
      }
    } catch (err) {
      console.error('Error parsing pipeline activity event:', err);
    }
  });

  eventSource.addEventListener('settings_updated', (e) => {
    try {
      const data = JSON.parse(e.data);
      addLogEntry('info', 'System', `Settings Reloaded: ${data.message}`);
    } catch (err) {
      console.log(err);
    }
  });

  eventSource.onerror = (err) => {
    console.error('SSE Connection failed:', err);
    addLogEntry('error', 'System', 'SSE EventSource connection failed. Trying to reconnect...');
  };

  // Helper: Update WhatsApp status UI
  function updateWhatsAppStatus(status, qrUrl) {
    statusDot.className = 'status-dot';
    statusText.innerText = status;

    if (status === 'Ready') {
      statusDot.classList.add('ready');
      statusSubtext.innerHTML = '<i class="fa-solid fa-circle-check" style="color: var(--status-ready);"></i> Connected! Monitoring all groups for voice notes.';
      qrContainer.style.display = 'none';
      restartBotBtn.disabled = false;
    } else if (status === 'Scanning') {
      statusDot.classList.add('scanning');
      statusSubtext.innerText = 'Scan the QR code with WhatsApp Web to log in.';
      
      if (qrUrl) {
        qrContainer.style.display = 'flex';
        qrContainer.innerHTML = `<img src="${qrUrl}" alt="WhatsApp QR Code">`;
      } else {
        qrContainer.style.display = 'flex';
        qrContainer.innerHTML = `
          <div class="qr-placeholder">
            <div class="qr-spinner"></div>
            Loading QR Code...
          </div>`;
      }
      restartBotBtn.disabled = false;
    } else if (status === 'Connecting') {
      statusDot.classList.add('connecting');
      statusSubtext.innerText = 'Opening browser environment. Please wait...';
      qrContainer.style.display = 'none';
      restartBotBtn.disabled = true;
    } else if (status === 'Error') {
      statusDot.classList.add('error');
      statusSubtext.innerHTML = '<span style="color: var(--status-error);"><i class="fa-solid fa-triangle-exclamation"></i> Puppeteer startup error.</span> Check system chrome path or continue using Simulator!';
      qrContainer.style.display = 'none';
      restartBotBtn.disabled = false;
    } else {
      statusDot.classList.add('disconnected');
      statusSubtext.innerText = 'Bot is offline. Reconnect below.';
      qrContainer.style.display = 'none';
      restartBotBtn.disabled = false;
    }
  }

  // Helper: Add log entry to terminal
  function addLogEntry(step, student, message) {
    const entry = document.createElement('div');
    entry.className = `log-entry ${step === 'success' ? 'success' : step === 'error' ? 'error' : 'info'}`;

    const timestamp = new Date().toLocaleTimeString();
    
    // Icon based on step
    let stepIcon = '⚙️';
    if (step === 'transcribing') stepIcon = '🎙️ [Whisper]';
    else if (step === 'analyzing') stepIcon = '🧠 [GPT-4o-mini]';
    else if (step === 'saving') stepIcon = '💾 [Storage]';
    else if (step === 'syncing') stepIcon = '📊 [Google Sheets]';
    else if (step === 'success') stepIcon = '✅ [Success]';
    else if (step === 'error') stepIcon = '❌ [Error]';

    entry.innerHTML = `
      <span class="log-time">[${timestamp}] ${stepIcon}</span>
      <strong style="color: var(--accent-cyan);">${student}:</strong>
      <span class="log-text">${message}</span>
    `;

    activityLog.appendChild(entry);
    activityLog.scrollTop = activityLog.scrollHeight; // Auto-scroll
  }

  // Handle manual logs clearing
  clearLogsBtn.addEventListener('click', () => {
    activityLog.innerHTML = `
      <div class="log-entry info">
        <span class="log-time">[System]</span>
        <span class="log-text">Logs cleared. Watching events stream...</span>
      </div>`;
  });

  // Handle custom file upload labels
  simAudioFile.addEventListener('change', () => {
    if (simAudioFile.files && simAudioFile.files.length > 0) {
      fileLabel.innerText = `Selected file: ${simAudioFile.files[0].name}`;
      fileLabel.style.color = 'var(--accent-cyan)';
    } else {
      fileLabel.innerText = 'Upload test audio file (or leave empty to run a smart virtual simulation)';
      fileLabel.style.color = 'var(--text-muted)';
    }
  });

  // Trigger manual Bot reconnection
  restartBotBtn.addEventListener('click', async () => {
    addLogEntry('info', 'WhatsApp Client', 'Sending restart request to backend...');
    try {
      const res = await fetch('/api/whatsapp/restart', { method: 'POST' });
      const data = await res.json();
      addLogEntry('info', 'WhatsApp Client', data.message || 'Restart triggered.');
    } catch (err) {
      addLogEntry('error', 'WhatsApp Client', `Failed to restart bot: ${err.message}`);
    }
  });

  // Handle Simulator Form Submission
  simulatorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const studentVal = simStudentName.value.trim();
    if (!studentVal) return;

    // Show visual loading status
    simulateSubmitBtn.disabled = true;
    simulateSubmitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Triggering AI Pipeline...`;
    
    addLogEntry('info', 'Simulator', `Injecting voice note event for student group "${studentVal}"`);

    const formData = new FormData();
    formData.append('studentName', studentVal);
    formData.append('declaredSender', simSender.value);
    
    if (simAudioFile.files && simAudioFile.files.length > 0) {
      formData.append('audio', simAudioFile.files[0]);
    }

    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      
      if (data.success) {
        addLogEntry('info', 'Simulator', 'Event successfully queued on server. Watch pipeline steps below!');
        
        // Reset file input only, keep student name for quick repeating testing
        simAudioFile.value = '';
        fileLabel.innerText = 'Upload test audio file (or leave empty to run a smart virtual simulation)';
        fileLabel.style.color = 'var(--text-muted)';
      } else {
        throw new Error(data.error || 'Server rejected simulation request.');
      }
    } catch (err) {
      addLogEntry('error', 'Simulator', `Failed to start simulation: ${err.message}`);
      simulateSubmitBtn.disabled = false;
      simulateSubmitBtn.innerHTML = `<i class="fa-solid fa-play"></i> Run AI & Sheets Pipeline`;
    }
  });

  // API Settings Overlay Actions
  openSettingsBtn.addEventListener('click', async () => {
    // Populate form with existing active envs if possible (or keep placeholder)
    settingsOverlay.classList.add('active');
  });

  const closeSettings = () => {
    settingsOverlay.classList.remove('active');
  };

  closeSettingsBtn.addEventListener('click', closeSettings);
  cancelSettingsBtn.addEventListener('click', closeSettings);
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) closeSettings();
  });

  // Save Settings Form
  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const payload = {
      openaiKey: settingOpenAIKey.value.trim() || undefined,
      groqKey: settingGroqKey.value.trim() || undefined,
      spreadsheetId: settingSpreadsheetId.value.trim() || undefined,
      sheetName: settingSheetName.value.trim() || 'Sheet1'
    };
 
    addLogEntry('info', 'Settings', 'Writing credentials to server configuration...');
 
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      
      if (data.success) {
        addLogEntry('success', 'Settings', 'API parameters hot-loaded successfully! Core services updated.');
        closeSettings();
        // clear keys from client form for security
        settingOpenAIKey.value = '';
        settingGroqKey.value = '';
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      addLogEntry('error', 'Settings', `Failed to update configuration: ${err.message}`);
    }
  });

  // Table Refresh Button
  refreshRecordsBtn.addEventListener('click', fetchRecords);

  // Fetch all captured records
  async function fetchRecords() {
    refreshRecordsBtn.disabled = true;
    refreshRecordsBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Loading...`;
    
    try {
      const res = await fetch('/api/records');
      const data = await res.json();
      
      renderRecords(data);
    } catch (err) {
      console.error('Error fetching records:', err);
      addLogEntry('error', 'Database', `Could not fetch records: ${err.message}`);
    } finally {
      refreshRecordsBtn.disabled = false;
      refreshRecordsBtn.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> Refresh View`;
    }
  }

  // Render list of records in table
  function renderRecords(records) {
    recordsTableBody.innerHTML = '';
    
    if (!records || records.length === 0) {
      recordsTableBody.appendChild(emptyRow);
      return;
    }

    records.forEach(rec => {
      const row = createTableRow(rec);
      recordsTableBody.appendChild(row);
    });
  }

  // Prepend a single newly processed record to the top of the table
  function prependRecord(rec) {
    // Remove empty row if it's there
    const emptyState = document.getElementById('emptyRow');
    if (emptyState && emptyState.parentNode) {
      recordsTableBody.innerHTML = '';
    }

    // Check if record already exists to prevent duplicate rows
    const existingRow = document.getElementById(`row-${rec.SequentialId}`);
    if (existingRow) {
      existingRow.remove();
    }

    const row = createTableRow(rec);
    row.style.background = 'hsla(190, 100%, 48%, 0.1)'; // Highlight background
    
    recordsTableBody.insertBefore(row, recordsTableBody.firstChild);

    // Fade out highlight after 4 seconds
    setTimeout(() => {
      row.style.transition = 'background 1.5s ease';
      row.style.background = '';
    }, 4000);
  }

  // Create standard dynamic table row element
  function createTableRow(rec) {
    const tr = document.createElement('tr');
    tr.id = `row-${rec.SequentialId}`;

    // Format priority tag class
    const p = (rec.Priority || 'Medium').toLowerCase();
    const priorityClass = `priority-tag-${p}`;

    // Format sentiment tag class
    const s = (rec.Sentiment || 'Neutral').toLowerCase();
    const sentimentClass = `sentiment-tag-${s}`;

    // Format sender tag class
    const sender = rec.Sender || 'Student';
    const senderClass = `tag-${sender.toLowerCase()}`;

    // Parse summaries/actions as nice items
    const summaryHTML = formatBulletPoints(rec.Summary);
    const actionHTML = formatBulletPoints(rec.ActionItem, true);

    tr.innerHTML = `
      <td><span style="font-weight:600; font-size:0.85rem;">${rec.Date}</span></td>
      <td><code style="color:var(--accent-purple); font-weight:700; font-size:0.85rem;">${rec.SequentialId}</code></td>
      <td style="font-weight:600;">${rec.Student}</td>
      <td><span class="tag ${senderClass}">${sender}</span></td>
      <td>
        <div class="transcript-box">${escapeHTML(rec.Transcript)}</div>
      </td>
      <td>
        <div class="summary-box">${summaryHTML}</div>
      </td>
      <td>
        <div class="action-box">${actionHTML}</div>
      </td>
      <td><span class="tag ${priorityClass}">${rec.Priority || 'Medium'}</span></td>
      <td><span class="tag ${sentimentClass}">${rec.Sentiment || 'Neutral'}</span></td>
      <td style="text-align:center;">
        ${rec.AudioUrl ? `<audio controls class="custom-player" src="${rec.AudioUrl}"></audio>` : `<span style="color:var(--text-muted);font-style:italic;font-size:0.8rem;">Virtual Voice</span>`}
      </td>
    `;

    return tr;
  }

  // Helpers to escape tags & parse summary lists nicely
  function escapeHTML(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatBulletPoints(text, isAction = false) {
    if (!text) return 'None';
    
    // Split by newlines or bullets
    const lines = text.split(/\n|•|^-/).map(l => l.trim()).filter(l => l.length > 0);
    
    if (lines.length <= 1) {
      // Just single line
      return `<p>${escapeHTML(text)}</p>`;
    }

    const listClass = isAction ? 'fa-circle-exclamation' : 'fa-circle-dot';
    const listColor = isAction ? 'color: var(--priority-medium);' : 'color: var(--accent-cyan);';

    let html = '<ul style="list-style:none; padding:0; display:flex; flex-direction:column; gap:0.25rem;">';
    lines.forEach(line => {
      // Clean up leading dash or star
      const cleanLine = line.replace(/^[\s-*•]+/, '').trim();
      html += `<li><i class="fa-solid ${listClass}" style="font-size:0.65rem; margin-right:0.4rem; ${listColor}"></i>${escapeHTML(cleanLine)}</li>`;
    });
    html += '</ul>';
    
    return html;
  }
});

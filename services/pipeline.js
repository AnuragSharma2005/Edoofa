const path = require('path');
const storage = require('./storage');
const ai = require('./ai');
const sheets = require('./sheets');

// Global callback for broadcasting pipeline updates
let pipelineBroadcastCallback = null;

function registerPipelineCallback(callback) {
  pipelineBroadcastCallback = callback;
}

/**
 * Broadcasts progress message to the dashboard UI
 * @param {string} step - 'transcribing', 'analyzing', 'syncing', 'success', 'error'
 * @param {string} student - Student name
 * @param {string} message - User-friendly message
 * @param {Object} data - Optional payload
 */
function sendProgress(step, student, message, data = null) {
  if (pipelineBroadcastCallback) {
    pipelineBroadcastCallback('pipeline_activity', {
      step,
      student,
      message,
      data
    });
  }
}

/**
 * Executes the entire automated pipeline for a voice note
 * @param {Object} params - { audioPath, studentName, declaredSender, metadata }
 * @returns {Promise<Object>} - The fully structured record
 */
async function processVoicePipeline({ audioPath, studentName, declaredSender = null, metadata = null }) {
  const normalizedStudent = studentName || 'Unknown Student';
  console.log(`[Pipeline] Launching AI & Sheet Pipeline for: ${normalizedStudent}`);
  
  try {
    // Step 1: Transcription
    sendProgress('transcribing', normalizedStudent, 'Processing Speech-to-Text conversion (OpenAI Whisper)...');
    const transcript = await ai.transcribeAudio(audioPath);
    console.log(`[Pipeline] Transcript received: "${transcript.substring(0, 60)}..."`);

    // Step 2: AI Analysis & Feature Extraction
    sendProgress('analyzing', normalizedStudent, 'Analyzing voice transcript and generating AI action items (GPT-4o-mini)...');
    
    // Enrich prompt with contact meta context if available
    let enrichedDeclaredSender = declaredSender;
    if (!enrichedDeclaredSender && metadata && metadata.senderContactName) {
      // If we have contact details, GPT can use them
      console.log(`[Pipeline] Passing sender contact context to GPT: ${metadata.senderContactName}`);
    }

    const aiAnalysis = await ai.analyzeTranscript(transcript, normalizedStudent, enrichedDeclaredSender);
    console.log('[Pipeline] AI Analysis completed successfully.');

    // Step 3: Local storage & Sequential ID Assignment
    sendProgress('saving', normalizedStudent, 'Generating daily sequential index and writing to local database...');
    
    // Resolve relative audio path for web player (e.g. /audio/filename.ogg)
    const audioFileName = path.basename(audioPath);
    const audioUrl = `/audio/${audioFileName}`;

    const dateStr = new Date().toISOString().split('T')[0];

    const recordData = {
      Student: normalizedStudent,
      Sender: aiAnalysis.Sender || declaredSender || 'Student',
      Transcript: transcript,
      Summary: aiAnalysis.Summary || 'No summary generated.',
      ActionItem: aiAnalysis.ActionItem || 'No action items.',
      Priority: aiAnalysis.Priority || 'Medium',
      Sentiment: aiAnalysis.Sentiment || 'Neutral',
      AudioPath: audioPath,
      AudioUrl: audioUrl,
      Date: dateStr,
      Timestamp: new Date().toISOString(),
      Notes: metadata ? `Sender Phone: ${metadata.senderPhoneNumber || 'N/A'}, Nickname: ${metadata.senderContactName || 'N/A'}` : ''
    };

    // This assigns the Sequential ID (e.g. Student_YYYY-MM-DD_001) and saves to mock spreadsheet
    const finalRecord = storage.addRecord(recordData);

    // Step 4: Google Sheets Sync
    sendProgress('syncing', normalizedStudent, 'Syncing structured row to Google Sheet (Google Sheets API)...');
    const sheetSyncSuccess = await sheets.appendToGoogleSheet(finalRecord);
    
    if (sheetSyncSuccess) {
      finalRecord.notes = (finalRecord.notes || '') + ' | Synced to Google Sheet';
    } else {
      finalRecord.notes = (finalRecord.notes || '') + ' | Stored locally only (Google Sheet credentials inactive)';
    }

    // Step 5: Success & Live Refresh
    sendProgress('success', normalizedStudent, `Pipeline complete! ID generated: ${finalRecord.SequentialId}`, {
      record: finalRecord,
      sheetSynced: sheetSyncSuccess
    });

    console.log(`[Pipeline] Pipeline finished successfully for ${finalRecord.SequentialId}!`);
    return finalRecord;

  } catch (error) {
    console.error('[Pipeline] Error in processing pipeline:', error);
    sendProgress('error', normalizedStudent, `Pipeline error: ${error.message}`);
    throw error;
  }
}

module.exports = {
  processVoicePipeline,
  registerPipelineCallback
};

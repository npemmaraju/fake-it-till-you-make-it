/* ═══════════════════════════════════════════
   VIDEO-ANALYSIS.JS
   Periodic body language analysis via Gemini Vision.
   Captures frames from self-video, sends to API,
   updates the body language panel in real-time.
═══════════════════════════════════════════ */

const BL_INTERVAL_MS = 15000;  // analyze every 15 seconds
const BL_COUNTDOWN_TICK = 1000;

/* ── Start periodic analysis ── */
function startBodyLanguageAnalysis() {
  if (!S.bodyLang.frameCanvas) {
    S.bodyLang.frameCanvas = document.createElement('canvas');
  }

  // Reset state
  S.bodyLang.readings = [];
  S.bodyLang.nextScanIn = BL_INTERVAL_MS / 1000;

  // Show waiting state
  renderBLWaiting('Analysis starts in 15s...');
  updateBLCountdown();

  // Run first analysis after initial delay
  S.bodyLang.intervalId = setInterval(runBodyLanguageCapture, BL_INTERVAL_MS);

  // Countdown ticker
  S.bodyLang.countdownId = setInterval(() => {
    S.bodyLang.nextScanIn = Math.max(0, S.bodyLang.nextScanIn - 1);
    updateBLCountdown();
    if (S.bodyLang.nextScanIn <= 0) {
      S.bodyLang.nextScanIn = BL_INTERVAL_MS / 1000;
    }
  }, BL_COUNTDOWN_TICK);
}

/* ── Stop analysis ── */
function stopBodyLanguageAnalysis() {
  clearInterval(S.bodyLang.intervalId);
  clearInterval(S.bodyLang.countdownId);
  S.bodyLang.intervalId = null;
  S.bodyLang.countdownId = null;
}

/* ── Capture + analyze a frame ── */
async function runBodyLanguageCapture() {
  S.bodyLang.nextScanIn = BL_INTERVAL_MS / 1000;

  if (!S.apiKey) {
    renderBLNoKey();
    return;
  }

  // Check if video is available
  const video = document.getElementById('self-video');
  if (!video || !S.stream || !S.camOn || video.readyState < 2) {
    if (!S.bodyLang.noVideoWarned) {
      renderBLNoVideo();
      S.bodyLang.noVideoWarned = true;
    }
    return;
  }

  // Set analyzing state
  const liveEl = document.getElementById('blp-live-label');
  if (liveEl) liveEl.textContent = 'ANALYZING...';

  // Capture frame — draw to canvas without CSS mirror transform
  const canvas = S.bodyLang.frameCanvas;
  const w = 320, h = 180;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Draw un-mirrored (CSS mirror is for display only, vision needs real orientation)
  ctx.drawImage(video, 0, 0, w, h);

  const base64 = canvas.toDataURL('image/jpeg', 0.72).replace('data:image/jpeg;base64,', '');

  // Call Gemini Vision
  const result = await analyzeBodyLanguage(base64);

  if (liveEl) liveEl.textContent = '● LIVE';

  if (result) {
    // Attach question index
    result.ts = Date.now();
    result.questionIndex = S.currentQ;
    S.bodyLang.readings.push(result);

    renderBLPanel(result);

    // Feed cheat signal to cheat detector
    if (result.cheatSignal && result.cheatSignal !== 'none') {
      processVideoCheatSignal(result.cheatSignal, S.currentQ);
    }
  } else {
    // Analysis failed — show last reading or placeholder
    if (S.bodyLang.readings.length > 0) {
      renderBLPanel(S.bodyLang.readings[S.bodyLang.readings.length - 1]);
    }
  }
}

/* ── Capture frame only (utility) ── */
function captureVideoFrame() {
  const video = document.getElementById('self-video');
  if (!video || video.readyState < 2) return null;

  const canvas = S.bodyLang.frameCanvas || document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 180;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, 320, 180);
  return canvas.toDataURL('image/jpeg', 0.72).replace('data:image/jpeg;base64,', '');
}

/* ── Render the BL panel with analysis results ── */
function renderBLPanel(result) {
  const body = document.getElementById('blp-body');
  if (!body) return;

  const eyeCls = scoreToClass(result.eyeContact);
  const posCls = scoreToClass(result.posture);
  const conCls = scoreToClass(result.confidence);

  body.innerHTML = `
    <div class="blp-metrics">
      ${blpMetric('Eye Contact', result.eyeContact, eyeCls)}
      ${blpMetric('Posture', result.posture, posCls)}
      ${blpMetric('Confidence', result.confidence, conCls)}
      <div class="blp-metric-row">
        <div class="blp-metric-header">
          <span class="blp-metric-name">Gestures</span>
          <span class="blp-gesture-tag ${result.gestures || 'natural'}">${capitalize(result.gestures || 'natural')}</span>
        </div>
      </div>
    </div>
    <div class="blp-verdict">
      <div class="blp-verdict-label">Coach Note</div>
      ${escapeHtml(result.verdict || 'No notes yet.')}
    </div>
    <div id="cheat-flags-section">
      ${renderCheatFlagsInline()}
    </div>`;
}

function blpMetric(name, val, cls) {
  return `<div class="blp-metric-row">
    <div class="blp-metric-header">
      <span class="blp-metric-name">${name}</span>
      <span class="blp-metric-val ${cls}">${val}</span>
    </div>
    <div class="blp-bar-track">
      <div class="blp-bar-fill ${cls}" style="width:${val}%"></div>
    </div>
  </div>`;
}

function renderCheatFlagsInline() {
  if (S.cheatFlags.length === 0) {
    return '<div class="cheat-flags-clean">No integrity flags</div>';
  }
  const typeLabels = {
    cadence: 'Cadence', ai_text: 'AI Language',
    gaze: 'Gaze', offscreen: 'Off-Screen'
  };
  return `<div class="cheat-flags-label">⚠ Flags (${S.cheatFlags.length})</div>` +
    S.cheatFlags.slice(-2).reverse().map(f => `
      <div class="cheat-flag-item">
        <div class="cheat-flag-type">${typeLabels[f.type] || f.type}</div>
        <div class="cheat-flag-detail">${escapeHtml(f.detail)}</div>
      </div>`).join('');
}

/* ── Waiting state ── */
function renderBLWaiting(msg) {
  const body = document.getElementById('blp-body');
  if (!body) return;
  body.innerHTML = `
    <div class="blp-waiting">
      <div class="blp-waiting-icon">◉</div>
      <div class="blp-waiting-text">${msg}<br><br>Camera must be on for body language analysis.</div>
    </div>
    <div id="cheat-flags-section">
      <div class="cheat-flags-clean">No integrity flags</div>
    </div>`;
}

function renderBLNoVideo() {
  renderBLWaiting('Camera is off or unavailable.<br>Turn on your camera for real-time body language analysis.');
}

function renderBLNoKey() {
  renderBLWaiting('Gemini API key required for body language analysis.');
}

/* ── Countdown display ── */
function updateBLCountdown() {
  const el = document.getElementById('blp-countdown');
  if (el) el.textContent = `${S.bodyLang.nextScanIn}s`;
}

/* ── Helpers ── */
function scoreToClass(n) {
  if (n >= 70) return 'hi';
  if (n >= 50) return 'mid';
  return 'lo';
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Get averaged body language for feedback report ── */
function getBodyLangSummary() {
  const readings = S.bodyLang.readings;
  if (readings.length === 0) return null;

  return {
    eyeContact: Math.round(readings.reduce((a, b) => a + b.eyeContact, 0) / readings.length),
    posture: Math.round(readings.reduce((a, b) => a + b.posture, 0) / readings.length),
    confidence: Math.round(readings.reduce((a, b) => a + b.confidence, 0) / readings.length),
    readingCount: readings.length,
    verdicts: readings.map(r => r.verdict).filter(Boolean)
  };
}

/* ═══════════════════════════════════════════
   SETUP.JS — Setup screen event handlers
═══════════════════════════════════════════ */

/* ── API Key ── */
function onApiKeyChange(el) {
  S.apiKey = el.value.trim();
  const statusEl = document.getElementById('api-key-status');
  const cfgEl    = document.getElementById('cfg-apikey');
  if (S.apiKey.length > 10) {
    statusEl.textContent = '✓ set';
    statusEl.className = 'apikey-status ok';
    if (cfgEl) cfgEl.textContent = '✓ set';
  } else {
    statusEl.textContent = 'not set';
    statusEl.className = 'apikey-status';
    if (cfgEl) cfgEl.textContent = '—';
  }
}

/* ── Company / Role inputs ── */
function setupInputListeners() {
  document.getElementById('company')?.addEventListener('input', e => {
    S.company = e.target.value.trim();
    const el = document.getElementById('cfg-company');
    if (el) el.textContent = S.company || '—';
    const lobbyEl = document.getElementById('lobby-company');
    if (lobbyEl) lobbyEl.textContent = S.company || 'this company?';
  });

  document.getElementById('jobtitle')?.addEventListener('input', e => {
    S.role = e.target.value.trim();
    const el = document.getElementById('cfg-role');
    if (el) el.textContent = S.role || '—';
  });

  document.getElementById('jd-text')?.addEventListener('input', e => {
    S.jdText = e.target.value.trim();
    const el = document.getElementById('cfg-jd');
    if (el) el.textContent = S.jdText.length > 0 ? S.jdText.length + ' chars' : '—';
  });
}

/* ── Round picker ── */
function pickRound(el) {
  document.querySelectorAll('.rtab').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  S.round = el.dataset.round;
  const el2 = document.getElementById('cfg-round');
  if (el2) el2.textContent = ROUND_NAMES[S.round] || S.round;
}

/* ── Mode picker ── */
function pickMode(el) {
  document.querySelectorAll('.mcard').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  S.mode = el.dataset.mode;
  const el2 = document.getElementById('cfg-mode');
  if (el2) el2.textContent = S.mode === 'real' ? 'Real Sim' : 'Learning';
}

/* ── Resume upload ── */
function handleResumeUpload(input) {
  if (!input.files.length) return;
  const f = input.files[0];
  S.resumeFile = f;
  S.resumeUploaded = true;

  document.getElementById('resume-drop').classList.add('uploaded');
  document.getElementById('resume-icon').textContent = '[ ✓ ]';
  document.getElementById('resume-text').textContent = f.name;
  const cfgEl = document.getElementById('cfg-resume');
  if (cfgEl) cfgEl.textContent = '✓ ' + f.name.slice(0, 16);

  // Extract text from file
  const reader = new FileReader();
  reader.onload = e => {
    // For text/txt files
    S.resumeText = e.target.result ? e.target.result.slice(0, 4000) : '';
  };

  if (f.type === 'application/pdf') {
    // Can't read PDF text directly — notify user
    showToast('PDF uploaded. For best results, also paste key resume content in the JD field.');
    S.resumeText = `[PDF resume: ${f.name}] — PDF text extraction not available in browser. Candidate uploaded their resume.`;
  } else {
    reader.readAsText(f);
  }
}

/* ── Launch (go to lobby) ── */
async function goToLobby() {
  S.company = document.getElementById('company')?.value.trim() || 'Target Company';
  S.role    = document.getElementById('jobtitle')?.value.trim() || 'Software Engineer';
  S.jdText  = document.getElementById('jd-text')?.value.trim() || '';
  S.apiKey  = document.getElementById('api-key')?.value.trim() || window.PREPAI_CONFIG?.geminiApiKey || '';

  // Populate lobby
  const lobbyCompany = document.getElementById('lobby-company');
  if (lobbyCompany) lobbyCompany.textContent = S.company;

  const lobbyRole = document.getElementById('lobby-role-label');
  if (lobbyRole) lobbyRole.textContent = S.role;

  const lobbyRound = document.getElementById('lobby-round-label');
  if (lobbyRound) lobbyRound.textContent = ROUND_NAMES[S.round];

  const lobbyMode = document.getElementById('lobby-mode-label');
  if (lobbyMode) lobbyMode.textContent = S.mode === 'real' ? 'Real Simulation' : 'Learning Mode';

  const lobbyInitials = document.getElementById('lobby-initials');
  if (lobbyInitials) lobbyInitials.textContent = (S.company || '?').slice(0, 2).toUpperCase();

  const lobbyNameTag = document.getElementById('lobby-name-tag');
  if (lobbyNameTag) lobbyNameTag.textContent = (S.role || 'Candidate').slice(0, 20);

  show('s-lobby');

  // Request media access
  try {
    S.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const lv = document.getElementById('lobby-video');
    if (lv) { lv.srcObject = S.stream; lv.style.display = 'block'; }
    const lobbyOff = document.getElementById('lobby-off');
    if (lobbyOff) lobbyOff.style.display = 'none';

    document.getElementById('cam-status-dot')?.classList.add('ok');
    const camLabel = document.getElementById('cam-label');
    if (camLabel) camLabel.textContent = 'Camera — active';

    document.getElementById('mic-status-dot')?.classList.add('ok');
    const micLabel = document.getElementById('mic-label');
    if (micLabel) micLabel.textContent = 'Microphone — active';

    setupLobbyMicAnalyser();
  } catch (e) {
    document.getElementById('cam-status-dot')?.classList.add('err');
    const camLabel = document.getElementById('cam-label');
    if (camLabel) camLabel.textContent = 'Camera — blocked';

    document.getElementById('mic-status-dot')?.classList.add('err');
    const micLabel = document.getElementById('mic-label');
    if (micLabel) micLabel.textContent = 'Microphone — blocked';

    showToast('Camera/mic access denied. Voice features may be limited.');
  }
}

/* ── Auto-fill API key from config.js if present ── */
function initFromConfig() {
  const configKey = window.PREPAI_CONFIG?.geminiApiKey;
  if (configKey && configKey !== 'YOUR_GEMINI_API_KEY_HERE') {
    const input = document.getElementById('api-key');
    if (input && !input.value) {
      input.value = configKey;
      onApiKeyChange(input);
    }
  }
}

// Initialize listeners when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  setupInputListeners();
  initFromConfig();
});

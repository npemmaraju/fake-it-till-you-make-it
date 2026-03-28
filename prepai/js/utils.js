/* ═══════════════════════════════════════════
   UTILS.JS — Shared utility functions
═══════════════════════════════════════════ */

/* ── Screen switching ── */
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

/* ── Loading Overlay ── */
function showOverlay(title, steps = []) {
  document.getElementById('ov-title').textContent = title;
  const stepsEl = document.getElementById('ov-steps');
  stepsEl.innerHTML = steps.map((s, i) => `
    <div class="ov-step" id="ov-step-${i}">
      <div class="ov-step-dot"></div>
      <span>${s}</span>
    </div>`).join('');
  document.getElementById('overlay').classList.add('show');
}

function setOverlayStep(index, state) {
  // state: 'active' | 'done' | 'pending'
  const el = document.getElementById(`ov-step-${index}`);
  if (!el) return;
  el.className = 'ov-step' + (state !== 'pending' ? ' ' + state : '');
}

function hideOverlay() {
  document.getElementById('overlay').classList.remove('show');
}

/* ── Toast ── */
function showToast(msg, dur = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), dur);
}

/* ── Score helpers ── */
function scoreText(text) {
  const words = text.trim().split(/\s+/).length;
  if (words < 10) return 'bad';
  if (words < 40) return 'ok';
  return 'good';
}

function scoreClass(n) {
  if (n >= 75) return 'sc-hi';
  if (n >= 55) return 'sc-md';
  return 'sc-lo';
}

/* ── Round labels ── */
const ROUND_NAMES = {
  hr: 'HR Round',
  resume: 'Resume Grilling'
};

/* ── Format time ── */
function formatTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/* ── Navigation helpers ── */
function goSetup() {
  clearInterval(S.timerInt);
  if (typeof setListeningState === 'function') setListeningState(false);
  if (typeof stopBodyLanguageAnalysis === 'function') stopBodyLanguageAnalysis();
  hideSelfTile();
  if (S.stream) { S.stream.getTracks().forEach(t => t.stop()); S.stream = null; }
  show('s-setup');
}

function rerunSame() {
  if (S.stream) show('s-lobby');
  else goToLobby();
}

/* ── Self-tile ── */
function showSelfTile() {
  const tile = document.getElementById('self-tile');
  const sv   = document.getElementById('self-video');
  if (S.stream) { sv.srcObject = S.stream; sv.play().catch(() => {}); }
  // Mirror via canvas flip for display, raw stream for analysis
  sv.style.transform = 'scaleX(-1)';
  tile.style.display = 'block';
}

function hideSelfTile() {
  document.getElementById('self-tile').style.display = 'none';
}

function toggleSelfView() {
  const tile = document.getElementById('self-tile');
  const btn  = document.getElementById('iv-selfview-btn');
  const isHidden = tile.style.display === 'none' || tile.style.display === '';
  if (isHidden) {
    showSelfTile();
    btn.style.background   = 'rgba(0,212,255,0.1)';
    btn.style.borderColor  = 'rgba(0,212,255,0.4)';
    btn.style.color        = 'var(--cyan)';
  } else {
    hideSelfTile();
    btn.style.background  = '';
    btn.style.borderColor = '';
    btn.style.color       = '';
  }
}

/* ── Toggle body language panel ── */
function toggleBLPanel() {
  const panel = document.querySelector('.body-lang-panel');
  const btn   = document.getElementById('iv-bl-toggle');
  S.bodyLang.panelOpen = !S.bodyLang.panelOpen;
  panel.classList.toggle('collapsed', !S.bodyLang.panelOpen);
  btn.classList.toggle('active', S.bodyLang.panelOpen);
  btn.textContent = S.bodyLang.panelOpen ? 'Hide Analysis' : 'Body Lang';
}

/* ── End session early ── */
function endEarly() {
  if (confirm('End session? You\'ll still get feedback on answered questions.')) {
    wrapUp();
  }
}

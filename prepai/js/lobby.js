/* ═══════════════════════════════════════════
   LOBBY.JS — Lobby screen: device checks, media controls
═══════════════════════════════════════════ */

/* ── Back to setup ── */
function goBack() {
  if (S.stream) { S.stream.getTracks().forEach(t => t.stop()); S.stream = null; }
  show('s-setup');
}

/* ── Camera toggle (lobby) ── */
function toggleCamera() {
  S.camOn = !S.camOn;
  if (S.stream) S.stream.getVideoTracks().forEach(t => t.enabled = S.camOn);

  const btn = document.getElementById('cam-btn');
  const lv  = document.getElementById('lobby-video');
  const off = document.getElementById('lobby-off');

  btn?.classList.toggle('off', !S.camOn);
  if (lv) lv.style.display = S.camOn ? 'block' : 'none';
  if (off) off.style.display = S.camOn ? 'none' : 'flex';
}

/* ── Mic toggle (lobby) ── */
function toggleMic() {
  S.micOn = !S.micOn;
  if (S.stream) S.stream.getAudioTracks().forEach(t => t.enabled = S.micOn);
  document.getElementById('mic-btn')?.classList.toggle('off', !S.micOn);
}

/* ── Video show preference ── */
function pickVideoShow(el) {
  document.querySelectorAll('.vq-opt').forEach(o => o.classList.remove('sel'));
  el.classList.add('sel');
  S.showVideo = el.dataset.show === 'yes';
}

/* ── Mic level analyser for lobby bars ── */
function setupLobbyMicAnalyser() {
  try {
    S.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    S.analyser = S.audioCtx.createAnalyser();
    S.analyser.fftSize = 32;
    const src = S.audioCtx.createMediaStreamSource(S.stream);
    src.connect(S.analyser);
    animateLobbyMicBars();
  } catch (e) {
    console.warn('AudioContext error:', e);
  }
}

function animateLobbyMicBars() {
  if (!S.analyser) return;
  const data = new Uint8Array(S.analyser.frequencyBinCount);
  const barIds = ['mb0', 'mb1', 'mb2', 'mb3', 'mb4'];
  const bars = barIds.map(id => document.getElementById(id));

  function frame() {
    if (!S.analyser) return;
    S.analyser.getByteFrequencyData(data);
    bars.forEach((b, i) => {
      if (b) {
        const h = Math.max(4, (data[i * 2] || 0) / 255 * 22);
        b.style.height = h + 'px';
      }
    });
    requestAnimationFrame(frame);
  }
  frame();
}

/* ── Join interview (from lobby) ── */
async function joinInterview() {
  // Reset state for new session
  S.questions = [...QBank[S.round]];
  S.totalQ    = S.mode === 'real' ? 6 : 8;
  S.currentQ  = 0;
  S.currentQDepth = 0;
  S.qHistory  = [];
  S.timerSec  = 0;
  S.conversationHistory = [];
  S.followUpQueue = [];
  S.cheatFlags = [];
  S.bodyLang.readings = [];
  S.bodyLang.noVideoWarned = false;
  S.researchIntel = '';
  S.researchDone = false;

  // Run research phase (shows overlay internally)
  await runResearchPhase();

  // Initialize interview screen
  initInterview();

  show('s-interview');

  // Show self-view tile if opted in
  if (S.stream && S.showVideo) {
    showSelfTile();
    const btn = document.getElementById('iv-selfview-btn');
    if (btn) {
      btn.style.background  = 'rgba(0,212,255,0.1)';
      btn.style.borderColor = 'rgba(0,212,255,0.4)';
      btn.style.color       = 'var(--cyan)';
    }
  }

  hideOverlay();

  // Start body language analysis (after a short delay to let UI settle)
  setTimeout(startBodyLanguageAnalysis, 2000);

  // Ask first question
  setTimeout(() => presentQuestion(), 600);
}

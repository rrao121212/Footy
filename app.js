// ============================================================
// FOOTY — Guess Their Level
// Firebase-powered social guessing game
// ============================================================

// ---- Constants ----
const LEVELS = [
  { id: 'rec', label: 'Rec', emoji: '🏃', desc: 'Weekend warriors' },
  { id: 'highschool', label: 'High School', emoji: '🎒', desc: 'Varsity ballers' },
  { id: 'academy', label: 'Academy', emoji: '⚡', desc: 'MLS Next / DA' },
  { id: 'college', label: 'College', emoji: '🎓', desc: 'D1 / D2 / D3' },
  { id: 'semipro', label: 'Semi-Pro', emoji: '💪', desc: 'USL / NISA' },
  { id: 'pro', label: 'Pro', emoji: '👑', desc: 'The real deal' },
];

const LEVEL_MAP = {};
LEVELS.forEach(l => { LEVEL_MAP[l.id] = l; });

const GRADIENTS = [
  'linear-gradient(135deg, #064e3b, #0a0a0a)',
  'linear-gradient(135deg, #1e3a5f, #0a0a0a)',
  'linear-gradient(135deg, #4a1942, #0a0a0a)',
  'linear-gradient(135deg, #3b1f0b, #0a0a0a)',
  'linear-gradient(135deg, #1a1a2e, #0a0a0a)',
];

const DEMO_CLIPS = [
  {
    id: 'demo-1',
    type: 'demo',
    username: 'tekdribbler',
    level: 'academy',
    description: 'Quick feet in training',
    emoji: '⚽',
    gradient: GRADIENTS[0],
    timestamp: Date.now() - 3600000,
    guessLog: generateFakeGuesses('academy', 134),
  },
  {
    id: 'demo-2',
    type: 'demo',
    username: 'crossbar_king',
    level: 'rec',
    description: 'Sunday league volley',
    emoji: '🥅',
    gradient: GRADIENTS[1],
    timestamp: Date.now() - 7200000,
    guessLog: generateFakeGuesses('rec', 87),
  },
  {
    id: 'demo-3',
    type: 'demo',
    username: 'silkytouch_10',
    level: 'pro',
    description: 'Match day highlights',
    emoji: '🏟️',
    gradient: GRADIENTS[2],
    timestamp: Date.now() - 10800000,
    guessLog: generateFakeGuesses('pro', 203),
  },
  {
    id: 'demo-4',
    type: 'demo',
    username: 'futsal_menace',
    level: 'semipro',
    description: 'Futsal skills compilation',
    emoji: '🔥',
    gradient: GRADIENTS[3],
    timestamp: Date.now() - 14400000,
    guessLog: generateFakeGuesses('semipro', 156),
  },
  {
    id: 'demo-5',
    type: 'demo',
    username: 'd1_bound',
    level: 'college',
    description: 'Showcase tournament clips',
    emoji: '🎓',
    gradient: GRADIENTS[4],
    timestamp: Date.now() - 18000000,
    guessLog: generateFakeGuesses('college', 98),
  },
];

function generateFakeGuesses(actualLevel, count) {
  const log = [];
  const weights = {};
  LEVELS.forEach(l => { weights[l.id] = 0.05; });
  weights[actualLevel] = 0.35;
  const idx = LEVELS.findIndex(l => l.id === actualLevel);
  if (idx > 0) weights[LEVELS[idx - 1].id] = 0.2;
  if (idx < LEVELS.length - 1) weights[LEVELS[idx + 1].id] = 0.2;
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  Object.keys(weights).forEach(k => { weights[k] /= total; });

  for (let i = 0; i < count; i++) {
    let r = Math.random();
    let cumulative = 0;
    for (const lvl of LEVELS) {
      cumulative += weights[lvl.id];
      if (r <= cumulative) {
        log.push(lvl.id);
        break;
      }
    }
  }
  return log;
}

// ---- Firebase ----
const firebaseConfig = {
  apiKey: "AIzaSyDe5RHV5VBNL875PJxErY3tnSjjMydpcII",
  authDomain: "footy-d9312.firebaseapp.com",
  projectId: "footy-d9312",
  storageBucket: "footy-d9312.firebasestorage.app",
  messagingSenderId: "496026308406",
  appId: "1:496026308406:web:5b28b109c801ddbdf56d97",
  measurementId: "G-N6RE2D6N7G"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

// ---- User ID (persistent local identifier) ----
function getOrCreateUserId() {
  let uid = localStorage.getItem('footy_userId');
  if (!uid) {
    uid = 'user-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem('footy_userId', uid);
  }
  return uid;
}

// ---- State ----
let state = {
  currentView: 'feed',
  userId: null,
  user: null,
  clips: [],
};

// ---- User Management ----
async function loadUser() {
  state.userId = getOrCreateUserId();

  try {
    const doc = await db.collection('users').doc(state.userId).get();
    if (doc.exists) {
      state.user = doc.data();
      return true;
    }
  } catch (e) {
    console.error('Failed to load user from Firestore:', e);
  }

  // Migrate legacy localStorage user data if present
  const legacy = localStorage.getItem('footy_user');
  if (legacy) {
    try {
      state.user = JSON.parse(legacy);
      await saveUser();
      localStorage.removeItem('footy_user');
      return true;
    } catch (e) {
      console.error('Failed to migrate legacy user:', e);
    }
  }

  return false;
}

async function saveUser() {
  if (!state.user || !state.userId) return;
  try {
    await db.collection('users').doc(state.userId).set(state.user);
  } catch (e) {
    console.error('Failed to save user:', e);
  }
}

async function createUser(name) {
  state.userId = getOrCreateUserId();
  state.user = {
    name: name.trim(),
    xp: 0,
    streak: 0,
    bestStreak: 0,
    totalGuesses: 0,
    correctGuesses: 0,
    guessedClips: {},
    createdAt: Date.now(),
  };
  await saveUser();
}

// ---- Clip Management ----
async function loadClips() {
  try {
    const snapshot = await db.collection('clips')
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();

    const firestoreClips = [];
    snapshot.forEach(doc => {
      firestoreClips.push({ id: doc.id, ...doc.data() });
    });
    state.clips = [...firestoreClips, ...DEMO_CLIPS];
  } catch (e) {
    console.error('Failed to load clips from Firestore:', e);
    state.clips = [...DEMO_CLIPS];
  }
}

async function saveClip(clipData) {
  // Upload video to Firebase Storage if present
  if (clipData.videoBlob) {
    const storageRef = storage.ref(`clips/${clipData.id}/video`);
    const uploadSnapshot = await storageRef.put(clipData.videoBlob);
    clipData.videoUrl = await uploadSnapshot.ref.getDownloadURL();
    delete clipData.videoBlob;
  }

  await db.collection('clips').doc(clipData.id).set(clipData);
  await loadClips();
}

async function deleteClip(clipId) {
  try {
    await storage.ref(`clips/${clipId}/video`).delete();
  } catch (e) {
    // Video may not exist in Storage — that's fine
  }

  await db.collection('clips').doc(clipId).delete();

  if (state.user && state.user.guessedClips[clipId]) {
    delete state.user.guessedClips[clipId];
    saveUser();
  }

  await loadClips();
}

// ---- Guess Logic ----
function getGuessDistribution(clip) {
  const dist = {};
  LEVELS.forEach(l => { dist[l.id] = 0; });
  const log = clip.guessLog || [];
  log.forEach(g => { dist[g] = (dist[g] || 0) + 1; });
  return dist;
}

function submitGuess(clipId, guessedLevel) {
  const clip = state.clips.find(c => c.id === clipId);
  if (!clip) return null;

  const correct = guessedLevel === clip.level;

  // Update local state immediately for responsive UI
  if (!clip.guessLog) clip.guessLog = [];
  clip.guessLog.push(guessedLevel);

  state.user.totalGuesses++;
  state.user.guessedClips[clipId] = guessedLevel;

  if (correct) {
    state.user.correctGuesses++;
    state.user.streak++;
    if (state.user.streak > state.user.bestStreak) {
      state.user.bestStreak = state.user.streak;
    }
    const xpGain = 10 + (state.user.streak - 1) * 2;
    state.user.xp += xpGain;
    saveUser(); // fire-and-forget
    updateHeaderStats();

    // Sync guess to Firestore in background
    if (clip.type !== 'demo') {
      const clipRef = db.collection('clips').doc(clipId);
      db.runTransaction(async (tx) => {
        const doc = await tx.get(clipRef);
        if (doc.exists) {
          const log = doc.data().guessLog || [];
          log.push(guessedLevel);
          tx.update(clipRef, { guessLog: log });
        }
      }).catch(e => console.error('Failed to sync guess:', e));
    }

    return { correct: true, xpGain, streak: state.user.streak };
  } else {
    state.user.streak = 0;
    saveUser();
    updateHeaderStats();

    if (clip.type !== 'demo') {
      const clipRef = db.collection('clips').doc(clipId);
      db.runTransaction(async (tx) => {
        const doc = await tx.get(clipRef);
        if (doc.exists) {
          const log = doc.data().guessLog || [];
          log.push(guessedLevel);
          tx.update(clipRef, { guessLog: log });
        }
      }).catch(e => console.error('Failed to sync guess:', e));
    }

    return { correct: false, xpGain: 0, streak: 0 };
  }
}

// ---- UI Helpers ----
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function updateHeaderStats() {
  if (!state.user) return;
  $('#xp-count').textContent = state.user.xp;
  $('#streak-count').textContent = state.user.streak;
}

function showXPPopup(xpGain, streak) {
  const popup = document.createElement('div');
  popup.className = 'xp-popup';
  popup.innerHTML = `
    <div class="bg-lime-500/20 border border-lime-500/30 rounded-full px-5 py-2 flex items-center gap-2">
      <span class="text-lime-400 font-bold text-sm">+${xpGain} XP</span>
      ${streak > 1 ? `<span class="text-cyan-400 text-xs font-semibold">🔥 ${streak} streak</span>` : ''}
    </div>
  `;
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 1600);
}

function spawnConfetti(x, y) {
  const container = document.createElement('div');
  container.className = 'confetti';
  container.style.left = x + 'px';
  container.style.top = y + 'px';

  const colors = ['#a3e635', '#22d3ee', '#f472b6', '#facc15', '#818cf8'];
  for (let i = 0; i < 20; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.left = (Math.random() - 0.5) * 120 + 'px';
    piece.style.animationDelay = Math.random() * 0.2 + 's';
    piece.style.animationDuration = (0.8 + Math.random() * 0.6) + 's';
    container.appendChild(piece);
  }

  document.body.appendChild(container);
  setTimeout(() => container.remove(), 2000);
}

function timeAgo(ts) {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ---- Routing ----
function navigate(view) {
  state.currentView = view;

  $$('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  renderView();
}

function renderView() {
  const container = $('#view-container');

  // Pause any playing videos before switching
  container.querySelectorAll('video').forEach(v => v.pause());

  switch (state.currentView) {
    case 'feed': renderFeed(container); break;
    case 'upload': renderUpload(container); break;
    case 'leaderboard': renderLeaderboard(container); break;
    case 'profile': renderProfile(container); break;
  }

  container.scrollTop = 0;
}

// ---- Feed View ----
function renderFeed(container) {
  if (state.clips.length === 0) {
    container.innerHTML = `
      <div class="empty-state view-enter">
        <div class="text-5xl mb-4">📹</div>
        <h3 class="font-display font-bold text-lg mb-2">No clips yet</h3>
        <p class="text-gray-500 text-sm mb-6">Be the first to upload a clip and let the world guess your level.</p>
        <button onclick="navigate('upload')" class="lock-in-btn" style="width:auto; padding:12px 28px;">
          Upload a Clip
        </button>
      </div>
    `;
    return;
  }

  let html = '<div class="view-enter" style="padding-bottom:20px;">';

  html += `
    <div class="px-4 pt-4 pb-2">
      <h2 class="font-display font-bold text-xl">Clip Feed</h2>
      <p class="text-gray-500 text-sm">Watch. Guess. Get humbled.</p>
    </div>
  `;

  state.clips.forEach(clip => {
    html += renderClipCard(clip);
  });

  html += '</div>';
  container.innerHTML = html;

  attachFeedListeners(container);
}

function renderClipCard(clip) {
  const isGuessed = state.user && state.user.guessedClips[clip.id];
  const isOwnClip = clip.type !== 'demo' && clip.uploadedBy === state.userId;
  const level = LEVEL_MAP[clip.level];

  let videoArea = '';
  if (clip.type === 'demo') {
    videoArea = `
      <div class="demo-placeholder" style="background:${clip.gradient}">
        <div class="demo-emoji">${clip.emoji}</div>
        <div class="demo-label">${escapeHtml(clip.description)}</div>
      </div>
    `;
  } else if (clip.videoUrl) {
    videoArea = `
      <video
        src="${clip.videoUrl}"
        preload="metadata"
        loop
        playsinline
        muted
        crossorigin="anonymous"
        data-clip-id="${clip.id}"
      ></video>
      <div class="play-overlay" data-clip-id="${clip.id}">
        <div class="play-icon">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </div>
    `;
  } else {
    // Clip without video — show placeholder
    const hue = Math.abs(clip.id.split('').reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0)) % 360;
    videoArea = `
      <div class="demo-placeholder" style="background:linear-gradient(135deg, hsl(${hue},40%,15%), #0a0a0a)">
        <div class="demo-emoji">🎬</div>
        <div class="demo-label">${escapeHtml(clip.description || 'Video clip')}</div>
      </div>
    `;
  }

  const userInitial = clip.username ? clip.username[0].toUpperCase() : '?';
  const color = avatarColor(clip.username || 'anon');

  let bottomSection = '';

  if (isOwnClip) {
    const dist = getGuessDistribution(clip);
    const total = clip.guessLog ? clip.guessLog.length : 0;
    bottomSection = renderOwnClipStats(clip, dist, total);
  } else if (isGuessed) {
    const guessedLevel = state.user.guessedClips[clip.id];
    bottomSection = renderRevealSection(clip, guessedLevel);
  } else {
    bottomSection = renderGuessUI(clip);
  }

  return `
    <div class="clip-card" id="clip-${clip.id}">
      <div class="clip-video-area">
        ${videoArea}
      </div>
      <div class="px-4 py-3">
        <div class="flex items-center gap-2.5 mb-3">
          <div class="lb-avatar" style="background:${color}; width:32px; height:32px; font-size:13px;">
            ${userInitial}
          </div>
          <div class="flex-1 min-w-0">
            <p class="font-semibold text-sm truncate">@${escapeHtml(clip.username)}</p>
            <p class="text-gray-500 text-xs">${timeAgo(clip.timestamp)}</p>
          </div>
          ${isOwnClip ? `
            <button class="delete-clip-btn text-gray-600 hover:text-red-400 transition-colors p-1" data-clip-id="${clip.id}" title="Delete clip">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/>
              </svg>
            </button>
          ` : ''}
        </div>
        ${clip.description && !isOwnClip ? `<p class="text-gray-400 text-sm mb-3">${escapeHtml(clip.description)}</p>` : ''}
        <div id="clip-bottom-${clip.id}">
          ${bottomSection}
        </div>
      </div>
    </div>
  `;
}

function renderGuessUI(clip) {
  const pills = LEVELS.map(l => `
    <button class="guess-pill" data-clip-id="${clip.id}" data-level="${l.id}">
      <span class="pill-emoji">${l.emoji}</span>
      ${l.label}
    </button>
  `).join('');

  return `
    <div class="guess-section">
      <p class="text-sm font-semibold mb-2.5 text-gray-300">What level is this player?</p>
      <div class="flex flex-wrap gap-2 mb-3">${pills}</div>
      <button class="lock-in-btn" data-clip-id="${clip.id}" disabled>
        Pick a level to guess
      </button>
    </div>
  `;
}

function renderRevealSection(clip, guessedLevel) {
  const correct = guessedLevel === clip.level;
  const actual = LEVEL_MAP[clip.level];
  const guessed = LEVEL_MAP[guessedLevel];
  const dist = getGuessDistribution(clip);
  const total = clip.guessLog ? clip.guessLog.length : 0;

  let barsHtml = LEVELS.map(l => {
    const count = dist[l.id] || 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const isActual = l.id === clip.level;
    const isGuess = l.id === guessedLevel;
    const barColor = isActual ? 'background:#a3e635' : 'background:rgba(255,255,255,0.1)';

    return `
      <div class="flex items-center gap-2 text-xs mb-1.5">
        <span class="w-16 text-right truncate ${isActual ? 'text-lime-400 font-semibold' : 'text-gray-500'}">${l.emoji} ${l.label}</span>
        <div class="flex-1 h-4 bg-white/5 rounded overflow-hidden">
          <div class="vote-bar-fill" style="width:${pct}%; ${barColor}"></div>
        </div>
        <span class="w-8 text-gray-500 ${isActual ? 'text-lime-400 font-semibold' : ''}">${pct}%</span>
        ${isGuess && !isActual ? '<span class="text-xs">👈</span>' : ''}
        ${isActual ? '<span class="text-xs">✅</span>' : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="reveal-container ${correct ? 'reveal-correct' : 'reveal-wrong'}">
      <div class="flex items-center gap-2 mb-3 p-2.5 rounded-xl ${correct ? 'bg-lime-500/10 border border-lime-500/20' : 'bg-red-500/10 border border-red-500/20'}">
        <span class="text-xl">${correct ? '✅' : '❌'}</span>
        <div>
          <p class="text-sm font-bold ${correct ? 'text-lime-400' : 'text-red-400'}">
            ${correct ? 'Nailed it!' : 'Not quite'}
          </p>
          <p class="text-xs text-gray-400">
            Actual level: <span class="font-semibold text-white">${actual.emoji} ${actual.label}</span>
            ${!correct ? ` · You guessed: ${guessed.emoji} ${guessed.label}` : ''}
          </p>
        </div>
      </div>
      <div class="mt-2">
        <p class="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">How the crowd voted (${total})</p>
        ${barsHtml}
      </div>
    </div>
  `;
}

function renderOwnClipStats(clip, dist, total) {
  const level = LEVEL_MAP[clip.level];

  if (total === 0) {
    return `
      <div class="text-center py-3">
        <p class="text-gray-500 text-sm">No guesses yet. Share your clip!</p>
        <p class="text-xs text-gray-600 mt-1">Your level: ${level.emoji} ${level.label}</p>
      </div>
    `;
  }

  const correctCount = dist[clip.level] || 0;
  const correctPct = Math.round((correctCount / total) * 100);

  let barsHtml = LEVELS.map(l => {
    const count = dist[l.id] || 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const isActual = l.id === clip.level;
    const barColor = isActual ? 'background:#a3e635' : 'background:rgba(255,255,255,0.1)';

    return `
      <div class="flex items-center gap-2 text-xs mb-1.5">
        <span class="w-16 text-right truncate ${isActual ? 'text-lime-400 font-semibold' : 'text-gray-500'}">${l.emoji} ${l.label}</span>
        <div class="flex-1 h-4 bg-white/5 rounded overflow-hidden">
          <div class="vote-bar-fill" style="width:${pct}%; ${barColor}"></div>
        </div>
        <span class="w-8 text-gray-500 ${isActual ? 'text-lime-400 font-semibold' : ''}">${pct}%</span>
      </div>
    `;
  }).join('');

  return `
    <div>
      <div class="flex items-center gap-2 mb-3 p-2.5 rounded-xl bg-white/5 border border-white/10">
        <span class="text-lg">${level.emoji}</span>
        <div>
          <p class="text-sm font-semibold">Your clip · <span class="text-lime-400">${level.label}</span></p>
          <p class="text-xs text-gray-500">${total} guesses · ${correctPct}% got it right</p>
        </div>
      </div>
      ${barsHtml}
    </div>
  `;
}

function attachFeedListeners(container) {
  // Guess pill selection
  container.querySelectorAll('.guess-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const clipId = pill.dataset.clipId;
      const level = pill.dataset.level;

      container.querySelectorAll(`.guess-pill[data-clip-id="${clipId}"]`).forEach(p => {
        p.classList.remove('selected');
      });
      pill.classList.add('selected');

      const lockBtn = container.querySelector(`.lock-in-btn[data-clip-id="${clipId}"]`);
      if (lockBtn) {
        lockBtn.disabled = false;
        lockBtn.textContent = 'Lock In Guess';
      }
    });
  });

  // Lock-in button
  container.querySelectorAll('.lock-in-btn[data-clip-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const clipId = btn.dataset.clipId;
      const selectedPill = container.querySelector(`.guess-pill.selected[data-clip-id="${clipId}"]`);
      if (!selectedPill) return;

      const guessedLevel = selectedPill.dataset.level;
      const result = submitGuess(clipId, guessedLevel);
      if (!result) return;

      // Replace guess section with reveal
      const clip = state.clips.find(c => c.id === clipId);
      const bottomEl = container.querySelector(`#clip-bottom-${clipId}`);
      if (bottomEl && clip) {
        bottomEl.innerHTML = renderRevealSection(clip, guessedLevel);

        // Trigger vote bar animations
        setTimeout(() => {
          bottomEl.querySelectorAll('.vote-bar-fill').forEach(bar => {
            const w = bar.style.width;
            bar.style.width = '0%';
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                bar.style.width = w;
              });
            });
          });
        }, 50);
      }

      if (result.correct) {
        showXPPopup(result.xpGain, result.streak);
        const rect = btn.getBoundingClientRect();
        spawnConfetti(rect.left + rect.width / 2, rect.top);
      }
    });
  });

  // Video play/pause
  container.querySelectorAll('.play-overlay').forEach(overlay => {
    overlay.addEventListener('click', () => {
      const clipId = overlay.dataset.clipId;
      const video = container.querySelector(`video[data-clip-id="${clipId}"]`);
      if (!video) return;

      if (video.paused) {
        container.querySelectorAll('video').forEach(v => {
          if (v !== video) v.pause();
        });
        container.querySelectorAll('.play-overlay').forEach(o => o.classList.remove('hidden'));
        video.play();
        overlay.classList.add('hidden');
      } else {
        video.pause();
        overlay.classList.remove('hidden');
      }
    });
  });

  // Delete clip buttons
  container.querySelectorAll('.delete-clip-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const clipId = btn.dataset.clipId;
      if (confirm('Delete this clip?')) {
        await deleteClip(clipId);
        renderFeed(container);
      }
    });
  });
}

// ---- Upload View ----
function renderUpload(container) {
  container.innerHTML = `
    <div class="view-enter p-4" style="padding-bottom:20px;">
      <div class="mb-6">
        <h2 class="font-display font-bold text-xl mb-1">Upload a Clip</h2>
        <p class="text-gray-500 text-sm">Show the world what you got. Let them guess your level.</p>
      </div>

      <!-- Video Dropzone -->
      <div class="mb-5">
        <label class="form-label">Your Clip</label>
        <div id="upload-dropzone" class="upload-dropzone">
          <div id="dropzone-empty">
            <div class="text-4xl mb-3">📹</div>
            <p class="text-gray-400 text-sm font-medium mb-1">Tap to select a video</p>
            <p class="text-gray-600 text-xs">MP4, MOV, or WebM · Max 50MB</p>
          </div>
          <div id="dropzone-preview" class="hidden">
            <video id="upload-preview" class="w-full rounded-xl" style="max-height:300px; object-fit:cover;" playsinline muted loop></video>
            <button id="clear-video" class="mt-2 text-red-400 text-xs font-medium hover:text-red-300">Remove video</button>
          </div>
        </div>
        <input type="file" id="upload-file-input" accept="video/*" class="hidden">
      </div>

      <!-- Display Name -->
      <div class="mb-5">
        <label class="form-label">Display Name</label>
        <input
          type="text"
          id="upload-name"
          value="${state.user ? escapeHtml(state.user.name) : ''}"
          placeholder="Your name"
          maxlength="20"
          class="form-input"
        >
      </div>

      <!-- Description -->
      <div class="mb-5">
        <label class="form-label">Description <span class="text-gray-600 font-normal">(optional)</span></label>
        <input
          type="text"
          id="upload-desc"
          placeholder="Quick feet in training..."
          maxlength="60"
          class="form-input"
        >
      </div>

      <!-- Level Selection -->
      <div class="mb-6">
        <label class="form-label">Your Real Level <span class="text-lime-400">*</span></label>
        <p class="text-gray-600 text-xs mb-3">This gets revealed after people guess. Be honest.</p>
        <div class="flex flex-col gap-2" id="level-selector">
          ${LEVELS.map(l => `
            <div class="level-option" data-level="${l.id}">
              <span class="lo-emoji">${l.emoji}</span>
              <div>
                <div class="lo-label">${l.label}</div>
                <div class="lo-desc">${l.desc}</div>
              </div>
              <div class="lo-check">
                <svg class="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3" style="display:none;">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                </svg>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Submit -->
      <button id="upload-submit" class="lock-in-btn" disabled>
        Select a video and level
      </button>

      <!-- Upload success -->
      <div id="upload-success" class="hidden text-center py-8">
        <div class="text-5xl mb-3">🎉</div>
        <h3 class="font-display font-bold text-xl mb-2">Clip uploaded!</h3>
        <p class="text-gray-400 text-sm mb-6">Your clip is live. Time for the world to guess.</p>
        <button onclick="navigate('feed')" class="lock-in-btn" style="width:auto; padding:12px 28px;">
          View in Feed
        </button>
      </div>
    </div>
  `;

  attachUploadListeners(container);
}

function attachUploadListeners(container) {
  let selectedFile = null;
  let selectedLevel = null;

  const dropzone = container.querySelector('#upload-dropzone');
  const fileInput = container.querySelector('#upload-file-input');
  const preview = container.querySelector('#upload-preview');
  const dropzoneEmpty = container.querySelector('#dropzone-empty');
  const dropzonePreview = container.querySelector('#dropzone-preview');
  const clearBtn = container.querySelector('#clear-video');
  const submitBtn = container.querySelector('#upload-submit');
  const successEl = container.querySelector('#upload-success');

  function updateSubmitState() {
    const nameVal = container.querySelector('#upload-name').value.trim();
    if (selectedFile && selectedLevel && nameVal) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Upload Clip';
    } else {
      submitBtn.disabled = true;
      const missing = [];
      if (!selectedFile) missing.push('video');
      if (!selectedLevel) missing.push('level');
      if (!nameVal) missing.push('name');
      submitBtn.textContent = `Select ${missing.join(' and ')}`;
    }
  }

  dropzone.addEventListener('click', (e) => {
    if (e.target.closest('#clear-video')) return;
    fileInput.click();
  });

  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave', () => { dropzone.classList.remove('drag-over'); });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) {
      handleFileSelect(file);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) {
      handleFileSelect(fileInput.files[0]);
    }
  });

  function handleFileSelect(file) {
    if (file.size > 50 * 1024 * 1024) {
      alert('Video must be under 50MB');
      return;
    }
    selectedFile = file;
    const url = URL.createObjectURL(file);
    preview.src = url;
    preview.play();
    dropzoneEmpty.classList.add('hidden');
    dropzonePreview.classList.remove('hidden');
    dropzone.classList.add('has-file');
    updateSubmitState();
  }

  clearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedFile = null;
    if (preview.src) {
      URL.revokeObjectURL(preview.src);
      preview.src = '';
    }
    fileInput.value = '';
    dropzoneEmpty.classList.remove('hidden');
    dropzonePreview.classList.add('hidden');
    dropzone.classList.remove('has-file');
    updateSubmitState();
  });

  container.querySelectorAll('.level-option').forEach(opt => {
    opt.addEventListener('click', () => {
      container.querySelectorAll('.level-option').forEach(o => {
        o.classList.remove('selected');
        o.querySelector('svg').style.display = 'none';
      });
      opt.classList.add('selected');
      opt.querySelector('svg').style.display = 'block';
      selectedLevel = opt.dataset.level;
      updateSubmitState();
    });
  });

  container.querySelector('#upload-name').addEventListener('input', updateSubmitState);

  submitBtn.addEventListener('click', async () => {
    if (!selectedFile || !selectedLevel) return;

    const name = container.querySelector('#upload-name').value.trim();
    const desc = container.querySelector('#upload-desc').value.trim();

    if (!name) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading... 0%';

    try {
      const clipId = 'clip-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      const blob = new Blob([await selectedFile.arrayBuffer()], { type: selectedFile.type });

      // Upload video to Firebase Storage with progress + timeout
      let videoUrl = null;
      try {
        const storageRef = storage.ref(`clips/${clipId}/video`);
        const uploadTask = storageRef.put(blob);

        const storageUpload = new Promise((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => {
              const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
              submitBtn.textContent = `Uploading... ${progress}%`;
            },
            (err) => reject(err),
            () => resolve()
          );
        });

        const timeout = new Promise((_, reject) =>
          setTimeout(() => {
            uploadTask.cancel();
            reject(new Error('Upload timed out'));
          }, 60000)
        );

        await Promise.race([storageUpload, timeout]);
        videoUrl = await uploadTask.snapshot.ref.getDownloadURL();
      } catch (storageErr) {
        console.warn('Video upload skipped:', storageErr.message || storageErr);
      }

      submitBtn.textContent = 'Saving...';

      const clip = {
        id: clipId,
        type: 'user',
        username: name,
        uploadedBy: state.userId,
        level: selectedLevel,
        description: desc,
        timestamp: Date.now(),
        guessLog: [],
      };

      if (videoUrl) {
        clip.videoUrl = videoUrl;
      }

      await db.collection('clips').doc(clipId).set(clip);
      await loadClips();

      // Update user name if changed
      if (name !== state.user.name) {
        state.user.name = name;
        saveUser();
      }

      // Show success
      container.querySelector('.view-enter').querySelectorAll(':scope > :not(#upload-success)').forEach(el => {
        el.classList.add('hidden');
      });
      successEl.classList.remove('hidden');

      spawnConfetti(window.innerWidth / 2, window.innerHeight / 2);
    } catch (e) {
      console.error('Upload failed:', e);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Upload failed. Try again.';
    }
  });
}

// ---- Leaderboard View ----
function renderLeaderboard(container) {
  // Show loading state immediately
  container.innerHTML = `
    <div class="view-enter">
      <div class="px-4 pt-4 pb-2">
        <h2 class="font-display font-bold text-xl mb-1">Leaderboard</h2>
        <p class="text-gray-500 text-sm">Top scouts ranked by XP</p>
      </div>
      <div class="text-center py-8">
        <p class="text-gray-500 text-sm">Loading...</p>
      </div>
    </div>
  `;

  // Fetch leaderboard from Firestore async
  _loadAndRenderLeaderboard(container);
}

async function _loadAndRenderLeaderboard(container) {
  let allUsers = [];

  try {
    const snapshot = await db.collection('users')
      .orderBy('xp', 'desc')
      .limit(50)
      .get();

    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.totalGuesses > 0) {
        allUsers.push({
          name: data.name,
          guesses: data.totalGuesses || 0,
          correct: data.correctGuesses || 0,
          xp: data.xp || 0,
          isCurrentUser: doc.id === state.userId,
        });
      }
    });
  } catch (e) {
    console.error('Failed to load leaderboard:', e);
  }

  // If no real users in Firestore yet, use seed data so board isn't empty
  if (allUsers.length === 0) {
    allUsers = [
      { name: 'silkytouch_10', guesses: 312, correct: 189, xp: 2340 },
      { name: 'scoutmaster', guesses: 287, correct: 168, xp: 2010 },
      { name: 'tekdribbler', guesses: 245, correct: 137, xp: 1780 },
      { name: 'futbol_iq', guesses: 198, correct: 109, xp: 1420 },
      { name: 'd1_bound', guesses: 176, correct: 92, xp: 1180 },
      { name: 'crossbar_king', guesses: 154, correct: 77, xp: 980 },
      { name: 'pitch_vision', guesses: 132, correct: 64, xp: 820 },
      { name: 'nutmeg_nation', guesses: 98, correct: 45, xp: 590 },
    ];

    if (state.user && state.user.totalGuesses > 0) {
      allUsers.push({
        name: state.user.name,
        guesses: state.user.totalGuesses,
        correct: state.user.correctGuesses,
        xp: state.user.xp,
        isCurrentUser: true,
      });
    }

    allUsers.sort((a, b) => b.xp - a.xp);
  }

  const rankColors = ['#facc15', '#d1d5db', '#cd7f32'];

  const rows = allUsers.map((u, i) => {
    const accuracy = u.guesses > 0 ? Math.round((u.correct / u.guesses) * 100) : 0;
    const color = avatarColor(u.name);
    const isMe = u.isCurrentUser;
    const initial = u.name[0].toUpperCase();

    return `
      <div class="lb-row ${isMe ? 'bg-lime-500/5' : ''}">
        <div class="lb-rank" style="background:${i < 3 ? rankColors[i] + '22' : 'rgba(255,255,255,0.05)'}; color:${i < 3 ? rankColors[i] : '#6b7280'};">
          ${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
        </div>
        <div class="lb-avatar" style="background:${color}">
          ${initial}
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-sm truncate ${isMe ? 'text-lime-400' : ''}">
            @${escapeHtml(u.name)} ${isMe ? '(you)' : ''}
          </p>
          <p class="text-gray-500 text-xs">${accuracy}% accuracy · ${u.guesses} guesses</p>
        </div>
        <div class="text-right">
          <p class="font-display font-bold text-sm gradient-text">${u.xp}</p>
          <p class="text-gray-600 text-[10px]">XP</p>
        </div>
      </div>
    `;
  }).join('');

  // Only update if we're still on the leaderboard view
  if (state.currentView !== 'leaderboard') return;

  container.innerHTML = `
    <div class="view-enter">
      <div class="px-4 pt-4 pb-2">
        <h2 class="font-display font-bold text-xl mb-1">Leaderboard</h2>
        <p class="text-gray-500 text-sm">Top scouts ranked by XP</p>
      </div>
      <div class="mt-2">
        ${rows}
      </div>
      ${!state.user || state.user.totalGuesses === 0 ? `
        <div class="text-center py-8 px-4">
          <p class="text-gray-600 text-sm">Start guessing to appear on the board</p>
          <button onclick="navigate('feed')" class="lock-in-btn mt-3" style="width:auto; padding:10px 24px; font-size:13px;">
            Go to Feed
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

// ---- Profile View ----
function renderProfile(container) {
  if (!state.user) {
    container.innerHTML = '<div class="empty-state"><p class="text-gray-500">Loading...</p></div>';
    return;
  }

  const u = state.user;
  const accuracy = u.totalGuesses > 0 ? Math.round((u.correctGuesses / u.totalGuesses) * 100) : 0;
  const color = avatarColor(u.name);
  const initial = u.name[0].toUpperCase();
  const myClips = state.clips.filter(c => c.type !== 'demo' && c.uploadedBy === state.userId);
  const totalClipGuesses = myClips.reduce((sum, c) => sum + (c.guessLog ? c.guessLog.length : 0), 0);

  let scoutTitle = 'Rookie Scout';
  if (u.xp >= 2000) scoutTitle = 'Elite Scout';
  else if (u.xp >= 1000) scoutTitle = 'Expert Scout';
  else if (u.xp >= 500) scoutTitle = 'Senior Scout';
  else if (u.xp >= 200) scoutTitle = 'Scout';
  else if (u.xp >= 50) scoutTitle = 'Junior Scout';

  container.innerHTML = `
    <div class="view-enter p-4" style="padding-bottom:20px;">
      <!-- Profile header -->
      <div class="text-center mb-6">
        <div class="lb-avatar mx-auto mb-3" style="background:${color}; width:64px; height:64px; font-size:28px;">
          ${initial}
        </div>
        <h2 class="font-display font-bold text-xl">@${escapeHtml(u.name)}</h2>
        <p class="text-lime-400 text-sm font-medium">${scoutTitle}</p>
      </div>

      <!-- Stats grid -->
      <div class="grid grid-cols-2 gap-3 mb-6">
        <div class="stat-card">
          <div class="stat-value gradient-text">${u.xp}</div>
          <div class="stat-label">Total XP</div>
        </div>
        <div class="stat-card">
          <div class="stat-value text-cyan-400">${accuracy}%</div>
          <div class="stat-label">Accuracy</div>
        </div>
        <div class="stat-card">
          <div class="stat-value text-white">${u.totalGuesses}</div>
          <div class="stat-label">Total Guesses</div>
        </div>
        <div class="stat-card">
          <div class="stat-value text-amber-400">${u.bestStreak}</div>
          <div class="stat-label">Best Streak</div>
        </div>
      </div>

      <!-- My clips -->
      <div class="mb-6">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-display font-bold text-base">My Clips</h3>
          <span class="text-gray-500 text-xs">${myClips.length} clip${myClips.length !== 1 ? 's' : ''} · ${totalClipGuesses} guesses</span>
        </div>
        ${myClips.length === 0 ? `
          <div class="text-center py-6 bg-dark-800 rounded-xl border border-white/5">
            <p class="text-gray-500 text-sm mb-3">You haven't uploaded any clips yet</p>
            <button onclick="navigate('upload')" class="text-lime-400 text-sm font-semibold hover:text-lime-300">
              Upload your first clip →
            </button>
          </div>
        ` : myClips.map(clip => {
          const level = LEVEL_MAP[clip.level];
          const guessCount = clip.guessLog ? clip.guessLog.length : 0;
          return `
            <div class="flex items-center gap-3 p-3 bg-dark-800 rounded-xl border border-white/5 mb-2">
              <div class="w-12 h-12 rounded-lg bg-dark-700 flex items-center justify-center text-xl flex-shrink-0">
                ${level.emoji}
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">${clip.description || 'Untitled clip'}</p>
                <p class="text-xs text-gray-500">${level.label} · ${guessCount} guesses · ${timeAgo(clip.timestamp)}</p>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Actions -->
      <div class="space-y-3">
        <button onclick="navigate('upload')" class="lock-in-btn">
          Upload New Clip
        </button>
        <button id="reset-btn" class="w-full py-3 rounded-full border border-white/10 text-gray-400 text-sm font-medium hover:border-red-500/30 hover:text-red-400 transition-colors">
          Reset All Data
        </button>
      </div>
    </div>
  `;

  // Reset handler
  container.querySelector('#reset-btn')?.addEventListener('click', async () => {
    if (confirm('Reset all data? This will delete your stats. Your uploaded clips will remain. This cannot be undone.')) {
      // Delete user document from Firestore
      try {
        await db.collection('users').doc(state.userId).delete();
      } catch (e) {
        console.error('Failed to delete user from Firestore:', e);
      }

      localStorage.removeItem('footy_userId');
      localStorage.removeItem('footy_user');
      state.user = null;
      state.userId = null;
      state.clips = [...DEMO_CLIPS];

      // Show onboarding
      $('#onboarding-modal').classList.remove('hidden');
    }
  });
}

// ---- Onboarding ----
function initOnboarding() {
  const modal = $('#onboarding-modal');
  const nameInput = $('#onboard-name');
  const submitBtn = $('#onboard-submit');

  nameInput.addEventListener('input', () => {
    submitBtn.disabled = !nameInput.value.trim();
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && nameInput.value.trim()) {
      completeOnboarding();
    }
  });

  submitBtn.addEventListener('click', completeOnboarding);

  async function completeOnboarding() {
    const name = nameInput.value.trim();
    if (!name) return;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Setting up...';
    await createUser(name);
    modal.classList.add('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = "Let's Go";
    updateHeaderStats();
    renderView();
  }
}

// ---- Tab Bar ----
function initTabBar() {
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      navigate(btn.dataset.view);
    });
  });
}

// ---- Init ----
async function init() {
  initOnboarding();
  initTabBar();

  const hasUser = await loadUser();
  if (!hasUser) {
    $('#onboarding-modal').classList.remove('hidden');
  } else {
    updateHeaderStats();
  }

  await loadClips();
  renderView();
}

init();

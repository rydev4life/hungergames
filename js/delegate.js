import {
  db, ref, set, push, onValue, update, get, serverTimestamp,
  ELITES, TRIBUTES_INIT, SPONSOR_ITEMS, getSession, clearSession, formatTime, showToast,
  snapToArray, snapToArrayWithKeys
} from './firebase.js';

// ── AUTH ─────────────────────────────────────────────────────
const session = getSession();
if (!session) { window.location.href = 'index.html'; }
const { eliteId, name } = session;
const elite = ELITES[eliteId];

// topUserName may not exist anymore — set identity badge instead
const topUserNameEl = document.getElementById('topUserName');
if (topUserNameEl) topUserNameEl.textContent = name;
const topIdentityEl = document.getElementById('topIdentityName');
if (topIdentityEl) topIdentityEl.textContent = `${name} · ${elite.title}`;

// Fullscreen toggle
window.toggleDelegateFullscreen = function() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen();
  }
};

// Update fullscreen button icon on state change
document.addEventListener('fullscreenchange', () => {
  const btn = document.querySelector('[onclick="toggleDelegateFullscreen()"]');
  if (!btn) return;
  if (document.fullscreenElement) {
    btn.innerHTML = '<i class="ti ti-minimize"></i> EXIT FULL';
  } else {
    btn.innerHTML = '<i class="ti ti-maximize"></i> FULLSCREEN';
  }
});

function refreshCreditsDisplay(credits) {
  document.getElementById('topCredits').textContent = `${credits} ₡`;
  document.getElementById('creditsDisplay').textContent = credits;
}

// ── CENTRE NOTIFICATION MODAL ────────────────────────────────
window.closeCentreNotification = function() {
  const overlay = document.getElementById('centreNotifOverlay');
  if (overlay) overlay.classList.remove('visible');
};

function showCentreNotification(title, body, accentColor) {
  const overlay = document.getElementById('centreNotifOverlay');
  const titleEl = document.getElementById('centreNotifTitle');
  const bodyEl = document.getElementById('centreNotifBody');
  const bar = document.getElementById('centreNotifBar');
  if (!overlay || !titleEl || !bodyEl) return;

  titleEl.textContent = title;
  bodyEl.innerHTML = body;
  if (bar) bar.style.background = accentColor || 'var(--gold)';
  overlay.classList.add('visible');
}

window.doLogout = async function () {
  // Remove active session from Firebase
  try { await set(ref(db, `activeSessions/${eliteId}`), null); } catch(e) {}
  clearSession();
  window.location.href = 'index.html';
};

// ── SYSTEM SIGNAL (force logout on reset) ────────────────────
onValue(ref(db, 'systemSignal'), snap => {
  if (!snap.exists()) return;
  const signal = snap.val();
  if (signal && signal.action === 'force_logout') {
    // Wipe local session and redirect to login
    try { set(ref(db, `activeSessions/${eliteId}`), null); } catch(e) {}
    clearSession();
    // Show message then redirect
    document.body.innerHTML = `
      <div style="height:100vh;display:flex;align-items:center;justify-content:center;background:#070707;font-family:'Cinzel',serif;text-align:center;">
        <div style="color:#C9A84C;">
          <div style="font-size:32px;margin-bottom:16px;">⚜</div>
          <div style="font-size:16px;letter-spacing:3px;margin-bottom:8px;">SESSION ENDED</div>
          <div style="font-size:12px;color:#7A612A;letter-spacing:2px;">The Gamemakers have reset the committee.<br>Returning to Capitol access portal...</div>
        </div>
      </div>`;
    setTimeout(() => { window.location.href = 'index.html'; }, 3000);
  }
});

// ── GAME STATE — show waiting screen until admin starts ──────
// Set waiting name
const waitingNameEl = document.getElementById('waitingName');
if (waitingNameEl) waitingNameEl.textContent = name;

// gameState listener merged into feed section below

// ── SESSION HEARTBEAT (keep session alive every 5 min) ───────
async function refreshSession() {
  try {
    await update(ref(db, `activeSessions/${eliteId}`), { name, ts: Date.now(), active: true });
  } catch(e) {}
}
refreshSession();
// Heartbeat every 2 minutes so Online Now list stays fresh
setInterval(refreshSession, 2 * 60 * 1000);

// ── TAB SWITCHING ─────────────────────────────────────────────
window.switchTab = function (tabName, btn) {
  document.querySelectorAll('#tab-sponsor,#tab-vote,#tab-trade').forEach(t => t.classList.remove('visible'));
  document.querySelectorAll('.app-body > div:nth-child(2) .tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tabName).classList.add('visible');
  btn.classList.add('active');
};

window.switchCommsTab = function (tabName, btn) {
  document.querySelectorAll('#comms-messages,#comms-crisis').forEach(t => t.classList.remove('visible'));
  document.querySelectorAll('.app-body > div:nth-child(3) .tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('comms-' + tabName).classList.add('visible');
  btn.classList.add('active');
};

// ── LIVE FEED ────────────────────────────────────────────────
// Store feed items in memory — render any time, regardless of game state
let feedItems = [];

function renderFeed() {
  const feed = document.getElementById('liveFeed');
  if (!feed) return;
  if (feedItems.length === 0) {
    feed.innerHTML = '<div class="empty-state">Awaiting arena broadcast...</div>';
    return;
  }
  feed.innerHTML = '';
  feedItems
    .filter(item => item.text && item.text.trim() !== '')
    .forEach(item => {
      const div = document.createElement('div');
      div.className = `feed-item ${item.type || 'event'}`;
      div.innerHTML = `
        <div class="feed-meta">
          <span class="feed-badge badge-${item.badge || 'event'}">${(item.badge || 'event').toUpperCase()}</span>
          <span class="feed-time">${item.time || formatTime(item.ts)}</span>
        </div>
        <div class="feed-text">${item.text}</div>`;
      feed.appendChild(div);
    });
  if (feed.children.length === 0) {
    feed.innerHTML = '<div class="empty-state">Awaiting arena broadcast...</div>';
  }
  feed.scrollTop = 0;
}

onValue(ref(db, 'feed'), snap => {
  // Update connection status indicator
  const fbStatus = document.getElementById('fbStatus');
  if (fbStatus) {
    fbStatus.textContent = '✓ connected';
    fbStatus.style.color = 'var(--success-text)';
    fbStatus.style.borderColor = 'rgba(111,207,151,0.3)';
  }

  feedItems = snapToArray(snap).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  renderFeed();
}, (error) => {
  // Error handler — Firebase rejected the read
  const fbStatus = document.getElementById('fbStatus');
  if (fbStatus) {
    fbStatus.textContent = '❌ blocked';
    fbStatus.style.color = 'var(--danger-text)';
    fbStatus.style.borderColor = 'rgba(192,57,43,0.4)';
  }
  console.error('Feed read error:', error);
});

// ── GAME STATE ───────────────────────────────────────────────
onValue(ref(db, 'gameState'), snap => {
  const started = snap.exists() && snap.val().started === true;
  const waitingScreen = document.getElementById('waitingScreen');
  const mainApp = document.getElementById('mainAppContent');
  if (waitingScreen) waitingScreen.style.display = started ? 'none' : 'flex';
  if (mainApp) {
    if (started) {
      mainApp.style.display = 'flex';
      mainApp.style.position = 'relative';
      mainApp.style.inset = 'auto';
    } else {
      mainApp.style.display = 'none';
      mainApp.style.position = 'absolute';
      mainApp.style.inset = '0';
    }
  }
  if (started) renderFeed();
});

// ── CANNON EVENT ─────────────────────────────────────────────
let lastCannonTs = 0;
onValue(ref(db, 'cannonEvent'), snap => {
  if (!snap.exists()) return;
  const ev = snap.val();
  if (!ev || !ev.ts || ev.ts <= lastCannonTs) return;
  if (Date.now() - ev.ts > 10000) { lastCannonTs = ev.ts; return; }
  lastCannonTs = ev.ts;
  triggerCannonNotification(ev.tributeName || null, ev.tributeDistrict || null);
});

function triggerCannonNotification(tributeName, tributeDistrict) {
  const f = document.getElementById('cannonFlash');
  if (f) { f.classList.add('boom'); setTimeout(() => f.classList.remove('boom'), 1200); }
  const audio = document.getElementById('cannonAudio');
  if (audio) { audio.currentTime = 0; audio.play().catch(() => {}); }
  const tributeList = document.getElementById('cannonTributeList');
  if (tributeList) {
    tributeList.innerHTML = tributeName
      ? `<div class="cannon-notif-tribute">${tributeName}<span>${tributeDistrict || ''}</span></div>`
      : `<div class="cannon-notif-tribute">A tribute has fallen<span>See the live feed</span></div>`;
  }
  const overlay = document.getElementById('cannonOverlay');
  if (overlay) overlay.classList.add('visible');
}

window.closeCannonOverlay = function () {
  document.getElementById('cannonOverlay').classList.remove('visible');
};

// ── ARENA STATS ──────────────────────────────────────────────
onValue(ref(db, 'stats'), snap => {
  if (!snap.exists()) return;
  const s = snap.val();
  document.getElementById('statAlive').textContent = s.alive ?? 24;
  document.getElementById('statDead').textContent = s.dead ?? 0;
  document.getElementById('statDay').textContent = s.day ?? 1;
  document.getElementById('arenaDay').textContent = `Day ${s.day ?? 1}`;
});

// ── TRIBUTE TRACKER ──────────────────────────────────────────
const MASTER_TRIBUTES = [
  { id:"t01", name:"Valeria Apollo",     district:"District 1",  hp:100, alive:true, status:"Cornucopia — Career alliance forming" },
  { id:"t02", name:"Velouro Leo",        district:"District 1",  hp:100, alive:true, status:"Cornucopia — Securing weapons cache" },
  { id:"t03", name:"Brontes Ares",       district:"District 2",  hp:100, alive:true, status:"Leading Career alliance" },
  { id:"t04", name:"Kiyra Kain",         district:"District 2",  hp:100, alive:true, status:"Tracking escaping tributes" },
  { id:"t05", name:"Synrik Orion",       district:"District 3",  hp:100, alive:true, status:"Fled north — forest cover" },
  { id:"t06", name:"Elena Atheniapolos", district:"District 3",  hp:100, alive:true, status:"Fled northeast — concealed position" },
  { id:"t07", name:"Corven Tide",        district:"District 4",  hp:100, alive:true, status:"Career alliance — near lake" },
  { id:"t08", name:"Tori Vegah",         district:"District 4",  hp:100, alive:true, status:"Career alliance patrol" },
  { id:"t09", name:"Volti Helios",       district:"District 5",  hp:100, alive:true, status:"Fled west — seeking high ground" },
  { id:"t10", name:"Lyra Solenn",        district:"District 5",  hp:100, alive:true, status:"Fled south — searching for water" },
  { id:"t11", name:"Axel Ode",           district:"District 6",  hp:100, alive:true, status:"Fled east — dense undergrowth" },
  { id:"t12", name:"Veesuvi Rain",       district:"District 6",  hp:100, alive:true, status:"Injured — moving slowly southeast" },
  { id:"t13", name:"Plutonus Blu",       district:"District 7",  hp:100, alive:true, status:"Treetop position — observing" },
  { id:"t14", name:"Mebanis Cades",      district:"District 7",  hp:100, alive:true, status:"Forest — gathering resources" },
  { id:"t15", name:"Odinsos Hemingway",  district:"District 8",  hp:100, alive:true, status:"Hiding near rocky outcrop" },
  { id:"t16", name:"Lamina Calow",       district:"District 8",  hp:100, alive:true, status:"Moving west — avoiding Careers" },
  { id:"t17", name:"Anaya Trove",        district:"District 9",  hp:100, alive:true, status:"Fled northwest — seeking shelter" },
  { id:"t18", name:"Claude Alainus",     district:"District 9",  hp:100, alive:true, status:"Fled west — near grain fields" },
  { id:"t19", name:"Marvin Narlan",      district:"District 10", hp:100, alive:true, status:"Moving south — open terrain" },
  { id:"t20", name:"Vanderwall Moon",    district:"District 10", hp:100, alive:true, status:"Fled southwest — concealed" },
  { id:"t21", name:"Coryo Chambers",     district:"District 11", hp:100, alive:true, status:"Eastern sector — grain field border" },
  { id:"t22", name:"Sisou Confucias",    district:"District 11", hp:100, alive:true, status:"Treetop — watching arena boundary" },
  { id:"t23", name:"Cecelia Kebih",      district:"District 12", hp:100, alive:true, status:"Fled north — riverbank" },
  { id:"t24", name:"Mauve Plinth",       district:"District 12", hp:100, alive:true, status:"Fled north — moving carefully" },
];

let tributeState = MASTER_TRIBUTES.map(t => ({ ...t }));

function renderTributes() {
  const grid = document.getElementById('tributeGrid');
  const select = document.getElementById('sponsorTributeSelect');
  if (!grid || !select) return;
  grid.innerHTML = '';
  select.innerHTML = '<option value="">— Select a tribute —</option>';
  tributeState.forEach(t => {
    const hp = t.alive ? (t.hp ?? 100) : 0;
    const hpClass = hp > 65 ? 'hp-high' : hp > 30 ? 'hp-mid' : 'hp-low';
    const isSponsored = t.sponsors && t.sponsors[eliteId];
    const card = document.createElement('div');
    card.className = ['tribute-card', t.alive ? '' : 'dead', isSponsored ? 'sponsored' : ''].join(' ').trim();
    card.innerHTML = `
      ${isSponsored ? '<span class="tribute-sponsor-badge ti ti-star"></span>' : ''}
      <div class="tribute-district-label">${t.district}</div>
      <div class="tribute-name">${t.name}</div>
      <div class="tribute-status">${t.alive ? (t.status||'Location unknown') : '<span style="color:var(--danger-text);font-style:italic">⚰ Fallen</span>'}</div>
      <div class="hp-bar"><div class="hp-fill ${hpClass}" style="width:${hp}%"></div></div>`;
    grid.appendChild(card);
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = `${t.name} (${t.district})${t.alive ? '' : ' ⚰'}`;
    if (!t.alive) opt.style.color = '#5A4A30';
    select.appendChild(opt);
  });
}

renderTributes();

onValue(ref(db, 'tributes'), snap => {
  if (!snap.exists()) return;
  const tributeUpdates = snapToArrayWithKeys(snap);
  tributeUpdates.forEach(d => {
    const idx = tributeState.findIndex(t => t.id === d._key);
    if (idx !== -1) tributeState[idx] = { ...tributeState[idx], ...d };
  });
  renderTributes();
});

// ── SPONSOR ITEMS ────────────────────────────────────────────
const sponsorList = document.getElementById('sponsorItemList');
SPONSOR_ITEMS.forEach(item => {
  const div = document.createElement('div');
  div.className = 'sponsor-item';
  div.innerHTML = `
    <i class="ti ${item.icon} sponsor-item-icon" aria-hidden="true"></i>
    <div class="sponsor-item-info">
      <div class="sponsor-item-name">${item.name}</div>
      <div class="sponsor-item-desc">${item.desc}</div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;">
      <div class="sponsor-item-cost">${item.cost} ₡</div>
      <button class="sponsor-btn" onclick="openSponsorModal('${item.id}')">SEND</button>
    </div>`;
  sponsorList.appendChild(div);
});

// ── CREDITS ──────────────────────────────────────────────────
let currentCredits = elite.credits;
refreshCreditsDisplay(currentCredits);

let prevCredits = null;
onValue(ref(db, `delegates/${eliteId}/credits`), snap => {
  const credits = snap.exists() ? snap.val() : elite.credits;
  // Show notification if credits changed externally (admin adjustment or incoming trade)
  if (prevCredits !== null && credits !== prevCredits) {
    const diff = credits - prevCredits;
    const gained = diff > 0;
    showCentreNotification(
      gained ? '💰 CREDITS RECEIVED' : '📉 CREDITS ADJUSTED',
      gained
        ? `<strong style="color:var(--success-text);">+${diff} ₡</strong> have been added to your account.<br><br>New balance: <strong>${credits} ₡</strong>`
        : `Your balance has been adjusted by <strong style="color:var(--danger-text);">${diff} ₡</strong>.<br><br>New balance: <strong>${credits} ₡</strong>`,
      gained ? 'var(--success-text)' : 'var(--orange)'
    );
  }
  prevCredits = credits;
  refreshCreditsDisplay(credits);
  currentCredits = credits;
});

// ── SPONSOR MODAL ────────────────────────────────────────────
let pendingSponsor = null;

window.openSponsorModal = function (itemId) {
  const tributeId = document.getElementById('sponsorTributeSelect').value;
  if (!tributeId) { showToast('Select a tribute first.', 'danger'); return; }
  const item = SPONSOR_ITEMS.find(i => i.id === itemId);
  if (!item) return;
  if (currentCredits < item.cost) { showToast('Insufficient credits.', 'danger'); return; }
  pendingSponsor = { itemId, tributeId, item };
  const tributeName = document.getElementById('sponsorTributeSelect').selectedOptions[0].text;
  document.getElementById('sponsorModalBody').innerHTML =
    `Sending <strong style="color:var(--gold)">${item.name}</strong> to <strong style="color:var(--gold)">${tributeName}</strong>.<br><br>
     Cost: <strong style="color:var(--success-text)">${item.cost} ₡</strong> · Balance after: <strong>${currentCredits - item.cost} ₡</strong>`;
  document.getElementById('sponsorModal').style.display = 'flex';
  document.getElementById('sponsorModalConfirm').onclick = confirmSponsor;
};

window.closeModal = function () {
  document.getElementById('sponsorModal').style.display = 'none';
  pendingSponsor = null;
};

async function confirmSponsor() {
  if (!pendingSponsor) return;
  const { tributeId, item } = pendingSponsor;
  closeModal();

  const newCredits = currentCredits - item.cost;
  await update(ref(db, `delegates/${eliteId}`), { credits: newCredits });

  const tributeName = tributeState.find(t => t.id === tributeId)?.name || tributeId;

  // Log for admin visibility
  await push(ref(db, 'activityLog'), {
    type: 'sponsor',
    from: eliteId, fromName: name,
    detail: `sent <strong>${item.name}</strong> (${item.cost} ₡) to <strong>${tributeName}</strong>`,
    ts: Date.now()
  });

  await update(ref(db, `tributes/${tributeId}/sponsors`), { [eliteId]: true });

  await push(ref(db, 'feed'), {
    type: 'sponsor', badge: 'sponsor',
    text: `<strong>Sponsor Package:</strong> A Capitol sponsor has dispatched a <strong>${item.name}</strong> into the arena.`,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    ts: Date.now()
  });

  showToast(`${item.name} dispatched.`, 'success');
  pendingSponsor = null;
}

// ── MESSAGES ─────────────────────────────────────────────────
// A delegate sees a message if:
//   - They sent it (from === eliteId)
//   - It was sent to them (to === eliteId)
//   - It was broadcast to all (to === 'all')
//   - It was sent by crisis_staff to them specifically or to all
onValue(ref(db, 'messages'), snap => {
  const list = document.getElementById('msgList');
  list.innerHTML = `<div class="msg-bubble crisis-official">
    <div class="msg-sender crisis-sender">⚡ Crisis Staff</div>
    Welcome to the 100th Hunger Games. All communications are monitored by the Capitol.
  </div>`;

  const msgs = snapToArray(snap).sort((a, b) => (a.ts || 0) - (b.ts || 0));

  msgs.forEach(msg => {
    const isMine = msg.from === eliteId;
    const toMe = msg.to === eliteId;
    const toAll = msg.to === 'all';
    const fromCrisis = msg.from === 'crisis_staff' || msg.from === 'system';

    // Show this message if I am the sender OR receiver, or it's a broadcast
    const shouldShow = isMine || toMe || toAll;
    if (!shouldShow) return;

    const isCrisis = msg.from === 'crisis_staff' || msg.from === 'system';
    const isAll = toAll;

    const div = document.createElement('div');
    div.className = `msg-bubble ${isCrisis ? 'crisis-official' : isMine ? 'sent' : 'received'}`;
    div.innerHTML = `
      <div class="msg-sender ${isCrisis ? 'crisis-sender' : isMine ? '' : 'received-sender'}">
        ${isCrisis ? '⚡ Crisis Staff' : isMine ? `You → ${msg.toName || msg.to}` : (msg.fromName || msg.from)}
        ${isAll ? ' · Broadcast' : ''}
      </div>
      ${msg.text}
      <div class="msg-time">${formatTime(msg.ts)}</div>`;
    list.appendChild(div);
  });
  list.scrollTop = list.scrollHeight;
});

window.sendMessage = async function () {
  const text = document.getElementById('msgText').value.trim();
  const toId = document.getElementById('msgRecipient').value;
  const toName = document.getElementById('msgRecipient').selectedOptions[0].text;
  if (!text) return;

  await push(ref(db, 'messages'), {
    from: eliteId, fromName: name,
    to: toId, toName,
    text, ts: Date.now()
  });

  // Log to activity log so admin sees it
  await push(ref(db, 'activityLog'), {
    type: 'message',
    from: eliteId, fromName: name,
    detail: `messaged <strong>${toName}</strong>: "${text.substring(0,80)}${text.length>80?'…':''}"`,
    ts: Date.now()
  });

  document.getElementById('msgText').value = '';
};

document.getElementById('msgText').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.sendMessage(); }
});

// ── CRISIS NOTES ─────────────────────────────────────────────
onValue(ref(db, `myCrisisNotes/${eliteId}`), snap => {
  const list = document.getElementById('crisisNoteHistory');
  list.innerHTML = `<div class="msg-bubble crisis-official">
    <div class="msg-sender crisis-sender">⚡ Crisis Staff</div>
    Submit directives here. Notes go directly to Gamemakers for adjudication.
  </div>`;
  const notes = snapToArrayWithKeys(snap).sort((a, b) => (a.ts || 0) - (b.ts || 0));
  notes.forEach(note => {
    const div = document.createElement('div');
    const isReply = note.isReply;
    div.className = `msg-bubble ${isReply ? 'crisis-official' : 'sent'}`;
    div.innerHTML = `
      <div class="msg-sender ${isReply ? 'crisis-sender' : ''}">
        ${isReply ? '⚡ Crisis Staff (Reply)' : 'You → Crisis Staff'}
      </div>
      ${note.text}
      <div class="msg-time">${note.resolved ? '✓ Resolved · ' : '⏳ Pending · '}${formatTime(note.ts)}</div>`;
    list.appendChild(div);
  });
  list.scrollTop = list.scrollHeight;
});

window.submitCrisisNote = async function () {
  const text = document.getElementById('crisisNoteText').value.trim();
  if (!text) return;
  const noteData = { from: eliteId, fromName: name, text, resolved: false, ts: Date.now() };
  await push(ref(db, 'crisisNotes'), noteData);
  await push(ref(db, `myCrisisNotes/${eliteId}`), noteData);
  // Activity log
  await push(ref(db, 'activityLog'), {
    type: 'crisis',
    from: eliteId, fromName: name,
    detail: `submitted crisis note: "${text.substring(0,100)}${text.length>100?'…':''}"`,
    ts: Date.now()
  });
  document.getElementById('crisisNoteText').value = '';
  showToast('Crisis directive submitted.', 'crisis');
};

// ── VOTING ───────────────────────────────────────────────────
let lastVoteId = null;
onValue(ref(db, 'activeVote'), snap => {
  // Notify when a new vote opens
  if (snap.exists() && snap.val().active) {
    const vote = snap.val();
    const voteId = vote.openedAt || vote.title;
    if (lastVoteId !== null && voteId !== lastVoteId) {
      showCentreNotification(
        '🗳 ARENA VOTE NOW OPEN',
        `<strong style="color:var(--gold)">${vote.title}</strong><br><br>${vote.description || 'The Gamemakers are calling for a delegate vote.'}<br><br><span style="color:var(--orange);font-family:'Cinzel',serif;font-size:10px;letter-spacing:2px;">Go to the Arena Votes tab to cast your vote.</span>`,
        'var(--gold)'
      );
    }
    lastVoteId = voteId;
  }
  const panel = document.getElementById('votePanel');
  if (!snap.exists() || !snap.val().active) {
    panel.innerHTML = `<div class="vote-closed">
      <i class="ti ti-hourglass" style="font-size:24px;color:var(--text-dim);display:block;margin-bottom:8px;"></i>
      No active votes. The Gamemakers will announce when voting opens.
    </div>`;
    return;
  }
  const vote = snap.val();
  const myVote = vote.votes && vote.votes[eliteId];
  const totalVotes = vote.votes ? Object.keys(vote.votes).length : 0;

  panel.innerHTML = `<div style="padding:12px;">
    <div class="vote-card">
      <div class="vote-title">${vote.title}</div>
      <div class="vote-desc">${vote.description || ''}</div>
      <div class="vote-options" id="voteOptions"></div>
      ${Object.entries(vote.options || {}).map(([key, opt]) => {
        const count = vote.votes ? Object.values(vote.votes).filter(v => v === key).length : 0;
        const pct = totalVotes ? Math.round((count / totalVotes) * 100) : 0;
        return `<div class="vote-bar-wrap">
          <div class="vote-bar-label"><span>${opt}</span><span>${count} vote${count!==1?'s':''} (${pct}%)</span></div>
          <div class="vote-bar"><div class="vote-bar-fill" style="width:${pct}%"></div></div>
        </div>`;
      }).join('')}
      ${!myVote
        ? `<button class="vote-submit-btn" style="margin-top:12px;" onclick="castVote()">CAST VOTE</button>`
        : `<div style="margin-top:10px;font-family:'Cinzel',serif;font-size:9px;color:var(--success-text);">✓ Vote cast: ${vote.options[myVote]}</div>`}
    </div>
  </div>`;

  const optContainer = document.getElementById('voteOptions');
  if (optContainer && !myVote) {
    Object.entries(vote.options || {}).forEach(([key, label]) => {
      const div = document.createElement('label');
      div.className = 'vote-option';
      div.innerHTML = `<input type="radio" name="arenaVote" value="${key}"> ${label}`;
      div.onclick = () => {
        document.querySelectorAll('.vote-option').forEach(o => o.classList.remove('selected'));
        div.classList.add('selected');
        window._selectedVote = key;
      };
      optContainer.appendChild(div);
    });
  }
});

window.castVote = async function () {
  if (!window._selectedVote) { showToast('Select an option first.', 'danger'); return; }
  await update(ref(db, 'activeVote/votes'), { [eliteId]: window._selectedVote });
  await push(ref(db, 'activityLog'), {
    type: 'vote', from: eliteId, fromName: name,
    detail: `cast a vote`,
    ts: Date.now()
  });
  showToast('Vote cast.', 'success');
};

// ── CREDIT TRADING ───────────────────────────────────────────
const tradeSelect = document.getElementById('tradeRecipient');
Object.entries(ELITES).forEach(([id, e]) => {
  if (id === eliteId) return;
  const opt = document.createElement('option');
  opt.value = id; opt.textContent = e.name;
  tradeSelect.appendChild(opt);
});

window.executeTrade = async function () {
  const toId = document.getElementById('tradeRecipient').value;
  const amount = parseInt(document.getElementById('tradeAmount').value);
  if (!toId || !amount || amount <= 0) { showToast('Enter a valid recipient and amount.', 'danger'); return; }
  if (amount > currentCredits) { showToast('Insufficient credits.', 'danger'); return; }

  const toSnap = await get(ref(db, `delegates/${toId}/credits`));
  const toCredits = toSnap.exists() ? toSnap.val() : ELITES[toId].credits;

  await update(ref(db, `delegates/${eliteId}`), { credits: currentCredits - amount });
  await update(ref(db, `delegates/${toId}`), { credits: toCredits + amount });

  await push(ref(db, 'activityLog'), {
    type: 'trade', from: eliteId, fromName: name,
    detail: `transferred <strong>${amount} ₡</strong> to <strong>${ELITES[toId].name}</strong>`,
    ts: Date.now()
  });

  await push(ref(db, 'tradeLog'), {
    from: eliteId, fromName: name,
    to: toId, toName: ELITES[toId].name,
    amount, ts: Date.now()
  });

  // Notify recipient via messages
  await push(ref(db, 'messages'), {
    from: 'system', fromName: 'Capitol Treasury',
    to: toId, toName: ELITES[toId].name,
    text: `<strong>${name}</strong> has transferred <strong>${amount} ₡</strong> to your account.`,
    ts: Date.now()
  });

  document.getElementById('tradeAmount').value = '';
  showToast(`${amount} ₡ transferred to ${ELITES[toId].name}.`, 'success');
  renderTradeHistory();
};

async function renderTradeHistory() {
  const snap = await get(ref(db, 'tradeLog'));
  const container = document.getElementById('tradeHistory');
  const empty = document.getElementById('tradeHistoryEmpty');
  if (!snap.exists()) { if (empty) empty.style.display = 'block'; return; }
  if (empty) empty.style.display = 'none';
  container.querySelectorAll('.trade-entry').forEach(e => e.remove());
  const entries = snapToArray(snap);
  entries.filter(t => t.from === eliteId || t.to === eliteId).reverse().forEach(t => {
    const div = document.createElement('div');
    div.className = 'trade-entry';
    const isSent = t.from === eliteId;
    div.style.cssText = 'font-size:12px;color:var(--text-secondary);padding:5px 0;border-bottom:1px solid var(--border);line-height:1.4;';
    div.innerHTML = `<span style="color:${isSent?'var(--danger-text)':'var(--success-text)'};">${isSent?'−':'+'}${t.amount} ₡</span> ${isSent?`to ${t.toName}`:`from ${t.fromName}`} <span style="color:var(--text-dim);float:right;">${formatTime(t.ts)}</span>`;
    container.appendChild(div);
  });
}

// Init delegate in DB if needed
get(ref(db, `delegates/${eliteId}/credits`)).then(snap => {
  if (!snap.exists()) set(ref(db, `delegates/${eliteId}`), { credits: elite.credits, name, title: elite.title });
});

renderTradeHistory();

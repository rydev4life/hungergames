import {
  db, ref, set, push, onValue, update, get, serverTimestamp,
  ELITES, TRIBUTES_INIT, formatTime, showToast,
  snapToArray, snapToArrayWithKeys
} from '../js/firebase.js';

// ── AUTH ─────────────────────────────────────────────────────
const ADMIN_PASSWORD = 'gamemaker100';
const stored = sessionStorage.getItem('admin_auth');
if (!stored) {
  const pwd = prompt('Enter Gamemaker access code:');
  if (pwd === ADMIN_PASSWORD) {
    sessionStorage.setItem('admin_auth', 'gamemaker');
  } else {
    alert('Access denied.');
    window.location.href = '../index.html';
  }
}

// ── FIREBASE CONNECTION TEST ──────────────────────────────────
async function testFirebaseConnection() {
  const statusEl = document.getElementById('firebaseStatus');
  try {
    await set(ref(db, 'adminPing'), { ts: Date.now() });
    if (statusEl) {
      statusEl.style.cssText = 'background:rgba(46,125,79,0.15);border-bottom:1px solid rgba(111,207,151,0.2);padding:6px 16px;font-family:\'Cinzel\',serif;font-size:9px;letter-spacing:1px;color:var(--success-text);text-align:center;';
      statusEl.textContent = '✓ Firebase connected — all systems operational';
      setTimeout(() => { if(statusEl) statusEl.style.display='none'; }, 5000);
    }
  } catch(err) {
    if (statusEl) {
      statusEl.style.cssText = 'background:rgba(139,26,26,0.3);border-bottom:1px solid rgba(192,57,43,0.6);padding:10px 16px;font-family:\'Cinzel\',serif;font-size:10px;letter-spacing:1px;color:var(--danger-text);text-align:center;';
      statusEl.innerHTML = '❌ FIREBASE BLOCKED — Go to <strong>console.firebase.google.com</strong> → Realtime Database → Rules → set <strong>.read</strong> and <strong>.write</strong> to <strong>true</strong> → Publish. Then reload.';
    }
    const rulesEl = document.getElementById('rulesReminder');
    if (rulesEl) rulesEl.style.display = 'block';
  }
}
testFirebaseConnection();

// ── GAME STATE LISTENER ─────────────────────────────────────
onValue(ref(db, 'gameState'), snap => {
  const started = snap.exists() && snap.val().started === true;
  const banner = document.getElementById('gameStatusBanner');
  const startBtn = document.getElementById('startGameBtn');
  const stopBtn = document.getElementById('stopGameBtn');
  if (banner) {
    banner.className = started ? 'started' : 'waiting';
    banner.textContent = started
      ? '✓ GAMES IN PROGRESS — Delegates are in the arena portal'
      : '⏳ GAMES NOT STARTED — Delegates see the waiting screen';
  }
  if (startBtn) startBtn.style.display = started ? 'none' : 'block';
  if (stopBtn) stopBtn.style.display = started ? 'block' : 'none';
});

window.startGame = async function() {
  await set(ref(db, 'gameState'), { started: true, startedAt: Date.now() });
  await push(ref(db, 'feed'), {
    type: 'event', badge: 'event',
    text: '<strong>THE 100TH HUNGER GAMES HAVE BEGUN.</strong> The 5th Quinquennial Quell commences. 24 tributes from 12 districts enter the arena. May the odds be ever in your favor.',
    time: 'Day 1, 10:00', ts: Date.now()
  });
  showToast('✓ Games started — delegates can now access the portal.', 'success');
};

window.stopGame = async function() {
  if (!confirm('Pause/end the games? Delegates will see the waiting screen.')) return;
  await update(ref(db, 'gameState'), { started: false });
  showToast('Games paused.', 'gold');
};

window.openVoteSection = function() {
  document.getElementById('voteTitle').focus();
};

// ── ADMIN LIVE FEED PREVIEW ──────────────────────────────────
onValue(ref(db, 'feed'), snap => {
  const preview = document.getElementById('adminFeedPreview');
  if (!preview) return;
  preview.innerHTML = '';
  if (!snap.exists()) {
    preview.innerHTML = '<div class="empty-state">No feed items yet.</div>';
    return;
  }
  const items = [];
  snap.forEach(c => items.push(c.val()));
  items.sort((a,b) => (b.ts||0)-(a.ts||0));
  items.slice(0, 8).forEach(item => {
    const div = document.createElement('div');
    div.style.cssText = 'padding:6px 10px;border-left:3px solid var(--border-mid);margin-bottom:6px;background:var(--dark-2);border-radius:0 3px 3px 0;font-size:12px;';
    const typeColors = { death:'var(--danger-text)', event:'var(--info-text)', crisis:'var(--orange)', sponsor:'var(--success-text)', alliance:'var(--gold)', district:'#C39BD3', political:'#F48FB1' };
    div.style.borderLeftColor = typeColors[item.type] || 'var(--border-mid)';
    div.innerHTML = `<div style="font-family:'Cinzel',serif;font-size:8px;color:var(--text-dim);margin-bottom:3px;">${item.time || formatTime(item.ts)}</div><div style="color:var(--text-primary);line-height:1.4;">${item.text}</div>`;
    preview.appendChild(div);
  });
});

// ── FULL RESET ───────────────────────────────────────────────
window.initDatabase = async function () {
  if (!confirm('FULL RESET: Wipe ALL data, log out all delegates, and restart from Day 1?')) return;
  const phrase = prompt('Type RESET to confirm:');
  if (phrase !== 'RESET') { showToast('Reset cancelled.', 'danger'); return; }
  showToast('Resetting...', 'gold');

  // Signal all delegate pages to log out BEFORE wiping data
  await set(ref(db, 'systemSignal'), { action: 'force_logout', ts: Date.now() });

  // Small delay so delegates receive the signal
  await new Promise(r => setTimeout(r, 1500));

  await set(ref(db, 'feed'), null);
  await set(ref(db, 'messages'), null);
  await set(ref(db, 'crisisNotes'), null);
  await set(ref(db, 'myCrisisNotes'), null);
  await set(ref(db, 'activeVote'), null);
  await set(ref(db, 'sponsorLog'), null);
  await set(ref(db, 'tradeLog'), null);
  await set(ref(db, 'tributes'), null);
  await set(ref(db, 'delegates'), null);
  await set(ref(db, 'stats'), null);
  await set(ref(db, 'activityLog'), null);
  await set(ref(db, 'cannonEvent'), null);
  await set(ref(db, 'activeSessions'), null);
  await set(ref(db, 'systemSignal'), null);
  await set(ref(db, 'gameState'), { started: false });

  await set(ref(db, 'stats'), { alive: 24, dead: 0, day: 1 });

  for (const t of TRIBUTES_INIT) {
    await set(ref(db, `tributes/${t.id}`), t);
  }

  const delegateUpdates = {};
  Object.entries(ELITES).forEach(([id, e]) => {
    delegateUpdates[id] = { credits: e.credits, name: e.name, title: e.title };
  });
  await set(ref(db, 'delegates'), delegateUpdates);

  await push(ref(db, 'feed'), {
    type: 'event', badge: 'event',
    text: '<strong>THE 100TH HUNGER GAMES HAVE BEGUN.</strong> The 5th Quinquennial Quell commences. 24 tributes from 12 districts enter the arena. May the odds be ever in your favor.',
    time: 'Day 1, 10:00', ts: Date.now()
  });

  showToast('✓ Full reset complete.', 'success');
  renderDelegateCredits();
  renderTributeManager();
};

// ── PUSH FEED UPDATE ─────────────────────────────────────────
// ── CLEAN FEED (remove empty/corrupt entries) ────────────────
window.cleanFeed = async function() {
  const snap = await get(ref(db, 'feed'));
  if (!snap.exists()) { showToast('Feed is empty.', 'gold'); return; }
  const val = snap.val();
  let removed = 0;
  for (const [key, item] of Object.entries(val)) {
    if (!item.text || item.text.trim() === '') {
      await set(ref(db, `feed/${key}`), null);
      removed++;
    }
  }
  showToast(`✓ Cleaned ${removed} empty entries from feed.`, 'success');
};

window.pushFeedUpdate = async function () {
  const type = document.getElementById('feedType').value;
  const text = document.getElementById('feedText').value.trim();
  const time = document.getElementById('feedTime').value.trim() ||
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (!text) { showToast('Enter a message.', 'danger'); return; }

  const badgeMap = { event:'event', death:'death', alliance:'alliance', sponsor:'sponsor', crisis:'crisis', district:'district', political:'political' };

  const feedData = {
    type, badge: badgeMap[type] || 'event',
    text, time, ts: Date.now()
  };
  console.log('Writing feed item:', feedData);
  try {
    const result = await push(ref(db, 'feed'), feedData);
    console.log('Feed write success, key:', result.key);
    if (type === 'death') {
      const snap = await get(ref(db, 'stats'));
      const s = snap.val() || { alive: 24, dead: 0, day: 1 };
      await update(ref(db, 'stats'), { alive: Math.max(0, s.alive - 1), dead: s.dead + 1 });
    }
    document.getElementById('feedText').value = '';
    document.getElementById('feedTime').value = '';
    showToast(`✓ Broadcast sent (key: ${result.key?.slice(-6)})`, 'success');
  } catch(err) {
    console.error('Feed write FAILED:', err);
    alert(`FEED WRITE FAILED: ${err.message}

Go to Firebase Console → Realtime Database → Rules and make sure .read and .write are both true.`);
    showToast(`❌ FAILED: ${err.message}`, 'danger');
  }
};

// ── ADVANCE DAY ──────────────────────────────────────────────
window.advanceDay = async function () {
  try {
    const snap = await get(ref(db, 'stats'));
    const s = snap.val() || { alive: 24, dead: 0, day: 1 };
    const newDay = s.day + 1;
    await update(ref(db, 'stats'), { day: newDay });
    await push(ref(db, 'feed'), {
      type: 'event', badge: 'event',
      text: `<strong>Day ${newDay} Begins.</strong> The Capitol anthem plays. ${s.dead} tribute${s.dead!==1?'s':''} have fallen. <strong>${s.alive}</strong> remain in the arena.`,
      time: `Day ${newDay}, 06:00`, ts: Date.now()
    });
    showToast(`Advanced to Day ${newDay}.`, 'success');
  } catch(err) { showToast(`❌ Error: ${err.message}`, 'danger'); }
};

// ── FIRE CANNON ──────────────────────────────────────────────
window.firecannon = async function () {
  const tributeSelect = document.getElementById('tributeSelect');
  const selectedId = tributeSelect ? tributeSelect.value : null;
  const tribute = selectedId ? tributeCache[selectedId] : null;
  const tributeName = tribute ? tribute.name : null;
  const tributeDistrict = tribute ? tribute.district : null;

  try {
    const snap = await get(ref(db, 'stats'));
    const s = snap.val() || { alive: 24, dead: 0, day: 1 };
    await update(ref(db, 'stats'), { alive: Math.max(0, s.alive - 1), dead: s.dead + 1 });
    await set(ref(db, 'cannonEvent'), { tributeName, tributeDistrict, ts: Date.now() });
    document.getElementById('cannonFlash').classList.add('boom');
    setTimeout(() => document.getElementById('cannonFlash').classList.remove('boom'), 1200);
    triggerCannonNotification(tributeName, tributeDistrict);
    showToast('Cannon fired — all delegates notified.', 'danger');
  } catch(err) { showToast(`❌ Error: ${err.message}`, 'danger'); }
};

// ── CANNON NOTIFICATION ──────────────────────────────────────
window.closeCannonOverlay = function () {
  document.getElementById('cannonOverlay').classList.remove('visible');
};

function triggerCannonNotification(tributeName, tributeDistrict) {
  const f = document.getElementById('cannonFlash');
  if (f) { f.classList.add('boom'); setTimeout(() => f.classList.remove('boom'), 1200); }
  const audio = document.getElementById('cannonAudio');
  if (audio) { audio.currentTime = 0; audio.play().catch(()=>{}); }
  const list = document.getElementById('cannonTributeList');
  if (list) list.innerHTML = tributeName
    ? `<div class="cannon-notif-tribute">${tributeName}<span>${tributeDistrict||''}</span></div>`
    : `<div class="cannon-notif-tribute">A tribute has fallen<span>Update the tracker</span></div>`;
  document.getElementById('cannonOverlay').classList.add('visible');
}

// ── TRIBUTE MANAGER ──────────────────────────────────────────
const ADMIN_TRIBUTES_DEFAULT = [
  { id:"t01", name:"Valeria Apollo",     district:"District 1",  hp:100, alive:true },
  { id:"t02", name:"Velouro Leo",        district:"District 1",  hp:100, alive:true },
  { id:"t03", name:"Brontes Ares",       district:"District 2",  hp:100, alive:true },
  { id:"t04", name:"Kiyra Kain",         district:"District 2",  hp:100, alive:true },
  { id:"t05", name:"Synrik Orion",       district:"District 3",  hp:100, alive:true },
  { id:"t06", name:"Elena Atheniapolos", district:"District 3",  hp:100, alive:true },
  { id:"t07", name:"Corven Tide",        district:"District 4",  hp:100, alive:true },
  { id:"t08", name:"Tori Vegah",         district:"District 4",  hp:100, alive:true },
  { id:"t09", name:"Volti Helios",       district:"District 5",  hp:100, alive:true },
  { id:"t10", name:"Lyra Solenn",        district:"District 5",  hp:100, alive:true },
  { id:"t11", name:"Axel Ode",           district:"District 6",  hp:100, alive:true },
  { id:"t12", name:"Veesuvi Rain",       district:"District 6",  hp:100, alive:true },
  { id:"t13", name:"Plutonus Blu",       district:"District 7",  hp:100, alive:true },
  { id:"t14", name:"Mebanis Cades",      district:"District 7",  hp:100, alive:true },
  { id:"t15", name:"Odinsos Hemingway",  district:"District 8",  hp:100, alive:true },
  { id:"t16", name:"Lamina Calow",       district:"District 8",  hp:100, alive:true },
  { id:"t17", name:"Anaya Trove",        district:"District 9",  hp:100, alive:true },
  { id:"t18", name:"Claude Alainus",     district:"District 9",  hp:100, alive:true },
  { id:"t19", name:"Marvin Narlan",      district:"District 10", hp:100, alive:true },
  { id:"t20", name:"Vanderwall Moon",    district:"District 10", hp:100, alive:true },
  { id:"t21", name:"Coryo Chambers",     district:"District 11", hp:100, alive:true },
  { id:"t22", name:"Sisou Confucias",    district:"District 11", hp:100, alive:true },
  { id:"t23", name:"Cecelia Kebih",      district:"District 12", hp:100, alive:true },
  { id:"t24", name:"Mauve Plinth",       district:"District 12", hp:100, alive:true },
];

let tributeCache = {};
ADMIN_TRIBUTES_DEFAULT.forEach(t => { tributeCache[t.id] = { ...t }; });

function renderTributeManager() {
  const select = document.getElementById('tributeSelect');
  select.innerHTML = '';
  const sorted = Object.values(tributeCache).sort((a,b) => (a.id||'').localeCompare(b.id||''));
  sorted.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = `${t.name} (${t.district})${t.alive ? '' : ' ⚰'}`;
    select.appendChild(opt);
  });
  const list = document.getElementById('tributeAdminList');
  list.innerHTML = '';
  sorted.forEach(t => {
    const div = document.createElement('div');
    div.style.cssText = 'font-size:12px;padding:4px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;';
    div.innerHTML = `<span style="color:${t.alive?'var(--text-primary)':'var(--text-dim)'};">${t.name}</span>
      <span style="color:var(--text-dim);font-size:11px;">${t.alive?`HP: ${t.hp??100}%`:'⚰ Fallen'}</span>`;
    list.appendChild(div);
  });
}

renderTributeManager();

onValue(ref(db, 'tributes'), snap => {
  if (!snap.exists()) return;
  snapToArrayWithKeys(snap).forEach(d => {
    if (tributeCache[d._key]) tributeCache[d._key] = { ...tributeCache[d._key], ...d };
  });
  renderTributeManager();
});

window.updateTribute = async function () {
  const id = document.getElementById('tributeSelect').value;
  const hp = document.getElementById('tributeHP').value;
  const status = document.getElementById('tributeStatus').value.trim();
  if (!id) { showToast('Select a tribute.', 'danger'); return; }
  const updates = {};
  if (hp !== '') updates.hp = parseInt(hp);
  if (status) updates.status = status;
  if (Object.keys(updates).length) {
    tributeCache[id] = { ...tributeCache[id], ...updates };
    renderTributeManager();
    await update(ref(db, `tributes/${id}`), updates);
    showToast('Tribute updated.', 'success');
  }
};

window.killTribute = async function () {
  const id = document.getElementById('tributeSelect').value;
  if (!id) return;
  const t = tributeCache[id];
  if (!t) return;
  tributeCache[id] = { ...t, alive: false, hp: 0, status: 'Fallen' };
  renderTributeManager();
  await update(ref(db, `tributes/${id}`), { alive: false, hp: 0, status: 'Fallen' });
  const snap = await get(ref(db, 'stats'));
  const s = snap.val() || { alive: 24, dead: 0, day: 1 };
  await update(ref(db, 'stats'), { alive: Math.max(0, s.alive - 1), dead: s.dead + 1 });
  await push(ref(db, 'feed'), {
    type: 'death', badge: 'death',
    text: `<strong>CANNON FIRE.</strong> <strong>${t.name}</strong> of ${t.district} has been eliminated from the 100th Hunger Games.`,
    time: new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }), ts: Date.now()
  });
  await set(ref(db, 'cannonEvent'), { tributeName: t.name, tributeDistrict: t.district, ts: Date.now() });
  triggerCannonNotification(t.name, t.district);
  showToast(`${t.name} marked as fallen.`, 'danger');
};

window.healTribute = async function () {
  const id = document.getElementById('tributeSelect').value;
  if (!id) return;
  tributeCache[id] = { ...tributeCache[id], hp: 100 };
  renderTributeManager();
  await update(ref(db, `tributes/${id}`), { hp: 100 });
  showToast('HP restored.', 'success');
};

// ── CRISIS NOTE INBOX ────────────────────────────────────────
onValue(ref(db, 'crisisNotes'), snap => {
  const inbox = document.getElementById('crisisInbox');
  inbox.innerHTML = '';
  if (!snap.exists()) { inbox.innerHTML = '<div class="empty-state">No crisis notes yet.</div>'; return; }
  const notes = snapToArrayWithKeys(snap).sort((a,b) => (b.ts||0)-(a.ts||0));
  let unread = 0;
  notes.forEach(note => {
    if (!note.resolved) unread++;
    const div = document.createElement('div');
    div.className = `note-card ${note.resolved ? 'resolved' : 'unread'}`;
    const nk = note._key || note.key || '';
    div.innerHTML = `
      <div class="note-meta">
        <span class="note-from">${note.fromName||note.from}</span>
        <span class="note-time">${formatTime(note.ts)}</span>
      </div>
      <div class="note-text">${note.text}</div>
      <div class="note-actions">
        ${!note.resolved
          ? `<button class="note-resolve-btn" onclick="resolveNote('${nk}','${note.from}')">✓ Resolve</button>`
          : '<span style="font-size:10px;color:var(--success-text);">✓ Resolved</span>'}
        <button class="note-reply-btn" onclick="openReplyBox('${nk}','${note.from}','${(note.fromName||'').replace(/'/g,"\\'")}')">Reply</button>
      </div>
      <div id="replyBox_${nk}" style="display:none;margin-top:8px;">
        <textarea class="admin-textarea" id="replyText_${nk}" rows="2" placeholder="Reply to this note..."></textarea>
        <button class="admin-btn orange" style="margin-top:4px;width:100%;" onclick="sendNoteReply('${nk}','${note.from}','${(note.fromName||'').replace(/'/g,"\\'")}')">Send Reply</button>
      </div>`;
    inbox.appendChild(div);
  });
  const badge = document.getElementById('unreadBadge');
  if (badge) { badge.textContent = unread > 0 ? `${unread} UNREAD` : ''; badge.style.display = unread > 0 ? 'inline' : 'none'; }
});

window.openReplyBox = function(noteKey, fromId, fromName) {
  const box = document.getElementById(`replyBox_${noteKey}`);
  if (box) { box.style.display = box.style.display === 'none' ? 'block' : 'none'; }
};

window.resolveNote = async function (key, fromId) {
  await update(ref(db, `crisisNotes/${key}`), { resolved: true });
  // Update delegate's copy too
  const myNotesSnap = await get(ref(db, `myCrisisNotes/${fromId}`));
  if (myNotesSnap.exists()) {
    myNotesSnap.forEach(c => {
      if (c.val().text === (c.val().text)) {
        update(ref(db, `myCrisisNotes/${fromId}/${c.key}`), { resolved: true });
      }
    });
  }
  showToast('Note resolved.', 'success');
};

// KEY FIX: reply goes into delegate's myCrisisNotes AND messages so they SEE it
window.sendNoteReply = async function (noteKey, toId, toName) {
  const textEl = document.getElementById(`replyText_${noteKey}`);
  const text = textEl ? textEl.value.trim() : '';
  if (!text) { showToast('Enter a reply.', 'danger'); return; }

  const replyData = {
    from: 'crisis_staff', fromName: 'Crisis Staff',
    to: toId, toName,
    text, isReply: true, resolved: false, ts: Date.now()
  };

  // Push to delegate's personal crisis note thread so they see it in Crisis Notes tab
  await push(ref(db, `myCrisisNotes/${toId}`), replyData);

  // Also send as a direct message so it shows in Messages tab too
  await push(ref(db, 'messages'), {
    from: 'crisis_staff', fromName: '⚡ Crisis Staff',
    to: toId, toName,
    text: `<em>[Crisis Note Reply]</em> ${text}`,
    ts: Date.now()
  });

  // Mark original note resolved
  await update(ref(db, `crisisNotes/${noteKey}`), { resolved: true });

  if (textEl) textEl.value = '';
  const box = document.getElementById(`replyBox_${noteKey}`);
  if (box) box.style.display = 'none';
  showToast(`Reply sent to ${toName}.`, 'success');
};

// ── ALL MESSAGES SURVEILLANCE ────────────────────────────────
let allMessagesCache = [];
let msgFilter = 'all';

window.setMsgFilter = function(filter, btn) {
  msgFilter = filter;
  document.querySelectorAll('.msg-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderAllMessages();
};

onValue(ref(db, 'messages'), snap => {
  allMessagesCache = snapToArray(snap).sort((a,b) => (b.ts||0)-(a.ts||0));
  renderAllMessages();
});

function renderAllMessages() {
  const container = document.getElementById('allMessagesPanel');
  if (!container) return;
  container.innerHTML = '';
  let filtered = [...allMessagesCache];
  if (msgFilter !== 'all') {
    filtered = filtered.filter(m => m.from === msgFilter || m.to === msgFilter);
  }
  if (filtered.length === 0) { container.innerHTML = '<div class="empty-state">No messages.</div>'; return; }
  filtered.forEach(msg => {
    const isCrisis = msg.from === 'crisis_staff';
    const isAll = msg.to === 'all';
    const div = document.createElement('div');
    div.style.cssText = `padding:8px 10px;border:1px solid var(--border);border-left:3px solid ${isCrisis?'var(--orange)':isAll?'var(--gold)':'var(--info-text)'};border-radius:3px;margin-bottom:6px;background:var(--dark-2);font-size:13px;`;
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;flex-wrap:wrap;gap:4px;">
        <span style="font-family:'Cinzel',serif;font-size:9px;color:var(--gold);">
          ${msg.fromName||msg.from}
          <span style="color:var(--text-dim);"> → </span>
          <span style="color:${isAll?'var(--orange)':'var(--info-text)'};">${isAll?'ALL DELEGATES':(msg.toName||msg.to)}</span>
        </span>
        <span style="font-size:9px;color:var(--text-dim);">${formatTime(msg.ts)}</span>
      </div>
      <div style="color:var(--text-primary);line-height:1.5;">${msg.text}</div>`;
    container.appendChild(div);
  });
}

const delegateFilterSelect = document.getElementById('delegateFilterSelect');
if (delegateFilterSelect) {
  Object.entries(ELITES).forEach(([id, e]) => {
    const opt = document.createElement('option');
    opt.value = id; opt.textContent = e.name;
    delegateFilterSelect.appendChild(opt);
  });
}

window.filterByDelegate = function() {
  msgFilter = document.getElementById('delegateFilterSelect').value || 'all';
  renderAllMessages();
};

// ── ACTIVITY LOG (live - all sponsor/trade/vote/message actions) ──
onValue(ref(db, 'activityLog'), snap => {
  const container = document.getElementById('activityLogPanel');
  if (!container) return;
  container.innerHTML = '';
  const items = snapToArray(snap).sort((a,b) => (b.ts||0)-(a.ts||0));
  if (items.length === 0) { container.innerHTML = '<div class="empty-state">No activity yet.</div>'; return; }
  const typeColors = { sponsor:'var(--success-text)', trade:'var(--gold)', crisis:'var(--orange)', message:'var(--info-text)', vote:'#C39BD3' };
  items.forEach(item => {
    const div = document.createElement('div');
    div.style.cssText = `padding:7px 10px;border:1px solid var(--border);border-left:3px solid ${typeColors[item.type]||'var(--text-dim)'};border-radius:3px;margin-bottom:6px;background:var(--dark-2);font-size:12px;animation:fadeSlide .3s ease;`;
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
        <span style="font-family:'Cinzel',serif;font-size:9px;color:var(--gold);">${item.fromName||item.from}</span>
        <span style="font-size:9px;color:var(--text-dim);">${formatTime(item.ts)}</span>
      </div>
      <div style="color:var(--text-secondary);line-height:1.4;">${item.detail}</div>`;
    container.appendChild(div);
  });
});

// ── SEND ADMIN MESSAGE ───────────────────────────────────────
window.sendAdminMessage = async function () {
  const to = document.getElementById('adminMsgTo').value;
  const text = document.getElementById('adminMsgText').value.trim();
  if (!text) return;
  const toName = document.getElementById('adminMsgTo').selectedOptions[0].text;
  try {
    await push(ref(db, 'messages'), {
      from: 'crisis_staff', fromName: '⚡ Crisis Staff',
      to, toName, text, ts: Date.now()
    });
    document.getElementById('adminMsgText').value = '';
    showToast(`Message sent to ${toName}.`, 'success');
  } catch(err) { showToast(`❌ Send failed: ${err.message}`, 'danger'); }
};

// ── VOTE BUILDER ─────────────────────────────────────────────
window.openVoteBuilder = function () { document.getElementById('voteTitle').focus(); };

window.launchVote = async function () {
  const title = document.getElementById('voteTitle').value.trim();
  const description = document.getElementById('voteDesc').value.trim();
  const opts = ['voteOpt1','voteOpt2','voteOpt3','voteOpt4'].map(id => document.getElementById(id).value.trim()).filter(Boolean);
  if (!title || opts.length < 2) { showToast('Need a title and at least 2 options.', 'danger'); return; }
  const optObj = {};
  opts.forEach((o, i) => { optObj[`opt${i}`] = o; });
  await set(ref(db, 'activeVote'), { title, description, options: optObj, votes: {}, active: true, openedAt: Date.now() });
  await push(ref(db, 'feed'), {
    type: 'event', badge: 'event',
    text: `<strong>ARENA VOTE OPEN:</strong> "${title}" — All delegates may now cast their vote in the Arena Votes tab.`,
    time: new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }), ts: Date.now()
  });
  ['voteTitle','voteDesc','voteOpt1','voteOpt2','voteOpt3','voteOpt4'].forEach(id => { document.getElementById(id).value = ''; });
  showToast('Vote launched.', 'success');
};

window.closeActiveVote = async function () {
  const snap = await get(ref(db, 'activeVote'));
  if (!snap.exists()) { showToast('No active vote.', 'danger'); return; }
  const vote = snap.val();
  const votes = vote.votes || {};
  const totalVotes = Object.keys(votes).length;
  const tally = {};
  Object.values(votes).forEach(v => { tally[v] = (tally[v]||0)+1; });
  const winner = Object.entries(tally).sort((a,b)=>b[1]-a[1])[0];
  const winnerLabel = winner ? vote.options[winner[0]] : 'No votes cast';
  await update(ref(db, 'activeVote'), { active: false });
  await push(ref(db, 'feed'), {
    type: 'event', badge: 'announcement',
    text: `<strong>VOTE CLOSED:</strong> "${vote.title}" — Winner: <strong>${winnerLabel}</strong> with ${winner?winner[1]:0} of ${totalVotes} votes.`,
    time: new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }), ts: Date.now()
  });
  showToast(`Vote closed. Winner: ${winnerLabel}`, 'success');
};

// ── DELEGATE CREDITS ─────────────────────────────────────────
const creditSelect = document.getElementById('creditDelegate');
Object.entries(ELITES).forEach(([id, e]) => {
  const opt = document.createElement('option');
  opt.value = id; opt.textContent = e.name;
  creditSelect.appendChild(opt);
});

window.adjustCredits = async function (direction) {
  const delegateId = document.getElementById('creditDelegate').value;
  const amount = parseInt(document.getElementById('creditAmount').value);
  if (!delegateId || !amount || amount <= 0) { showToast('Enter delegate and amount.', 'danger'); return; }
  const snap = await get(ref(db, `delegates/${delegateId}/credits`));
  const current = snap.exists() ? snap.val() : ELITES[delegateId].credits;
  const newCredits = Math.max(0, current + (direction * amount));
  await update(ref(db, `delegates/${delegateId}`), { credits: newCredits });
  await push(ref(db, 'messages'), {
    from: 'crisis_staff', fromName: '⚡ Crisis Staff',
    to: delegateId, toName: ELITES[delegateId].name,
    text: `Your credit balance has been ${direction>0?'increased':'decreased'} by <strong>${amount} ₡</strong>. New balance: <strong>${newCredits} ₡</strong>.`,
    ts: Date.now()
  });
  document.getElementById('creditAmount').value = '';
  showToast(`Credits adjusted for ${ELITES[delegateId].name}.`, 'success');
  renderDelegateCredits();
};

// Populate credit select once
const sel = document.getElementById('creditDelegate');
if (sel) {
  Object.entries(ELITES).forEach(([id, e]) => {
    const opt = document.createElement('option');
    opt.value = id; opt.textContent = e.name;
    sel.appendChild(opt);
  });
}

// Populate delegate filter select once
const dfs = document.getElementById('delegateFilterSelect');
if (dfs) {
  Object.entries(ELITES).forEach(([id, e]) => {
    const opt = document.createElement('option');
    opt.value = id; opt.textContent = e.name;
    dfs.appendChild(opt);
  });
}

// Live credits via onValue — updates instantly when any credit changes
let delegateCreditsData = {};
Object.entries(ELITES).forEach(([id, e]) => { delegateCreditsData[id] = { name: e.name, credits: e.credits }; });

function renderDelegateCredits() {
  const panel = document.getElementById('delegateCreditsPanel');
  if (!panel) return;
  panel.innerHTML = '';
  Object.values(delegateCreditsData)
    .sort((a,b) => b.credits - a.credits)
    .forEach(d => {
      const div = document.createElement('div');
      div.className = 'credit-row';
      div.innerHTML = `<span style="color:var(--text-secondary);font-size:11px;">${d.name}</span><span style="font-family:'Cinzel',serif;color:var(--gold);font-size:12px;">${d.credits} ₡</span>`;
      panel.appendChild(div);
    });
}

onValue(ref(db, 'delegates'), snap => {
  snapToArrayWithKeys(snap).forEach(d => {
    if (delegateCreditsData[d._key]) delegateCreditsData[d._key].credits = d.credits ?? delegateCreditsData[d._key].credits;
  });
  renderDelegateCredits();
});

// ── FEED MANAGEMENT (delete individual items) ───────────────
let feedCache = {}; // key -> item

onValue(ref(db, 'feed'), snap => {
  feedCache = {};
  if (snap.exists()) Object.entries(snap.val() || {}).forEach(([k, v]) => { feedCache[k] = v; });
  renderAdminFeed();
});

function renderAdminFeed() {
  const container = document.getElementById('adminFeedPanel');
  if (!container) return;
  container.innerHTML = '';
  const items = Object.entries(feedCache)
    .filter(([k, v]) => v.text && v.text.trim() !== '')
    .sort(([,a],[,b]) => (b.ts||0)-(a.ts||0));

  if (items.length === 0) {
    container.innerHTML = '<div class="empty-state">No feed items yet.</div>';
    return;
  }

  items.forEach(([key, item]) => {
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;align-items:flex-start;gap:8px;padding:7px 10px;border:1px solid var(--border);border-left:3px solid var(--gold-dim);border-radius:3px;margin-bottom:6px;background:var(--dark-2);animation:fadeSlide .3s ease;';
    div.innerHTML = `
      <div style="flex:1;min-width:0;">
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;flex-wrap:wrap;">
          <span style="font-family:'Cinzel',serif;font-size:8px;letter-spacing:1px;padding:1px 6px;border-radius:2px;background:rgba(201,168,76,.12);color:var(--gold);border:1px solid var(--border);">${(item.badge||item.type||'event').toUpperCase()}</span>
          <span style="font-size:9px;color:var(--text-dim);">${item.time || formatTime(item.ts)}</span>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.45;word-break:break-word;">${item.text}</div>
      </div>
      <button onclick="deleteFeedItem('${key}')" title="Delete this feed item" style="background:rgba(139,26,26,.2);border:1px solid rgba(192,57,43,.35);color:var(--danger-text);padding:4px 8px;border-radius:3px;font-size:14px;cursor:pointer;flex-shrink:0;line-height:1;transition:background .2s;" onmouseover="this.style.background='rgba(139,26,26,.5)'" onmouseout="this.style.background='rgba(139,26,26,.2)'">✕</button>`;
    container.appendChild(div);
  });
}

window.deleteFeedItem = async function(key) {
  if (!confirm('Remove this item from the live feed?')) return;
  await set(ref(db, `feed/${key}`), null);
  showToast('Feed item removed.', 'danger');
};

// ── ACTIVE SESSIONS ──────────────────────────────────────────
onValue(ref(db, 'activeSessions'), snap => {
  const panel = document.getElementById('activeSessionsPanel');
  const countEl = document.getElementById('onlineCount');
  if (!panel) return;
  panel.innerHTML = '';

  if (!snap.exists()) {
    panel.innerHTML = '<div style="color:var(--text-dim);font-style:italic;padding:4px 0;">No delegates online.</div>';
    if (countEl) countEl.textContent = '0 online';
    return;
  }

  const now = Date.now();
  const sessions = snapToArrayWithKeys(snap).map(s => ({ id: s._key, ...s }));

  // Show sessions active in last 30 minutes
  const active = sessions.filter(s => s.active === true || (s.ts && (now - s.ts) < 30 * 60 * 1000));

  if (countEl) countEl.textContent = `${active.length} online`;

  if (active.length === 0) {
    panel.innerHTML = '<div style="color:var(--text-dim);font-style:italic;padding:4px 0;">No delegates online.</div>';
    return;
  }

  active.sort((a,b) => (b.ts||0)-(a.ts||0)).forEach(s => {
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid var(--border);';
    div.innerHTML = `
      <span style="width:6px;height:6px;background:var(--success-text);border-radius:50%;flex-shrink:0;"></span>
      <span style="color:var(--text-primary);flex:1;">${s.name||s.id}</span>
      <button onclick="kickDelegate('${s.id}')" style="background:rgba(139,26,26,0.2);border:1px solid rgba(192,57,43,0.3);color:var(--danger-text);font-size:8px;padding:1px 6px;border-radius:2px;cursor:pointer;font-family:'Cinzel',serif;letter-spacing:1px;">KICK</button>`;
    panel.appendChild(div);
  });
});

window.kickDelegate = async function(eliteId) {
  await set(ref(db, `activeSessions/${eliteId}`), null);
  showToast(`${ELITES[eliteId]?.name || eliteId} kicked.`, 'danger');
};


// ── ARENA TRACKER CONTROL ─────────────────────────────────────
const ARENA_COLS=72,ARENA_ROWS=72,ARENA_TILE=14;
const ARENA_DC={1:'#FFD700',2:'#CC3333',3:'#3399CC',4:'#2ABEAA',5:'#CC7722',6:'#9944CC',7:'#44AA44',8:'#CC44AA',9:'#AAAA22',10:'#CC5533',11:'#44BBAA',12:'#888888'};

const ARENA_TRIBUTES=[
  {id:'t01',short:'VALERIA', district:1},{id:'t02',short:'VELOURO', district:1},
  {id:'t03',short:'BRONTES', district:2},{id:'t04',short:'KIYRA',   district:2},
  {id:'t05',short:'SYNRIK',  district:3},{id:'t06',short:'ELENA',   district:3},
  {id:'t07',short:'CORVEN',  district:4},{id:'t08',short:'TORI',    district:4},
  {id:'t09',short:'VOLTI',   district:5},{id:'t10',short:'LYRA',    district:5},
  {id:'t11',short:'AXEL',    district:6},{id:'t12',short:'VEESUVI', district:6},
  {id:'t13',short:'PLUTO',   district:7},{id:'t14',short:'MEBANI',  district:7},
  {id:'t15',short:'ODINSOS', district:8},{id:'t16',short:'LAMINA',  district:8},
  {id:'t17',short:'ANAYA',   district:9},{id:'t18',short:'CLAUDE',  district:9},
  {id:'t19',short:'MARVIN',  district:10},{id:'t20',short:'VANDER', district:10},
  {id:'t21',short:'CORYO',   district:11},{id:'t22',short:'SISOU',  district:11},
  {id:'t23',short:'CECELIA', district:12},{id:'t24',short:'MAUVE',  district:12},
];

let arenaSelectedId=null;
let arenaPositionsCache={};

// Track positions from Firebase
onValue(ref(db,'arenaPositions'),snap=>{
  arenaPositionsCache=snap.exists()?snap.val():{};
  drawAdminMinimap();
});

// Build tribute grid buttons
const adminGrid=document.getElementById('adminTributeGrid');
if(adminGrid){
  ARENA_TRIBUTES.forEach(t=>{
    const btn=document.createElement('button');
    btn.id='arena-btn-'+t.id;
    btn.textContent='D'+t.district+' '+t.short;
    btn.style.cssText=`background:rgba(0,0,0,0.4);border:1px solid ${ARENA_DC[t.district]}33;color:${ARENA_DC[t.district]};font-family:'Cinzel',serif;font-size:7px;padding:4px 3px;cursor:pointer;border-radius:2px;transition:all .15s;`;
    btn.onclick=()=>{
      arenaSelectedId=t.id;
      document.getElementById('adminArenaSelected').textContent=t.short+' (D'+t.district+')';
      document.querySelectorAll('[id^="arena-btn-"]').forEach(b=>{
        b.style.background='rgba(0,0,0,0.4)';
        b.style.borderColor=ARENA_DC[parseInt(b.id.replace('arena-btn-t',''))||1]+'33';
      });
      btn.style.background=ARENA_DC[t.district]+'25';
      btn.style.borderColor=ARENA_DC[t.district];
    };
    adminGrid.appendChild(btn);
  });
}

// Minimap click to move tribute
const adminMinimap=document.getElementById('adminMinimap');
if(adminMinimap){
  adminMinimap.addEventListener('click',async(e)=>{
    if(!arenaSelectedId){ showToast('Select a tribute first.','danger'); return; }
    const rect=adminMinimap.getBoundingClientRect();
    const scaleX=ARENA_COLS/rect.width;
    const scaleY=ARENA_ROWS/rect.height;
    const tileC=Math.max(1,Math.min(ARENA_COLS-2,Math.floor((e.clientX-rect.left)*scaleX)));
    const tileR=Math.max(1,Math.min(ARENA_ROWS-2,Math.floor((e.clientY-rect.top)*scaleY)));
    await update(ref(db,`arenaPositions/${arenaSelectedId}`),{
      targetPx:tileC*ARENA_TILE,
      targetPy:tileR*ARENA_TILE,
    });
    const t=ARENA_TRIBUTES.find(x=>x.id===arenaSelectedId);
    showToast(`Moved ${t?.short} to (${tileC},${tileR})`,'success');
  });
}

function drawAdminMinimap(){
  const mm=document.getElementById('adminMinimap');
  if(!mm)return;
  const mc=mm.getContext('2d');
  mc.fillStyle='#0a0a0a';
  mc.fillRect(0,0,ARENA_COLS,ARENA_ROWS);
  // Centre cornucopia
  mc.fillStyle='#C9A84C';
  mc.fillRect(35,35,3,3);
  // Forest suggestion
  mc.fillStyle='#0c1e0a';
  for(let i=0;i<200;i++){
    const x=Math.floor(Math.random()*ARENA_COLS);
    const y=Math.floor(Math.random()*ARENA_ROWS);
    const dr=y-36,dc=x-36;
    if(dr*dr+dc*dc>180) mc.fillRect(x,y,1,1);
  }
  // Tribute positions
  ARENA_TRIBUTES.forEach(t=>{
    const pos=arenaPositionsCache[t.id];
    const px=pos?Math.floor(pos.targetPx/ARENA_TILE):null;
    const py=pos?Math.floor(pos.targetPy/ARENA_TILE):null;
    if(px!==null){
      mc.fillStyle=t.id===arenaSelectedId?'#ffffff':ARENA_DC[t.district];
      mc.fillRect(px,py,2,2);
    }
  });
}

drawAdminMinimap();

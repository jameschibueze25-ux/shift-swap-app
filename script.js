// SUPABASE_URL and SUPABASE_ANON_KEY are loaded from config.js (see config.example.js)
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ALL_DAYS     = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const PERIOD_TIMES = { Morning: '9am–5pm', Evening: '2pm–10pm' };

const DEFAULT_SHIFTS = [
  { day: 'Monday',    period: 'Morning', time: '9am–5pm'  },
  { day: 'Tuesday',   period: 'Morning', time: '9am–5pm'  },
  { day: 'Wednesday', period: 'Morning', time: '9am–5pm'  },
  { day: 'Thursday',  period: 'Evening', time: '2pm–10pm' },
  { day: 'Friday',    period: 'Morning', time: '9am–5pm'  }
];

let currentUser  = null;
let currentName  = '';
let myShifts     = [];
let dismissedIds = new Set();

async function initApp() {
  try {
    const { data: { session } } = await db.auth.getSession();
    if (session) {
      await onLogin(session.user);
    } else {
      showAuthScreen();
    }
  } catch (err) {
    console.error('Supabase init error:', err);
    showAuthScreen();
  }

  db.auth.onAuthStateChange(async (_event, session) => {
    if (session) {
      try {
        await onLogin(session.user);
      } catch (err) {
        console.error('onLogin error:', err);
        showToast('Something went wrong loading your account.', 'error');
      }
    } else {
      onLogout();
    }
  });
}

async function onLogin(user) {
  currentUser  = user;
  dismissedIds = new Set(
    JSON.parse(localStorage.getItem(`dismissed_${user.id}`) || '[]')
  );

  const { data: profile } = await db
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single();

  // Fallback for users created before the trigger was set up
  if (!profile) {
    await db.from('profiles').upsert({ id: user.id, name: 'User' });
  }

  currentName = profile?.name || 'User';
  document.getElementById('user-greeting').textContent = `Hi, ${currentName}`;

  const { data: existing } = await db
    .from('shifts').select('id').eq('user_id', user.id).limit(1);

  if (!existing || existing.length === 0) {
    await db.from('shifts').insert(
      DEFAULT_SHIFTS.map(s => ({ ...s, user_id: user.id }))
    );
  }

  showMainApp();
  await renderAll();
}

function onLogout() {
  currentUser  = null;
  currentName  = '';
  myShifts     = [];
  dismissedIds = new Set();
  showAuthScreen();
}

function showAuthScreen() {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
}

function showMainApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

async function handleSignup(name, email, password) {
  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: { data: { name } }
  });
  if (error) throw error;
  return data.user;
}

async function handleLogin(email, password) {
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

async function handleLogout() {
  await db.auth.signOut();
}

async function loadMyShifts() {
  const { data, error } = await db
    .from('shifts')
    .select('*')
    .eq('user_id', currentUser.id);

  if (error) throw error;

  const sorted = (data || []).sort(
    (a, b) => ALL_DAYS.indexOf(a.day) - ALL_DAYS.indexOf(b.day)
  );

  myShifts = sorted;
  return sorted;
}

async function loadMyRequests() {
  const { data, error } = await db
    .from('swap_requests')
    .select('*')
    .eq('requester_id', currentUser.id)
    .eq('status', 'open')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function loadIncomingRequests() {
  const { data, error } = await db
    .from('swap_requests')
    .select('*, profiles!requester_id(name)')
    .eq('status', 'open')
    .neq('requester_id', currentUser.id)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).filter(req => !dismissedIds.has(req.id));
}

function displaySchedule(shifts) {
  const list = document.getElementById('schedule-list');
  list.innerHTML = '';

  if (shifts.length === 0) {
    list.innerHTML = '<p class="empty-state">No shifts scheduled.</p>';
    return;
  }

  shifts.forEach(shift => {
    const div = document.createElement('div');
    div.className = 'shift-item';
    div.innerHTML = `
      <div class="shift-info">
        <span class="shift-day">${shift.day}</span>
        <span class="badge-period badge-${shift.period.toLowerCase()}">${shift.period}</span>
        <span class="shift-time">${shift.time}</span>
      </div>
      <button class="btn-swap" onclick="openSwapModal('${shift.day}', '${shift.period}')">
        Request Swap
      </button>
    `;
    list.appendChild(div);
  });
}

function displayMyRequests(requests) {
  const list = document.getElementById('my-requests-list');
  list.innerHTML = '';

  if (requests.length === 0) {
    list.innerHTML = '<p class="empty-state">No pending requests.</p>';
    return;
  }

  requests.forEach(req => {
    const div = document.createElement('div');
    div.className = 'my-request-item';
    div.innerHTML = `
      <div class="my-request-info">
        <div>
          <span class="label">Offering</span>
          <strong>${req.offer_day} ${req.offer_period}</strong>
        </div>
        <span class="arrow-icon">→</span>
        <div>
          <span class="label">Seeking</span>
          <strong>${req.want_day} ${req.want_period}</strong>
        </div>
        <span class="badge-pending">Pending</span>
      </div>
      <button class="btn-cancel" onclick="cancelMyRequest('${req.id}')">Cancel</button>
    `;
    list.appendChild(div);
  });
}

function displayIncomingRequests(requests) {
  const list = document.getElementById('requests-list');
  list.innerHTML = '';

  if (requests.length === 0) {
    list.innerHTML = '<p class="empty-state">No incoming requests.</p>';
    return;
  }

  requests.forEach(req => {
    const isSameDay = req.offer_day === req.want_day;
    const requester = req.profiles?.name || 'A colleague';
    const div = document.createElement('div');
    div.className = 'request-item';
    div.id = `request-${req.id}`;
    div.innerHTML = `
      <div class="request-header">
        <span class="requester-name">${requester}</span>
        <span class="badge-incoming">${isSameDay ? 'Period Swap' : 'Day Swap'}</span>
      </div>
      <div class="swap-details">
        <div class="swap-side">
          <span class="label">Wants your</span>
          <strong>${req.want_day}</strong>
          <span class="badge-period badge-${req.want_period.toLowerCase()} small">${req.want_period}</span>
        </div>
        <span class="swap-icon">⇄</span>
        <div class="swap-side">
          <span class="label">Offers their</span>
          <strong>${req.offer_day}</strong>
          <span class="badge-period badge-${req.offer_period.toLowerCase()} small">${req.offer_period}</span>
          <span class="offers-time">${req.offer_time}</span>
        </div>
      </div>
      <div class="request-actions">
        <button class="btn-accept" onclick="acceptSwap('${req.id}')">Accept</button>
        <button class="btn-reject" onclick="dismissRequest('${req.id}')">Decline</button>
      </div>
    `;
    list.appendChild(div);
  });
}

async function renderAll() {
  try {
    const shifts = await loadMyShifts(); // must run first — loadIncomingRequests depends on myShifts
    const [myReqs, incomingReqs] = await Promise.all([
      loadMyRequests(),
      loadIncomingRequests()
    ]);
    displaySchedule(shifts);
    displayMyRequests(myReqs);
    displayIncomingRequests(incomingReqs);
  } catch (err) {
    showToast('Failed to load data. Please refresh.', 'error');
    console.error(err);
  }
}

let pendingShift = null;

function openSwapModal(day, period) {
  pendingShift = { day, period };

  document.getElementById('modal-subtitle').textContent =
    `Offering: ${day} ${period} (${PERIOD_TIMES[period]}). What do you want in return?`;

  const daySelect = document.getElementById('want-day-select');
  daySelect.innerHTML = '';
  ALL_DAYS.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    if (d === day) opt.selected = true;
    daySelect.appendChild(opt);
  });

  // Default to the opposite period
  document.getElementById('want-period-select').value =
    period === 'Morning' ? 'Evening' : 'Morning';

  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-overlay').classList.add('visible');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('visible');
  setTimeout(() => document.getElementById('modal-overlay').classList.add('hidden'), 200);
  pendingShift = null;
}

async function submitSwapRequest() {
  if (!pendingShift) return;

  const wantDay    = document.getElementById('want-day-select').value;
  const wantPeriod = document.getElementById('want-period-select').value;

  if (wantDay === pendingShift.day && wantPeriod === pendingShift.period) {
    showToast('You already have that shift.', 'error');
    return;
  }

  const btn = document.getElementById('modal-submit');
  btn.disabled = true;
  btn.textContent = 'Posting…';

  try {
    const { error } = await db.from('swap_requests').insert({
      requester_id: currentUser.id,
      offer_day:    pendingShift.day,
      offer_period: pendingShift.period,
      offer_time:   PERIOD_TIMES[pendingShift.period],
      want_day:     wantDay,
      want_period:  wantPeriod,
      status:       'open'
    });

    if (error) throw error;

    closeModal();
    showToast(`Request posted — seeking ${wantDay} ${wantPeriod}.`);
    await renderAll();
  } catch (err) {
    showToast(err.message || 'Failed to post request.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit Request';
  }
}

async function acceptSwap(requestId) {
  const btn = document.querySelector(`#request-${requestId} .btn-accept`);
  if (btn) { btn.disabled = true; btn.textContent = 'Accepting…'; }

  try {
    const { error } = await db.rpc('accept_swap', { p_request_id: requestId });
    if (error) throw error;

    showToast('Swap accepted! Your schedule has been updated.', 'success');
    await renderAll();
  } catch (err) {
    showToast(err.message || 'Could not accept swap.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Accept'; }
  }
}

function dismissRequest(requestId) {
  const card = document.getElementById(`request-${requestId}`);
  if (card) {
    card.classList.add('removing');
    setTimeout(async () => {
      dismissedIds.add(requestId);
      localStorage.setItem(
        `dismissed_${currentUser.id}`,
        JSON.stringify([...dismissedIds])
      );
      await renderAll();
    }, 300);
  }
}

async function cancelMyRequest(requestId) {
  const { error } = await db
    .from('swap_requests')
    .update({ status: 'cancelled' })
    .eq('id', requestId)
    .eq('requester_id', currentUser.id);

  if (error) {
    showToast('Failed to cancel request.', 'error');
    return;
  }

  showToast('Request cancelled.');
  await renderAll();
}

function showToast(message, type = 'default') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('toast-show'));

  setTimeout(() => {
    toast.classList.remove('toast-show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 3500);
}

let isSignupMode = false;

function setAuthMode(signup) {
  isSignupMode = signup;
  document.getElementById('name-group').classList.toggle('hidden', !signup);
  document.getElementById('auth-submit').textContent = signup ? 'Create Account' : 'Sign In';
  document.getElementById('auth-toggle-link').textContent = signup ? 'Sign in instead' : 'Sign up';
  document.getElementById('auth-error').classList.add('hidden');
}

document.getElementById('auth-toggle-link').addEventListener('click', e => {
  e.preventDefault();
  setAuthMode(!isSignupMode);
});

document.getElementById('auth-form').addEventListener('submit', async e => {
  e.preventDefault();

  const email     = document.getElementById('auth-email').value.trim();
  const password  = document.getElementById('auth-password').value;
  const name      = document.getElementById('auth-name').value.trim();
  const errorEl   = document.getElementById('auth-error');
  const submitBtn = document.getElementById('auth-submit');

  errorEl.classList.add('hidden');
  submitBtn.disabled = true;
  submitBtn.textContent = isSignupMode ? 'Creating account…' : 'Signing in…';

  try {
    if (isSignupMode) {
      if (!name) throw new Error('Please enter your name.');
      const user = await handleSignup(name, email, password);
      showToast(`Welcome, ${name}! Your account is ready.`, 'success');
      if (user) await onLogin(user);
    } else {
      await handleLogin(email, password);
    }
  } catch (err) {
    errorEl.textContent = err.message || 'Something went wrong.';
    errorEl.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = isSignupMode ? 'Create Account' : 'Sign In';
  }
});

document.getElementById('logout-btn').addEventListener('click', handleLogout);
document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-submit').addEventListener('click', submitSwapRequest);
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

initApp();

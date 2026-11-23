const screen = document.querySelector('.screen');
const buttons = document.querySelectorAll('.quick-btn');
const LONG_PRESS_MS = 500;
const SWIPE_MIN = 50;

// --- Appui long sur Torch / Camera ---
const cancelPress = (btn) => {
  clearTimeout(btn._timer);
  btn.classList.remove('pressing');
};

buttons.forEach((btn) => {
  btn.addEventListener('pointerdown', () => {
    btn.classList.add('pressing');
    btn._timer = setTimeout(() => {
      btn.classList.remove('pressing');
      btn.classList.toggle('on');
      if (navigator.vibrate) navigator.vibrate(15);
    }, LONG_PRESS_MS);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((e) =>
    btn.addEventListener(e, () => cancelPress(btn))
  );
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
});

// --- Appui sur les apps du Home Screen ---
const appIcons = document.querySelectorAll('.app img, .dock img');

appIcons.forEach((icon) => {
  icon.addEventListener('pointerdown', () => icon.classList.add('pressed'));
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((e) =>
    icon.addEventListener(e, () => icon.classList.remove('pressed'))
  );
  icon.addEventListener('contextmenu', (e) => e.preventDefault());
});

// --- Swipe vers le haut : Home Screen / vers le bas : Lock Screen ---
let startY = null;

screen.addEventListener('pointerdown', (e) => {
  startY = e.clientY;
});

document.addEventListener('pointermove', (e) => {
  // Un swipe annule un appui long en cours
  if (startY !== null && Math.abs(e.clientY - startY) > 10) {
    buttons.forEach(cancelPress);
    appIcons.forEach((icon) => icon.classList.remove('pressed'));
  }
});

document.addEventListener('pointerup', (e) => {
  if (startY === null) return;
  const y0 = startY;
  const dy = e.clientY - y0;
  startY = null;
  if (isRebooting()) return;
  if (isAppOpen()) {
    // Dans une app : swipe vers le haut depuis le bas de l'écran = retour au Home Screen
    const fromBottom = screen.getBoundingClientRect().bottom - y0 < 120;
    if (dy < -SWIPE_MIN && fromBottom) closeSettings();
    return;
  }
  if (dy < -SWIPE_MIN) screen.classList.add('home');
  else if (dy > SWIPE_MIN) screen.classList.remove('home');
});

document.addEventListener('pointercancel', () => {
  startY = null;
});

// --- Settings > General > Software Update (via GitHub) ---
const settings = document.getElementById('settings');
const reboot = document.getElementById('reboot');
const su = document.getElementById('su');
const U = window.Updater;
const pages = {};
settings.querySelectorAll('.s-page').forEach((p) => (pages[p.dataset.page] = p));
let stack = ['main'];
let suState = 'idle';
let suBusy = false;

const isAppOpen = () => screen.classList.contains('app-open');
const isRebooting = () => reboot.classList.contains('on');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

document.getElementById('about-version').textContent = U ? U.version : '-';

function renderPages() {
  const top = stack[stack.length - 1];
  Object.keys(pages).forEach((k) => {
    pages[k].classList.toggle('active', k === top);
    pages[k].classList.toggle('behind', k !== top && stack.includes(k));
  });
}

function openSettings() {
  stack = ['main'];
  renderPages();
  screen.classList.add('app-open');
  settings.classList.add('open');
}

function closeSettings() {
  screen.classList.remove('app-open');
  settings.classList.remove('open');
}

function go(id) {
  stack.push(id);
  renderPages();
  if (id === 'update') checkUpdate();
}

function back() {
  if (stack.length > 1) {
    stack.pop();
    renderPages();
  }
}

function setSu(state, title, text) {
  suState = state;
  su.dataset.state = state;
  document.getElementById('su-title').textContent = title;
  document.getElementById('su-text').textContent = text || '';
  document.getElementById('su-btn').textContent =
    { available: 'Download and Install', ready: 'Install Now', error: 'Try Again' }[state] || '';
}

async function checkUpdate() {
  if (suBusy || suState === 'downloading') return;
  if (!U) {
    setSu('error', 'Unable to Check for Update', 'Updater not loaded (boot.js).');
    return;
  }
  const p = U.pending();
  if (p) {
    setSu('ready', 'Update Ready', `Version ${p.version} is ready to install.`);
    return;
  }
  suBusy = true;
  setSu('checking', 'Checking for Update…', '');
  try {
    const [r] = await Promise.all([U.check(), wait(900)]);
    if (r.available) {
      setSu('available', `Version ${r.version}`, r.notes || 'Bug fixes and improvements.');
    } else {
      setSu('uptodate', 'Your iPhone is up to date.', `Version ${U.version}`);
    }
  } catch (e) {
    setSu('error', 'Unable to Check for Update', e.message);
  }
  suBusy = false;
}

async function downloadUpdate() {
  if (suBusy) return;
  suBusy = true;
  const fill = document.getElementById('su-fill');
  const pct = document.getElementById('su-pct');
  setSu('downloading', 'Downloading Update…', 'Preparing…');
  fill.style.transform = 'scaleX(0)';
  pct.textContent = '0%';
  try {
    await U.download((done, total) => {
      fill.style.transform = `scaleX(${done / total})`;
      pct.textContent = `${Math.round((done / total) * 100)}%`;
      document.getElementById('su-text').textContent = `File ${done} of ${total}`;
    });
    await wait(500);
    setSu('ready', 'Update Ready', `Version ${U.pending().version} is ready to install.`);
  } catch (e) {
    setSu('error', 'Download Failed', e.message);
  }
  suBusy = false;
}

function installUpdate() {
  reboot.classList.add('on');
  setTimeout(() => U.install(), 3300);
}

document.querySelector('[data-app="settings"]').addEventListener('click', openSettings);

settings.addEventListener('click', (e) => {
  const goEl = e.target.closest('[data-go]');
  if (goEl) return go(goEl.dataset.go);
  if (e.target.closest('[data-back]')) return back();
  if (e.target.closest('#su-btn')) {
    if (suState === 'available') downloadUpdate();
    else if (suState === 'ready') installUpdate();
    else if (suState === 'error') checkUpdate();
  }
});

// Réaction à l'appui sur les lignes
settings.addEventListener('pointerdown', (e) => {
  const row = e.target.closest('.s-tap');
  if (row) row.classList.add('pressed');
});
['pointerup', 'pointercancel'].forEach((ev) =>
  document.addEventListener(ev, () =>
    settings.querySelectorAll('.pressed').forEach((r) => r.classList.remove('pressed'))
  )
);

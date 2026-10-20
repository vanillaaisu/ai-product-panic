'use strict';

const DEFAULT_CARDS = Object.freeze({
  audience: [
    'Flatmates', 'Lecturers', 'Society presidents', 'First-year students', 'Parents',
    'Group-project teammates', 'Students in the library', 'People waiting for the bus',
    'Gamers', 'Campus security', 'Coffee addicts', 'People who are always late'
  ],
  problem: [
    'Missing socks', 'Awkward silences', 'Terrible cooking', 'Forgotten deadlines',
    'Choosing what to watch', 'People leaving dishes in the sink', 'Getting out of bed',
    'Remembering people’s names', 'Finding an empty study room', 'Group members disappearing',
    'Deciding where to eat', 'Sending an embarrassing message', 'Running out of phone battery',
    'Losing your student ID', 'Making small talk'
  ],
  constraint: [
    'It only communicates through memes', 'It gives advice in the form of song titles',
    'It works only after midnight', 'It is unnecessarily dramatic', 'It thinks it is a celebrity',
    'It must rhyme every response', 'It has the personality of a disappointed lecturer',
    'It is always 80% confident and 20% confused', 'It can only ask questions',
    'It becomes offended when ignored', 'It explains everything using food',
    'It must involve a rubber duck', 'It refuses to use a screen',
    'It makes every decision with rock-paper-scissors',
    'It celebrates every successful task like a football goal'
  ]
});

const STORAGE_KEYS = {
  teams: 'ai-product-panic.teams.v1',
  cards: 'ai-product-panic.custom-cards.v1'
};
const CATEGORY_LABELS = { audience: 'Audience', problem: 'Problem', constraint: 'Constraint' };
const STATUSES = ['Waiting', 'Creating', 'Ready to Pitch', 'Pitching', 'Complete'];
const TIMER_DURATIONS = { creation: 360, pitch: 150 };
const state = {
  teams: loadTeams(),
  customCards: loadCustomCards(),
  activeTeamId: null,
  teamTimers: new Map(),
  fallbackTimers: { creation: makeTimer(TIMER_DURATIONS.creation), pitch: makeTimer(TIMER_DURATIONS.pitch) },
  draftChallenge: null,
  previousChallengeKey: '',
  teamHighlightId: null,
  isRevealing: false,
  soundEnabled: false,
  audioContext: null,
  renameTeamId: null,
  renameOpener: null
};
state.teams.forEach((team) => state.teamTimers.set(team.id, {
  creation: makeTimer(TIMER_DURATIONS.creation),
  pitch: makeTimer(TIMER_DURATIONS.pitch)
}));

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const activeTeam = () => state.teams.find((team) => team.id === state.activeTeamId) || null;

function timersForTeam(teamId) {
  let timers = state.teamTimers.get(teamId);
  if (!timers) {
    timers = {
      creation: makeTimer(TIMER_DURATIONS.creation),
      pitch: makeTimer(TIMER_DURATIONS.pitch)
    };
    state.teamTimers.set(teamId, timers);
  }
  return timers;
}

function currentTimer(timerName) {
  return state.activeTeamId
    ? timersForTeam(state.activeTeamId)[timerName]
    : state.fallbackTimers[timerName];
}

function showNotice(message) {
  const notice = $('#app-notice');
  notice.textContent = message;
  notice.hidden = false;
}

function clearNotice() {
  $('#app-notice').hidden = true;
  $('#app-notice').textContent = '';
}

function showToast(message) {
  const region = $('#toast-region');
  region.replaceChildren();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = message;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-close';
  close.setAttribute('aria-label', 'Dismiss notification');
  close.textContent = '×';
  let timeoutId = window.setTimeout(() => toast.remove(), 3000);
  close.addEventListener('click', () => {
    window.clearTimeout(timeoutId);
    toast.remove();
  });
  toast.append(text, close);
  region.append(toast);
}

function makeTimer(duration) {
  return { duration, remaining: duration, status: 'idle', interval: null, hasStarted: false };
}

function validTeam(value, ids) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { id, name, audience, problem, constraint, status, createdAt } = value;
  if (typeof id !== 'string' || !id.trim() || ids.has(id)) return null;
  if (typeof name !== 'string' || !name.trim() || name.length > 60) return null;
  if (![audience, problem, constraint].every((item) => typeof item === 'string' && item.trim() && item.length <= 120)) return null;
  if (!STATUSES.includes(status)) return null;
  if (typeof createdAt !== 'string' || !createdAt.trim() || !Number.isFinite(Date.parse(createdAt))) return null;
  ids.add(id);
  return { id, name: name.trim(), audience: audience.trim(), problem: problem.trim(), constraint: constraint.trim(), status, createdAt };
}

function loadTeams() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.teams) || '[]');
    if (!Array.isArray(stored)) return [];
    const ids = new Set();
    const names = new Set();
    return stored.map((item) => validTeam(item, ids)).filter((team) => {
      if (!team) return false;
      const key = normalizedName(team.name);
      if (names.has(key)) return false;
      names.add(key);
      return true;
    });
  } catch {
    return [];
  }
}

function loadCustomCards() {
  const empty = { audience: [], problem: [], constraint: [] };
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.cards) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return empty;
    return Object.fromEntries(Object.keys(CATEGORY_LABELS).map((category) => {
      const entries = Array.isArray(parsed[category]) ? parsed[category] : [];
      const cleaned = entries.filter((entry) => typeof entry === 'string')
        .map((entry) => entry.trim().slice(0, 120)).filter(Boolean);
      return [category, [...new Set(cleaned)]];
    }));
  } catch {
    return empty;
  }
}

function persistTeams() {
  try {
    localStorage.setItem(STORAGE_KEYS.teams, JSON.stringify(state.teams));
    clearNotice();
    return true;
  } catch (error) {
    console.error('Unable to save the Team Board in this browser.', error);
    $('#challenge-status').textContent = 'The Team Board could not be saved in this browser.';
    showNotice('The Team Board could not be saved in this browser. Check available browser storage.');
    return false;
  }
}

function persistCustomCards() {
  try {
    localStorage.setItem(STORAGE_KEYS.cards, JSON.stringify(state.customCards));
    clearNotice();
    return true;
  } catch (error) {
    console.error('Unable to save custom cards in this browser.', error);
    $('#challenge-status').textContent = 'Custom cards could not be saved in this browser.';
    showNotice('Custom cards could not be saved in this browser. Check available browser storage.');
    return false;
  }
}

function allCards(category) {
  return [...DEFAULT_CARDS[category], ...state.customCards[category]];
}

function drawRandomChallenge() {
  const categories = Object.keys(CATEGORY_LABELS);
  const challenge = Object.fromEntries(categories.map((category) => {
    const cards = allCards(category);
    return [category, cards[Math.floor(Math.random() * cards.length)]];
  }));
  const key = JSON.stringify(categories.map((category) => challenge[category]));
  if (key === state.previousChallengeKey) {
    const category = categories.find((item) => allCards(item).length > 1);
    if (category) {
      const alternatives = allCards(category).filter((card) => card !== challenge[category]);
      challenge[category] = alternatives[Math.floor(Math.random() * alternatives.length)];
    }
  }
  state.previousChallengeKey = JSON.stringify(categories.map((category) => challenge[category]));
  return challenge;
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return `team-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizedName(name) {
  return name.trim().toLocaleLowerCase();
}

function teamNameExists(name, exceptId = null) {
  return state.teams.some((team) => team.id !== exceptId && normalizedName(team.name) === normalizedName(name));
}

function updateTeamNameFeedback() {
  const input = $('#team-name');
  const helper = $('#team-name-helper');
  const name = input.value.trim();
  const duplicate = Boolean(name && teamNameExists(name, state.activeTeamId));
  input.classList.toggle('is-invalid', duplicate);
  input.classList.toggle('is-valid', Boolean(name) && !duplicate);
  helper.classList.toggle('is-invalid', duplicate);
  helper.classList.toggle('is-valid', Boolean(name) && !duplicate);
  if (duplicate) helper.textContent = 'That team name is already on the board.';
  else if (name) helper.textContent = 'Ready when you are.';
  else helper.textContent = 'Give this challenge a team before revealing the brief.';
  input.setAttribute('aria-invalid', String(duplicate));
}

function setView(viewName) {
  $$('[data-view-panel]').forEach((panel) => {
    const visible = panel.dataset.viewPanel === viewName;
    panel.hidden = !visible;
    panel.classList.toggle('is-visible', visible);
  });
  $$('.nav-button').forEach((button) => {
    const current = button.dataset.view === viewName;
    button.classList.toggle('is-active', current);
    if (current) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (viewName === 'team-board') renderTeamBoard();
  if (viewName === 'creation-timer') updateCreationDisplay();
  if (viewName === 'pitch-timer') updatePitchDisplay();
}

async function generateChallenge() {
  if (state.isRevealing) return;
  const nameInput = $('#team-name');
  const teamName = nameInput.value.trim();
  $('#team-name-error').hidden = true;
  if (!teamName) {
    $('#team-name-error').textContent = 'Give this challenge a team before revealing the brief.';
    $('#team-name-error').hidden = false;
    nameInput.focus();
    return;
  }
  if (teamNameExists(teamName, state.activeTeamId)) {
    $('#team-name-error').textContent = 'That team name is already on the board.';
    $('#team-name-error').hidden = false;
    nameInput.focus();
    return;
  }
  if (state.activeTeamId && activeTeam() && state.draftChallenge) {
    const shouldReplace = window.confirm(`Draw a new challenge for ${activeTeam().name}? This replaces their saved challenge.`);
    if (!shouldReplace) return;
  }

  const challenge = drawRandomChallenge();
  const generateButton = $('#generate-button');
  const shuffleButton = $('#draw-again-button');
  const triggerButton = document.activeElement === shuffleButton ? shuffleButton : generateButton;
  const originalButtonText = triggerButton.textContent;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const revealDelay = reducedMotion ? 0 : 165;
  state.isRevealing = true;
  generateButton.disabled = true;
  shuffleButton.disabled = true;
  triggerButton.textContent = 'Shuffling the deck…';
  $('#copy-challenge').disabled = true;
  $('#save-challenge').disabled = true;
  nameInput.disabled = true;
  $('#saved-next-actions').hidden = true;
  try {
    for (const category of Object.keys(CATEGORY_LABELS)) {
      const value = $(`#${category}-value`);
      const card = $(`#${category}-card`);
      value.textContent = challenge[category];
      value.classList.add('is-filled');
      card.classList.add('is-revealing');
      if (revealDelay) await new Promise((resolve) => window.setTimeout(resolve, revealDelay));
      card.classList.remove('is-revealing');
    }
    state.draftChallenge = challenge;
    $('#current-team-label').textContent = `Challenge for ${teamName}`;
    $('#current-team-label').hidden = false;
    shuffleButton.hidden = false;
    $('#copy-challenge').disabled = false;
    $('#save-challenge').disabled = false;
    $('#challenge-status').textContent = 'Your brief is ready. Save it to the board or shuffle once more.';
  } finally {
    state.isRevealing = false;
    generateButton.disabled = false;
    triggerButton.textContent = originalButtonText;
    shuffleButton.disabled = false;
    nameInput.disabled = false;
    updateTeamNameFeedback();
  }
}

function renderChallenge(challenge) {
  Object.keys(CATEGORY_LABELS).forEach((category) => {
    const value = $(`#${category}-value`);
    value.textContent = challenge[category];
    value.classList.add('is-filled');
  });
}

function clearDraftDisplay() {
  state.draftChallenge = null;
  state.previousChallengeKey = '';
  $('#current-team-label').hidden = true;
  $('#draw-again-button').hidden = true;
  $('#copy-challenge').disabled = true;
  $('#save-challenge').disabled = true;
  $('#saved-next-actions').hidden = true;
  Object.keys(CATEGORY_LABELS).forEach((category) => {
    const value = $(`#${category}-value`);
    value.textContent = category === 'audience' ? 'Waiting for a crowd'
      : category === 'problem' ? 'Waiting for trouble' : 'Waiting for a twist';
    value.classList.remove('is-filled');
    $(`#${category}-card`).classList.remove('is-revealing');
  });
}

function saveChallenge() {
  const nameInput = $('#team-name');
  const name = nameInput.value.trim();
  $('#team-name-error').hidden = true;
  if (!name) {
    $('#team-name-error').textContent = 'Give this challenge a team before revealing the brief.';
    $('#team-name-error').hidden = false;
    nameInput.focus();
    return;
  }
  if (!state.draftChallenge) {
    $('#challenge-status').textContent = 'Draw a challenge before saving it.';
    return;
  }
  if (teamNameExists(name, state.activeTeamId)) {
    $('#team-name-error').textContent = 'That team name is already on the board.';
    $('#team-name-error').hidden = false;
    nameInput.focus();
    return;
  }
  let team = activeTeam();
  const isNewTeam = !team;
  if (team) {
    Object.assign(team, state.draftChallenge, { name });
  } else {
    team = {
      id: createId(),
      name,
      ...state.draftChallenge,
      status: 'Waiting',
      createdAt: new Date().toISOString()
    };
    state.teams.unshift(team);
    state.activeTeamId = team.id;
  }
  if (!persistTeams()) return;
  updateTeamCount();
  $('#current-team-label').textContent = `Challenge for ${team.name}`;
  $('#challenge-status').textContent = `${team.name}’s challenge is saved. No timer has started.`;
  $('#saved-next-actions').hidden = false;
  if (isNewTeam) state.teamHighlightId = team.id;
  renderTeamBoard();
  if (isNewTeam) {
    showToast('Team added to the board');
  }
}

function challengeText(teamName, challenge) {
  return `Team: ${teamName}\nAudience: ${challenge.audience}\nProblem: ${challenge.problem}\nConstraint: ${challenge.constraint}`;
}

async function copyChallenge() {
  const name = $('#team-name').value.trim();
  if (!state.draftChallenge || !name) return;
  const text = challengeText(name, state.draftChallenge);
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
    } else {
      const helper = document.createElement('textarea');
      helper.value = text;
      helper.setAttribute('readonly', '');
      helper.style.position = 'fixed';
      helper.style.opacity = '0';
      document.body.append(helper);
      helper.select();
      const copied = document.execCommand('copy');
      helper.remove();
      if (!copied) throw new Error('The browser did not allow copying to the clipboard.');
    }
    $('#challenge-status').textContent = 'Your brief is ready. Save it to the board or shuffle once more.';
    showToast('Brief copied');
  } catch (error) {
    console.error('Unable to copy the challenge.', error);
    $('#challenge-status').textContent = 'Could not copy automatically. Select the challenge cards to copy them manually.';
  }
}

function updateTeamCount() {
  const count = $('#team-count');
  if (count) count.textContent = String(state.teams.length);
}

function renderTeamBoard() {
  const list = $('#team-list');
  list.replaceChildren();
  $('#empty-board').hidden = state.teams.length !== 0;
  state.teams.forEach((team) => {
    const card = document.createElement('article');
    card.className = 'team-card paper-panel';
    card.dataset.teamId = team.id;
    const top = document.createElement('div');
    top.className = 'team-card-top';
    const heading = document.createElement('h2');
    heading.textContent = team.name;
    const statusLabel = document.createElement('label');
    statusLabel.className = `status-pill status-${team.status.toLowerCase().replaceAll(' ', '-')}`;
    statusLabel.setAttribute('for', `status-${team.id}`);
    statusLabel.textContent = team.status;
    const statusSelect = document.createElement('select');
    statusSelect.className = 'status-select';
    statusSelect.id = `status-${team.id}`;
    statusSelect.setAttribute('aria-label', `Change status for ${team.name}`);
    STATUSES.forEach((status) => {
      const option = document.createElement('option');
      option.value = status;
      option.textContent = status;
      option.selected = status === team.status;
      statusSelect.append(option);
    });
    statusLabel.append(statusSelect);
    top.append(heading, statusLabel);

    const details = document.createElement('dl');
    details.className = 'team-challenge-summary';
    [['Audience', team.audience], ['Problem', team.problem], ['Constraint', team.constraint]].forEach(([label, value]) => {
      const row = document.createElement('div');
      const term = document.createElement('dt');
      term.textContent = label;
      const description = document.createElement('dd');
      description.textContent = value;
      row.append(term, description);
      details.append(row);
    });
    const actions = document.createElement('div');
    actions.className = 'team-card-actions';
    const open = actionButton('Open Team', 'button-primary', () => openTeam(team.id));
    const rename = actionButton('Edit name', 'button-outline', () => openRenameDialog(team));
    const regenerate = actionButton('Regenerate', 'button-outline', () => regenerateTeam(team));
    const remove = actionButton('Delete', 'button-danger-quiet', () => deleteTeam(team));
    actions.append(open, rename, regenerate, remove);
    card.append(top, details, actions);
    list.append(card);
    if (team.id === state.teamHighlightId && !$('#view-team-board').hidden) {
      card.classList.add('team-card-added');
      state.teamHighlightId = null;
      window.setTimeout(() => card.classList.remove('team-card-added'), 1200);
    }

    statusSelect.addEventListener('change', () => {
      team.status = statusSelect.value;
      statusLabel.firstChild.textContent = team.status;
      statusLabel.className = `status-pill status-${team.status.toLowerCase().replaceAll(' ', '-')}`;
      persistTeams();
    });
  });
}

function actionButton(text, className, callback) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `button ${className}`;
  button.textContent = text;
  button.addEventListener('click', callback);
  return button;
}

function selectTeam(team, targetView = 'creation-timer') {
  state.activeTeamId = team.id;
  timersForTeam(team.id);
  $('#team-name').value = team.name;
  updateTeamNameFeedback();
  state.draftChallenge = { audience: team.audience, problem: team.problem, constraint: team.constraint };
  renderChallenge(state.draftChallenge);
  $('#current-team-label').textContent = `Challenge for ${team.name}`;
  $('#current-team-label').hidden = false;
  $('#draw-again-button').hidden = false;
  $('#copy-challenge').disabled = false;
  $('#save-challenge').disabled = false;
  $('#saved-next-actions').hidden = false;
  $('#challenge-status').textContent = `${team.name}’s saved challenge is open.`;
  updateTimerTeamNames();
  setView(targetView);
}

function openTeam(teamId) {
  const team = state.teams.find((item) => item.id === teamId);
  if (team) selectTeam(team, 'creation-timer');
}

function openRenameDialog(team) {
  state.renameTeamId = team.id;
  state.renameOpener = document.activeElement;
  $('#rename-input').value = team.name;
  $('#rename-error').hidden = true;
  $('#rename-dialog').showModal();
  $('#rename-input').focus();
  $('#rename-input').select();
}

function closeRenameDialog() {
  const dialog = $('#rename-dialog');
  if (dialog.open) dialog.close();
  if (state.renameOpener && typeof state.renameOpener.focus === 'function') state.renameOpener.focus();
  state.renameTeamId = null;
  state.renameOpener = null;
}

function saveTeamName(event) {
  if (event.submitter && event.submitter.value === 'cancel') return;
  event.preventDefault();
  const team = state.teams.find((item) => item.id === state.renameTeamId);
  if (!team) {
    closeRenameDialog();
    return;
  }
  const name = $('#rename-input').value.trim();
  if (!name) {
    $('#rename-error').textContent = 'Team name cannot be blank.';
    $('#rename-error').hidden = false;
    $('#rename-input').focus();
    return;
  }
  if (teamNameExists(name, team.id)) {
    $('#rename-error').textContent = 'A team already has that name. Try a distinguishable name.';
    $('#rename-error').hidden = false;
    $('#rename-input').focus();
    return;
  }
  team.name = name;
  persistTeams();
  if (team.id === state.activeTeamId) {
    $('#team-name').value = name;
    $('#current-team-label').textContent = `Challenge for ${name}`;
    updateTimerTeamNames();
  }
  renderTeamBoard();
  closeRenameDialog();
}

function regenerateTeam(team) {
  if (!window.confirm(`Regenerate ${team.name}’s challenge? Their current challenge will be replaced.`)) return;
  resetTimer('creation', true, true, team.id);
  resetTimer('pitch', true, true, team.id);
  if (team.id === state.activeTeamId) {
    $$('.checklist input').forEach((checkbox) => { checkbox.checked = false; });
  }
  state.previousChallengeKey = JSON.stringify([team.audience, team.problem, team.constraint]);
  const challenge = drawRandomChallenge();
  Object.assign(team, challenge, { status: 'Waiting' });
  if (team.id === state.activeTeamId) {
    state.draftChallenge = challenge;
    renderChallenge(challenge);
    $('#challenge-status').textContent = `${team.name}’s challenge has been regenerated. No timer has started.`;
  }
  persistTeams();
  renderTeamBoard();
}

function deleteTeam(team) {
  if (!window.confirm(`Delete ${team.name} and their saved challenge from the Team Board?`)) return;
  const timers = state.teamTimers.get(team.id);
  if (timers) {
    Object.values(timers).forEach((timer) => {
      if (timer.interval !== null) window.clearInterval(timer.interval);
    });
    state.teamTimers.delete(team.id);
  }
  state.teams = state.teams.filter((item) => item.id !== team.id);
  if (state.activeTeamId === team.id) clearCurrentTeam();
  persistTeams();
  updateTeamCount();
  renderTeamBoard();
}

function clearCurrentTeam() {
  state.activeTeamId = null;
  $('#team-name').value = '';
  updateTeamNameFeedback();
  clearDraftDisplay();
  state.fallbackTimers = {
    creation: makeTimer(TIMER_DURATIONS.creation),
    pitch: makeTimer(TIMER_DURATIONS.pitch)
  };
  $$('.checklist input').forEach((checkbox) => { checkbox.checked = false; });
  updateCreationDisplay();
  updatePitchDisplay();
  updateTimerTeamNames();
}

function prepareNextTeam() {
  clearCurrentTeam();
  $('#team-name-error').hidden = true;
  $('#challenge-status').textContent = 'Enter a team name to get started.';
  setView('new-challenge');
  $('#team-name').focus();
}

function formatTime(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function updateTimerTeamNames() {
  const team = activeTeam();
  const label = team ? team.name : 'Choose a team from the board';
  $('#creation-team-name').textContent = label;
  $('#pitch-team-name').textContent = label;
  $('#creation-start').disabled = !team;
  $('#pitch-start').disabled = !team;
}

function updateCreationDisplay() {
  const timer = currentTimer('creation');
  $('#creation-timer-display').textContent = formatTime(timer.remaining);
  $('#creation-timer-display').setAttribute('aria-label', `${Math.floor(timer.remaining / 60)} minutes ${String(timer.remaining % 60).padStart(2, '0')} seconds remaining`);
  $('#creation-panel').classList.toggle('is-warning', timer.status === 'running' && timer.remaining <= 60);
  $('#creation-panel').classList.toggle('is-finished', timer.status === 'finished');
  $('#creation-timer-display').classList.toggle('is-pulsing', timer.status === 'running' && timer.remaining > 0 && timer.remaining <= 10);
  $('#creation-start').hidden = timer.status !== 'idle';
  $('#creation-pause').hidden = timer.status !== 'running';
  $('#creation-resume').hidden = timer.status !== 'paused';
  $('#creation-finish-early').hidden = timer.status !== 'running' && timer.status !== 'paused';
  $('#pitch-ready-actions').hidden = timer.status !== 'finished';
  const message = $('#creation-timer-message');
  if (timer.status === 'idle') message.textContent = 'Start when your team is ready to create.';
  else if (timer.status === 'running' && timer.remaining <= 60) message.textContent = 'One minute remaining. Finalise your pitch!';
  else if (timer.status === 'running') message.textContent = 'Build boldly. The clock is ticking.';
  else if (timer.status === 'paused') message.textContent = 'Timer paused. Resume whenever your team is ready.';
  else message.textContent = 'Creation time is over! Get ready for your presentation.';
  updateTimerTeamNames();
}

function updatePitchDisplay() {
  const timer = currentTimer('pitch');
  $('#pitch-timer-display').textContent = formatTime(timer.remaining);
  $('#pitch-timer-display').setAttribute('aria-label', `${timer.remaining} seconds remaining`);
  $('#pitch-panel').classList.toggle('is-warning', timer.status === 'running' && timer.remaining <= 10);
  $('#pitch-panel').classList.toggle('is-finished', timer.status === 'finished');
  $('#pitch-timer-display').classList.toggle('is-pulsing', timer.status === 'running' && timer.remaining > 0 && timer.remaining <= 10);
  $('#pitch-start').hidden = timer.status !== 'idle';
  $('#pitch-pause').hidden = timer.status !== 'running';
  $('#pitch-resume').hidden = timer.status !== 'paused';
  $('#pitch-finish-early').hidden = timer.status !== 'running' && timer.status !== 'paused';
  $('#pitch-finished-actions').hidden = timer.status !== 'finished';
  const message = $('#pitch-timer-message');
  if (timer.status === 'idle') message.textContent = 'The microphone is yours.';
  else if (timer.status === 'running') message.textContent = 'Team pitch in progress. Make it count!';
  else if (timer.status === 'paused') message.textContent = 'Pitch paused. Resume when the team is ready.';
  else message.textContent = 'That’s your pitch!';
  updateTimerTeamNames();
}

function setTeamStatus(status, teamId = state.activeTeamId) {
  const team = state.teams.find((item) => item.id === teamId);
  if (!team) return;
  team.status = status;
  persistTeams();
  renderTeamBoard();
}

function startTimer(timerName, teamId = state.activeTeamId) {
  const team = state.teams.find((item) => item.id === teamId);
  if (!team) return;
  const timer = timersForTeam(teamId)[timerName];
  if (timer.status === 'running' || timer.status === 'finished') return;
  timer.status = 'running';
  timer.hasStarted = true;
  if (timer.interval !== null) window.clearInterval(timer.interval);
  timer.interval = window.setInterval(() => {
    if (timer.status !== 'running') return;
    timer.remaining = Math.max(0, timer.remaining - 1);
    if (state.activeTeamId === teamId) {
      if (timerName === 'creation') updateCreationDisplay();
      else updatePitchDisplay();
    }
    if (timer.remaining === 0) finishTimer(timerName, teamId);
  }, 1000);
  if (timerName === 'creation') {
    setTeamStatus('Creating', teamId);
  } else {
    setTeamStatus('Pitching', teamId);
  }
  if (state.activeTeamId === teamId) {
    if (timerName === 'creation') updateCreationDisplay();
    else updatePitchDisplay();
  }
}

function pauseTimer(timerName, teamId = state.activeTeamId) {
  if (!teamId) return;
  const timer = timersForTeam(teamId)[timerName];
  if (timer.status !== 'running') return;
  if (timer.interval !== null) window.clearInterval(timer.interval);
  timer.interval = null;
  timer.status = 'paused';
  if (state.activeTeamId === teamId) {
    if (timerName === 'creation') updateCreationDisplay();
    else updatePitchDisplay();
  }
}

function resetTimer(timerName, confirmed = false, preserveTeamStatus = false, teamId = state.activeTeamId) {
  const timer = teamId ? timersForTeam(teamId)[timerName] : state.fallbackTimers[timerName];
  if (!confirmed && timer.hasStarted) {
    const label = timerName === 'creation' ? 'creation timer' : 'pitch timer';
    if (!window.confirm(`Reset the ${label} to ${formatTime(timer.duration)}?`)) return false;
  }
  if (timer.interval !== null) window.clearInterval(timer.interval);
  timer.interval = null;
  timer.remaining = timer.duration;
  timer.status = 'idle';
  timer.hasStarted = false;
  if (timerName === 'creation') {
    const team = state.teams.find((item) => item.id === teamId);
    if (!preserveTeamStatus && team && team.status === 'Creating') setTeamStatus('Waiting', teamId);
    if (state.activeTeamId === teamId || !teamId) updateCreationDisplay();
  } else {
    const team = state.teams.find((item) => item.id === teamId);
    if (!preserveTeamStatus && team && team.status === 'Pitching') setTeamStatus('Ready to Pitch', teamId);
    if (state.activeTeamId === teamId || !teamId) updatePitchDisplay();
  }
  if (!confirmed) showToast('Timer reset');
  return true;
}

function finishTimer(timerName, teamId = state.activeTeamId) {
  if (!teamId) return;
  const timer = timersForTeam(teamId)[timerName];
  if (timer.interval !== null) window.clearInterval(timer.interval);
  timer.interval = null;
  timer.status = 'finished';
  if (timerName === 'creation') {
    setTeamStatus('Ready to Pitch', teamId);
  }
  if (state.activeTeamId === teamId) {
    if (timerName === 'creation') updateCreationDisplay();
    else updatePitchDisplay();
  }
  playCompletionSound();
}

function finishCreationEarly() {
  if (!window.confirm('Finish creation time now and move this team to Ready to Pitch?')) return;
  finishTimer('creation');
}

function finishPitchEarly() {
  if (!window.confirm('End this pitch now?')) return;
  finishTimer('pitch');
}

async function playCompletionSound() {
  if (!state.soundEnabled) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      $('#challenge-status').textContent = 'This browser does not support the completion sound.';
      showNotice('This browser does not support the completion sound.');
      return;
    }
    if (!state.audioContext) state.audioContext = new AudioContextClass();
    if (state.audioContext.state === 'suspended') await state.audioContext.resume();
    const now = state.audioContext.currentTime;
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const oscillator = state.audioContext.createOscillator();
      const gain = state.audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.1, now + index * 0.14 + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.14 + 0.33);
      oscillator.connect(gain);
      gain.connect(state.audioContext.destination);
      oscillator.start(now + index * 0.14);
      oscillator.stop(now + index * 0.14 + 0.34);
    });
  } catch (error) {
    console.error('Unable to play the completion sound.', error);
    $('#challenge-status').textContent = 'The completion sound could not be played.';
    showNotice('The completion sound could not be played.');
  }
}

function markCurrentTeamComplete() {
  const team = activeTeam();
  if (!team) return;
  setTeamStatus('Complete');
  showToast('Team marked complete');
  setView('team-board');
}

function resetEntireWorkshop() {
  const confirmed = window.confirm('Reset the entire workshop?\n\nThis permanently deletes every saved team and challenge from this browser and resets both timers. Built-in cards and custom cards will remain.');
  if (!confirmed) return;
  state.teamTimers.forEach((timers) => Object.values(timers).forEach((timer) => {
    if (timer.interval !== null) window.clearInterval(timer.interval);
  }));
  state.teams = [];
  state.teamTimers.clear();
  state.teamHighlightId = null;
  const saved = persistTeams();
  state.activeTeamId = null;
  state.previousChallengeKey = '';
  state.fallbackTimers = {
    creation: makeTimer(TIMER_DURATIONS.creation),
    pitch: makeTimer(TIMER_DURATIONS.pitch)
  };
  clearDraftDisplay();
  $('#team-name').value = '';
  updateTeamNameFeedback();
  $('#team-name-error').hidden = true;
  $('#challenge-status').textContent = saved
    ? 'Workshop reset. Enter a team name to begin again.'
    : 'This browser could not save the reset. The board is cleared until this page is refreshed.';
  $$('.checklist input').forEach((checkbox) => { checkbox.checked = false; });
  updateTeamCount();
  updateTimerTeamNames();
  updateCreationDisplay();
  updatePitchDisplay();
  renderTeamBoard();
  setView('team-board');
}

function renderCustomCards() {
  const list = $('#custom-lists');
  list.replaceChildren();
  Object.keys(CATEGORY_LABELS).forEach((category) => {
    const section = document.createElement('section');
    section.className = 'custom-list';
    const heading = document.createElement('h2');
    heading.textContent = `${CATEGORY_LABELS[category]} · ${state.customCards[category].length}`;
    const entries = document.createElement('ul');
    if (state.customCards[category].length === 0) {
      const empty = document.createElement('li');
      empty.className = 'custom-empty';
      empty.textContent = 'No custom cards yet.';
      entries.append(empty);
    } else {
      state.customCards[category].forEach((entry, index) => {
        const item = document.createElement('li');
        item.className = 'custom-chip';
        const text = document.createElement('span');
        text.textContent = entry;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'remove-card';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `Remove custom ${CATEGORY_LABELS[category].toLowerCase()} card: ${entry}`);
        remove.addEventListener('click', () => {
          state.customCards[category].splice(index, 1);
          persistCustomCards();
          renderCustomCards();
        });
        item.append(text, remove);
        entries.append(item);
      });
    }
    section.append(heading, entries);
    list.append(section);
  });
}

function addCustomCard(event) {
  event.preventDefault();
  const category = $('#card-category').value;
  const input = $('#custom-card-entry');
  const entry = input.value.trim();
  if (!entry) {
    input.setCustomValidity('Enter a card before adding it.');
    input.reportValidity();
    return;
  }
  input.setCustomValidity('');
  if (allCards(category).some((card) => card.toLocaleLowerCase() === entry.toLocaleLowerCase())) {
    input.setCustomValidity('That card is already in this category.');
    input.reportValidity();
    return;
  }
  state.customCards[category].push(entry);
  if (persistCustomCards()) {
    renderCustomCards();
    input.value = '';
    $('#challenge-status').textContent = `Custom ${CATEGORY_LABELS[category].toLowerCase()} card added.`;
    input.focus();
  }
}

function restoreDefaultCards() {
  if (!window.confirm('Remove all custom cards and restore the built-in challenge cards?')) return;
  state.customCards = { audience: [], problem: [], constraint: [] };
  if (persistCustomCards()) {
    renderCustomCards();
    $('#challenge-status').textContent = 'Built-in challenge cards restored.';
  }
}

function finishIntro() {
  const overlay = $('#intro-overlay');
  if (!overlay || overlay.hidden) return;
  overlay.classList.add('intro-leaving');
  document.documentElement.classList.remove('has-intro');
  window.setTimeout(() => {
    overlay.hidden = true;
    $('#team-name').focus();
  }, 220);
}

$$('.nav-button').forEach((button) => button.addEventListener('click', () => {
  if (button.dataset.view === 'new-challenge' && state.activeTeamId) {
    prepareNextTeam();
    return;
  }
  setView(button.dataset.view);
}));
$('#generate-button').addEventListener('click', generateChallenge);
$('#draw-again-button').addEventListener('click', generateChallenge);
$('#team-name').addEventListener('input', () => {
  $('#team-name-error').hidden = true;
  updateTeamNameFeedback();
});
$('#save-challenge').addEventListener('click', saveChallenge);
$('#copy-challenge').addEventListener('click', copyChallenge);
$('#start-creation-from-new').addEventListener('click', () => setView('creation-timer'));
$('#board-new-team').addEventListener('click', prepareNextTeam);
$('#empty-new-team').addEventListener('click', prepareNextTeam);
$('#creation-start').addEventListener('click', () => startTimer('creation'));
$('#creation-pause').addEventListener('click', () => pauseTimer('creation'));
$('#creation-resume').addEventListener('click', () => startTimer('creation'));
$('#creation-reset').addEventListener('click', () => resetTimer('creation'));
$('#creation-finish-early').addEventListener('click', finishCreationEarly);
$('#start-pitch-from-creation').addEventListener('click', () => setView('pitch-timer'));
$('#creation-return-board').addEventListener('click', () => setView('team-board'));
$('#pitch-start').addEventListener('click', () => startTimer('pitch'));
$('#pitch-pause').addEventListener('click', () => pauseTimer('pitch'));
$('#pitch-resume').addEventListener('click', () => startTimer('pitch'));
$('#pitch-reset').addEventListener('click', () => resetTimer('pitch'));
$('#pitch-finish-early').addEventListener('click', finishPitchEarly);
$('#mark-team-complete').addEventListener('click', markCurrentTeamComplete);
$('#pitch-return-board').addEventListener('click', () => setView('team-board'));
$('#prepare-next-team').addEventListener('click', prepareNextTeam);
$('#reset-workshop').addEventListener('click', resetEntireWorkshop);
$('#sound-toggle').addEventListener('click', () => {
  state.soundEnabled = !state.soundEnabled;
  $('#sound-toggle').setAttribute('aria-pressed', String(state.soundEnabled));
  $('#sound-label').textContent = state.soundEnabled ? 'Sound on' : 'Sound off';
  $('#sound-icon').textContent = state.soundEnabled ? '♫' : '♪';
});
$('#custom-card-form').addEventListener('submit', addCustomCard);
$('#custom-card-entry').addEventListener('input', (event) => event.currentTarget.setCustomValidity(''));
$('#restore-defaults').addEventListener('click', restoreDefaultCards);
$('#rename-form').addEventListener('submit', saveTeamName);
$('#rename-dialog').addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeRenameDialog();
  }
});
$('#rename-dialog').addEventListener('close', () => {
  if (state.renameOpener && typeof state.renameOpener.focus === 'function') state.renameOpener.focus();
  state.renameTeamId = null;
  state.renameOpener = null;
});
$('#rename-input').addEventListener('input', () => { $('#rename-error').hidden = true; });
$('#intro-begin').addEventListener('click', finishIntro);

const societyDialog = $('#society-dialog');
const societyLogoImage = $('#society-logo-image');
const societyLogoPlaceholder = $('#society-logo-placeholder');
const societyLogoTrigger = $('#society-logo-trigger');
function showSocietyLogo() {
  societyLogoPlaceholder.hidden = true;
  societyLogoImage.hidden = false;
}
function showSocietyLogoPlaceholder() {
  societyLogoImage.hidden = true;
  societyLogoPlaceholder.hidden = false;
}
societyLogoImage.addEventListener('load', showSocietyLogo);
societyLogoImage.addEventListener('error', showSocietyLogoPlaceholder);
societyLogoImage.src = 'society-logo.jpg';
societyLogoTrigger.addEventListener('click', () => societyDialog.showModal());
$('#society-dialog-close').addEventListener('click', () => societyDialog.close());
$('#society-dialog-close-action').addEventListener('click', () => societyDialog.close());
societyDialog.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    societyDialog.close();
  }
});
societyDialog.addEventListener('click', (event) => {
  if (event.target === societyDialog) societyDialog.close();
});

$$('.checklist input').forEach((checkbox) => {
  checkbox.addEventListener('change', () => checkbox.closest('label').classList.toggle('is-checked', checkbox.checked));
});

renderTeamBoard();
renderCustomCards();
updateTeamCount();
updateTeamNameFeedback();
updateTimerTeamNames();
updateCreationDisplay();
updatePitchDisplay();

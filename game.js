'use strict';

const ALPHABET = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','Ñ',
                  'O','P','Q','R','S','T','U','V','W','X','Y','Z'];
const TURN_DURATION  = 60;
const MAX_GAME_TIME  = 900;

const state = {
  phase: 'setup',
  players: [
    { name: 'Jugador 1', rosco: [], currentIdx: 0, done: false },
    { name: 'Jugador 2', rosco: [], currentIdx: 0, done: false },
  ],
  activePlayer: 0,
  turnTimeLeft: TURN_DURATION,
  totalElapsed:  0,
  timerInterval: null,
  questions:     [],
  audioCtx:      null,
};

function getAudioCtx() {
  if (!state.audioCtx) {
    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (state.audioCtx.state === 'suspended') state.audioCtx.resume();
  return state.audioCtx;
}

function playSound(type) {
  try {
    const ctx = getAudioCtx();
    const t   = ctx.currentTime;
    const note = (freq, start, dur, wtype = 'sine', vol = 0.35) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = wtype;
      osc.frequency.setValueAtTime(freq, t + start);
      gain.gain.setValueAtTime(vol, t + start);
      gain.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
      osc.start(t + start);
      osc.stop(t  + start + dur + 0.05);
    };
    switch (type) {
      case 'correct': note(660,0,0.12); note(880,0.12,0.3); break;
      case 'wrong':   note(220,0,0.15,'sawtooth',0.3); note(110,0.15,0.35,'sawtooth',0.25); break;
      case 'tick':    note(900,0,0.06,'square',0.12); break;
      case 'switch':  note(440,0,0.1); note(554,0.12,0.2); break;
      case 'win':     [523,659,784,1047].forEach((f,i)=>note(f,i*0.14,0.35,'sine',0.3)); break;
    }
  } catch (_) {}
}

function normalize(s) {
  return String(s).toUpperCase()
    .replace(/[ÁÀÂÄ]/g,'A').replace(/[ÉÈÊË]/g,'E')
    .replace(/[ÍÌÎÏ]/g,'I').replace(/[ÓÒÔÖ]/g,'O')
    .replace(/[ÚÙÛÜ]/g,'U')
    .replace(/Ñ/g,'N').replace(/ñ/g,'N')
    .replace(/[^A-Z0-9]/g,'')
    .trim();
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function selectQuestions() {
  return ALPHABET.map(letter => {
    const pool = QUESTION_BANK[letter];
    return pool[Math.floor(Math.random() * pool.length)];
  });
}

function buildRosco(questions) {
  return ALPHABET.map((letter, i) => ({
    letter,
    question:     questions[i],
    status:       'pending',
    passedBefore: false,
  }));
}

function initGame(p1name, p2name) {
  state.questions = selectQuestions();
  [0, 1].forEach(i => {
    const p = state.players[i];
    p.name       = [p1name, p2name][i] || `Jugador ${i + 1}`;
    p.rosco      = buildRosco(state.questions);
    p.rosco[0].status = 'current';
    p.currentIdx = 0;
    p.done       = false;
  });
  state.activePlayer  = 0;
  state.turnTimeLeft  = TURN_DURATION;
  state.totalElapsed  = 0;
  state.phase         = 'playing';
  showScreen('game');
  render();
  startTimer();
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const CX = 200, CY = 200, RING_R = 158, NODE_R = 17;

function renderRosco(pidx) {
  const svg   = document.getElementById(`rosco-${pidx}`);
  const rosco = state.players[pidx].rosco;
  const n     = rosco.length;
  svg.innerHTML = '';
  const ring = document.createElementNS(SVG_NS, 'circle');
  ring.setAttribute('cx', CX); ring.setAttribute('cy', CY);
  ring.setAttribute('r',  RING_R);
  ring.setAttribute('fill', 'none');
  ring.setAttribute('stroke', '#1e2a40');
  ring.setAttribute('stroke-width', '2');
  svg.appendChild(ring);
  rosco.forEach((item, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const x = CX + RING_R * Math.cos(angle);
    const y = CY + RING_R * Math.sin(angle);
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', `rosco-node status-${item.status}`);
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', x); circle.setAttribute('cy', y);
    circle.setAttribute('r',  NODE_R);
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', x); text.setAttribute('y', y);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('class', 'node-letter');
    text.textContent = item.letter;
    g.appendChild(circle);
    g.appendChild(text);
    svg.appendChild(g);
  });
  const player  = state.players[pidx];
  const correct = rosco.filter(r => r.status === 'correct').length;
  const wrong   = rosco.filter(r => r.status === 'wrong').length;
  const cName = document.createElementNS(SVG_NS, 'text');
  cName.setAttribute('x', CX); cName.setAttribute('y', CY - 14);
  cName.setAttribute('text-anchor', 'middle');
  cName.setAttribute('dominant-baseline', 'central');
  cName.setAttribute('class', 'center-name');
  cName.textContent = player.name;
  svg.appendChild(cName);
  const cScore = document.createElementNS(SVG_NS, 'text');
  cScore.setAttribute('x', CX); cScore.setAttribute('y', CY + 12);
  cScore.setAttribute('text-anchor', 'middle');
  cScore.setAttribute('dominant-baseline', 'central');
  cScore.setAttribute('class', 'center-score');
  cScore.textContent = `${correct} ✓  ${wrong} ✗`;
  svg.appendChild(cScore);
  if (state.activePlayer === pidx && !player.done && state.phase === 'playing') {
    const arc = document.createElementNS(SVG_NS, 'circle');
    arc.setAttribute('cx', CX); arc.setAttribute('cy', CY);
    arc.setAttribute('r',  RING_R + 10);
    arc.setAttribute('fill', 'none');
    arc.setAttribute('stroke', '#00e5ff');
    arc.setAttribute('stroke-width', '2');
    arc.setAttribute('stroke-dasharray', '8 5');
    arc.setAttribute('class', 'active-arc');
    svg.appendChild(arc);
  }
}

function render() {
  renderRosco(0);
  renderRosco(1);
  renderCenter();
  updatePanelClasses();
}

function renderCenter() {
  const ap     = state.activePlayer;
  const player = state.players[ap];
  const timerEl = document.getElementById('timer');
  timerEl.textContent = formatTime(state.turnTimeLeft);
  timerEl.className   = `timer${state.turnTimeLeft <= 10 ? ' warning' : ''}`;
  const label = document.getElementById('current-player-label');
  label.textContent = player.done ? '¡Rosco completado!' : `Turno de ${player.name}`;
  const canPlay = !player.done && state.phase === 'playing';
  if (canPlay) {
    const item = player.rosco[player.currentIdx];
    document.getElementById('current-letter-display').textContent = item.letter;
    document.getElementById('definition-text').textContent = item.question.def;
  } else {
    document.getElementById('current-letter-display').textContent = player.done ? '✓' : '…';
    document.getElementById('definition-text').textContent = player.done ? '¡Rosco completado!' : '';
  }
  const answerInput = document.getElementById('answer-input');
  const btnAnswer   = document.getElementById('btn-answer');
  const btnPass     = document.getElementById('btn-pass');
  answerInput.disabled = !canPlay;
  btnAnswer.disabled   = !canPlay;
  btnPass.disabled     = !canPlay;
  if (canPlay) answerInput.focus();
}

function updatePanelClasses() {
  [0, 1].forEach(i => {
    const panel = document.getElementById(`player-panel-${i}`);
    if (!panel) return;
    panel.classList.toggle('active', state.activePlayer === i && !state.players[i].done);
    panel.classList.toggle('done',   state.players[i].done);
  });
}

function handleAnswer() {
  const input  = document.getElementById('answer-input');
  const answer = input.value.trim();
  if (!answer) return;
  const ap   = state.activePlayer;
  const player = state.players[ap];
  if (player.done || state.phase !== 'playing') { input.value = ''; return; }
  const item    = player.rosco[player.currentIdx];
  const correct = normalize(answer) === normalize(item.question.resp);
  if (correct) {
    item.status = 'correct';
    playSound('correct');
    const allCorrect = player.rosco.every(r => r.status === 'correct');
    if (allCorrect) {
      player.done = true;
      input.value = '';
      playSound('win');
      render();
      postTurnCheck();
      return;
    }
  } else {
    item.status = 'wrong';
    playSound('wrong');
    flashWrongAnswer(item.question.resp);
  }
  advanceToNext(ap);
  input.value = '';
  render();
  postTurnCheck();
}

function handlePass() {
  const ap     = state.activePlayer;
  const player = state.players[ap];
  if (player.done || state.phase !== 'playing') return;
  const item = player.rosco[player.currentIdx];
  if (item.passedBefore) {
    item.status = 'wrong';
    playSound('wrong');
  } else {
    item.status = 'passed';
    item.passedBefore = true;
  }
  advanceToNext(ap);
  render();
  postTurnCheck();
}

function advanceToNext(pidx) {
  const player = state.players[pidx];
  const rosco  = player.rosco;
  const n      = rosco.length;
  let next = -1;
  for (let i = 1; i <= n; i++) {
    const idx = (player.currentIdx + i) % n;
    if (rosco[idx].status === 'pending' || rosco[idx].status === 'passed') {
      next = idx;
      break;
    }
  }
  if (next === -1) {
    player.done = true;
  } else {
    player.currentIdx = next;
    rosco[next].status = 'current';
  }
}

function postTurnCheck() {
  if (state.phase !== 'playing') return;
  const p0done = state.players[0].done;
  const p1done = state.players[1].done;
  if (p0done && p1done) { endGame(); return; }
  if (state.players[state.activePlayer].done) {
    const other = 1 - state.activePlayer;
    if (!state.players[other].done) {
      state.activePlayer = other;
      startTimer();
      render();
    }
  }
}

function flashWrongAnswer(resp) {
  const el = document.getElementById('wrong-flash');
  if (!el) return;
  el.textContent = `Era: ${resp}`;
  el.classList.add('visible');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('visible'), 2200);
}

function startTimer() {
  clearInterval(state.timerInterval);
  state.turnTimeLeft = TURN_DURATION;
  state.timerInterval = setInterval(() => {
    state.turnTimeLeft--;
    state.totalElapsed++;
    if (state.turnTimeLeft > 0 && state.turnTimeLeft <= 5) playSound('tick');
    updateTimerDisplay();
    if (state.totalElapsed >= MAX_GAME_TIME) { endGame(); return; }
    if (state.turnTimeLeft <= 0) switchPlayer();
  }, 1000);
}

function stopTimer() {
  clearInterval(state.timerInterval);
  state.timerInterval = null;
}

function updateTimerDisplay() {
  const el = document.getElementById('timer');
  if (!el) return;
  el.textContent = formatTime(state.turnTimeLeft);
  el.className   = `timer${state.turnTimeLeft <= 10 ? ' warning' : ''}`;
}

function switchPlayer() {
  if (state.phase !== 'playing') return;
  const p0done = state.players[0].done;
  const p1done = state.players[1].done;
  if (p0done && p1done) { endGame(); return; }
  const other = 1 - state.activePlayer;
  if (!state.players[other].done) {
    playSound('switch');
    state.activePlayer = other;
  }
  startTimer();
  render();
}

function endGame() {
  stopTimer();
  state.phase = 'gameover';
  const p0 = state.players[0];
  const p1 = state.players[1];
  const s0 = p0.rosco.filter(r => r.status === 'correct').length;
  const s1 = p1.rosco.filter(r => r.status === 'correct').length;
  let winnerText;
  if (s0 > s1)       winnerText = `¡Ganó ${p0.name}!`;
  else if (s1 > s0)  winnerText = `¡Ganó ${p1.name}!`;
  else               winnerText = '¡Empate!';
  document.getElementById('winner-text').textContent = winnerText;
  document.getElementById('result-p0').innerHTML = `${p0.name}: <span class="score-num">${s0}</span> / 27`;
  document.getElementById('result-p1').innerHTML = `${p1.name}: <span class="score-num">${s1}</span> / 27`;
  renderAnswerSummary(p0, 'summary-p0');
  renderAnswerSummary(p1, 'summary-p1');
  playSound('win');
  showScreen('gameover');
}

function renderAnswerSummary(player, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  player.rosco.forEach(item => {
    if (item.status === 'correct') return;
    const span = document.createElement('span');
    span.className = 'summary-item';
    span.innerHTML = `<b>${item.letter}</b>: ${item.question.resp}`;
    el.appendChild(span);
  });
  if (!el.childElementCount) {
    el.innerHTML = '<span class="summary-perfect">¡Rosco perfecto!</span>';
  }
}

function showScreen(name) {
  ['setup', 'game', 'gameover'].forEach(s => {
    document.getElementById(`screen-${s}`).classList.toggle('hidden', s !== name);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  showScreen('setup');
  ['player1-name', 'player2-name'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-start').click();
    });
  });
  document.getElementById('btn-start').addEventListener('click', () => {
    const p1 = document.getElementById('player1-name').value.trim();
    const p2 = document.getElementById('player2-name').value.trim();
    initGame(p1, p2);
  });
  document.getElementById('btn-answer').addEventListener('click', handleAnswer);
  document.getElementById('btn-pass').addEventListener('click', handlePass);
  document.getElementById('answer-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleAnswer();
  });
  document.getElementById('btn-restart').addEventListener('click', () => {
    stopTimer();
    document.getElementById('player1-name').value = '';
    document.getElementById('player2-name').value = '';
    showScreen('setup');
    document.getElementById('player1-name').focus();
  });
});
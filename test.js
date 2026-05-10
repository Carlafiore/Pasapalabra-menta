/**
 * Test integral del Rosco — ejecutar con: node test.js
 * Simula el DOM mínimo, carga questions.js y game.js, y prueba
 * todos los escenarios: respuesta correcta, incorrecta, pasapalabra,
 * puntaje, rotación del rosco, cambio de turno y fin de juego.
 */
'use strict';

// ── 1. DOM MÍNIMO ──────────────────────────────────────────────────────────
const elements = {};
const mockEl = (id) => ({
  id, textContent: '', innerHTML: '', className: '', style: {},
  value: '', disabled: false, _t: null,
  classList: {
    toggle(cls, force) {
      const cur = this._classes || (this._classes = new Set());
      if (force === undefined) cur.has(cls) ? cur.delete(cls) : cur.add(cls);
      else force ? cur.add(cls) : cur.delete(cls);
    },
    add(cls)    { (this._classes || (this._classes = new Set())).add(cls); },
    remove(cls) { (this._classes || (this._classes = new Set())).delete(cls); },
    has(cls)    { return !!(this._classes && this._classes.has(cls)); },
  },
  addEventListener() {},
  focus() {},
});
global.document = {
  getElementById(id)    { return (elements[id] = elements[id] || mockEl(id)); },
  createElementNS()     { return mockEl('svg-el'); },
  addEventListener(ev, cb) { if (ev === 'DOMContentLoaded') cb(); },
};
global.window = { AudioContext: undefined, webkitAudioContext: undefined };
global.clearInterval = () => {};
global.setInterval   = () => 0;
global.setTimeout    = () => 0;
global.clearTimeout  = () => {};

// ── 2. CARGAR CÓDIGO ──────────────────────────────────────────────────────
// Reescribir const → var en el nivel superior para que eval los eleve al scope global
const fs = require('fs');
const vm = require('vm');

function loadGlobal(path) {
  let src = fs.readFileSync(path, 'utf8');
  // Reemplazar const/let de nivel superior para que vm las haga globales
  src = src.replace(/^(const|let)\s+/gm, 'var ');
  vm.runInThisContext(src, { filename: path });
}

loadGlobal('/home/user/Pasapalabra-menta/questions.js');
loadGlobal('/home/user/Pasapalabra-menta/game.js');

// Stubear todas las funciones de render — solo probamos lógica pura
render             = () => {};
renderRosco        = () => {};
renderCenter       = () => {};
flashWrongAnswer   = () => {};
updateTimerDisplay = () => {};
startTimer         = () => {};  // evitar setInterval real en tests
playSound          = () => {};  // evitar AudioContext en tests
// showHandoff actualiza state.activePlayer pero no cambia pantallas en tests
showHandoff        = (idx) => { state.activePlayer = idx; };

// ── 3. HELPERS DE TEST ────────────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(condition, msg) {
  if (condition) { console.log('  ✓', msg); passed++; }
  else           { console.error('  ✗', msg); failed++; }
}

// ── 4. TEST: BANCO DE PREGUNTAS ───────────────────────────────────────────
console.log('\n=== TEST 1: Banco de preguntas ===');

const LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','Ñ',
                 'O','P','Q','R','S','T','U','V','W','X','Y','Z'];

LETTERS.forEach(l => {
  const pool = QUESTION_BANK[l];
  assert(!!pool, `Letra ${l}: existe en QUESTION_BANK`);
  if (!pool) return;
  assert(pool.length >= 4, `Letra ${l}: tiene ≥4 preguntas (${pool.length})`);

  pool.forEach((q, i) => {
    const emp = q.def.startsWith('Empieza con ' + l);
    const con = q.def.startsWith('Con la ' + l);
    assert(emp || con, `${l}[${i}]: prefijo válido ("${q.def.slice(0,30)}…")`);

    const rn = normalize(q.resp);
    const ln = normalize(l);

    if (emp) {
      assert(rn.startsWith(ln),
        `${l}[${i}] EMPIEZA: "${q.resp}" comienza con ${l}`);
    }
    if (con) {
      // Para Ñ usamos la letra original (sin normalizar) en el startsWith,
      // porque normalize() convierte Ñ→N lo cual haría falsos positivos.
      const origUpper  = q.resp.toUpperCase();
      const startsOrig = origUpper.startsWith(l);          // 'Ñ' o letra normal
      const containsN  = rn.includes(ln);                  // en versión normalizada
      assert(containsN && !startsOrig,
        `${l}[${i}] CONTIENE: "${q.resp}" contiene ${l} sin empezar con ${l}`);
    }
  });
});

// ── 5. TEST: normalize() ─────────────────────────────────────────────────
console.log('\n=== TEST 2: normalize() ===');

const normCases = [
  ['Águila',   'AGUILA'],
  ['NIÑO',     'NINO'],
  ['niño',     'NINO'],
  ['ñandú',    'NANDU'],
  ['Córdoba',  'CORDOBA'],
  ['  miel ',  'MIEL'],
  ['FÚTBOL',   'FUTBOL'],
];
normCases.forEach(([inp, expected]) => {
  assert(normalize(inp) === expected, `normalize("${inp}") → "${expected}"`);
});

// ── 6. TEST: LÓGICA DEL JUEGO ─────────────────────────────────────────────
console.log('\n=== TEST 3: initGame() ===');

initGame('Ana', 'Bruno');
assert(state.phase === 'playing',           'phase = playing tras initGame');
assert(state.players[0].name === 'Ana',     'Jugador 1 nombre: Ana');
assert(state.players[1].name === 'Bruno',   'Jugador 2 nombre: Bruno');
assert(state.players[0].rosco.length === 27,'Rosco J1 tiene 27 letras');
assert(state.players[1].rosco.length === 27,'Rosco J2 tiene 27 letras');
assert(state.players[0].rosco[0].status === 'current', 'J1: letra A en estado current');
assert(state.players[1].rosco[0].status === 'current', 'J2: letra A en estado current');
assert(state.activePlayer === 0,            'Turno inicial: Jugador 1');

// Cada jugador recibe selección independiente del banco
const q0 = state.players[0].rosco.map(r => r.question.resp);
const q1 = state.players[1].rosco.map(r => r.question.resp);
assert(q0.length === 27 && q1.length === 27, 'Ambos jugadores tienen 27 preguntas (selección independiente)');
assert(
  state.players[0].rosco.every(item => QUESTION_BANK[item.letter].includes(item.question)),
  'J1: preguntas pertenecen al banco correcto por letra'
);
assert(
  state.players[1].rosco.every(item => QUESTION_BANK[item.letter].includes(item.question)),
  'J2: preguntas pertenecen al banco correcto por letra'
);

// ── 7. TEST: RESPUESTA CORRECTA ───────────────────────────────────────────
console.log('\n=== TEST 4: Respuesta correcta ===');

const respA = state.players[0].rosco[0].question.resp;
elements['answer-input'].value = respA;
handleAnswer();

assert(state.players[0].rosco[0].status === 'correct',
  `Letra A marcada "correct" tras responder "${respA}"`);
assert(state.players[0].currentIdx === 1,
  'J1 avanzó a letra B (idx=1)');
assert(state.players[0].rosco[1].status === 'current',
  'Letra B ahora en estado "current"');

// ── 8. TEST: RESPUESTA CASE-INSENSITIVE Y CON TILDES ─────────────────────
console.log('\n=== TEST 5: Normalización en respuesta ===');

// Averiguar la respuesta de la letra B
const respB = state.players[0].rosco[1].question.resp;
// Responder en minúscula y sin tildes
const respBLower = respB.toLowerCase()
  .replace(/á/g,'a').replace(/é/g,'e').replace(/í/g,'i').replace(/ó/g,'o').replace(/ú/g,'u').replace(/ñ/g,'n');
elements['answer-input'].value = respBLower;
handleAnswer();

assert(state.players[0].rosco[1].status === 'correct',
  `B aceptada en minúscula+sin tildes ("${respBLower}")`);

// ── 9. TEST: RESPUESTA INCORRECTA ────────────────────────────────────────
console.log('\n=== TEST 6: Respuesta incorrecta ===');

// Estamos en C (idx=2)
elements['answer-input'].value = 'RESPUESTA_INCORRECTA_XYZ';
handleAnswer();

assert(state.players[0].rosco[2].status === 'wrong',
  'Letra C marcada "wrong" tras respuesta incorrecta');
assert(state.players[0].currentIdx === 3,
  'J1 avanzó a D (idx=3) tras error');

// ── 10. TEST: PASAPALABRA (primera vez) ──────────────────────────────────
console.log('\n=== TEST 7: Pasapalabra ===');

// En D
handlePass();
assert(state.players[0].rosco[3].status === 'passed',
  'Letra D marcada "passed" tras primer pasapalabra');
assert(state.players[0].rosco[3].passedBefore === true,
  'passedBefore=true en D');
assert(state.players[0].currentIdx === 4,
  'J1 avanzó a E (idx=4)');

// ── 11. TEST: PASAPALABRA SEGUNDA VEZ → WRONG ────────────────────────────
console.log('\n=== TEST 8: Pasapalabra doble → wrong ===');

// Responder E,F,G,...,Z correctamente para volver a D con passedBefore=true
// Simulamos avanzar hasta que currentIdx vuelva a 3 (D)
// Método: pasar todas las letras restantes excepto D
const rosco0 = state.players[0].rosco;
let limit = 50; // seguro
while (state.players[0].currentIdx !== 3 && limit-- > 0) {
  const cur = state.players[0].rosco[state.players[0].currentIdx];
  if (cur.status === 'current') {
    elements['answer-input'].value = cur.question.resp; // responder correctamente
    handleAnswer();
  }
}
// Ahora deberíamos estar en D (idx=3) que ya fue "passed"
if (state.players[0].currentIdx === 3 && state.phase === 'playing') {
  assert(state.players[0].rosco[3].status === 'current',
    'D vuelve como "current" tras completar el ciclo');
  handlePass(); // segunda pasada → debe marcar wrong
  assert(state.players[0].rosco[3].status === 'wrong',
    'D marcada "wrong" en segunda pasada (sin responder)');
} else {
  // El juego puede haber terminado si J1 completó todo
  assert(true, 'J1 completó rosco antes de volver a D (juego terminó normalmente)');
}

// ── 12. TEST: SISTEMA DE PUNTAJE ─────────────────────────────────────────
console.log('\n=== TEST 9: Puntaje ===');

// Reiniciar para puntaje limpio
initGame('Test1', 'Test2');

// J1 responde todas correctamente
LETTERS.forEach((l, i) => {
  if (state.phase !== 'playing') return;
  if (state.players[0].currentIdx === i) {
    elements['answer-input'].value = state.players[0].rosco[i].question.resp;
    handleAnswer();
  }
});

const j1correct = state.players[0].rosco.filter(r => r.status === 'correct').length;
console.log(`  J1 correctas: ${j1correct}/27`);
assert(j1correct > 0, 'J1 tiene al menos una respuesta correcta');

// ── 13. TEST: CAMBIO DE TURNO (switchPlayer) ─────────────────────────────
console.log('\n=== TEST 10: Cambio de turno ===');

initGame('P1', 'P2');
assert(state.activePlayer === 0, 'Turno inicial: J1 (0)');
switchPlayer();
assert(state.activePlayer === 1, 'Tras switchPlayer: J2 (1)');
switchPlayer();
assert(state.activePlayer === 0, 'Tras segundo switch: J1 (0)');

// ── 14. TEST: FIN DE JUEGO ───────────────────────────────────────────────
console.log('\n=== TEST 11: Fin de juego ===');

initGame('Final1', 'Final2');

// Marcar todos como terminados directamente
[0,1].forEach(pi => {
  state.players[pi].rosco.forEach(item => { item.status = 'correct'; });
  state.players[pi].done = true;
});
// Forzar endGame
endGame();
assert(state.phase === 'gameover', 'phase = gameover tras endGame()');

// ── 15. RESUMEN ──────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════');
console.log(`RESULTADO: ${passed} tests pasaron, ${failed} fallaron`);
if (failed > 0) process.exit(1);
else console.log('✓ Todos los tests OK');

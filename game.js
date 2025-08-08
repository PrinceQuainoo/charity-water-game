(() => {
  const board = document.getElementById('board');
  const scoreEl = document.getElementById('score');
  const timeEl = document.getElementById('time');
  const livesEl = document.getElementById('lives');
  const streakEl = document.getElementById('streak');
  const difficultyEl = document.getElementById('difficulty');
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const resetBtn = document.getElementById('resetBtn');
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modalTitle');
  const modalText = document.getElementById('modalText');
  const modalClose = document.getElementById('modalClose');
  const milestoneBox = document.getElementById('milestones');
  document.getElementById('year').textContent = new Date().getFullYear();

  // Simple WebAudio beep synth (no external files)
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const actx = new AudioCtx();
  function beep(freq=880, duration=0.09, type='sine', vol=0.08) {
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = type; osc.frequency.value = freq;
    gain.gain.value = vol;
    osc.connect(gain); gain.connect(actx.destination);
    const now = actx.currentTime;
    osc.start(now);
    osc.stop(now + duration);
  }

  let state = {
    running: false,
    paused: false,
    score: 0, lives: 3, timeLeft: 60,
    multiplier: 1, streak: 0,
    timers: new Set(),
    spawnRate: 850, // ms
    hazardRate: 0.22, // portion of spawns that are hazards
    powerRate: 0.10,  // chance a spawn is a power-up
    bucketActive: false,
    milestonesShown: new Set(),
  };

  const DIFF = {
    easy:   {time: 70, spawn: 950, hazard: 0.18, power: 0.12},
    normal: {time: 60, spawn: 850, hazard: 0.22, power: 0.10},
    hard:   {time: 55, spawn: 650, hazard: 0.30, power: 0.08},
  };

  // Milestone messages (LevelUp)
  const MESSAGES = [
    {score: 60,  text: "Halfway to the first jerry can! Keep going."},
    {score: 150, text: "Great work — you're filling the tank fast."},
    {score: 220, text: "Milestone reached: a family’s daily water!"},
    {score: 300, text: "Community is close to its goal today!"},
  ];

  function setDifficulty(mode) {
    const d = DIFF[mode] || DIFF.normal;
    state.timeLeft = d.time;
    state.spawnRate = d.spawn;
    state.hazardRate = d.hazard;
    state.powerRate = d.power;
    board.classList.toggle('hard', mode === 'hard');
    timeEl.textContent = state.timeLeft;
  }

  function clearBoard() {
    board.querySelectorAll('.drop,.hazard,.power').forEach(n => n.remove());
  }

  function resetGame() {
    stopAllTimers();
    state = {...state, running:false, paused:false, score:0, lives:3, multiplier:1, streak:0, bucketActive:false, milestonesShown:new Set()};
    milestoneBox.innerHTML = "";
    setDifficulty(difficultyEl.value);
    updateHUD();
    clearBoard();
  }

  function updateHUD() {
    scoreEl.textContent = state.score;
    livesEl.textContent = state.lives;
    timeEl.textContent = state.timeLeft;
    streakEl.textContent = 'x' + state.multiplier;
  }

  function stopAllTimers() {
    for (const t of state.timers) clearInterval(t), clearTimeout(t);
    state.timers.clear();
  }

  function randomPos(size = 40) {
    const rect = board.getBoundingClientRect();
    const x = Math.random() * (rect.width - size);
    const y = Math.random() * (rect.height - size);
    return {x, y};
  }

  function spawnEntity() {
    if (!state.running || state.paused) return;

    const roll = Math.random();
    if (roll < state.powerRate) {
      spawnPower();
    } else if (roll < state.powerRate + state.hazardRate) {
      spawnHazard();
    } else {
      spawnDrop();
    }
  }

  function spawnDrop() {
    const el = document.createElement('div');
    el.className = 'drop';
    const {x, y} = randomPos(36);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'Clean water drop, 10 points');
    el.addEventListener('pointerdown', () => collectDrop(el));
    board.appendChild(el);

    const ttl = setTimeout(() => { el.remove(); miss(); }, 2200);
    state.timers.add(ttl);
  }

  function spawnHazard() {
    const el = document.createElement('div');
    el.className = 'hazard';
    const {x, y} = randomPos(44);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'Contaminant, avoid');
    el.addEventListener('pointerdown', () => hitHazard(el));
    board.appendChild(el);

    const ttl = setTimeout(() => el.remove(), 3000);
    state.timers.add(ttl);
  }

  function spawnPower() {
    const kind = Math.random() < 0.5 ? 'bucket' : 'filter';
    const el = document.createElement('div');
    el.className = 'power ' + kind;
    el.textContent = (kind === 'bucket' ? 'Bucket x2' : 'Filter');
    const {x, y} = randomPos(80);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.addEventListener('pointerdown', () => activatePower(kind, el));
    board.appendChild(el);

    const ttl = setTimeout(() => el.remove(), 4500);
    state.timers.add(ttl);
  }

  function collectDrop(el) {
    if (!state.running || state.paused) return;
    el.remove();
    state.streak++;
    if (state.streak % 4 === 0 && state.multiplier < 5) state.multiplier++;
    const base = 10;
    const points = base * state.multiplier * (state.bucketActive ? 2 : 1);
    state.score += points;
    beep(880, 0.06, 'triangle', 0.06);
    updateHUD();
    maybeShowMilestone();
  }

  function miss() {
    state.streak = 0;
    state.multiplier = 1;
    beep(220, 0.08, 'sine', 0.05);
    updateHUD();
  }

  function hitHazard(el) {
    if (!state.running || state.paused) return;
    el.remove();
    state.lives -= 1;
    state.streak = 0;
    state.multiplier = 1;
    beep(140, 0.12, 'square', 0.07);
    updateHUD();
    if (state.lives <= 0) endGame(false, 'The water got too contaminated.');
  }

  function activatePower(kind, el) {
    el.remove();
    if (kind === 'filter') {
      board.querySelectorAll('.hazard').forEach(n => n.remove());
      beep(520, 0.1, 'sawtooth', 0.06);
    } else if (kind === 'bucket') {
      state.bucketActive = true;
      beep(660, 0.1, 'sawtooth', 0.06);
      const t = setTimeout(() => { state.bucketActive = false; updateHUD(); }, 5000);
      state.timers.add(t);
    }
  }

  function countdown() {
    if (!state.running || state.paused) return;
    state.timeLeft -= 1;
    updateHUD();
    if (state.timeLeft <= 0) {
      const goal = goalForDifficulty(difficultyEl.value);
      endGame(state.score >= goal, `Goal: ${goal} points. You scored ${state.score}.`);
    }
  }

  function goalForDifficulty(mode) {
    if (mode === 'easy') return 220;
    if (mode === 'hard') return 360;
    return 300;
  }

  function startGame() {
    resetGame();
    state.running = true;
    updateHUD();
    const spawner = setInterval(spawnEntity, state.spawnRate);
    const ticker = setInterval(countdown, 1000);
    state.timers.add(spawner); state.timers.add(ticker);
  }

  function pauseGame() {
    if (!state.running) return;
    state.paused = !state.paused;
    pauseBtn.textContent = state.paused ? 'Resume' : 'Pause';
  }

  function endGame(won, extra='') {
    state.running = false;
    stopAllTimers();
    clearBoard();
    modalTitle.textContent = won ? 'You did it! 💧' : 'Game Over';
    modalText.textContent = (won
      ? `You reached the clean water goal! Final score: ${state.score}. ${extra}`
      : `You didn't reach the goal. Final score: ${state.score}. ${extra}`);
    modal.hidden = false;
    beep(won ? 880 : 180, 0.2, 'triangle', 0.08);
  }

  function maybeShowMilestone() {
    for (const m of MESSAGES) {
      if (state.score >= m.score && !state.milestonesShown.has(m.score)) {
        state.milestonesShown.add(m.score);
        const note = document.createElement('div');
        note.className = 'note';
        note.textContent = m.text;
        milestoneBox.prepend(note);
      }
    }
  }

  // UI hooks
  startBtn.addEventListener('click', startGame);
  pauseBtn.addEventListener('click', pauseGame);
  resetBtn.addEventListener('click', resetGame);
  modalClose.addEventListener('click', () => modal.hidden = true);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
  difficultyEl.addEventListener('change', () => setDifficulty(difficultyEl.value));

  board.addEventListener('keydown', (e)=>{
    if (e.code === 'Space') { e.preventDefault(); pauseGame(); }
    if (e.key.toLowerCase() === 'r') { e.preventDefault(); resetGame(); }
  });

  // Initialize
  setDifficulty(difficultyEl.value);
  updateHUD();
})();
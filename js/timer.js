// Timer guiado para sequências de etapas (aquecimento / alongamento).
// Cada etapa tem um tempo; etapas com "sides" são feitas dos dois lados.
// Entre as etapas há uma pausa curta para se posicionar.

const GET_READY = 5;
let active = null; // só um timer roda por vez

export function stopActiveTimer() {
  active?.stop();
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

let audio;
function beep(freq = 880, ms = 180) {
  try {
    audio ??= new AudioContext();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = freq;
    gain.gain.value = 0.15;
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + ms / 1000);
  } catch {
    // sem áudio disponível
  }
  navigator.vibrate?.(ms);
}

function phasesFor(steps) {
  const phases = [];
  steps.forEach((step, i) => {
    const sides = step.sides ? [' · lado direito', ' · lado esquerdo'] : [''];
    sides.forEach((side, s) => {
      phases.push({ step: i, label: step.name + side, secs: step.secs, sideChange: s > 0 });
    });
  });
  return phases;
}

export function stepsHTML(steps) {
  return `
    <div class="timer">
      <p class="t-label">Toque em iniciar e siga o tempo</p>
      <p class="t-time">${fmt(steps[0].secs)}</p>
      <div class="progress"><div style="width:0%"></div></div>
      <div class="t-buttons">
        <button class="btn primary" data-act="toggle">▶ Iniciar</button>
        <button class="btn ghost" data-act="skip">Pular ⏭</button>
      </div>
    </div>
    <ol class="steps">${steps.map((s, i) => `
      <li data-step="${i}">
        <span class="dot"></span>
        <div><p class="s-name">${s.name}</p><p class="small muted">${s.tip}</p></div>
        <span class="s-dur">${s.secs} s${s.sides ? '<br><small>cada lado</small>' : ''}</span>
      </li>`).join('')}
    </ol>`;
}

export function setupTimer(root, steps) {
  const phases = phasesFor(steps);
  const $ = (sel) => root.querySelector(sel);
  const label = $('.t-label');
  const time = $('.t-time');
  const bar = $('.progress div');
  const toggle = $('[data-act="toggle"]');
  const items = [...root.querySelectorAll('[data-step]')];

  let idx = 0;
  let remaining = phases[0].secs;
  let total = phases[0].secs;
  let preparing = false;
  let interval = null;
  let wakeLock = null;
  let finished = false;

  function paint() {
    const ph = phases[idx];
    if (finished) {
      label.textContent = 'Concluído! ✓';
      time.textContent = '0:00';
      bar.style.width = '100%';
    } else if (preparing) {
      label.textContent = `${ph.sideChange ? 'Troque de lado' : 'Prepare-se'}: ${ph.label}`;
      time.textContent = fmt(remaining);
      bar.style.width = '0%';
    } else {
      label.textContent = ph.label;
      time.textContent = fmt(remaining);
      bar.style.width = `${((total - remaining) / total) * 100}%`;
    }
    root.classList.toggle('preparing', preparing);
    items.forEach((li, i) => {
      const current = !finished && i === ph.step;
      li.classList.toggle('active', current);
      li.classList.toggle('done', finished || i < ph.step);
    });
    toggle.textContent = finished ? '↺ Recomeçar' : interval ? '⏸ Pausar' : '▶ Continuar';
    if (!interval && !finished && idx === 0 && remaining === phases[0].secs && !preparing) toggle.textContent = '▶ Iniciar';
  }

  function goTo(i, withPrep) {
    if (i >= phases.length) {
      finished = true;
      beep(1046, 400);
      pause();
      return paint();
    }
    idx = i;
    preparing = withPrep;
    total = withPrep ? GET_READY : phases[i].secs;
    remaining = total;
    paint();
  }

  function tick() {
    remaining -= 1;
    if (remaining <= 3 && remaining > 0) beep(660, 80);
    if (remaining > 0) return paint();
    if (preparing) {
      beep(880, 250);
      preparing = false;
      total = phases[idx].secs;
      remaining = total;
      return paint();
    }
    beep(988, 300);
    goTo(idx + 1, true);
  }

  async function play() {
    if (active && active !== controller) active.stop();
    active = controller;
    if (finished) {
      finished = false;
      goTo(0, false);
    }
    interval = setInterval(tick, 1000);
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* opcional */ }
    paint();
  }

  function pause() {
    clearInterval(interval);
    interval = null;
    wakeLock?.release().catch(() => {});
    wakeLock = null;
    if (active === controller) active = null;
    paint();
  }

  const controller = { stop: pause };

  toggle.addEventListener('click', () => (interval ? pause() : play()));
  $('[data-act="skip"]').addEventListener('click', () => {
    if (finished) return;
    if (preparing) {
      // pula só a contagem de preparação
      preparing = false;
      total = phases[idx].secs;
      remaining = total;
      return paint();
    }
    goTo(idx + 1, !!interval);
  });
  items.forEach((li) => li.addEventListener('click', () => {
    goTo(phases.findIndex((p) => p.step === Number(li.dataset.step)), false);
    if (!interval) play();
  }));

  paint();
}

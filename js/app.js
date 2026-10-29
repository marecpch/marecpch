import { EQUIPMENT } from './exercises.js';
import { buildWeek, feedbackAdjustment, imc, imcLabel } from './planner.js';
import { setupTimer, stepsHTML, stopActiveTimer } from './timer.js';

const STORAGE_KEY = 'treino-state-v1';
const app = document.getElementById('app');

let state = load();
let view = state.profile ? { name: 'week' } : { name: 'profile' };

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? emptyState();
  } catch {
    return emptyState();
  }
}

function emptyState() {
  return { profile: null, week: 1, adj: 0, feedback: {}, checks: {}, history: [] };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // armazenamento indisponível: o app continua funcionando só nesta sessão
  }
}

function go(next) {
  stopActiveTimer();
  view = next;
  render();
  window.scrollTo(0, 0);
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------- Perfil ----------------

const OPTIONS = {
  experiencia: [
    ['nunca', 'Nunca treinei / faz muito tempo'],
    ['parou', 'Já treinei, mas parei'],
    ['ativo', 'Treino regularmente'],
  ],
  objetivo: [
    ['emagrecer', 'Emagrecer'],
    ['forca', 'Ganhar força / massa'],
    ['condicionamento', 'Condicionamento / fôlego'],
    ['saude', 'Saúde e bem-estar'],
  ],
  local: [
    ['casa', 'Em casa'],
    ['academia', 'Na academia'],
  ],
  dias: [[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']],
  duracao: [[20, '20 min'], [30, '30 min'], [45, '45 min'], [60, '60 min']],
};

function radios(name, current) {
  return `<div class="chips">${OPTIONS[name].map(([value, label]) => `
    <label class="chip"><input type="radio" name="${name}" value="${value}" ${String(current) === String(value) ? 'checked' : ''} required><span>${label}</span></label>`).join('')}
  </div>`;
}

function renderProfile() {
  const p = state.profile ?? { local: 'casa', equip: [], dias: 3, duracao: 30, experiencia: 'nunca', objetivo: 'saude' };
  const first = !state.profile;
  app.innerHTML = `
    <header class="top"><h1>${first ? 'Vamos montar seu treino' : 'Meu perfil'}</h1></header>
    <form id="profile-form" class="stack">
      ${first ? '<p class="muted">Responda rapidinho para eu recomendar treinos na medida certa para você.</p>' : ''}
      <section class="card stack">
        <label class="field"><span>Nome</span><input name="nome" value="${esc(p.nome ?? '')}" placeholder="Como posso te chamar?"></label>
        <div class="row">
          <label class="field"><span>Idade</span><input name="idade" type="number" inputmode="numeric" min="12" max="100" value="${p.idade ?? ''}" required></label>
          <label class="field"><span>Peso (kg)</span><input name="peso" type="number" inputmode="decimal" step="0.1" min="30" max="300" value="${p.peso ?? ''}" required></label>
          <label class="field"><span>Altura (cm)</span><input name="altura" type="number" inputmode="numeric" min="120" max="230" value="${p.altura ?? ''}" required></label>
        </div>
      </section>
      <section class="card stack">
        <h2>Você já fazia exercícios?</h2>
        ${radios('experiencia', p.experiencia)}
      </section>
      <section class="card stack">
        <h2>Qual seu objetivo?</h2>
        ${radios('objetivo', p.objetivo)}
      </section>
      <section class="card stack">
        <h2>Onde vai treinar?</h2>
        ${radios('local', p.local)}
        <div id="equip-box" class="stack" ${p.local === 'academia' ? 'hidden' : ''}>
          <p class="muted">O que você tem em casa? (calistenia não precisa de nada)</p>
          <div class="chips">${Object.entries(EQUIPMENT).map(([key, label]) => `
            <label class="chip"><input type="checkbox" name="equip" value="${key}" ${p.equip.includes(key) ? 'checked' : ''}><span>${label}</span></label>`).join('')}
          </div>
        </div>
      </section>
      <section class="card stack">
        <h2>Quantos dias por semana?</h2>
        ${radios('dias', p.dias)}
        <h2>Quanto tempo por treino?</h2>
        ${radios('duracao', p.duracao)}
      </section>
      <button class="btn primary" type="submit">${first ? 'Gerar meu treino' : 'Salvar e atualizar treino'}</button>
      ${first ? '' : '<button class="btn ghost danger" type="button" id="reset">Apagar tudo e recomeçar</button>'}
    </form>
    ${first ? '' : nav('profile')}
  `;

  const form = document.getElementById('profile-form');
  form.addEventListener('change', (e) => {
    if (e.target.name === 'local') document.getElementById('equip-box').hidden = e.target.value === 'academia';
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = new FormData(form);
    state.profile = {
      nome: d.get('nome').trim(),
      idade: Number(d.get('idade')),
      peso: Number(d.get('peso')),
      altura: Number(d.get('altura')),
      experiencia: d.get('experiencia'),
      objetivo: d.get('objetivo'),
      local: d.get('local'),
      equip: d.getAll('equip'),
      dias: Number(d.get('dias')),
      duracao: Number(d.get('duracao')),
    };
    save();
    go({ name: 'week' });
  });
  document.getElementById('reset')?.addEventListener('click', () => {
    if (!confirm('Isso apaga seu perfil e todo o histórico. Continuar?')) return;
    state = emptyState();
    save();
    go({ name: 'profile' });
  });
}

// ---------------- Semana ----------------

const WEEKDAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const FEEDBACK_EMOJI = { facil: '😌', ok: '💪', dificil: '🥵' };
const KIND_ICON = { corpo: '🏋️', superior: '💪', inferior: '🦵', cardio: '❤️' };
const LABELS = {
  local: { casa: 'Em casa', academia: 'Academia' },
  objetivo: { emagrecer: 'Emagrecer', forca: 'Força / massa', condicionamento: 'Condicionamento', saude: 'Saúde' },
};

function currentPlan() {
  return buildWeek(state.profile, state.week, state.adj);
}

function levelText(level) {
  return ['', 'Iniciante', 'Intermediário', 'Avançado'][level];
}

function todayCard(plan, fb) {
  const today = WEEKDAY_NAMES[new Date().getDay()];
  const i = plan.days.findIndex((d) => d.weekday === today);
  if (i >= 0 && !fb[i]) {
    const day = plan.days[i];
    return `
      <section class="card today">
        <p class="eyebrow">Treino de hoje · ${today}</p>
        <h2>${KIND_ICON[day.kind]} ${day.title}</h2>
        <p class="muted small">⏱ ~${day.minutes} min · ${day.exercises.length} exercícios</p>
        <button class="btn primary" data-day="${i}">Começar treino</button>
      </section>`;
  }
  const next = plan.days.findIndex((_, j) => !fb[j]);
  const msg = i >= 0 ? 'Treino de hoje concluído! 🎉' : 'Hoje é dia de descanso 😴';
  return `
    <section class="card today rest">
      <p class="eyebrow">${today}</p>
      <h2>${msg}</h2>
      ${next >= 0 ? `<p class="muted small">Próximo: ${plan.days[next].weekday} · ${plan.days[next].title}</p>` : '<p class="muted small">Você completou todos os treinos da semana!</p>'}
    </section>`;
}

function renderWeek() {
  const plan = currentPlan();
  const fb = state.feedback[state.week] ?? {};
  const done = Object.keys(fb).length;
  const total = plan.days.length;
  const bmi = imc(state.profile);
  const notes = [];
  if (plan.status.deload) notes.push('Semana de recuperação: um pouco menos de volume para o corpo se adaptar.');
  if (plan.status.lowImpact) notes.push('Exercícios sem saltos por enquanto, para proteger suas articulações.');
  if (state.profile.experiencia === 'nunca' && state.week <= 2) notes.push('Começando leve! Foque em aprender os movimentos sem pressa.');

  app.innerHTML = `
    <header class="top">
      <p class="muted">Olá${state.profile.nome ? `, ${esc(state.profile.nome)}` : ''}! 👋</p>
      <div class="title-row">
        <h1>Semana ${state.week}</h1>
        <span class="count">${done}/${total}</span>
      </div>
      <div class="progress"><div style="width:${(done / total) * 100}%"></div></div>
      <div class="badges">
        <span class="badge">${LABELS.local[state.profile.local]}</span>
        <span class="badge">${LABELS.objetivo[state.profile.objetivo]}</span>
        <span class="badge">${levelText(plan.status.level)}</span>
      </div>
    </header>
    <main class="stack">
      ${todayCard(plan, fb)}
      ${notes.length ? `<details class="card tips"><summary><h2>💡 Dicas desta semana</h2></summary><ul class="plain">${notes.map((n) => `<li>${n}</li>`).join('')}</ul></details>` : ''}

      <h2 class="section-title">Treinos da semana</h2>
      ${plan.days.map((day, i) => `
        <button class="card day ${fb[i] ? 'done' : ''}" data-day="${i}">
          <div class="day-head">
            <span class="day-icon">${fb[i] ? '✓' : KIND_ICON[day.kind]}</span>
            <div class="grow">
              <p class="muted small">${day.weekday} · Treino ${i + 1}</p>
              <h3>${day.title}</h3>
            </div>
            <span class="muted small">${fb[i] ? FEEDBACK_EMOJI[fb[i]] : `⏱ ~${day.minutes} min`}</span>
          </div>
          <ul class="ex-preview">${day.exercises.map((ex) => `<li><span>${ex.name}</span><span class="muted">${ex.text}</span></li>`).join('')}</ul>
        </button>`).join('')}

      <button class="btn ${done === total ? 'primary' : 'ghost'}" id="next-week">
        ${done === total ? 'Semana concluída! Gerar próxima semana' : 'Pular para a próxima semana'}
      </button>
      ${state.history.length ? `
        <section class="card">
          <h2>Histórico</h2>
          <ul class="history">${state.history.slice().reverse().map((h) => `<li><span>Semana ${h.week}</span><span>${h.done}/${h.total} treinos</span></li>`).join('')}</ul>
        </section>` : ''}
      <p class="muted small center">IMC ${bmi.toFixed(1)} (${imcLabel(bmi)}). Sentiu dor (não cansaço)? Pare o exercício. Em caso de problemas de saúde, consulte um médico antes de começar.</p>
    </main>
    ${nav('week')}
  `;

  app.querySelectorAll('[data-day]').forEach((el) => el.addEventListener('click', () => go({ name: 'day', day: Number(el.dataset.day) })));
  document.getElementById('next-week').addEventListener('click', () => {
    if (done < total && !confirm(`Você fez ${done} de ${total} treinos. Avançar mesmo assim?`)) return;
    state.history.push({ week: state.week, done, total });
    state.adj += feedbackAdjustment(fb);
    state.week += 1;
    save();
    go({ name: 'week' });
  });
}

// ---------------- Treino do dia ----------------

function renderDay(i) {
  const day = currentPlan().days[i];
  const checks = state.checks[state.week]?.[i] ?? [];
  const fb = state.feedback[state.week]?.[i];
  const mins = (list) => Math.round(list.reduce((t, s) => t + s.secs * (s.sides ? 2 : 1), 0) / 60);

  app.innerHTML = `
    <header class="top">
      <button class="back" id="back">‹ Semana ${state.week}</button>
      <h1>${KIND_ICON[day.kind]} ${day.title}</h1>
      <p class="muted">${day.weekday} · Treino ${i + 1} · ⏱ ~${day.minutes} min</p>
    </header>
    <main class="stack">
      <section class="card stack" id="warmup">
        <div class="section-head"><span class="num">1</span><h2>Aquecimento</h2><span class="muted small">~${mins(day.warmup)} min</span></div>
        ${stepsHTML(day.warmup)}
      </section>

      <div class="section-head"><span class="num">2</span><h2>Exercícios</h2><span class="muted small" id="ex-count">${checks.length}/${day.exercises.length}</span></div>
      ${day.exercises.map((ex) => `
        <article class="card exercise ${checks.includes(ex.id) ? 'checked' : ''}">
          <label class="check"><input type="checkbox" data-ex="${ex.id}" ${checks.includes(ex.id) ? 'checked' : ''}><span></span></label>
          <div class="stack tight">
            <h3>${ex.name}</h3>
            <p class="presc">${ex.text}${ex.rest ? ` <span class="muted">· descanso ${ex.rest} s</span>` : ''}</p>
            <details class="howto">
              <summary>📖 Como fazer</summary>
              <p class="small"><strong>Trabalha:</strong> ${ex.muscles}</p>
              <ol>${ex.steps.map((step) => `<li>${step}</li>`).join('')}</ol>
              <p class="small hint">💡 ${ex.tip}</p>
              <a class="video" href="https://www.youtube.com/results?search_query=${encodeURIComponent(`como fazer ${ex.video} exercício`)}" target="_blank" rel="noopener">▶ Ver vídeo de como fazer</a>
            </details>
          </div>
        </article>`).join('')}

      <section class="card stack" id="cooldown">
        <div class="section-head"><span class="num">3</span><h2>Alongamento</h2><span class="muted small">~${mins(day.cooldown)} min</span></div>
        ${stepsHTML(day.cooldown)}
      </section>

      <section class="card stack">
        <h2>${fb ? 'Treino concluído! Como foi?' : 'Terminou? Como foi o treino?'}</h2>
        <p class="muted small">Isso ajusta a intensidade da próxima semana.</p>
        <div class="feedback">
          ${[['facil', '😌', 'Fácil'], ['ok', '💪', 'Na medida'], ['dificil', '🥵', 'Difícil']].map(([v, e, l]) => `
            <button class="fb ${fb === v ? 'selected' : ''}" data-fb="${v}"><span>${e}</span>${l}</button>`).join('')}
        </div>
      </section>
    </main>
  `;

  setupTimer(document.getElementById('warmup'), day.warmup);
  setupTimer(document.getElementById('cooldown'), day.cooldown);
  document.getElementById('back').addEventListener('click', () => go({ name: 'week' }));
  app.querySelectorAll('[data-ex]').forEach((el) => el.addEventListener('change', () => {
    const w = (state.checks[state.week] ??= {});
    const list = new Set(w[i] ?? []);
    el.checked ? list.add(el.dataset.ex) : list.delete(el.dataset.ex);
    w[i] = [...list];
    el.closest('.exercise').classList.toggle('checked', el.checked);
    document.getElementById('ex-count').textContent = `${w[i].length}/${day.exercises.length}`;
    save();
  }));
  app.querySelectorAll('[data-fb]').forEach((el) => el.addEventListener('click', () => {
    (state.feedback[state.week] ??= {})[i] = el.dataset.fb;
    save();
    go({ name: 'week' });
  }));
}

// ---------------- Navegação ----------------

function nav(active) {
  return `<nav class="tabbar">
    <button data-nav="week" class="${active === 'week' ? 'active' : ''}"><span>🗓️</span>Semana</button>
    <button data-nav="profile" class="${active === 'profile' ? 'active' : ''}"><span>👤</span>Perfil</button>
  </nav>`;
}

function render() {
  if (view.name === 'profile' || !state.profile) renderProfile();
  else if (view.name === 'day') renderDay(view.day);
  else renderWeek();
  app.querySelectorAll('[data-nav]').forEach((el) => el.addEventListener('click', () => go({ name: el.dataset.nav })));
}

render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

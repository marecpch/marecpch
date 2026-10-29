import { EXERCISES, WARMUP, COOLDOWN } from './exercises.js';

const WEEKDAYS = {
  2: ['Segunda', 'Quinta'],
  3: ['Segunda', 'Quarta', 'Sexta'],
  4: ['Segunda', 'Terça', 'Quinta', 'Sexta'],
  5: ['Segunda', 'Terça', 'Quarta', 'Sexta', 'Sábado'],
  6: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
};

// Faixa de repetições por objetivo
const REPS = {
  forca: [8, 12],
  emagrecer: [12, 15],
  condicionamento: [12, 15],
  saude: [10, 12],
};

const TEMPLATES = {
  corpo: { title: 'Corpo inteiro', slots: ['pernas', 'empurrar', 'puxar', 'posterior', 'core', 'pernas', 'puxar'] },
  superior: { title: 'Superiores', slots: ['empurrar', 'puxar', 'empurrar', 'puxar', 'core', 'empurrar', 'puxar'] },
  inferior: { title: 'Inferiores', slots: ['pernas', 'posterior', 'pernas', 'posterior', 'core', 'pernas', 'core'] },
  cardio: { title: 'Cardio + abdômen', slots: ['cardio', 'core', 'cardio', 'core', 'cardio', 'core', 'cardio'] },
};

function splitFor(dias, objetivo) {
  const queima = objetivo === 'emagrecer' || objetivo === 'condicionamento';
  switch (dias) {
    case 2: return ['corpo', 'corpo'];
    case 3: return queima ? ['corpo', 'cardio', 'corpo'] : ['corpo', 'corpo', 'corpo'];
    case 4: return queima ? ['superior', 'inferior', 'cardio', 'corpo'] : ['superior', 'inferior', 'superior', 'inferior'];
    case 5: return ['superior', 'inferior', 'cardio', 'superior', 'inferior'];
    default: return ['superior', 'inferior', 'cardio', 'superior', 'inferior', 'cardio'];
  }
}

const SLOTS_BY_DURATION = { 20: 4, 30: 5, 45: 6, 60: 7 };

export function imc(profile) {
  const m = profile.altura / 100;
  return profile.peso / (m * m);
}

export function imcLabel(v) {
  if (v < 18.5) return 'abaixo do peso';
  if (v < 25) return 'peso adequado';
  if (v < 30) return 'sobrepeso';
  if (v < 35) return 'obesidade grau I';
  if (v < 40) return 'obesidade grau II';
  return 'obesidade grau III';
}

// Quanto o usuário já progrediu: semanas concluídas + ajustes pelo feedback ("fácil"/"difícil").
function progressSteps(week, adj) {
  return Math.max(0, week - 1 + adj);
}

export function athleteStatus(profile, week, adj = 0) {
  const p = progressSteps(week, adj);
  const bmi = imc(profile);
  let base = { nunca: 1, parou: 1.5, ativo: 2 }[profile.experiencia] ?? 1;
  if (bmi >= 30) base -= 0.5;
  if (profile.idade >= 60) base -= 0.5;
  const level = Math.max(1, Math.min(3, Math.floor(base + p * 0.25)));
  const lowImpact = bmi >= 30 || profile.idade >= 60 || (profile.experiencia === 'nunca' && p < 4);
  const deload = week % 4 === 0 && profile.experiencia !== 'nunca';
  return { p, level, lowImpact, deload, bmi };
}

function available(ex, profile, status) {
  if (ex.where !== 'ambos' && ex.where !== profile.local) return false;
  if (ex.level > status.level) return false;
  if (ex.impact && status.lowImpact) return false;
  if (profile.local === 'academia') return true;
  return ex.equip.every((e) => profile.equip.includes(e));
}

function prescription(ex, profile, status) {
  const { p, level, deload } = status;
  let sets = level === 1 ? 2 : 3;
  if (p >= 8 && profile.duracao >= 45) sets += 1;
  if (deload) sets = Math.max(2, sets - 1);
  const step = p % 4;

  if (ex.unit === 'min') {
    const min = Math.min(30, 10 + 2 * p);
    return { text: `${deload ? Math.round(min * 0.7) : min} min`, rest: null };
  }
  if (ex.unit === 'seg') {
    const secs = 20 + 5 * step + 10 * (level - 1);
    const rest = ex.pattern === 'cardio' ? Math.max(20, 45 - 5 * step) : 45;
    return { text: `${sets} × ${secs} s`, rest };
  }
  const [lo, hi] = REPS[profile.objetivo] ?? REPS.saude;
  const reps = Math.min(hi, lo + step);
  const rest = profile.objetivo === 'forca' ? 90 : 60;
  return { text: `${sets} × ${reps} repetições`, rest };
}

function buildDay(kind, dayIdx, profile, status, week) {
  const tpl = TEMPLATES[kind];
  const count = SLOTS_BY_DURATION[profile.duracao] ?? 5;
  const used = new Set();
  const exercises = [];
  tpl.slots.slice(0, count).forEach((pattern, slotIdx) => {
    // Prefere exercícios do nível atual e alterna entre opções a cada semana/dia
    const options = EXERCISES
      .filter((ex) => ex.pattern === pattern && !used.has(ex.id) && available(ex, profile, status))
      .sort((a, b) => b.level - a.level || b.equip.length - a.equip.length);
    if (!options.length) return;
    const top = options.slice(0, Math.min(3, options.length));
    const pick = top[(week + dayIdx * 2 + slotIdx) % top.length];
    used.add(pick.id);
    exercises.push({ id: pick.id, name: pick.name, tip: pick.tip, ...prescription(pick, profile, status) });
  });

  if (kind !== 'cardio' && (profile.objetivo === 'emagrecer' || profile.objetivo === 'condicionamento')) {
    const finisher = EXERCISES
      .filter((ex) => ex.pattern === 'cardio' && !used.has(ex.id) && available(ex, profile, status))
      .sort((a, b) => b.level - a.level)[0];
    if (finisher) exercises.push({ id: finisher.id, name: `Final: ${finisher.name}`, tip: finisher.tip, ...prescription(finisher, profile, status) });
  }

  return {
    title: tpl.title,
    weekday: WEEKDAYS[profile.dias][dayIdx],
    warmup: WARMUP,
    cooldown: COOLDOWN,
    exercises,
  };
}

export function buildWeek(profile, week, adj = 0) {
  const status = athleteStatus(profile, week, adj);
  const days = splitFor(profile.dias, profile.objetivo).map((kind, i) => buildDay(kind, i, profile, status, week));
  return { week, status, days };
}

// Ajuste para a semana seguinte com base no feedback dos treinos concluídos.
export function feedbackAdjustment(feedbacks) {
  const values = Object.values(feedbacks);
  if (!values.length) return -1; // semana sem treinos: não progride
  const score = values.reduce((s, f) => s + ({ facil: 1, ok: 0, dificil: -1 }[f] ?? 0), 0) / values.length;
  if (score >= 0.5) return 1;   // tudo fácil: acelera um passo extra
  if (score <= -0.5) return -1; // tudo difícil: repete a carga
  return 0;
}

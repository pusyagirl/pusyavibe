/* PUSYA VIBE ≋ — персонаж управляет игрушкой прямо из ролеплея.
   Версия для SillyTavern. Автор: Пуся · t.me/pusgir

   Устройство работает через мост pusya-vibe-bridge.mjs в plugins/ Таверны:
   расширение отдаёт программу ощущений целиком, дальше её крутит сервер — вкладку
   можно свернуть. Есть и режим «напрямую», когда всё держится на живой вкладке. */

import {
    eventSource,
    event_types,
    extension_prompt_types,
    extension_prompt_roles,
    saveSettingsDebounced,
    setExtensionPrompt,
    getRequestHeaders,
} from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

const MODULE = 'pusyavibe';
const PROMPT_TAG = 'pusya_vibe';
const API = '/api/plugins/pusyavibe';

const defaults = {
    enabled: false,
    transport: 'bridge',                  // bridge | direct | lovense
    ws: 'ws://127.0.0.1:12345',
    lvIp: '127.0.0.1', lvPort: '20010',
    brain: 'live',                        // live | model
    ep: '', model: '', key: '', gate: true,
    cap: 14, gain: 1, maxMinutes: 20, safeword: 'стоп', loop: true,
    smooth: 35,                           // плавность переходов, 0 — рывком
    breathe: true,                        // «дышать», пока модель думает
    idleLevel: 0,                         // затишье вместо мёртвой тишины
    waitMaxSec: 180,                      // ждать ответ дольше — значит, зависло
    reply: true,                          // короткий отклик на моё сообщение
    flowLive: true,                       // отзываться прямо во время печати ответа
    deny: 15,                             // как часто отказывать на пике
    chaos: 15,                            // насколько своевольничать
    blind: false,                         // слепой режим: без цифр и полоски
    fetRemind: true, fetDrive: true, fetEvery: 3, fetOwn: '', fetChar: {},
    queue: [{ v: 5, sec: 20 }, { v: 12, sec: 30 }, { v: 3, sec: 15 }],
    gentle: false,                        // щадящий Bluetooth: реже команды, меньше обрывов
    profile: 'обычно',
    perChat: false,
    devOff: {},                           // игрушки, отключённые вручную
    toyKind: {},                          // что за игрушка, выбрано руками: { имя: { k, air } }
    toyTell: true,                        // рассказывать персонажу, какая игрушка подключена
    hintOn: true,                         // вторая модель подсказывает, куда вести следующий ответ
    paceHint: true,                       // просить модель не комкать близкую сцену
    orders: true,                         // слушаться прямых команд персонажа словами
    patSec: 60,                           // сколько играет паттерн, секунды (30…300)
    patLoop: true,                        // паттерн и свой ритм крутятся по кругу до СТОП
    patLast: '',                          // последний выбранный паттерн — для подписи
    ifaceOn: 'here',                      // где Intiface: here — рядом с Таверной | other — другое устройство
    wizDone: false,                       // мастер первого входа пройден или пропущен
    tourDone: false,                      // экскурсия показана
    tab: 'home',                          // открытый раздел панели
    fab: true,                            // кнопка ≋ поверх чата
    fabPos: null,                         // куда её утащили: { x, y }
    tone:'Держись сцены: нежность — 3-8, нарастание — 9-14, пик — 15-20. Меняй интенсивность по ходу описания, а не один раз в конце.',
};

const PROFILES = {
    'нежно': { gain: 0.7, smooth: 60, idleLevel: 2, deny: 0, chaos: 10, tone: 'Держись тихой стороны: касания 2-5, разогрев 6-9, выше поднимайся редко и ненадолго.' },
    'обычно': { gain: 1.0, smooth: 35, idleLevel: 0, deny: 15, chaos: 15, tone: 'Держись сцены: нежность — 3-8, нарастание — 9-14, пик — 15-20. Меняй интенсивность по ходу описания, а не один раз в конце.' },
    'жёстко': { gain: 1.5, smooth: 15, idleLevel: 0, deny: 10, chaos: 25, tone: 'Не жалей: разогрев начинай с 8-10, на пике держи максимум и обрывай резко.' },
    'дразнить': { gain: 1.0, smooth: 45, idleLevel: 1, deny: 65, chaos: 45, tone: 'Дразни: поднимай почти до предела и роняй в ноль, не давай привыкнуть. Долгих ровных участков не делай.' },
};

let connected = false;
let devices = [];
let toys = [];                            // подробности: что за игрушка и что умеет
let statusNote = 'не подключено';
let live = { v: 0, r: 0, p: 0, s: 0, t: 0 };
let poller = null;
let lockedOut = false;                    // сработало стоп-слово

/* Два журнала вместо одного.
   «Что играло» — дорожка: паттерны, свой ритм, живой отклик, разбор сцены.
   «Что происходило» — служебный: связь, ошибки, заряд. Игра в нём — одна метка со счётчиком. */
const LOG = [], PLAY = [];
const ИГРА = { pat: 1, queue: 1, test: 1, flow: 1, brain: 1, cmd: 1, fet: 1, deny: 1, me: 1, swipe: 1 };

function S() {
    if (!extension_settings[MODULE]) extension_settings[MODULE] = {};
    const s = extension_settings[MODULE];
    // Кто ставил расширение до мастера, тот всё прошёл руками — окошки ему не показываем.
    if (s.wizDone === undefined && s.transport !== undefined) s.wizDone = true;
    for (const [k, v] of Object.entries(defaults)) if (s[k] === undefined) s[k] = v;
    if (s.brain === 'tags' || s.brain === 'local') s.brain = 'live';   // старые режимы слились в живой
    return s;
}

// log('conn', 'текст') — служебное; log('pat', …) и прочие из ИГРА — на дорожку.
function log(kind, text) {
    if (text === undefined) { text = kind; kind = 'info'; }
    const t = Date.now();
    if (ИГРА[kind]) {
        PLAY.unshift({ t, kind, text });
        if (PLAY.length > 60) PLAY.length = 60;
        const верх = LOG[0];
        if (верх && верх.kind === 'игра' && t - верх.t < 5 * 60000) { верх.n++; верх.t = t; }
        else LOG.unshift({ t, kind: 'игра', text: '', n: 1 });
        paintPlay();
    } else {
        LOG.unshift({ t, kind, text });
    }
    if (LOG.length > 40) LOG.length = 40;
    paintLog();
}

const clamp = (x, a, b) => { x = +x; return isNaN(x) ? a : Math.max(a, Math.min(b, x)); };
const capLevel = () => clamp(S().cap, 0, 20);

/* ═══════════════ команды в тексте ═══════════════ */

const WORD = {
    'слабо': 5, 'нежно': 5, 'мягко': 6, 'средне': 11, 'сильно': 16, 'максимум': 20, 'макс': 20,
    'low': 5, 'soft': 6, 'medium': 11, 'high': 16, 'max': 20, 'off': 0, 'стоп': 0,
};
const CH_ALIAS = {                        // «t» тут нет намеренно: это время, а не канал
    v: 'v', vib: 'v', vibrate: 'v', 'вибро': 'v', intensity: 'v', i: 'v',
    r: 'r', rot: 'r', rotate: 'r', 'вращение': 'r',
    p: 'p', pump: 'p', 'помпа': 'p',
    s: 's', suction: 's', suck: 's',
    thrust: 't', thrusting: 't', stroke: 't', 'фрикции': 't',
};

function lvl(x, def) {
    if (x == null || x === '') return def;
    const s = String(x).trim().toLowerCase();
    if (WORD[s] != null) return WORD[s];
    const m = /^(\d+)/.exec(s);
    if (!m) return def;
    let n = parseInt(m[1], 10);
    if (/%/.test(s)) n = Math.round(n / 5);
    return clamp(n, 0, 20);
}
const secs = (x, def) => { const n = parseFloat(x); return isNaN(n) ? def : clamp(n, 0.5, 300); };

function step(o, sec) {
    return {
        v: o.v || 0, r: o.r || 0, p: o.p || 0, s: o.s || 0, t: o.t || 0,
        ms: Math.round(secs(sec, 5) * 1000), to: o.to || null,
    };
}

const PRESETS = {
    'волна': (a, sec) => { const out = []; for (let i = 0, n = Math.max(2, Math.round(sec / 3)); i < n; i++) { out.push(step({ v: 3, to: { v: a } }, 1.5), step({ v: a, to: { v: 3 } }, 1.5)); } return out; },
    'пульс': (a, sec) => { const out = []; for (let i = 0, n = Math.max(2, Math.round(sec)); i < n; i++) { out.push(step({ v: a }, 0.6), step({ v: 0 }, 0.4)); } return out; },
    'крещендо': (a, sec) => [step({ v: 2, to: { v: a } }, sec)],
    'прибой': (a, sec) => { const out = []; for (let i = 0, n = Math.max(1, Math.round(sec / 10)); i < n; i++) { out.push(step({ v: 4, to: { v: a } }, 7), step({ v: a }, 2), step({ v: 0 }, 1)); } return out; },
    'сердцебиение': (a, sec) => { const out = []; for (let i = 0, n = Math.max(2, Math.round(sec / 1.4)); i < n; i++) { out.push(step({ v: a }, 0.25), step({ v: 0 }, 0.15), step({ v: a }, 0.25), step({ v: 0 }, 0.75)); } return out; },
    'фейерверк': (a, sec) => { const out = []; for (let i = 0, n = Math.max(2, Math.round(sec / 1.2)); i < n; i++) { out.push(step({ v: Math.round(a * (0.4 + Math.random() * 0.6)) }, 0.4 + Math.random() * 0.5), step({ v: Math.round(a * 0.2) }, 0.3)); } return out; },
    'дразнилка': (a, sec) => { const out = []; for (let i = 0, n = Math.max(1, Math.round(sec / 8)); i < n; i++) { out.push(step({ v: 4, to: { v: a } }, 5), step({ v: 0 }, 3)); } return out; },
};
const PRESET_ALIAS = {
    wave: 'волна', pulse: 'пульс', crescendo: 'крещендо', surf: 'прибой', heartbeat: 'сердцебиение',
    fireworks: 'фейерверк', tease: 'дразнилка', earthquake: 'фейерверк', 'волны': 'волна', 'пульсация': 'пульс',
};

/* Паттерны считают свои циклы прикидкой, а минимальный шаг — полсекунды, поэтому
   «пульс» на минуту выходил на 66 секунд. Время выставляет пользовательница —
   достраиваем повтором и подрезаем хвост ровно по месту. */
function makePreset(name, a, sec) {
    const gen = PRESETS[name];
    if (!gen) return null;
    const цель = Math.round(clamp(sec, 1, 600) * 1000);
    const steps = gen(a, sec) || [];
    if (!steps.length) return steps;
    const сумма = (s) => s.reduce((x, y) => x + y.ms, 0);
    let всего = сумма(steps);
    const круг = steps.slice();
    let защита = 0;
    while (всего < цель && защита++ < 200) {
        for (let i = 0; i < круг.length && всего < цель; i++) {
            const копия = Object.assign({}, круг[i]);
            steps.push(копия); всего += копия.ms;
        }
    }
    while (steps.length > 1 && всего - steps[steps.length - 1].ms >= цель) всего -= steps.pop().ms;
    const лишку = всего - цель;
    if (лишку > 0) {
        const last = steps[steps.length - 1];
        if (last.ms - лишку >= 200) last.ms -= лишку;
        else if (steps.length > 1) steps.pop();
    }
    return steps;
}

// Человеческими словами: что именно почувствуешь. Названия сами по себе не говорят ничего.
const PRESET_WHAT = {
    'волна': 'плавно вверх и плавно вниз, без пауз — ровное дыхание',
    'пульс': 'короткие толчки: чуть больше полсекунды работы, полсекунды тишины',
    'крещендо': 'один долгий подъём с самого низа до потолка, и всё',
    'прибой': 'семь секунд накат до потолка, две секунды держит, секунда полной тишины',
    'сердцебиение': 'тук-тук — два коротких удара и пауза почти на секунду',
    'фейерверк': 'рвано и случайно: каждый раз новая сила и новая длительность',
    'дразнилка': 'пять секунд вверх почти до потолка — и три секунды в ноль',
};

function parseAttrs(s) {
    const a = {}, re = /([a-zA-Zа-яё_]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>/\]]+))/gi;
    let m;
    while ((m = re.exec(s))) a[m[1].toLowerCase()] = (m[2] != null ? m[2] : (m[3] != null ? m[3] : m[4]));
    return a;
}

function oneCmd(action, rest) {
    action = String(action).toLowerCase();
    const attrs = parseAttrs(rest);
    const sh = /^\s*=\s*["']?([^"'<>/\]\s]+)/.exec(rest);
    if (sh && action) attrs[action] = sh[1];
    const cap = capLevel();
    const sec = secs(attrs.t || attrs.time || attrs.duration || attrs['сек'], 8);

    if (action === 'stop' || action === 'стоп' || attrs.stop != null) return [step({}, 0.5)];

    if (action === 'preset' || action === 'pattern' || action === 'паттерн') {
        let nm = String(attrs.name || attrs['имя'] || '').toLowerCase().trim();
        nm = PRESET_ALIAS[nm] || nm;
        if (!PRESETS[nm]) nm = 'волна';
        return makePreset(nm, Math.min(cap, lvl(attrs.v || attrs.max, cap)), sec);
    }

    if (action === 'wave' || action === 'ramp' || action === 'волна' || attrs.from != null) {
        return [step({ v: lvl(attrs.from || attrs.min, 3), to: { v: lvl(attrs.to || attrs.max, cap) } }, sec)];
    }

    if (action === 'pulse' || action === 'пульс') {
        const pv = lvl(attrs.v || attrs.vibrate || attrs.level, 12);
        const on = secs(attrs.on, 0.6), off = secs(attrs.off, 0.4);
        const out = [];
        for (let i = 0, n = Math.max(1, Math.round(sec / (on + off))); i < n; i++) out.push(step({ v: pv }, on), step({ v: 0 }, off));
        return out;
    }

    const o = {};
    let got = false;
    for (const key of Object.keys(attrs)) {
        const ch = CH_ALIAS[key];
        if (!ch) continue;
        o[ch] = lvl(attrs[key], 0); got = true;
    }
    if (!got && CH_ALIAS[action]) { o[CH_ALIAS[action]] = lvl(attrs[action] || attrs.level || attrs.intensity, 10); got = true; }
    if (!got) return null;
    return [step(o, sec)];
}

function parseCmds(text) {
    const cmds = [];
    const src = String(text || '');
    let m;
    const re = /<\s*vibe(?![a-zA-Zа-яё])\s*:?\s*([a-zA-Zа-яё_]*)\s*([^<>]*?)\/?\s*>/gi;
    while ((m = re.exec(src))) cmds.push(oneCmd(m[1] || '', m[2] || ''));
    const re2 = /\[\s*vibe(?![a-zA-Zа-яё])\s*:?\s*([a-zA-Zа-яё_]*)\s*([^\]]*?)\]/gi;
    while ((m = re2.exec(src))) cmds.push(oneCmd(m[1] || '', m[2] || ''));
    return cmds.filter(Boolean);
}

/* ═══════════════ паспорт игрушки ═══════════════ */
/* Игрушки очень разные: одна только вибрирует, другая сосёт, третья крутит или
   толкается. Спрашиваем у самой игрушки и рассказываем это тому, кто ведёт сцену. */

const CH_RU = { v: 'вибрация', r: 'вращение', s: 'всасывание', p: 'накачка', t: 'фрикции' };

const LOVENSE_CAPS = {
    'nora': 'vr', 'diamo': 'vr', 'ridge': 'vr',
    'max': 'vp', 'max 2': 'vp',
    'gravity': 'vt', 'sex machine': 'vt', 'mini sex machine': 'vt', 'solace': 'vt', 'solace pro': 'vt',
    'flexer': 'vt', 'tenera': 'vs', 'tenera 2': 'vs',
    'osci': 'vt', 'osci 2': 'vt', 'osci 3': 'vt',
};

/* ═══════════════ что это за игрушка ═══════════════ */
/* Intiface рассказывает про моторы, но не про форму: вибропуля, кролик и
   мастурбатор для него одинаково «Vibrate». Угадываем по названию модели,
   а если не вышло или угадали не то — выбирает сама пользовательница. */

const TOY_KINDS = {
    'внешняя': { ru: 'внешняя, для клитора', кто: 'она' },
    'кролик': { ru: 'внутрь и снаружи сразу (кролик)', кто: 'она' },
    'внутренняя': { ru: 'вводится внутрь', кто: 'любой' },
    'пара': { ru: 'для пары, носится во время близости', кто: 'она' },
    'анальная': { ru: 'анальная пробка', кто: 'любой' },
    'простата': { ru: 'массажёр простаты', кто: 'он' },
    'мастурбатор': { ru: 'мастурбатор, надевается на член', кто: 'он' },
    'кольцо': { ru: 'эрекционное виброкольцо', кто: 'он' },
    'машина': { ru: 'секс-машина, толкается сама', кто: 'любой' },
    'соски': { ru: 'для сосков', кто: 'любой' },
    'пуля': { ru: 'вибропуля или массажёр, куда приложишь', кто: 'любой' },
};

// Порядок важен: сначала узкие названия, потом общие слова. Список общий с версией для Таво.
const TOY_GUESS = [
    { re: /(?:satisfyer|\bsf\b).*(g-?spot rabbit|pro\s*\+|supernova|dual pleasure|dual crush)/, k: 'кролик', air: true },
    { re: /(?:satisfyer|\bsf\b).*(double|partner|endless|multifun)/, k: 'пара' },
    { re: /(?:satisfyer|\bsf\b).*(\bmen\b|masturbat)/, k: 'мастурбатор' },
    { re: /(?:satisfyer|\bsf\b).*(nipple)/, k: 'соски' },
    { re: /(?:satisfyer|\bsf\b).*(plug|booty|lolli|game changer)/, k: 'анальная' },
    { re: /(?:satisfyer|\bsf\b).*(ring|royal one)/, k: 'кольцо' },
    { re: /(?:satisfyer|\bsf\b).*(pro|curvy|penguin|triangle|number one|traveler|breeze|vulva|orca|pocket|deluxe|power flower|mr\.?\s*rabbit|twirling|exciterrr)/, k: 'внешняя', air: true },
    { re: /(?:satisfyer|\bsf\b).*(mono\s*flex|g-?spot flex|sexy secret|smooth petal|spinning|love me|hot spot|master|heat|yummy|rrrolling|air bump|top secret)/, k: 'внутренняя' },
    { re: /womanizer.*duo/, k: 'кролик', air: true },
    { re: /womanizer/, k: 'внешняя', air: true },
    { re: /lovense.*(max)/, k: 'мастурбатор', air: true },
    { re: /(lovense.*)?(gush|calor|solace)/, k: 'мастурбатор' },
    { re: /(lovense.*)?\bedge\b/, k: 'простата' },
    { re: /(lovense.*)?\b(hush|ridge)\b/, k: 'анальная' },
    { re: /(lovense.*)?\b(nora|flexer)\b/, k: 'кролик' },
    { re: /(lovense.*)?\b(dolce|quake)\b/, k: 'пара' },
    { re: /(lovense.*)?\bdiamo\b/, k: 'кольцо' },
    { re: /(lovense.*)?\btenera\b/, k: 'внешняя', air: true },
    { re: /(lovense.*)?\b(ferri)\b/, k: 'внешняя' },
    { re: /(lovense.*)?\bgemini\b/, k: 'соски' },
    { re: /(lovense.*)?\b(gravity|mini sex machine|sex machine|vulse)\b/, k: 'машина' },
    { re: /(lovense.*)?\b(lush|osci|lapis|mission)\b/, k: 'внутренняя' },
    { re: /(lovense.*)?\b(domi|ambi|hyphy|exomoon)\b/, k: 'пуля' },
    { re: /\b(onyx|keon|titan|feel stroker|the handy|handy|cyclone|piston|onaholder|f1s)\b/, k: 'мастурбатор' },
    { re: /\bpearl\b/, k: 'внутренняя' },
    { re: /\bcliona\b/, k: 'внешняя' },
    { re: /we-?vibe.*(chorus|sync|match)|\btiani\b/, k: 'пара' },
    { re: /we-?vibe.*nova/, k: 'кролик' },
    { re: /we-?vibe.*melt/, k: 'внешняя', air: true },
    { re: /we-?vibe.*(vector)|\bhugo\b/, k: 'простата' },
    { re: /we-?vibe.*(pivot|bond)/, k: 'кольцо' },
    { re: /we-?vibe.*(ditto)/, k: 'анальная' },
    { re: /we-?vibe.*(tango|wish)/, k: 'пуля' },
    { re: /we-?vibe.*(moxie|touch)/, k: 'внешняя' },
    { re: /we-?vibe.*(rave|jive)/, k: 'внутренняя' },
    { re: /vorze.*ufo/, k: 'соски' },
    { re: /hismith|fuck\s*machine|\bmachine\b/, k: 'машина' },
    { re: /masturbat|stroker|fleshlight|onahole/, k: 'мастурбатор' },
    { re: /prostat/, k: 'простата' },
    { re: /nipple/, k: 'соски' },
    { re: /\bplug\b/, k: 'анальная' },
    { re: /cock\s*ring|\bring\b/, k: 'кольцо' },
    { re: /rabbit/, k: 'кролик' },
    { re: /suction|air\s*pulse|clit/, k: 'внешняя', air: true },
    { re: /\b(egg|bullet|wand)\b/, k: 'пуля' },
];

// { k, air, auto } — что это за игрушка. auto: угадано, а не выбрано руками.
function toyPassport(name, dev) {
    const свой = S().toyKind?.[name];
    if (свой) return { k: TOY_KINDS[свой.k] ? свой.k : '', air: !!свой.air, auto: false };
    const n = String(name || '').toLowerCase();
    for (const g of TOY_GUESS) if (g.re.test(n)) return { k: g.k, air: !!g.air, auto: true };
    // по названию не узнали — подсказывают моторы
    if (dev) {
        const feats = dev.features || [];
        const типы = feats.map((f) => f.type).join(' ');
        if (dev.linear && !feats.length) return { k: 'мастурбатор', air: false, auto: true };
        if (/oscillat/i.test(типы) && !/vibrat/i.test(типы)) return { k: 'машина', air: false, auto: true };
        if (/constrict/i.test(типы)) return { k: 'внешняя', air: true, auto: true };
    }
    return { k: '', air: false, auto: true };
}

// Как сказать словами: «внешняя, для клитора; вакуумно-волновая».
function passportText(p) {
    if (!p || !p.k) return p && p.air ? 'с воздушной стимуляцией' : '';
    let s = TOY_KINDS[p.k].ru;
    if (p.air) s += p.k === 'мастурбатор' ? '; сжимает воздушными камерами'
        : '; вакуумно-волновая — стимулирует потоком воздуха, без прямого касания';
    return s;
}

function toyCaps() {
    const ch = {}, names = [], kinds = [];
    let known = false;
    const add = (c) => { if (c) ch[c] = (ch[c] || 0) + 1; };
    const s = S();

    const list = S().transport === 'direct'
        ? Object.values(Direct.devs).map((d) => ({ name: d.name, features: d.scalars, linear: d.linear, rotate: d.rotate }))
        : toys;

    if (s.transport === 'lovense') {
        for (const n of devices) {
            if (s.devOff?.[n]) continue;
            names.push(n); known = true;
            const nm = String(n).toLowerCase();
            // Lovense отдаёт голое «lush» — добавляем марку, чтобы узнавалось как у Intiface
            const пасп = s.toyKind?.[n] ? toyPassport(n) : toyPassport(/lovense/.test(nm) ? nm : 'lovense ' + nm);
            kinds.push(Object.assign(пасп, { name: n }));
            for (const c of (LOVENSE_CAPS[nm] || 'v').split('')) add(c);
        }
    } else {
        for (const d of (list || [])) {
            if (s.devOff?.[d.name]) continue;             // выключенную в панели не считаем
            names.push(d.name); known = true;
            kinds.push(Object.assign(toyPassport(d.name, d), { name: d.name }));
            for (const f of (d.features || [])) {
                const ty = String(f.type || ''), hint = String(f.what || '').toLowerCase();
                if (/rotat/i.test(ty)) add('r');
                else if (/constrict/i.test(ty) || /suction|air/.test(hint)) add('s');
                else if (/inflat/i.test(ty)) add('p');
                else if (/oscillat|position/i.test(ty)) add('t');
                else add('v');
            }
            if (d.rotate) add('r');
            if (d.linear) add('t');
        }
    }

    if (!Object.keys(ch).length) add('v');
    const brief = Object.keys(ch).map((c) => CH_RU[c] + (ch[c] > 1 ? ' ×' + ch[c] : '')).join(' + ');
    return { ch, names, brief, known, kinds, has: (c) => !!ch[c] };
}

function mainChannel() {
    const c = toyCaps().ch;
    if (c.v) return 'v';
    for (const x of ['t', 's', 'r', 'p']) if (c[x]) return x;
    return 'v';
}

/* ═══════════════ разбор сцены без тегов ═══════════════ */

const MARK = [
    { w: 6, src: 'касан|ладон|гладит|шепч|шёпот|поцелу|целу|прижим|обнима|мурашк|кожа|дыхани' },
    { w: 11, src: 'стон|выгиба|дрож|бедр|между ног|влажн|сосок|соски|язык|пальц|трётся|вцеп|кусает|задыха|сжима|бельё|обнаж' },
    { w: 17, src: 'глубже|быстрее|ещё сильнее|толчк|входит|внутри|содрога|умоля|на грани|не выдерж|срыва|оргазм|кончает|кончи|пик наслажд' },
];
const MARK_RE = MARK.map((g) => ({ w: g.w, re: new RegExp('(^|[^а-яёА-ЯЁ])(' + g.src + ')', 'gi') }));

function heatOf(text) {
    const t = String(text || '');
    let hits = 0, top = 0, hot = 0;
    for (const g of MARK_RE) {
        g.re.lastIndex = 0;
        const n = (t.match(g.re) || []).length;
        if (n) { hits += n; top = Math.max(top, g.w); if (g.w >= 17) hot += n; }
    }
    return { hits, top, hot };
}

function heuristic(text) {
    const h = heatOf(text), cap = capLevel();
    if (h.hits < 2 || !h.top) return null;
    const target = Math.min(cap, h.top + (h.hits > 6 ? 2 : 0));
    const base = Math.max(2, Math.round(target * 0.35));
    // Играем на том канале, который у игрушки есть: вибропуля вибрирует, вакуумная сосёт.
    const c = mainChannel();
    const mk = (a, to, sec) => {
        const o = {}; o[c] = a;
        if (to != null) { o.to = {}; o.to[c] = to; }
        return step(o, sec);
    };
    const steps = [mk(base, target, 7), mk(target, null, 5), mk(Math.max(2, Math.round(target * 0.65)), null, 4), mk(target, null, 6)];
    if (h.hot) steps.push(mk(target, cap, 7), mk(Math.round(cap * 0.3), null, 3));
    return steps;
}

function analystSys() {
    const cap = capLevel(), caps = toyCaps();
    let extra = '';
    if (caps.has('r')) extra += '<vibe:rotate="X" t="СЕК"/> — вращение\n';
    if (caps.has('s')) extra += '<vibe:suction="X" t="СЕК"/> — всасывание\n';
    if (caps.has('t')) extra += '<vibe:thrust="X" t="СЕК"/> — фрикции, движение\n';
    if (caps.has('p')) extra += '<vibe:pump="X" t="СЕК"/> — накачка\n';

    const паспорт = caps.kinds.map((p) => { const t = passportText(p); return p.name + (t ? ' — ' + t : ''); }).join('; ');
    const режиссёр = !!S().hintOn;
    return 'Ты — управляющий модуль устройства в ролевой игре. Тебе дают последнее сообщение ' +
        'пользователя и ответ персонажа на него. Твоя работа: оценить, что происходит физически, и выдать программу ощущений' +
        (режиссёр ? ', а ещё одной фразой подсказать, куда вести следующий ответ' : '') + '.\n\n' +
        'Подключено: ' + (паспорт || caps.names.join(', ') || 'устройство') + '. Умеет: ' + caps.brief + '.\n' +
        'Пользуйся только этими возможностями — другого у устройства нет.\n\n' +
        'Отвечай ТОЛЬКО командами' + (режиссёр ? ' и одной строкой <hint>' : '') + ', без единого слова пояснений:\n' +
        (caps.has('v') ? '<vibe:v="X" t="СЕК"/> — ровная вибрация силой X (0-' + cap + ')\n' : '') + extra +
        '<vibe:wave from="A" to="B" t="СЕК"/> — плавное нарастание от A к B\n' +
        '<vibe:pulse v="X" on="0.6" off="0.4" t="СЕК"/> — пульсация\n' +
        '<vibe:preset name="волна|пульс|крещендо|прибой|сердцебиение|дразнилка" t="СЕК"/>\n' +
        '<vibe:stop/> — тишина\n\n' +
        'Правила:\n' +
        '1. Если в сцене нет физической близости или напряжения — ответь ровно <vibe:stop/> и ничего больше.\n' +
        '2. Шкала 0-' + cap + '. Лёгкие касания 3-6, разогрев 7-11, откровенная сцена 12-' + cap + '.\n' +
        '3. От 2 до 4 команд, суммарно 25-50 секунд. Программа должна повторять форму сцены: ' +
        'нарастание — нарастанием, дразнящую паузу — падением до 0-2, кульминацию — выходом на максимум.\n' +
        '4. Если у устройства несколько возможностей — пользуйся ими по смыслу сцены, а не все разом.\n' +
        (режиссёр
            ? '5. Последней строкой — <hint>…</hint>: одно предложение для рассказчика, куда вести следующий ответ. ' +
              'Смотри, что уже было, и предложи другое: сменить темп, задержаться, отступить, сменить положение или того, кто ведёт, ' +
              'вплести одну из предпочтений, если они даны. Если близость только началась — не торопить к финалу. ' +
              'Если сцена не интимная — <hint></hint> пустой. Без имён плагинов и без слов «игрушка управляется».\n' +
              '6. Никакого текста, кроме команд и этой строки.'
            : '5. Никакого текста, кроме команд.');
}

// Что отдаём аналитику: твоё сообщение, ответ персонажа и предпочтения, если есть.
let lastUserText = '';
function analystInput(plain) {
    const мне = String(lastUserText || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(-500);
    const пред = [];
    const her = charFetishes(), mine = ownFetishes();
    if (her.length) пред.push(NAMES.char + ': ' + her.map((x) => x.name).join(', '));
    if (mine.length) пред.push(кемЗовут() + ': ' + mine.map((x) => x.name).join(', '));
    return (мне ? 'Сообщение пользователя:\n' + мне + '\n\n' : '') +
        'Ответ персонажа:\n' + plain +
        (S().hintOn && пред.length ? '\n\nПредпочтения — ' + пред.join('; ') : '');
}

/* ═══════════════ подсказка режиссёра ═══════════════ */
/* Вторая модель и так читает сцену — пусть в том же запросе скажет одной
   фразой, куда вести следующий ответ. Бесплатно: запрос уже оплачен. */
let HINT = { text: '', at: 0, used: 0 };

function hintPrompt(ход) {
    const s = S();
    if (!s.hintOn || s.brain !== 'model' || !HINT.text) return '';
    if (Date.now() - HINT.at > 10 * 60000 || HINT.used >= 2) return '';   // устаревшую не тащим
    if (ход) HINT.used++;
    return '[Направление сцены]\n' + HINT.text + '\nЭто про ход повествования — в тексте об этом не упоминай.';
}

function takeHint(reply) {
    const m = /<\s*hint\s*>([\s\S]*?)<\s*\/\s*hint\s*>/i.exec(String(reply || ''));
    if (!m) return '';
    // Это уйдёт в промпт основной модели — только обычный текст, коротко.
    return m[1].replace(/<[^>]*>/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280);
}

async function modelAsk(prompt, sys) {
    const s = S();
    let ep = String(s.ep || '').trim().replace(/\/+$/, '');
    if (!/\/chat\/completions$/.test(ep)) ep += '/chat/completions';
    const r = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + String(s.key || '').trim() },
        body: JSON.stringify({
            model: String(s.model || '').trim(),
            messages: [{ role: 'system', content: sys }, { role: 'user', content: prompt }],
            temperature: 0.3, max_tokens: 320,
        }),
    });
    const txt = await r.text();
    let j;
    try { j = JSON.parse(txt); } catch { throw new Error('ответ не-JSON — проверь адрес и ключ'); }
    const out = j?.choices?.[0]?.message?.content;
    if (!out) throw new Error('пустой ответ модели');
    return String(out);
}

// Без своего ключа просим саму Таверну — её текущим подключением.
async function tavernAsk(prompt, sys) {
    const ctx = SillyTavern.getContext();
    const gen = ctx?.generateQuietPrompt;
    if (typeof gen !== 'function') throw new Error('Таверна не дала тихий запрос — впиши свой ключ');
    const full = sys + '\n\n---\n' + prompt;
    try {
        const r = await gen({ quietPrompt: full, quietToLoud: false, skipWIAN: true });
        if (r) return String(r);
    } catch { /* старая сигнатура — пробуем позиционную */ }
    const r2 = await gen(full, false, true);
    return String(r2 || '');
}

const genAsk = (prompt, sys) => (S().ep && S().key && S().model ? modelAsk(prompt, sys) : tavernAsk(prompt, sys));

/* ═══════════════ куда льём: мост или прямая связь ═══════════════ */

async function api(path, body) {
    const r = await fetch(API + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: getRequestHeaders(),
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!r.ok) throw new Error('мост ответил ' + r.status + ' — включён ли enableServerPlugins и лежит ли файл в plugins/');
    return r.json();
}

/* Прямая связь: браузер сам держит WebSocket и сам крутит программу.
   Работает, только пока вкладка жива и открыта. */
const Direct = {
    ws: null, msgId: 1, devs: {}, timer: null, linPhase: 0,
    prog: [], i: 0, stepEnd: 0, manual: 0, lastOut: '', lastSendAt: 0, startedAt: 0, lastActive: 0,
    soft: { v: 0, r: 0, p: 0, s: 0, t: 0 }, waiting: 0, overlay: false, saved: null, keepTimer: null,
    flow: { level: 0, until: 0, at: 0 }, jitter: 1, pauseUntil: 0, denyUntil: 0, denyLevel: 1, spice: true,

    connect() {
        this.disconnect();
        return new Promise((resolve) => {
            let ws;
            try { ws = new WebSocket(S().ws); } catch (e) { return resolve({ ok: false, info: e.message }); }
            this.ws = ws;
            let done = false;
            const giveUp = setTimeout(() => {
                if (!done) { done = true; try { ws.close(); } catch { /* уже закрыт */ } resolve({ ok: false, info: 'Intiface не ответил за 6 секунд' }); }
            }, 6000);

            ws.onopen = () => this.tx({ RequestServerInfo: { Id: this.msgId++, ClientName: 'PUSYA VIBE', MessageVersion: 3 } });
            ws.onmessage = (ev) => {
                let arr; try { arr = JSON.parse(ev.data); } catch { return; }
                for (const m of arr) {
                    const name = Object.keys(m)[0], b = m[name];
                    if (name === 'ServerInfo') {
                        this.tx({ RequestDeviceList: { Id: this.msgId++ } });
                        this.tx({ StartScanning: { Id: this.msgId++ } });
                        // Молчащий сокет закрывается сам, а каждый обрыв заставляет Intiface
                        // остановить все устройства. Греем канал запросом списка — Bluetooth не трогаем.
                        clearInterval(this.keepTimer);
                        this.keepTimer = setInterval(() => {
                            if (this.ws && this.ws.readyState === 1) this.tx({ RequestDeviceList: { Id: this.msgId++ } });
                        }, 25000);
                        this.lastOut = '';       // после переподключения отдаём уровень заново
                        // Но мягко: вход за пару секунд с нуля, а не рывком.
                        this.soft = { v: 0, r: 0, p: 0, s: 0, t: 0 };
                        this.softStart = Date.now() + 2000;
                        setTimeout(() => {
                            if (done) return;
                            done = true; clearTimeout(giveUp);
                            resolve({ ok: true, info: b.ServerName || 'Intiface', devices: Object.values(this.devs).map((d) => d.name) });
                        }, 700);
                    } else if (name === 'DeviceList') {
                        const было = this.devs;                    // список приходит и как «грелка»
                        this.devs = {};
                        for (const d of (b.Devices || [])) this.addDev(d, было[d.DeviceIndex]);
                        if (Object.keys(было).length !== Object.keys(this.devs).length) {
                            refreshDevices(Object.values(this.devs).map((d) => d.name));
                        }
                    } else if (name === 'DeviceAdded') {
                        this.addDev(b);
                        refreshDevices(Object.values(this.devs).map((d) => d.name));
                    } else if (name === 'DeviceRemoved') {
                        delete this.devs[b.DeviceIndex];
                    }
                }
            };
            ws.onclose = () => {
                clearInterval(this.keepTimer); this.keepTimer = null;
                this.devs = {};
                if (connected && S().transport === 'direct') {
                    connected = false; statusNote = 'связь закрылась'; paintStatus();
                    log('conn', 'связь с Intiface оборвалась');
                    // Оборвалось на глазах — поднимаемся сами.
                    if (!document.hidden && S().enabled) setTimeout(() => sinkConnect().then(paintStatus).catch(() => {}), 1500);
                }
                if (!done) { done = true; clearTimeout(giveUp); resolve({ ok: false, info: 'Intiface недоступен по этому адресу' }); }
            };
        });
    },

    addDev(d, прежняя) {
        const msgs = d.DeviceMessages || {};
        this.devs[d.DeviceIndex] = {
            idx: d.DeviceIndex, name: d.DeviceName || ('устройство ' + d.DeviceIndex),
            scalars: (msgs.ScalarCmd || []).map((f, i) => ({ i, type: String(f.ActuatorType || 'Vibrate') })),
            linear: (msgs.LinearCmd || []).length, rotate: (msgs.RotateCmd || []).length,
        };
    },

    tx(o) { try { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify([o])); } catch { /* оборвалось */ } },

    out(o, only) {
        const pct = (l) => clamp(l, 0, 20) / 20;
        const off = S().devOff || {};
        for (const d of Object.values(this.devs)) {
            if (off[d.name] || (only && !d.name.toLowerCase().includes(String(only).toLowerCase()))) {
                this.tx({ StopDeviceCmd: { Id: this.msgId++, DeviceIndex: d.idx } });
                continue;
            }
            const scal = d.scalars.map((f) => {
                let l = o.v;
                if (/rotat/i.test(f.type)) l = o.r || o.v;
                else if (/constrict|suction/i.test(f.type)) l = o.s || o.v;
                else if (/inflat/i.test(f.type)) l = o.p || 0;
                else if (/oscillat/i.test(f.type)) l = o.t || o.v;
                return { Index: f.i, Scalar: pct(l), ActuatorType: f.type };
            });
            if (scal.length) this.tx({ ScalarCmd: { Id: this.msgId++, DeviceIndex: d.idx, Scalars: scal } });
            if (d.rotate) this.tx({ RotateCmd: { Id: this.msgId++, DeviceIndex: d.idx, Rotations: [{ Index: 0, Speed: pct(o.r || o.v), Clockwise: true }] } });
            if (d.linear && (o.t || o.v) > 0) {
                this.linPhase = this.linPhase ? 0 : 1;
                this.tx({ LinearCmd: { Id: this.msgId++, DeviceIndex: d.idx, Vectors: [{ Index: 0, Duration: Math.round(900 - 700 * pct(o.t || o.v)), Position: this.linPhase ? 0.85 : 0.1 }] } });
            }
        }
    },

    stopDevices() { for (const d of Object.values(this.devs)) this.tx({ StopDeviceCmd: { Id: this.msgId++, DeviceIndex: d.idx } }); },

    tick() {
        const s = S(), t = Date.now();
        if (this.startedAt && s.maxMinutes > 0 && t - this.startedAt > s.maxMinutes * 60000) { panic('автостоп по времени'); return; }

        if (!this.manual && this.prog.length && t >= this.stepEnd) {
            this.i++;
            if (this.i >= this.prog.length) {
                if (this.overlay) this.restore();          // отклик доиграл — вернём сцену
                else if (this.loop != null ? this.loop : s.loop) this.i = 0;
                else {
                    if (mineNow) log('pat', 'отыграло — сцену снова ведёт персонаж');
                    this.prog = []; this.i = 0; mineNow = false;   // твоё доиграло
                }
            }
            const st = this.prog[this.i];
            if (!this.overlay || st) this.stepEnd = st ? t + st.ms : 0;
            this.stepStart(st);
        }

        const o = { v: 0, r: 0, p: 0, s: 0, t: 0 };
        // Живой отклик на печатающийся текст — то, ради чего раньше были нужны теги.
        if (this.manual <= 0 && !this.overlay && this.flow.until > t) {
            const k = 1 - 0.55 * clamp((t - this.flow.at) / 9000, 0, 1);
            o[mainChannel()] = this.flow.level * k;
        }
        else if (this.manual > 0) o.v = this.manual;
        else {
            const st = this.prog[this.i];
            if (st) {
                const span = Math.max(1, st.ms), k = 1 - Math.max(0, this.stepEnd - t) / span;
                for (const c of ['v', 'r', 'p', 's', 't']) {
                    const a = st[c] || 0, b = (st.to && st.to[c] != null) ? st.to[c] : a;
                    o[c] = (a + (b - a) * k) * clamp(s.gain, 0.4, 2.5);
                }
            }
        }

        // Своеволие: отказ на пике и лёгкая непредсказуемость — только для сцены.
        if (this.manual <= 0 && this.spice) {
            if ((this.denyUntil && t < this.denyUntil) || (this.pauseUntil && t < this.pauseUntil)) {
                for (const c of ['v', 'r', 'p', 's', 't']) o[c] = 0;
            } else {
                const k = (this.jitter || 1) * (this.denyLevel || 1);
                if (k !== 1) for (const c of ['v', 'r', 'p', 's', 't']) o[c] *= k;
            }
        }

        // Модель думает: сцену держим, тихо «дышим», а на слишком долгом молчании гасим.
        if (this.waiting) {
            const waited = t - this.waiting;
            if (waited > (s.waitMaxSec || 180) * 1000) { this.waiting = 0; this.stop(); log('stop', 'ответа нет слишком долго — остановила'); return; }
            if (s.breathe) {
                const k = 0.88 + 0.12 * (0.5 + 0.5 * Math.sin(waited / 4200));
                for (const c of ['v', 'r', 'p', 's', 't']) o[c] *= k;
            }
            if (s.idleLevel > 0 && !this.manual && Object.values(o).reduce((a, b) => a + b, 0) < 0.5) {
                o[mainChannel()] = s.idleLevel;
            }
        }

        // Мягкий вход после подключения: за две секунды с нуля, чтобы не било сразу.
        if (this.softStart && t < this.softStart) {
            const вход = Math.max(0, 1 - (this.softStart - t) / 2000);
            for (const c of ['v', 'r', 'p', 's', 't']) o[c] *= вход;
        }

        for (const c of ['v', 'r', 'p', 's', 't']) o[c] = clamp(o[c], 0, capLevel());

        // Плавность: к цели идём шагами, а не прыжком.
        const soft = clamp(s.smooth, 0, 100);
        if (soft > 0) {
            const rate = capLevel() / (1 + soft / 12);
            for (const c of ['v', 'r', 'p', 's', 't']) {
                this.soft[c] += clamp(o[c] - this.soft[c], -rate, rate);
                o[c] = this.soft[c];
            }
        } else {
            for (const c of ['v', 'r', 'p', 's', 't']) this.soft[c] = o[c];
        }

        for (const c of ['v', 'r', 'p', 's', 't']) o[c] = Math.round(clamp(o[c], 0, capLevel()));

        // Капризным игрушкам огрубляем шкалу вдвое: на слух то же, команд в разы меньше.
        const хрупкая = Object.values(this.devs).some((d) => /satisfyer|sf\s/i.test(d.name));
        if (хрупкая || s.gentle) {
            for (const c of ['v', 'r', 'p', 's', 't']) if (o[c] > 0) o[c] = Math.max(1, Math.round(o[c] / 2) * 2);
        }
        live = o;

        const only = (!this.manual && this.prog[this.i]) ? this.prog[this.i].only : null;
        const sig = Object.values(o).join('|') + '|' + (only || '');
        const any = Object.values(o).some((x) => x > 0);
        // Не частим по Bluetooth: часть игрушек роняет соединение от плотного потока команд.
        // Buttplug сам шлёт игрушке keepalive, наши повторы «на всякий случай» ему только мешают.
        const gapOk = (t - this.lastSendAt) >= (s.gentle || хрупкая ? 1000 : 380);
        if (connected && sig !== this.lastOut && (gapOk || !any)) {
            this.lastOut = sig; this.lastSendAt = t;
            if (any) this.out(o, only); else this.stopDevices();
        }
        if (any) { this.lastActive = t; if (!this.startedAt) this.startedAt = t; }
        else if (this.startedAt && t - this.lastActive > 20000) this.startedAt = 0;
        paintMeter();
    },

    run() { if (!this.timer) this.timer = setInterval(() => this.tick(), 250); },

    // На границе шага решаем: отказать на пике и насколько своевольничать.
    stepStart(st) {
        const s = S();
        this.jitter = 1; this.pauseUntil = 0; this.denyLevel = 1;
        if (!this.spice || !st) return;
        const cap = capLevel();
        const chaos = clamp(s.chaos, 0, 100) / 100;
        const deny = clamp(s.deny, 0, 100) / 100;
        if (chaos) {
            this.jitter = 1 + (Math.random() * 2 - 1) * 0.3 * chaos;
            if (Math.random() < 0.12 * chaos) this.pauseUntil = Date.now() + 700 + Math.random() * 900;
        }
        if (deny) {
            const пик = Math.max(st.v || 0, st.r || 0, st.s || 0, st.t || 0, st.p || 0,
                st.to ? Math.max(st.to.v || 0, st.to.s || 0, st.to.t || 0, st.to.r || 0) : 0);
            if (пик >= cap * 0.7 && Math.random() < deny) {
                const тишина = 3500 + Math.random() * 3000;
                this.denyUntil = Date.now() + тишина;
                this.denyLevel = 0.35;
                log('deny', `отказ на пике — тишина ${Math.round(тишина / 1000)} сек`);
            }
        }
    },

    play(steps, opts) {
        this.overlay = false; this.saved = null;
        this.flow = { level: 0, until: 0, at: 0 };   // явная программа главнее потока
        this.prog = steps || []; this.i = 0;
        this.stepEnd = Date.now() + (this.prog[0]?.ms || 0);
        this.manual = 0;
        this.loop = (opts && opts.loop != null) ? !!opts.loop : null;
        this.spice = !(opts && opts.exact);
        this.denyUntil = 0;
        this.stepStart(this.prog[0]);
        this.run();
    },
    pushOverlay(steps) {
        if (!steps || !steps.length) return;
        if (!this.overlay) {
            this.saved = this.prog.length ? { prog: this.prog, i: this.i, left: Math.max(0, this.stepEnd - Date.now()) } : null;
        }
        this.overlay = true;
        this.prog = steps; this.i = 0;
        this.stepEnd = Date.now() + steps[0].ms;
        this.manual = 0; this.run();
    },
    restore() {
        this.overlay = false;
        const s = this.saved; this.saved = null;
        if (s && s.prog && s.prog.length) { this.prog = s.prog; this.i = s.i; this.stepEnd = Date.now() + Math.max(200, s.left || 0); }
        else { this.prog = []; this.i = 0; this.stepEnd = 0; }
    },
    hold(v) { this.manual = clamp(v, 0, 20); this.prog = []; this.i = 0; this.run(); },
    stop() {
        this.prog = []; this.i = 0; this.manual = 0; this.lastOut = ''; this.startedAt = 0;
        this.overlay = false; this.saved = null; this.waiting = 0; mineNow = false;
        this.flow = { level: 0, until: 0, at: 0 };
        this.denyUntil = 0; this.pauseUntil = 0; this.jitter = 1; this.denyLevel = 1;
        this.soft = { v: 0, r: 0, p: 0, s: 0, t: 0 };      // стоп мгновенный
        live = { v: 0, r: 0, p: 0, s: 0, t: 0 };
        this.stopDevices(); paintMeter();
    },

    disconnect() {
        if (this.timer) { clearInterval(this.timer); this.timer = null; }
        clearInterval(this.keepTimer); this.keepTimer = null;
        try { this.stopDevices(); } catch { /* связи нет */ }
        try { if (this.ws) { this.ws.onclose = null; this.ws.close(); } } catch { /* уже закрыт */ }
        this.ws = null; this.devs = {};
    },
};

/* Общий вход: одинаково зовём и мост, и прямую связь. */
async function sinkConnect() {
    const s = S();
    if (s.transport === 'direct') {
        const r = await Direct.connect();
        connected = r.ok;
        devices = r.devices || [];
        statusNote = r.ok ? capsNote(r.info) : (r.info || 'не подключено');
        if (r.ok) Direct.run();
        return r.ok;
    }
    if (s.transport === 'lovense') {
        const url = lovenseUrl();
        const j = await api('/lovense', { url, command: 'GetToys' });
        if (j && j.code === 200 && j.data?.toys) {
            const lvToys = typeof j.data.toys === 'string' ? JSON.parse(j.data.toys) : j.data.toys;
            devices = Object.values(lvToys).map((x) => x.name);
            toys = [];                      // у Lovense умения выводим по названию модели
            connected = true; statusNote = capsNote();
        } else {
            connected = false;
            statusNote = j?.error || (j?.code === 401 ? 'приложение отвечает, но игрушка не найдена'
                : j?.code === 402 ? 'игрушка не подключена по Bluetooth' : 'непонятный ответ');
        }
        return connected;
    }
    const j = await api('/connect', { url: s.ws });
    connected = !!j.ok; devices = j.devices || []; toys = j.toys || [];
    statusNote = j.ok ? capsNote(j.server) : (j.info || 'мост не достучался до Intiface');
    return connected;
}

// Строка статуса: не просто «подключено», а что именно и что оно умеет.
function capsNote(fallback) {
    const caps = toyCaps();
    if (!caps.known) return fallback || 'подключено, но игрушек не видно';
    return caps.names.join(', ') + ' · умеет: ' + caps.brief + battNote();
}

// Заряд самой слабой игрушки — если она о нём рассказывает.
function battNote() {
    let min = null;
    const list = S().transport === 'direct' ? Object.values(Direct.devs) : toys;
    for (const d of (list || [])) {
        const b = d.batt;
        if (b != null && (min == null || b < min)) min = b;
    }
    return min == null ? '' : ' · заряд ' + min + '%' + (min <= 15 ? ' ⚠' : '');
}

function lovenseUrl() {
    const s = S();
    const ip = String(s.lvIp || '127.0.0.1').trim(), port = String(s.lvPort || '20010').trim();
    const n = parseInt(port, 10);
    if (n >= 20000 && n < 30000) return `http://${ip}:${port}/command`;
    return `https://${(ip === 'localhost' ? '127.0.0.1' : ip).replace(/\./g, '-')}.lovense.club:${port}/command`;
}

function tuning() {
    const s = S();
    // loop сюда не кладём: он у каждой программы свой и уходит только с /program,
    // иначе «модель думает» перебивал бы повтор играющего паттерна.
    return {
        cap: capLevel(), gain: clamp(s.gain, 0.4, 2.5),
        maxSec: (s.maxMinutes || 0) * 60,
        smooth: clamp(s.smooth, 0, 100), breathe: !!s.breathe,
        idleLevel: clamp(s.idleLevel, 0, 20), waitMaxSec: s.waitMaxSec || 180, gentle: !!s.gentle,
        deny: clamp(s.deny, 0, 100), chaos: clamp(s.chaos, 0, 100),
        off: Object.keys(s.devOff || {}).filter((k) => s.devOff[k]),
    };
}

/* Ты нажала паттерн, свой ритм или тест — значит, сейчас ведёшь ты. Пока это так,
   автоматика молчит: ни живого отклика на печать, ни всплесков на фетиш, ни отклика
   на твоё сообщение. Иначе все четыре источника забивают друг друга, и игрушка
   дёргается вместо того, чтобы играть одно. Снимается по СТОП и по концу программы. */
let mineNow = false;

let mineNoted = false;

function sinkProgram(steps, opts) {
    const s = S();
    // Пока играет то, что ты выбрала рукой, сцена от модели её не сносит.
    if (mineNow && !(opts && opts.mine)) {
        if (!mineNoted) { mineNoted = true; log('pat', 'играет твой ритм — сцену не перебиваю, нажми СТОП'); }
        return;
    }
    mineNoted = false;
    mineNow = !!(opts && opts.mine);
    // Паттерн и свой ритм крутятся по своей настройке, сцена — по общей.
    const loop = (opts && opts.loop != null) ? !!opts.loop : !!s.loop;
    if (s.transport === 'direct') return Direct.play(steps, Object.assign({}, opts, { loop }));
    if (s.transport === 'lovense') return lovenseProgram(steps, loop);
    return api('/program', Object.assign(tuning(), { steps, exact: !!(opts && opts.exact), loop })).catch((e) => log('err', 'мост: ' + e.message));
}

// Короткий отклик поверх сцены — сцена потом продолжится с того же места.
function sinkOverlay(steps) {
    const s = S();
    if (!steps || !steps.length) return;
    if (s.transport === 'direct') return Direct.pushOverlay(steps);
    if (s.transport === 'lovense') return lovenseProgram(steps);
    return api('/overlay', Object.assign({ steps }, tuning())).catch(() => {});
}

// Живой отклик: уровень с затуханием. Мост держит его сам, прямой режим — локально.
// hold — сколько держать: слово в тексте 9 секунд, рука на регуляторе дольше.
function sinkFlow(level, hold) {
    const s = S();
    const ms = clamp(hold || 9000, 1000, 20000);
    if (s.transport === 'direct') {
        Direct.flow = { level: level, until: Date.now() + ms, at: Date.now() };
        Direct.run();
        return;
    }
    if (s.transport === 'lovense') { lovenseLevel(level); return; }
    return api('/flow', Object.assign({ level: level, hold: ms }, tuning())).catch(() => {});
}

// «Модель думает» — чтобы сцена не обрывалась на минуту тишины.
function sinkWaiting(on) {
    const s = S();
    if (s.transport === 'direct') { Direct.waiting = on ? Date.now() : 0; return; }
    if (s.transport === 'lovense') return;
    return api('/waiting', Object.assign({ on: !!on }, tuning())).catch(() => {});
}

function sinkLevel(v) {
    const s = S();
    if (s.transport === 'direct') return Direct.hold(v);
    if (s.transport === 'lovense') return lovenseLevel(v);
    return api('/level', { v, cap: capLevel() }).catch(() => {});
}

function sinkStop(why) {
    const s = S();
    mineNow = false;                         // ведёшь больше не ты — автоматика свободна
    live = { v: 0, r: 0, p: 0, s: 0, t: 0 }; paintMeter();
    if (s.transport === 'direct') return Direct.stop();
    if (s.transport === 'lovense') return api('/lovense', { url: lovenseUrl(), command: 'Function', action: 'Stop', timeSec: 0, apiVer: 1 }).catch(() => {});
    return api('/stop', { why: why || '' }).catch(() => {});
}

/* Lovense крутит только то, что назвали. Свой ритм, паттерны и разбор по словам
   пишут уровень в вибрацию — поэтому вращение, всасывание и толчки, которым
   ничего не назначили, идут следом за ней, если у игрушки они есть.
   Накачку не трогаем: её включают только прямо. */
function lovenseAction(o) {
    const есть = {};
    const off = S().devOff || {};
    for (const n of devices) {
        if (off[n]) continue;
        for (const c of (LOVENSE_CAPS[String(n).toLowerCase()] || 'v').split('')) есть[c] = 1;
    }
    const за = (c) => o[c] || (есть[c] ? o.v : 0);
    const r20 = (x) => Math.round(clamp(x, 0, capLevel()));
    const a = [];
    if (o.v) a.push('Vibrate:' + r20(o.v));
    if (за('r')) a.push('Rotate:' + r20(за('r')));
    if (o.p) a.push('Pump:' + Math.round(clamp(o.p / 20 * 3, 0, 3)));
    if (за('s')) a.push('Suction:' + r20(за('s')));
    if (за('t')) a.push('Thrusting:' + r20(за('t')));
    return a.length ? a.join(',') : 'Stop';
}

/* Lovense не умеет программ — проигрываем шаги отсюда, командой на несколько секунд. */
let lvTimer = null;
function lovenseProgram(steps, loop) {
    clearTimeout(lvTimer);
    if (!steps || !steps.length) return;
    const повтор = loop != null ? loop : S().loop;
    let i = 0;
    const play = () => {
        const st = steps[i];
        if (!st) {
            if (повтор) { i = 0; return play(); }
            mineNow = false;                          // доиграло — сцену снова ведёт персонаж
            live = { v: 0, r: 0, p: 0, s: 0, t: 0 }; paintMeter();
            return;
        }
        const g = clamp(S().gain, 0.4, 2.5), o = {};
        for (const c of ['v', 'r', 'p', 's', 't']) o[c] = Math.round(clamp((st.to?.[c] ?? st[c] ?? 0) * g, 0, capLevel()));
        live = o; paintMeter();
        const secs = Math.max(1, Math.round(st.ms / 1000));
        api('/lovense', { url: lovenseUrl(), command: 'Function', action: lovenseAction(o), timeSec: Math.min(60, secs + 2), apiVer: 1 }).catch(() => {});
        i++;
        lvTimer = setTimeout(play, st.ms);
    };
    play();
}
function lovenseLevel(v) {
    clearTimeout(lvTimer);
    const lv = Math.round(clamp(v, 0, capLevel()));
    live = { v: lv, r: 0, p: 0, s: 0, t: 0 }; paintMeter();
    api('/lovense', { url: lovenseUrl(), command: 'Function', action: lovenseAction({ v: lv }), timeSec: 0, apiVer: 1 }).catch(() => {});
}

function refreshDevices(list) {
    devices = list || [];
    toyToldAt = 0;                          // состав сменился — в ближайшем ответе расскажем заново
    if (!connected) return;
    statusNote = capsNote(statusNote);
    paintStatus();
    buildPrompt();                          // состав игрушек изменился — обновляем инструкцию
}

/* ═══════════════ инструкция персонажу ═══════════════ */

/* В промпт уходит то, что про прозу: какая игрушка и как ею управлять словами,
   напоминание о предпочтениях и просьба не комкать близкую сцену (или подсказка
   режиссёра, если её дала вторая модель). Тегов не просим — расширение читает
   сцену само. Теги по-прежнему исполняются, если их шлёт чей-то пресет.

   ход = true только на твоём новом сообщении: подсказка расходуется, паспорт
   отмечается рассказанным. Перерисовки счётчики не трогают. */
function buildPrompt(ход) {
    const s = S();
    let p = '';
    if (s.enabled && !lockedOut) {
        const режиссёр = hintPrompt(ход);
        p = [toyPrompt(ход), fetishPrompt(), режиссёр || pacePrompt()].filter(Boolean).join('\n\n');
    }
    setExtensionPrompt(PROMPT_TAG, p, extension_prompt_types.IN_CHAT, 0, false, extension_prompt_roles.SYSTEM);
}

// Горячая ли сейчас сцена: по живому отклику, недавнему фетишу или тому, что играет.
function сценаГорячая() {
    return (flowAt && Date.now() - flowAt < 15000 && flowLevel >= 6) ||
        (F.at && Date.now() - F.at < 120000 && F.intensity >= 2) ||
        Math.max(live.v, live.s, live.t, live.r) >= capLevel() * 0.5;
}

function кемЗовут() {
    return (NAMES.user && NAMES.user !== 'ты') ? NAMES.user : 'пользователя';
}

/* Основная модель не знает, что на том конце настоящая игрушка и какая.
   Рассказываем — и подсказываем, какими словами её можно включать. */
let toyToldAt = 0;
function toyPrompt(ход) {
    const s = S();
    if (!s.toyTell || !connected) return '';
    const caps = toyCaps();
    if (!caps.known) return '';
    // Не каждый ответ: впервые после подключения, в горячей сцене и изредка между ними.
    if (toyToldAt && !сценаГорячая() && (genCount % Math.max(1, s.fetEvery)) !== 0) return '';
    if (ход) toyToldAt = Date.now();
    const описания = caps.kinds.map((p) => { const t = passportText(p); return t ? t + ' (' + p.name + ')' : p.name; });
    return '[Игрушка]\n' +
        'У ' + кемЗовут() + ' сейчас подключена настоящая игрушка: ' + описания.join('; ') + '. ' +
        'Умеет: ' + caps.brief + '.\n' +
        'Если игрушка появляется в сцене — описывай именно такую, с её формой и ощущениями. ' +
        'Не вводи её сам, если сцена к этому не ведёт.\n' +
        'Персонаж может управлять ею словами, и она отзовётся по-настоящему: включить, выключить, прибавить, убавить, ' +
        '«на минимум», «на максимум», «на вторую скорость», включить волну, пульсацию или дразнящий режим.\n' +
        'Не упоминай плагин и не пиши технических пометок.';
}

/* «Всунул, кончил, вышел» — не потому что модель плохая, а потому что её никто
   не просил иначе. Просим коротко, только в горячих сценах и разными словами. */
const PACE = [
    'Не сворачивай близость в несколько строк. Веди её ступенями: подход, задержка, ' +
    'смена ритма, отступление, возврат. Между ступенями оставляй воздух — дыхание, взгляд, слово.',
    'Держи сцену дольше, чем просится. Дай телу передумать: замедлиться там, где ждут ускорения, ' +
    'и остановиться там, где ждут продолжения.',
    'Меняй в этом ответе хотя бы одно: темп, положение, кто ведёт, что именно делают руки. ' +
    'Не повторяй порядок действий из прошлого ответа.',
    'Финал не приближай сам. Пусть напряжение растёт и спадает несколько раз, ' +
    'прежде чем сцена куда-то придёт.',
];

function pacePrompt() {
    if (!S().paceHint || !сценаГорячая()) return '';
    return '[Темп сцены]\n' + PACE[Math.abs(genCount) % PACE.length] +
        '\nЭто про ритм повествования, а не указание персонажу — в тексте об этом не упоминай.';
}

/* ═══════════════ предпочтения ═══════════════ */

const FET_DICT = [
    { re: 'ше[яию]|горло|ключиц', emoji: '🫦', name: 'Шея' },
    { re: 'волос|локон|коса|хвост', emoji: '💫', name: 'Волосы' },
    { re: 'чулк|колготк|подвязк', emoji: '🖤', name: 'Чулки' },
    { re: 'бель[ёе]|кружев|лиф|комбинац', emoji: '🎀', name: 'Бельё' },
    { re: 'запах|аромат|духи', emoji: '🌿', name: 'Запах' },
    { re: 'голос|ш[ёе]пот|шепч', emoji: '🎧', name: 'Голос' },
    { re: 'укус|кусает|зуб', emoji: '🩸', name: 'Укусы' },
    { re: 'царап|ногт', emoji: '💅', name: 'Царапины' },
    { re: 'связыв|в[её]ревк|наручник|шибари', emoji: '🪢', name: 'Связывание' },
    { re: 'подчин|покорн|слушаться', emoji: '⛓️', name: 'Подчинение' },
    { re: 'доминир|власт|приказ|командует', emoji: '👑', name: 'Власть' },
    { re: 'подгляд|наблюда|смотрит как', emoji: '👁️', name: 'Взгляд' },
    { re: 'зеркал', emoji: '🪞', name: 'Зеркала' },
    { re: 'ладон|пальц|запяст', emoji: '🤍', name: 'Руки' },
    { re: 'стоп[аыу]|щиколот|босая', emoji: '🦶', name: 'Ноги' },
    { re: 'спин[аыу]|поясниц|лопатк', emoji: '🌊', name: 'Спина' },
    { re: 'форм[аыу]|мундир|униформ', emoji: '🎖️', name: 'Форма' },
    { re: 'кожан|латекс|винил', emoji: '🧷', name: 'Латекс' },
    { re: 'ш[ёе]лк|атлас', emoji: '🕊️', name: 'Шёлк' },
    { re: 'вода|душ|ванн|дожд', emoji: '💧', name: 'Вода' },
    { re: 'на людях|публичн|застука|рискн', emoji: '🚪', name: 'На людях' },
    { re: 'дразн|медлен|томит|тянет', emoji: '🕯️', name: 'Дразнение' },
    { re: 'ж[ёе]стк|грубо|резк', emoji: '🔥', name: 'Жёстко' },
    { re: 'нежн|ласков|бережн|осторожн', emoji: '🤍', name: 'Нежность' },
];

let F = { cards: [], intensity: 0, at: 0, key: '' };
let NAMES = { char: 'персонаж', user: 'ты' };
let genCount = 0;

function parseFetish(text) {
    const m = /\[FETISH\]([\s\S]*?)\[\/FETISH\]/i.exec(String(text || ""));
    if (!m) return null;
    const out = { cards: [], intensity: 0 };
    let inCards = false;
    for (const raw of m[1].split("\n")) {
        const line = raw.trim();
        if (!line) continue;
        if (/^cards:/i.test(line)) { inCards = true; continue; }
        if (inCards) {
            const c = /^(\S+)\s+(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)$/.exec(line);
            if (c) { out.cards.push({ emoji: c[1], name: c[2].trim(), what: c[3].trim(), trig: c[4].trim() }); continue; }
            if (/^[a-z_]+:\s/i.test(line)) inCards = false; else continue;
        }
        for (const part of line.split("|")) {
            const k = part.indexOf(":");
            if (k < 0) continue;
            if (part.slice(0, k).trim().toLowerCase() === "intensity") out.intensity = clamp(parseFloat(part.slice(k + 1)) || 0, 0, 5);
        }
    }
    return out;
}

function chatFetKey() {
    const ctx = SillyTavern.getContext();
    return 'pv_fet_' + (ctx?.chatId || ctx?.characterId || 'общий');
}

function charFetishes() {
    const s = S();
    if (!s.fetChar) s.fetChar = {};
    return s.fetChar[chatFetKey()] || [];
}

function ownFetishes() {
    return String(S().fetOwn || "").split(/[,;]/).map((x) => x.trim()).filter(Boolean).slice(0, 8)
        .map((n) => {
            const hit = FET_DICT.find((f) => new RegExp(f.re, "i").test(n.toLowerCase()));
            return { emoji: hit ? hit.emoji : "✦", name: n };
        });
}

function scanText(txt) {
    const t = String(txt || "").toLowerCase(), found = [];
    for (const f of FET_DICT) {
        if (found.length >= 8) break;
        if (new RegExp(f.re, "i").test(t)) found.push({ emoji: f.emoji, name: f.name });
    }
    return found;
}

function addCharFetishes(found, откуда) {
    const s = S();
    if (!s.fetChar) s.fetChar = {};
    const have = charFetishes().slice();
    const было = have.length;
    for (const f of found) {
        if (have.length >= 8) break;
        if (!have.some((x) => x.name === f.name)) have.push(f);
    }
    s.fetChar[chatFetKey()] = have;
    saveSettingsDebounced(); paintFetish(); buildPrompt();
    const новых = have.length - было;
    log(новых ? `+${новых} из ${откуда}: ${have.slice(было).map((f) => f.name).join(", ")}` : `в ${откуда} ничего нового`);
}

function rescanCard() {
    const ctx = SillyTavern.getContext();
    const ch = ctx?.characters?.[ctx?.characterId] || {};
    const txt = [ch.description, ch.personality, ch.scenario, ch.first_mes, ch.mes_example].filter(Boolean).join("\n");
    if (!txt) { toastr.info("карточка пустая"); return; }
    addCharFetishes(scanText(txt), "карточки");
}

function scanChatFetishes() {
    const ctx = SillyTavern.getContext();
    const txt = (ctx?.chat || []).slice(-40).map((m) => String(m.mes || "")).join("\n");
    if (!txt) { toastr.info("чат пустой"); return; }
    addCharFetishes(scanText(txt), "чата");
}

function pickNames() {
    const ctx = SillyTavern.getContext();
    NAMES.char = ctx?.characters?.[ctx?.characterId]?.name || ctx?.name2 || "персонаж";
    NAMES.user = ctx?.name1 || "ты";
}

// Напоминание уходит не каждый раз, чтобы не приедалось.
function fetishPrompt() {
    const s = S();
    if (!s.fetRemind) return "";
    const her = charFetishes(), mine = ownFetishes();
    if (!her.length && !mine.length) return "";
    const горячо = F.at && (Date.now() - F.at < 120000);
    if (!горячо && (genCount % Math.max(1, s.fetEvery)) !== 0) return "";
    const names = (a) => a.map((x) => x.name).join(", ");
    return "[Предпочтения]\n" +
        (her.length ? NAMES.char + ": " + names(her) + "\n" : "") +
        (mine.length ? NAMES.user + ": " + names(mine) + "\n" : "") +
        "В близких сценах играй на этом: вплетай одну деталь в действие, не перечисляй списком " +
        "и не называй это «фетишем». Одна за ответ, не больше.";
}

// Сработал триггер — короткий всплеск поверх сцены.
function fetishSpike(f) {
    const s = S();
    if (!s.fetDrive || !f || !(f.intensity >= 1) || !connected) return;
    if (mineNow) return;                     // не лезем во всплеск поверх твоего ритма
    const cap = capLevel();
    const пик = clamp(Math.round(cap * (0.45 + 0.11 * f.intensity)), 2, cap);
    const c = mainChannel();
    const mk = (a, to, sec) => { const o = {}; o[c] = a; if (to != null) { o.to = {}; o.to[c] = to; } return step(o, sec); };
    sinkOverlay([mk(Math.round(пик * 0.4), пик, 1.5), mk(пик, Math.round(пик * 0.5), 2.5)]);
    log('fet', `фетиш сработал на ${f.intensity}/5 → всплеск до ${пик}/20`);
}

/* ═══════════════ свой ритм и обмен кодом ═══════════════ */

function queueSteps() {
    return (S().queue || []).filter((q) => q && q.sec > 0).map((q) => {
        const o = {}; o[mainChannel()] = clamp(q.v, 0, 20);
        return step(o, q.sec);
    });
}

function rhythmCode() {
    const q = (S().queue || []).filter((x) => x && x.sec > 0);
    return q.length ? "PV1-" + q.map((x) => clamp(x.v, 0, 20) + "x" + clamp(x.sec, 1, 600)).join("-") : "";
}

function applyRhythmCode(code) {
    // код часто прилетает внутри сообщения — выдёргиваем его из любого текста
    const m = /PV1-((?:\s*\d{1,2}\s*[xх*]\s*\d{1,3}\s*)(?:-\s*\d{1,2}\s*[xх*]\s*\d{1,3}\s*)*)/i.exec(String(code || ""));
    if (!m) return false;
    const q = [];
    for (const part of m[1].split("-")) {
        const x = /^\s*(\d{1,2})\s*[xх*]\s*(\d{1,3})\s*$/i.exec(part);
        if (x && q.length < 12) q.push({ v: clamp(+x[1], 0, 20), sec: clamp(+x[2], 1, 600) });
    }
    if (!q.length) return false;
    S().queue = q;
    saveSettingsDebounced(); paintQueue();
    return true;
}

/* ═══════════════ ловим команды и сцены ═══════════════ */

/* ═══════════════ приказы персонажа ═══════════════ */
/* «Сильнее», «медленнее», «замри» — это не накал сцены, а приказ. Берём
   последнюю команду в куске: «сильнее… нет, тише» — слушаемся второго.
   «Не останавливайся» — приказ продолжать, его вырезаем первым. */
const ORDER_NOT = /не\s+(?:смей\s+)?(?:останавлива[а-яё]*|останови[а-яё]*|прекраща[а-яё]*|переставай|тормози[а-яё]*)/gi;

const ORDERS_RE = [
    { d: 'вверх', re: 'сильн(?:ее|ей)|быстр(?:ее|ей)|глубже|ж[её]стче|резче|грубее' },
    { d: 'вниз', re: 'медленн(?:ее|ей)|помедленн[а-яё]*|потише|тише|нежн(?:ее|ей)|осторожн(?:ее|ей)|полегче|мягче' },
    { d: 'стоп', re: 'остановись|останови[а-яё]*|замри|не\\s+двигайся|перестань|хватит|подожди|погоди' },
].map((o) => ({
    d: o.d,
    // После приказа фраза кончается: «— Сильнее, — выдохнул он». «Он сильнее её» — описание.
    re: new RegExp('(?:^|[^а-яёА-ЯЁ])(?:' + o.re + ')(?=\\s*(?:[,.!?…:;»"”)\\-—]|$))', 'gi'),
}));

function orderOf(text) {
    let t = String(text || ''), лучший = '', где = -1, m;
    ORDER_NOT.lastIndex = 0;
    while ((m = ORDER_NOT.exec(t)) !== null) {
        if (m.index > где) { где = m.index; лучший = 'вверх'; }
        // запрет вырезаем пробелами: позиции остальных слов не сдвинутся
        t = t.slice(0, m.index) + m[0].replace(/\S/g, ' ') + t.slice(m.index + m[0].length);
    }
    for (const o of ORDERS_RE) {
        o.re.lastIndex = 0;
        let x;
        while ((x = o.re.exec(t)) !== null) {
            if (x.index > где) { где = x.index; лучший = o.d; }
            if (o.re.lastIndex === x.index) o.re.lastIndex++;
        }
    }
    return лучший;
}

/* ═══════════════ игрушка внутри сцены ═══════════════ */
/* Когда персонаж в тексте берёт вибратор и щёлкает переключателем, «включил на
   максимум» должно включить на максимум, «выключил и отложил» — выключить.
   \w в JS кириллицу не покрывает, поэтому хвосты слов пишем явно. */
const СЛ = '[а-яё]*';

const DEV_RE = new RegExp('(?:вибратор|игрушк|вибропул|виброяйц|пробк|массаж[её]р|стимулятор|' +
    'пульт|вибрац|виброкольц|зажим|мастурбатор)' + СЛ, 'gi');

const DEV_ACTS = [
    { a: 'выкл', re: 'выключ|отключ|вырубил|убрал|вынул|отложил|отобрал|погасил' },
    { a: 'вкл', re: 'включ|запустил|врубил|прижал|прижима|приставил|вставил|вв[ёе]л|ввела|над[ае]л|закрепил' },
    { a: 'выше', re: 'прибав|усилил|усилива|выкрутил|увеличил|подда|разогнал' },
    { a: 'ниже', re: 'убав|сбавил|снизил|уменьшил|ослабил|приглушил' },
].map((x) => ({ a: x.a, re: new RegExp('(?:^|[^а-яё])(?:' + x.re + ')' + СЛ, 'gi') }));

const DEV_LVL = [
    { k: 'макс', re: 'на\\s+максимум|до\\s+упора|на\\s+полную|на\\s+всю\\s+(?:катушку|мощность)|на\\s+самый\\s+сильн' },
    { k: 'сред', re: 'вполсилы|наполовину|на\\s+средн|на\\s+половин' },
    { k: 'мин', re: 'на\\s+минимум|на\\s+самый\\s+слаб|на\\s+самую\\s+слаб|еле\\s+слышн|чуть\\s+слышн|на\\s+самую\\s+малую' },
].map((x) => ({ k: x.k, re: new RegExp('(?:' + x.re + ')' + СЛ, 'gi') }));

const DEV_ORD = new RegExp('(перв|втор|трет|четв[ёе]рт|пят)' + СЛ + '\\s+(?:скорост|режим|уровен|ступен|позици)' + СЛ, 'gi');
const DEV_PCT = new RegExp('(\\d{1,3})\\s*(?:%|процент' + СЛ + ')', 'gi');
const ORD_N = { 'перв': 1, 'втор': 2, 'трет': 3, 'четвёрт': 4, 'четверт': 4, 'пят': 5 };

// Названия режимов совпадают с готовыми паттернами.
const DEV_PRESET = [
    { p: 'волна', re: new RegExp('волн' + СЛ, 'gi') },
    { p: 'пульс', re: new RegExp('пульсац' + СЛ + '|пульсир' + СЛ + '|импульс' + СЛ + '|толчками', 'gi') },
    { p: 'крещендо', re: new RegExp('крещендо|нарастающ' + СЛ, 'gi') },
    { p: 'прибой', re: new RegExp('прибо' + СЛ, 'gi') },
    { p: 'сердцебиение', re: new RegExp('сердцебиен' + СЛ + '|как\\s+сердце', 'gi') },
    { p: 'дразнилка', re: new RegExp('дразнящ' + СЛ, 'gi') },
];

/* Ищем по предложениям. «Вибратор лежал в ящике. Через час он выключил компьютер» —
   разные предложения. Но «Он взял игрушку. Включил на максимум» — можно склеить:
   во второй фразе есть указание силы или местоимение на неё. */
function deviceActOf(text) {
    const t = String(text || '');
    if (!t) return null;
    const куски = [];
    let последний = 0;
    for (let i = 0; i < t.length; i++) {
        if ('.!?…\n'.includes(t.charAt(i))) {
            while (i + 1 < t.length && '.!?…\n '.includes(t.charAt(i + 1))) i++;
            куски.push(t.slice(последний, i + 1));
            последний = i + 1;
        }
    }
    if (последний < t.length) куски.push(t.slice(последний));

    const cap = capLevel();
    let акт = '', уровень = null, режим = null, былоУстройство = false;
    const ищем = (re, s) => { re.lastIndex = 0; const out = []; let m; while ((m = re.exec(s)) !== null) { out.push(m); if (re.lastIndex === m.index) re.lastIndex++; } return out; };
    const МЕСТ = /(?:^|[^а-яё])(?:его|е[ёе]|ей|им|ею|н[её]м|ней)(?:[^а-яё]|$)/i;
    const СИЛА = new RegExp('на\\s+(?:максимум|минимум|полную|средн|половин|самый|самую)|до\\s+упора|' +
        'вполсилы|наполовину|\\d{1,3}\\s*(?:%|процент)|(?:перв|втор|трет|четв|пят)' + СЛ + '\\s+(?:скорост|режим|уровен|ступен)', 'i');

    for (const фраза of куски) {
        const своё = ищем(DEV_RE, фраза).length > 0;
        const можно = своё || (былоУстройство && (МЕСТ.test(фраза) || СИЛА.test(фраза)));
        былоУстройство = своё;
        if (!можно) continue;
        for (const x of DEV_ACTS) if (ищем(x.re, фраза).length) акт = x.a;
        for (const x of DEV_LVL) {
            if (!ищем(x.re, фраза).length) continue;
            уровень = x.k === 'макс' ? cap : x.k === 'сред' ? Math.round(cap * 0.5) : Math.max(2, Math.round(cap * 0.2));
            if (!акт) акт = 'вкл';
        }
        for (const o of ищем(DEV_ORD, фраза)) {
            const n = ORD_N[String(o[1]).toLowerCase()];
            if (n) { уровень = clamp(Math.round(cap * n / 5), 1, cap); if (!акт) акт = 'вкл'; }
        }
        for (const p of ищем(DEV_PCT, фраза)) {
            уровень = clamp(Math.round(cap * clamp(+p[1], 0, 100) / 100), 0, cap);
            if (!акт) акт = 'вкл';
        }
        if (своё) {                               // режим называют там же, где и предмет
            for (const x of DEV_PRESET) if (ищем(x.re, фраза).length) { режим = x.p; if (!акт) акт = 'вкл'; }
        }
    }
    if (!акт) return null;
    return { act: акт, level: уровень, preset: режим };
}

let flowKey = '', flowPos = 0, flowLevel = 0, flowAt = 0, devHold = 0;

// Отзываемся на то, что появилось в тексте только что.
function flowScan(key, text) {
    const s = S();
    if (!s.flowLive || !s.enabled || !connected || lockedOut) return;
    if (mineNow) return;                     // сейчас играет то, что ты нажала рукой
    if (key !== flowKey) { flowKey = key; flowPos = 0; flowLevel = 0; }
    if (text.length < flowPos) flowPos = 0;  // свайп: текст начался заново
    if (text.length <= flowPos) return;
    const chunk = text.slice(flowPos);
    flowPos = text.length;
    const cap = capLevel(), было = flowLevel;

    // Самое главное — что происходит с игрушкой прямо в сцене.
    const вещь = s.orders ? deviceActOf(chunk) : null;
    if (вещь) {
        sinkWaiting(false);
        if (вещь.act === 'выкл') {
            flowLevel = 0; flowAt = Date.now();
            devHold = Date.now() + 8000;          // «выключил и отложил» — накал вокруг не раскрутит обратно
            sinkStop('в сцене выключил игрушку');
            log('flow', 'в сцене выключил игрушку — тишина');
            return;
        }
        const ур = вещь.level != null ? вещь.level
            : вещь.act === 'выше' ? clamp(Math.max(было + 4, Math.round(cap * 0.7)), 2, cap)
                : вещь.act === 'ниже' ? clamp(Math.round((было || cap * 0.5) * 0.45), 1, cap)
                    : clamp(Math.round(cap * 0.5), 2, cap);
        devHold = 0;
        if (вещь.preset && PRESETS[вещь.preset]) {
            sinkProgram(makePreset(вещь.preset, ур, clamp(s.patSec, 30, 300)));
            log('flow', `в сцене включил режим «${вещь.preset}» на ${ур}/20`);
            return;
        }
        flowLevel = ур; flowAt = Date.now();
        sinkFlow(ур, 14000);                      // рука на регуляторе держится дольше слова
        log('flow', `в сцене ${вещь.act === 'выше' ? 'прибавил' : вещь.act === 'ниже' ? 'убавил' : 'включил'} → ${ур}/20`);
        return;
    }

    if (devHold && Date.now() < devHold) return;

    // Прямой приказ важнее словаря: «замри» посреди горячей сцены — это тишина.
    const приказ = s.orders ? orderOf(chunk) : '';
    if (приказ) {
        if (приказ === 'вверх') flowLevel = clamp(Math.max(было + 4, Math.round(cap * 0.7)), 2, cap);
        if (приказ === 'вниз') flowLevel = clamp(Math.round((было || cap * 0.5) * 0.45), 1, cap);
        if (приказ === 'стоп') flowLevel = 0;
        flowAt = Date.now();
        sinkWaiting(false);
        sinkFlow(flowLevel, приказ === 'стоп' ? 5000 : 12000);
        log('flow', `команда «${приказ}» → ${flowLevel}/20`);
        return;
    }

    const h = heatOf(chunk);
    if (!h.top) return;
    const цель = clamp(h.top + (h.hot ? 3 : 0) + (h.hits > 2 ? 1 : 0), 2, cap);
    flowLevel = Math.max(Math.round(flowLevel * 0.75), цель);
    flowAt = Date.now();
    sinkWaiting(false);
    sinkFlow(flowLevel);
}

let streamText = '';
let firedCount = 0;
let brainKey = '';
let brainBusy = false;

function playCommands(cmds, fromIndex) {
    let steps = [];
    for (const c of cmds) steps = steps.concat(c);
    if (!steps.length) return;
    sinkProgram(steps);
    const added = cmds.length - fromIndex;
    log('cmd', `+${added} команд${added === 1 ? 'а' : ''} из ответа`);
}

function onStreamToken(data) {
    const s = S();
    if (!s.enabled || !connected || lockedOut) return;
    const t = typeof data === 'string' ? data : (data?.text || data?.message || '');
    if (!t) return;
    if (!streamText) sinkWaiting(false);      // ответ пошёл — ждать больше нечего
    // Таверна в разных версиях шлёт то накопленный текст, то кусочек — понимаем оба случая.
    streamText = (streamText && t.startsWith(streamText.slice(0, Math.min(30, streamText.length))) && t.length >= streamText.length)
        ? t : streamText + t;

    // Теги главнее, если их прислал чей-то пресет.
    const cmds = parseCmds(streamText);
    if (cmds.length) {
        if (cmds.length > firedCount) {
            playCommands(cmds, firedCount);
            firedCount = cmds.length;
        }
        return;
    }

    // Тегов нет — ведём сцену по словам прямо во время печати.
    flowScan('stream', streamText);
}

async function onMessageReceived(id) {
    const s = S();
    if (!s.enabled || lockedOut) return;
    const ctx = SillyTavern.getContext();
    const msg = ctx.chat?.[typeof id === 'number' ? id : ctx.chat.length - 1];
    if (!msg || msg.is_user) return;
    sinkWaiting(false);
    const text = String(msg.mes || '');

    const key = String(id ?? ctx.chat.length);

    // Фетиш-блок из ответа: карточки и, если разрешено, всплеск.
    const fet = parseFetish(text);
    if (fet && fet.cards.length && key !== F.key) {
        F = { cards: fet.cards, intensity: fet.intensity, at: Date.now(), key };
        paintFetish();
        fetishSpike(fet);
    }

    // Теги, если пришли, ведут сцену сами.
    const cmds = parseCmds(text);
    if (cmds.length) {
        if (!connected) return;
        if (cmds.length > firedCount) { playCommands(cmds, firedCount); firedCount = cmds.length; }
        return;
    }

    runBrain(key, text);
}

/* Короткий отклик на твоё сообщение: пока модель думает, сцена не молчит.
   Считается по словам, без запросов. */
function replyToMe(text) {
    const h = heatOf(text), cap = capLevel();
    const идётСцена = liveIsPlaying();
    if (h.hits < 2 && !идётСцена) return null;
    const base = clamp(h.top ? Math.min(cap, h.top) : Math.round(cap * 0.4), 2, cap);
    const c = mainChannel();
    const mk = (a, to, sec) => {
        const o = {}; o[c] = a;
        if (to != null) { o.to = {}; o.to[c] = to; }
        return step(o, sec);
    };
    return [mk(Math.max(2, Math.round(base * 0.45)), base, 1.2), mk(base, Math.max(1, Math.round(base * 0.35)), 2)];
}

function liveIsPlaying() {
    return S().transport === 'direct' ? Direct.prog.length > 0 : (live.v + live.r + live.p + live.s + live.t) > 0;
}

function onMessageSent() {
    const s = S();
    const ctx = SillyTavern.getContext();
    const last = ctx.chat?.[ctx.chat.length - 1];
    if (!last?.is_user) return;
    const text = String(last.mes || '');
    checkSafeword(text);
    genCount++;                              // считаем ходы для редких напоминаний
    lastUserText = text;                     // режиссёру нужно знать, что ты написала
    buildPrompt(true);                       // новый ход: подсказки расходуются только здесь
    if (!s.enabled || !connected || lockedOut) return;
    sinkWaiting(true);                       // ответа ждать долго — держим сцену
    if (s.reply && !mineNow) {               // твой ритм важнее короткого отклика
        const nod = replyToMe(text);
        if (nod) { sinkOverlay(nod); log('me', 'отклик на твоё сообщение'); }
    }
}

function onGenerationStarted() {
    streamText = ''; firedCount = 0; flowKey = ''; flowPos = 0; flowLevel = 0;
    if (S().enabled && connected) sinkWaiting(true);
}

// Свайп или регенерация: ответ переписывают — забываем то, что по нему уже отыграли.
function onSwiped() {
    streamText = ''; firedCount = 0; brainKey = '';
    log('swipe', 'ответ переписывается — начинаю сцену заново');
}

async function runBrain(key, text, force) {
    const s = S();
    if (!connected) return;
    if (brainBusy) return;
    if (!force && key === brainKey) return;
    brainKey = key;

    // Играет твой ритм — не тратим на аналитика платный запрос и не помечаем ответ разобранным.
    if (mineNow) { brainKey = ''; log('brain', 'играет твой ритм — сцену не разбираю'); return; }

    const plain = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(-1800);
    if (!plain) return;

    if (s.brain !== 'model') {
        /* Сцена кончилась тем, что игрушку выключили и отложили. Собирать программу
           из накала вокруг — значит включить её обратно вопреки тексту. */
        const вещь = s.orders ? deviceActOf(plain) : null;
        if (вещь && вещь.act === 'выкл') { sinkStop('в сцене игрушку выключили'); log('flow', 'в сцене игрушку выключили — тишина'); return; }
        const steps = heuristic(plain);
        if (!steps) { sinkStop('сцена спокойная'); log('brain', 'по тексту ничего горячего — тишина'); return; }
        sinkProgram(steps);
        const h = heatOf(plain);
        log('brain', `разбор по словам: накал ${h.top}/20, совпадений ${h.hits}`);
        return;
    }

    if (s.gate && heatOf(plain).hits < 2) { sinkStop('сцена спокойная'); log('brain', 'сцена спокойная — запрос не отправляла'); return; }

    brainBusy = true;
    log('brain', 'читаю сцену…');
    try {
        const reply = await genAsk(analystInput(plain), analystSys());
        brainBusy = false;
        if (S().hintOn) {
            const подсказка = takeHint(reply);
            if (подсказка) {
                HINT = { text: подсказка, at: Date.now(), used: 0 };
                log('brain', 'режиссёр: ' + подсказка.slice(0, 90));
            } else if (/<\s*hint\s*>\s*<\s*\/\s*hint\s*>/i.test(reply)) {
                HINT = { text: '', at: 0, used: 0 };      // сцена не интимная — подсказывать нечего
            }
            buildPrompt();
        }
        const cmds = parseCmds(reply);
        if (!cmds.length) { log('brain', 'аналитик не дал команд — оставляю как есть'); return; }
        let steps = [];
        for (const c of cmds) steps = steps.concat(c);
        const quiet = steps.length === 1 && !steps[0].v && !steps[0].r && !steps[0].s && !steps[0].t;
        if (quiet) { sinkStop('аналитик: спокойно'); log('brain', 'сцена спокойная — тишина'); return; }
        sinkProgram(steps);
        log('brain', `программа на ${steps.length} шаг(ов), старт с ${Math.round(steps[0].v)}/20`);
    } catch (e) {
        brainBusy = false;
        log('err', 'аналитик: ' + String(e?.message || e).slice(0, 70));
        const steps = heuristic(plain);
        if (steps) { sinkProgram(steps); log('brain', 'подстраховка: разобрала сама, по словам'); }
    }
}

function checkSafeword(text) {
    const w = String(S().safeword || '').trim().toLowerCase();
    if (!w) return;
    const re = new RegExp('(^|[^a-zа-яё])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-zа-яё]|$)', 'i');
    if (re.test(String(text || '').toLowerCase())) {
        panic(`стоп-слово «${w}»`);
        log('safe', 'стоп-слово в сообщении — управление выключено');
    }
}

function panic(why) {
    lockedOut = true;
    S().enabled = false;
    saveSettingsDebounced();
    $('#pv_enabled').prop('checked', false);
    sinkStop(why || 'паника');
    buildPrompt();
    paintStatus();
    toastr.warning('PUSYA VIBE: всё остановлено — ' + (why || ''));
    setTimeout(() => { lockedOut = false; }, 3000);
}

/* ═══════════════ отрисовка ═══════════════ */

const PV_VERSION = '1.13.0';
/* Где лежит расширение. Таверна называет папку по имени репозитория, поэтому
   путь берём от самого файла, а не пишем руками: иначе при другом имени папки
   settings.html не находится и панель молча не появляется. */
const BASE = (() => {
    try { return new URL('.', import.meta.url).pathname; } catch { return '/scripts/extensions/third-party/SillyTavern-PusyaVibe/'; }
})();

const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const hhmm = (t) => { const d = new Date(t); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); };

function секстр(sec) {
    sec = Math.round(+sec || 0);
    if (sec < 60) return sec + ' сек';
    const м = Math.floor(sec / 60), с = sec % 60;
    return м + ' мин' + (с ? ' ' + с + ' сек' : '');
}

// Все игрушки, что сейчас видны, — включая выключенные руками: иначе включить их обратно было бы нечем.
function allDeviceNames() {
    const s = S();
    if (s.transport === 'direct') return Object.values(Direct.devs).map((d) => d.name);
    if (s.transport === 'lovense') return devices.slice();
    return (toys || []).map((d) => d.name);
}

function paintStatus() {
    const s = S();
    const caps = connected ? toyCaps() : null;
    const dot = $('#pv_dot');
    dot.removeClass('on err wait');
    dot.addClass(connected ? 'on' : statusNote === 'подключаюсь…' ? 'wait' : (statusNote && statusNote !== 'не подключено' ? 'err' : ''));

    $('#pv_devname').text(caps && caps.known ? caps.names.join(', ') : statusNote === 'подключаюсь…' ? 'подключаюсь…' : 'нет игрушки');
    if (caps && caps.known) {
        const вид = caps.kinds.filter((p) => p.k || p.air).map((p) => (p.k || 'игрушка') + (p.air ? ', воздух' : ''));
        $('#pv_status').text((вид.length ? вид.join(' + ') + ' · ' : '') + caps.brief + battNote());
    } else {
        $('#pv_status').text(connected ? 'подключено, но игрушек не видно — нажми «Искать» в Intiface' : (statusNote || 'не подключено'));
    }
    const воздух = caps && caps.kinds.some((p) => p.air);
    $('#pv_devico').text(caps && caps.known ? (caps.has('s') || воздух ? '🌊' : caps.has('t') ? '🌀' : '≋') : '≋');

    // Строчка под переключателем: объясняет его словами и показывает, во что упрётся.
    const parts = [];
    if (lockedOut) parts.push('⚠ сработало стоп-слово');
    else parts.push(s.enabled ? 'персонаж ведёт игрушку' : 'выключено — игрушка слушается только тебя');
    parts.push('до ' + capLevel() + '/20');
    if (s.maxMinutes > 0) parts.push('автостоп ' + s.maxMinutes + ' мин');
    if (s.safeword) parts.push('«' + s.safeword + '»');
    $('#pv_guard').text(parts.join(' · '));
    $('#pv_connect').val(connected ? 'Переподключить' : 'Подключить');

    paintDevs();
    paintKinds();
    paintWarn();
    wizRefresh();
    paintFab();
    if ($('#pv_mini').length && !$('#pv_mini').prop('hidden') && !$('#pv_mini_on').is(':focus')) paintMini();
}

/* ── картина сцены: последние полторы минуты ── */
const HIST = [];
let histAt = 0;

function pushHist(v) {
    const t = Date.now();
    if (!histAt) histAt = t;
    // мост присылает уровень раз в три секунды — заполняем пропущенные секунды тем же
    let n = Math.floor((t - histAt) / 1000);
    if (n < 1) return;
    n = Math.min(n, 10);
    histAt = t;
    for (let i = 0; i < n; i++) HIST.push(Math.round(v));
    while (HIST.length > 90) HIST.shift();
    if (S().tab === 'play') paintGraph();
}

function paintGraph() {
    const g = $('#pv_graph');
    if (!g.length) return;
    if (S().blind) { g.html(''); $('#pv_sess').text('слепой режим'); return; }
    g.html(HIST.map((v) => `<i style="height:${Math.max(2, Math.round(v / 20 * 100))}%"></i>`).join(''));
    const живые = HIST.filter((v) => v > 0);
    $('#pv_sess').text(живые.length
        ? `пик ${Math.max(...живые)} · средний ${Math.round(живые.reduce((a, b) => a + b, 0) / живые.length)}`
        : 'тихо');
}

function paintMeter() {
    const v = Math.round(Math.max(live.v, live.r, live.p, live.s, live.t));
    const слепо = !!S().blind;                       // вслепую ни цифры, ни полоски
    $('#pv_fill').css('width', (слепо ? 0 : v / 20 * 100) + '%');
    $('#pv_live').text(слепо ? '·' : v);
    pushHist(v);
    paintFab();
}

function paintLog() {
    $('#pv_log').html(LOG.slice(0, 30).map((r) => {
        if (r.kind === 'игра') return `<div class="pv-logplay"><b>${hhmm(r.t)}</b>▶ игра${r.n > 1 ? ' ×' + r.n : ''}</div>`;
        const красн = r.kind === 'err' || r.kind === 'stop' || r.kind === 'safe';
        return `<div${красн ? ' class="pv-logerr"' : ''}><b>${hhmm(r.t)}</b>${esc(r.text)}</div>`;
    }).join('') || '<div style="opacity:.5">пока пусто</div>');
}

function paintPlay() {
    $('#pv_play').html(PLAY.slice(0, 30).map((r) => `<div><b>${hhmm(r.t)}</b>${esc(r.text)}</div>`).join('')
        || '<div style="opacity:.5">пока ничего не играло</div>');
}

/* Плашка в меню. Половина вопросов «почему ничего не происходит» — это
   неподключённая игрушка или снятая галочка. Говорим сразу и ведём туда. */
function paintWarn() {
    const s = S(), box = $('#pv_warn');
    if (!box.length) return;
    let беда = null;
    if (!connected) беда = { t: '🔌 игрушка не подключена', s: 'Нажми, чтобы открыть подключение.', go: 'set' };
    else if (!s.enabled) беда = { t: '⏸ персонаж не ведёт игрушку', s: 'Галочка «Персонаж ведёт игрушку» наверху снята — игрушка слушается только тебя.', go: '' };
    if (!беда) { box.empty(); } else {
        box.html(`<div class="pv-warn"><b>${esc(беда.t)}</b><span>${esc(беда.s)}</span></div>`);
        const k = box.find('.pv-warn');
        if (беда.go) k.on('click', () => showPane(беда.go)); else k.css('cursor', 'default');
    }
    $('#pv_wiz_row').toggle(!s.wizDone);
}

const PANES = ['home', 'play', 'rhythm', 'fet', 'set'];

function showPane(id) {
    const s = S();
    if (!PANES.includes(id)) id = 'home';
    s.tab = id; saveSettingsDebounced();
    for (const x of PANES) $('#pv_p_' + x).prop('hidden', x !== id);
    $('#pv_backbar').prop('hidden', id === 'home');
    if (id === 'home') paintWarn();
    if (id === 'fet') paintFetish();
    if (id === 'rhythm') { paintQueue(); paintPat(); }
    if (id === 'play') { paintGraph(); paintPlay(); }
    if (id === 'set') { paintLog(); paintBrainBoxes(); }
}

/* ── именованные кнопки вместо ползунков ──
   «35 из 100» не говорит ничего, пока не перепробуешь всё. Ряд кнопок
   показывает все варианты сразу и словами. */
const ВЫБОРЫ = {
    gain: [{ v: 0.7, t: 'тише' }, { v: 1, t: 'как просят' }, { v: 1.5, t: 'громче' }, { v: 2.2, t: 'вдвое' }],
    deny: [{ v: 0, t: 'никогда' }, { v: 15, t: 'редко' }, { v: 40, t: 'иногда' }, { v: 70, t: 'часто' }],
    chaos: [{ v: 0, t: 'ровно' }, { v: 15, t: 'чуть' }, { v: 40, t: 'заметно' }, { v: 75, t: 'своенравно' }],
    smooth: [{ v: 0, t: 'резко' }, { v: 35, t: 'мягко' }, { v: 70, t: 'очень мягко' }],
    idle: [{ v: 0, t: 'тишина' }, { v: 2, t: 'слабый фон' }, { v: 4, t: 'заметный фон' }],
};

// Профиль мог поставить значение между кнопками — подсвечиваем ближайшую.
function ближайший(items, val) {
    let best = items[0].v, d = Infinity;
    for (const it of items) { const x = Math.abs(it.v - val); if (x < d) { d = x; best = it.v; } }
    return best;
}

function chipRow(sel, items, get, set) {
    const box = $(sel);
    if (!box.length) return;
    const сейчас = ближайший(items, +get());
    box.empty();
    for (const it of items) {
        $('<div class="pv-chip"></div>').text(it.t).toggleClass('on', it.v === сейчас)
            .on('click', () => { set(it.v); chipRow(sel, items, get, set); })
            .appendTo(box);
    }
}

function paintPicks() {
    const s = S();
    const пиши = (k) => (v) => { s[k] = v; saveSettingsDebounced(); saveChatCfg(); };
    chipRow('#pv_gain', ВЫБОРЫ.gain, () => s.gain, пиши('gain'));
    chipRow('#pv_deny', ВЫБОРЫ.deny, () => s.deny, пиши('deny'));
    chipRow('#pv_chaos', ВЫБОРЫ.chaos, () => s.chaos, пиши('chaos'));
    chipRow('#pv_smooth', ВЫБОРЫ.smooth, () => s.smooth, пиши('smooth'));
    chipRow('#pv_idle', ВЫБОРЫ.idle, () => s.idleLevel, пиши('idleLevel'));
}

const BRAINS = [
    { v: 'live', t: 'По словам — на лету' },
    { v: 'model', t: 'Отдельная модель' },
];

function paintBrainBoxes() {
    const s = S();
    const box = $('#pv_brains');
    box.empty();
    for (const b of BRAINS) {
        $('<div class="pv-chip"></div>').text(b.t).toggleClass('on', s.brain === b.v).on('click', () => {
            s.brain = b.v; brainKey = ''; saveSettingsDebounced(); saveChatCfg();
            paintBrainBoxes(); buildPrompt();
        }).appendTo(box);
    }
    $('#pv_livebox').toggle(s.brain !== 'model');
    $('#pv_modelbox').toggle(s.brain === 'model');
    $('#pv_brain_note').text(s.brain === 'model'
        ? 'Отдельный тихий запрос читает твоё сообщение и готовый ответ и строит программу. Проза остаётся чистой, тегов в тексте нет.'
        : 'Расширение читает ответ прямо во время печати и отзывается на то, что только что появилось. Ничего не просит у основной модели: ни токенов, ни правок в пресете.');
    $('#pv_hint_last').text(HINT.text ? 'последняя подсказка: «' + HINT.text + '»' : '');
}

/* ═══════════════ профили и память по чатам ═══════════════ */

// Без цифр: «старт с 8-10» никто не переведёт в ощущения, а слова — сразу.
function profHint() {
    return ({
        'нежно': 'тихо и плавно, до сильного почти не доходит',
        'обычно': 'идёт за сценой: касания — тихо, разгар — сильнее, пик — на полную',
        'жёстко': 'сразу с середины, на пике на полную, обрывы резкие',
        'дразнить': 'доводит почти до предела и роняет в ноль — привыкнуть не даёт',
    })[S().profile] || '';
}

function applyProfile(name) {
    const p = PROFILES[name]; if (!p) return;
    const s = S();
    s.gain = p.gain; s.smooth = p.smooth; s.idleLevel = p.idleLevel; s.tone = p.tone; s.profile = name;
    if (p.deny != null) s.deny = p.deny;
    if (p.chaos != null) s.chaos = p.chaos;
    saveSettingsDebounced(); saveChatCfg();
    paintProfiles(); paintPicks(); buildPrompt();
    log('info', 'профиль «' + name + '»');
}

function paintProfiles(sel = '#pv_profiles', hintSel = '#pv_prof_hint') {
    const box = $(sel);
    if (!box.length) return;
    box.empty();
    for (const name of Object.keys(PROFILES)) {
        $('<div class="pv-chip"></div>').text(name).toggleClass('on', S().profile === name)
            .on('click', () => { applyProfile(name); if (sel !== '#pv_profiles') paintProfiles(sel, hintSel); })
            .appendTo(box);
    }
    $(hintSel).text(profHint());
}

function chatKey() {
    const id = SillyTavern.getContext()?.chatId || SillyTavern.getContext()?.characterId || '';
    return id ? 'pv_chat_' + id : '';
}

const CHAT_KEYS = ['gain', 'smooth', 'idleLevel', 'tone', 'brain', 'profile', 'deny', 'chaos'];

function saveChatCfg() {
    const s = S(), k = chatKey();
    if (!s.perChat || !k) return;
    const v = {};
    for (const key of CHAT_KEYS) v[key] = s[key];
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ }
}

function loadChatCfg() {
    const s = S(), k = chatKey();
    if (!s.perChat || !k) return false;
    let v = null;
    try { v = JSON.parse(localStorage.getItem(k) || 'null'); } catch { v = null; }
    if (!v) return false;
    for (const key of CHAT_KEYS) if (v[key] !== undefined) s[key] = v[key];
    saveSettingsDebounced();
    paintProfiles(); paintPicks(); paintBrainBoxes(); buildPrompt();
    log('info', 'настройки этого чата подхвачены');
    return true;
}

function paintChatNote() {
    $('#pv_chat_note').text(S().perChat
        ? 'запоминаю характер для этого чата'
        : 'с одним персонажем можно жёстче, с другим нежнее');
}

// Список игрушек — показываем, только когда их больше одной.
function paintDevs() {
    const box = $('#pv_devs');
    if (!box.length) return;
    const names = allDeviceNames();
    box.empty();
    if (names.length < 2) return;
    const s = S();
    if (!s.devOff) s.devOff = {};
    box.append('<div class="pv-pick">кто участвует</div>');
    for (const n of names) {
        const row = $('<label class="checkbox_label"></label>');
        const cb = $('<input type="checkbox">').prop('checked', !s.devOff[n]);
        cb.on('change', function () {
            s.devOff[n] = !$(this).prop('checked');
            toyToldAt = 0;
            saveSettingsDebounced(); buildPrompt(); paintStatus();
        });
        row.append(cb).append($('<span></span>').text(n)).appendTo(box);
    }
}

/* Что это за игрушка: угаданное по названию и выбор руками. Перерисовываем,
   только когда что-то поменялось, — иначе открытый список закрывался бы. */
let kindsSig = '';
function paintKinds() {
    const box = $('#pv_kinds');
    if (!box.length) return;
    const caps = connected ? toyCaps() : null;
    const list = caps && caps.known ? caps.kinds : [];
    const sig = JSON.stringify(list);
    if (sig === kindsSig) return;
    kindsSig = sig;
    if (!list.length) { box.empty(); return; }
    const s = S();
    if (!s.toyKind) s.toyKind = {};

    const сохранить = (p, k, air) => {
        if (k === null) delete s.toyKind[p.name];
        else s.toyKind[p.name] = { k, air };
        saveSettingsDebounced(); toyToldAt = 0; kindsSig = '';
        buildPrompt(); paintStatus();
    };

    box.html('<div class="pv-pick">что это за игрушка</div>' +
        '<small class="notes">Intiface знает только моторы, а форму — нет. Персонаж будет описывать игрушку такой, какая она здесь.</small>');
    for (const p of list) {
        const первая = !p.auto ? 'угадать по названию заново' : p.k ? 'угадала: ' + TOY_KINDS[p.k].ru : 'не узнала — выбери, какая';
        const sel = $('<select class="text_pole"></select>').append($('<option value=""></option>').text(первая));
        for (const k of Object.keys(TOY_KINDS)) {
            sel.append($('<option></option>').attr('value', k).text(TOY_KINDS[k].ru).prop('selected', !p.auto && p.k === k));
        }
        // форму сменили — воздух оставляем таким, какой сейчас виден
        sel.on('change', function () { сохранить(p, $(this).val() || null, p.air); });
        const air = $('<label class="checkbox_label"><input type="checkbox"><span>Работает воздухом (вакуум)</span></label>');
        air.find('input').prop('checked', p.air).on('change', function () { сохранить(p, p.k, $(this).prop('checked')); });
        box.append($('<div class="pv-devsub" style="margin-top:6px"></div>').text(p.name))
            .append(sel).append(air)
            .append($('<small class="notes"></small>').text(passportText(p) || 'персонаж узнает только, что игрушка подключена'));
    }
}

/* ═══ предпочтения и ритм в панели ═══ */

function fetChips(list, del) {
    if (!list.length) return '<small class="notes">пока пусто</small>';
    return list.map((x, i) => `<span class="pv-fchip" data-i="${i}">${esc(x.emoji)} ${esc(x.name)}${del ? ' ✕' : ''}</span>`).join('');
}

function paintFetish() {
    const s = S();
    $('#pv_fet_hername').text(NAMES.char);
    $('#pv_fet_minename').text(NAMES.user);

    const her = $('#pv_fet_her');
    if (her.length) {
        her.html(fetChips(charFetishes(), true));
        her.find('.pv-fchip').on('click', function () {
            const i = +$(this).attr('data-i');
            const arr = charFetishes().slice();
            arr.splice(i, 1);
            s.fetChar[chatFetKey()] = arr;
            saveSettingsDebounced(); paintFetish(); buildPrompt();
        });
    }
    $('#pv_fet_mine').html(fetChips(ownFetishes(), false));

    const box = $('#pv_fet_live');
    if (!box.length) return;
    if (!F.cards || !F.cards.length) {
        box.html('<small class="notes">Когда в ответе сработает триггер, он появится здесь.</small>');
        return;
    }
    // Карточки пишет модель — всё экранируем.
    box.html(`<small class="notes">сейчас в сцене · сила ${F.intensity || 0}/5</small>` +
        '<div class="pv-fcards">' + F.cards.slice(0, 4).map((c) =>
            `<div class="pv-fcard"><b>${esc(c.emoji)} ${esc(c.name)}</b><span>${esc(c.what)}</span><i>⚡ ${esc(c.trig)}</i></div>`).join('') +
        '</div>');
}

function paintQPrev() {
    const box = $('#pv_qprev');
    const q = S().queue || [];
    if (!q.length) { box.empty(); return; }
    const всего = q.reduce((a, x) => a + (+x.sec || 0), 0) || 1;
    box.html(q.map((x) => {
        const h = Math.max(6, Math.round(clamp(x.v, 0, 20) / 20 * 100));
        const w = Math.max(4, Math.round((+x.sec || 0) / всего * 100));
        return `<i style="height:${h}%;flex:${w} 0 auto"></i>`;
    }).join('') + `<small class="notes" style="margin-left:6px;white-space:nowrap">круг ${секстр(всего)}</small>`);
}

function paintQueue() {
    const s = S();
    if (!s.queue) s.queue = [];
    const box = $('#pv_queue');
    if (!box.length) return;
    box.empty();
    s.queue.forEach((q, i) => {
        const row = $('<div class="pv-qrow"></div>');
        row.append(`<span class="pv-qnum">ступенька ${i + 1}</span>`);
        const sl = $(`<input type="range" min="0" max="20" value="${q.v}" class="pv-range">`);
        const val = $(`<b class="pv-qval">${q.v}/20</b>`);
        const sec = $(`<input class="text_pole pv-qsec" value="${q.sec}" inputmode="numeric">`);
        sl.on('input', function () {
            s.queue[i].v = clamp($(this).val(), 0, 20);
            val.text(s.queue[i].v + '/20');
            saveSettingsDebounced(); paintQCode(); paintQPrev();
        });
        sec.on('input', function () {
            s.queue[i].sec = clamp(parseInt($(this).val(), 10) || 0, 0, 600);
            saveSettingsDebounced(); paintQCode(); paintQPrev();
        });
        const del = $('<span class="pv-qdel" title="убрать">✕</span>').on('click', () => {
            s.queue.splice(i, 1); saveSettingsDebounced(); paintQueue();
        });
        row.append(sl).append(val).append(sec).append('<span class="notes">сек</span>').append(del);
        box.append(row);
    });
    if (!s.queue.length) box.html('<small class="notes">Пусто. «+ ступенька» — и задай силу и сколько секунд её держать.</small>');
    paintQCode(); paintQPrev();
}

function paintQCode() {
    const f = $('#pv_q_code');
    if (f.length && !f.is(':focus')) f.val(rhythmCode());
}

function paintPat() {
    const s = S();
    const box = $('#pv_presets');
    box.empty();
    for (const name of Object.keys(PRESETS)) {
        $('<div class="pv-chip"></div>').text(name).toggleClass('on', s.patLast === name)
            .on('click', () => playPattern(name)).appendTo(box);
    }
    $('#pv_pat_what').html(s.patLast && PRESET_WHAT[s.patLast]
        ? `<b>${esc(s.patLast)}</b> — ${esc(PRESET_WHAT[s.patLast])}`
        : 'нажми любой — здесь появится, что именно почувствуешь');
    const sec = clamp(s.patSec, 30, 300);
    $('#pv_patsec').val(sec);
    $('#pv_patsec_v').text(секстр(sec));
    $('#pv_patloop').prop('checked', !!s.patLoop);
    $('#pv_patloop_note').text(s.patLoop
        ? 'и готовые, и свои — по кругу до СТОП'
        : 'один раз, потом сцену снова ведёт персонаж');
}

function playPattern(name) {
    const s = S();
    if (!connected) { toastr.info('сначала подключи игрушку'); return; }
    s.patLast = name; saveSettingsDebounced();
    const sec = clamp(s.patSec, 30, 300);
    // Паттерн выбран рукой — играем ровно его: без своеволия и отказов на пике.
    sinkProgram(makePreset(name, capLevel(), sec), { exact: true, mine: true, loop: !!s.patLoop });
    log('pat', `паттерн «${name}» · ${секстр(sec)}${s.patLoop ? ' по кругу' : ', один раз'}`);
    paintPat();
}

function playQueue() {
    const s = S();
    const steps = queueSteps();
    if (!steps.length) { toastr.info('ступенек пока нет'); return; }
    if (!connected) { toastr.info('сначала подключи игрушку'); return; }
    sinkProgram(steps, { exact: true, mine: true, loop: !!s.patLoop });
    const всего = (s.queue || []).reduce((a, q) => a + (+q.sec || 0), 0);
    log('queue', `свой ритм: ${steps.length} ступ. · круг ${секстр(всего)}${s.patLoop ? ' по кругу' : ', один раз'}`);
}

const TRANSPORT_NOTE = {
    bridge: 'Программу крутит сервер Таверны: вкладку можно свернуть или открыть Таверну с телефона — игрушка продолжит. ' +
        'Нужен файл pusya-vibe-bridge.mjs в папке plugins/ и enableServerPlugins: true в config.yaml.',
    direct: 'Всё держится на этой вкладке: свернёшь или закроешь — игрушка затихнет. Ставить ничего не нужно.',
    lovense: 'Lovense Remote → Game Mode. Команды идут через мост Таверны, поэтому мост тоже нужен.',
};

function paintTransport() {
    const s = S();
    $('#pv_transport').val(s.transport);
    $('#pv_wsbox').toggle(s.transport !== 'lovense');
    $('#pv_lvbox').toggle(s.transport === 'lovense');
    $('#pv_transport_note').text(TRANSPORT_NOTE[s.transport] || '');
}

function startPolling() {
    if (poller) return;
    poller = setInterval(async () => {
        if (S().transport !== 'bridge' || !S().enabled) return;
        try {
            const j = await api('/status');
            const wasKnown = toyCaps().known;
            const было = connected;
            connected = !!j.connected;
            devices = j.devices || [];
            toys = j.toys || [];
            statusNote = connected ? capsNote(j.server) : (j.info || 'не подключено');
            live = j.live || live;
            if (было && !connected) log('conn', 'мост потерял Intiface');
            // Твоя программа доиграла на мосту — снимаем метку, иначе живой отклик
            // остался бы заблокированным до самого СТОП.
            if (mineNow && !j.steps && !j.manual) { mineNow = false; log('pat', 'отыграло — сцену снова ведёт персонаж'); }
            paintStatus(); paintMeter();
            // игрушка доехала уже после подключения — обновляем инструкцию персонажу
            if (!wasKnown && toyCaps().known) { toyToldAt = 0; buildPrompt(); }
        } catch { /* мост молчит — покажется при следующем действии */ }
    }, 3000);
}

async function doConnect(quiet) {
    statusNote = 'подключаюсь…'; paintStatus();
    try {
        const ok = await sinkConnect();
        if (ok) toyToldAt = 0;
        paintStatus(); buildPrompt();
        log(ok ? 'conn' : 'err', ok ? 'подключено: ' + statusNote : 'не вышло: ' + statusNote);
        if (!quiet) (ok ? toastr.success : toastr.error)('PUSYA VIBE: ' + statusNote);
        return ok;
    } catch (e) {
        connected = false; statusNote = e.message; paintStatus();
        log('err', 'ошибка: ' + e.message);
        if (!quiet) toastr.error('PUSYA VIBE: ' + e.message);
        return false;
    }
}

function testToy() {
    if (!connected) { toastr.info('сначала подключи игрушку'); return; }
    const top = Math.min(12, capLevel());
    sinkProgram([step({ v: 3, to: { v: top } }, 2), step({ v: top }, 1), step({ v: 0 }, 0.3)], { exact: true, mine: true, loop: false });
    log('test', 'тест 3 сек');
}

/* ═══════════════ анонимный пульс для дашборда ═══════════════ */
/* Сервер Пуси считает, сколько панелей открыто прямо сейчас. Расширение
   интимное, поэтому уходит только «vibe, anon, версия» — ни ника, ни
   настроек, ни предпочтений, ни названия игрушки. */
function startHeartbeat() {
    if (window.__pv_stand) return;           // на проверочном стенде живым человеком не считаемся
    const beat = () => {
        try {
            fetch('https://pussyagerl.duckdns.org/api/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plugin: 'vibe', nick: 'anon', version: PV_VERSION, data: {} }),
            }).catch(() => {});
        } catch { /* сети нет — не страшно */ }
    };
    setTimeout(beat, 5000);
    setInterval(beat, 5 * 60 * 1000);
}

/* ═══════════════ мастер первого входа ═══════════════
   Окошки по одному делу в каждом. Кнопка «дальше» на шаге со связью ждёт,
   пока связь действительно встанет. */

const WIZ_IMG = {
    download: BASE + 'img/download.jpg',
    engine: BASE + 'img/engine.jpg',
    scan: BASE + 'img/scan.jpg',
};

// Где мост лежит на диске после установки: папка расширения называется по репозиторию.
function bridgeLocalPath() {
    const папка = decodeURIComponent((BASE.match(/third-party\/([^/]+)\/?$/) || [])[1] || 'SillyTavern-PusyaVibe');
    return 'SillyTavern/data/default-user/extensions/' + папка + '/bridge/pusya-vibe-bridge.mjs';
}

function wizImg(имя, подпись) {
    const src = WIZ_IMG[имя];
    if (!src) return '';
    return `<img class="pv-wz-img" src="${src}" alt="" onerror="this.style.display='none'">` +
        (подпись ? `<div class="pv-wz-cap">${esc(подпись)}</div>` : '');
}

let wizStep = 0, wizShown = false, bridgeCheck = '';

function wizChips(id, items, get, set) {
    return `<div class="pv-chips" data-wzchips="${id}">` +
        items.map((x) => `<div class="pv-chip${get() === x.v ? ' on' : ''}" data-wzpick="${id}" data-v="${esc(x.v)}">${esc(x.t)}</div>`).join('') +
        '</div>';
}

const WIZ = [
    {
        t: 'Что понадобится',
        body: () => '<div class="pv-wz-lead">Настроим один раз — дальше расширение цепляется само.</div>' +
            '<ul class="pv-ol">' +
            '<li><b>Игрушка с Bluetooth.</b> Почти любая: Satisfyer, We-Vibe, Lovense, Kiiroo и ещё сотня.</li>' +
            '<li><b>Intiface Central</b> — бесплатное приложение для Windows, Mac, Linux, Android и iPhone. Оно говорит с игрушкой по Bluetooth, Таверна сама этого не умеет.</li>' +
            '<li><b>Мост</b> — по желанию, файл <code>pusya-vibe-bridge.mjs</code>. С ним игрушка играет, даже когда вкладка свёрнута. Про него — через пару шагов.</li>' +
            '</ul>' +
            wizImg('download', 'intiface.com — выбери своё устройство') +
            '<div class="pv-wz-note">Нет игрушки под рукой? Можно пройти позже — кнопка «Настроить по шагам» останется в меню.</div>',
    },
    {
        t: 'Где будет Intiface',
        body: () => {
            const s = S();
            return '<div class="pv-wz-lead">Bluetooth бьёт на пару метров, поэтому Intiface ставится туда, что <b>физически рядом с игрушкой</b>.</div>' +
                wizChips('iface', [{ v: 'here', t: 'на компьютере с Таверной' }, { v: 'other', t: 'на другом устройстве' }], () => s.ifaceOn, null) +
                '<div class="pv-wz-note">' + (s.ifaceOn === 'other'
                ? 'Телефон или второй компьютер в той же Wi-Fi. Понадобится его адрес в сети — покажу где.'
                : 'Самый простой путь: адрес <b>127.0.0.1</b>, в сети ничего настраивать не нужно.') + '</div>';
        },
        pick: { iface: (v) => { const s = S(); s.ifaceOn = v; if (v === 'here' && !/^wss?:\/\/(127\.0\.0\.1|localhost)/.test(s.ws || '')) s.ws = 'ws://127.0.0.1:12345'; } },
    },
    {
        t: 'Запусти движок',
        body: () => {
            const другое = S().ifaceOn === 'other';
            return '<div class="pv-wz-lead">Открой Intiface Central ' + (другое ? '<b>на том устройстве</b>' : 'на этом компьютере') + ' и нажми большую <b>▶</b>.</div>' +
                wizImg('engine', 'вот эта ▶ — после нажатия статус станет Engine running (на компьютере выглядит так же)') +
                (другое
                    ? '<div class="pv-wz-note">Чтобы Таверна достучалась, в настройках Intiface включи <b>«Listen on all network interfaces»</b> — по умолчанию он слушает только сам себя. ' +
                      'Там же посмотри <b>порт</b> (обычно 12345) и узнай <b>IP этого устройства</b> в локальной сети.</div>' +
                      '<div class="pv-wz-note">На телефоне Intiface просит разрешения: на Android — «Устройства поблизости» и «Местоположение», на iPhone — Bluetooth и «Локальная сеть». Статус сразу падает обратно — значит, разрешений не дали.</div>'
                    : '<div class="pv-wz-note">На компьютере разрешения спрашивать не нужно — достаточно, чтобы в системе был включён Bluetooth.</div>');
        },
    },
    {
        t: 'Найди игрушку',
        body: () => '<div class="pv-wz-lead">Включи игрушку и <b>полностью закрой её родное приложение</b> — она слушается только одного хозяина. Потом в Intiface: <b>Devices → Start Scanning</b>.</div>' +
            wizImg('scan', 'так должно быть: Engine running, у игрушки зелёный значок Bluetooth') +
            '<div class="pv-wz-note">⚠️ <b>Satisfyer</b> — исключение: его нужно сначала спарить в системном Bluetooth того устройства, где стоит Intiface. Остальные бренды, наоборот, парить не надо.</div>' +
            '<details style="margin-top:8px"><summary>Satisfyer виден, но не подключается</summary>' +
            '<ol class="pv-ol">' +
            '<li><b>Отвяжи его от прежнего хозяина.</b> Satisfyer помнит только одно устройство. Закрой Satisfyer Connect на телефоне, а в его Bluetooth нажми «Забыть это устройство».</li>' +
            '<li><b>Сбрось игрушку:</b> зажми кнопку сброса из инструкции на 10 секунд. Сброс прошёл, если она дала <b>3 вибрации, а потом 5 быстрых импульсов</b>.</li>' +
            '<li><b>Windows 11 прячет её в списке.</b> Параметры → Bluetooth и устройства → Устройства → «Обнаружение устройств Bluetooth» → <b>«Расширенный»</b>. Потом «Добавить устройство» — она будет называться <b>SF …</b> или «Неизвестное устройство».</li>' +
            '</ol>' +
            '<div class="pv-wz-note">В логе Intiface это выглядит как «found» и сразу «NotConnected» по кругу. Отдельный Bluetooth-донгл нужен, только если после всех трёх шагов не помогло.</div>' +
            '</details>' +
            '<div class="pv-wz-note">Если игрушки нет в списке у самого Intiface — идти дальше бессмысленно: расширение видит ровно то же.</div>',
    },
    {
        t: 'Как Таверна будет говорить с Intiface',
        body: () => {
            const s = S();
            let h = wizChips('tr', [
                { v: 'bridge', t: 'через мост' },
                { v: 'direct', t: 'напрямую из браузера' },
                { v: 'lovense', t: 'Lovense Remote' },
            ], () => s.transport, null);
            if (s.transport === 'bridge' || s.transport === 'lovense') {
                h += '<div class="pv-wz-note">' + esc(TRANSPORT_NOTE[s.transport]) + '</div>' +
                    '<ol class="pv-ol">' +
                    '<li>Файл моста уже скачан вместе с расширением, но Таверна запускает серверные части только из папки <code>plugins/</code>. ' +
                    'В терминале в папке SillyTavern: <code>npm run plugins:install</code> и ссылка на репозиторий расширения. ' +
                    'Или скопируй вручную <code>' + esc(bridgeLocalPath()) + '</code> в <code>SillyTavern/plugins/</code>.</li>' +
                    '<li>В <code>config.yaml</code> поставь <code>enableServerPlugins: true</code>.</li>' +
                    '<li>Перезапусти Таверну — в консоли появится «мост готов».</li>' +
                    '</ol>' +
                    '<div class="pv-row"><input class="menu_button" type="button" data-wz="bridge" value="Проверить мост" /></div>' +
                    (bridgeCheck ? '<div class="pv-wz-state">' + bridgeCheck + '</div>' : '');
            } else {
                h += '<div class="pv-wz-note">' + esc(TRANSPORT_NOTE.direct) + '</div>' +
                    '<div class="pv-wz-note">Если Таверна открыта по <b>https</b>, браузер может не пустить незащищённый <b>ws://</b>. Тогда выбери мост.</div>';
            }
            return h;
        },
        pick: {
            tr: (v) => {
                const s = S();
                if (s.transport === 'direct') Direct.disconnect();
                s.transport = v; connected = false; devices = []; statusNote = 'не подключено'; bridgeCheck = '';
                paintTransport(); paintStatus();
            },
        },
    },
    {
        t: 'Свяжемся с ней',
        body: () => {
            const s = S();
            const строка = connected ? `<b style="color:#8fd6a4">✓ подключено: ${esc(toyCaps().names.join(', ') || 'игрушка')}</b>`
                : statusNote === 'подключаюсь…' ? 'подключаюсь…'
                    : statusNote && statusNote !== 'не подключено' ? `<b style="color:#f0a0a0">${esc(statusNote)}</b>` : 'ещё не пробовали';
            const адрес = s.transport === 'lovense'
                ? '<div class="pv-row"><input class="text_pole" data-wzin="lvIp" placeholder="127.0.0.1"><input class="text_pole" style="max-width:90px" data-wzin="lvPort" placeholder="20010"></div>'
                : '<input class="text_pole" data-wzin="ws" placeholder="ws://127.0.0.1:12345">';
            return '<div class="pv-wz-lead">Теперь пусть расширение найдёт ' + (s.transport === 'lovense' ? 'Lovense Remote' : 'Intiface') + '.</div>' +
                '<small>адрес</small>' + адрес +
                '<div class="pv-wz-state">' + строка + '</div>' +
                `<div class="pv-row"><input class="menu_button" type="button" data-wz="conn" value="${connected ? 'Переподключить' : 'Подключить'}" /></div>` +
                (s.transport !== 'lovense' && s.ifaceOn === 'other'
                    ? '<div class="pv-wz-note">Intiface на другом устройстве — впиши <b>ws://IP-устройства:12345</b>. IP виден в самом Intiface или в настройках Wi-Fi.</div>'
                    : s.transport === 'bridge'
                        ? '<div class="pv-wz-note">С мостом адрес считается <b>от сервера Таверны</b>: 127.0.0.1 — это компьютер, где она запущена, даже если сама Таверна открыта с телефона.</div>'
                        : '');
        },
        ok: () => connected,
        нельзя: 'сначала подключись — или пропусти шаг',
    },
    {
        t: 'Проверим',
        body: () => '<div class="pv-wz-lead">Короткий тест: игрушка должна плавно раскрутиться и затихнуть.</div>' +
            '<div class="pv-row"><input class="menu_button" type="button" data-wz="test" value="Тест 3 секунды" /></div>' +
            '<div class="pv-wz-note">Тихо? Потяни ползунок в самом Intiface. Не вибрирует и там — дело в игрушке: заряд, сон или родное приложение всё ещё держит её.</div>',
    },
    {
        t: 'Границы и главный переключатель',
        body: () => {
            const s = S();
            return '<div class="pv-wz-lead">То, что останавливает игрушку. Поставь по себе — потом это в «Настройки → Границы».</div>' +
                '<div class="pv-pick">потолок силы</div>' +
                wizChips('cap', [{ v: 5, t: 'еле-еле' }, { v: 10, t: 'мягко' }, { v: 14, t: 'средне' }, { v: 17, t: 'сильно' }, { v: 20, t: 'на полную' }], () => ближайший([5, 10, 14, 17, 20].map((v) => ({ v })), s.cap), null) +
                '<div class="pv-pick">автостоп</div>' +
                wizChips('max', [{ v: 10, t: '10 мин' }, { v: 20, t: '20 мин' }, { v: 45, t: '45 мин' }, { v: 0, t: 'без автостопа' }], () => ближайший([10, 20, 45, 0].map((v) => ({ v })), s.maxMinutes), null) +
                '<div class="pv-pick">стоп-слово — напишешь его, и всё остановится</div>' +
                '<input class="text_pole" data-wzin="safeword" placeholder="стоп">' +
                '<div class="pv-wz-state">' + (s.enabled
                    ? '<b style="color:#8fd6a4">✓ «Персонаж ведёт игрушку» включено — всё готово</b>'
                    : '<b style="color:#f0cf9e">⚠ «Персонаж ведёт игрушку» выключено — сцена игрушку не тронет</b>' +
                      '<div class="pv-row"><input class="menu_button" type="button" data-wz="enable" value="Включить" /></div>') +
                '</div>';
        },
        pick: {
            cap: (v) => { S().cap = +v; buildPrompt(); },
            max: (v) => { S().maxMinutes = +v; },
        },
    },
    {
        t: 'Готово',
        body: () => '<div class="pv-wz-lead">Осталось выбрать характер — всё остальное встанет само.</div>' +
            '<div class="pv-chips" id="pv_wz_prof"></div>' +
            '<div class="pv-wz-note" id="pv_wz_profhint"></div>' +
            '<div class="pv-wz-note">Дальше просто играй: расширение читает сцену само, ни тегов, ни правок в пресете не нужно.</div>' +
            '<div class="pv-row"><input class="menu_button" type="button" data-wz="tour" value="Показать саму панель" /></div>' +
            `<div class="pv-wz-note">экскурсия по всем разделам: ${TOUR.length} указателей по настоящим кнопкам</div>`,
        после: () => paintProfiles('#pv_wz_prof', '#pv_wz_profhint'),
    },
];

function openWiz(с) {
    wizShown = true;
    wizStep = с || 0;
    let back = $('#pv_wz');
    if (!back.length) {
        back = $('<div class="pv-wz-back" id="pv_wz"><div class="pv-wz-card"><div class="pv-wz-top"></div><div class="pv-wz-body"></div><div class="pv-wz-foot"></div></div></div>');
        $('body').append(back);
        back.on('click', '[data-wz]', function () { wizDo($(this).attr('data-wz'), $(this)); });
        back.on('click', '[data-wzpick]', function () {
            const ш = WIZ[wizStep], id = $(this).attr('data-wzpick'), v = $(this).attr('data-v');
            if (ш.pick && ш.pick[id]) { ш.pick[id](v); saveSettingsDebounced(); paintStatus(); paintWiz(true); }
        });
        back.on('input', '[data-wzin]', function () {
            const k = $(this).attr('data-wzin');
            S()[k] = $(this).val(); saveSettingsDebounced();
            if (k === 'ws') $('#pv_ws').val(S().ws);
            if (k === 'lvIp') $('#pv_lvip').val(S().lvIp);
            if (k === 'lvPort') $('#pv_lvport').val(S().lvPort);
            if (k === 'safeword') { $('#pv_safeword').val(S().safeword); paintStatus(); }
        });
    }
    back.show();
    paintWiz(true);
}

// Связь поменялась — окошко со связью должно это показать. Остальные не трогаем.
function wizRefresh() {
    if (!$('#pv_wz').is(':visible')) return;
    if (WIZ[wizStep] && (WIZ[wizStep].ok || /Границы/.test(WIZ[wizStep].t))) paintWiz(false);
}

function paintWiz(сила) {
    const back = $('#pv_wz');
    if (!back.length) return;
    // пока она печатает адрес, перерисовывать нельзя — потеряется ввод
    if (!сила && back.find('input[data-wzin]').is(':focus')) return;
    wizStep = clamp(wizStep, 0, WIZ.length - 1);
    const ш = WIZ[wizStep], последний = wizStep === WIZ.length - 1;
    let точки = '';
    for (let i = 0; i < WIZ.length; i++) точки += `<i class="${i <= wizStep ? 'on' : ''}"></i>`;
    back.find('.pv-wz-top').html(`<div class="pv-wz-dots">${точки}</div>` +
        `<div class="pv-wz-num">шаг ${wizStep + 1} из ${WIZ.length}</div>` +
        `<div class="pv-wz-title">${esc(ш.t)}</div>`);
    const body = back.find('.pv-wz-body');
    body.html(ш.body());
    body.find('[data-wzin]').each(function () { $(this).val(S()[$(this).attr('data-wzin')] || ''); });
    if (ш.после) ш.после();
    const можно = !ш.ok || ш.ok();
    back.find('.pv-wz-foot').html('<div class="pv-row">' +
        (wizStep > 0 ? '<input class="menu_button" type="button" data-wz="back" value="Назад" />' : '') +
        `<input class="menu_button" type="button" data-wz="next" value="${последний ? 'Готово' : 'Дальше'}" />` +
        '</div>' +
        (можно ? '' : `<div class="pv-wz-note" style="text-align:center">${esc(ш.нельзя || '')}</div>`) +
        '<div class="pv-row"><input class="menu_button" type="button" data-wz="skip" value="Пропустить настройку" /></div>');
}

async function wizDo(что, кнопка) {
    const s = S();
    if (что === 'back') { wizStep--; paintWiz(true); return; }
    if (что === 'skip') { wizFinish(false); return; }
    if (что === 'next') {
        const ш = WIZ[wizStep];
        if (ш.ok && !ш.ok()) toastr.info(ш.нельзя || 'ещё не готово');
        if (wizStep >= WIZ.length - 1) { wizFinish(true); return; }
        wizStep++; paintWiz(true); return;
    }
    if (что === 'conn') {
        кнопка.prop('disabled', true).val('…');
        await doConnect(true);
        paintWiz(true);
        return;
    }
    if (что === 'bridge') {
        bridgeCheck = 'проверяю…'; paintWiz(true);
        try {
            await api('/status');
            bridgeCheck = '<b style="color:#8fd6a4">✓ мост отвечает</b>';
        } catch (e) {
            bridgeCheck = `<b style="color:#f0a0a0">${esc(e.message)}</b>`;
        }
        paintWiz(true);
        return;
    }
    if (что === 'test') { testToy(); return; }
    if (что === 'enable') {
        s.enabled = true; saveSettingsDebounced();
        $('#pv_enabled').prop('checked', true);
        buildPrompt(); paintStatus(); paintWiz(true);
        return;
    }
    if (что === 'tour') { wizFinish(true); setTimeout(startTour, 200); }
}

function wizFinish(дошла) {
    const s = S();
    s.wizDone = true; saveSettingsDebounced();
    $('#pv_wz').hide();
    paintTransport();
    $('#pv_cap').val(s.cap); $('#pv_cap_v').text(s.cap);
    $('#pv_max').val(s.maxMinutes); $('#pv_max_v').text(s.maxMinutes ? s.maxMinutes + ' мин' : 'нет');
    showPane('home');
    if (дошла) log('info', 'настройка пройдена');
}

/* ═══════════════ экскурсия по панели ═══════════════
   Кольцо вокруг настоящего блока и облачко рядом. Для Intiface и моста
   остаются окошки мастера — их пальцем в Таверне не покажешь. */

const TOUR = [
    { sel: '#pv_enabled', up: 'label', где: 'home', t: 'Главный переключатель',
        s: 'Галочка стоит — игрушку ведёт персонаж: расширение читает сцену и крутит её само. Снята — игрушка слушается только тебя.' },
    { sel: '#pv_stop', up: '.pv-row', где: 'home', t: 'СТОП',
        s: 'Гасит всё мгновенно и из любого раздела. «Тест» рядом — короткая проверка, что игрушка жива.' },
    { sel: '#pv_p_home .pv-menu', где: 'home', t: 'Отсюда попадаешь всюду',
        s: 'Четыре раздела, у каждого написано, что внутри. Вернуться — кнопкой «↩ меню» внизу раздела.' },
    { sel: '#pv_warn .pv-warn', где: 'home', t: 'Если что-то мешает',
        s: 'Здесь появится причина, по которой игрушка молчит. По плашке можно нажать — попадёшь туда, где это чинится.' },
    { sel: '#pv_graph', up: '.pv-sec', где: 'play', t: 'Как идёт сцена',
        s: 'Последние полторы минуты одним взглядом: где было тихо, где пик. Шкала везде одна — от 0 до 20.' },
    { sel: '#pv_profiles', up: '.pv-sec', где: 'play', t: 'Характер',
        s: 'Общий тон игры одним касанием. Под кнопками словами написано, как играет выбранный.' },
    { sel: '#pv_play', up: '.pv-sec', где: 'play', t: 'Что играло',
        s: 'Дорожка игры: какие паттерны и ступеньки играли, что расширение услышало в сцене. Свежее сверху.' },
    { sel: '#pv_presets', up: '.pv-sec', где: 'rhythm', t: 'Готовые',
        s: 'Нажала рисунок — играет он, персонаж не вмешивается. Ниже — сколько играть и по кругу ли.' },
    { sel: '#pv_queue', up: '.pv-sec', где: 'rhythm', t: 'Свои',
        s: 'Собираешь сама из ступенек: у каждой сила и сколько её держать. «+ ступенька» — добавить, «Играть» — запустить.' },
    { sel: '#pv_q_code', up: '.pv-sec', где: 'rhythm', t: 'Поделиться',
        s: 'Свои ступеньки превращаются в короткий код. Скопировала, отправила — подруга вставит и получит то же самое.' },
    { sel: '#pv_fet_her', up: '.pv-sec', где: 'fet', t: 'Что заводит',
        s: 'Сверху — персонажа: из карточки или из чата. Ниже — твои, через запятую. Лишнее у персонажа убирается нажатием.' },
    { sel: '#pv_fet_what', где: 'fet', t: 'Что с ними делать',
        s: 'Можно тихо подсказывать модели вплетать их в текст. И можно, чтобы игрушка поддавала, когда такое мелькнуло в сцене.' },
    { sel: '#pv_sec_toy', где: 'set', t: 'Игрушка',
        s: 'Способ связи и адрес, какие игрушки участвуют и что это за игрушка. Здесь же настройка и эта экскурсия заново.' },
    { sel: '#pv_sec_brain', где: 'set', t: 'Кто ведёт сцену',
        s: 'Расширение само по словам или отдельная модель. Ниже — слушаться ли команд персонажа, не торопить ли сцену и рассказывать ли персонажу про игрушку.' },
    { sel: '#pv_sec_bounds', где: 'set', t: 'Границы',
        s: 'Потолок силы, автостоп и стоп-слово. Их лучше выставить до первой сцены.' },
    { sel: '#pv_sec_char', где: 'set', t: 'Характер игры',
        s: 'То же, что профиль, но по отдельности: громкость, отказ на пике, своеволие. Профиль переставляет их все сразу.' },
    { sel: '#pv_sec_behave', где: 'set', t: 'Поведение',
        s: 'Мелочи на один раз: отклик на твои сообщения, повтор до ответа, плавность и фон между сценами.' },
    { sel: '#pv_sec_log', где: 'set', t: 'Что происходило',
        s: 'Связь, ошибки, заряд — ошибки подсвечены красным. Игра здесь одной строкой, подробно она в «Сейчас».' },
];

const TOUR_РАЗДЕЛ = { home: 'Меню', play: 'Сейчас', rhythm: 'Поиграть', fet: 'Предпочтения', set: 'Настройки' };
let tourStep = -1;

function tourTarget(ш) {
    const x = $(ш.sel).first();
    if (!x.length) return null;
    return ш.up ? (x.closest(ш.up)[0] || x[0]) : x[0];
}

function startTour() {
    // экскурсия ходит по настоящей панели — она должна быть раскрыта
    const content = $('#pv_root .inline-drawer-content');
    if (content.length && !content.is(':visible')) $('#pv_root .inline-drawer-toggle').trigger('click');
    tourStep = 0;
    if (!$('#pv_bubble').length) {
        $('body').append('<div class="pv-bubble" id="pv_bubble"></div>');
        $('#pv_bubble').on('click', '[data-tr]', function () {
            const что = $(this).attr('data-tr');
            if (что === 'end') endTour();
            else tourGo(что === 'back' ? -1 : 1);
        });
        $(window).on('resize', () => placeBubble());
    }
    paintTour();
}

function endTour() {
    tourStep = -1;
    $('.pv-tour-on').removeClass('pv-tour-on');
    $('#pv_bubble').hide();
    S().tourDone = true; saveSettingsDebounced();
    showPane('home');
}

// Есть ли сейчас на что показывать: раздел открываем, иначе блок спрятан.
function tourHere(i) {
    const ш = TOUR[i];
    if (!ш) return false;
    showPane(ш.где);
    return !!tourTarget(ш);
}

function tourGo(шаг) {
    if (tourStep < 0) return;                        // экскурсия уже закончилась
    let i = tourStep + шаг;
    // шаг неуместен (например, плашки «что мешает» сейчас нет) — перескакиваем в ту же сторону
    while (i >= 0 && i < TOUR.length && !tourHere(i)) i += шаг;
    if (i >= TOUR.length) { endTour(); toastr.info('всё, дальше сама'); return; }
    if (i < 0) i = tourStep;                         // назад некуда — остаёмся
    tourStep = i;
    paintTour();
}

function paintTour() {
    if (tourStep < 0) return;
    while (tourStep < TOUR.length && !tourHere(tourStep)) tourStep++;
    const ш = TOUR[tourStep];
    if (!ш) { endTour(); return; }
    $('.pv-tour-on').removeClass('pv-tour-on');
    const цель = tourTarget(ш);
    $(цель).addClass('pv-tour-on');
    try { цель.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { цель.scrollIntoView(); }

    const последний = tourStep === TOUR.length - 1;
    $('#pv_bubble').html(
        `<div class="pv-wz-num">${esc(TOUR_РАЗДЕЛ[ш.где] || '')} · ${tourStep + 1} из ${TOUR.length}</div>` +
        `<b class="t">${esc(ш.t)}</b><span class="s">${esc(ш.s)}</span>` +
        '<div class="pv-row">' +
        (tourStep > 0 ? '<input class="menu_button" type="button" data-tr="back" value="Назад" />' : '') +
        `<input class="menu_button" type="button" data-tr="next" value="${последний ? 'Понятно' : 'Дальше'}" />` +
        '<input class="menu_button" type="button" data-tr="end" value="✕" style="flex:none" />' +
        '</div>').show();
    placeBubble();
    setTimeout(placeBubble, 400);                    // после плавной прокрутки
}

// Облачко под подсветкой, а если там тесно — над ней.
function placeBubble() {
    if (tourStep < 0) return;
    const цель = $('.pv-tour-on')[0], b = $('#pv_bubble');
    if (!цель || !b.length) return;
    const r = цель.getBoundingClientRect(), H = window.innerHeight, W = window.innerWidth;
    const h = b.outerHeight() || 160, w = b.outerWidth() || 320;
    let top = r.bottom + 12;
    if (top + h > H - 12) top = r.top - h - 12;
    if (top < 12) top = Math.max(12, H - h - 12);
    const left = Math.max(16, Math.min(W - w - 16, r.left));
    b.css({ top: Math.round(top) + 'px', left: Math.round(left) + 'px' });
}

/* ═══════════════ кнопка ≋ поверх чата ═══════════════
   Настройки Таверны далеко, а СТОП и «что сейчас играет» нужны под рукой.
   Кнопку можно утащить куда удобно — место запоминается. Нажатие открывает
   маленький пульт, оттуда же — в полные настройки. */

function fabDefault() { return { x: window.innerWidth - 64, y: window.innerHeight - 170 }; }

function clampFab() {
    const fab = $('#pv_fab')[0];
    if (!fab) return;
    const p = S().fabPos || fabDefault();
    const x = clamp(p.x, 4, window.innerWidth - 48), y = clamp(p.y, 4, window.innerHeight - 48);
    fab.style.left = x + 'px'; fab.style.top = y + 'px';
    placeMini();
}

function mountFab() {
    if (!S().fab) { $('#pv_fab, #pv_mini').remove(); return; }
    if ($('#pv_fab').length) return;
    const fab = $('<div id="pv_fab" class="pv-fab" role="button" tabindex="0" title="PUSYA VIBE">≋</div>').appendTo('body');
    $('<div id="pv_mini" class="pv-mini" hidden></div>').appendTo('body');
    clampFab();

    // тянем — переносим, коротко нажали — открываем пульт
    let sx = 0, sy = 0, ox = 0, oy = 0, on = false, moved = false;
    fab.on('pointerdown', (e) => {
        on = true; moved = false; sx = e.clientX; sy = e.clientY;
        const r = fab[0].getBoundingClientRect(); ox = r.left; oy = r.top;
        try { fab[0].setPointerCapture(e.pointerId); } catch { /* не везде есть */ }
    });
    fab.on('pointermove', (e) => {
        if (!on) return;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 7) return;
        moved = true;
        S().fabPos = { x: ox + dx, y: oy + dy };
        clampFab();
    });
    fab.on('pointerup pointercancel', () => {
        if (!on) return;
        on = false;
        if (moved) { saveSettingsDebounced(); return; }
        toggleMini();
    });
    fab.on('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMini(); } });
    $('#pv_mini').on('click', '[data-mini]', function () { miniDo($(this).attr('data-mini')); });
    $('#pv_mini').on('change', '#pv_mini_on', function () {
        $('#pv_enabled').prop('checked', $(this).prop('checked')).trigger('change');
    });
    $(window).off('resize.pvfab').on('resize.pvfab', clampFab);
    // нажали мимо — пульт закрывается
    $(document).off('pointerdown.pvfab').on('pointerdown.pvfab', (e) => {
        if ($('#pv_mini').prop('hidden')) return;
        if ($(e.target).closest('#pv_mini, #pv_fab').length) return;
        $('#pv_mini').prop('hidden', true);
    });
    paintFab();
}

function toggleMini() {
    const m = $('#pv_mini');
    m.prop('hidden', !m.prop('hidden'));
    if (!m.prop('hidden')) { paintMini(); placeMini(); }
}

// Пульт рядом с кнопкой: слева от неё, а если кнопка у левого края — справа.
function placeMini() {
    const fab = $('#pv_fab')[0], m = $('#pv_mini');
    if (!fab || !m.length || m.prop('hidden')) return;
    const r = fab.getBoundingClientRect();
    const w = m.outerWidth() || 280, h = m.outerHeight() || 200;
    let left = r.left - w - 10;
    if (left < 8) left = r.right + 10;
    left = clamp(left, 8, window.innerWidth - w - 8);
    const top = clamp(r.bottom - h, 8, window.innerHeight - h - 8);
    m.css({ left: left + 'px', top: top + 'px' });
}

function paintFab() {
    const fab = $('#pv_fab');
    if (!fab.length) return;
    const v = Math.round(Math.max(live.v, live.r, live.p, live.s, live.t));
    fab.attr('data-s', !connected ? 'off' : v > 0 ? 'play' : S().enabled ? 'on' : 'idle');
    fab.attr('title', 'PUSYA VIBE — ' + (!connected ? 'не подключено' : v > 0 ? 'играет ' + v + '/20' : 'подключено'));
    if (!$('#pv_mini').prop('hidden')) paintMiniLevel();
}

function paintMiniLevel() {
    const v = Math.round(Math.max(live.v, live.r, live.p, live.s, live.t));
    const слепо = !!S().blind;
    $('#pv_mini_fill').css('width', (слепо ? 0 : v / 20 * 100) + '%');
    $('#pv_mini_live').text(слепо ? '·' : v + '/20');
}

function paintMini() {
    const s = S(), m = $('#pv_mini');
    if (!m.length) return;
    const caps = connected ? toyCaps() : null;
    const имя = caps && caps.known ? caps.names.join(', ') : connected ? 'игрушек не видно' : 'не подключено';
    m.html(
        '<div class="pv-row pv-between" style="margin-top:0"><b>📳 PUSYA VIBE</b><span class="pv-live" id="pv_mini_live"></span></div>' +
        `<div class="pv-devsub"><span class="pv-dot ${connected ? 'on' : ''}"></span> ${esc(имя)}</div>` +
        '<div class="pv-meter"><div class="pv-fill" id="pv_mini_fill"></div></div>' +
        `<label class="checkbox_label"><input type="checkbox" id="pv_mini_on" ${s.enabled ? 'checked' : ''}><span>Персонаж ведёт игрушку</span></label>` +
        '<div class="pv-row">' +
        (connected
            ? '<input class="menu_button pv-red" type="button" data-mini="stop" value="СТОП">'
            : '<input class="menu_button" type="button" data-mini="conn" value="Подключить">') +
        '<input class="menu_button" type="button" data-mini="full" value="Все настройки">' +
        '</div>');
    paintMiniLevel();
}

async function miniDo(что) {
    if (что === 'stop') { sinkStop('кнопка'); log('stop', 'стоп с кнопки ≋'); paintMini(); return; }
    if (что === 'conn') { await doConnect(false); paintMini(); return; }
    if (что === 'full') {
        $('#pv_mini').prop('hidden', true);
        // открываем панель «Расширения» Таверны, а в ней — наш блок
        const drawer = $('#pv_root .inline-drawer-content');
        if (!drawer.is(':visible')) {
            const ext = $('#extensions-settings-button .drawer-toggle');
            if (ext.length && !$('#rm_extensions_block').hasClass('openDrawer')) ext.trigger('click');
            setTimeout(() => {
                if (!$('#pv_root .inline-drawer-content').is(':visible')) $('#pv_root .inline-drawer-toggle').trigger('click');
                setTimeout(() => $('#pv_root')[0]?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 250);
            }, 250);
        } else {
            $('#pv_root')[0]?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }
    }
}

/* ═══════════════ запуск ═══════════════ */

jQuery(async () => {
    const r = await fetch(BASE + 'settings.html');
    if (!r.ok) {
        console.error('[PUSYA VIBE] не нашла панель по адресу ' + BASE + 'settings.html — ' + r.status);
        toastr.error('PUSYA VIBE: не нашла файлы панели. Переустанови расширение.');
        return;
    }
    const html = await r.text();
    // Правая колонка есть не во всех раскладках Таверны — тогда в общую.
    $($('#extensions_settings2').length ? '#extensions_settings2' : '#extensions_settings').append(html);

    const s = S();
    const save = () => saveSettingsDebounced();

    // разложить настройки по полям
    $('#pv_ver').text('v' + PV_VERSION);
    $('#pv_enabled').prop('checked', s.enabled);
    $('#pv_ws').val(s.ws);
    $('#pv_lvip').val(s.lvIp); $('#pv_lvport').val(s.lvPort);
    $('#pv_ep').val(s.ep); $('#pv_model').val(s.model); $('#pv_key').val(s.key);
    $('#pv_cap').val(s.cap); $('#pv_cap_v').text(s.cap);
    $('#pv_max').val(s.maxMinutes); $('#pv_max_v').text(s.maxMinutes ? s.maxMinutes + ' мин' : 'нет');
    $('#pv_safeword').val(s.safeword);
    $('#pv_fet_own').val(s.fetOwn);
    const флажки = {
        pv_gate: 'gate', pv_loop: 'loop', pv_reply: 'reply', pv_blind: 'blind', pv_flowlive: 'flowLive',
        pv_fetremind: 'fetRemind', pv_fetdrive: 'fetDrive', pv_gentle: 'gentle', pv_breathe: 'breathe',
        pv_hint: 'hintOn', pv_orders: 'orders', pv_pace: 'paceHint', pv_toytell: 'toyTell', pv_fab_on: 'fab',
    };
    for (const [id, key] of Object.entries(флажки)) {
        $('#' + id).prop('checked', !!s[key]).on('change', function () {
            s[key] = $(this).prop('checked'); save();
            if (key === 'toyTell') toyToldAt = 0;
            if (key === 'fab') mountFab();
            if (key === 'blind') { paintMeter(); paintGraph(); }
            buildPrompt(); paintBrainBoxes();
        });
    }
    $('#pv_perchat').prop('checked', s.perChat);

    pickNames();
    paintTransport(); paintBrainBoxes(); paintProfiles(); paintPicks();
    paintFetish(); paintQueue(); paintPat(); paintStatus(); paintMeter(); paintLog(); paintPlay();
    paintChatNote();
    showPane(s.tab || 'home');

    // навигация
    $('#pv_root').on('click', '.pv-mt', function () { showPane($(this).attr('data-go')); });
    $('#pv_back').on('click', () => showPane('home'));
    $('#pv_wiz_open, #pv_wiz_again').on('click', () => openWiz(0));
    $('#pv_tour_again').on('click', startTour);
    // Первый раз раскрыла панель — сразу окошки настройки.
    $('#pv_root .inline-drawer-toggle').on('click', () => {
        if (!S().wizDone && !wizShown) setTimeout(() => openWiz(0), 250);
    });

    $('#pv_enabled').on('change', async function () {
        s.enabled = $(this).prop('checked'); save();
        if (s.enabled) lockedOut = false;
        if (s.enabled && !connected) await doConnect(true);
        if (!s.enabled) sinkStop('выключено');
        buildPrompt(); paintStatus();
    });

    $('#pv_transport').on('change', function () {
        if (S().transport === 'direct') Direct.disconnect();
        s.transport = $(this).val(); save();
        connected = false; devices = []; statusNote = 'не подключено';
        paintTransport(); paintStatus(); buildPrompt();
    });

    $('#pv_ws').on('input', function () { s.ws = $(this).val(); save(); });
    $('#pv_lvip').on('input', function () { s.lvIp = $(this).val(); save(); });
    $('#pv_lvport').on('input', function () { s.lvPort = $(this).val(); save(); });
    $('#pv_ep').on('input', function () { s.ep = $(this).val(); save(); });
    $('#pv_model').on('input', function () { s.model = $(this).val(); save(); });
    $('#pv_key').on('input', function () { s.key = $(this).val(); save(); });

    $('#pv_cap').on('input', function () { s.cap = clamp($(this).val(), 1, 20); $('#pv_cap_v').text(s.cap); save(); buildPrompt(); paintStatus(); });
    $('#pv_max').on('input', function () { s.maxMinutes = clamp($(this).val(), 0, 60); $('#pv_max_v').text(s.maxMinutes ? s.maxMinutes + ' мин' : 'нет'); save(); paintStatus(); });
    $('#pv_safeword').on('input', function () { s.safeword = $(this).val(); save(); paintStatus(); });

    $('#pv_patsec').on('input', function () { s.patSec = clamp($(this).val(), 30, 300); $('#pv_patsec_v').text(секстр(s.patSec)); save(); });
    $('#pv_patloop').on('change', function () { s.patLoop = $(this).prop('checked'); save(); paintPat(); });

    $('#pv_fet_own').on('input', function () { s.fetOwn = $(this).val(); save(); paintFetish(); buildPrompt(); });
    $('#pv_fet_card').on('click', rescanCard);
    $('#pv_fet_chat').on('click', scanChatFetishes);

    $('#pv_q_add').on('click', function () {
        if (!s.queue) s.queue = [];
        if (s.queue.length >= 12) { toastr.info('хватит и двенадцати'); return; }
        s.queue.push({ v: 8, sec: 20 }); save(); paintQueue();
    });
    $('#pv_q_play').on('click', playQueue);
    $('#pv_q_copy').on('click', function () {
        const code = rhythmCode();
        if (!code) { toastr.info('сначала задай хотя бы одну ступеньку'); return; }
        $('#pv_q_code').val(code).trigger('select');
        try { navigator.clipboard?.writeText(code); } catch { /* нет буфера — код остался в поле */ }
        toastr.success('код скопирован');
    });
    $('#pv_q_apply').on('click', function () {
        if (applyRhythmCode($('#pv_q_code').val())) toastr.success('ритм подставлен');
        else toastr.error('код не понят — он выглядит как PV1-5x20-12x30');
    });
    $('#pv_perchat').on('change', function () {
        s.perChat = $(this).prop('checked'); save();
        if (s.perChat) { saveChatCfg(); log('info', 'характер закреплён за этим чатом'); }
        paintChatNote();
    });

    $('#pv_connect').on('click', () => doConnect(false));
    $('#pv_test').on('click', testToy);
    $('#pv_stop').on('click', () => { sinkStop('кнопка'); log('stop', 'стоп кнопкой'); });

    $('#pv_brain_now').on('click', () => {
        if (!connected) { toastr.info('сначала подключи игрушку'); return; }
        const ctx = SillyTavern.getContext();
        const chat = ctx.chat || [];
        for (let i = chat.length - 1; i >= 0; i--) {
            if (!chat[i].is_user) { runBrain('ручной-' + Date.now(), String(chat[i].mes || ''), true); return; }
        }
        toastr.info('в чате нет ответа персонажа');
    });

    // события Таверны
    eventSource.on(event_types.STREAM_TOKEN_RECEIVED, onStreamToken);
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    eventSource.on(event_types.GENERATION_STARTED, onGenerationStarted);
    eventSource.on(event_types.MESSAGE_SENT, onMessageSent);
    if (event_types.MESSAGE_SWIPED) eventSource.on(event_types.MESSAGE_SWIPED, onSwiped);
    if (event_types.GENERATION_STOPPED) eventSource.on(event_types.GENERATION_STOPPED, () => sinkWaiting(false));
    eventSource.on(event_types.CHAT_CHANGED, () => {
        streamText = ''; firedCount = 0; brainKey = ''; flowKey = ''; flowPos = 0; flowLevel = 0; flowAt = 0; devHold = 0;
        F = { cards: [], intensity: 0, at: 0, key: '' };
        HINT = { text: '', at: 0, used: 0 };
        lastUserText = ''; toyToldAt = 0;
        sinkStop('новый чат');
        pickNames();
        loadChatCfg(); paintChatNote(); paintFetish();
        buildPrompt();
    });

    mountFab();
    $('#pv_fab_reset').on('click', () => { s.fabPos = null; save(); mountFab(); clampFab(); toastr.info('кнопка ≋ вернулась на место'); });

    startPolling();
    startHeartbeat();
    if (s.enabled) doConnect(true);
    buildPrompt();

    console.log('[PUSYA VIBE] расширение загружено, v' + PV_VERSION);
});

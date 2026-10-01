import {
    eventSource,
    event_types,
    extension_prompt_types,
    extension_prompt_roles,
    saveSettingsDebounced,
    setExtensionPrompt,
} from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

const MODULE = 'pusyavibe';
const PROMPT_TAG = 'pusya_vibe';

const BASE = (() => {
    try { return new URL('.', import.meta.url).pathname; } catch { return '/scripts/extensions/third-party/SillyTavern-PusyaVibe/'; }
})();

const ctx = () => SillyTavern.getContext();

function lang() {
    try {
        const c = JSON.parse(localStorage.getItem('pv_cfg_v1') || '{}');
        if (c.lang === 'ru' || c.lang === 'en') return c.lang;
    } catch {}
    let l = '';
    try { l = String(localStorage.getItem('language') || navigator.language || ''); } catch {}
    return /^(ru|uk|be|kk)/i.test(l) ? 'ru' : 'en';
}
const EN = lang() === 'en';

const HOST_DEFAULTS = { aiControl: false, capLevel: 14, maxMinutes: 20, safeword: EN ? 'stop' : 'стоп' };

function S() {
    if (!extension_settings[MODULE]) extension_settings[MODULE] = {};
    const s = extension_settings[MODULE];
    if (!s.host) s.host = {};
    for (const [k, v] of Object.entries(HOST_DEFAULTS)) if (s.host[k] === undefined) s.host[k] = v;
    if (!s.vars) s.vars = {};
    return s;
}

function publishHost() {
    const h = S().host;
    window.__pv_host = {
        aiControl: !!h.aiControl,
        capLevel: Math.max(1, Math.min(20, parseInt(h.capLevel, 10) || 14)),
        maxMinutes: Math.max(0, parseInt(h.maxMinutes, 10) || 0),
        safeword: String(h.safeword || '').trim().toLowerCase(),
    };
}

function charOf(id) {
    const c = ctx();
    const ch = c.characters?.[id ?? c.characterId];
    if (!ch) return null;
    const d = ch.data || {};
    return {
        name: ch.name,
        description: ch.description || d.description,
        personality: ch.personality || d.personality,
        scenario: ch.scenario || d.scenario,
        firstMes: ch.first_mes || d.first_mes,
        mesExample: ch.mes_example || d.mes_example,
        creatorNotes: d.creator_notes || ch.creatorcomment,
        systemPrompt: d.system_prompt,
        alternateGreetings: Array.isArray(d.alternate_greetings) ? d.alternate_greetings : [],
        tags: Array.isArray(ch.tags) ? ch.tags : (Array.isArray(d.tags) ? d.tags : []),
    };
}

const insetWatchers = [];
function insets() {
    const top = document.getElementById('top-bar');
    const form = document.getElementById('form_sheld');
    const H = window.innerHeight;
    const topBar = top ? Math.round(top.getBoundingClientRect().bottom) : 40;
    const bottomInput = form ? Math.max(0, Math.round(H - form.getBoundingClientRect().top)) : 70;
    return { topBar, bottomInput };
}
function applyInsets() {
    const i = insets();
    const root = document.documentElement.style;
    root.setProperty('--tavo-inset-top-bar', i.topBar + 'px');
    root.setProperty('--tavo-inset-bottom-input', i.bottomInput + 'px');
    for (const f of insetWatchers) { try { f(i); } catch {} }
}

const переходник = {
    plugin: {
        i18n: {
            get locale() { try { return String(localStorage.getItem('language') || ''); } catch { return ''; } },
        },
    },
    message: {
        find: async () => { const all = ctx().chat || [], от = Math.max(0, all.length - 60); return all.slice(от).map((m, k) => ({
            id: от + k,
            role: m.is_user ? 'user' : (m.is_system ? 'system' : 'assistant'),
            content: String(m.mes || ''),
            name: m.name,
        })); },
    },
    chat: {
        current: async () => {
            const c = ctx();
            return {
                id: c.chatId || (c.groupId ? 'group-' + c.groupId : ''),
                characters: c.characterId != null ? [c.characterId] : [],
                characterName: c.name2,
                persona: 'я',
            };
        },
    },
    character: { get: async (id) => charOf(id) },
    persona: { get: async () => ({ name: ctx().name1 }) },
    variable: {
        get: async (name, scope) => {
            if (scope === 'chat') return ctx().chatMetadata?.[MODULE + ':' + name];
            return S().vars[name];
        },
        set: async (name, value, scope) => {
            const копия = value == null ? value : JSON.parse(JSON.stringify(value));
            if (scope === 'chat') {
                const c = ctx();
                if (!c.chatMetadata || !c.chatId) return;
                c.chatMetadata[MODULE + ':' + name] = копия;
                (c.saveMetadataDebounced || c.saveMetadata)?.();
                return;
            }
            S().vars[name] = копия;
            saveSettingsDebounced();
        },
    },
    generate: async (prompt) => {
        const gen = ctx().generateQuietPrompt;
        if (typeof gen !== 'function') throw new Error(EN ? 'SillyTavern gave no quiet request — enter your own key' : 'Таверна не дала тихий запрос — впиши свой ключ');
        try {
            const r = await gen({ quietPrompt: prompt, skipWIAN: true });
            if (r) return String(r);
        } catch {}
        return String(await gen(prompt, false, true) || '');
    },
    utils: { toast: (t) => toastr.info(String(t), 'PUSYA VIBE') },
    ui: {
        getInsets: () => insets(),
        onInsetsChanged: (f) => { if (typeof f === 'function') insetWatchers.push(f); },
    },
};

let lastPrompt = '';
function applyPrompt() {
    const p = S().host.aiControl ? lastPrompt.trim() : '';
    setExtensionPrompt(PROMPT_TAG, p, extension_prompt_types.IN_CHAT, 0, false, extension_prompt_roles.SYSTEM);
}

globalThis.pusyaVibeBeforeGenerate = async (chat, contextSize, abort, type) => {
    if (type === 'quiet') return;
    try { await window.PV?.readNow?.(); } catch {}
    applyPrompt();
};

function fire(name) {
    publishHost();
    try { window.dispatchEvent(new CustomEvent(name)); } catch {}
}

let msgAt = 0, msgTimer = null;
function onMsg() {
    const t = Date.now();
    clearTimeout(msgTimer);
    if (t - msgAt >= 400) { msgAt = t; fire('pv-msg'); }
    else msgTimer = setTimeout(() => { msgAt = Date.now(); fire('pv-msg'); }, 400 - (t - msgAt));
}

const DRAWER = `
<div class="inline-drawer" id="pv_root">
  <div class="inline-drawer-toggle inline-drawer-header">
    <b>📳 PUSYA VIBE</b>
    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
  </div>
  <div class="inline-drawer-content">
    <div class="pvx">
      <div class="pvx-note">Пульт открывается кнопкой <b>≋</b> поверх чата. Здесь — только то, что выставляют один раз.</div>
      <label class="pvx-sw" for="pvx_ai"><input type="checkbox" id="pvx_ai"><span>Разрешить ИИ управлять</span></label>
      <div class="pvx-hint pvx-warn">Главный рубильник. Выключен — игрушка слушается только тебя, что бы ни происходило в сцене.</div>
      <label class="pvx-l">Потолок силы</label>
      <select id="pvx_cap" class="text_pole">
        <option value="5">5 — еле-еле</option><option value="10">10 — мягко</option>
        <option value="14">14 — средне</option><option value="17">17 — сильно</option><option value="20">20 — на полную</option>
      </select>
      <label class="pvx-l">Автостоп</label>
      <select id="pvx_max" class="text_pole">
        <option value="5">через 5 минут</option><option value="10">через 10 минут</option>
        <option value="20">через 20 минут</option><option value="45">через 45 минут</option><option value="0">без автостопа</option>
      </select>
      <label class="pvx-l">Стоп-слово</label>
      <input id="pvx_safe" class="text_pole" type="text" placeholder="стоп">
      <div class="pvx-hint">напишешь его в сообщении — всё остановится</div>
      <div class="pvx-row">
        <button class="pvx-b" id="pvx_open">Открыть пульт ≋</button>
        <button class="pvx-b pvx-ghost" id="pvx_dock">Вернуть кнопку ≋ на место</button>
      </div>
      <div class="pvx-row" style="margin-top:0">
        <button class="pvx-b pvx-ghost" id="pvx_win">Вернуть окно пульта на место</button>
      </div>
      <div class="pvx-hint">окно пульта можно таскать за шапку; двойной щелчок по шапке — тоже вернуть на место</div>
    </div>
  </div>
</div>`;

const DRAWER_EN = `
<div class="inline-drawer" id="pv_root">
  <div class="inline-drawer-toggle inline-drawer-header">
    <b>📳 PUSYA VIBE</b>
    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
  </div>
  <div class="inline-drawer-content">
    <div class="pvx">
      <div class="pvx-note">The panel opens with the <b>≋</b> button over the chat. This is only for things you set once.</div>
      <label class="pvx-sw" for="pvx_ai"><input type="checkbox" id="pvx_ai"><span>Allow AI control</span></label>
      <div class="pvx-hint pvx-warn">The master switch. Off — the toy only listens to you, whatever happens in the scene.</div>
      <label class="pvx-l">Strength ceiling</label>
      <select id="pvx_cap" class="text_pole">
        <option value="5">5 — barely</option><option value="10">10 — soft</option>
        <option value="14">14 — medium</option><option value="17">17 — strong</option><option value="20">20 — full power</option>
      </select>
      <label class="pvx-l">Auto-stop</label>
      <select id="pvx_max" class="text_pole">
        <option value="5">after 5 minutes</option><option value="10">after 10 minutes</option>
        <option value="20">after 20 minutes</option><option value="45">after 45 minutes</option><option value="0">no auto-stop</option>
      </select>
      <label class="pvx-l">Safeword</label>
      <input id="pvx_safe" class="text_pole" type="text" placeholder="stop">
      <div class="pvx-hint">write it in a message and everything stops</div>
      <div class="pvx-row">
        <button class="pvx-b" id="pvx_open">Open the panel ≋</button>
        <button class="pvx-b pvx-ghost" id="pvx_dock">Put the ≋ button back</button>
      </div>
      <div class="pvx-row" style="margin-top:0">
        <button class="pvx-b pvx-ghost" id="pvx_win">Put the panel window back</button>
      </div>
      <div class="pvx-hint">drag the panel window by its header; double-click the header to put it back as well</div>
    </div>
  </div>
</div>`;

function mountDrawer() {
    const target = $('#extensions_settings2').length ? '#extensions_settings2' : '#extensions_settings';
    $(target).append(EN ? DRAWER_EN : DRAWER);
    const h = S().host;
    const save = () => { saveSettingsDebounced(); publishHost(); applyPrompt(); };

    $('#pvx_ai').prop('checked', !!h.aiControl).on('change', function () {
        h.aiControl = $(this).prop('checked'); save();
        try { window.PV?.repaint?.(); } catch {}
    });
    $('#pvx_cap').val(String(h.capLevel)).on('change', function () { h.capLevel = +$(this).val(); save(); window.PV?.repaint?.(); });
    $('#pvx_max').val(String(h.maxMinutes)).on('change', function () { h.maxMinutes = +$(this).val(); save(); });
    $('#pvx_safe').val(h.safeword).on('input', function () { h.safeword = $(this).val(); save(); });
    $('#pvx_open').on('click', () => fire('pusya-open-vibe'));
    $('#pvx_win').on('click', () => { try { window.PV?.resetWin?.(); } catch {} });
    $('#pvx_dock').on('click', () => {
        try { window.PV?.resetDock?.(); } catch {}
    });
}

function loadPanel() {
    return new Promise((resolve, reject) => {
        const sc = document.createElement('script');
        sc.src = BASE + 'panel.js';
        sc.onload = resolve;
        sc.onerror = () => reject(new Error('не нашла ' + BASE + 'panel.js'));
        document.head.appendChild(sc);
    });
}

jQuery(async () => {
    S();
    publishHost();
    window.__pv_st = true;
    window.__pv_tavo = переходник;
    window.__pv_onPrompt = (p) => { lastPrompt = String(p || ''); applyPrompt(); };

    mountDrawer();
    applyInsets();
    window.addEventListener('resize', applyInsets);
    try {
        const ro = new ResizeObserver(applyInsets);
        for (const id of ['top-bar', 'form_sheld']) { const n = document.getElementById(id); if (n) ro.observe(n); }
    } catch {}

    try {
        await loadPanel();
    } catch (e) {
        console.error('[PUSYA VIBE]', e);
        toastr.error(EN ? 'Panel files not found. Reinstall the extension.' : 'Не нашла файлы пульта. Переустанови расширение.', 'PUSYA VIBE');
        return;
    }

    for (const ev of ['MESSAGE_SENT', 'MESSAGE_RECEIVED', 'MESSAGE_EDITED', 'MESSAGE_UPDATED',
        'MESSAGE_SWIPED', 'MESSAGE_DELETED', 'STREAM_TOKEN_RECEIVED', 'GENERATION_ENDED', 'GENERATION_STOPPED']) {
        if (event_types[ev]) eventSource.on(event_types[ev], onMsg);
    }
    eventSource.on(event_types.CHAT_CHANGED, () => {
        lastPrompt = ''; applyPrompt();
        fire('pv-panic');
        fire('pv-chat-opened');
    });

    applyPrompt();
    console.log('[PUSYA VIBE] пульт загружен');
});

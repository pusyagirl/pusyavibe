/* PUSYA VIBE — пульт. Собран из Таво версия/plugin/ui/panel.html, руками не править. */
(function(){
"use strict";
/* PUSYA VIBE v1.0 — пульт и движок.
   Автор: Пуся · t.me/pusgir
   Всё в одном фрагменте: драйверы устройств, движок интенсивности, парсер команд ИИ,
   лимиты безопасности и UI. Монтируется один раз, всё в неймспейсе pv-/PV. */

var pdoc = document, pwin = window;
try { var __fe = window.frameElement; if (__fe && __fe.ownerDocument) { pdoc = __fe.ownerDocument; pwin = pdoc.defaultView || window; } } catch(e){}
try {

var __prev = null; try { __prev = pwin.PV || window.PV || null; } catch(e){}
if (__prev && __prev._v === 1) { try { __prev.rewire(); } catch(e){} return; }

var PV = __prev || {};
try { pwin.PV = PV; } catch(e){}
try { window.PV = PV; } catch(e){}
PV._v = 1;

/* ═══════════════ утилиты ═══════════════ */

function prev_warned(d){ return !!(d && d.warned); }

/* Площадка. В SillyTavern панель подключает index.js расширения: он кладёт
   __pv_st и переходник __pv_tavo с тем же набором вызовов, что у Таво. */
var НА_СТ = false;
try { НА_СТ = !!(window.__pv_st || (pwin && pwin.__pv_st)); } catch(e){}
var ХОСТ = НА_СТ ? {
  имя: 'Таверна', где: 'в Таверне', родит: 'Таверны',
  настройки: 'в настройках расширения (Расширения → 📳 PUSYA VIBE)',
  путь: 'Открой в Таверне <b>Расширения</b> (значок кубиков) → <b>📳 PUSYA VIBE</b>.',
  модель: 'текущее подключение Таверны'
} : {
  имя: 'Таво', где: 'в Таво', родит: 'Таво',
  настройки: 'в настройках плагина Таво',
  путь: 'Открой в Таво <b>Ещё → Плагины → PUSYA VIBE</b>.',
  модель: 'встроенную модель Таво'
};

function TV(){
  try { var st = window.__pv_tavo || (pwin && pwin.__pv_tavo); if (st) return st; } catch(e){}
  try { if (typeof tavo !== 'undefined' && tavo && tavo.message) return tavo; } catch(e){}
  try { if (pwin && pwin.tavo && pwin.tavo.message) return pwin.tavo; } catch(e){}
  try { if (window.top && window.top.tavo && window.top.tavo.message) return window.top.tavo; } catch(e){}
  try { if (window.parent && window.parent.tavo && window.parent.tavo.message) return window.parent.tavo; } catch(e){}
  try { if (typeof tavo !== 'undefined') return tavo; } catch(e){}
  return null;
}
function toast(t){ try { var T = TV(); if (T && T.utils && T.utils.toast) T.utils.toast(t); } catch(e){} }
function now(){ return Date.now(); }
function clamp(x, a, b){ x = +x; if (isNaN(x)) x = a; return x < a ? a : (x > b ? b : x); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }
var store = null; try { store = pwin.localStorage || window.localStorage; } catch(e){}
function lsGet(k, d){ try { var v = store && store.getItem(k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } }
function lsSet(k, v){ try { store && store.setItem(k, JSON.stringify(v)); } catch(e){} }

/* Настройки из manifest (их публикует entry.js). */
function host(){
  var h = null;
  try { h = pwin.__pv_host || window.__pv_host || null; } catch(e){}
  try { if (!h && window.top) h = window.top.__pv_host; } catch(e){}
  return h || { aiControl: false, capLevel: 14, maxMinutes: 20, safeword: 'стоп' };
}

/* ═══════════════ настройки панели ═══════════════ */

var DEF = {
  driver: 'intiface',                    // intiface | lovense | webhook | phone
  wsUrl: 'ws://127.0.0.1:12345',         // Intiface Central
  lvIp: '127.0.0.1', lvPort: '20010',    // Lovense Remote (Game Mode)
  hookUrl: '', hookMethod: 'POST',       // произвольный вебхук
  loop: true,                            // повторять программу до следующего ответа
  autoStopOnUser: false,                 // глушить, когда пишу сама
  smooth: 35,                            // плавность переходов, 0 — мгновенно
  breathe: true,                         // «дышать» вокруг уровня, пока модель думает
  idleLevel: 0,                          // затишье вместо мёртвой тишины в ожидании
  waitMaxSec: 180,                       // ждать ответ дольше этого — значит, зависло
  reply: true,                           // короткий отклик на моё сообщение
  gentle: false,                         // щадящий Bluetooth: реже команды, меньше обрывов
  blind: false,                          // слепой режим: не видно ни цифры, ни графика
  deny: 15,                              // как часто отказывать на пике
  chaos: 15,                             // насколько своевольничать
  flowLive: true,                        // отзываться прямо во время печати ответа
  fetRemind: true,                       // напоминать модели про предпочтения
  fetDrive: true,                        // фетиш срабатывает всплеском на игрушке
  fetEvery: 3,                           // как часто напоминать (каждый N-й ответ)
  fetOwn: '',                            // свои предпочтения через запятую
  fetChar: {},                           // что нашлось в карточке — по чатам
  lanes: [[{ n: 'волна', p: 'средне', s: 60 }, { n: 'дразнилка', p: 'жёстко', s: 30 }], []],   // своя программа
  laneTo: 0,                             // на какую дорожку добавлять кусок
  progs: [],                             // сохранённые программы
  handLink: true,                        // волны моторов сцеплены
  handZero: false,                       // отпустила волну — мотор в ноль
  profile: 'обычно',                     // выбранный профиль настроек
  perChat: false,                        // помнить настройки отдельно для каждого чата
  devOff: {},                            // игрушки, отключённые вручную (по имени)
  tone: 'Держись сцены: нежность — 3-8, нарастание — 9-14, пик — 15-20. Меняй интенсивность по ходу описания, а не один раз в конце.',
  // кто решает, что делать с игрушкой: теги от персонажа | отдельная модель-аналитик | локальная эвристика
  brain: 'live',
  ep: '', key: '', model: '',            // свой OpenAI-совместимый эндпоинт для аналитика
  keepAwake: true,                       // не давать экрану гаснуть, пока идёт сцена
  bgKeep: false,                         // не глушить при сворачивании приложения
  tab: 'home',                          // открытая вкладка пульта
  gain: 1,                               // усиление того, что назначили теги/аналитик/эвристика
  gate: true,                            // не тратить запрос аналитика на спокойные сцены
  autoConnect: true,                     // сама цепляться к мосту, не дожидаясь кнопки
  wizDone: false,                        // мастер первого входа пройден или пропущен
  tourDone: false,                       // экскурсия по панели показана
  ifaceOn: 'phone',                      // где стоит Intiface: phone | pc
  paceHint: true,                        // просить модель не комкать близкую сцену
  orders: true,                          // слушаться прямых команд персонажа словами
  patSec: 60,                            // сколько играет паттерн, секунды (30…300)
  patLoop: true,                         // паттерн и свой ритм крутятся по кругу до СТОП
  patLast: '',                           // последний выбранный паттерн — для подписи
  toyKind: {},                           // что за игрушка, выбрано руками: { имя: { k, air } }
  toyTell: true,                         // рассказывать персонажу, какая игрушка подключена
  hintOn: true,                          // вторая модель подсказывает, куда вести следующий ответ
  everConnected: false                   // игрушка уже подключалась — экран первого входа не нужен
};
var C = lsGet('pv_cfg_v1', null) || {};
// старые сборки знали режимы tags и local — оба теперь живут как «по словам»
if (C.brain === 'tags' || C.brain === 'local') C.brain = 'live';
// у кого игрушка уже подключалась — мастер не показываем, они всё это прошли руками
if (C.wizDone === undefined && C.everConnected) C.wizDone = true;
// Ступеньки прежних версий — в кусок «ровно», чтобы свой ритм не пропал.
if (C.lanes === undefined && Array.isArray(C.queue) && C.queue.length &&
    JSON.stringify(C.queue) !== JSON.stringify([{ v: 5, sec: 20 }, { v: 12, sec: 30 }, { v: 3, sec: 15 }])){
  C.lanes = [C.queue.filter(function(q){ return q && q.sec > 0; }).slice(0, 12)
    .map(function(q){ return { n: 'ровно', l: Math.max(0, Math.min(20, +q.v || 0)), s: Math.max(1, Math.min(600, +q.sec || 1)) }; }), []];
}
delete C.queue;
for (var k in DEF) if (C[k] === undefined) C[k] = DEF[k];
/* Где всё лежит.

   localStorage вебвью перезапуск приложения обычно переживает, но гарантии нет:
   чистка кэша, переустановка, «освободить место» — и настроек больше нет.
   Настоящее место — переменные Таво: они и перезапуск переживают, и уезжают
   вместе с чатом при экспорте. Они асинхронные, а панель рисуется сразу,
   поэтому localStorage остаётся быстрым кэшем: читаем из него мгновенно,
   а следом подтягиваем правду из переменных.

   pusyaVibe.cfg  — global: общие настройки, одни на все чаты
   pusyaVibe.chat — chat:   предпочтения и настройки этого чата */

var VAR_CFG = 'pusyaVibe.cfg', VAR_CHAT = 'pusyaVibe.chat';
var varTimer = null;

function VAPI(){
  var T = TV();
  return (T && T.variable && T.variable.set) ? T.variable : null;
}

function saveCfg(){
  lsSet('pv_cfg_v1', C);                       // мгновенно, чтобы ничего не терялось между тактами
  clearTimeout(varTimer);
  varTimer = setTimeout(function(){
    var V = VAPI(); if (!V) return;
    try { Promise.resolve(V.set(VAR_CFG, C, 'global')).catch(function(){}); } catch(e){}
  }, 700);                                     // ползунок дёргают часто — пишем разом
}

/* Правда из переменных Таво приезжает уже после отрисовки — подхватываем и
   перерисовываем. Но если за эти доли секунды ты успела что-то переключить,
   твой выбор главнее: сравниваем со слепком, сделанным до запроса, и трогаем
   только то, чего ты не касалась. */
function loadCfgFromTavo(){
  var V = VAPI(); if (!V) return;
  var слепок = {};
  for (var s in DEF) слепок[s] = JSON.stringify(C[s]);
  Promise.resolve(V.get(VAR_CFG, 'global')).then(function(v){
    if (!v || typeof v !== 'object') return;
    var изменилось = false;
    for (var k in DEF){
      if (v[k] === undefined) continue;
      var сейчас = JSON.stringify(C[k]);
      if (сейчас !== слепок[k]) continue;                 // это ты только что поменяла
      if (JSON.stringify(v[k]) === сейчас) continue;
      C[k] = v[k]; изменилось = true;
    }
    if (!изменилось) return;
    if (C.brain === 'tags' || C.brain === 'local') C.brain = 'live';
    lsSet('pv_cfg_v1', C);
    try { repaintAll(); } catch(e){}
    log('cfg', 'настройки подхвачены из ' + ХОСТ.родит);
  }).catch(function(){});
}

/* ═══════════════ анонимный пульс для дашборда ═══════════════ */
/* Сервер Пуси считает, сколько панелей открыто прямо сейчас. Плагин интимный,
   поэтому уходит только «vibe, anon, версия» — ни ника, ни настроек, ни
   предпочтений, ни названия игрушки. На стенде без Таво не стучимся, чтобы
   проверки не считались живыми людьми. */
var PV_VERSION = '1.14.0';
(function(){
  function beat(){
    if (!TV()) return;
    try { if (window.__pv_stand) return; } catch(e){}
    try {
      fetch('https://pussyagerl.duckdns.org/api/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin: 'vibe', nick: 'anon', version: PV_VERSION, data: {} })
      }).catch(function(){});
    } catch(e){}
  }
  setTimeout(beat, 5000);
  setInterval(beat, 5 * 60 * 1000);
})();

/* ═══════════════ лог ═══════════════ */

/* Два журнала вместо одного.
   «Что играло» — дорожка: паттерны, свой ритм, живой отклик, разбор сцены.
   «Что происходило» — служебный: связь, ошибки, заряд, настройки.
   Раньше всё шло вперемешку, и ошибка тонула среди двадцати строк «паттерн волна».
   В служебном игра видна одной меткой со счётчиком. */
var LOG = [], PLAY = [];
var ИГРА = { pat: 1, queue: 1, test: 1, flow: 1, brain: 1, cmd: 1, fet: 1, deny: 1, me: 1, swipe: 1 };

function log(kind, text){
  var t = now();
  if (ИГРА[kind]){
    PLAY.unshift({ t: t, kind: kind, text: text });
    if (PLAY.length > 60) PLAY.length = 60;
    // подряд идущая игра копит одну метку, а не заваливает служебный журнал
    var верх = LOG[0];
    if (верх && верх.kind === 'игра' && t - верх.t < 5 * 60000){ верх.n++; верх.t = t; }
    else LOG.unshift({ t: t, kind: 'игра', text: '', n: 1 });
    paintPlay();
  } else {
    LOG.unshift({ t: t, kind: kind, text: text });
  }
  if (LOG.length > 40) LOG.length = 40;
  paintLog();
}

/* ═══════════════ драйверы ═══════════════ */
/* Каждый драйвер: connect(), disconnect(), send(out), stop(), state, info, caps.
   out = {v,r,p,s,t} — уровни 0..20 по каналам:
   v вибрация · r вращение · p помпа · s всасывание · t фрикции/ход. */

var DRV = {};
var D = null;                            // активный драйвер
function pct(level){ return clamp(level, 0, 20) / 20; }

/* ── телефон: работает всегда, без железа ── */
DRV.phone = {
  id: 'phone', label: 'Телефон — для проверки',
  caps: ['v'], state: 'off', info: '',
  connect: function(){
    var ok = false;
    try { ok = typeof navigator !== 'undefined' && !!navigator.vibrate; } catch(e){}
    this.state = ok ? 'on' : 'error';
    this.info = ok ? 'вибромотор телефона' : 'этот браузер не умеет navigator.vibrate';
    return Promise.resolve(ok);
  },
  disconnect: function(){ this.stop(); this.state = 'off'; },
  send: function(out){
    // ШИМ: длительность импульса внутри такта = интенсивность.
    try {
      var ms = Math.round(240 * pct(Math.max(out.v, out.r, out.p, out.s, out.t)));
      if (ms > 0) navigator.vibrate(ms); else navigator.vibrate(0);
    } catch(e){}
  },
  stop: function(){ try { navigator.vibrate(0); } catch(e){} }
};

/* ── Intiface Central / Buttplug v3: универсально, ~100 брендов ── */
DRV.intiface = {
  id: 'intiface', label: 'Intiface — любой бренд',
  caps: ['v','r','p','s','t'], state: 'off', info: '',
  ws: null, msgId: 1, devices: {}, pingTimer: null, linPhase: 0,
  connect: function(){
    var self = this;
    this.disconnect();
    return new Promise(function(res){
      var url = String(C.wsUrl || '').trim();
      if (!/^wss?:\/\//i.test(url)) { self.state = 'error'; self.info = 'адрес должен начинаться с ws:// или wss://'; return res(false); }
      var done = false, ws;
      try { ws = new WebSocket(url); } catch(e){ self.state = 'error'; self.info = 'не открылся сокет: ' + e.message; return res(false); }
      self.ws = ws; self.state = 'connecting'; self.info = 'подключаюсь…';
      var giveUp = setTimeout(function(){
        if (!done){
          done = true; self.state = 'error';
          self.info = url + ' не ответил за 6 секунд — включён ли сервер в Intiface?';
          log('err', url + ' молчит 6 секунд');
          try { ws.close(); } catch(e){}
          res(false);
        }
      }, 6000);
      ws.onopen = function(){
        self.tx({ RequestServerInfo: { Id: self.msgId++, ClientName: 'PUSYA VIBE', MessageVersion: 3 } });
      };
      ws.onmessage = function(ev){
        var arr; try { arr = JSON.parse(ev.data); } catch(e){ return; }
        if (!arr || !arr.length) return;
        for (var i = 0; i < arr.length; i++){
          var m = arr[i], name = Object.keys(m)[0], b = m[name];
          if (name === 'ServerInfo'){
            self.state = 'on'; self.info = (b.ServerName || 'Intiface');
            self.upSince = now();
            // При обрыве Intiface глушит все устройства, поэтому после переподключения
            // сразу отдаём текущий уровень заново, а не ждём следующей смены.
            E.lastOut = '';
            // Но не рывком: подключение всегда входит мягко, за пару секунд с нуля.
            E.smooth = { v: 0, r: 0, p: 0, s: 0, t: 0, w: 0 };
            E.softStart = now() + 2000;
            // Если связи не было долго, старую сцену не подхватываем — начинаем с тишины.
            if (E.downSince && now() - E.downSince > 60000){
              clearProg(); E.manual = 0;
              log('conn', 'связи не было долго — сцену начинаю с тишины');
            }
            E.downSince = 0;
            self.tx({ RequestDeviceList: { Id: self.msgId++ } });
            self.tx({ StartScanning: { Id: self.msgId++ } });
            if (b.MaxPingTime > 0){
              clearInterval(self.pingTimer);
              self.pingTimer = setInterval(function(){ self.tx({ Ping: { Id: self.msgId++ } }); }, Math.max(500, b.MaxPingTime / 2));
            }
            clearInterval(self.battTimer);
            self.battTimer = setInterval(function(){ self.askBattery(); }, 120000);
            // Молчащий сокет iOS закрывает через пару минут, а каждый обрыв заставляет
            // Intiface остановить все устройства. Поэтому держим канал тёплым запросом
            // списка устройств: он не доходит до игрушки и Bluetooth не трогает вообще.
            clearInterval(self.keepTimer);
            self.keepTimer = setInterval(function(){
              if (self.state === 'on') self.tx({ RequestDeviceList: { Id: self.msgId++ } });
            }, 25000);
            if (!done){ done = true; clearTimeout(giveUp); res(true); }
          } else if (name === 'DeviceList'){
            // Список приходит и как ответ на «грелку», поэтому старые записи не стираем:
            // иначе каждые 25 секунд терялись бы заряд и отсчёт времени жизни.
            var было = self.devices;
            self.devices = {};
            (b.Devices || []).forEach(function(d){ self.addDev(d, было[d.DeviceIndex]); });
            paintStatus();
          } else if (name === 'DeviceAdded'){
            self.addDev(b); paintStatus();
          } else if (name === 'SensorReading'){
            var dv = self.devices[b.DeviceIndex];
            if (dv && b.Data && b.Data.length){
              dv.batt = Math.round(b.Data[0]);
              paintStatus();
              if (dv.batt <= 15 && !dv.warned){
                dv.warned = true;
                log('batt', dv.name + ': заряд ' + dv.batt + '% — скоро сядет');
                toast('PUSYA VIBE: ' + dv.name + ' почти разряжена (' + dv.batt + '%)');
              }
            }
          } else if (name === 'DeviceRemoved'){
            var gone = self.devices[b.DeviceIndex];
            if (gone){
              var жила = gone.since ? Math.round((now() - gone.since) / 1000) : 0;
              log('dev', gone.name + ' отвалилась от Intiface' + (жила ? ', держалась ' + жила + ' сек' : '') +
                ' — это Bluetooth, не наша связь');
            }
            delete self.devices[b.DeviceIndex]; paintStatus();
          } else if (name === 'Error'){
            log('err', 'Intiface: ' + (b.ErrorMessage || ''));
          }
        }
      };
      ws.onclose = function(){
        clearInterval(self.pingTimer); self.pingTimer = null;
        clearInterval(self.battTimer); self.battTimer = null;
        clearInterval(self.keepTimer); self.keepTimer = null;
        self.devices = {};
        if (self.state === 'on'){
          self.state = 'off'; self.info = 'соединение закрыто';
          // Сколько продержались — чтобы не гадать, кто и когда рвёт связь.
          var сек = self.upSince ? Math.round((now() - self.upSince) / 1000) : 0;
          self.upSince = 0;
          E.downSince = now();            // с этого момента считаем, сколько мы без связи
          log('conn', 'связь оборвалась' + (сек ? ', держалась ' + сек + ' сек' : '') +
            (pdoc.hidden ? ' (мы были в фоне)' : ' (мы были на экране)'));
          // Оборвалось у нас на глазах — поднимаемся сами, не дожидаясь ухода и возврата.
          if (!pdoc.hidden) setTimeout(autoConnectAgain, 1500);
        }
        else if (!done) {
          done = true; clearTimeout(giveUp); self.state = 'error';
          // Показываем адрес: чаще всего в поле стоит не то, что ждёт Intiface.
          self.info = 'не достучалась до ' + url + ' — запущен ли Intiface и тот ли адрес?';
          log('err', 'не достучалась до ' + url);
          res(false);
        }
        paintStatus();
      };
      ws.onerror = function(){ /* подробности приедут в onclose */ };
    });
  },
  addDev: function(d, прежняя){
    if (!this.devices[d.DeviceIndex] && !прежняя) log('dev', 'нашлась игрушка: ' + (d.DeviceName || '?'));
    var msgs = d.DeviceMessages || {};
    var scal = msgs.ScalarCmd || [], lin = msgs.LinearCmd || [], rot = msgs.RotateCmd || [];
    this.devices[d.DeviceIndex] = {
      idx: d.DeviceIndex, name: d.DeviceName || ('устройство ' + d.DeviceIndex),
      scalars: scal.map(function(f, i){ return { i: i, type: String(f.ActuatorType || 'Vibrate'), what: String(f.FeatureDescriptor || '') }; }),
      linear: lin.length, rotate: rot.length,
      since: (прежняя && прежняя.since) || now(),   // сколько уже держится связь с игрушкой
      // Satisfyer — известная болячка Buttplug: рвёт связь под плотным потоком команд.
      // Такие игрушки сразу ведём в щадящем темпе, не дожидаясь жалоб.
      fragile: /satisfyer|sf\s/i.test(String(d.DeviceName || '')),
      // Игрушка может рассказать про заряд — очень пригодится: севшая батарея
      // подключается прекрасно, а мотор уже не тянет.
      battIdx: (function(){
        var sens = msgs.SensorReadCmd || [];
        for (var i = 0; i < sens.length; i++) if (/batter/i.test(String(sens[i].SensorType || ''))) return i;
        return -1;
      })(),
      batt: прежняя ? прежняя.batt : null,
      warned: прежняя ? prev_warned(прежняя) : false
    };
    if (!прежняя && this.devices[d.DeviceIndex].fragile){
      log('dev', 'эта марка не любит частых команд — веду бережно');
    }
    // В Intiface часто включён тренировочный «Simulated …». Он не игрушка, а
    // заглушка для разработчиков, поэтому по умолчанию его не трогаем — иначе
    // половина команд уходит в пустоту. Включить обратно можно в «кто участвует».
    var имя = this.devices[d.DeviceIndex].name;
    if (!C.devOff) C.devOff = {};
    if (!прежняя && C.devOff[имя] === undefined && /simulated|test device|пробн/i.test(имя)){
      C.devOff[имя] = true;
      saveCfg();
      log('dev', имя + ' — это заглушка Intiface, отключила её');
    }
    if (прежняя) return;                  // это просто «грелка» канала, дальше делать нечего
    toyToldAt = 0;          // новая игрушка — в ближайшем ответе расскажем про неё
    buildPrompt();          // персонаж должен узнать, что именно к нему подключилось
    this.askBattery();
  },
  askBattery: function(){
    var self = this;
    Object.keys(this.devices).forEach(function(k){
      var d = self.devices[k];
      if (d.battIdx >= 0) self.tx({ SensorReadCmd: { Id: self.msgId++, DeviceIndex: d.idx, SensorIndex: d.battIdx, SensorType: 'Battery' } });
    });
  },
  tx: function(obj){ try { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify([obj])); } catch(e){} },
  send: function(out, only){
    var self = this;
    Object.keys(this.devices).forEach(function(key){
      var d = self.devices[key], scal = [];
      // Игрушек может быть несколько: выключенную в панели не трогаем,
      // а если команда адресная (device="имя") — молчат все остальные.
      var skip = (C.devOff && C.devOff[d.name]) ||
                 (only && d.name.toLowerCase().indexOf(String(only).toLowerCase()) < 0);
      if (skip){
        self.tx({ StopDeviceCmd: { Id: self.msgId++, DeviceIndex: d.idx } });
        return;
      }
      // Раздельные моторы: первый мотор игрушки — вибрация, все следующие — второй.
      if (out.d){
        var n = 0;
        d.scalars.forEach(function(f){
          var lvl = n++ === 0 ? out.v : out.w;
          if (/inflat/i.test(f.type)) lvl = out.p || 0;
          scal.push({ Index: f.i, Scalar: pct(lvl), ActuatorType: f.type });
        });
        if (scal.length) self.tx({ ScalarCmd: { Id: self.msgId++, DeviceIndex: d.idx, Scalars: scal } });
        var второй = d.scalars.length ? out.w : out.v;
        if (d.rotate) self.tx({ RotateCmd: { Id: self.msgId++, DeviceIndex: d.idx, Rotations: [{ Index: 0, Speed: pct(второй), Clockwise: true }] } });
        if (d.linear && второй > 0){
          self.linPhase = self.linPhase ? 0 : 1;
          self.tx({ LinearCmd: { Id: self.msgId++, DeviceIndex: d.idx, Vectors: [{ Index: 0, Duration: Math.round(900 - 700 * pct(второй)), Position: self.linPhase ? 0.85 : 0.1 }] } });
        }
        return;
      }
      d.scalars.forEach(function(f){
        var lvl = out.v;
        if (/rotat/i.test(f.type)) lvl = out.r || out.v;
        else if (/constrict|suction/i.test(f.type)) lvl = out.s || out.v;
        else if (/inflat/i.test(f.type)) lvl = out.p || 0;
        else if (/oscillat/i.test(f.type)) lvl = out.t || out.v;
        scal.push({ Index: f.i, Scalar: pct(lvl), ActuatorType: f.type });
      });
      if (scal.length) self.tx({ ScalarCmd: { Id: self.msgId++, DeviceIndex: d.idx, Scalars: scal } });
      if (d.rotate) self.tx({ RotateCmd: { Id: self.msgId++, DeviceIndex: d.idx, Rotations: [{ Index: 0, Speed: pct(out.r || out.v), Clockwise: true }] } });
      if (d.linear){
        var lvl = out.t || out.v;
        if (lvl > 0){
          self.linPhase = self.linPhase ? 0 : 1;
          var dur = Math.round(900 - 700 * pct(lvl));           // чем сильнее, тем быстрее ход
          self.tx({ LinearCmd: { Id: self.msgId++, DeviceIndex: d.idx, Vectors: [{ Index: 0, Duration: dur, Position: self.linPhase ? 0.85 : 0.1 }] } });
        }
      }
    });
  },
  stop: function(){
    var self = this;
    Object.keys(this.devices).forEach(function(key){
      self.tx({ StopDeviceCmd: { Id: self.msgId++, DeviceIndex: self.devices[key].idx } });
    });
  },
  disconnect: function(){
    clearInterval(this.pingTimer); this.pingTimer = null;
    clearInterval(this.battTimer); this.battTimer = null;
    clearInterval(this.keepTimer); this.keepTimer = null;
    try { this.stop(); } catch(e){}
    try { if (this.ws) { this.ws.onclose = null; this.ws.close(); } } catch(e){}
    this.ws = null; this.devices = {}; this.state = 'off'; this.info = '';
  },
  devLabel: function(){
    var n = Object.keys(this.devices).map(function(k){ return this.devices[k].name; }, this);
    return n.length ? n.join(', ') : 'игрушек не видно — нажми «Искать» в Intiface';
  }
};

/* ── Lovense Remote, режим Game Mode: локальный HTTP API, без всякого партнёрства ── */
DRV.lovense = {
  id: 'lovense', label: 'Lovense Remote',
  caps: ['v','r','p','s','t'], state: 'off', info: '', toys: {}, lastAction: '',
  url: function(){
    var ip = String(C.lvIp || '127.0.0.1').trim(), port = String(C.lvPort || '20010').trim();
    var n = parseInt(port, 10);
    if (n >= 20000 && n < 30000) return 'http://' + ip + ':' + port + '/command';
    // 30010 — HTTPS-порт, сертификат Lovense выписан на *.lovense.club
    if (ip === 'localhost') ip = '127.0.0.1';
    return 'https://' + ip.replace(/\./g, '-') + '.lovense.club:' + port + '/command';
  },
  post: function(body){
    return fetch(this.url(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function(r){ return r.json(); });
  },
  connect: function(){
    var self = this; this.state = 'connecting'; this.info = 'проверяю…';
    return this.post({ command: 'GetToys' }).then(function(j){
      if (j && j.code === 200 && j.data && j.data.toys){
        var toys = typeof j.data.toys === 'string' ? JSON.parse(j.data.toys) : j.data.toys;
        self.toys = toys || {};
        var names = Object.keys(self.toys).map(function(id){ return self.toys[id].name + (self.toys[id].battery != null ? ' ' + self.toys[id].battery + '%' : ''); });
        self.state = 'on'; self.info = names.join(', ') || 'подключено';
        return true;
      }
      self.state = 'error';
      self.info = j && j.code === 401 ? 'приложение отвечает, но игрушка не найдена'
                : j && j.code === 402 ? 'игрушка найдена, но не подключена по Bluetooth'
                : 'неожиданный ответ: ' + (j && j.code);
      return false;
    }).catch(function(e){
      self.state = 'error';
      self.info = 'нет связи (' + String(e.message || e).slice(0, 60) + '). Включи Game Mode в Lovense Remote и проверь адрес/порт.';
      return false;
    });
  },
  disconnect: function(){ this.stop(); this.toys = {}; this.state = 'off'; this.info = ''; },
  send: function(out){
    /* Свой ритм, паттерны и разбор по словам пишут уровень в вибрацию. У Intiface
       остальные моторы подхватывают его сами (см. send выше), а Lovense крутит
       только то, что назвали. Поэтому вращение, всасывание и толчки, которым
       ничего не назначили, идут следом за вибрацией. Накачку не трогаем: её
       включают только прямо. */
    var есть = {};
    var toys = this.toys || {};
    Object.keys(toys).forEach(function(id){
      (LOVENSE_CAPS[String(toys[id].name || '').toLowerCase()] || 'v').split('').forEach(function(c){ есть[c] = 1; });
    });
    var за = function(c){ return out[c] || (есть[c] ? out.v : 0); };
    var a = [];
    if (out.d){
      // Раздельные моторы: у двухвибраторных — Vibrate1/2, у остальных второй мотор — их вторая функция.
      var буквы = '';
      Object.keys(toys).forEach(function(id){ буквы = буквы || (LOVENSE_CAPS[String(toys[id].name || '').toLowerCase()] || 'v'); });
      var вт = буквы.charAt(1), L = function(x){ return Math.round(clamp(x, 0, 20)); };
      if (вт === 'v') a.push('Vibrate1:' + L(out.v), 'Vibrate2:' + L(out.w));
      else {
        a.push('Vibrate:' + L(out.v));
        if (вт === 'r') a.push('Rotate:' + L(out.w));
        if (вт === 's') a.push('Suction:' + L(out.w));
        if (вт === 't') a.push('Thrusting:' + L(out.w));
        if (вт === 'p') a.push('Pump:' + Math.round(clamp(out.w / 20 * 3, 0, 3)));
      }
      if (!out.v && !out.w) return this.stop();
      this.post({ command: 'Function', action: a.join(','), timeSec: 6, apiVer: 1 }).catch(function(){});
      return;
    }
    if (out.v) a.push('Vibrate:' + Math.round(clamp(out.v, 0, 20)));
    if (за('r')) a.push('Rotate:' + Math.round(clamp(за('r'), 0, 20)));
    if (out.p) a.push('Pump:' + Math.round(clamp(out.p / 20 * 3, 0, 3)));
    if (за('s')) a.push('Suction:' + Math.round(clamp(за('s'), 0, 20)));
    if (за('t')) a.push('Thrusting:' + Math.round(clamp(за('t'), 0, 20)));
    if (!a.length) return this.stop();
    // timeSec=6 при пульсе раз в 3 секунды: если панель умрёт, игрушка сама затихнет.
    this.post({ command: 'Function', action: a.join(','), timeSec: 6, apiVer: 1 }).catch(function(){});
  },
  stop: function(){ this.post({ command: 'Function', action: 'Stop', timeSec: 0, apiVer: 1 }).catch(function(){}); }
};

/* ── произвольный вебхук: XToys, Home Assistant, свой мост, ESP32… ── */
DRV.webhook = {
  id: 'webhook', label: 'Свой вебхук / мост',
  caps: ['v','r','p','s','t'], state: 'off', info: '',
  connect: function(){
    var u = String(C.hookUrl || '').trim();
    if (!/^https?:\/\//i.test(u)) { this.state = 'error'; this.info = 'нужен полный адрес http(s)://…'; return Promise.resolve(false); }
    this.state = 'on'; this.info = u.slice(0, 48); return Promise.resolve(true);
  },
  disconnect: function(){ this.stop(); this.state = 'off'; this.info = ''; },
  fire: function(out){
    var u = String(C.hookUrl || '').trim();
    if (!u) return;
    var lvl = Math.round(clamp(out.v, 0, 20));
    var sub = function(s){
      return s.replace(/\{v\}/g, lvl).replace(/\{pct\}/g, Math.round(pct(lvl) * 100))
              .replace(/\{r\}/g, Math.round(out.r)).replace(/\{p\}/g, Math.round(out.p))
              .replace(/\{s\}/g, Math.round(out.s)).replace(/\{t\}/g, Math.round(out.t))
              .replace(/\{v2\}/g, Math.round(out.d ? out.w : lvl));
    };
    if (String(C.hookMethod).toUpperCase() === 'GET'){
      fetch(sub(u), { method: 'GET', mode: 'no-cors' }).catch(function(){});
    } else {
      fetch(sub(u), { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ v: lvl, v2: Math.round(out.d ? out.w : lvl), pct: +(pct(lvl).toFixed(3)), rotate: out.r, pump: out.p, suction: out.s, thrust: out.t })
      }).catch(function(){});
    }
  },
  send: function(out){ this.fire(out); },
  stop: function(){ this.fire({ v: 0, r: 0, p: 0, s: 0, t: 0 }); }
};

function setDriver(id){
  if (D && D.id !== id) { try { D.disconnect(); } catch(e){} }
  D = DRV[id] || DRV.phone;
  C.driver = D.id; saveCfg();
  // телефону нечего подключать — он готов сразу
  if (D.id === 'phone') Promise.resolve(D.connect()).then(function(){ startEngine(); buildPrompt(); paintStatus(); });
  buildPrompt(); paintStatus();
}

/* ═══════════════ движок ═══════════════ */

var E = {
  aiOn: false,          // «персонаж управляет» (панельный тумблер)
  prog: [], i: 0, stepEnd: 0,
  live: { v: 0, r: 0, p: 0, s: 0, t: 0, w: 0 },
  hand: [0, 0],         // волны в шапке: сила первого и второго мотора
  smooth: { v: 0, r: 0, p: 0, s: 0, t: 0, w: 0 },   // сглаженный выход, чтобы не швыряло рывками
  manual: 0,            // ручной уровень с ползунка (перебивает программу, если >0)
  sessionStart: 0,
  lockUntil: 0,         // блок после стоп-слова
  lastOut: '', lastSendAt: 0,
  flow: { level: 0, until: 0, at: 0 },        // живой отклик на печатающийся текст
  devHold: 0,           // в сцене выключили игрушку — держим тишину, накал не слушаем
  waiting: 0,           // когда началось ожидание ответа модели (0 — не ждём)
  saved: null,          // сцена, отложенная на время отклика
  progLoop: null,       // петля этой программы; null — как настроено для сцен
  // Ты нажала паттерн, свой ритм или ползунок — значит, сейчас ведёшь ты.
  // Пока это так, автоматика молчит: ни живого отклика на печать, ни всплесков
  // на фетиш, ни отклика на твоё сообщение. Иначе они забивают друг друга.
  mine: false,
  tick: null
};

function capLevel(){ return clamp(host().capLevel, 0, 20); }

/* Каналы выхода. w — второй мотор: он слышен, только когда у шага стоит d
   (моторы идут раздельно). Иначе второй мотор, как и раньше, повторяет вибрацию. */
var КАН = ['v','r','p','s','t','w'];

function clearProg(){ E.prog = []; E.i = 0; E.stepEnd = 0; E.mine = false; }

function activeLevels(){
  var o = { v: 0, r: 0, p: 0, s: 0, t: 0, w: 0 };
  if (E.manual > 0){
    // Моторы на разной силе — каждому свою; на одинаковой — как обычно.
    if (motorCount() > 1 && E.hand[0] !== E.hand[1]){ o.v = E.hand[0]; o.w = E.hand[1]; o.d = 1; }
    else o.v = E.manual;
    return o;
  }

  /* Живой отклик: пока ответ печатается, ведём сцену по словам, которые
     только что появились. Это то, ради чего раньше были нужны теги, —
     только без промпта, без разметки в тексте и без правок в пресете. */
  if (!E.overlay && E.flow && E.flow.until > now()){
    var возраст = now() - E.flow.at;
    var k = 1 - 0.55 * clamp(возраст / 9000, 0, 1);        // плавно затухает
    o[mainChannel()] = E.flow.level * k;
    return o;
  }

  var st = E.prog[E.i];
  if (!st) return o;
  var ch = КАН;
  if (st.d) o.d = 1;
  var span = Math.max(1, st.ms), left = Math.max(0, E.stepEnd - now());
  var k = 1 - left / span;                       // 0..1 внутри шага
  // Усиление: модель или эвристика назначили уровень, а ты можешь его подкрутить.
  // На ручной ползунок не действует — там ты и так задаёшь ровно то, что хочешь.
  var g = clamp(C.gain || 1, 0.4, 2.5);
  for (var j = 0; j < ch.length; j++){
    var c = ch[j], a = st[c] || 0, b = (st.to && st.to[c] != null) ? st.to[c] : a;
    o[c] = (a + (b - a) * k) * g;                 // линейное нарастание внутри шага
  }
  return o;
}

/* ═══════════════ своеволие: отказ и непредсказуемость ═══════════════ */
/* Обе механики живут на границах шагов, а не переписывают программу:
   так они одинаково работают и для тегов на лету, и для готовых паттернов. */

function onStepStart(st){
  E.jitter = 1; E.pauseUntil = 0; E.denyLevel = 1;
  if (!E.spice || !st) return;

  var cap = capLevel();
  var chaos = clamp(C.chaos, 0, 100) / 100;
  var deny = clamp(C.deny, 0, 100) / 100;

  if (chaos){
    // чуть сильнее или чуть слабее, чем просили, и иногда короткая заминка
    E.jitter = 1 + (Math.random() * 2 - 1) * 0.3 * chaos;
    if (Math.random() < 0.12 * chaos) E.pauseUntil = now() + 700 + Math.random() * 900;
  }

  if (deny){
    var пик = Math.max(st.v || 0, st.r || 0, st.s || 0, st.t || 0, st.p || 0,
                       st.to ? Math.max(st.to.v || 0, st.to.s || 0, st.to.t || 0, st.to.r || 0) : 0);
    if (пик >= cap * 0.7 && Math.random() < deny){
      var тишина = 3500 + Math.random() * 3000;
      E.denyUntil = now() + тишина;
      E.denyLevel = 0.35;                 // после отказа возвращаемся вполсилы
      log('deny', 'отказ на пике — тишина ' + Math.round(тишина / 1000) + ' сек');
    }
  }
}

function engineTick(){
  var t = now();

  // автостоп по времени сессии
  var maxMin = host().maxMinutes;
  if (E.sessionStart && maxMin > 0 && t - E.sessionStart > maxMin * 60000){
    panic('автостоп: ' + maxMin + ' мин');
    return;
  }

  // на паузе (свернули приложение) железо молчит, но сцена стоит на месте
  if (E.paused){ paintMeter(); return; }

  // продвижение программы
  if (!E.manual && E.prog.length){
    if (t >= E.stepEnd){
      E.i++;
      if (E.i >= E.prog.length){
        // Паттерн и свой ритм крутятся по своей настройке, сцена — по общей.
        var покругу = E.progLoop != null ? E.progLoop : C.loop;
        if (E.overlay){ restoreScene(); }          // отклик доиграл — возвращаем сцену
        else if (покругу && E.prog.length){ E.i = 0; }
        else {
          if (E.mine) log('pat', 'отыграло — сцену снова ведёт персонаж');
          clearProg();                             // clearProg снимает и метку «ведёшь ты»
        }
      }
      var st = E.prog[E.i];
      E.stepEnd = st ? t + st.ms : 0;
      onStepStart(st);
    }
  }

  var out = activeLevels(), cap = capLevel();
  if (t < E.lockUntil) out = { v: 0, r: 0, p: 0, s: 0, t: 0, w: 0 };

  // Своеволие применяем только к сцене: ручной ползунок и свой ритм остаются точными.
  if (!E.manual && E.spice){
    if ((E.denyUntil && t < E.denyUntil) || (E.pauseUntil && t < E.pauseUntil)){
      out = { v: 0, r: 0, p: 0, s: 0, t: 0, w: 0 };
    } else {
      var k = (E.jitter || 1) * (E.denyLevel || 1);
      if (k !== 1) КАН.forEach(function(c){ out[c] *= k; });
    }
  }

  // Пока модель думает (а это бывает и полторы минуты), сцена не должна ни обрываться,
  // ни бубнить одним уровнем: тихонько «дышим» вокруг него, а на совсем долгом
  // ожидании гасим — значит, что-то зависло.
  if (E.waiting){
    var waited = t - E.waiting;
    if (waited > (C.waitMaxSec || 180) * 1000){
      E.waiting = 0;
      allStop('ответа нет дольше ' + Math.round((C.waitMaxSec || 180) / 60) + ' мин');
      return;
    }
    if (C.breathe){
      var k = 0.88 + 0.12 * (0.5 + 0.5 * Math.sin(waited / 4200));   // ±12% за ~26 секунд
      КАН.forEach(function(c){ out[c] *= k; });
    }
    // Совсем пусто — держим затишье, чтобы пауза не была мёртвой.
    if (C.idleLevel > 0 && !E.manual && out.v + out.r + out.p + out.s + out.t < 0.5){
      out[mainChannel()] = C.idleLevel;
    }
  }

  // Мягкий вход после подключения: за две секунды поднимаемся с нуля до нужного,
  // чтобы игрушка не включалась на полную ровно в момент связи.
  if (E.softStart && t < E.softStart){
    var вход = 1 - (E.softStart - t) / 2000;
    КАН.forEach(function(c){ out[c] *= Math.max(0, вход); });
  }

  КАН.forEach(function(c){ out[c] = clamp(out[c], 0, cap); });

  // Плавность: уровень идёт к цели шагами, а не прыжком. 0 — как было, мгновенно.
  var soft = clamp(C.smooth || 0, 0, 100);
  if (soft > 0){
    var rate = cap / (1 + soft / 12);            // сколько единиц можно пройти за такт
    КАН.forEach(function(c){
      var d = (out[c] || 0) - (E.smooth[c] || 0);
      E.smooth[c] = (E.smooth[c] || 0) + clamp(d, -rate, rate);
      out[c] = E.smooth[c];
    });
  } else {
    КАН.forEach(function(c){ E.smooth[c] = out[c]; });
  }

  КАН.forEach(function(c){ out[c] = Math.round(clamp(out[c], 0, cap)); });

  // Для капризных игрушек огрубляем шкалу вдвое: 0,2,4… Нарастание на слух то же,
  // а команд по Bluetooth в разы меньше — рвать связь становится нечему.
  if (fragileToy() || C.gentle){
    КАН.forEach(function(c){
      if (out[c] > 0) out[c] = Math.max(1, Math.round(out[c] / 2) * 2);
    });
  }
  E.live = out;

  var only = (!E.manual && E.prog[E.i]) ? E.prog[E.i].only : null;
  var sig = out.v + '|' + out.r + '|' + out.p + '|' + out.s + '|' + out.t + '|' + (out.d ? out.w + 'd' : '') + '|' + (only || '');
  var any = out.v + out.r + out.p + out.s + out.t + (out.d ? out.w : 0) > 0;
  // Периодичность «подтверждения» команды. Satisfyer и часть других игрушек глохнут,
  // если им несколько секунд ничего не приходит, поэтому по Intiface повторяем чаще.
  var beat = !D ? 4000 : D.id === 'phone' ? 220 : D.id === 'lovense' ? 3000 : D.id === 'intiface' ? 2000 : 4000;
  var stale = t - E.lastSendAt > beat;

  // Не частим по Bluetooth. Часть игрушек (Satisfyer особенно) захлёбывается
  // и роняет соединение, если сыпать командами каждые 250 мс. Промежуточные
  // значения просто пропускаем — следующий такт отправит то, что накопилось.
  var minGap = D && D.id === 'phone' ? 0 : (C.gentle || fragileToy() ? 1000 : 380);
  var gapOk = (t - E.lastSendAt) >= minGap;
  var quietNow = !any;                       // тишину шлём сразу, без задержек

  // Intiface сам шлёт игрушке keepalive, поэтому частые повторы «на всякий случай»
  // ему только мешают: по этому каналу отправляем строго при смене уровня.
  if (D && D.id === 'intiface') stale = false;

  // Но совсем молчать тоже нельзя. Bluetooth-игрушка, которой давно ничего не
  // приходило, уходит в сон и роняет связь — Satisfyer делает это через пару
  // минут простоя, и как раз поэтому она «отваливалась», пока лежала на нуле.
  // Поэтому раз в десять секунд повторяем текущий уровень, даже если это ноль:
  // шесть команд в минуту, захлебнуться тут нечем, а канал остаётся живым.
  var тепло = D && D.id === 'intiface' && (t - E.lastSendAt) > 10000;

  if (D && D.state === 'on' && (sig !== E.lastOut || (any && stale) || тепло) && (gapOk || quietNow)){
    E.lastOut = sig; E.lastSendAt = t;
    // На «грелке» шлём обычную команду с нулями, а не Stop: Stop у части прошивок
    // означает «разговор окончен», и следом игрушка засыпает.
    try { (any || тепло) ? D.send(out, only) : D.stop(); } catch(e){}
  }
  // «сессия» = отрезок работы; паузы внутри паттерна её не сбрасывают,
  // счётчик автостопа обнуляет только 20 секунд настоящей тишины
  if (any){ E.lastActive = t; if (!E.sessionStart) E.sessionStart = t; }
  else if (E.sessionStart && t - (E.lastActive || 0) > 20000) E.sessionStart = 0;
  pushHist(Math.max(out.v, out.r, out.p, out.s, out.t, out.d ? out.w : 0));
  paintMeter();
}

function startEngine(){ if (!E.tick) E.tick = setInterval(engineTick, 250); wakeLockOn(); }
function stopEngine(){ if (E.tick) { clearInterval(E.tick); E.tick = null; } }

function playProgram(steps, fromIdx, opts){
  if (!steps || !steps.length) return;
  // Пока играет то, что ты выбрала рукой, сцена от модели её не сносит.
  // Иначе паттерн живёт до первого ответа персонажа — а это и есть «забивают друг друга».
  if (E.mine && !(opts && opts.mine)){
    if (!E.mineNoted){ E.mineNoted = 1; log('pat', 'играет твой ритм — сцену не перебиваю, нажми СТОП'); }
    return;
  }
  E.mineNoted = 0;
  E.overlay = false; E.saved = null;             // новая сцена главнее отклика
  E.flow = { level: 0, until: 0, at: 0 };        // и главнее живого отклика на печать
  E.prog = steps;
  E.i = clamp(fromIdx || 0, 0, steps.length - 1);
  E.stepEnd = now() + (steps[E.i] ? steps[E.i].ms : 0);
  E.manual = 0;
  // Своеволие уместно в сцене, но не там, где ты задала ритм сама.
  E.spice = !(opts && opts.exact);
  E.mine = !!(opts && opts.mine);
  // Своя петля для этой программы. null — значит «как настроено для сцен».
  E.progLoop = (opts && opts.loop != null) ? !!opts.loop : null;
  E.denyUntil = 0;
  onStepStart(steps[E.i]);
  startEngine();
}

/* Отклик: короткая вставка поверх сцены. Доиграет — вернёмся ровно туда,
   где прервались, чтобы твоё сообщение не стирало то, что уже шло. */
function playOverlay(steps){
  if (!steps || !steps.length) return;
  if (!E.overlay){
    E.saved = E.prog.length ? { prog: E.prog, i: E.i, left: Math.max(0, E.stepEnd - now()) } : null;
  }
  E.overlay = true;
  E.prog = steps; E.i = 0;
  E.stepEnd = now() + steps[0].ms;
  E.manual = 0;
  startEngine();
}

function restoreScene(){
  E.overlay = false;
  var s = E.saved; E.saved = null;
  if (s && s.prog && s.prog.length){
    E.prog = s.prog; E.i = s.i;
    E.stepEnd = now() + Math.max(200, s.left || 0);
  } else {
    clearProg();
  }
}

function allStop(reason){
  clearProg(); E.manual = 0; E.hand = [0, 0]; E.paused = false; E.live = { v: 0, r: 0, p: 0, s: 0, t: 0, w: 0 };
  E.overlay = false; E.saved = null; E.waiting = 0; E.mine = false; E.devHold = 0;
  E.denyUntil = 0; E.pauseUntil = 0; E.jitter = 1; E.denyLevel = 1;
  E.flow = { level: 0, until: 0, at: 0 };
  E.smooth = { v: 0, r: 0, p: 0, s: 0, t: 0, w: 0 };   // стоп должен быть мгновенным, без плавности
  E.lastOut = ''; E.sessionStart = 0;
  try { if (D) D.stop(); } catch(e){}
  paintMeter();
  if (reason) log('stop', 'стоп — ' + reason);
}

function panic(reason){
  allStop(reason || 'паника');
  E.aiOn = false;
  try { wakeLockOff(); } catch(e){}
  E.lockUntil = now() + 3000;
  buildPrompt(); paintStatus(); paintMeter();
  toast('PUSYA VIBE: всё остановлено');
}
PV.panic = panic;

/* ═══════════════ экран и фон ═══════════════ */

var wl = null;                                   // замок против гашения экрана
function wakeLockOn(){
  try {
    if (!C.keepAwake || wl || pdoc.hidden) return;
    if (!navigator.wakeLock || !navigator.wakeLock.request) return;
    navigator.wakeLock.request('screen').then(function(s){
      wl = s;
      try { s.addEventListener('release', function(){ wl = null; }); } catch(e){}
    }).catch(function(){});
  } catch(e){}
}
function wakeLockOff(){ try { if (wl) wl.release(); } catch(e){} wl = null; }

function onHide(){
  E.hidAt = now();
  if (C.bgKeep){
    // Уровень останется последним: система замораживает таймеры, программа дальше не идёт.
    log('bg', 'ушла в фон — уровень замер на ' + Math.round(E.live.v) + '/20');
    return;
  }
  // Железо глушим сразу, но сцену не стираем: вернёшься — доиграет с того же места.
  E.paused = true; E.lastOut = '';
  try { if (D) D.stop(); } catch(e){}
  E.live = { v: 0, r: 0, p: 0, s: 0, t: 0, w: 0 };
  if (E.prog.length) log('bg', 'пауза — сцена дождётся возвращения');
}

/* ═══════════════ автоподключение ═══════════════ */
/* Кнопку «Подключить» жать не нужно: плагин сам стучится в мост при открытии чата,
   при возвращении в Таво и после обрыва. Попыток немного и они затухают, чтобы не
   долбиться в пустоту, если Intiface вообще не запущен. */

var autoTries = 0, autoTimer = null;

function autoConnect(){
  clearTimeout(autoTimer);
  if (!C.autoConnect || !D) return;
  if (D.id === 'phone' || D.state === 'on' || D.state === 'connecting') return;
  if (autoTries >= 4) return;
  autoTries++;
  Promise.resolve(D.connect()).then(function(ok){
    if (ok){
      autoTries = 0;
      startEngine(); buildPrompt(); paintStatus();
      log('conn', 'подключилась сама: ' + (D.info || D.label));
      return;
    }
    paintStatus();
    if (autoTries === 1) log('conn', 'моста пока нет — попробую ещё пару раз');
    autoTimer = setTimeout(autoConnect, autoTries * 8000);
  }).catch(function(){});
}

// Новая попытка уместна там, где что-то изменилось: вернулась в приложение,
// открыла чат, включила тумблер. Тогда и счётчик попыток обнуляем.
function autoConnectAgain(){ autoTries = 0; autoConnect(); }

function onWake(){
  wakeLockOn();
  if (E.hidAt){
    var away = now() - E.hidAt; E.hidAt = 0;
    var maxMin = host().maxMinutes;
    if (maxMin > 0 && away > maxMin * 60000){ E.paused = false; panic('в фоне дольше автостопа'); return; }
    if (E.paused){
      E.paused = false;
      E.stepEnd += away;                    // шаг не должен «проскочить», пока нас не было
      E.lastOut = '';
      if (E.prog.length) log('bg', 'продолжаю сцену');
    }
    if (away > 3000 && !E.prog.length) log('bg', 'вернулись через ' + Math.round(away / 1000) + ' с');
  }
  // Пока приложение спало, сокет мог порваться — поднимаем молча.
  autoConnectAgain();
}

/* ═══════════════ команды ИИ ═══════════════ */

var WORD = { 'слабо': 5, 'нежно': 5, 'мягко': 6, 'средне': 11, 'сильно': 16, 'максимум': 20, 'макс': 20,
             'low': 5, 'soft': 6, 'medium': 11, 'high': 16, 'max': 20, 'off': 0, 'стоп': 0 };

function lvl(x, def){
  if (x == null || x === '') return def;
  var s = String(x).trim().toLowerCase();
  if (WORD[s] != null) return WORD[s];
  var m = /^(\d+)/.exec(s);
  if (!m) return def;
  var n = parseInt(m[1], 10);
  if (/%/.test(s)) n = Math.round(n / 5);          // «60%» → 12
  return clamp(n, 0, 20);
}
function secs(x, def){ var n = parseFloat(x); return isNaN(n) ? def : clamp(n, 0.5, 300); }

function step(o, sec){
  return {
    v: o.v || 0, r: o.r || 0, p: o.p || 0, s: o.s || 0, t: o.t || 0, w: o.w || 0, d: o.d ? 1 : 0,
    ms: Math.round(secs(sec, 5) * 1000), to: o.to || null,
    only: o.only || null                          // адресная команда: device="имя"
  };
}

/* локальные паттерны — не зависят от пресетов конкретного бренда */
var PRESETS = {
  'волна':    function(a, sec){ var out = [], n = Math.max(2, Math.round(sec / 3)); for (var i = 0; i < n; i++){ out.push(step({ v: 3, to: { v: a } }, 1.5)); out.push(step({ v: a, to: { v: 3 } }, 1.5)); } return out; },
  'пульс':    function(a, sec){ var out = [], n = Math.max(2, Math.round(sec)); for (var i = 0; i < n; i++){ out.push(step({ v: a }, 0.6)); out.push(step({ v: 0 }, 0.4)); } return out; },
  'крещендо': function(a, sec){ return [step({ v: 2, to: { v: a } }, sec)]; },
  'прибой':   function(a, sec){ var out = [], n = Math.max(1, Math.round(sec / 10)); for (var i = 0; i < n; i++){ out.push(step({ v: 4, to: { v: a } }, 7)); out.push(step({ v: a }, 2)); out.push(step({ v: 0 }, 1)); } return out; },
  'сердцебиение': function(a, sec){ var out = [], n = Math.max(2, Math.round(sec / 1.4)); for (var i = 0; i < n; i++){ out.push(step({ v: a }, 0.25), step({ v: 0 }, 0.15), step({ v: a }, 0.25), step({ v: 0 }, 0.75)); } return out; },
  'фейерверк': function(a, sec){ var out = [], n = Math.max(2, Math.round(sec / 1.2)); for (var i = 0; i < n; i++){ out.push(step({ v: Math.round(a * (0.4 + Math.random() * 0.6)) }, 0.4 + Math.random() * 0.5), step({ v: Math.round(a * 0.2) }, 0.3)); } return out; },
  'дразнилка': function(a, sec){ var out = [], n = Math.max(1, Math.round(sec / 8)); for (var i = 0; i < n; i++){ out.push(step({ v: 4, to: { v: a } }, 5), step({ v: 0 }, 3)); } return out; }
};
var PRESET_ALIAS = { wave: 'волна', pulse: 'пульс', crescendo: 'крещендо', surf: 'прибой', heartbeat: 'сердцебиение',
  fireworks: 'фейерверк', tease: 'дразнилка', earthquake: 'фейерверк', 'волны': 'волна', 'пульсация': 'пульс' };

/* Паттерны считают свои циклы прикидкой, а минимальный шаг — полсекунды, поэтому
   «пульс» на минуту выходил на 66 секунд. Раз время теперь выставляет пользователь,
   оно должно совпадать: достраиваем повтором и подрезаем хвост ровно по месту. */
function makePreset(name, a, sec){
  var gen = PRESETS[name]; if (!gen) return null;
  var цель = Math.round(clamp(sec, 1, 600) * 1000);
  var steps = gen(a, sec) || [];
  if (!steps.length) return steps;

  var сумма = function(s){ return s.reduce(function(x, y){ return x + y.ms; }, 0); };
  var всего = сумма(steps);

  // Не дотянули — повторяем круг, пока не перевалит за цель.
  var круг = steps.slice(), защита = 0;
  while (всего < цель && защита++ < 200){
    for (var i = 0; i < круг.length && всего < цель; i++){
      var копия = {}; for (var k in круг[i]) копия[k] = круг[i][k];
      steps.push(копия); всего += копия.ms;
    }
  }

  // Перебрали — срезаем с конца, последний шаг укорачиваем.
  while (steps.length > 1 && всего - steps[steps.length - 1].ms >= цель){
    всего -= steps.pop().ms;
  }
  var лишку = всего - цель;
  if (лишку > 0){
    var last = steps[steps.length - 1];
    if (last.ms - лишку >= 200) last.ms -= лишку;
    else if (steps.length > 1) steps.pop();
  }
  return steps;
}

// Человеческими словами: что именно почувствуешь. Названия сами по себе не говорят ничего.
var PRESET_WHAT = {
  'волна':        'плавно вверх и плавно вниз, без пауз — ровное дыхание',
  'пульс':        'короткие толчки: чуть больше полсекунды работы, полсекунды тишины',
  'крещендо':     'один долгий подъём с самого низа до потолка, и всё',
  'прибой':       'семь секунд накат до потолка, две секунды держит, секунда полной тишины',
  'сердцебиение': 'тук-тук — два коротких удара и пауза почти на секунду',
  'фейерверк':    'рвано и случайно: каждый раз новая сила и новая длительность',
  'дразнилка':    'пять секунд вверх почти до потолка — и три секунды в ноль'
};

function parseAttrs(s){
  var a = {}, re = /([a-zA-Zа-яё_]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>\/\]]+))/gi, m;
  while ((m = re.exec(s))) a[m[1].toLowerCase()] = (m[2] != null ? m[2] : (m[3] != null ? m[3] : m[4]));
  return a;
}

// «t» тут нет намеренно: это время команды, а не канал.
var CH_ALIAS = { v: 'v', vib: 'v', vibrate: 'v', вибро: 'v', intensity: 'v', i: 'v',
  r: 'r', rot: 'r', rotate: 'r', вращение: 'r',
  p: 'p', pump: 'p', помпа: 'p',
  s: 's', suction: 's', suck: 's',
  thrust: 't', thrusting: 't', stroke: 't', фрикции: 't' };

/* Возвращает массив команд, каждая — массив шагов. */
function parseCmds(text){
  var cmds = [], m;
  // (?![a-zA-Zа-яё]) — чтобы <vibes>, <vibecheck> и прочее чужое не считалось командой
  var re = /<\s*vibe(?![a-zA-Zа-яё])\s*:?\s*([a-zA-Zа-яё_]*)\s*([^<>]*?)\/?\s*>/gi;
  var src = String(text || '');
  while ((m = re.exec(src))) cmds.push(oneCmd(m[1] || '', m[2] || ''));
  // запасной формат — модели любят ломать XML: [vibe v=12 t=6]
  var re2 = /\[\s*vibe(?![a-zA-Zа-яё])\s*:?\s*([a-zA-Zа-яё_]*)\s*([^\]]*?)\]/gi;
  while ((m = re2.exec(src))) cmds.push(oneCmd(m[1] || '', m[2] || ''));
  return cmds.filter(Boolean);
}

function oneCmd(action, rest){
  action = String(action).toLowerCase();
  var attrs = parseAttrs(rest);
  var sh = /^\s*=\s*["']?([^"'<>\/\]\s]+)/.exec(rest);      // <vibe:v="12"/>
  if (sh && action) attrs[action] = sh[1];
  var cap = capLevel();
  var sec = secs(attrs.t || attrs.time || attrs.duration || attrs['сек'], 8);

  if (action === 'stop' || action === 'стоп' || attrs.stop != null) return [step({}, 0.5)];

  if (action === 'preset' || action === 'pattern' || action === 'паттерн'){
    var nm = String(attrs.name || attrs['имя'] || '').toLowerCase().trim();
    nm = PRESET_ALIAS[nm] || nm;
    if (!PRESETS[nm]) nm = 'волна';
    return makePreset(nm, Math.min(cap, lvl(attrs.v || attrs.max, cap)), sec);
  }

  if (action === 'wave' || action === 'ramp' || action === 'волна' || attrs.from != null){
    var a = lvl(attrs.from || attrs.min, 3), b = lvl(attrs.to || attrs.max, cap);
    return [step({ v: a, to: { v: b } }, sec)];
  }

  if (action === 'pulse' || action === 'пульс'){
    var pv = lvl(attrs.v || attrs.vibrate || attrs.level, 12);
    var on = secs(attrs.on, 0.6), off = secs(attrs.off, 0.4);
    var out = [], n = Math.max(1, Math.round(sec / (on + off)));
    for (var i = 0; i < n; i++){ out.push(step({ v: pv }, on)); out.push(step({ v: 0 }, off)); }
    return out;
  }

  // обычная команда / комбо: <vibe:v="12" t="6"/>, <vibe:combo v="10" r="6"/>
  var o = {}, got = false;
  for (var key in attrs){
    var ch = CH_ALIAS[key];
    if (!ch) continue;
    o[ch] = lvl(attrs[key], 0); got = true;
  }
  if (!got && CH_ALIAS[action]) { o[CH_ALIAS[action]] = lvl(attrs[action] || attrs.level || attrs.intensity, 10); got = true; }
  if (!got) return null;
  if (attrs.device || attrs['устройство']) o.only = String(attrs.device || attrs['устройство']);
  return [step(o, sec)];
}

// Наружу для отладки: PV._parse('<vibe:v="12" t="6"/>'), PV._E.live — что играет прямо сейчас.
PV._parse = parseCmds; PV._E = E; PV._play = playProgram; PV._overlay = playOverlay;

/* ═══════════════ инструкция персонажу ═══════════════ */

// ход = true только на твоём новом сообщении: тогда подсказка режиссёра
// расходуется, а паспорт игрушки отмечается рассказанным. Перерисовки панели
// (переключили тумблер, подключилась игрушка) промпт обновляют, но счётчики не трогают.
var lastUserText = '';
function buildPrompt(ход){
  /* В промпт уходит только то, что про прозу: напоминание о предпочтениях и
     просьба не комкать близкую сцену. Инструкций по устройству нет вообще —
     плагин читает сцену сам, не тратит токены на каждое сообщение и не лезет
     в твой пресет. Если теги всё же придут (их шлёт чей-то пресет) — исполним,
     но просить не будем. */
  // Подсказка режиссёра говорит о конкретной сцене — при ней общая фраза о темпе лишняя.
  var режиссёр = hintPrompt(ход);
  var куски = [toyPrompt(ход), fetishPrompt(), режиссёр || pacePrompt()].filter(Boolean);
  var p = куски.join('\n\n');
  try { pwin.__pv_prompt = p; window.__pv_prompt = p; } catch(e){}
  try { var хук = window.__pv_onPrompt || (pwin && pwin.__pv_onPrompt); if (хук) хук(p); } catch(e){}
}

// Горячая ли сейчас сцена: по живому отклику, недавнему фетишу или играющей программе.
function сценаГорячая(){
  return !!((E.flow && E.flow.until > now() && E.flow.level >= 6) ||
            (F.at && now() - F.at < 120000 && F.intensity >= 2) ||
            (E.prog.length && Math.max(E.live.v, E.live.s, E.live.t, E.live.r) >= capLevel() * 0.5));
}

function кемЗовут(){
  return (NAMES.user && NAMES.user !== 'ты') ? NAMES.user : 'пользователя';
}

/* ═══════════════ паспорт игрушки для персонажа ═══════════════ */
/* Основная модель не знает, что на том конце настоящая игрушка и какая. Без
   этого в сцене появляется «вибратор» вообще — а у неё мастурбатор, или
   вакуумная, у которой нечего «вводить». Плюс подсказываем, какими словами
   персонаж может её включать — плагин эти слова понимает. */
var toyToldAt = 0;
function toyPrompt(ход){
  if (!C.toyTell || !D || D.state !== 'on') return '';
  var caps = toyCaps();
  if (!caps.known) return '';
  // Не каждый ответ: впервые после подключения, в горячей сцене и изредка между ними.
  var первый = !toyToldAt;
  if (!первый && !сценаГорячая() && (genCount % Math.max(1, C.fetEvery)) !== 0) return '';
  if (ход) toyToldAt = now();
  var описания = caps.kinds.map(function(p){
    var t = passportText(p);
    return t ? t + ' (' + p.name + ')' : p.name;
  });
  return '[Игрушка]\n' +
    'У ' + кемЗовут() + ' сейчас подключена настоящая игрушка: ' + описания.join('; ') + '. ' +
    'Умеет: ' + caps.brief + '.\n' +
    'Если игрушка появляется в сцене — описывай именно такую, с её формой и ощущениями. ' +
    'Не вводи её сам, если сцена к этому не ведёт.\n' +
    'Персонаж может управлять ею словами, и она отзовётся по-настоящему: включить, выключить, прибавить, убавить, ' +
    '«на минимум», «на максимум», «на вторую скорость», включить волну, пульсацию или дразнящий режим.\n' +
    'Не упоминай плагин и не пиши технических пометок.';
}

/* ═══════════════ подсказка режиссёра ═══════════════ */
/* Вторая модель и так читает сцену — пусть в том же запросе скажет одной
   фразой, куда вести следующий ответ. Бесплатно: запрос уже оплачен. */
var HINT = { text: '', at: 0, used: 0 };
function hintPrompt(ход){
  if (!C.hintOn || C.brain !== 'model' || !HINT.text) return '';
  if (now() - HINT.at > 10 * 60000 || HINT.used >= 2) return '';   // устаревшую не тащим
  if (ход) HINT.used++;
  return '[Направление сцены]\n' + HINT.text + '\nЭто про ход повествования — в тексте об этом не упоминай.';
}

function takeHint(reply){
  var m = /<\s*hint\s*>([\s\S]*?)<\s*\/\s*hint\s*>/i.exec(String(reply || ''));
  if (!m) return '';
  // Это уйдёт в промпт основной модели — только обычный текст, коротко.
  return m[1].replace(/<[^>]*>/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280);
}

/* ═══════════════ темп близкой сцены ═══════════════ */

/* «Всунул, кончил, вышел» — не потому что модель плохая, а потому что её никто
   не просил иначе. Просим. Коротко, только в горячих сценах и по очереди разными
   словами: одна и та же строчка из ответа в ответ перестаёт работать. */
var PACE = [
  'Не сворачивай близость в несколько строк. Веди её ступенями: подход, задержка, ' +
  'смена ритма, отступление, возврат. Между ступенями оставляй воздух — дыхание, взгляд, слово.',

  'Держи сцену дольше, чем просится. Дай телу передумать: замедлиться там, где ждут ускорения, ' +
  'и остановиться там, где ждут продолжения.',

  'Меняй в этом ответе хотя бы одно: темп, положение, кто ведёт, что именно делают руки. ' +
  'Не повторяй порядок действий из прошлого ответа.',

  'Финал не приближай сам. Пусть напряжение растёт и спадает несколько раз, ' +
  'прежде чем сцена куда-то придёт.'
];

function pacePrompt(){
  if (!C.paceHint) return '';
  // Просить «не торопись» посреди разговора о завтраке — верный способ получить
  // странный ответ. Поэтому только когда сцена уже горячая.
  if (!сценаГорячая()) return '';
  var i = Math.abs(genCount) % PACE.length;
  return '[Темп сцены]\n' + PACE[i] + '\nЭто про ритм повествования, а не указание персонажу — ' +
         'в тексте об этом не упоминай.';
}

/* ═══════════════ паспорт игрушки ═══════════════ */
/* Игрушки очень разные: одна только вибрирует, другая ещё и сосёт, третья крутит
   или толкается. Спрашиваем у самой игрушки, что она умеет, и рассказываем это
   тому, кто ведёт сцену — иначе персонаж просит всасывание у обычной вибропули. */

var CH_RU = { v: 'вибрация', r: 'вращение', s: 'всасывание', p: 'накачка', t: 'фрикции' };

// Lovense не рассказывает о себе — узнаём по названию модели.
var LOVENSE_CAPS = {
  'nora': 'vr', 'diamo': 'vr', 'ridge': 'vr',
  'max': 'vp', 'max 2': 'vp',
  'gravity': 'vt', 'sex machine': 'vt', 'mini sex machine': 'vt', 'solace': 'vt', 'solace pro': 'vt',
  'flexer': 'vt', 'tenera': 'vs', 'tenera 2': 'vs',
  'osci': 'vt', 'osci 2': 'vt', 'osci 3': 'vt',
  // два вибромотора: у них Vibrate1 и Vibrate2
  'edge': 'vv', 'edge 2': 'vv', 'dolce': 'vv', 'gemini': 'vv'
};

// Что вернётся: { ch:{v:2,s:1}, names:['Satisfyer Device'], brief:'вибрация ×2 + всасывание', known:true }
function toyCaps(){
  var ch = {}, names = [], known = false, kinds = [];
  var add = function(c, n){ if (!c) return; ch[c] = (ch[c] || 0) + (n || 1); };

  if (D && D.id === 'intiface'){
    var devs = DRV.intiface.devices;
    Object.keys(devs).forEach(function(k){
      var d = devs[k];
      if (C.devOff && C.devOff[d.name]) return;    // выключенную в панели не считаем
      names.push(d.name); known = true;
      var пасп = toyPassport(d.name, d); пасп.name = d.name; kinds.push(пасп);
      d.scalars.forEach(function(f){
        var ty = f.type, hint = (f.what || '').toLowerCase();
        if (/rotat/i.test(ty)) add('r');
        else if (/constrict/i.test(ty) || /suction|air|воздух/.test(hint)) add('s');
        else if (/inflat/i.test(ty)) add('p');
        else if (/oscillat|position/i.test(ty)) add('t');
        else add('v');
      });
      if (d.rotate) add('r');
      if (d.linear) add('t');
    });
  } else if (D && D.id === 'lovense'){
    var toys = DRV.lovense.toys || {};
    Object.keys(toys).forEach(function(id){
      var nm = String(toys[id].name || '').toLowerCase();
      names.push(toys[id].name || 'игрушка'); known = true;
      // Lovense отдаёт голое «lush» — добавляем марку, чтобы узнавалось как у Intiface
      var пасп = toyPassport(/lovense/.test(nm) ? nm : 'lovense ' + nm);
      if (C.toyKind && C.toyKind[toys[id].name]) пасп = toyPassport(toys[id].name);
      пасп.name = toys[id].name || 'игрушка'; kinds.push(пасп);
      var letters = LOVENSE_CAPS[nm] || 'v';
      letters.split('').forEach(function(c){ add(c); });
    });
  } else if (D && D.id === 'phone'){
    add('v'); names.push('вибромотор телефона'); known = true;
  } else if (D && D.id === 'webhook'){
    // Что там на том конце — знает только хозяин вебхука. Разрешаем всё.
    ['v','r','s','p','t'].forEach(function(c){ add(c); });
    names.push('своё устройство');
  }

  if (!Object.keys(ch).length) add('v');

  var brief = Object.keys(ch).map(function(c){
    return CH_RU[c] + (ch[c] > 1 ? ' ×' + ch[c] : '');
  }).join(' + ');

  return { ch: ch, names: names, brief: brief, known: known, kinds: kinds, has: function(c){ return !!ch[c]; } };
}

/* ═══════════════ что это за игрушка ═══════════════ */
/* Intiface рассказывает про моторы, но не про форму: вибропуля, кролик и
   мастурбатор для него одинаково «Vibrate». А персонажу нужно знать, что
   описывать, и кому она вообще предназначена. Угадываем по названию модели,
   а если не вышло или угадали не то — выбирает сама пользовательница. */

var TOY_KINDS = {
  'внешняя':     { ru: 'внешняя, для клитора',                 кто: 'она' },
  'кролик':      { ru: 'внутрь и снаружи сразу (кролик)',      кто: 'она' },
  'внутренняя':  { ru: 'вводится внутрь',                      кто: 'любой' },
  'пара':        { ru: 'для пары, носится во время близости',  кто: 'она' },
  'анальная':    { ru: 'анальная пробка',                      кто: 'любой' },
  'простата':    { ru: 'массажёр простаты',                    кто: 'он' },
  'мастурбатор': { ru: 'мастурбатор, надевается на член',      кто: 'он' },
  'кольцо':      { ru: 'эрекционное виброкольцо',              кто: 'он' },
  'машина':      { ru: 'секс-машина, толкается сама',          кто: 'любой' },
  'соски':       { ru: 'для сосков',                           кто: 'любой' },
  'пуля':        { ru: 'вибропуля или массажёр, куда приложишь', кто: 'любой' }
};

// Порядок важен: сначала узкие названия, потом общие слова.
var TOY_GUESS = [
  // Satisfyer: вакуумно-волновые — самая частая путаница, Intiface зовёт их просто «вибро»
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
  // Lovense
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
  // Kiiroo, We-Vibe, The Handy, Vorze, машины
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
  // общие слова в названии
  { re: /masturbat|stroker|fleshlight|onahole/, k: 'мастурбатор' },
  { re: /prostat/, k: 'простата' },
  { re: /nipple/, k: 'соски' },
  { re: /\bplug\b/, k: 'анальная' },
  { re: /cock\s*ring|\bring\b/, k: 'кольцо' },
  { re: /rabbit/, k: 'кролик' },
  { re: /suction|air\s*pulse|clit/, k: 'внешняя', air: true },
  { re: /\b(egg|bullet|wand)\b/, k: 'пуля' }
];

// { k, air, auto } — что это за игрушка. auto: угадано, а не выбрано руками.
function toyPassport(name, dev){
  var свой = C.toyKind && C.toyKind[name];
  if (свой) return { k: TOY_KINDS[свой.k] ? свой.k : '', air: !!свой.air, auto: false };
  var n = String(name || '').toLowerCase();
  for (var i = 0; i < TOY_GUESS.length; i++){
    if (TOY_GUESS[i].re.test(n)) return { k: TOY_GUESS[i].k, air: !!TOY_GUESS[i].air, auto: true };
  }
  // по названию не узнали — подсказывают моторы
  if (dev){
    var типы = (dev.scalars || []).map(function(f){ return f.type; }).join(' ');
    var air = /constrict/i.test(типы);
    if (dev.linear && !(dev.scalars || []).length) return { k: 'мастурбатор', air: false, auto: true };
    if (/oscillat/i.test(типы) && !/vibrat/i.test(типы)) return { k: 'машина', air: false, auto: true };
    if (air) return { k: 'внешняя', air: true, auto: true };
  }
  return { k: '', air: false, auto: true };
}

// Как сказать словами: «внешняя, для клитора; вакуумно-волновая».
function passportText(p){
  if (!p || !p.k) return p && p.air ? 'с воздушной стимуляцией' : '';
  var s = TOY_KINDS[p.k].ru;
  if (p.air) s += p.k === 'мастурбатор' ? '; сжимает воздушными камерами'
                                          : '; вакуумно-волновая — стимулирует потоком воздуха, без прямого касания';
  return s;
}

/* Сколько моторов можно вести раздельно (для волн и дорожек — не больше двух).
   У Intiface это скаляры плюс вращение и ход, у Lovense — функции модели. */
function motorCount(){
  var n = 1;
  if (D && D.id === 'intiface'){
    var devs = DRV.intiface.devices;
    Object.keys(devs).forEach(function(k){
      var d = devs[k];
      if (C.devOff && C.devOff[d.name]) return;
      n = Math.max(n, d.scalars.length + (d.rotate ? 1 : 0) + (d.linear ? 1 : 0));
    });
  } else if (D && D.id === 'lovense'){
    var toys = DRV.lovense.toys || {};
    Object.keys(toys).forEach(function(id){
      n = Math.max(n, (LOVENSE_CAPS[String(toys[id].name || '').toLowerCase()] || 'v').length);
    });
  }
  return Math.min(2, n);
}

// Есть ли среди подключённых игрушка с известной нелюбовью к плотному потоку команд.
function fragileToy(){
  if (!D || D.id !== 'intiface') return false;
  var devs = DRV.intiface.devices;
  return Object.keys(devs).some(function(k){ return devs[k].fragile; });
}

// Заряд самой слабой из подключённых игрушек — если она вообще о нём рассказывает.
function battNote(){
  var min = null;
  if (D && D.id === 'intiface'){
    var devs = DRV.intiface.devices;
    Object.keys(devs).forEach(function(k){
      var b = devs[k].batt;
      if (b != null && (min == null || b < min)) min = b;
    });
  } else if (D && D.id === 'lovense'){
    var toys = DRV.lovense.toys || {};
    Object.keys(toys).forEach(function(id){
      var b = parseInt(toys[id].battery, 10);
      if (!isNaN(b) && (min == null || b < min)) min = b;
    });
  }
  return min == null ? '' : ' · заряд ' + min + '%' + (min <= 15 ? ' ⚠' : '');
}

// На чём отыгрывать сцену, если модель не назвала канал: вибрация, а нет её — что есть.
function mainChannel(){
  var c = toyCaps().ch;
  if (c.v) return 'v';
  var order = ['t','s','r','p'];
  for (var i = 0; i < order.length; i++) if (c[order[i]]) return order[i];
  return 'v';
}

/* ═══════════════ мозг: кто решает интенсивность ═══════════════ */
/* Три режима.
   tags   — персонаж сам расставляет команды (нужна инструкция в промпте);
   model  — отдельный тихий вызов модели читает готовый ответ и строит программу;
   local  — та же работа локально по словам, без запросов и токенов. */

// Маркеры для локального режима: чем «горячее» слово, тем выше вес.
var MARK = [
  { w: 6,  src: 'касан|ладон|гладит|шепч|шёпот|поцелу|целу|прижим|обнима|мурашк|кожа|дыхани' },
  { w: 11, src: 'стон|выгиба|дрож|бедр|между ног|влажн|сосок|соски|язык|пальц|трётся|вцеп|кусает|задыха|сжима|бельё|обнаж' },
  { w: 17, src: 'глубже|быстрее|ещё сильнее|толчк|входит|внутри|содрога|умоля|на грани|не выдерж|срыва|оргазм|кончает|кончи|пик наслажд' }
];
var MARK_RE = MARK.map(function(g){ return { w: g.w, re: new RegExp('(^|[^а-яёА-ЯЁ])(' + g.src + ')', 'gi') }; });

/* Прямые команды словами.

   Персонаж говорит «сильнее», «медленнее», «замри» — и это не описание сцены,
   а приказ. Раньше шкала умела только расти: «быстрее» поднимало, а «медленнее»
   не делало ничего, потому что таких слов в словаре просто не было.

   Берём последнюю команду в куске текста: если он сказал «сильнее… нет, тише»,
   слушаемся второго. Отрицание проверяем первым, иначе «не останавливайся»
   прочиталось бы как «остановись». */
// «Не останавливайся» — это приказ продолжать. Вырезаем такие обороты из текста
// заранее, иначе внутри них найдётся «останавливайся» и прочитается наоборот.
var ORDER_NOT = /не\s+(?:смей\s+)?(?:останавлива[а-яё]*|останови[а-яё]*|прекраща[а-яё]*|переставай|тормози[а-яё]*)/gi;

var ORDERS_RE = [
  { d: 'вверх', re: 'сильн(?:ее|ей)|быстр(?:ее|ей)|глубже|ж[её]стче|резче|грубее' },
  { d: 'вниз',  re: 'медленн(?:ее|ей)|помедленн[а-яё]*|потише|тише|нежн(?:ее|ей)|осторожн(?:ее|ей)|полегче|мягче' },
  { d: 'стоп',  re: 'остановись|останови[а-яё]*|замри|не\\s+двигайся|перестань|хватит|подожди|погоди' }
].map(function(o){
  /* Хвост важен не меньше самого слова. «— Сильнее, — выдохнул он» — это приказ,
     а «он сильнее её физически» — описание. Разница в том, что после приказа
     фраза кончается: запятая, точка, тире, кавычка. Требуем этот хвост —
     и половина ложных срабатываний отваливается сама. */
  return { d: o.d, re: new RegExp('(?:^|[^а-яёА-ЯЁ])(?:' + o.re + ')(?=\\s*(?:[,.!?…:;»"”)\\-—]|$))', 'gi') };
});

// Вернёт последнюю команду в тексте или '' — если приказов там нет.
function orderOf(text){
  var t = String(text || ''), лучший = '', где = -1;
  ORDER_NOT.lastIndex = 0;
  var m;
  while ((m = ORDER_NOT.exec(t)) !== null){
    if (m.index > где){ где = m.index; лучший = 'вверх'; }
    // запрет вырезаем пробелами: позиции остальных слов не сдвинутся
    t = t.slice(0, m.index) + m[0].replace(/\S/g, ' ') + t.slice(m.index + m[0].length);
  }
  for (var i = 0; i < ORDERS_RE.length; i++){
    var re = ORDERS_RE[i].re; re.lastIndex = 0;
    var x;
    while ((x = re.exec(t)) !== null){
      if (x.index > где){ где = x.index; лучший = ORDERS_RE[i].d; }
      if (re.lastIndex === x.index) re.lastIndex++;
    }
  }
  return лучший;
}

/* ── Игрушка внутри сцены ──

   Отдельный слой, и самый прямой из всех. Одно дело — накал сцены, другое —
   когда персонаж в тексте берёт вибратор и щёлкает на нём переключателем.
   «Включил на максимум» должно включить на максимум, «выключил и отложил» —
   выключить, а не продолжать гудеть, потому что вокруг горячо.

   Чтобы не ловить «он выключил свет», требуем, чтобы слово-устройство стояло
   рядом — в пределах семидесяти символов от глагола. */

/* Осторожно с \w: в JS это [A-Za-z0-9_], кириллицу он не покрывает. Хвосты
   русских слов пишем явно — [а-яё]* — иначе «третью скорость» не найдётся. */
var СЛ = '[а-яё]*';

var DEV_RE = new RegExp('(?:вибратор|игрушк|вибропул|виброяйц|пробк|массаж[её]р|стимулятор|' +
  'пульт|вибрац|виброкольц|зажим|мастурбатор)' + СЛ, 'gi');

var DEV_ACTS = [
  { a: 'выкл', re: 'выключ|отключ|вырубил|убрал|вынул|отложил|отобрал|погасил' },
  { a: 'вкл',  re: 'включ|запустил|врубил|прижал|прижима|приставил|вставил|вв[ёе]л|ввела|над[ае]л|закрепил' },
  { a: 'выше', re: 'прибав|усилил|усилива|выкрутил|увеличил|подда|разогнал' },
  { a: 'ниже', re: 'убав|сбавил|снизил|уменьшил|ослабил|приглушил' }
].map(function(x){ return { a: x.a, re: new RegExp('(?:^|[^а-яё])(?:' + x.re + ')' + СЛ, 'gi') }; });

// Насколько именно выкрутил.
var DEV_LVL = [
  { k: 'макс', re: 'на\\s+максимум|до\\s+упора|на\\s+полную|на\\s+всю\\s+(?:катушку|мощность)|на\\s+самый\\s+сильн' },
  { k: 'сред', re: 'вполсилы|наполовину|на\\s+средн|на\\s+половин' },
  { k: 'мин',  re: 'на\\s+минимум|на\\s+самый\\s+слаб|на\\s+самую\\s+слаб|еле\\s+слышн|чуть\\s+слышн|на\\s+самую\\s+малую' }
].map(function(x){ return { k: x.k, re: new RegExp('(?:' + x.re + ')' + СЛ, 'gi') }; });

var DEV_ORD = new RegExp('(перв|втор|трет|четв[ёе]рт|пят)' + СЛ +
  '\\s+(?:скорост|режим|уровен|ступен|позици)' + СЛ, 'gi');
var DEV_PCT = new RegExp('(\\d{1,3})\\s*(?:%|процент' + СЛ + ')', 'gi');
var ORD_N = { 'перв': 1, 'втор': 2, 'трет': 3, 'четвёрт': 4, 'четверт': 4, 'пят': 5 };

// Названия режимов совпадают с готовыми паттернами — грех не воспользоваться.
var DEV_PRESET = [
  { p: 'волна',        re: new RegExp('волн' + СЛ, 'gi') },
  { p: 'пульс',        re: new RegExp('пульсац' + СЛ + '|пульсир' + СЛ + '|импульс' + СЛ + '|толчками', 'gi') },
  { p: 'крещендо',     re: new RegExp('крещендо|нарастающ' + СЛ, 'gi') },
  { p: 'прибой',       re: new RegExp('прибо' + СЛ, 'gi') },
  { p: 'сердцебиение', re: new RegExp('сердцебиен' + СЛ + '|как\\s+сердце', 'gi') },
  { p: 'дразнилка',    re: new RegExp('дразнящ' + СЛ, 'gi') }
];

/* Ищем по предложениям, а не по окну в символах. «Вибратор лежал в ящике.
   Через час он выключил компьютер» — два разных предложения, и склеивать их
   нельзя. Но «Он взял игрушку. Включил на максимум» — можно, поэтому
   упоминание устройства действует ещё на одно предложение вперёд. */
function deviceActOf(text){
  var t = String(text || '');
  if (!t) return null;

  var куски = [], последний = 0, i;
  for (i = 0; i < t.length; i++){
    if ('.!?…\n'.indexOf(t.charAt(i)) >= 0){
      while (i + 1 < t.length && '.!?…\n '.indexOf(t.charAt(i + 1)) >= 0) i++;
      куски.push(t.slice(последний, i + 1));
      последний = i + 1;
    }
  }
  if (последний < t.length) куски.push(t.slice(последний));

  var cap = capLevel();
  var акт = '', уровень = null, режим = null;
  var былоУстройство = false;

  var ищем = function(re, s){
    re.lastIndex = 0;
    var out = [], m;
    while ((m = re.exec(s)) !== null){
      out.push(m);
      if (re.lastIndex === m.index) re.lastIndex++;
    }
    return out;
  };

  /* Упоминание устройства действует ещё на одну фразу вперёд, но не безусловно:
     иначе «Вибратор лежал в ящике. Через час он выключил компьютер» прочиталось бы
     как «выключил вибратор». Во второй фразе должно быть либо местоимение на него
     («включил его»), либо указание силы («включил на максимум») — так пишут, когда
     речь всё ещё о нём. */
  var МЕСТ = /(?:^|[^а-яё])(?:его|е[ёе]|ей|им|ею|н[её]м|ней)(?:[^а-яё]|$)/i;
  var СИЛА = new RegExp('на\\s+(?:максимум|минимум|полную|средн|половин|самый|самую)|до\\s+упора|' +
    'вполсилы|наполовину|\\d{1,3}\\s*(?:%|процент)|(?:перв|втор|трет|четв|пят)' + СЛ +
    '\\s+(?:скорост|режим|уровен|ступен)', 'i');

  for (var s = 0; s < куски.length; s++){
    var фраза = куски[s];
    var своё = ищем(DEV_RE, фраза).length > 0;
    var можно = своё || (былоУстройство && (МЕСТ.test(фраза) || СИЛА.test(фраза)));
    былоУстройство = своё;
    if (!можно) continue;

    var j;
    for (j = 0; j < DEV_ACTS.length; j++){
      if (ищем(DEV_ACTS[j].re, фраза).length) акт = DEV_ACTS[j].a;
    }
    for (j = 0; j < DEV_LVL.length; j++){
      if (!ищем(DEV_LVL[j].re, фраза).length) continue;
      уровень = DEV_LVL[j].k === 'макс' ? cap
              : DEV_LVL[j].k === 'сред' ? Math.round(cap * 0.5)
              : Math.max(2, Math.round(cap * 0.2));
      if (!акт) акт = 'вкл';
    }
    var ord = ищем(DEV_ORD, фраза);
    for (j = 0; j < ord.length; j++){
      var n = ORD_N[String(ord[j][1]).toLowerCase()];
      if (n){ уровень = clamp(Math.round(cap * n / 5), 1, cap); if (!акт) акт = 'вкл'; }
    }
    var pct = ищем(DEV_PCT, фраза);
    for (j = 0; j < pct.length; j++){
      уровень = clamp(Math.round(cap * clamp(+pct[j][1], 0, 100) / 100), 0, cap);
      if (!акт) акт = 'вкл';
    }
    for (j = 0; j < DEV_PRESET.length; j++){
      if (!своё) continue;                            // режим называют там же, где и предмет
      if (ищем(DEV_PRESET[j].re, фраза).length){ режим = DEV_PRESET[j].p; if (!акт) акт = 'вкл'; }
    }
  }

  if (!акт) return null;
  return { act: акт, level: уровень, preset: режим };
}

function heatOf(text){
  var t = String(text || ''), hits = 0, top = 0, hot = 0;
  for (var i = 0; i < MARK_RE.length; i++){
    MARK_RE[i].re.lastIndex = 0;
    var n = (t.match(MARK_RE[i].re) || []).length;
    if (n){ hits += n; top = Math.max(top, MARK_RE[i].w); if (MARK_RE[i].w >= 17) hot += n; }
  }
  return { hits: hits, top: top, hot: hot };
}

// Строит программу по «температуре» сцены. null — сцена не интимная, трогать нечего.
function heuristic(text){
  var h = heatOf(text), cap = capLevel();
  if (h.hits < 2 || !h.top) return null;
  var target = Math.min(cap, h.top + (h.hits > 6 ? 2 : 0));
  var base = Math.max(2, Math.round(target * 0.35));
  // Играем на том канале, который у игрушки вообще есть: вибропуля вибрирует,
  // вакуумная — сосёт, машина — толкается.
  var c = mainChannel();
  var mk = function(a, to, sec){
    var o = {}; o[c] = a;
    if (to != null){ o.to = {}; o.to[c] = to; }
    return step(o, sec);
  };
  var steps = [ mk(base, target, 7), mk(target, null, 5), mk(Math.max(2, Math.round(target * 0.65)), null, 4), mk(target, null, 6) ];
  if (h.hot){                                   // сцена на пике — добавляем крещендо и спад
    steps.push(mk(target, cap, 7), mk(Math.round(cap * 0.3), null, 3));
  }
  return steps;
}

// ── аналитик: отдельный вызов модели ──
var GEN_TIMEOUT = 45000;
function modelAsk(prompt, sys){
  var ep = String(C.ep || '').trim().replace(/\/+$/, '');
  if (!/\/chat\/completions$/.test(ep)) ep += '/chat/completions';
  var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var tid = ctrl ? setTimeout(function(){ ctrl.abort(); }, GEN_TIMEOUT) : null;
  var opts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + String(C.key || '').trim() },
    body: JSON.stringify({
      model: String(C.model || '').trim(),
      messages: [{ role: 'system', content: sys }, { role: 'user', content: prompt }],
      temperature: 0.3, max_tokens: 320
    })
  };
  if (ctrl) opts.signal = ctrl.signal;
  return fetch(ep, opts).then(function(r){ return r.text(); }).then(function(txt){
    if (tid) clearTimeout(tid);
    var j; try { j = JSON.parse(txt); } catch(e){ throw new Error('ответ не-JSON — проверь адрес и ключ'); }
    var c = j && j.choices && j.choices[0] && j.choices[0].message;
    var out = c && c.content;
    if (!out) throw new Error('пустой ответ модели');
    return String(out);
  });
}

function genAsk(prompt, sys){
  if (C.ep && C.key && C.model) return modelAsk(prompt, sys);
  var T = TV();
  if (T && typeof T.generate === 'function'){
    return Promise.resolve(T.generate(sys + '\n\n' + prompt, { context: false })).then(function(r){
      return typeof r === 'string' ? r : (r && (r.content || r.text)) || '';
    });
  }
  return Promise.reject(new Error('аналитик не настроен: впиши эндпоинт, модель и ключ'));
}

function analystSys(){
  var cap = capLevel(), caps = toyCaps();
  var extra = '';
  if (caps.has('r')) extra += '<vibe:rotate="X" t="СЕК"/> — вращение\n';
  if (caps.has('s')) extra += '<vibe:suction="X" t="СЕК"/> — всасывание\n';
  if (caps.has('t')) extra += '<vibe:thrust="X" t="СЕК"/> — фрикции, движение\n';
  if (caps.has('p')) extra += '<vibe:pump="X" t="СЕК"/> — накачка\n';

  var паспорт = caps.kinds.map(function(p){
    var t = passportText(p); return p.name + (t ? ' — ' + t : '');
  }).join('; ');
  var режиссёр = C.hintOn;
  return 'Ты — управляющий модуль устройства в ролевой игре. Тебе дают последнее сообщение ' +
  'пользователя и ответ персонажа на него. Твоя работа: оценить, что происходит физически, и выдать программу ощущений' +
  (режиссёр ? ', а ещё одной фразой подсказать, куда вести следующий ответ' : '') + '.\n\n' +
  'Подключено: ' + (паспорт || caps.names.join(', ') || 'устройство') + '. Умеет: ' + caps.brief + '.\n' +
  'Пользуйся только этими возможностями — другого у устройства нет.\n\n' +
  'Отвечай ТОЛЬКО командами' + (режиссёр ? ' и одной строкой <hint>' : '') + ', без единого слова пояснений:\n' +
  (caps.has('v') ? '<vibe:v="X" t="СЕК"/> — ровная вибрация силой X (0-' + cap + ')\n' : '') +
  extra +
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
function analystInput(plain){
  var мне = String(lastUserText || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(-500);
  var пред = [];
  try {
    var her = charFetishes(), mine = ownFetishes();
    if (her.length) пред.push(NAMES.char + ': ' + her.map(function(x){ return x.name; }).join(', '));
    if (mine.length) пред.push(кемЗовут() + ': ' + mine.map(function(x){ return x.name; }).join(', '));
  } catch(e){}
  return (мне ? 'Сообщение пользователя:\n' + мне + '\n\n' : '') +
         'Ответ персонажа:\n' + plain +
         (C.hintOn && пред.length ? '\n\nПредпочтения — ' + пред.join('; ') : '');
}

var brainKey = '', brainBusy = false, brainTimer = null;

function runBrain(key, text){
  if (brainBusy || key === brainKey) return;
  // Играет твой ритм — не тратим на аналитика платный запрос, результат которого
  // всё равно некуда деть, и не помечаем ответ разобранным.
  if (E.mine){ log('brain', 'играет твой ритм — сцену не разбираю'); return; }
  brainKey = key;
  var plain = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(-1800);
  if (!plain) return;

  if (C.brain !== 'model'){
    var steps = heuristic(plain);
    if (!steps){ allStop('сцена спокойная'); log('brain', 'по тексту ничего горячего — тишина'); return; }
    playProgram(steps, 0);
    var h = heatOf(plain);
    log('brain', 'разбор по словам: накал ' + h.top + '/20, совпадений ' + h.hits);
    return;
  }

  // Фильтр перед запросом: на «пьют чай и обсуждают автобусы» токены не тратим.
  if (C.gate){
    var pre = heatOf(plain);
    if (pre.hits < 2){ allStop('сцена спокойная'); log('brain', 'сцена спокойная — запрос не отправляла'); return; }
  }

  brainBusy = true;
  log('brain', 'читаю сцену…');
  genAsk(analystInput(plain), analystSys()).then(function(reply){
    brainBusy = false;
    if (C.hintOn){
      var подсказка = takeHint(reply);
      if (подсказка){
        HINT = { text: подсказка, at: now(), used: 0 };
        log('brain', 'режиссёр: ' + подсказка.slice(0, 90));
      } else if (/<\s*hint\s*>\s*<\s*\/\s*hint\s*>/i.test(reply)){
        HINT = { text: '', at: 0, used: 0 };            // сцена не интимная — подсказывать нечего
      }
      buildPrompt();
    }
    var cmds = parseCmds(reply);
    if (!cmds.length){ log('brain', 'аналитик не дал команд — оставляю как есть'); return; }
    var steps = [];
    for (var i = 0; i < cmds.length; i++) steps = steps.concat(cmds[i]);
    var quiet = steps.length === 1 && !steps[0].v && !steps[0].r && !steps[0].s && !steps[0].t;
    if (quiet){ allStop('аналитик: сцена спокойная'); log('brain', 'сцена спокойная — тишина'); return; }
    playProgram(steps, 0);
    log('brain', 'программа на ' + steps.length + ' шаг(ов), старт с ' + Math.round(steps[0].v) + '/20');
  }).catch(function(e){
    brainBusy = false;
    log('err', 'аналитик: ' + String(e && e.message || e).slice(0, 70));
    // не оставляем сцену без ответа: падаем на локальный разбор
    var steps = heuristic(plain);
    if (steps){ playProgram(steps, 0); log('brain', 'подстраховка: разобрала сама, по словам'); }
  });
}

/* ═══════════════ слежение за сообщениями ═══════════════ */

var lastMsgKey = '', lastCmdCount = 0, msgTimer = null, lastMeKey = '', lastMsgLen = 0;
var fbTimer = null, fbKey = '';
var flowKey = '', flowPos = 0;

/* Скользим по свежему куску ответа и отзываемся на то, что в нём появилось.
   Считается по тому же словарю, что и разбор целой сцены. */
function flowScan(key, text){
  if (!C.flowLive) return;
  if (!(E.aiOn && host().aiControl) || !D || D.state !== 'on') return;
  if (E.mine) return;                       // сейчас играет то, что ты нажала рукой
  if (key !== flowKey){ flowKey = key; flowPos = 0; }
  // Свайп или регенерация: номер тот же, а текст начался заново и стал короче.
  // Без сброса позиции живой отклик на переписанный ответ молчал бы до конца.
  if (text.length < flowPos) flowPos = 0;
  if (text.length <= flowPos) return;

  var chunk = text.slice(flowPos);
  flowPos = text.length;
  var cap = capLevel();
  var было = E.flow.level || 0;

  /* Самое главное — что происходит с игрушкой прямо в сцене. Если персонаж её
     выключил, никакой накал вокруг не должен её снова раскрутить: держим
     тишину несколько секунд, чтобы «выключил и отложил» читалось буквально. */
  var вещь = C.orders ? deviceActOf(chunk) : null;
  if (вещь){
    if (вещь.act === 'выкл'){
      E.flow = { level: 0, until: now() + 10000, at: now() };
      E.devHold = now() + 8000;
      clearProg();
      log('flow', 'в сцене выключил игрушку — тишина');
      startEngine();
      return;
    }
    var ур = вещь.level != null ? вещь.level
           : вещь.act === 'выше' ? clamp(Math.max(было + 4, Math.round(cap * 0.7)), 2, cap)
           : вещь.act === 'ниже' ? clamp(Math.round((было || cap * 0.5) * 0.45), 1, cap)
           : clamp(Math.round(cap * 0.5), 2, cap);
    E.devHold = 0;
    if (вещь.preset && PRESETS[вещь.preset]){
      // Назвал режим — играем ровно его, целой программой, а не одним уровнем.
      playProgram(makePreset(вещь.preset, ур, clamp(C.patSec, 30, 300)), 0);
      log('flow', 'в сцене включил режим «' + вещь.preset + '» на ' + ур + '/20');
      return;
    }
    E.flow.level = ур;
    E.flow.until = now() + 14000;                      // рука на регуляторе держится дольше слова
    E.flow.at = now();
    E.waiting = 0;
    log('flow', 'в сцене ' + (вещь.act === 'выше' ? 'прибавил' : вещь.act === 'ниже' ? 'убавил' : 'включил') +
        ' → ' + ур + '/20');
    startEngine();
    return;
  }

  // Игрушку в сцене только что выключили — молчим, что бы вокруг ни происходило.
  if (E.devHold && now() < E.devHold) return;

  /* Дальше прямой приказ. Персонаж сказал «сильнее» — это сильнее, и неважно,
     какой там накал по словарю. Сказал «замри» — замираем, даже если вокруг
     самая горячая сцена: именно так дразнят. */
  var приказ = C.orders ? orderOf(chunk) : '';
  if (приказ){
    if (приказ === 'вверх')  E.flow.level = clamp(Math.max(было + 4, Math.round(cap * 0.7)), 2, cap);
    if (приказ === 'вниз')   E.flow.level = clamp(Math.round((было || cap * 0.5) * 0.45), 1, cap);
    if (приказ === 'стоп')   E.flow.level = 0;
    E.flow.until = now() + (приказ === 'стоп' ? 5000 : 12000);
    E.flow.at = now();
    E.waiting = 0;
    log('flow', 'команда «' + приказ + '» → ' + E.flow.level + '/20');
    startEngine();
    return;
  }

  var h = heatOf(chunk);
  if (!h.top) return;                                  // в новом куске ничего живого

  var цель = clamp(h.top + (h.hot ? 3 : 0) + (h.hits > 2 ? 1 : 0), 2, cap);
  // новое сильнее — подхватываем сразу, слабее — сглаживаем, чтобы не проваливаться
  E.flow.level = Math.max(Math.round(было * 0.75), цель);
  E.flow.until = now() + 9000;
  E.flow.at = now();
  E.waiting = 0;
  startEngine();
}

/* Гибрид: теги главные, но если их в ответе нет — сцену ведёт разбор по словам.
   Так работает при любой модели, и выбирать режим не приходится. */
function fallbackByWords(key, text){
  if (fbKey === key) return;
  if (!(E.aiOn && host().aiControl) || !D || D.state !== 'on') return;
  // Играет твой ритм — сцену не строим и, главное, не помечаем ответ разобранным:
  // иначе после СТОП он так и остался бы неотыгранным.
  if (E.mine) return;
  if (parseCmds(text).length) return;                   // теги всё-таки появились
  var plain = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  /* Сцена кончилась тем, что игрушку выключили и отложили. Собирать по такому
     ответу программу из накала — значит включить её обратно вопреки тексту. */
  var вещь = C.orders ? deviceActOf(plain) : null;
  if (вещь && вещь.act === 'выкл'){
    fbKey = key;
    allStop('в сцене игрушку выключили');
    return;
  }

  var steps = heuristic(plain);
  if (!steps) return;                                   // сцена спокойная — молчим
  fbKey = key;
  playProgram(steps, 0);
  log('brain', 'тегов нет — веду сцену по словам');
}

/* Короткий отклик на твоё сообщение: пока модель думает, сцена не молчит.
   Считается по словам, без запросов. */
function replyToMe(text){
  var h = heatOf(text), cap = capLevel();
  var сцена = E.prog.length > 0;
  if (h.hits < 2 && !сцена) return null;            // обычная реплика — не дёргаем
  var base = clamp(h.top ? Math.min(cap, h.top) : Math.round(cap * 0.4), 2, cap);
  var c = mainChannel();
  var mk = function(a, to, sec){
    var o = {}; o[c] = a;
    if (to != null){ o.to = {}; o.to[c] = to; }
    return step(o, sec);
  };
  return [ mk(Math.max(2, Math.round(base * 0.45)), base, 1.2), mk(base, Math.max(1, Math.round(base * 0.35)), 2) ];
}

function readLast(){
  var T = TV();
  if (!T || !T.message || !T.message.find) return Promise.resolve();
  return Promise.resolve(T.message.find()).then(function(all){
    if (!all || !all.length) return;
    var m = all[all.length - 1];
    if (!m) return;
    var role = String(m.role || (m.isUser ? 'user' : '')).toLowerCase();
    var text = String(m.content || m.text || '');

    if (role.indexOf('user') >= 0){
      checkSafeword(text);
      if (C.autoStopOnUser) { allStop('пишешь сама'); return; }
      if (!(E.aiOn && host().aiControl) || !D || D.state !== 'on') return;
      // Ты написала — ответа ждать долго, поэтому отзываемся сами и включаем режим ожидания.
      var meKey = 'me' + String(m.id != null ? m.id : all.length);
      if (meKey !== lastMeKey){
        lastMeKey = meKey;
        genCount++;                                 // считаем ответы для редких напоминаний
        lastUserText = text;                        // режиссёру нужно знать, что ты написала
        buildPrompt(true);                          // новый ход: подсказки расходуются только здесь
        E.waiting = now();
        if (C.reply && !E.mine){          // твой ритм важнее короткого отклика
          var nod = replyToMe(text);
          if (nod) { playOverlay(nod); log('me', 'отклик на твоё сообщение'); }
        }
      }
      return;
    }
    if (!(E.aiOn && host().aiControl)) return;

    E.waiting = 0;                                  // ответ пошёл — ждать больше нечего

    var key = String(m.id != null ? m.id : all.length);

    // Живой отклик на печатающийся текст — до всякого разбора целой сцены.
    if (!parseCmds(text).length) flowScan(key, text);

    // Фетиш-блок из ответа: показываем карточки и, если разрешено, отзываемся всплеском.
    var fet = parseFetish(text);
    if (fet && fet.cards.length && key !== F.key){
      F = { cards: fet.cards, intensity: fet.intensity, moodlet: fet.moodlet, boost: fet.boost, at: now(), key: key };
      paintFetish();
      fetishSpike(fet);
    }

    // Свайп или регенерация: тот же номер сообщения, а текст вдруг стал короче —
    // значит, ответ переписывают заново. Забываем то, что уже отыграли по нему.
    if (key === lastMsgKey && text.length + 40 < lastMsgLen){
      // Сбрасываем все три отметки, иначе по переписанному ответу сцена
      // больше не соберётся: разбор по словам решит, что уже отработал.
      lastCmdCount = 0; brainKey = ''; fbKey = ''; flowPos = 0; lastMsgLen = text.length;
      log('swipe', 'ответ переписывается — начинаю сцену заново');
    }
    if (key !== lastMsgKey) lastMsgLen = 0;
    lastMsgLen = Math.max(lastMsgLen, text.length);

    var cmds = parseCmds(text);
    if (key !== lastMsgKey){ lastMsgKey = key; lastCmdCount = 0; }

    // Тегов в ответе нет — а это обычный случай, потому что плагин их больше не просит.
    if (!cmds.length){
      clearTimeout(fbTimer);
      if (C.brain === 'model'){
        // Аналитику нужен дописанный ответ: каждое обновление стрима сдвигает таймер.
        clearTimeout(brainTimer);
        brainTimer = setTimeout(function(){ runBrain(key, text); }, 1500);
      } else {
        // Живой отклик уже ведёт сцену по ходу печати; когда текст дописан,
        // собираем из него полноценную программу до следующего ответа.
        fbTimer = setTimeout(function(){ fallbackByWords(key, text); }, 1500);
      }
      return;
    }

    // Теги всё-таки пришли (например, их шлёт твой пресет) — они главнее всего.
    clearTimeout(fbTimer); clearTimeout(brainTimer);
    if (cmds.length <= lastCmdCount) return;

    // Собираем всю программу сообщения заново и прыгаем на первую новую команду —
    // так работает и стрим (команда срабатывает по мере появления), и цельный ответ.
    var steps = [], firstNew = 0;
    for (var i = 0; i < cmds.length; i++){
      if (i === lastCmdCount) firstNew = steps.length;
      steps = steps.concat(cmds[i]);
    }
    var added = cmds.length - lastCmdCount;
    lastCmdCount = cmds.length;
    playProgram(steps, firstNew);
    log('cmd', '+' + added + ' команд' + (added === 1 ? 'а' : '') + ' из ответа → ' + Math.round(E.prog[E.i] ? E.prog[E.i].v : 0) + '/20');
  }).catch(function(){});
}

function onMsgEvent(){
  clearTimeout(msgTimer);
  msgTimer = setTimeout(readLast, 160);            // антидребезг: стрим сыплет updated пачками
}

function checkSafeword(text){
  var w = String(host().safeword || '').trim().toLowerCase();
  if (!w) return;
  var t = String(text || '').toLowerCase();
  var re = new RegExp('(^|[^a-zа-яё])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-zа-яё]|$)', 'i');
  if (re.test(t)){
    panic('стоп-слово «' + w + '»');
    log('safe', 'стоп-слово в сообщении — управление выключено');
  }
}

/* ═══════════════ фетиши ═══════════════ */
/* Три источника: карточка персонажа, твой собственный список и живой блок
   [FETISH] из ответа, если он у тебя настроен пресетом. Первые два уходят
   напоминанием в промпт, третий — ещё и в ощущения. */

var FET_DICT = [
  { re: 'ше[яию]|горло|ключиц',           emoji: '🫦', name: 'Шея' },
  { re: 'волос|локон|коса|хвост',          emoji: '💫', name: 'Волосы' },
  { re: 'чулк|колготк|подвязк',            emoji: '🖤', name: 'Чулки' },
  { re: 'бель[ёе]|кружев|лиф|комбинац',    emoji: '🎀', name: 'Бельё' },
  { re: 'запах|аромат|духи',               emoji: '🌿', name: 'Запах' },
  { re: 'голос|ш[ёе]пот|шепч',             emoji: '🎧', name: 'Голос' },
  { re: 'укус|кусает|зуб',                 emoji: '🩸', name: 'Укусы' },
  { re: 'царап|ногт',                      emoji: '💅', name: 'Царапины' },
  { re: 'связыв|в[её]ревк|наручник|шибари', emoji: '🪢', name: 'Связывание' },
  { re: 'подчин|покорн|слушаться',         emoji: '⛓️', name: 'Подчинение' },
  { re: 'доминир|власт|приказ|командует',  emoji: '👑', name: 'Власть' },
  { re: 'подгляд|наблюда|смотрит как',     emoji: '👁️', name: 'Взгляд' },
  { re: 'зеркал',                          emoji: '🪞', name: 'Зеркала' },
  { re: 'ладон|пальц|запяст',              emoji: '🤍', name: 'Руки' },
  { re: 'стоп[аыу]|щиколот|босая',         emoji: '🦶', name: 'Ноги' },
  { re: 'спин[аыу]|поясниц|лопатк',        emoji: '🌊', name: 'Спина' },
  { re: 'форм[аыу]|мундир|униформ',        emoji: '🎖️', name: 'Форма' },
  { re: 'кожан|латекс|винил',              emoji: '🧷', name: 'Латекс' },
  { re: 'ш[ёе]лк|атлас',                   emoji: '🕊️', name: 'Шёлк' },
  { re: 'вода|душ|ванн|дожд',              emoji: '💧', name: 'Вода' },
  { re: 'на людях|публичн|застука|рискн',  emoji: '🚪', name: 'На людях' },
  { re: 'дразн|медлен|томит|тянет',        emoji: '🕯️', name: 'Дразнение' },
  { re: 'ж[ёе]стк|грубо|резк',             emoji: '🔥', name: 'Жёстко' },
  { re: 'нежн|ласков|бережн|осторожн',     emoji: '🤍', name: 'Нежность' }
];

// Имена для подписей: чей это персонаж и как зовут тебя в этом чате.
var NAMES = { char: 'персонаж', user: 'ты' };

function idOf(x){ return (x && typeof x === 'object') ? (x.id != null ? x.id : x._id) : x; }

// Карточка активного персонажа — через список чата, иначе просто текущая.
function getChar(){
  var T = TV();
  if (!T || !T.character || !T.character.get) return Promise.resolve(null);
  if (!T.chat || !T.chat.current) return Promise.resolve(T.character.get()).catch(function(){ return null; });
  return Promise.resolve(T.chat.current()).then(function(ch){
    ch = ch || {};
    var chars = ch.characters;
    var cid = Array.isArray(chars) ? idOf(chars[0]) : idOf(chars);
    return Promise.resolve(cid != null ? T.character.get(cid) : T.character.get());
  }).catch(function(){ return null; });
}

function pickNames(){
  var T = TV();
  if (!T || !T.chat || !T.chat.current) return;
  Promise.resolve(T.chat.current()).then(function(ch){
    ch = ch || {};
    var прямо = ch.characterName || ch.character_name || ch.charName;
    if (прямо) NAMES.char = прямо;
    var jobs = [];
    if (!прямо){
      jobs.push(getChar().then(function(c){ if (c && c.name) NAMES.char = c.name; }));
    }
    var pid = idOf(ch.persona);
    if (pid != null && T.persona && T.persona.get){
      jobs.push(Promise.resolve(T.persona.get(pid)).then(function(pp){
        if (pp && pp.name) NAMES.user = pp.name;
      }).catch(function(){}));
    }
    Promise.all(jobs).then(function(){ paintFetish(); buildPrompt(); }).catch(function(){});
  }).catch(function(){});
}

// Живое состояние из последнего блока [FETISH] в ответе.
var F = { cards: [], intensity: 0, moodlet: '', boost: '', at: 0, key: '' };

function parseFetish(text){
  var m = /\[FETISH\]([\s\S]*?)\[\/FETISH\]/i.exec(String(text || ''));
  if (!m) return null;
  var body = m[1], out = { cards: [], intensity: 0, moodlet: '', boost: '' };
  var lines = body.split('\n'), inCards = false;

  for (var i = 0; i < lines.length; i++){
    var line = lines[i].trim();
    if (!line) continue;
    if (/^cards:/i.test(line)) { inCards = true; continue; }

    if (inCards){
      // Карточка: эмодзи Имя | описание | триггер
      var c = /^(\S+)\s+(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)$/.exec(line);
      if (c){
        out.cards.push({ emoji: c[1], name: c[2].trim(), what: c[3].trim(), trig: c[4].trim() });
        continue;
      }
      if (/^[a-z_]+:\s/i.test(line)) inCards = false; else continue;
    }

    var parts = line.split('|');
    for (var j = 0; j < parts.length; j++){
      var p = parts[j].trim(), k = p.indexOf(':');
      if (k < 0) continue;
      var key = p.slice(0, k).trim().toLowerCase(), val = p.slice(k + 1).trim();
      if (key === 'intensity') out.intensity = clamp(parseFloat(val) || 0, 0, 5);
      else if (key === 'active_moodlet') out.moodlet = val;
      else if (key === 'chemistry_boost') out.boost = val;
    }
  }
  return out;
}

// Что нашлось в карточке персонажа — считаем один раз на чат и запоминаем.
function charFetishes(){
  if (!C.fetChar) C.fetChar = {};
  var got = C.fetChar[chatKey()];
  return got || [];
}

/* Весь текст карточки одной строкой.

   Таво отдаёт поля в camelCase: firstMes, mesExample, creatorNotes. Раньше тут
   стояли имена из SillyTavern (first_mes, mes_example) — и приветствие с примерами,
   где обычно и написано всё самое интересное, просто не читались. Поэтому «из
   карточки» почти всегда возвращало пусто. Берём оба написания и заодно заметки,
   альтернативные приветствия и теги. */
function cardText(ch){
  if (!ch) return '';
  var куски = [ch.description, ch.personality, ch.scenario,
               ch.firstMes, ch.first_mes, ch.mesExample, ch.mes_example,
               ch.creatorNotes, ch.creator_notes, ch.systemPrompt];
  if (Array.isArray(ch.alternateGreetings)) куски = куски.concat(ch.alternateGreetings);
  if (Array.isArray(ch.tags)) куски = куски.concat(ch.tags);
  return куски.filter(Boolean).join('\n');
}

function scanCharCard(){
  if (!C.fetChar) C.fetChar = {};
  // Пустой массив в JS истинный, поэтому проверяем длину: иначе первая же
  // неудачная попытка навсегда закрывала дорогу всем следующим.
  var было = C.fetChar[chatKey()];
  if (было && было.length) return;                  // уже нашли для этого чата
  getChar().then(function(ch){
    var txt = cardText(ch).toLowerCase();
    if (!txt) return;
    var found = [];
    FET_DICT.forEach(function(f){
      if (found.length >= 6) return;
      if (new RegExp(f.re, 'i').test(txt)) found.push({ emoji: f.emoji, name: f.name });
    });
    if (!found.length) return;                      // не нашли — не занимаем место пустотой
    C.fetChar[chatKey()] = found;
    saveCfg(); saveChatCfg();
    paintFetish(); buildPrompt();
    log('fet', 'из карточки: ' + found.map(function(f){ return f.name; }).join(', '));
  }).catch(function(){});
}

// Свои — просто список через запятую.
function ownFetishes(){
  return String(C.fetOwn || '').split(/[,;]/).map(function(s){ return s.trim(); })
    .filter(Boolean).slice(0, 8)
    .map(function(n){
      var hit = null;
      FET_DICT.forEach(function(f){ if (!hit && new RegExp(f.re, 'i').test(n.toLowerCase())) hit = f; });
      return { emoji: hit ? hit.emoji : '✦', name: n };
    });
}

// Напоминание основной модели: коротко и не каждый ответ, чтобы не приедалось.
var genCount = 0;
function fetishPrompt(){
  if (!C.fetRemind) return '';
  var her = charFetishes(), mine = ownFetishes();
  if (!her.length && !mine.length) return '';
  var горячо = F.at && (now() - F.at < 120000);
  if (!горячо && (genCount % Math.max(1, C.fetEvery)) !== 0) return '';
  var names = function(a){ return a.map(function(x){ return x.name; }).join(', '); };
  return '[Предпочтения]\n' +
    (her.length ? NAMES.char + ': ' + names(her) + '\n' : '') +
    (mine.length ? NAMES.user + ': ' + names(mine) + '\n' : '') +
    'В близких сценах играй на этом: вплетай одну деталь в действие, не перечисляй списком ' +
    'и не называй это «фетишем». Одна за ответ, не больше.';
}

/* Механика: сработал фетиш — отдельный всплеск поверх сцены.
   Сила берётся из intensity (0-5), которую выставила сама модель. */
function fetishSpike(f){
  if (!C.fetDrive || !f || !(f.intensity >= 1)) return;
  if (!E.aiOn || !D || D.state !== 'on') return;
  if (E.mine) return;                       // не лезем во всплеск поверх твоего ритма
  var cap = capLevel();
  var пик = clamp(Math.round(cap * (0.45 + 0.11 * f.intensity)), 2, cap);
  var c = mainChannel();
  var mk = function(a, to, sec){
    var o = {}; o[c] = a;
    if (to != null){ o.to = {}; o.to[c] = to; }
    return step(o, sec);
  };
  playOverlay([ mk(Math.round(пик * 0.4), пик, 1.5), mk(пик, Math.round(пик * 0.5), 2.5) ]);
  log('fet', 'фетиш сработал на ' + f.intensity + '/5 → всплеск до ' + пик + '/20');
}

/* ═══════════════ своя программа: дорожки из готовых кусков ═══════════════ */
/* Как в приложении Satisfyer: берёшь готовые рисунки, ставишь друг за другом,
   у каждого выбираешь силу и время. У двухмоторной игрушки у каждого мотора
   своя дорожка, и играют они одновременно. Ступеньки «сила × секунды» из
   прежних версий живут дальше как кусок «ровно» — старые коды не пропадают. */

var КУСКИ = ['волна', 'пульс', 'прибой', 'дразнилка', 'крещендо', 'сердцебиение', 'фейерверк', 'тишина'];
var СИЛА_КУСКА = { 'мягко': 0.35, 'средне': 0.65, 'жёстко': 1 };
var ВРЕМЯ_КУСКА = [30, 60, 120, 300];
var КУСОК_КОД = { 'волна': 'w', 'пульс': 'p', 'прибой': 's', 'дразнилка': 'd', 'крещендо': 'c',
                  'сердцебиение': 'h', 'фейерверк': 'f', 'тишина': 'z', 'ровно': 'r' };
var СИЛА_КОД = { 'мягко': 1, 'средне': 2, 'жёстко': 3 };

function lanes(){
  if (!Array.isArray(C.lanes)) C.lanes = [[], []];
  while (C.lanes.length < 2) C.lanes.push([]);
  return C.lanes;
}

function blockLevel(b){
  if (b.n === 'ровно') return clamp(b.l, 0, 20);
  if (b.n === 'тишина') return 0;
  return Math.max(2, Math.round(capLevel() * (СИЛА_КУСКА[b.p] || 0.65)));
}

// Кусок → отрезки «от a до b за ms» на одном моторе.
function blockSegs(b){
  var ms = Math.round(clamp(b.s, 1, 600) * 1000), lv = blockLevel(b);
  if (b.n === 'тишина' || b.n === 'ровно' || !PRESETS[b.n]) return [{ a: lv, b: lv, ms: ms }];
  return (makePreset(b.n, lv, b.s) || []).map(function(st){
    return { a: st.v, b: (st.to && st.to.v != null) ? st.to.v : st.v, ms: st.ms };
  });
}

function laneSegs(lane){
  var out = [];
  (lane || []).forEach(function(b){ out = out.concat(blockSegs(b)); });
  return out;
}

function segsTotal(segs){ return segs.reduce(function(x, g){ return x + g.ms; }, 0); }

// Сила на дорожке в момент x (мс от начала): за её концом — тишина.
function segAt(segs, x, конец){
  var t0 = 0;
  for (var i = 0; i < segs.length; i++){
    var g = segs[i], t1 = t0 + g.ms;
    if (x < t1 || (конец && x === t1)){
      var k = g.ms ? (x - t0) / g.ms : 0;
      return g.a + (g.b - g.a) * clamp(k, 0, 1);
    }
    t0 = t1;
  }
  return 0;
}

/* Две дорожки → одна программа. Режем по всем границам обеих, округляя до такта
   движка (250 мс): движок за такт переходит не больше чем на один шаг. */
function lanesProgram(){
  var L = lanes(), двое = motorCount() > 1 && L[1].length > 0;
  var A = laneSegs(L[0]);
  if (!двое){
    return A.filter(function(g){ return g.ms > 0; }).map(function(g){
      return { v: g.a, r: 0, p: 0, s: 0, t: 0, w: 0, d: 0, ms: Math.max(250, g.ms), to: { v: g.b }, only: null };
    });
  }
  var B = laneSegs(L[1]);
  var T = Math.max(segsTotal(A), segsTotal(B));
  var q = function(x){ return Math.round(x / 250) * 250; };
  var точки = {}, t = 0;
  [A, B].forEach(function(segs){ t = 0; segs.forEach(function(g){ точки[q(t)] = 1; t += g.ms; }); точки[q(t)] = 1; });
  точки[0] = 1; точки[q(T)] = 1;
  var xs = Object.keys(точки).map(Number).filter(function(x){ return x <= q(T); }).sort(function(a, b){ return a - b; });
  var steps = [];
  for (var i = 0; i + 1 < xs.length; i++){
    var x0 = xs[i], x1 = xs[i + 1];
    if (x1 <= x0) continue;
    steps.push({
      v: segAt(A, x0), w: segAt(B, x0), r: 0, p: 0, s: 0, t: 0, d: 1,
      to: { v: segAt(A, x1, true), w: segAt(B, x1, true) },
      ms: x1 - x0, only: null
    });
  }
  return steps;
}

function laneSec(lane){ return (lane || []).reduce(function(x, b){ return x + (+b.s || 0); }, 0); }

function playLanes(){
  var L = lanes();
  if (!L[0].length && !L[1].length){ toast('добавь хотя бы один кусок'); return; }
  if (!D || D.state !== 'on'){ toast('сначала подключись'); return; }
  if (!L[0].length && motorCount() < 2){ toast('первая дорожка пустая'); return; }
  var steps = lanesProgram();
  if (!steps.length){ toast('нечего играть'); return; }
  E.manual = 0; E.hand = [0, 0];
  playProgram(steps, 0, { exact: true, mine: true, loop: !!C.patLoop });
  var всего = Math.max(laneSec(L[0]), motorCount() > 1 ? laneSec(L[1]) : 0);
  log('queue', 'своя программа · ' + секстр(всего) + (C.patLoop ? ' по кругу' : ', один раз'));
}

/* Код для подруги: PV2-w2x60.d3x30~z1x30.p1x60
   буква куска, сила 1-3 (у «ровно» — уровень 0-20), x, секунды; ~ — второй мотор. */
function rhythmCode(){
  var L = lanes();
  if (!L[0].length && !L[1].length) return '';
  var лента = function(lane){
    return lane.map(function(b){
      return (КУСОК_КОД[b.n] || 'w') + (b.n === 'ровно' ? clamp(b.l, 0, 20) : (СИЛА_КОД[b.p] || 2)) + 'x' + clamp(b.s, 1, 600);
    }).join('.');
  };
  return 'PV2-' + лента(L[0]) + (L[1].length ? '~' + лента(L[1]) : '');
}

function applyRhythmCode(code){
  var src = String(code || ''), L;
  var m2 = /PV2-([a-z0-9x.~]+)/i.exec(src);
  if (m2){
    var ОТ_КОДА = {}; Object.keys(КУСОК_КОД).forEach(function(k){ ОТ_КОДА[КУСОК_КОД[k]] = k; });
    var ОТ_СИЛЫ = { 1: 'мягко', 2: 'средне', 3: 'жёстко' };
    L = m2[1].split('~').slice(0, 2).map(function(part){
      var out = [];
      part.split('.').forEach(function(tok){
        var x = /^([a-z])(\d{1,2})x(\d{1,3})$/i.exec(tok);
        if (!x || out.length >= 12) return;
        var n = ОТ_КОДА[x[1].toLowerCase()]; if (!n) return;
        var b = { n: n, s: clamp(+x[3], 1, 600) };
        if (n === 'ровно') b.l = clamp(+x[2], 0, 20); else b.p = ОТ_СИЛЫ[x[2]] || 'средне';
        out.push(b);
      });
      return out;
    });
  } else {
    // старый код ступенек: PV1-5x20-12x30 — каждая ступенька становится куском «ровно»
    var m = /PV1-((?:\s*\d{1,2}\s*[xх*]\s*\d{1,3}\s*)(?:-\s*\d{1,2}\s*[xх*]\s*\d{1,3}\s*)*)/i.exec(src);
    if (!m) return false;
    var q = [];
    m[1].split('-').forEach(function(part){
      var p = /^\s*(\d{1,2})\s*[xх*]\s*(\d{1,3})\s*$/i.exec(part);
      if (p && q.length < 12) q.push({ n: 'ровно', l: clamp(+p[1], 0, 20), s: clamp(+p[2], 1, 600) });
    });
    L = [q];
  }
  if (!L || !L.some(function(x){ return x.length; })) return false;
  while (L.length < 2) L.push([]);
  C.lanes = L; laneSel = null;
  saveCfg(); paintLanes();
  return true;
}

/* ── панель дорожек ── */
var laneSel = null;          // { l, i } — выбранный кусок

function blockTitle(b){
  if (b.n === 'ровно') return 'ровно ' + clamp(b.l, 0, 20);
  return b.n;
}
function blockSub(b){
  var t = b.s < 60 ? b.s + ' с' : (b.s % 60 ? Math.floor(b.s / 60) + ' м ' + (b.s % 60) + ' с' : (b.s / 60) + ' м');
  return (b.n === 'ровно' || b.n === 'тишина' ? '' : b.p + ' · ') + t;
}

// Вторую дорожку показываем, когда моторов два, — или пока игрушки нет, а на ней уже что-то лежит.
function lanesTwo(){
  var L = lanes();
  return motorCount() > 1 || (L[1].length > 0 && !(D && D.state === 'on'));
}

function paintLanes(){
  var box = el('pv-lanes'); if (!box) return;
  var L = lanes(), двое = lanesTwo();
  if (!двое && C.laneTo) C.laneTo = 0;
  var шкала = Math.max(laneSec(L[0]), двое ? laneSec(L[1]) : 0, 1);
  var h = '';
  (двое ? [0, 1] : [0]).forEach(function(li){
    h += '<div class="pv-lane">' + (двое ? '<span class="pv-lanenm">мотор ' + (li + 1) + '</span>' : '') +
      '<div class="pv-tape">';
    if (!L[li].length) h += '<span class="pv-tapeempty">пусто</span>';
    L[li].forEach(function(b, i){
      var sel = laneSel && laneSel.l === li && laneSel.i === i;
      var яр = b.n === 'тишина' ? 0.25 : (b.n === 'ровно' ? 0.35 + 0.65 * clamp(b.l, 0, 20) / 20 : 0.45 + 0.55 * (СИЛА_КУСКА[b.p] || 0.65));
      h += '<div class="pv-blk' + (sel ? ' sel' : '') + (b.n === 'тишина' ? ' quiet' : '') + '" data-l="' + li + '" data-i="' + i + '"' +
        ' style="width:' + (b.s / шкала * 100).toFixed(2) + '%;--a:' + яр.toFixed(2) + '">' +
        '<b>' + esc(blockTitle(b)) + '</b><small>' + esc(blockSub(b)) + '</small></div>';
    });
    h += '</div></div>';
  });
  if (!двое && L[1].length){
    h += '<div class="pv-hint" style="margin-top:6px">у игрушки один мотор — вторая дорожка сохранена и заиграет на двухмоторной</div>';
  }
  if (двое){
    h += '<div class="pv-lanepick"><span>куда добавлять:</span>' +
      '<div class="pv-tab' + (!C.laneTo ? ' on' : '') + '" data-to="0">мотор 1</div>' +
      '<div class="pv-tab' + (C.laneTo ? ' on' : '') + '" data-to="1">мотор 2</div></div>';
  }
  box.innerHTML = h;
  [].forEach.call(box.querySelectorAll('.pv-blk'), function(n){
    n.addEventListener('click', function(){
      var l = +n.getAttribute('data-l'), i = +n.getAttribute('data-i');
      laneSel = (laneSel && laneSel.l === l && laneSel.i === i) ? null : { l: l, i: i };
      paintLanes();
    });
  });
  [].forEach.call(box.querySelectorAll('[data-to]'), function(n){
    n.addEventListener('click', function(){ C.laneTo = +n.getAttribute('data-to'); saveCfg(); paintLanes(); });
  });
  paintBlockEdit();
  paintSaved();
  var code = el('pv-q-code');
  if (code && pdoc.activeElement !== code) code.value = rhythmCode();
}

function paintBlockEdit(){
  var box = el('pv-blkedit'); if (!box) return;
  var L = lanes();
  var b = laneSel && L[laneSel.l] && L[laneSel.l][laneSel.i];
  if (!b){ laneSel = null; box.innerHTML = '<div class="pv-hint">нажми кусок на дорожке — здесь выберешь силу и время</div>'; return; }
  var двое = lanesTwo();
  var h = '<div class="pv-blkhead"><b>' + esc(blockTitle(b)) + '</b>' + (двое ? ' · мотор ' + (laneSel.l + 1) : '') + '</div>';
  if (b.n !== 'тишина' && b.n !== 'ровно'){
    h += '<div class="pv-pick">сила</div><div class="pv-tabs">' +
      Object.keys(СИЛА_КУСКА).map(function(k){ return '<div class="pv-tab' + (b.p === k ? ' on' : '') + '" data-pw="' + k + '">' + k + '</div>'; }).join('') + '</div>';
  }
  if (PRESET_WHAT[b.n]) h += '<div class="pv-hint" style="margin-top:4px">' + esc(PRESET_WHAT[b.n]) + '</div>';
  h += '<div class="pv-pick">сколько</div><div class="pv-tabs">' +
    ВРЕМЯ_КУСКА.map(function(v){ return '<div class="pv-tab' + (b.s === v ? ' on' : '') + '" data-tm="' + v + '">' + секстр(v) + '</div>'; }).join('') + '</div>';
  h += '<div class="pv-row" style="margin-top:8px">' +
    '<button class="pv-b pv-ghost" data-mv="-1" style="flex:none">←</button>' +
    '<button class="pv-b pv-ghost" data-mv="1" style="flex:none">→</button>' +
    '<button class="pv-b pv-ghost" data-del="1" style="flex:1">убрать кусок</button></div>';
  box.innerHTML = h;
  var тронули = function(){ saveCfg(); paintLanes(); };
  [].forEach.call(box.querySelectorAll('[data-pw]'), function(n){ n.addEventListener('click', function(){ b.p = n.getAttribute('data-pw'); тронули(); }); });
  [].forEach.call(box.querySelectorAll('[data-tm]'), function(n){ n.addEventListener('click', function(){ b.s = +n.getAttribute('data-tm'); тронули(); }); });
  [].forEach.call(box.querySelectorAll('[data-mv]'), function(n){
    n.addEventListener('click', function(){
      var lane = L[laneSel.l], j = laneSel.i + (+n.getAttribute('data-mv'));
      if (j < 0 || j >= lane.length) return;
      lane.splice(j, 0, lane.splice(laneSel.i, 1)[0]); laneSel.i = j; тронули();
    });
  });
  var d = box.querySelector('[data-del]');
  if (d) d.addEventListener('click', function(){ L[laneSel.l].splice(laneSel.i, 1); laneSel = null; тронули(); });
}

function addBlock(name){
  var L = lanes(), li = lanesTwo() ? (C.laneTo ? 1 : 0) : 0;
  if (L[li].length >= 12){ toast('на дорожке уже двенадцать кусков'); return; }
  L[li].push({ n: name, p: 'средне', s: 60 });
  laneSel = { l: li, i: L[li].length - 1 };
  saveCfg(); paintLanes();
}

// Сохранённые программы: нажала — загрузилась в дорожки, крестик — удалить.
function paintSaved(){
  var box = el('pv-saved'); if (!box) return;
  var list = C.progs || [];
  if (!list.length){ box.innerHTML = ''; return; }
  box.innerHTML = '<div class="pv-pick">сохранённые</div><div class="pv-saved">' +
    list.map(function(x, i){
      return '<span class="pv-fchip" data-load="' + i + '">' + esc(x.name) + ' <b data-drop="' + i + '" style="opacity:.55;font-weight:400">✕</b></span>';
    }).join('') + '</div>';
  [].forEach.call(box.querySelectorAll('[data-load]'), function(n){
    n.addEventListener('click', function(e){
      var i = +n.getAttribute('data-load');
      if (e.target && e.target.getAttribute && e.target.getAttribute('data-drop') != null){
        C.progs.splice(i, 1); saveCfg(); paintSaved(); return;
      }
      C.lanes = JSON.parse(JSON.stringify(C.progs[i].lanes)); laneSel = null;
      saveCfg(); paintLanes(); toast('загружено: ' + C.progs[i].name);
    });
  });
}

function saveLanes(){
  var L = lanes();
  if (!L[0].length && !L[1].length){ toast('сохранять пока нечего'); return; }
  if (!C.progs) C.progs = [];
  var имя = L[0].concat(L[1]).slice(0, 2).map(blockTitle).join(' + ') +
    ' · ' + секстр(Math.max(laneSec(L[0]), laneSec(L[1])));
  C.progs.unshift({ name: имя, lanes: JSON.parse(JSON.stringify(L)) });
  if (C.progs.length > 10) C.progs.length = 10;
  saveCfg(); paintSaved(); toast('программа сохранена');
}

/* ═══════════════ UI ═══════════════ */

function css(){
  if (pdoc.getElementById('pv-css')) return;
  var st = pdoc.createElement('style'); st.id = 'pv-css';
  st.textContent = [
    // плавающая кнопка
    '#pv-dock{position:fixed;z-index:2147483000;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;',
      'font-size:18px;color:#e8b0b8;background:linear-gradient(145deg,#251518,#140c10);',
      'border:1px solid rgba(200,100,120,.45);box-shadow:0 6px 18px rgba(0,0,0,.5);cursor:grab;user-select:none;touch-action:none;-webkit-tap-highlight-color:transparent}',
    '#pv-dock.pv-live{border-color:rgba(220,120,140,.9);animation:pv-beat 1.2s infinite}',
    '@keyframes pv-beat{0%{box-shadow:0 0 0 0 rgba(200,100,120,.5)}70%{box-shadow:0 0 0 11px rgba(200,100,120,0)}100%{box-shadow:0 0 0 0 rgba(200,100,120,0)}}',

    // окно
    // Окно ничем не закрашивает чат: Таво само притемняет фон под плагином, и вторая
    // заливка поверх выглядела лишним серым слоем. Сам слой кликов не ловит —
    // ловит только карточка, поэтому чат под ней остаётся живым.
    '#pv-win{position:fixed;left:0;right:0;z-index:2147483001;display:none;pointer-events:none;',
      // запасные числа — для Таво постарше, где этих переменных ещё нет
      'top:calc(var(--tavo-inset-top-bar, 62px) + 8px);',
      'bottom:calc(var(--tavo-inset-bottom-input, 66px) + 8px);',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}',
    '#pv-win.on{display:flex;align-items:flex-end;justify-content:center;padding:0 10px}',
    '#pv-card{pointer-events:auto;width:100%;max-width:400px;height:100%;max-height:620px;display:flex;flex-direction:column;',
      'background:linear-gradient(160deg,#1a1015,#120a0e);border:1px solid rgba(200,100,120,.35);',
      'border-radius:20px;box-shadow:0 10px 30px rgba(0,0,0,.6);padding:14px 14px 8px;color:#e0c0c0;font-size:12px;line-height:1.45}',
    '#pv-body{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;margin:0 -2px;padding:0 2px}',
    '#pv-body::-webkit-scrollbar{width:3px}#pv-body::-webkit-scrollbar-thumb{background:rgba(200,100,120,.3);border-radius:3px}',

    // шапка
    '#pv-card h1{margin:0;font-size:13px;font-weight:700;letter-spacing:.3px;color:#e8b0b8}',
    '.pv-sub{font-size:10px;color:#c08090;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.pv-x{width:28px;height:28px;border-radius:9px;border:1px solid rgba(200,100,120,.25);background:rgba(200,100,120,.08);color:#e8b0b8;font-size:14px;cursor:pointer}',

    // блоки
    '.pv-row{display:flex;align-items:center;gap:8px}',
    '.pv-head{justify-content:space-between;margin-bottom:12px}',
    '.pv-sec{margin:7px 0;padding:10px 11px;border-radius:14px;background:#151018;border:1px solid rgba(200,100,120,.2)}',
    '.pv-lbl{font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:#c08090;margin-bottom:5px}',
    '.pv-hint{font-size:11px;color:#b09aa3;line-height:1.5}',
    // строчка «что это вообще» в начале блока и подпись над рядом кнопок
    '.pv-note{font-size:11.5px;color:#c8a0aa;line-height:1.45;margin:-1px 0 9px}',
    '.pv-pick{font-size:11px;color:#c08090;margin:10px 0 5px}',
    '.pv-pick:first-child{margin-top:0}',

    // кнопки и чипсы
    '.pv-b{appearance:none;border:1px solid rgba(200,100,120,.35);background:rgba(200,100,120,.12);color:#e8b0b8;',
      'border-radius:11px;padding:8px 12px;font-size:11.5px;cursor:pointer;font-family:inherit}',
    '.pv-b:active{transform:scale(.96)}.pv-b[disabled]{opacity:.4}',
    '.pv-b.pv-ghost{border-color:rgba(200,100,120,.18);background:rgba(200,100,120,.05);color:#c08090}',
    '.pv-b.pv-red{border-color:rgba(220,80,60,.55);background:rgba(220,80,60,.16);color:#f0b8ac;font-weight:700}',
    '.pv-tabs{display:flex;gap:6px;flex-wrap:wrap}',
    '.pv-tab{flex:1 1 44%;padding:9px 6px;border-radius:11px;text-align:center;font-size:11px;cursor:pointer;',
      'border:1px solid rgba(200,100,120,.18);background:rgba(200,100,120,.05);color:#c08090}',
    '.pv-tab.on{border-color:rgba(200,100,120,.6);background:rgba(200,100,120,.2);color:#f0d0d6;font-weight:600}',

    // первый вход
    '#pv-main{flex:1;min-height:0;display:flex;flex-direction:column}',
    '#pv-onboard{flex:1;min-height:0;display:flex;flex-direction:column;padding:6px 2px 0}',
    '#pv-onboard[hidden],#pv-main[hidden]{display:none}',
    '.pv-ob-big{font-size:16px;font-weight:700;color:#f0d0d6;margin-bottom:4px}',
    '.pv-ob-steps{margin:0 0 12px;padding-left:18px;font-size:11.5px;line-height:1.6;color:#c8a0aa}',
    '.pv-ob-steps li{margin-bottom:5px}.pv-ob-steps b{color:#e8b0b8}',

    // мастер первого входа
    '#pv-wiz-top{flex:none;padding:2px 0 10px}',
    '#pv-wiz-body{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:0 2px}',
    '#pv-wiz-foot{flex:none;padding:10px 0 2px}',
    '.pv-wz-dots{display:flex;gap:4px;margin-bottom:8px}',
    '.pv-wz-dots i{flex:1;height:3px;border-radius:2px;background:rgba(200,100,120,.18)}',
    '.pv-wz-dots i.on{background:linear-gradient(90deg,#c06070,#e67e22)}',
    '.pv-wz-num{font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:#a07080}',
    '.pv-wz-title{font-size:17px;font-weight:700;color:#f0d0d6;margin-top:2px}',
    '.pv-wz-lead{font-size:12px;color:#d8b8bc;line-height:1.5;margin-bottom:10px}',
    '.pv-wz-list,.pv-wz-steps{margin:0 0 10px;padding-left:17px;font-size:11.5px;line-height:1.55;color:#c8a0aa}',
    '.pv-wz-list li,.pv-wz-steps li{margin-bottom:7px}',
    '.pv-wz-list b,.pv-wz-steps b{color:#e8b0b8}',
    '.pv-wz-note{font-size:11.5px;color:#b09aa3;line-height:1.5;margin-top:8px}',
    '.pv-wz-note b{color:#c8a0aa}',
    '.pv-wz-state{font-size:11.5px;color:#c8a0aa;margin-top:9px;padding:9px 10px;border-radius:11px;',
      'background:#151018;border:1px solid rgba(200,100,120,.2)}',
    '.pv-wz-img{display:block;width:100%;box-sizing:border-box;border-radius:12px;margin:10px 0 4px;',
      'border:1px solid rgba(200,100,120,.25)}',
    '.pv-wz-cap{font-size:10.5px;color:#a8909a;text-align:center;margin-bottom:6px}',

    /* ── экскурсия по панели ──
       Кольцо вокруг настоящей кнопки и облачко рядом. Затемнение делаем одной
       гигантской тенью у самого кольца: дырка получается сама собой. */
    '#pv-tour{position:fixed;inset:0;z-index:2147483002;pointer-events:auto}',
    '#pv-tour[hidden]{display:none}',
    '#pv-spot{position:fixed;border-radius:13px;pointer-events:none;',
      'box-shadow:0 0 0 9999px rgba(6,3,5,.78);border:2px solid rgba(230,126,34,.9);transition:all .18s ease}',
    '#pv-bubble{position:fixed;left:12px;right:12px;max-width:360px;margin:0 auto;',
      'background:linear-gradient(160deg,#231419,#170d12);border:1px solid rgba(200,100,120,.4);',
      'border-radius:16px;padding:13px 14px;box-shadow:0 12px 34px rgba(0,0,0,.65);color:#e0c0c0}',
    '#pv-bubble .pv-wz-num{margin-bottom:3px}',
    '#pv-bubble b.t{display:block;font-size:13.5px;color:#f0d0d6;margin-bottom:4px}',
    '#pv-bubble span.s{display:block;font-size:11.5px;line-height:1.5;color:#c8a0aa}',
    '#pv-bubble .pv-row{margin-top:11px}',
    '.pv-ob-addr{font-size:11.5px;color:#a8909a;padding:8px 10px;border-radius:10px;background:#151018;border:1px solid rgba(200,100,120,.2)}',
    '.pv-ob-addr b{color:#e8b0b8;font-weight:600}',
    '.pv-ob-note{font-size:10.5px;color:#e0a0a0;margin-top:8px;min-height:14px}',

    // вкладки — внизу карточки, под большим пальцем
    '.pv-pane[hidden]{display:none}',

    // устройство
    '.pv-dev{display:flex;align-items:center;gap:10px;margin-bottom:10px}',
    '.pv-devico{width:36px;height:36px;min-width:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:17px;',
      'background:linear-gradient(135deg,rgba(200,100,120,.2),rgba(200,100,120,.05))}',
    '.pv-devname{font-size:12.5px;font-weight:700;color:#e8b0b8;line-height:1.2}',
    '.pv-devsub{font-size:10.5px;color:#c08090;margin-top:2px}',
    '.pv-dot{width:8px;height:8px;border-radius:50%;background:#5a4048;flex:none}',
    '.pv-dot.on{background:#7fd6a2;box-shadow:0 0 8px rgba(127,214,162,.6)}',
    '.pv-dot.err{background:#dc503c}.pv-dot.wait{background:#d4a06a}',

    // уровень
    '.pv-meter{height:10px;border-radius:6px;background:rgba(200,100,120,.1);overflow:hidden;margin:8px 0 6px}',
    '.pv-fill{height:100%;width:0;border-radius:6px;background:linear-gradient(90deg,#8f5bd6,#c06070,#e67e22);transition:width .18s linear}',
    '.pv-now{font-size:15px;font-weight:800;color:#e67e22}',
    '.pv-sl{width:100%;accent-color:#c06070}',

    // плитки
    '.pv-tiles{display:flex;gap:8px}',
    '.pv-tile{flex:1;background:rgba(200,100,120,.06);border-radius:12px;padding:8px;text-align:center}',
    '.pv-tile b{display:block;font-size:12px;font-weight:700;color:#e67e22;margin-top:2px}',
    '.pv-tile span{font-size:8.5px;color:#c08090}',

    // меню-плитки: сначала выбираешь, куда идти, и сразу читаешь, что там
    '.pv-menu{display:grid;grid-template-columns:1fr 1fr;gap:9px}',
    '.pv-mt{display:flex;flex-direction:column;align-items:flex-start;gap:3px;text-align:left;',
      'padding:13px 12px;border-radius:15px;cursor:pointer;font-family:inherit;',
      'border:1px solid rgba(200,100,120,.22);background:linear-gradient(160deg,rgba(200,100,120,.1),rgba(200,100,120,.04));color:#e0c0c0}',
    '.pv-mt:active{transform:scale(.97)}',
    '.pv-mt i{font-size:23px;line-height:1;font-style:normal}',
    '.pv-mt b{font-size:13px;font-weight:700;color:#f0d0d6;line-height:1.15}',
    '.pv-mt span{font-size:11px;color:#b09aa3;line-height:1.35}',
    '.pv-ask{text-align:center;font-size:11.5px;color:#b09aa3;letter-spacing:.04em;margin:2px 0 11px}',
    '#pv-backbar{display:flex;flex:none;padding:8px 0 2px}',
    '#pv-backbar[hidden]{display:none}',
    '.pv-warn{border:1px solid rgba(217,160,90,.5);background:rgba(217,160,90,.11);border-radius:13px;',
      'padding:10px 11px;margin-bottom:11px;cursor:pointer}',
    '.pv-warn b{font-size:12px;color:#f0cf9e;display:block}',
    '.pv-warn span{font-size:10.5px;color:#cbb08c;line-height:1.4;display:block;margin-top:3px}',

    // переключатели
    '.pv-sw{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0}',
    '.pv-swrow{padding:6px 0;border-bottom:1px solid rgba(200,100,120,.08)}',
    '.pv-swrow:last-child{border-bottom:none}',
    '.pv-swrow .pv-sw{padding:0}',
    '.pv-swrow .pv-hint{margin-top:3px;padding-right:52px}',
    // волны
    '.pv-hand{display:flex;gap:8px;align-items:stretch}',
    '.pv-strips{flex:1;display:flex;flex-direction:column;gap:6px;min-width:0}',
    '.pv-strip{position:relative;height:64px;border-radius:12px;background:#0f090c;border:1px solid rgba(200,100,120,.18);overflow:hidden;cursor:ns-resize;touch-action:none;user-select:none}',
    '.pv-strips.two .pv-strip{height:48px}',
    '.pv-strip canvas{position:absolute;inset:0;width:100%;height:100%}',
    '.pv-stripnm{position:absolute;left:9px;top:5px;font-size:10px;color:#c08090;pointer-events:none}',
    '.pv-stripv{position:absolute;right:9px;top:4px;font-size:14px;font-weight:700;color:#fff;pointer-events:none}',
    '.pv-handside{display:flex;flex-direction:column;gap:6px;justify-content:flex-end;flex:none}',
    '.pv-handside .pv-red{flex:1;max-height:48px}',
    '.pv-link{appearance:none;flex:1;min-height:36px;max-height:48px;border-radius:11px;border:1px solid rgba(200,100,120,.25);background:rgba(200,100,120,.05);color:#a08088;font-size:16px;cursor:pointer}',
    '.pv-link.on{background:rgba(200,100,120,.7);border-color:transparent;color:#fff}',
    '.pv-link[hidden]{display:none}',
    // дорожки программы
    '.pv-pal .pv-tab{flex:0 0 auto;padding:7px 10px}',
    '.pv-lane{display:flex;align-items:center;gap:6px;margin-top:8px}',
    '.pv-lanenm{width:56px;flex:none;font-size:10px;color:#c08090}',
    '.pv-tape{flex:1;display:flex;gap:3px;height:40px;padding:3px;border-radius:11px;background:#0f090c;border:1px solid rgba(200,100,120,.15);overflow:hidden;min-width:0}',
    '.pv-tapeempty{margin:auto;font-size:11px;color:#a08088}',
    '.pv-blk{flex:none;min-width:34px;border-radius:8px;padding:0 6px;display:flex;flex-direction:column;justify-content:center;overflow:hidden;cursor:pointer;',
      'background:rgba(200,100,120,var(--a,.6));color:#fff;white-space:nowrap}',
    '.pv-blk.quiet{background:rgba(255,255,255,.07);color:#c8a0aa}',
    '.pv-blk b{font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis}',
    '.pv-blk small{font-size:10px;color:#ffe0e6;opacity:.85;overflow:hidden;text-overflow:ellipsis}',
    '.pv-blk.sel{outline:1.5px solid #fff;outline-offset:-1px}',
    '.pv-lanepick{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:11px;color:#b09aa3}',
    '.pv-lanepick .pv-tab{flex:0 0 auto;padding:6px 12px}',
    '.pv-blkedit{margin-top:10px;padding:10px;border-radius:12px;background:#0f090c;border:1px solid rgba(200,100,120,.18)}',
    '.pv-blkhead{font-size:12px;color:#e8c0c8}',
    '.pv-blkedit .pv-tab{flex:1 1 0;padding:7px 4px}',
    '.pv-blkhead b{color:#fff}',
    '.pv-saved{display:flex;flex-wrap:wrap}',
    '.pv-qprev{display:flex;align-items:flex-end;gap:2px;height:26px;margin:8px 0 10px}',
    '.pv-qprev i{flex:1;border-radius:2px 2px 0 0;background:linear-gradient(180deg,#e67e22,#c06070);opacity:.75;min-height:2px}',
    '.pv-tg{width:40px;height:23px;border-radius:13px;background:rgba(200,100,120,.16);position:relative;flex:none;cursor:pointer;transition:background .15s}',
    '.pv-tg i{position:absolute;top:3px;left:3px;width:17px;height:17px;border-radius:50%;background:#e8c0c8;transition:left .15s}',
    '.pv-tg.on{background:rgba(200,100,120,.75)}.pv-tg.on i{left:20px;background:#fff}',

    // поля
    '.pv-in{width:100%;box-sizing:border-box;background:#100a0d;border:1px solid rgba(200,100,120,.22);border-radius:10px;',
      'color:#e0c0c0;padding:8px 10px;font-size:11.5px;font-family:inherit}',
    '.pv-in:focus{outline:none;border-color:rgba(200,100,120,.55)}',
    '.pv-in::placeholder{color:#7a5560}',

    // карточки предпочтений
    '.pv-fcards{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
    '.pv-fcard{background:#120c10;border-radius:12px;padding:10px;border:1px solid rgba(200,100,120,.2);display:flex;flex-direction:column;gap:5px}',
    '.pv-fhead{display:flex;align-items:center;gap:8px}',
    '.pv-fico{width:30px;height:30px;min-width:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;',
      'background:linear-gradient(135deg,rgba(200,100,120,.2),rgba(200,100,120,.05))}',
    '.pv-fname{font-size:10.5px;font-weight:700;color:#e0b0b0;line-height:1.15}',
    '.pv-fwhat{font-size:10.5px;color:#c08090;line-height:1.3}',
    '.pv-ftrig{font-size:10px;color:#d4889a;line-height:1.3;border-top:1px solid rgba(200,100,120,.12);padding-top:5px}',
    '.pv-fwho{font-size:10.5px;font-weight:700;color:#e8b0b8;margin:2px 0 6px}',
    '.pv-eye{width:24px;height:24px;border-radius:8px;border:1px solid rgba(200,100,120,.2);background:rgba(200,100,120,.06);',
      'color:#c08090;font-size:11px;cursor:pointer;line-height:1;padding:0}',
    '.pv-eye.off{opacity:.45}',
    '.pv-blindnote{display:flex;align-items:center;justify-content:center;height:38px;font-size:11px;color:#a8909a;',
      'border:1px dashed rgba(200,100,120,.2);border-radius:10px;margin-top:6px}',
    '.pv-cheat{display:grid;grid-template-columns:auto 1fr;gap:5px 9px;align-items:baseline;margin-top:4px}',
    '.pv-cheat code{font:600 9.5px "SFMono-Regular",Consolas,monospace;color:#e0b0b0;background:rgba(200,100,120,.08);',
      'border:1px solid rgba(200,100,120,.16);border-radius:7px;padding:3px 6px;white-space:nowrap}',
    '.pv-cheat span{font-size:11px;color:#a8909a}',
    '.pv-power{display:flex;align-items:center;gap:7px}',
    '.pv-power span{font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:#c08090}',
    '.pv-graph{display:flex;align-items:flex-end;gap:1px;height:30px;padding:5px 0 0}',
    '.pv-gsum{justify-content:space-between;margin-top:5px;font-size:10.5px;color:#a8909a}',
    '.pv-gsum b{color:#e8b0b8;font-weight:600;margin-left:2px}',
    '.pv-graph i{flex:1;min-width:1px;border-radius:1px;background:linear-gradient(180deg,#e67e22,#c06070);opacity:.85}',
    '.pv-graph i.z{background:rgba(200,100,120,.13)}',
    '.pv-qstep{background:rgba(200,100,120,.05);border:1px solid rgba(200,100,120,.14);border-radius:11px;padding:8px 9px;margin-bottom:7px}',
    '.pv-qtop{display:flex;align-items:center;justify-content:space-between;margin-bottom:5px}',
    '.pv-qtitle{font-size:11px;color:#c08090}',
    '.pv-qbig{font-size:11px;color:#e8b0b8;font-weight:700}',
    '.pv-fchip{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:10px;font-size:10.5px;',
      'background:rgba(200,100,120,.08);border:1px solid rgba(200,100,120,.2);color:#e0b0b0;margin:0 5px 5px 0}',

    // очередь
    '.pv-qrow{display:flex;align-items:center;gap:8px;margin-bottom:7px}',
    '.pv-qrow .pv-sl{flex:1}',
    '.pv-qnum{font-size:10.5px;color:#e8b0b8;min-width:34px;text-align:center}',
    '.pv-qsec{width:54px;text-align:center;padding:5px 4px;font-size:10.5px}',
    '.pv-qdel{width:26px;height:26px;border-radius:8px;border:1px solid rgba(200,100,120,.2);background:rgba(200,100,120,.05);color:#c08090;cursor:pointer;flex:none}',
    '.pv-qcap{margin-top:3px;font-size:10px;color:#a8909a}',
    '.pv-qcap span:last-child{width:54px;text-align:center;flex:none}',

    // прочее
    '.pv-log{max-height:150px;overflow:auto;font-size:11px;line-height:1.55;color:#b09aa3}',
    '.pv-log .pv-logplay{color:#8fb89c}',
    '.pv-log .pv-logerr{color:#f0a8a0}',
    '.pv-log b{color:#c08090;font-weight:600}',
    '.pv-more{margin-top:6px}',
    '.pv-more summary{cursor:pointer;font-size:11px;color:#c08090;padding:4px 0;list-style:none}',
    '.pv-more summary::-webkit-details-marker{display:none}',
    '.pv-more summary:before{content:"▸ ";opacity:.7}',
    '.pv-more[open] summary:before{content:"▾ "}',
    '.pv-foot{font-size:10px;color:#a08088;text-align:center;margin-top:10px}'
  ].join('');
  (pdoc.head || pdoc.documentElement).appendChild(st);
}

function el(id){ return pdoc.getElementById(id); }

function buildDock(){
  if (el('pv-dock')) return;
  var ic = pdoc.createElement('div');
  ic.id = 'pv-dock'; ic.textContent = '≋';
  var pos = lsGet('pv_dockpos', null);
  if (pos && pos.x != null){ ic.style.left = pos.x + 'px'; ic.style.top = pos.y + 'px'; }
  else { ic.style.right = '14px'; ic.style.bottom = 'calc(var(--tavo-inset-bottom-input, 66px) + 84px)'; }
  (pdoc.documentElement || pdoc.body).appendChild(ic);

  var drag = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;
  function savePos(){ try { var r = ic.getBoundingClientRect(); lsSet('pv_dockpos', { x: Math.round(r.left), y: Math.round(r.top) }); } catch(e){} }
  function down(e){ drag = true; moved = false; var p = e.touches ? e.touches[0] : e;
    var r = ic.getBoundingClientRect(); ox = r.left; oy = r.top; sx = p.clientX; sy = p.clientY; }
  function move(e){ if (!drag) return; var p = e.touches ? e.touches[0] : e;
    var dx = p.clientX - sx, dy = p.clientY - sy;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
    var W = pwin.innerWidth || 360, H = pwin.innerHeight || 640;
    ic.style.left = Math.max(4, Math.min(W - 50, ox + dx)) + 'px';
    ic.style.top = Math.max(30, Math.min(H - 50, oy + dy)) + 'px';
    ic.style.right = 'auto'; ic.style.bottom = 'auto';
    if (e.cancelable) e.preventDefault(); }
  function up(){ if (!drag) return; drag = false; if (moved) savePos(); else openWin(); }
  ic.addEventListener('touchstart', down, { passive: true });
  ic.addEventListener('touchmove', move, { passive: false });
  ic.addEventListener('touchend', up);
  ic.addEventListener('mousedown', down);
  pdoc.addEventListener('mousemove', move);
  pdoc.addEventListener('mouseup', up);
  // долгий тап по кнопке = аварийный стоп, не открывая панель
  var hold = null;
  ic.addEventListener('touchstart', function(){ hold = setTimeout(function(){ moved = true; panic('долгое нажатие'); }, 700); }, { passive: true });
  ic.addEventListener('touchend', function(){ clearTimeout(hold); });
  watchInsets();
}

/* Таво публикует отступы своей шапки и поля ввода. Держим кнопку между ними:
   иначе после поворота экрана или смены высоты поля она прячется под чужой UI,
   а в шапке плагин вообще не ловит нажатия — так написано в документации. */
function insets(){
  try { var T = TV(); if (T && T.ui && typeof T.ui.getInsets === 'function') return T.ui.getInsets() || {}; } catch(e){}
  return {};
}

function clampDock(){
  var ic = el('pv-dock'); if (!ic) return;
  var r; try { r = ic.getBoundingClientRect(); } catch(e){ return; }
  if (!r.width) return;                                   // ещё не отрисовалась
  var ins = insets();
  var W = pwin.innerWidth || 360, H = pwin.innerHeight || 640;
  var верх = (ins.topBar != null ? ins.topBar : 62) + 6;
  var низ = H - (ins.bottomInput != null ? ins.bottomInput : 66) - r.height - 6;
  if (низ < верх) низ = верх;
  var x = Math.max(4, Math.min(W - r.width - 4, r.left));
  var y = Math.max(верх, Math.min(низ, r.top));
  if (Math.round(x) === Math.round(r.left) && Math.round(y) === Math.round(r.top)) return;
  ic.style.left = Math.round(x) + 'px'; ic.style.top = Math.round(y) + 'px';
  ic.style.right = 'auto'; ic.style.bottom = 'auto';
  try { lsSet('pv_dockpos', { x: Math.round(x), y: Math.round(y) }); } catch(e){}
}

function watchInsets(){
  if (PV._ins) return;
  PV._ins = 1;
  setTimeout(clampDock, 400);                             // дождёмся первой раскладки
  try {
    var T = TV();
    if (T && T.ui && typeof T.ui.onInsetsChanged === 'function') T.ui.onInsetsChanged(clampDock);
  } catch(e){}
  try { pwin.addEventListener('resize', clampDock); pwin.addEventListener('orientationchange', clampDock); } catch(e){}
}

// Кнопку можно утащить так, что её не достать. Это возврат на место.
function resetDock(){
  var ic = el('pv-dock'); if (!ic) return;
  try { store && store.removeItem('pv_dockpos'); } catch(e){}
  ic.style.left = 'auto'; ic.style.top = 'auto';
  ic.style.right = '14px'; ic.style.bottom = 'calc(var(--tavo-inset-bottom-input, 66px) + 84px)';
  setTimeout(clampDock, 60);
  toast('кнопка ≋ вернулась на место');
}

function buildWin(){
  if (el('pv-win')) return;
  var w = pdoc.createElement('div'); w.id = 'pv-win';
  w.innerHTML =
  '<div id="pv-card">' +
    // ── шапка: главный тумблер здесь, чтобы не искать его по вкладкам ──
    '<div class="pv-row pv-head">' +
      '<div style="flex:1;min-width:0"><h1>PUSYA VIBE ≋</h1><div class="pv-sub" id="pv-guard"></div></div>' +
      // «игра» никому ничего не говорила. Тумблер о том, ведёт ли игрушку персонаж.
      '<div class="pv-power"><span>персонаж</span><div class="pv-tg" id="pv-tg-ai"><i></i></div></div>' +
      '<button class="pv-x" id="pv-close">✕</button>' +
    '</div>' +

    /* ── мастер первого входа ──
       Шесть окошек по одному делу в каждом: что понадобится, Intiface, связь,
       проверка, рубильник, характер. Внутри содержимое рисуется из JS, потому
       что шаги живые: кнопка «дальше» ждёт, пока связь действительно встанет. */
    '<div id="pv-onboard" hidden>' +
      '<div id="pv-wiz-top"></div>' +
      '<div id="pv-wiz-body"></div>' +
      '<div id="pv-wiz-foot"></div>' +
    '</div>' +

    '<div id="pv-main">' +

    // ── устройство и уровень: всегда на виду, на любой вкладке ──
    '<div class="pv-sec" style="margin-top:0">' +
      '<div class="pv-dev">' +
        '<div class="pv-devico" id="pv-devico">≋</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div class="pv-devname" id="pv-devname">нет игрушки</div>' +
          '<div class="pv-devsub" id="pv-status">не подключено</div>' +
        '</div>' +
        '<span class="pv-dot" id="pv-dot"></span>' +
        '<span class="pv-now" id="pv-now">0</span>' +
      '</div>' +
      // Волны вместо ползунка: тянешь вверх — сильнее. У двухмоторной — две,
      // и цепочка справа решает, двигаются они вместе или каждая сама.
      '<div class="pv-hand">' +
        '<div class="pv-strips" id="pv-strips"></div>' +
        '<div class="pv-handside">' +
          '<button class="pv-link" id="pv-link" title="сцепить моторы">⛓</button>' +
          '<button class="pv-b pv-red" id="pv-panic">СТОП</button>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div id="pv-body">' +

    /* ── меню ──
       Сначала выбираешь, куда идти, и рядом сразу написано, что там лежит.
       Четыре вкладки внизу называли себя, но не объясняли; тут — название
       плюс строчка, и разобраться можно, ничего не перетыкивая. */
    '<div class="pv-pane" id="pv-p-home">' +
      '<div id="pv-warn"></div>' +
      '<div class="pv-ask">что делаем?</div>' +
      '<div class="pv-menu">' +
        '<button class="pv-mt" data-go="play"><i>📈</i><b>Сейчас</b>' +
          '<span>что с игрушкой прямо сейчас и каким характером играть</span></button>' +
        '<button class="pv-mt" data-go="rhythm"><i>▶</i><b>Поиграть</b>' +
          '<span>готовые рисунки, своя программа и код для подруги</span></button>' +
        '<button class="pv-mt" data-go="fet"><i>🔥</i><b>Предпочтения</b>' +
          '<span>что заводит его и тебя — плагин ищет это в тексте</span></button>' +
        '<button class="pv-mt" data-go="set"><i>🔌</i><b>Настройки</b>' +
          '<span>игрушка, кто ведёт сцену, границы и лог</span></button>' +
      '</div>' +
    '</div>' +

    // ── ИГРА: то, что меняешь по ходу ──
    '<div class="pv-pane" id="pv-p-play" hidden>' +
      // Сводка сцены в одну полосу: заголовок с цифрами и короткий график.
      // Раньше под ним стояли ещё три плитки — из-за них панель была вдвое выше.
      '<div class="pv-sec">' +
        '<div class="pv-row" style="justify-content:space-between">' +
          '<span class="pv-lbl" style="margin:0">Последние 1,5 минуты</span>' +
          '<span class="pv-row" style="gap:8px">' +
            '<span class="pv-devsub" id="pv-sess">тихо</span>' +
            '<button class="pv-eye" id="pv-blind" title="слепой режим">👁</button>' +
          '</span></div>' +
        '<div class="pv-graph" id="pv-graph"></div>' +
        '<div class="pv-row pv-gsum">' +
          '<span>идёт <b id="pv-t-time">—</b></span>' +
          '<span>средний <b id="pv-t-avg">—</b></span>' +
          '<span>пик <b id="pv-t-peak">—</b></span>' +
        '</div>' +
      '</div>' +

      // Характер — единственное, что меняют по ходу. Остальные ручки в «Настройках».
      '<div class="pv-sec">' +
        '<div class="pv-lbl">Характер</div>' +
        '<div class="pv-note">🎭 Общий тон. Одно касание меняет силу, резкость и то, как часто дразнить.</div>' +
        '<div class="pv-tabs" id="pv-profiles"></div>' +
        '<div class="pv-hint" style="margin-top:6px" id="pv-prof-hint"></div>' +
      '</div>' +

      '<div class="pv-sec">' +
        '<div class="pv-lbl">Что играло</div>' +
        '<div class="pv-note">🎵 Дорожка игры: паттерны, своя программа, волны и что плагин услышал в сцене.</div>' +
        '<div class="pv-log" id="pv-play"></div>' +
      '</div>' +
    '</div>' +

    // ── РИТМ: всё, что играешь ты сама ──
    '<div class="pv-pane" id="pv-p-rhythm" hidden>' +
      // Два понятных раздела вместо трёх абзацев: готовые и свои.
      '<div class="pv-sec">' +
        '<div class="pv-lbl">Готовые</div>' +
        '<div class="pv-note">▶ Нажала — играет. Что почувствуешь, написано под кнопками.</div>' +
        '<div class="pv-tabs" id="pv-presets"></div>' +
        '<div class="pv-hint" id="pv-pat-what" style="margin-top:7px"></div>' +
        '<div class="pv-row" style="justify-content:space-between;margin-top:10px">' +
          '<span class="pv-lbl" style="margin:0">Сколько играть</span>' +
          '<span id="pv-patsec-v" style="font-size:11px;color:#e8b0b8">1 мин</span></div>' +
        '<input type="range" min="30" max="300" step="15" class="pv-sl" id="pv-patsec">' +
      '<div class="pv-swrow" style="margin-top:8px"><div class="pv-sw"><span>Играть по кругу</span><div class="pv-tg" id="pv-tg-patloop"><i></i></div></div><div class="pv-hint" id="pv-patloop-note"></div></div>' +
      '</div>' +

      '<div class="pv-sec">' +
        '<div class="pv-lbl">Своя программа</div>' +
        '<div class="pv-note">🎛 Собери из готовых кусков. Нажми кусок на дорожке — выберешь силу и время.</div>' +
        '<div class="pv-tabs pv-pal" id="pv-pal"></div>' +
        '<div id="pv-lanes"></div>' +
        '<div class="pv-blkedit" id="pv-blkedit"></div>' +
        '<div class="pv-row" style="margin-top:8px">' +
          '<button class="pv-b" id="pv-q-play" style="flex:1">Играть</button>' +
          '<button class="pv-b pv-ghost" id="pv-q-save">Сохранить</button>' +
          '<button class="pv-b pv-ghost" id="pv-q-clear">Очистить</button>' +
        '</div>' +
        '<div id="pv-saved"></div>' +
      '</div>' +

      '<div class="pv-sec">' +
        '<div class="pv-lbl">Поделиться</div>' +
        '<div class="pv-note">🔗 Своя программа — коротким кодом. Подруга вставит и получит то же.</div>' +
        '<input class="pv-in" id="pv-q-code" placeholder="PV2-w2x60.d3x30">' +
        '<div class="pv-row" style="margin-top:7px">' +
          '<button class="pv-b pv-ghost" id="pv-q-copy" style="flex:1">Копировать свой</button>' +
          '<button class="pv-b pv-ghost" id="pv-q-apply" style="flex:1">Вставить чужой</button>' +
        '</div>' +
      '</div>' +
    '</div>' +

    // ── ФЕТИШИ ──
    '<div class="pv-pane" id="pv-p-fet" hidden>' +
      '<div class="pv-sec">' +
        '<div class="pv-lbl">🔥 Предпочтения</div>' +
        '<div class="pv-note">🔥 Что заводит его и тебя. Плагин ищет это в тексте и отзывается.</div>' +
        '<div class="pv-fwho" id="pv-fet-hername">персонаж</div>' +
        '<div id="pv-fet-her"></div>' +
        '<div class="pv-row" style="margin-top:8px">' +
          '<button class="pv-b pv-ghost" id="pv-fet-card" style="flex:1">Из карточки</button>' +
          '<button class="pv-b pv-ghost" id="pv-fet-chat" style="flex:1">Из чата</button>' +
        '</div>' +
        '<div class="pv-fwho" id="pv-fet-minename" style="margin-top:14px">ты</div>' +
        '<input class="pv-in" id="pv-fet-own" placeholder="шёлк, шёпот, связывание">' +
        '<div id="pv-fet-mine" style="margin-top:8px"></div>' +
      '</div>' +
      '<div class="pv-sec">' +
        '<div id="pv-fet-live"></div>' +
      '</div>' +
      '<div class="pv-sec">' +
      '<div class="pv-swrow"><div class="pv-sw"><span>Подсказывать модели</span><div class="pv-tg" id="pv-tg-fetremind"><i></i></div></div><div class="pv-hint">тихо просит вплетать эти детали в текст — не списком, по одной за ответ. Это про прозу, игрушки не касается</div></div>' +
      '<div class="pv-swrow"><div class="pv-sw"><span>Поддавать, когда сработало</span><div class="pv-tg" id="pv-tg-fetdrive"><i></i></div></div><div class="pv-hint">в сцене мелькнули чулки или он прикусил шею — игрушка на пару секунд усилится поверх того, что играет, и вернётся обратно</div></div>' +
      '</div>' +
    '</div>' +

    // ── НАСТРОЙКИ: выставила один раз и забыла ──
    '<div class="pv-pane" id="pv-p-set" hidden>' +
      '<div class="pv-sec">' +
        '<div class="pv-lbl">Игрушка</div>' +
        '<div class="pv-note">🔌 Связь с устройством. Настраивается один раз.</div>' +
        '<div class="pv-row">' +
          '<button class="pv-b" id="pv-connect">Подключить</button>' +
          '<button class="pv-b pv-ghost" id="pv-test">Тест</button>' +
        '</div>' +
      '<div class="pv-swrow"><div class="pv-sw"><span>Подключаться сама</span><div class="pv-tg" id="pv-tg-auto"><i></i></div></div><div class="pv-hint">цепляется при открытии чата и после обрыва</div></div>' +
        '<div id="pv-devs"></div>' +
        '<div id="pv-kinds"></div>' +
        '<details class="pv-more" id="pv-conn-more"><summary>другой адрес или способ связи</summary>' +
          '<div class="pv-tabs" style="margin:6px 0" id="pv-tabs"></div>' +
          '<div id="pv-fields"></div>' +
        '</details>' +
        '<div class="pv-row" style="margin-top:8px">' +
          '<button class="pv-b pv-ghost" id="pv-wiz-again" style="flex:1">Настройка заново</button>' +
          '<button class="pv-b pv-ghost" id="pv-tour-again" style="flex:1">Экскурсия по панели</button>' +
        '</div>' +
        '<div class="pv-hint">первое — окошки про Intiface, второе — указатели по кнопкам</div>' +
      '</div>' +

      '<div class="pv-sec">' +
        '<div class="pv-lbl">Кто ведёт сцену</div>' +
        '<div class="pv-note">🧠 Кто решает, насколько сильно вибрировать: сам плагин по тексту или отдельная модель.</div>' +
        '<div class="pv-tabs" id="pv-brains"></div>' +
        '<div id="pv-brainfields"></div>' +
      '<div class="pv-swrow" style="margin-top:10px"><div class="pv-sw"><span>Слушаться персонажа</span><div class="pv-tg" id="pv-tg-orders"><i></i></div></div><div class="pv-hint">сказал «сильнее» — станет сильнее, «замри» — тишина. А если в сцене он берёт игрушку и включает её на максимум — включится настоящая</div></div>' +
      '<div class="pv-swrow"><div class="pv-sw"><span>Не торопить сцену</span><div class="pv-tg" id="pv-tg-pace"><i></i></div></div><div class="pv-hint">просит модель вести близость ступенями и не сводить её к трём строчкам</div></div>' +
      '<div class="pv-swrow"><div class="pv-sw"><span>Рассказать персонажу про игрушку</span><div class="pv-tg" id="pv-tg-toytell"><i></i></div></div><div class="pv-hint">какая она и какими словами её включать — тогда в сцене будет именно твоя игрушка, и персонаж сможет ею управлять</div></div>' +
      '</div>' +

      // Характер целиком: кнопки профиля дублируют «Сейчас», ручки — только здесь.
      '<div class="pv-sec">' +
        '<div class="pv-lbl">Характер игры</div>' +
        '<div class="pv-note">🎚 Как играть то, что придумала модель. Профиль наверху ставит всё сразу, здесь — по одному.</div>' +

        '<div class="pv-pick">громкость</div>' +
        '<div class="pv-tabs" id="pv-gain"></div>' +
        '<div class="pv-hint">насколько громче или тише играть то, что назначила модель</div>' +

        '<div class="pv-pick">отказ на пике</div>' +
        '<div class="pv-tabs" id="pv-deny"></div>' +
        '<div class="pv-hint">вместо максимума — тишина на несколько секунд, потом вполсилы</div>' +

        '<div class="pv-pick">своеволие</div>' +
        '<div class="pv-tabs" id="pv-chaos"></div>' +
        '<div class="pv-hint">иногда сильнее, чем просили, иногда внезапная заминка</div>' +
      '</div>' +

      '<div class="pv-sec">' +
        '<div class="pv-lbl">Поведение</div>' +
        '<div class="pv-note">⚙️ Мелочи, которые выставляют один раз и забывают.</div>' +
      '<div class="pv-swrow"><div class="pv-sw"><span>Отпустила волну — в ноль</span><div class="pv-tg" id="pv-tg-handzero"><i></i></div></div><div class="pv-hint">выключено — мотор держит силу, на которой ты его оставила</div></div>' +
      '<div class="pv-swrow"><div class="pv-sw"><span>Отклик на мои сообщения</span><div class="pv-tg" id="pv-tg-reply"><i></i></div></div><div class="pv-hint">короткая вставка, пока модель думает</div></div>' +
      '<div class="pv-swrow"><div class="pv-sw"><span>Повторять до ответа</span><div class="pv-tg" id="pv-tg-loop"><i></i></div></div><div class="pv-hint">программа играет по кругу</div></div>' +
      '<div class="pv-swrow"><div class="pv-sw"><span>Не гасить экран</span><div class="pv-tg" id="pv-tg-awake"><i></i></div></div><div class="pv-hint">иначе система усыпит ' + ХОСТ.имя + ' вместе с плагином</div></div>' +
      '<div class="pv-swrow"><div class="pv-sw"><span>Не глушить при сворачивании</span><div class="pv-tg" id="pv-tg-bg"><i></i></div></div><div class="pv-hint">уровень замрёт и дождётся возвращения</div></div>' +
      '<div class="pv-swrow"><div class="pv-sw"><span>Запомнить для этого чата</span><div class="pv-tg" id="pv-tg-perchat"><i></i></div></div><div class="pv-hint" id="pv-chat-note">с одним персонажем жёстче, с другим нежнее</div></div>' +
        '<details class="pv-more"><summary>тонкая настройка</summary>' +
          '<div class="pv-pick" style="margin-top:8px">переходы между уровнями</div>' +
          '<div class="pv-tabs" id="pv-smooth"></div>' +
          '<div class="pv-hint">резко — уровень прыгает сразу, мягко — плавно доезжает за секунду</div>' +
          '<div class="pv-pick">между сценами</div>' +
          '<div class="pv-tabs" id="pv-idle"></div>' +
          '<div class="pv-hint">играть нечего — полная тишина или еле заметный фон</div>' +
          '<div class="pv-sw"><span>Дышать, пока модель думает</span><div class="pv-tg" id="pv-tg-breathe"><i></i></div></div>' +
          '<div class="pv-sw"><span>Глушить, когда пишу я</span><div class="pv-tg" id="pv-tg-user"><i></i></div></div>' +
          '<div class="pv-row" style="margin-top:8px">' +
            '<button class="pv-b pv-ghost" id="pv-dock-reset" style="flex:1">Вернуть кнопку ≋ на место</button>' +
          '</div>' +
          '<div class="pv-hint">если утащила её за край и больше не достать</div>' +
        '</details>' +
      '</div>' +

      '<div class="pv-sec">' +
        '<div class="pv-lbl">Что происходило</div>' +
        '<div class="pv-note">📋 Связь, ошибки, заряд. Игра здесь отмечена одной строкой — подробно она в «Сейчас».</div>' +
        '<div class="pv-log" id="pv-log"></div>' +
      '</div>' +
    '</div>' +

    '</div>' +

    // Возврат в меню прижат к низу карточки и не уезжает при прокрутке раздела.
    '<div id="pv-backbar" hidden><button class="pv-b pv-ghost" data-back="1" style="flex:1">↩ меню</button></div>' +

    '</div>' +
    '<div class="pv-foot">Пуся · t.me/pusgir</div>' +
  '</div>';
  (pdoc.body || pdoc.documentElement).appendChild(w);

  // Слой окна кликов не ловит (pointer-events:none) — чат под панелью остаётся
  // живым, закрывает только ✕.
  el('pv-close').addEventListener('click', closeWin);
  var dr = el('pv-dock-reset'); if (dr) dr.addEventListener('click', resetDock);
  el('pv-panic').addEventListener('click', function(){ panic('кнопка'); });

  // плитки меню и возврат из любого раздела
  [].forEach.call(w.querySelectorAll('[data-go]'), function(b){
    b.addEventListener('click', function(){ showTab(b.getAttribute('data-go')); });
  });
  [].forEach.call(w.querySelectorAll('[data-back]'), function(b){
    b.addEventListener('click', function(){ showTab('home'); });
  });

  el('pv-link').addEventListener('click', function(){
    C.handLink = !C.handLink; saveCfg();
    if (C.handLink && E.manual > 0) setHand(0, Math.max(E.hand[0], E.hand[1]));
    paintStrips(true);
    toast(C.handLink ? 'моторы сцеплены — двигаются вместе' : 'моторы раздельно');
  });

  el('pv-connect').addEventListener('click', function(){
    var b = this;
    b.disabled = true; b.textContent = '…';
    Promise.resolve(D.connect()).then(function(ok){
      b.disabled = false; b.textContent = ok ? 'Переподключить' : 'Подключить';
      log(ok ? 'conn' : 'err', (ok ? 'подключено: ' : 'не вышло: ') + (D.info || D.label));
      if (ok) startEngine();
      buildPrompt(); paintStatus();
      toast(ok ? 'PUSYA VIBE: устройство на связи' : 'PUSYA VIBE: не подключилось');
    });
  });

  // мастер можно пройти заново — например, когда меняешь игрушку
  var wz = el('pv-wiz-again');
  if (wz) wz.addEventListener('click', function(){
    wizStep = 0; gateSkipped = false; C.wizDone = false; saveCfg();
    paintGate();
  });
  var tr = el('pv-tour-again');
  if (tr) tr.addEventListener('click', function(){ startTour(); });

  el('pv-test').addEventListener('click', function(){
    if (!D || D.state !== 'on') { toast('сначала подключись'); return; }
    var top = Math.min(12, capLevel());
    playProgram([step({ v: 3, to: { v: top } }, 2), step({ v: top }, 1), step({ v: 0 }, 0.3)], 0, { exact: true, mine: true });
    log('test', 'тест 3 сек');
  });

  tg('pv-tg-ai', function(){ return E.aiOn; }, function(v){
    if (v && !host().aiControl){ toast('включи «Разрешить ИИ управлять» в настройках плагина'); return false; }
    if (v && (!D || D.state !== 'on')){ toast('ищу игрушку…'); autoConnectAgain(); }
    E.aiOn = v;
    if (!v){ allStop('ИИ отключён'); wakeLockOff(); }
    else { E.lockUntil = 0; lastMsgKey = ''; lastCmdCount = 0; brainKey = ''; fbKey = ''; startEngine(); }
    buildPrompt(); return true;
  });
  tg('pv-tg-loop', function(){ return !!C.loop; }, function(v){ C.loop = v; saveCfg(); return true; });
  tg('pv-tg-user', function(){ return !!C.autoStopOnUser; }, function(v){ C.autoStopOnUser = v; saveCfg(); return true; });
  tg('pv-tg-awake', function(){ return !!C.keepAwake; }, function(v){
    C.keepAwake = v; saveCfg();
    if (v) wakeLockOn(); else wakeLockOff();
    return true;
  });
  tg('pv-tg-bg', function(){ return !!C.bgKeep; }, function(v){ C.bgKeep = v; saveCfg(); return true; });
  tg('pv-tg-gate', function(){ return !!C.gate; }, function(v){ C.gate = v; saveCfg(); return true; });
  tg('pv-tg-auto', function(){ return !!C.autoConnect; }, function(v){
    C.autoConnect = v; saveCfg();
    if (v) autoConnectAgain(); else clearTimeout(autoTimer);
    return true;
  });
  tg('pv-tg-reply', function(){ return !!C.reply; }, function(v){ C.reply = v; saveCfg(); return true; });
  tg('pv-tg-handzero', function(){ return !!C.handZero; }, function(v){ C.handZero = v; saveCfg(); return true; });
  tg('pv-tg-breathe', function(){ return !!C.breathe; }, function(v){ C.breathe = v; saveCfg(); return true; });
  tg('pv-tg-fetremind', function(){ return !!C.fetRemind; }, function(v){ C.fetRemind = v; saveCfg(); buildPrompt(); return true; });
  tg('pv-tg-fetdrive', function(){ return !!C.fetDrive; }, function(v){ C.fetDrive = v; saveCfg(); return true; });
  tg('pv-tg-orders', function(){ return !!C.orders; }, function(v){ C.orders = v; saveCfg(); return true; });
  tg('pv-tg-pace', function(){ return !!C.paceHint; }, function(v){ C.paceHint = v; saveCfg(); buildPrompt(); return true; });
  tg('pv-tg-toytell', function(){ return !!C.toyTell; }, function(v){ C.toyTell = v; toyToldAt = 0; saveCfg(); buildPrompt(); return true; });
  tg('pv-tg-perchat', function(){ return !!C.perChat; }, function(v){
    C.perChat = v; saveCfg();
    if (v){ saveChatCfg(); log('chat', 'настройки закреплены за этим чатом'); }
    return true;
  });

  var own = el('pv-fet-own');
  own.value = C.fetOwn || '';
  own.addEventListener('input', function(){ C.fetOwn = this.value; saveCfg(); paintFetish(); buildPrompt(); });

  el('pv-fet-card').addEventListener('click', rescanCard);
  el('pv-fet-chat').addEventListener('click', scanChatFetishes);

  var pal = el('pv-pal');
  КУСКИ.forEach(function(name){
    var b = pdoc.createElement('div'); b.className = 'pv-tab pv-add'; b.textContent = '+ ' + name;
    b.addEventListener('click', function(){ addBlock(name); });
    pal.appendChild(b);
  });
  el('pv-q-play').addEventListener('click', playLanes);
  el('pv-q-save').addEventListener('click', saveLanes);
  el('pv-q-clear').addEventListener('click', function(){ C.lanes = [[], []]; laneSel = null; saveCfg(); paintLanes(); });

  el('pv-blind').addEventListener('click', function(){
    C.blind = !C.blind; saveCfg();
    paintGraph(); paintMeter();
    toast(C.blind ? 'вслепую: цифры спрятаны' : 'снова видно');
  });

  el('pv-q-copy').addEventListener('click', function(){
    var f = el('pv-q-code'), code = rhythmCode();
    if (!code){ toast('сначала собери программу'); return; }
    f.value = code;
    try { f.select(); f.setSelectionRange(0, 999); } catch(e){}
    var ok = false;
    try { if (navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(code); ok = true; } } catch(e){}
    if (!ok) { try { ok = pdoc.execCommand && pdoc.execCommand('copy'); } catch(e){} }
    toast(ok ? 'код скопирован' : 'код в поле — скопируй вручную');
  });

  el('pv-q-apply').addEventListener('click', function(){
    var f = el('pv-q-code');
    if (applyRhythmCode(f.value)){
      log('queue', 'программа из кода: ' + lanes()[0].length + (lanes()[1].length ? ' + ' + lanes()[1].length : '') + ' куск.');
      toast('программа подставлена');
    } else {
      toast('код не понят — он выглядит как PV2-w2x60.d3x30');
    }
  });

  paintPicks();

  var pr = el('pv-presets');
  Object.keys(PRESETS).forEach(function(name){
    var b = pdoc.createElement('div'); b.className = 'pv-tab'; b.textContent = name;
    b.setAttribute('data-pat', name);
    b.addEventListener('click', function(){
      C.patLast = name; saveCfg(); paintPat();       // подпись объяснит, что это такое
      if (!D || D.state !== 'on'){ toast('сначала подключись'); return; }
      E.manual = 0; E.hand = [0, 0];
      // Паттерн выбран рукой — играем ровно его: без своеволия, без отказов
      // на пике и не давая живому отклику перебить.
      var сек = clamp(C.patSec, 30, 300);
      playProgram(makePreset(name, capLevel(), сек), 0, { exact: true, mine: true, loop: !!C.patLoop });
      log('pat', 'паттерн «' + name + '» · ' + секстр(сек) + (C.patLoop ? ' по кругу' : ' один раз'));
    });
    pr.appendChild(b);
  });

  var ps = el('pv-patsec');
  ps.value = clamp(C.patSec, 30, 300);
  ps.addEventListener('input', function(){ C.patSec = clamp(this.value, 30, 300); saveCfg(); paintPat(); });
  tg('pv-tg-patloop', function(){ return !!C.patLoop; }, function(v){ C.patLoop = v; saveCfg(); paintPat(); return true; });
  paintPat();

  showTab(C.tab || 'home');
  paintTabs(); paintBrains(); paintProfiles(); paintStatus(); paintMeter(); paintLog();
}

/* ═══════════════ профили и память по чатам ═══════════════ */

var PROFILES = {
  'нежно':   { gain: 0.7, smooth: 60, idleLevel: 2, deny: 0,  chaos: 10, tone: 'Держись тихой стороны: касания 2-5, разогрев 6-9, выше поднимайся редко и ненадолго.' },
  'обычно':  { gain: 1.0, smooth: 35, idleLevel: 0, deny: 15, chaos: 15, tone: 'Держись сцены: нежность — 3-8, нарастание — 9-14, пик — 15-20. Меняй интенсивность по ходу описания, а не один раз в конце.' },
  'жёстко':  { gain: 1.5, smooth: 15, idleLevel: 0, deny: 10, chaos: 25, tone: 'Не жалей: разогрев начинай с 8-10, на пике держи максимум и обрывай резко.' },
  'дразнить':{ gain: 1.0, smooth: 45, idleLevel: 1, deny: 65, chaos: 45, tone: 'Дразни: поднимай почти до предела и роняй в ноль, не давай привыкнуть. Долгих ровных участков не делай.' }
};

function applyProfile(name){
  var p = PROFILES[name]; if (!p) return;
  C.gain = p.gain; C.smooth = p.smooth; C.idleLevel = p.idleLevel; C.tone = p.tone;
  if (p.deny != null) C.deny = p.deny;
  if (p.chaos != null) C.chaos = p.chaos;
  C.profile = name;
  saveCfg(); saveChatCfg();
  paintPicks(); paintProfiles(); paintBrains(); buildPrompt();
  log('prof', 'профиль «' + name + '»');
}

// Настройки на чат: у каждого персонажа своя мера.
var chatId = '';
function chatKey(){ return 'pv_chat_' + (chatId || 'общий'); }

var ЧАТ_ПОЛЯ = ['gain','smooth','idleLevel','tone','brain','profile','deny','chaos'];
var chatVarTimer = null;

// Что храним в переменных самого чата: предпочтения и, если просили, его настройки.
function chatBag(){
  var bag = { fet: (C.fetChar && C.fetChar[chatKey()]) || [] };
  if (C.perChat){
    bag.cfg = {};
    ЧАТ_ПОЛЯ.forEach(function(k){ bag.cfg[k] = C[k]; });
  }
  return bag;
}

function saveChatCfg(){
  lsSet(chatKey(), chatBag());                 // быстрый кэш
  clearTimeout(chatVarTimer);
  chatVarTimer = setTimeout(function(){
    var V = VAPI(); if (!V) return;
    try { Promise.resolve(V.set(VAR_CHAT, chatBag(), 'chat')).catch(function(){}); } catch(e){}
  }, 700);
}

// Сначала кэш (мгновенно), потом правда из переменных чата.
function loadChatCfg(){
  var v = lsGet(chatKey(), null);
  var взяли = применитьChatBag(v);
  var V = VAPI();
  if (V){
    Promise.resolve(V.get(VAR_CHAT, 'chat')).then(function(real){
      if (!real) return;
      if (применитьChatBag(real)){ lsSet(chatKey(), real); repaintAll(); buildPrompt(); }
    }).catch(function(){});
  }
  return взяли;
}

function применитьChatBag(v){
  if (!v || typeof v !== 'object') return false;
  var что = false;
  // Старый формат хранил настройки плоско — читаем и его, чтобы ничего не потерялось.
  var cfg = v.cfg || (v.gain !== undefined ? v : null);
  if (cfg && C.perChat){
    ЧАТ_ПОЛЯ.forEach(function(k){ if (cfg[k] !== undefined && cfg[k] !== C[k]){ C[k] = cfg[k]; что = true; } });
  }
  if (Array.isArray(v.fet)){
    if (!C.fetChar) C.fetChar = {};
    if (JSON.stringify(C.fetChar[chatKey()] || []) !== JSON.stringify(v.fet)){
      C.fetChar[chatKey()] = v.fet; что = true;
    }
  }
  if (что) lsSet('pv_cfg_v1', C);
  return что;
}

function pickChat(){
  var T = TV();
  if (!T || !T.chat || !T.chat.current) return;
  Promise.resolve(T.chat.current()).then(function(ch){
    var id = ch && (ch.id || ch.chatId || ch.name || ch.characterName);
    if (!id) return;
    chatId = String(id);
    // Предпочтения живут в переменных чата всегда, настройки — если попросили,
    // поэтому читаем при каждом открытии, а не только под галочкой.
    if (loadChatCfg() && C.perChat){
      log('chat', 'настройки этого чата подхвачены');
      repaintAll(); buildPrompt();
    }
    var n = el('pv-chat-note');
    if (n) n.textContent = C.perChat ? ('запоминаю для: ' + chatId.slice(0, 28)) : 'с одним персонажем можно жёстче, с другим нежнее';
    // Карточку разбираем только теперь: до этого момента chatKey() указывал
    // на «общий», и найденное ложилось не в тот чат.
    paintFetish();
    scanCharCard();
  }).catch(function(){});
}

// Одно описание профиля на всю панель: его показывает и «Сейчас», и мастер.
function profHint(){
  return ({
    // Без цифр: «старт с 8-10» никто не переведёт в ощущения, а слова — сразу.
    'нежно':   'тихо и плавно, до сильного почти не доходит',
    'обычно':  'идёт за сценой: касания — тихо, разгар — сильнее, пик — на полную',
    'жёстко':  'сразу с середины, на пике на полную, обрывы резкие',
    'дразнить':'доводит почти до предела и роняет в ноль — привыкнуть не даёт'
  })[C.profile] || '';
}

function paintProfiles(){
  var box = el('pv-profiles'); if (!box) return;
  box.innerHTML = '';
  Object.keys(PROFILES).forEach(function(name){
    var b = pdoc.createElement('div');
    b.className = 'pv-tab' + (C.profile === name ? ' on' : '');
    b.textContent = name;
    b.addEventListener('click', function(){ applyProfile(name); });
    box.appendChild(b);
  });
  var h = el('pv-prof-hint');
  if (h) h.textContent = profHint();
}

var PANES = ['home', 'play', 'rhythm', 'fet', 'set'];
var СТАРЫЕ_ВКЛАДКИ = { brain: 'set', more: 'set' };     // раскладка менялась — не роняем C.tab

function showTab(id){
  if (СТАРЫЕ_ВКЛАДКИ[id]) id = СТАРЫЕ_ВКЛАДКИ[id];
  if (PANES.indexOf(id) < 0) id = 'home';
  C.tab = id; saveCfg();
  PANES.forEach(function(x){ var n = el('pv-p-' + x); if (n) n.hidden = (x !== id); });
  var bb = el('pv-backbar'); if (bb) bb.hidden = (id === 'home');   // в меню возвращаться некуда
  var body = el('pv-body'); if (body) body.scrollTop = 0;
  if (id === 'home') paintWarn();
  if (id === 'fet') paintFetish();
  if (id === 'rhythm'){ paintLanes(); paintPat(); }
  if (id === 'play') paintGraph();
}

/* Плашка в меню. Половина вопросов «почему ничего не происходит» — это либо
   выключенный рубильник в настройках Таво, либо неподключённая игрушка, либо
   снятый тумблер «персонаж». Говорим об этом сразу и ведём туда, где чинится. */
function paintWarn(){
  var box = el('pv-warn'); if (!box) return;
  var H = host(), беда = null;

  if (!H.aiControl){
    беда = { t: '⚠ рубильник выключен',
      s: 'Выключено «Разрешить ИИ управлять» — оно ' + ХОСТ.настройки + '. Пока так, игрушка молчит, что бы тут ни стояло.', go: '' };
  } else if (!D || D.state !== 'on'){
    беда = { t: '🔌 игрушка не подключена',
      s: 'Нажми, чтобы открыть подключение.', go: 'set' };
  } else if (!E.aiOn){
    беда = { t: '⏸ персонаж не ведёт игрушку',
      s: 'Тумблер «персонаж» наверху выключен — игрушка слушается только тебя.', go: '' };
  }

  if (!беда){ box.innerHTML = ''; return; }
  box.innerHTML = '<div class="pv-warn"><b>' + esc(беда.t) + '</b><span>' + esc(беда.s) + '</span></div>';
  var карточка = box.firstChild;
  if (беда.go) карточка.addEventListener('click', function(){ showTab(беда.go); });
  else карточка.style.cursor = 'default';
}

/* ═══════════════ экскурсия по панели ═══════════════

   То, что в самой панели, показываем пальцем: кольцо вокруг настоящей кнопки,
   облачко рядом, всё остальное притемнено. Инструкции про Intiface и настройки
   Таво так показать нельзя — они живут в других приложениях, и для них остаются
   экраны мастера со скриншотами. */

var TOUR = [
  { тут: 'pv-tg-ai', где: 'home',
    t: 'Главный тумблер',
    s: 'Включён — игрушку ведёт персонаж: плагин читает сцену и крутит её сам. Выключен — она слушается только тебя.' },

  { тут: 'pv-panic', где: 'home',
    t: 'СТОП',
    s: 'Гасит всё мгновенно и с любого экрана. Рядом волны: тянешь вверх — сильнее. У двух моторов цепочка решает, двигаются они вместе или каждый сам.' },

  { сам: function(){ return el('pv-p-home') && el('pv-p-home').querySelector('.pv-menu'); }, где: 'home',
    t: 'Отсюда попадаешь всюду',
    s: 'Четыре раздела, и у каждого написано, что внутри. Из любого возвращаешься кнопкой «↩ меню» внизу.' },

  { тут: 'pv-warn', где: 'home', пропустить: function(){ return !el('pv-warn') || !el('pv-warn').innerHTML; },
    t: 'Если что-то мешает',
    s: 'Здесь появится причина, по которой игрушка молчит, — и по плашке можно нажать, чтобы попасть туда, где чинится.' },

  // ── Сейчас ──
  { тут: 'pv-graph', где: 'play',
    t: 'Как идёт сцена',
    s: 'Последние полторы минуты одним взглядом: где было тихо, где пик. Шкала везде одна — от 0 до 20.' },

  { внутри: 'pv-profiles', где: 'play',
    t: 'Характер',
    s: 'Общий тон игры одним касанием. Под кнопками словами написано, как играет выбранный.' },

  { внутри: 'pv-play', где: 'play',
    t: 'Что играло',
    s: 'Дорожка игры: какие паттерны и программы играли, что плагин услышал в сцене. Свежее сверху.' },

  // ── Поиграть ──
  { внутри: 'pv-presets', где: 'rhythm',
    t: 'Готовые',
    s: 'Нажала рисунок — играет он, персонаж не вмешивается. Ниже — сколько играть и по кругу ли.' },

  { внутри: 'pv-lanes', где: 'rhythm',
    t: 'Свои',
    s: 'Собираешь из готовых кусков: нажала «+ волна» — кусок встал на дорожку, нажала на кусок — выбрала силу и время. У двух моторов у каждого своя дорожка.' },

  { внутри: 'pv-q-code', где: 'rhythm',
    t: 'Поделиться',
    s: 'Своя программа превращается в короткий код. Скопировала, отправила — подруга вставит и получит то же самое.' },

  // ── Предпочтения ──
  { внутри: 'pv-fet-her', где: 'fet',
    t: 'Что заводит',
    s: 'Сверху — персонажа: из карточки или из чата. Ниже — твои, через запятую. Лишнее убирается крестиком.' },

  { внутри: 'pv-tg-fetdrive', где: 'fet',
    t: 'Что с ними делать',
    s: 'Можно тихо подсказывать модели вплетать их в текст. И можно, чтобы игрушка поддавала, когда такое мелькнуло в сцене.' },

  // ── Настройки ──
  { внутри: 'pv-connect', где: 'set',
    t: 'Игрушка',
    s: 'Подключить, проверить, выбрать, какие участвуют. Здесь же пройти настройку и эту экскурсию заново.' },

  { внутри: 'pv-brains', где: 'set',
    t: 'Кто ведёт сцену',
    s: 'Плагин сам по словам в тексте или отдельная модель. Ниже — слушаться ли команд персонажа и просить ли модель не комкать сцену.' },

  { внутри: 'pv-gain', где: 'set',
    t: 'Характер игры',
    s: 'То же, что профиль, но по отдельности: громкость, отказ на пике, своеволие. Профиль переставляет их все сразу.' },

  { внутри: 'pv-tg-reply', где: 'set',
    t: 'Поведение',
    s: 'Мелочи на один раз: откликаться на твои сообщения, не гасить экран, помнить настройки для чата. Потолок, автостоп и стоп-слово — ' + ХОСТ.настройки + '.' },

  { внутри: 'pv-log', где: 'set',
    t: 'Что происходило',
    s: 'Связь, ошибки, заряд — ошибки подсвечены красным. Игра здесь одной строкой, подробно она в «Сейчас».' }
];

// Раздел, чтобы в облачке было понятно, где мы сейчас.
var TOUR_РАЗДЕЛ = { home: 'Меню', play: 'Сейчас', rhythm: 'Поиграть', fet: 'Предпочтения', set: 'Настройки' };

var tourStep = 0;

function tourTarget(ш){
  if (ш.сам) { try { return ш.сам(); } catch(e){ return null; } }
  // «внутри» — подсвечиваем весь блок, в котором лежит этот элемент, а не одну кнопку
  if (ш.внутри){
    var x = el(ш.внутри); if (!x) return null;
    return (x.closest && x.closest('.pv-sec')) || x;
  }
  return el(ш.тут);
}

function startTour(){
  tourStep = 0;
  var t = el('pv-tour');
  if (!t){
    t = pdoc.createElement('div'); t.id = 'pv-tour';
    t.innerHTML = '<div id="pv-spot"></div><div id="pv-bubble"></div>';
    var w = el('pv-win'); (w || pdoc.body).appendChild(t);
    t.addEventListener('click', function(e){ if (e.target === t) tourGo(1); });
  }
  t.hidden = false;
  paintTour();
}

function endTour(){
  var t = el('pv-tour'); if (t) t.hidden = true;
  C.tourDone = true; saveCfg();
}

function tourGo(шаг){
  tourStep += шаг;
  if (tourStep < 0) tourStep = 0;
  if (tourStep >= TOUR.length){ endTour(); toast('всё, дальше сама'); return; }
  paintTour();
}

function paintTour(){
  var t = el('pv-tour'); if (!t || t.hidden) return;

  // шаг может оказаться неуместным — например, плашки «что мешает» сейчас нет
  var ш = TOUR[tourStep];
  var защита = 0;
  while (ш && ш.пропустить && ш.пропустить() && защита++ < TOUR.length){
    tourStep++; ш = TOUR[tourStep];
  }
  if (!ш){ endTour(); return; }

  if (ш.где) showTab(ш.где);

  var цель = tourTarget(ш);
  var spot = el('pv-spot'), bub = el('pv-bubble');
  var H = pwin.innerHeight || 640;

  /* Настройки длинные: блок может оказаться ниже края, и кольцо рисовалось бы
     в пустоте. Прокручиваем сами тело панели так, чтобы блок встал по центру.
     scrollIntoView не берём — он крутит и чат под плагином. */
  var r = null;
  try {
    var тело = el('pv-body');
    if (цель && тело && тело.contains(цель)){
      var tr = тело.getBoundingClientRect(), cr = цель.getBoundingClientRect();
      тело.scrollTop += (cr.top - tr.top) - Math.max(0, (tr.height - cr.height) / 2);
    }
    if (цель){
      var g = цель.getBoundingClientRect();
      r = { left: g.left, top: g.top, right: g.right, bottom: g.bottom, width: g.width, height: g.height };
      /* Блок бывает выше видимой части раздела — тогда кольцо по полной высоте
         вылезало за низ карточки, в пустоту. Обрезаем по тому, что реально видно. */
      if (тело && тело.contains(цель)){
        var видно = тело.getBoundingClientRect();
        r.top = Math.max(r.top, видно.top);
        r.bottom = Math.min(r.bottom, видно.bottom);
        r.height = Math.max(0, r.bottom - r.top);
        if (!r.height) r = null;                 // блок целиком за краем — только облачко
      }
    }
  } catch(e){}

  if (r && r.width){
    var pad = 6;
    spot.hidden = false;
    spot.style.left = (r.left - pad) + 'px';
    spot.style.top = (r.top - pad) + 'px';
    spot.style.width = (r.width + pad * 2) + 'px';
    spot.style.height = (r.height + pad * 2) + 'px';
  } else {
    // не нашли, что подсветить — показываем только облачко, по центру
    spot.hidden = true;
  }

  var последний = tourStep === TOUR.length - 1;
  bub.innerHTML =
    '<div class="pv-wz-num">' + esc(TOUR_РАЗДЕЛ[ш.где] || '') + ' · ' + (tourStep + 1) + ' из ' + TOUR.length + '</div>' +
    '<b class="t">' + esc(ш.t) + '</b><span class="s">' + esc(ш.s) + '</span>' +
    '<div class="pv-row">' +
      (tourStep > 0 ? '<button class="pv-b pv-ghost" data-tr="back">Назад</button>' : '') +
      '<button class="pv-b" data-tr="next" style="flex:1">' + (последний ? 'Понятно' : 'Дальше') + '</button>' +
      '<button class="pv-b pv-ghost" data-tr="end">✕</button>' +
    '</div>';

  // ставим облачко под подсветкой, а если там тесно — над ней
  bub.style.top = '0px';
  var h = bub.getBoundingClientRect().height || 150;
  var низ = r && r.width ? r.bottom + 12 : (H - h) / 2;
  if (низ + h > H - 12) низ = r && r.width ? Math.max(12, r.top - h - 12) : Math.max(12, H - h - 12);
  bub.style.top = Math.round(низ) + 'px';

  [].forEach.call(bub.querySelectorAll('[data-tr]'), function(b){
    b.addEventListener('click', function(e){
      e.stopPropagation();
      var что = b.getAttribute('data-tr');
      if (что === 'end') { endTour(); return; }
      tourGo(что === 'back' ? -1 : 1);
    });
  });
}

/* ═══════════════ мастер первого входа ═══════════════

   Шесть окошек, по одному делу в каждом. Кнопка «дальше» на шаге со связью
   ждёт, пока связь действительно встанет, — иначе человек уходит дальше с
   неработающей игрушкой и потом гадает, почему тихо. */

var wizStep = 0;

/* Скриншоты Intiface. Сюда кладутся картинки в виде data:image/... — тогда они
   появятся в соответствующих окошках. Пусто — окошко останется текстовым,
   ничего не сломается и никаких «здесь будет картинка» не покажется.

   Платформы разные, поэтому и слоты разные: путь к разрешениям на айфоне и на
   андроиде не совпадает совсем. */
var WIZ_IMG = {
  engine:     'data:image/jpeg;base64,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',    // Intiface на телефоне: большая ▶ и статус Engine running
  engine_pc:  '',    // Intiface на компьютере: ▶ и Engine running
  perms_ios:  '',    // айфон: Настройки → Intiface → Bluetooth и Локальная сеть
  perms_and:  '',    // андроид: разрешения «Устройства поблизости» и «Местоположение»
  scan:       'data:image/jpeg;base64,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',    // Intiface: Devices → Start Scanning со списком
  pair:       '',    // телефон: системный Bluetooth со спаренным Satisfyer
  netw:       '',    // Intiface на компьютере: «Listen on all network interfaces»
  tavo:       '',    // Таво: Ещё → Плагины → PUSYA VIBE, «Разрешить ИИ управлять»
  download:   'data:image/jpeg;base64,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m+N9U8XeJtc0/Ubu/s47XZZWrQqoQ5B5Y16DRRR0sLzCiiikMKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigB9p/rJvqP5VZqtaf6yb6j+VWaGMKKKKQBRRRQBDef8ez/AIfzqI9alvP+PZ/w/nUR60xCUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFI7BEZz0UZ5OKWovs8OJhsyJvvgknNAFUajlJCIg7IyABW4O7pyQKjudQaLyncGPbM0ciKc5IHHP5VPLYRNEUiyhZlLMWJJCnpnNTfZbfaq+UCFJIySeT1J9aYEkZcoDIoVj1AOQPxp1NijWKNY0BCrwATmnUgCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigB9p/rJvqP5VZqtaf6yb6j+VWaGMKKKKQBRRRQBDef8ez/h/Ooj1qa5UvA6qMn0qt5sZ/jUexODTEx1FN8yP/AJ6J/wB9CjzI/wDnon/fQoAdRTfMj/56J/30KPMj/wCeif8AfQoAdRTfMj/56J/30KPMj/56J/30KAHUU3zI/wDnon/fQo8yP/non/fQoAdRTfMj/wCeif8AfQo8yP8A56J/30KAHUU3zI/+eif99CjzI/8Anon/AH0KAHUU3zI/+eif99CjzI/+eif99CgB1FN8yP8A56J/30KPMj/56J/30KAHUU3zI/8Anon/AH0KPMj/AOeif99CgB1FN8yP/non/fQo8yP/AJ6J/wB9CgB1FN8yP/non/fQo8yP/non/fQoAdRTfMj/AOeif99CjzI/+eif99CgB1FN8yP/AJ6J/wB9CjzI/wDnon/fQoAdRTfMj/56J/30KPMj/wCeif8AfQoAdRTfMj/56J/30KPMj/56J/30KAHUU3zI/wDnon/fQo8yP/non/fQoAdRTfMj/wCeif8AfQo8yP8A56J/30KAHUU3zI/+eif99CjzI/8Anon/AH0KAHUU3zI/+eif99CjzI/+eif99CgB1FN8yP8A56J/30KPMj/56J/30KAHUU3zI/8Anon/AH0KPMj/AOeif99CgB1FN8yP/non/fQo8yP/AJ6J/wB9CgB1FN8yP/non/fQo8yP/non/fQoAdRTfMj/AOeif99CjzI/+eif99CgB1FN8yP/AJ6J/wB9CjzI/wDnon/fQoAdRTfMj/56J/30KPMj/wCeif8AfQoAdRTfMj/56J/30KPMj/56J/30KAHUU3zI/wDnon/fQo8yP/non/fQoAdRTfMj/wCeif8AfQo8yP8A56J/30KAJbT/AFk31H8qs1XtAT5kmMBiMe+BVikxhRRRQAUUUUAFIVUnJUH8KWigBNif3R+VGxP7o/KlooATYn90flRsT+6PypaKAE2J/dH5UbE/uj8qWigBNif3R+VGxP7o/KlooATYn90flRsT+6PypaKAE2J/dH5UbE/uj8qWigBNif3R+VGxP7o/KlooATYn90flRsT+6PypaKAE2J/dH5UbE/uj8qWigBNif3R+VGxP7o/KlooATYn90flRsT+6PypaKAE2J/dH5UbE/uj8qWigBNif3R+VGxP7o/KlooATYn90flRsT+6PypaKAE2J/dH5UbE/uj8qWigBNif3R+VGxP7o/KlooATYn90flRsT+6PypaKAE2J/dH5UbE/uj8qWigBNif3R+VGxP7o/KlooATYn90flRsT+6PypaKAE2J/dH5UbE/uj8qWigBNif3R+VGxP7o/KlooATYn90flRsT+6PypaKAE2J/dH5UbE/uj8qWigBNif3R+VGxP7o/KlooATYn90flRsT+6PypaKAE2J/dH5UbE/uj8qWigBNif3R+VGxP7o/KlooATYn90flRsT+6PypaKACiiigAooooATNLmiigAzRmiigAzRmiigAzRmiigAzRmiigAzRmiigAzRmiigAzRmiigAzRmiigAzRmiigAzRmiigAzRmiigAzRmiigAzRmiigAzRmiigAzRmiigAzRmiigAzRmiigAzRmiigAzRmiigAzRmiigAzRmiigAzRmiigAzRmiigAzRmiigAzRmiigAzRmiigAzRmiigAzRmiigAzRmiigAzRmiigAzRmiigBM0UUUAf/2Q=='     // intiface.com: страница загрузки со всеми платформами
};

/* На чём мы сейчас. Таво живёт на телефоне, но Intiface может стоять и на
   компьютере в той же Wi-Fi — тогда шаги другие. Платформу определяем, чтобы
   не заставлять читать инструкцию не от своего устройства. */
function плат(){
  var ua = '';
  try { ua = String((pwin.navigator || navigator).userAgent || ''); } catch(e){}
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  // Таво бывает и на компьютере — тогда «этот телефон» звучит как издёвка
  if (/Windows|Macintosh|Mac OS X|Linux|CrOS/i.test(ua)) return 'desktop';
  return 'иное';
}

// 'phone' исторически значит «там же, где Таво», 'pc' — «на другом устройстве в той же Wi-Fi».
// Значения не переименовываем, чтобы не сломать сохранённые настройки.
function гдеIntiface(){ return C.ifaceOn === 'pc' ? 'pc' : 'phone'; }

function этоУстройство(){
  var п = плат();
  return п === 'ios' ? 'на этом айфоне' : п === 'android' ? 'на этом андроиде'
       : п === 'desktop' ? 'на этом компьютере' : 'здесь же, где ' + ХОСТ.имя;
}

function wizImg(имя, подпись){
  var src = WIZ_IMG[имя];
  if (!src) return '';
  return '<img class="pv-wz-img" src="' + src + '" alt="">' +
    (подпись ? '<div class="pv-wz-cap">' + esc(подпись) + '</div>' : '');
}

function wizAddr(){
  return C.driver === 'intiface' ? (C.wsUrl || 'ws://127.0.0.1:12345')
    : C.driver === 'lovense' ? (C.lvIp + ':' + C.lvPort)
    : C.driver === 'phone' ? 'вибромотор телефона' : (C.hookUrl || 'свой адрес');
}

var WIZ = [
  {
    t: 'Что понадобится',
    body: function(){
      return '<div class="pv-wz-lead">Настроим один раз — дальше плагин цепляется сам.</div>' +
        '<ul class="pv-wz-list">' +
          '<li><b>Игрушка с Bluetooth.</b> Почти любая: Satisfyer, We-Vibe, Lovense, Kiiroo и ещё сотня.</li>' +
          '<li><b>Intiface Central</b> — бесплатное приложение. Есть в App Store, Google Play и для компьютера (Windows, Mac, Linux). Оно говорит с игрушкой по Bluetooth, плагин сам этого не умеет.</li>' +
        '</ul>' +
        wizImg('download', 'intiface.com — выбери своё устройство') +
        '<div class="pv-wz-note">Нет игрушки под рукой? Можно пройти позже — плагин напомнит.</div>';
    }
  },
  {
    t: 'Где будет Intiface',
    body: function(){
      return '<div class="pv-wz-lead">Bluetooth бьёт на пару метров, поэтому Intiface ставится на то устройство, ' +
        'что <b>физически рядом с игрушкой</b>. Выбери, где он будет жить.</div>' +
        '<div class="pv-tabs" id="pv-wz-where"></div>' +
        '<div class="pv-wz-note" id="pv-wz-wherehint"></div>' +
        '<div class="pv-wz-note" style="margin-top:10px">Проще всего ' + этоУстройство() + ': адрес <b>127.0.0.1</b> ' +
        'никуда не денется и не упрётся в запреты браузера. Другое устройство удобнее, если игрушка ловится там лучше.</div>';
    },
    после: function(){
      var box = el('pv-wz-where'); if (!box) return;
      var варианты = [
        { v: 'phone', t: этоУстройство() },
        { v: 'pc', t: плат() === 'desktop' ? 'на другом устройстве' : 'на компьютере' }
      ];
      box.innerHTML = '';
      варианты.forEach(function(x){
        var b = pdoc.createElement('div');
        b.className = 'pv-tab' + (гдеIntiface() === x.v ? ' on' : '');
        b.textContent = x.t;
        b.addEventListener('click', function(){
          C.ifaceOn = x.v;
          // адрес подсказываем сразу: локальный или пустой под чужой IP
          if (x.v === 'phone' && !/^ws:\/\/(127\.0\.0\.1|localhost)/.test(C.wsUrl || '')) C.wsUrl = 'ws://127.0.0.1:12345';
          saveCfg(); paintWiz();
        });
        box.appendChild(b);
      });
      var h = el('pv-wz-wherehint');
      if (h) h.textContent = гдеIntiface() === 'pc'
        ? 'оба устройства должны быть в одной Wi-Fi'
        : 'самый простой путь — ничего настраивать в сети не нужно';
    }
  },
  {
    t: 'Запусти движок',
    body: function(){
      var пк = гдеIntiface() === 'pc', п = плат();
      var компьютерЗдесь = !пк && п === 'desktop';
      var h = '<div class="pv-wz-lead">Открой Intiface Central ' +
        (пк ? '<b>на том устройстве</b>' : этоУстройство()) + ' и нажми большую <b>▶</b>.</div>' +
        wizImg(пк || компьютерЗдесь ? 'engine_pc' : 'engine', 'вот эта ▶ — после нажатия статус станет Engine running');

      if (пк){
        h += '<div class="pv-wz-note">Чтобы ' + ХОСТ.имя + ' вообще ' + (НА_СТ ? 'смогла' : 'смог') + ' достучаться, в настройках Intiface включи ' +
          '<b>«Listen on all network interfaces»</b> — по умолчанию он слушает только сам себя.</div>' +
          wizImg('netw', 'настройки Intiface') +
          '<div class="pv-wz-note">Там же посмотри <b>порт</b> (обычно 12345) и узнай <b>IP этого устройства</b> в локальной сети — ' +
          'он понадобится через шаг.</div>';
      } else if (компьютерЗдесь){
        h += '<div class="pv-wz-note">На компьютере разрешения спрашивать не нужно — достаточно, чтобы в системе был включён Bluetooth.</div>';
      } else {
        h += '<div class="pv-wz-note">Не срабатывает или статус сразу падает обратно — значит, приложению не дали разрешений.</div>';
        if (п === 'android'){
          h += wizImg('perms_and', 'Настройки → Приложения → Intiface → Разрешения') +
            '<div class="pv-wz-note">На андроиде нужны <b>«Устройства поблизости»</b> и <b>«Местоположение»</b>. ' +
            'Второе выглядит странно, но без него система не даёт искать Bluetooth-устройства — это правило самого андроида, не Intiface.</div>';
        } else {
          h += wizImg('perms_ios', 'Настройки → Intiface → Bluetooth и Локальная сеть') +
            '<div class="pv-wz-note">На айфоне нужны <b>Bluetooth</b> и <b>Локальная сеть</b>. ' +
            'Обоих нет в списке? Нажми ▶ ещё раз — система спросит сама.</div>';
        }
      }
      return h;
    }
  },
  {
    t: 'Найди игрушку',
    body: function(){
      return '<div class="pv-wz-lead">Включи игрушку и <b>полностью закрой её родное приложение</b> — ' +
        'она слушается только одного хозяина. Потом в Intiface: <b>Devices → Start Scanning</b>.</div>' +
        wizImg('scan', 'так должно быть: Engine running, у игрушки зелёный значок Bluetooth') +
        '<div class="pv-wz-note">⚠️ <b>Satisfyer</b> — исключение: его нужно сначала спарить в системном Bluetooth ' +
        'того устройства, где стоит Intiface. Остальные бренды, наоборот, парить не надо.</div>' +
        wizImg('pair', 'Satisfyer в системном Bluetooth — только для него') +
        // Проверено вживую: «нашёл, но не подключается» лечилось не донглом, а этим.
        '<details class="pv-more" style="margin-top:8px"><summary>Satisfyer виден, но не подключается</summary>' +
          '<ol class="pv-wz-steps" style="margin-top:6px">' +
            '<li><b>Отвяжи его от прежнего хозяина.</b> Satisfyer помнит только одно устройство. ' +
            'Закрой Intiface и Satisfyer Connect на телефоне, а в его Bluetooth нажми «Забыть это устройство».</li>' +
            '<li><b>Сбрось игрушку:</b> зажми кнопку сброса из инструкции на 10 секунд. Сброс прошёл, если она дала ' +
            '<b>3 вибрации, а потом 5 быстрых импульсов</b>.</li>' +
            '<li><b>Windows 11 прячет её в списке.</b> Параметры → Bluetooth и устройства → Устройства → ' +
            '«Обнаружение устройств Bluetooth» → <b>«Расширенный»</b>. Потом «Добавить устройство» — она будет называться ' +
            '<b>SF …</b> или «Неизвестное устройство».</li>' +
          '</ol>' +
          '<div class="pv-wz-note">В логе Intiface это выглядит как «found» и сразу за ним «NotConnected» по кругу. ' +
          'Отдельный Bluetooth-донгл нужен, только если после всех трёх шагов не помогло.</div>' +
        '</details>' +
        '<div class="pv-wz-note">Если игрушки нет в списке у самого Intiface — идти дальше бессмысленно: плагин видит ровно то же.</div>';
    }
  },
  {
    t: 'Свяжемся с ней',
    body: function(){
      var s = D ? D.state : '';
      var строка = s === 'on' ? '<b style="color:#8fd6a4">✓ подключено: ' + esc(toyCaps().names.join(', ') || 'игрушка') + '</b>'
        : s === 'connecting' ? 'подключаюсь…'
        : s === 'error' ? '<b style="color:#f0a0a0">' + esc(D.info || 'не вышло') + '</b>'
        : 'ещё не пробовали';
      return '<div class="pv-wz-lead">Теперь пусть плагин найдёт Intiface.</div>' +
        '<div class="pv-ob-addr">адрес: <b>' + esc(wizAddr()) + '</b></div>' +
        '<div class="pv-wz-state">' + строка + '</div>' +
        '<div class="pv-row" style="margin-top:10px">' +
          '<button class="pv-b" data-wz="conn" style="flex:1">' + (s === 'on' ? 'Переподключить' : 'Подключить') + '</button>' +
        '</div>' +
        '<div class="pv-row" style="margin-top:7px">' +
          '<button class="pv-b pv-ghost" data-wz="addr" style="flex:1">Другой адрес или способ связи</button>' +
        '</div>' +
        (гдеIntiface() === 'pc'
          ? '<div class="pv-wz-note">Intiface на компьютере — впиши <b>ws://IP-компьютера:12345</b> через «другой адрес». ' +
            'IP виден в самом Intiface или в настройках сети компьютера.</div>' +
            '<div class="pv-wz-note">Если ' + ХОСТ.имя + ' ' + (НА_СТ ? 'открыта' : 'открыт') + ' по https, браузер может не пустить незащищённый <b>ws://</b> на чужой адрес. ' +
            'Тогда включи в Intiface <b>secure websockets</b> и пиши <b>wss://</b>.</div>'
          : '<div class="pv-wz-note">Intiface на этом же телефоне — оставляй <b>127.0.0.1</b>. Так надёжнее: ' +
            'адрес не слетает при смене Wi-Fi и не упирается в запреты браузера.</div>');
    },
    ok: function(){ return D && D.state === 'on'; },
    нельзя: 'сначала подключись — или пропусти шаг'
  },
  {
    t: 'Проверим',
    body: function(){
      return '<div class="pv-wz-lead">Короткий тест: игрушка должна плавно раскрутиться и затихнуть.</div>' +
        '<div class="pv-row" style="margin-top:10px">' +
          '<button class="pv-b" data-wz="test" style="flex:1">Тест 3 секунды</button>' +
        '</div>' +
        '<div class="pv-wz-note">Тихо? Потяни ползунок в самом Intiface. Не вибрирует и там — дело в игрушке: заряд, сон или родное приложение всё ещё держит её.</div>';
    }
  },
  {
    t: 'Главный рубильник',
    body: function(){
      var вкл = !!host().aiControl;
      return '<div class="pv-wz-lead">Последняя обязательная вещь, и она <b>снаружи панели</b>.</div>' +
        '<div class="pv-wz-state">' + (вкл
          ? '<b style="color:#8fd6a4">✓ рубильник включён — всё готово</b>'
          : '<b style="color:#f0cf9e">⚠ пока выключен — игрушка будет молчать</b>') + '</div>' +
        '<ol class="pv-wz-steps">' +
          '<li>' + ХОСТ.путь + '</li>' +
          '<li>Включи <b>«Разрешить ИИ управлять»</b>.</li>' +
          '<li>Там же стоят границы: <b>потолок интенсивности</b>, <b>автостоп</b> и <b>стоп-слово</b>. Загляни, поставь по себе.</li>' +
        '</ol>' +
        '<div class="pv-wz-note">В настройках PUSYA VIBE это самый первый переключатель, сразу под строкой про кнопку ≋. ' +
        'Нажми на него — он станет цветным.</div>' +
        '<div class="pv-wz-note">Это сделано нарочно: то, что останавливает игрушку, живёт ' + ХОСТ.настройки + ', а не в панели — чтобы случайно не сдвинуть в процессе.</div>';
    }
  },
  {
    t: 'Готово',
    body: function(){
      return '<div class="pv-wz-lead">Осталось выбрать характер — всё остальное встанет само.</div>' +
        '<div class="pv-tabs" id="pv-wz-prof"></div>' +
        '<div class="pv-wz-note" id="pv-wz-profhint"></div>' +
        '<div class="pv-wz-note" style="margin-top:12px">Дальше просто играй: плагин читает сцену сам, ' +
        'ни тегов, ни правок в пресете не нужно.</div>' +
        '<div class="pv-row" style="margin-top:12px">' +
          '<button class="pv-b" data-wz="tour" style="flex:1">Показать саму панель</button>' +
        '</div>' +
        '<div class="pv-wz-note">экскурсия по всем разделам: ' + TOUR.length + ' указателей по настоящим кнопкам</div>';
    },
    после: function(){
      var box = el('pv-wz-prof'); if (!box) return;
      box.innerHTML = '';
      Object.keys(PROFILES).forEach(function(name){
        var b = pdoc.createElement('div');
        b.className = 'pv-tab' + (C.profile === name ? ' on' : '');
        b.textContent = name;
        b.addEventListener('click', function(){ applyProfile(name); paintWiz(); });
        box.appendChild(b);
      });
      var h = el('pv-wz-profhint'); if (h) h.textContent = profHint();
    }
  }
];

function paintWiz(){
  var top = el('pv-wiz-top'), body = el('pv-wiz-body'), foot = el('pv-wiz-foot');
  if (!top || !body || !foot) return;
  // пока она печатает адрес в раскрывашке, перерисовывать нельзя — потеряется ввод
  try { if (pdoc.activeElement && pdoc.activeElement.tagName === 'INPUT') return; } catch(e){}

  wizStep = clamp(wizStep, 0, WIZ.length - 1);
  var ш = WIZ[wizStep], последний = wizStep === WIZ.length - 1;

  var точки = '';
  for (var i = 0; i < WIZ.length; i++) точки += '<i class="' + (i <= wizStep ? 'on' : '') + '"></i>';
  top.innerHTML = '<div class="pv-wz-dots">' + точки + '</div>' +
    '<div class="pv-wz-num">шаг ' + (wizStep + 1) + ' из ' + WIZ.length + '</div>' +
    '<div class="pv-wz-title">' + esc(ш.t) + '</div>';

  body.innerHTML = ш.body();
  if (ш.после) ш.после();

  var можно = !ш.ok || ш.ok();
  foot.innerHTML =
    '<div class="pv-row">' +
      (wizStep > 0 ? '<button class="pv-b pv-ghost" data-wz="back">Назад</button>' : '') +
      '<button class="pv-b" data-wz="next" style="flex:1">' + (последний ? 'Готово' : 'Дальше') + '</button>' +
    '</div>' +
    (можно ? '' : '<div class="pv-wz-note" style="text-align:center;margin-top:6px">' + esc(ш.нельзя || '') + '</div>') +
    '<div class="pv-row" style="margin-top:7px">' +
      '<button class="pv-b pv-ghost" data-wz="skip" style="flex:1">Пропустить настройку</button>' +
    '</div>';

  [].forEach.call(el('pv-onboard').querySelectorAll('[data-wz]'), function(b){
    b.addEventListener('click', function(){ wizDo(b.getAttribute('data-wz'), b); });
  });
}

function wizDo(что, кнопка){
  if (что === 'back'){ wizStep--; paintWiz(); return; }
  if (что === 'skip'){ wizFinish(false); return; }
  if (что === 'next'){
    var ш = WIZ[wizStep];
    if (ш.ok && !ш.ok()){ toast(ш.нельзя || 'ещё не готово'); wizStep++; paintWiz(); return; }
    if (wizStep >= WIZ.length - 1){ wizFinish(true); return; }
    wizStep++; paintWiz(); return;
  }
  if (что === 'conn'){
    кнопка.disabled = true; кнопка.textContent = '…';
    Promise.resolve(D.connect()).then(function(ok){
      log(ok ? 'conn' : 'err', (ok ? 'подключено: ' : 'не вышло: ') + (D.info || D.label));
      if (ok) startEngine();
      buildPrompt(); paintStatus(); paintWiz();
    });
    return;
  }
  if (что === 'test'){
    if (!D || D.state !== 'on'){ toast('сначала подключись'); return; }
    var top = Math.min(12, capLevel());
    playProgram([step({ v: 3, to: { v: top } }, 2), step({ v: top }, 1), step({ v: 0 }, 0.3)], 0, { exact: true, mine: true });
    log('test', 'тест 3 сек');
    return;
  }
  if (что === 'addr'){
    wizFinish(false);
    showTab('set');
    var d = el('pv-conn-more'); if (d) d.open = true;
    return;
  }
  if (что === 'tour'){
    wizFinish(true);
    setTimeout(startTour, 120);              // дадим панели проявиться
  }
}

function wizFinish(дошла){
  C.wizDone = true; saveCfg();
  gateSkipped = true;
  var ob = el('pv-onboard'), main = el('pv-main');
  if (ob) ob.hidden = true;
  if (main) main.hidden = false;
  showTab(дошла ? 'home' : (C.tab || 'home'));
  if (дошла) log('wiz', 'настройка пройдена');
}

/* Первый вход: пока мастер не пройден, панель занята только им. */
function paintGate(){
  var ob = el('pv-onboard'), main = el('pv-main');
  if (!ob || !main) return;
  var нужно = !gateSkipped && !C.wizDone;
  ob.hidden = !нужно;
  main.hidden = нужно;
  if (нужно) paintWiz();
}

var BRAINS = [
  { id: 'live',  label: 'По словам — на лету' },
  { id: 'model', label: 'Отдельная модель' }
];

function bindVal(id, key){
  var n = el(id); if (!n) return;
  n.value = C[key] || '';
  n.addEventListener('input', function(){ C[key] = this.value; saveCfg(); });
}

// Разбор последнего ответа персонажа прямо сейчас.
function brainNow(){
  var T = TV();
  if (!T || !T.message || !T.message.find){ toast('нет доступа к сообщениям'); return; }
  Promise.resolve(T.message.find()).then(function(all){
    var m = null;
    for (var i = (all || []).length - 1; i >= 0; i--){
      if (String(all[i].role || '').toLowerCase().indexOf('user') < 0){ m = all[i]; break; }
    }
    if (!m){ toast('в чате нет ответа персонажа'); return; }
    brainKey = ''; brainBusy = false;
    startEngine();
    runBrain('ручной-' + now(), String(m.content || m.text || ''));
  }).catch(function(){ toast('не вышло прочитать чат'); });
}

function paintBrains(){
  var box = el('pv-brains'); if (!box) return;
  box.innerHTML = '';
  BRAINS.forEach(function(b){
    var n = pdoc.createElement('div');
    n.className = 'pv-tab' + (C.brain === b.id ? ' on' : '');
    n.textContent = b.label;
    n.addEventListener('click', function(){
      C.brain = b.id; saveCfg();
      clearTimeout(brainTimer); brainKey = '';
      buildPrompt(); paintBrains(); paintStatus();
    });
    box.appendChild(n);
  });

  var f = el('pv-brainfields'); if (!f) return;
  if (C.brain === 'live'){
    f.innerHTML = '<div class="pv-hint" style="margin-top:8px">Плагин читает ответ прямо во время печати и отзывается на то, что только что появилось. ' +
      'Ничего не просит у основной модели: ни лишних токенов, ни правок в пресете.</div>' +
      '<div class="pv-lbl" style="margin-top:12px">По каким словам считаю</div>' +
      '<div class="pv-cheat">' +
        '<code style="color:#c08090">тихо · до 6</code><span>касания, шёпот, поцелуи, мурашки</span>' +
        '<code style="color:#d4889a">средне · до 11</code><span>стоны, дрожь, бёдра, пальцы</span>' +
        '<code style="color:#e67e22">пик · до 17</code><span>глубже, быстрее, содрогается, оргазм</span>' +
      '</div>' +
      '<div class="pv-sw" style="margin-top:8px"><span>Отзываться по ходу печати</span><div class="pv-tg" id="pv-tg-flow"><i></i></div></div>' +
      '<div class="pv-hint">выключишь — сцена соберётся один раз, когда ответ дописан</div>' +
      '<div class="pv-row" style="margin-top:8px"><button class="pv-b pv-ghost" id="pv-brain-now" style="flex:1">Разобрать последний ответ</button></div>';
    tg('pv-tg-flow', function(){ return !!C.flowLive; }, function(v){ C.flowLive = v; saveCfg(); return true; });
  } else if (C.brain === 'model'){
    f.innerHTML = '<div class="pv-hint" style="margin-top:8px">Отдельный тихий запрос читает готовый ответ и строит программу. Проза остаётся чистой, тегов в тексте нет.</div>' +
      '<input class="pv-in" style="margin-top:8px" id="pv-ep" placeholder="эндпоинт, напр. https://api.deepseek.com/v1">' +
      '<input class="pv-in" style="margin-top:6px" id="pv-model" placeholder="модель, напр. deepseek-chat">' +
      '<input class="pv-in" style="margin-top:6px" id="pv-key" type="password" placeholder="ключ">' +
      '<div class="pv-row" style="margin-top:8px">' +
        '<button class="pv-b pv-ghost" id="pv-brain-now" style="flex:1">Разобрать ответ</button>' +
        '<button class="pv-b pv-ghost" id="pv-model-test">Проверить ключ</button></div>' +
      '<div class="pv-hint">вписываешь один раз — адрес, модель и ключ запоминаются и остаются после перезапуска. ' +
      'Пусто — спрошу ' + ХОСТ.модель + '</div>' +
      '<div class="pv-sw" style="margin-top:4px"><span>Не тратить запрос на спокойные сцены</span><div class="pv-tg" id="pv-tg-gate"><i></i></div></div>' +
      '<div class="pv-sw" style="margin-top:4px"><span>Подсказывать, куда вести сцену</span><div class="pv-tg" id="pv-tg-hint"><i></i></div></div>' +
      '<div class="pv-hint">в том же запросе, без доплаты: модель смотрит, что уже было, и одной фразой подсказывает основной, ' +
      'что сделать иначе в следующем ответе — сменить темп, задержаться, вплести предпочтение</div>' +
      (HINT.text ? '<div class="pv-hint" style="margin-top:4px">последняя подсказка: «' + esc(HINT.text) + '»</div>' : '');
    bindVal('pv-ep', 'ep'); bindVal('pv-model', 'model'); bindVal('pv-key', 'key');
    tg('pv-tg-gate', function(){ return !!C.gate; }, function(v){ C.gate = v; saveCfg(); return true; });
    tg('pv-tg-hint', function(){ return !!C.hintOn; }, function(v){ C.hintOn = v; saveCfg(); buildPrompt(); return true; });
    var mt = el('pv-model-test');
    if (mt) mt.addEventListener('click', function(){
      var b = this;
      if (!C.ep || !C.key || !C.model){ toast('заполни эндпоинт, модель и ключ'); return; }
      b.disabled = true; b.textContent = '…';
      modelAsk('Ответь одним словом: ок', 'Ты отвечаешь ровно одним словом.').then(function(r){
        b.disabled = false; b.textContent = 'Проверить ключ';
        log('conn', 'модель ответила: ' + String(r).replace(/\s+/g, ' ').slice(0, 40));
        toast('модель на связи');
      }).catch(function(e){
        b.disabled = false; b.textContent = 'Проверить ключ';
        log('err', 'модель: ' + String(e && e.message || e).slice(0, 70));
        toast('модель не ответила');
      });
    });
  }
  var bn = el('pv-brain-now');
  if (bn) bn.addEventListener('click', function(){
    if (!D || D.state !== 'on'){ toast('сначала подключи устройство'); return; }
    brainNow();
  });
}

/* ═══ предпочтения ═══ */

function fetChips(list, onDel){
  if (!list.length) return '<div class="pv-hint">пока пусто</div>';
  return list.map(function(x, i){
    return '<span class="pv-fchip" data-i="' + i + '">' + esc(x.emoji) + ' ' + esc(x.name) +
      (onDel ? '<b style="opacity:.5;font-weight:400">✕</b>' : '') + '</span>';
  }).join('');
}

function paintFetish(){
  // подписи — именами из карточки и персоны, а не «её» и «мои»
  var hn = el('pv-fet-hername'), mn = el('pv-fet-minename');
  if (hn) hn.textContent = NAMES.char;
  if (mn) mn.textContent = NAMES.user;

  // ── персонаж: из карточки и из чата, лишнее убирается нажатием ──
  var her = el('pv-fet-her');
  if (her){
    var list = charFetishes();
    her.innerHTML = fetChips(list, true);
    [].forEach.call(her.querySelectorAll('.pv-fchip'), function(chip){
      chip.addEventListener('click', function(){
        var i = +chip.getAttribute('data-i');
        var arr = charFetishes().slice();
        arr.splice(i, 1);
        C.fetChar[chatKey()] = arr;
        saveCfg(); saveChatCfg(); paintFetish(); buildPrompt();
      });
    });
  }

  // ── мои ──
  var mine = el('pv-fet-mine');
  if (mine) mine.innerHTML = fetChips(ownFetishes(), false);

  // ── что сейчас в сцене: только то, что нужно плагину ──
  var live = el('pv-fet-live');
  if (!live) return;
  if (!F.cards || !F.cards.length){
    live.innerHTML = '<div class="pv-hint">Когда в ответе сработает триггер, он появится здесь карточкой.</div>';
    return;
  }
  var html = '<div class="pv-row" style="justify-content:space-between;margin-bottom:8px">' +
    '<span class="pv-lbl" style="margin:0">сейчас в сцене</span>' +
    '<span style="font-size:11px;color:#e67e22;font-weight:700">сила ' + (F.intensity || 0) + ' / 5</span></div>' +
    '<div class="pv-fcards">';
  F.cards.slice(0, 4).forEach(function(c){
    html += '<div class="pv-fcard">' +
      '<div class="pv-fhead"><div class="pv-fico">' + esc(c.emoji) + '</div>' +
      '<div class="pv-fname">' + esc(c.name) + '</div></div>' +
      '<div class="pv-fwhat">' + esc(c.what) + '</div>' +
      '<div class="pv-ftrig">⚡ ' + esc(c.trig) + '</div></div>';
  });
  live.innerHTML = html + '</div>';
}

// Слить найденное в общий список её предпочтений, без повторов.
function addCharFetishes(found, откуда){
  if (!C.fetChar) C.fetChar = {};
  var have = charFetishes().slice();
  var было = have.length;
  found.forEach(function(f){
    if (have.length >= 8) return;
    var есть = have.some(function(x){ return x.name === f.name; });
    if (!есть) have.push(f);
  });
  C.fetChar[chatKey()] = have;
  saveCfg(); saveChatCfg(); paintFetish(); buildPrompt();
  var новых = have.length - было;
  log('fet', новых ? ('+' + новых + ' из ' + откуда + ': ' + have.slice(было).map(function(f){ return f.name; }).join(', '))
                   : ('в ' + откуда + ' ничего нового'));
  toast(новых ? ('нашла ' + новых) : ('в ' + откуда + ' ничего нового'));
}

function scanText(txt){
  var t = String(txt || '').toLowerCase(), found = [];
  FET_DICT.forEach(function(f){
    if (found.length >= 8) return;
    if (new RegExp(f.re, 'i').test(t)) found.push({ emoji: f.emoji, name: f.name });
  });
  return found;
}

// Из чата: смотрим последние сообщения — что реально всплывает в вашей игре.
function scanChatFetishes(){
  var T = TV();
  if (!T || !T.message || !T.message.find){ toast('нет доступа к чату'); return; }
  Promise.resolve(T.message.find()).then(function(all){
    var txt = (all || []).slice(-40).map(function(m){ return String(m.content || m.text || ''); }).join('\n');
    if (!txt){ toast('чат пустой'); return; }
    addCharFetishes(scanText(txt), 'чата');
  }).catch(function(){ toast('не вышло прочитать чат'); });
}

// Из карточки — то же самое, но по описанию персонажа.
function rescanCard(){
  getChar().then(function(ch){
    if (!ch){ toast('не вижу карточку персонажа'); return; }
    var txt = cardText(ch);
    if (!txt){ toast('в карточке нет текста'); return; }
    addCharFetishes(scanText(txt), 'карточки');
  }).catch(function(){ toast('не вышло прочитать карточку'); });
}

/* ═══ свой ритм ═══ */

// «90 сек» глазами не читается, «1 мин 30 сек» — читается.
function секстр(n){
  n = Math.max(0, Math.round(+n || 0));
  if (n < 60) return n + ' сек';
  var м = Math.floor(n / 60), с = n % 60;
  return м + ' мин' + (с ? ' ' + с + ' сек' : '');
}

function paintPat(){
  var v = el('pv-patsec-v');
  if (v) v.textContent = секстр(clamp(C.patSec, 30, 300));

  var n = el('pv-patloop-note');
  if (n) n.textContent = C.patLoop
    ? 'и готовые, и свои — по кругу до СТОП'
    : 'один раз, потом сцену снова ведёт персонаж';

  var w = el('pv-pat-what');
  if (w){
    var имя = C.patLast && PRESET_WHAT[C.patLast] ? C.patLast : '';
    w.innerHTML = имя
      ? '<b style="color:#e8b0b8">' + esc(имя) + '</b> — ' + esc(PRESET_WHAT[имя])
      : 'нажми любой — здесь напишу, что он делает';
  }

  var box = el('pv-presets');
  if (box) [].forEach.call(box.children, function(c){
    var есть = c.getAttribute('data-pat') === C.patLast;
    c.className = 'pv-tab' + (есть ? ' on' : '');
  });
}

/* ═══ волны: ручное управление ═══ */
/* Тянешь полосу вверх — мотор сильнее, волна выше и чаще. Пока ты не трогаешь,
   волны показывают, что играет сейчас, — они же и заменяют полоску уровня. */

function setHand(i, v){
  v = clamp(Math.round(v), 0, 20);
  var двое = motorCount() > 1;
  if (!(E.manual > 0)) E.hand = [0, 0];            // прежняя рука уже не в силе
  if (!двое || C.handLink) E.hand = [v, v]; else E.hand[i] = v;
  var было = E.manual > 0;
  E.manual = двое ? Math.max(E.hand[0], E.hand[1]) : E.hand[0];
  // Волна в руках — ведёшь ты; отпустила в ноль — автоматика снова свободна.
  if (E.manual > 0){ if (!было) clearProg(); E.mine = true; startEngine(); }
  else { E.hand = [0, 0]; E.lastOut = ''; E.mine = false; }
}

var stripsN = 0, lanesKey = '', waveShow = [0, 0], wavePh = 0, waveRaf = 0;

function paintStrips(сила){
  var box = el('pv-strips'); if (!box) return;
  var n = motorCount();
  var lk = el('pv-link');
  if (lk){ lk.hidden = n < 2; lk.className = 'pv-link' + (C.handLink ? ' on' : ''); lk.title = C.handLink ? 'моторы сцеплены' : 'моторы раздельно'; }
  // дорожек столько же, сколько моторов — перерисовываем их, когда меняется игрушка или связь
  var ключ = n + (D && D.state === 'on' ? '+' : '-');
  if (ключ !== lanesKey){ lanesKey = ключ; paintLanes(); }
  if (n === stripsN && !сила) return;
  stripsN = n;
  box.innerHTML = '';
  box.className = 'pv-strips' + (n > 1 ? ' two' : '');
  for (var i = 0; i < n; i++) (function(i){
    var d = pdoc.createElement('div');
    d.className = 'pv-strip';
    d.innerHTML = '<canvas></canvas>' + (n > 1 ? '<span class="pv-stripnm">мотор ' + (i + 1) + '</span>' : '') +
      '<span class="pv-stripv"></span>';
    box.appendChild(d);
    var лвл = function(y){ var r = d.getBoundingClientRect(); return (1 - (y - r.top) / Math.max(1, r.height)) * 20; };
    var тянет = false;
    var down = function(e){ тянет = true; try { d.setPointerCapture(e.pointerId); } catch(_){} setHand(i, лвл(e.clientY)); if (e.cancelable) e.preventDefault(); };
    var move = function(e){ if (тянет) setHand(i, лвл(e.clientY)); };
    var up = function(){
      if (!тянет) return; тянет = false;
      if (C.handZero) setHand(i, 0);
    };
    d.addEventListener('pointerdown', down);
    d.addEventListener('pointermove', move);
    d.addEventListener('pointerup', up);
    d.addEventListener('pointercancel', up);
  })(i);
  startWaves();
}

// Что показывать на волнах: руку, если ведёшь ты, иначе то, что играет.
function waveTarget(){
  if (E.manual > 0) return motorCount() > 1 ? [E.hand[0], E.hand[1]] : [E.hand[0], E.hand[0]];
  var L = E.live || {}, общ = Math.max(L.v || 0, L.r || 0, L.s || 0, L.t || 0, L.p || 0);
  return L.d ? [L.v || 0, L.w || 0] : [общ, общ];
}

function waveNext(f){ return pwin.requestAnimationFrame ? pwin.requestAnimationFrame(f) : setTimeout(f, 33); }
function startWaves(){ if (!waveRaf) waveRaf = waveNext(drawWaves); }

function drawWaves(){
  waveRaf = 0;
  var w = el('pv-win'), box = el('pv-strips');
  if (!w || !box || !w.classList.contains('on') || pdoc.hidden) return;     // окно закрыто — не тратим батарею
  var цель = waveTarget();
  wavePh += 0.06;
  var dpr = pwin.devicePixelRatio || 1;
  var цвета = ['rgba(255,143,171,.95)', 'rgba(201,160,255,.95)'];
  [].forEach.call(box.children, function(d, i){
    waveShow[i] += (цель[i] - waveShow[i]) * 0.18;
    var cv = d.firstChild, W = Math.round(d.clientWidth * dpr), H = Math.round(d.clientHeight * dpr);
    if (!W || !H) return;
    if (cv.width !== W) cv.width = W;
    if (cv.height !== H) cv.height = H;
    var c = cv.getContext('2d');
    c.clearRect(0, 0, W, H);
    c.strokeStyle = 'rgba(200,100,120,.08)'; c.lineWidth = 1;
    for (var g = 1; g < 4; g++){ c.beginPath(); c.moveTo(0, H * g / 4); c.lineTo(W, H * g / 4); c.stroke(); }
    // вслепую волна живёт, но силу не выдаёт
    var amp = C.blind ? 6 : waveShow[i];
    var mid = H / 2 + 3 * dpr;
    c.beginPath();
    for (var x = 0; x <= W; x += 3){
      var k = x / W;
      var a = (1.2 + amp * (H / dpr / 46)) * dpr;
      var y = mid + Math.sin(k * Math.PI * (3 + amp * 0.35) * 2 + wavePh * (1 + amp * 0.12) + i * 1.7) * a * (0.55 + 0.45 * Math.sin(k * Math.PI));
      if (x) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.strokeStyle = цвета[i] || цвета[0]; c.lineWidth = 1.7 * dpr; c.stroke();
    var v = d.lastChild;
    var txt = C.blind ? '·' : String(Math.round(цель[i]));
    if (v.textContent !== txt) v.textContent = txt;
  });
  waveRaf = waveNext(drawWaves);
}

/* ═══ именованные кнопки вместо ползунков ═══

   Ползунок заставляет тянуть, чтобы узнать, что вообще бывает: «35 из 100»
   не говорит ничего, пока не перепробуешь всё. Ряд кнопок показывает все
   варианты сразу и словами — так сделано в дневнике, и там это работает. */

var ВЫБОРЫ = {
  gain:   [{ v: 0.7, t: 'тише' }, { v: 1, t: 'как просят' }, { v: 1.5, t: 'громче' }, { v: 2.2, t: 'вдвое' }],
  deny:   [{ v: 0, t: 'никогда' }, { v: 15, t: 'редко' }, { v: 40, t: 'иногда' }, { v: 70, t: 'часто' }],
  chaos:  [{ v: 0, t: 'ровно' }, { v: 15, t: 'чуть' }, { v: 40, t: 'заметно' }, { v: 75, t: 'своенравно' }],
  smooth: [{ v: 0, t: 'резко' }, { v: 35, t: 'мягко' }, { v: 70, t: 'очень мягко' }],
  idle:   [{ v: 0, t: 'тишина' }, { v: 2, t: 'слабый фон' }, { v: 4, t: 'заметный фон' }]
};

// Профиль мог поставить значение между кнопками — подсвечиваем ближайшую.
function ближайший(items, val){
  var best = items[0].v, d = Infinity;
  items.forEach(function(it){ var x = Math.abs(it.v - val); if (x < d){ d = x; best = it.v; } });
  return best;
}

function chipRow(boxId, key, get, set){
  var box = el(boxId); if (!box) return;
  var items = ВЫБОРЫ[key];
  var сейчас = ближайший(items, +get());
  box.innerHTML = '';
  items.forEach(function(it){
    var b = pdoc.createElement('div');
    b.className = 'pv-tab' + (it.v === сейчас ? ' on' : '');
    b.textContent = it.t;
    b.addEventListener('click', function(){
      set(it.v);
      chipRow(boxId, key, get, set);
    });
    box.appendChild(b);
  });
}

function tg(id, get, set){
  var n = el(id); if (!n) return;
  function paint(){ n.className = 'pv-tg' + (get() ? ' on' : ''); }
  n.addEventListener('click', function(){ if (set(!get()) !== false) paint(); paintStatus(); });
  n._paint = paint; paint();
}

function repaintToggles(){
  ['pv-tg-ai','pv-tg-loop','pv-tg-user','pv-tg-awake','pv-tg-bg','pv-tg-gate','pv-tg-auto',
   'pv-tg-reply','pv-tg-breathe','pv-tg-perchat','pv-tg-fetremind','pv-tg-fetdrive','pv-tg-flow',
   'pv-tg-orders','pv-tg-pace','pv-tg-patloop','pv-tg-toytell','pv-tg-hint','pv-tg-handzero']
    .forEach(function(id){ var n = el(id); if (n && n._paint) n._paint(); });
}

/* Настройки приехали со стороны (переменные Таво, память чата) — панель должна
   показать новое, а не то, что нарисовала секунду назад. */
function repaintAll(){
  if (!el('pv-win')) return;                   // панель ещё не построена — рисовать нечего
  var поля = [['pv-patsec', clamp(C.patSec, 30, 300)],
              ['pv-fet-own', C.fetOwn || '']];
  поля.forEach(function(p){
    var n = el(p[0]);
    if (n && pdoc.activeElement !== n) n.value = p[1];
  });
  repaintToggles();
  paintPicks(); paintProfiles(); paintBrains();
  paintFetish(); paintLanes(); paintPat(); paintStatus(); paintMeter();
}

// Все пять рядов кнопок разом: и при первой сборке, и когда профиль всё переставил.
function paintPicks(){
  chipRow('pv-gain',   'gain',   function(){ return C.gain; },
    function(v){ C.gain = v; saveCfg(); saveChatCfg(); });
  chipRow('pv-deny',   'deny',   function(){ return C.deny; },
    function(v){ C.deny = v; saveCfg(); saveChatCfg(); });
  chipRow('pv-chaos',  'chaos',  function(){ return C.chaos; },
    function(v){ C.chaos = v; saveCfg(); saveChatCfg(); });
  chipRow('pv-smooth', 'smooth', function(){ return C.smooth; },
    function(v){ C.smooth = v; saveCfg(); saveChatCfg(); });
  chipRow('pv-idle',   'idle',   function(){ return C.idleLevel; },
    function(v){ C.idleLevel = v; saveCfg(); saveChatCfg(); });
}

// Способ связи почти всегда один и тот же, поэтому он спрятан под раскрывашкой.
function paintTabs(){
  var box = el('pv-tabs'); if (!box) return;
  box.innerHTML = '';
  ['intiface','lovense','webhook','phone'].forEach(function(id){
    var b = pdoc.createElement('div');
    b.className = 'pv-tab' + (C.driver === id ? ' on' : '');
    b.textContent = DRV[id].label;
    b.addEventListener('click', function(){ setDriver(id); paintTabs(); paintStatus(); });
    box.appendChild(b);
  });
  paintFields();
}

function det(title, html){
  return '<details class="pv-more"><summary>' + title + '</summary><div class="pv-hint">' + html + '</div></details>';
}

function paintFields(){
  var f = el('pv-fields'); if (!f) return;
  var h = '';
  if (C.driver === 'intiface'){
    h = '<input class="pv-in" id="pv-f1" value="' + esc(C.wsUrl) + '" placeholder="ws://127.0.0.1:12345">' +
        det('когда это менять',
          'По умолчанию 127.0.0.1 — это Intiface на том же телефоне, менять ничего не нужно. ' +
          'Другой адрес нужен, только если Intiface крутится на компьютере: тогда ws://IP-компа:12345 ' +
          'и «Listen on all network interfaces» в самом Intiface.');
  } else if (C.driver === 'lovense'){
    h = '<div class="pv-row"><input class="pv-in" id="pv-f1" value="' + esc(C.lvIp) + '" placeholder="127.0.0.1">' +
        '<input class="pv-in" id="pv-f2" style="width:88px" value="' + esc(C.lvPort) + '" placeholder="20010"></div>' +
        det('где взять адрес', 'В приложении Lovense Remote: Game Mode → Local API. Порт 20010 — обычный, 30010 — защищённый.');
  } else if (C.driver === 'webhook'){
    h = '<input class="pv-in" id="pv-f1" value="' + esc(C.hookUrl) + '" placeholder="https://…/vibe?level={v}">' +
        '<div class="pv-row" style="margin-top:6px"><select class="pv-in" id="pv-f2" style="width:100px">' +
          '<option value="POST"' + (C.hookMethod === 'POST' ? ' selected' : '') + '>POST</option>' +
          '<option value="GET"' + (C.hookMethod === 'GET' ? ' selected' : '') + '>GET</option></select>' +
        '<span class="pv-hint">{v} {pct} {r} {p} {s} {t}</span></div>' +
        det('что уходит', 'POST шлёт JSON {v, pct, rotate, pump, suction, thrust}. Подходит для XToys, Home Assistant, своего моста или ESP32.');
  } else {
    h = '<div class="pv-hint">Вибрирует сам телефон. Железо не нужно — удобно проверить сцену без игрушки.</div>';
  }
  f.innerHTML = h;
  var f1 = el('pv-f1'), f2 = el('pv-f2');
  if (f1) f1.addEventListener('input', function(){
    if (C.driver === 'intiface') C.wsUrl = this.value;
    else if (C.driver === 'lovense') C.lvIp = this.value;
    else if (C.driver === 'webhook') C.hookUrl = this.value;
    saveCfg();
  });
  if (f2) f2.addEventListener('input', function(){
    if (C.driver === 'lovense') C.lvPort = this.value; else if (C.driver === 'webhook') C.hookMethod = this.value;
    saveCfg();
  });
  if (f2 && f2.tagName === 'SELECT') f2.addEventListener('change', function(){ C.hookMethod = this.value; saveCfg(); });
}

// Список игрушек — только когда их больше одной.
// Берём его из того, что прямо сейчас видит Intiface, а не из toyCaps():
// там выключенные уже отфильтрованы, и включить их обратно было бы нечем.
function paintDevs(){
  var box = el('pv-devs'); if (!box) return;
  var names = [];
  if (D && D.id === 'intiface'){
    var devs = DRV.intiface.devices;
    Object.keys(devs).forEach(function(k){ names.push(devs[k].name); });
  }
  if (names.length < 2){ box.innerHTML = ''; return; }
  if (!C.devOff) C.devOff = {};
  box.innerHTML = '<div class="pv-lbl" style="margin-top:10px">Кто участвует</div>' +
    '<div class="pv-hint" style="margin:-2px 0 6px">список живой — это то, что сейчас видит Intiface. ' +
    'Выключенную помню по имени, сама она обратно не включится.</div>';
  names.forEach(function(n){
    var row = pdoc.createElement('div');
    row.className = 'pv-sw';
    row.innerHTML = '<span>' + esc(n) + '</span>';
    var tgl = pdoc.createElement('div');
    tgl.className = 'pv-tg' + (C.devOff[n] ? '' : ' on');
    tgl.innerHTML = '<i></i>';
    tgl.addEventListener('click', function(){
      C.devOff[n] = !C.devOff[n];
      saveCfg();
      tgl.className = 'pv-tg' + (C.devOff[n] ? '' : ' on');
      E.lastOut = '';
      paintStatus();
      buildPrompt();
    });
    row.appendChild(tgl);
    box.appendChild(row);
  });
}

/* Что это за игрушка: угаданное по названию и выбор руками. Перерисовываем,
   только когда что-то поменялось, — иначе открытый список закрывался бы
   от каждого обновления статуса. */
var kindsSig = '';
function paintKinds(){
  var box = el('pv-kinds'); if (!box) return;
  var caps = (D && D.state === 'on') ? toyCaps() : null;
  var list = caps && caps.known && D.id !== 'phone' && D.id !== 'webhook' ? caps.kinds : [];
  var sig = JSON.stringify(list);
  if (sig === kindsSig) return;
  kindsSig = sig;
  if (!list.length){ box.innerHTML = ''; return; }
  if (!C.toyKind) C.toyKind = {};

  var h = '<div class="pv-lbl" style="margin-top:10px">Что это за игрушка</div>' +
    '<div class="pv-hint" style="margin:-2px 0 6px">Intiface знает только моторы, а форму — нет. ' +
    'Персонаж будет описывать игрушку такой, какая она здесь.</div>';
  list.forEach(function(p, i){
    var первая = !p.auto ? 'угадать по названию заново' : p.k ? 'угадала: ' + TOY_KINDS[p.k].ru : 'не узнала — выбери, какая';
    var opts = '<option value="">' + esc(первая) + '</option>';
    Object.keys(TOY_KINDS).forEach(function(k){
      opts += '<option value="' + esc(k) + '"' + (!p.auto && p.k === k ? ' selected' : '') + '>' +
              esc(TOY_KINDS[k].ru) + '</option>';
    });
    h += '<div class="pv-devsub" style="margin-top:6px">' + esc(p.name) + '</div>' +
      '<select class="pv-in" style="margin-top:4px" data-kind="' + i + '">' + opts + '</select>' +
      '<div class="pv-sw" style="margin-top:4px"><span>Работает воздухом (вакуум)</span>' +
        '<div class="pv-tg' + (p.air ? ' on' : '') + '" data-air="' + i + '"><i></i></div></div>' +
      '<div class="pv-hint">' + esc(passportText(p) || 'персонаж узнает только, что игрушка подключена') + '</div>';
  });
  box.innerHTML = h;

  // k === null — забыть ручной выбор и снова угадывать по названию
  var сохранить = function(p, k, air){
    if (k === null) delete C.toyKind[p.name];
    else C.toyKind[p.name] = { k: k, air: air };
    saveCfg(); toyToldAt = 0; kindsSig = '';
    buildPrompt(); paintStatus();             // статус под названием тоже говорит, что за игрушка
  };
  list.forEach(function(p, i){
    var s = box.querySelector('[data-kind="' + i + '"]');
    if (s) s.addEventListener('change', function(){
      // форму сменили — воздух оставляем таким, какой сейчас виден
      сохранить(p, this.value ? this.value : null, p.air);
    });
    var a = box.querySelector('[data-air="' + i + '"]');
    // воздух без формы тоже бывает — форму запоминаем такой, какую сейчас видно
    if (a) a.addEventListener('click', function(){ сохранить(p, p.k, !p.air); });
  });
}

var gateSkipped = false;

function paintStatus(){
  var dot = el('pv-dot'), name = el('pv-devname'), sub = el('pv-status'), g = el('pv-guard'), ico = el('pv-devico');
  var caps = (D && D.state === 'on') ? toyCaps() : null;

  // Подключились хотя бы раз — экран первого входа больше не показываем никогда.
  if (D && D.state === 'on' && !C.everConnected){ C.everConnected = true; saveCfg(); }
  paintGate();
  if (C.tab === 'home') paintWarn();        // плашка в меню должна поспевать за связью

  if (dot) dot.className = 'pv-dot ' + (D ? (D.state === 'on' ? 'on' : D.state === 'error' ? 'err' : D.state === 'connecting' ? 'wait' : '') : '');

  if (name) name.textContent = caps && caps.known ? caps.names.join(', ')
    : (D && D.state === 'connecting') ? 'подключаюсь…' : 'нет игрушки';

  if (sub){
    if (caps && caps.known){
      var вид = caps.kinds.filter(function(p){ return p.k || p.air; })
        .map(function(p){ return (p.k || 'игрушка') + (p.air ? ', воздух' : ''); });
      sub.textContent = (вид.length ? вид.join(' + ') + ' · ' : '') + caps.brief + battNote() + (fragileToy() ? ' · бережно' : '');
    }
    else sub.textContent = D ? (D.info || 'не подключено') : 'не подключено';
  }

  var воздух = caps && caps.kinds.some(function(p){ return p.air; });
  if (ico) ico.textContent = caps && caps.known ? (caps.has('s') || воздух ? '🌊' : caps.has('t') ? '🌀' : '≋') : '≋';

  if (g){
    var H = host();
    /* Строчка под названием объясняет тумблер словами: включён — игрушку ведёт
       персонаж по ходу сцены, выключен — она молчит и слушается только тебя.
       Рядом границы, чтобы было видно, во что упрётся. */
    var parts = [];
    if (!H.aiControl) parts.push('⚠ рубильник в настройках выключен');
    else if (!E.aiOn) parts.push('персонаж не ведёт — игрушка молчит');
    else parts.push('персонаж ведёт игрушку');
    parts.push('до ' + H.capLevel + '/20');
    if (H.maxMinutes > 0) parts.push(H.maxMinutes + ' мин');
    if (H.safeword) parts.push('«' + H.safeword + '»');
    g.textContent = parts.join(' · ');
  }

  paintDevs();
  paintKinds();
  paintStrips();
  repaintToggles();
}

/* ═══ картина сцены: последние две минуты одним взглядом ═══ */

var HIST = [], histAt = 0;

function pushHist(v){
  var t = now();
  if (t - histAt < 1000) return;                 // раз в секунду достаточно
  histAt = t;
  HIST.push(Math.round(v));
  if (HIST.length > 90) HIST.shift();            // полторы минуты истории
  if (C.tab === 'play') paintGraph();
}

function paintGraph(){
  var g = el('pv-graph'); if (!g) return;
  var eye = el('pv-blind');
  if (eye) eye.className = 'pv-eye' + (C.blind ? ' off' : '');

  // Слепой режим: ни цифр, ни графика — только ощущения.
  if (C.blind){
    g.className = 'pv-blindnote';
    g.innerHTML = 'вслепую — только по ощущениям';
    ['pv-t-time','pv-t-avg','pv-t-peak'].forEach(function(id){ var n = el(id); if (n) n.textContent = '·'; });
    var s0 = el('pv-sess'); if (s0) s0.textContent = '';
    return;
  }
  g.className = 'pv-graph';

  var cap = capLevel();
  var данные = HIST.slice(-90);
  while (данные.length < 90) данные.unshift(0);  // слева пусто, пока история копится
  g.innerHTML = данные.map(function(v){
    var h = v > 0 ? Math.max(8, Math.round(v / Math.max(1, cap) * 100)) : 4;
    return '<i class="' + (v > 0 ? '' : 'z') + '" style="height:' + h + '%"></i>';
  }).join('');

  var живые = данные.filter(function(v){ return v > 0; });
  var avg = живые.length ? Math.round(живые.reduce(function(a, b){ return a + b; }, 0) / живые.length) : 0;
  var peak = данные.reduce(function(a, b){ return b > a ? b : a; }, 0);
  var сек = E.sessionStart ? Math.round((now() - E.sessionStart) / 1000) : 0;

  var tt = el('pv-t-time'), ta = el('pv-t-avg'), tp = el('pv-t-peak'), ss = el('pv-sess');
  if (tt) tt.textContent = сек ? (сек < 60 ? сек + ' с' : Math.floor(сек / 60) + ':' + ('0' + (сек % 60)).slice(-2)) : '—';
  if (ta) ta.textContent = avg ? avg + '/20' : '—';
  if (tp) tp.textContent = peak ? peak + '/20' : '—';
  // Отказ на пике — это тишина нарочно. Без подписи она читается как поломка,
  // поэтому говорим прямо, что происходит.
  if (ss) ss.textContent = (E.denyUntil && now() < E.denyUntil) ? 'дразнит — тишина'
    : E.mine ? 'ведёшь ты'
    : !живые.length ? 'тихо'
    : E.waiting ? 'ждём ответ'
    : E.overlay ? 'отклик'
    : E.manual > 0 ? 'вручную'
    : E.prog.length ? 'идёт сцена' : 'тихо';
}

var lastPaint = 0;
function paintMeter(){
  var t = now(); if (t - lastPaint < 120) return; lastPaint = t;
  var n = el('pv-now');
  var v = Math.round(Math.max(E.live.v, E.live.r, E.live.p, E.live.s, E.live.t, E.live.d ? E.live.w || 0 : 0));
  // Вслепую цифра ничего не показывает (волны тоже), иначе смысла в режиме нет.
  if (n) n.textContent = C.blind ? '·' : v;
  var dk = el('pv-dock');
  if (dk){ var live = v > 0; if (live !== (dk.className === 'pv-live')) dk.className = live ? 'pv-live' : ''; }
}

function paintLog(){
  var b = el('pv-log'); if (!b) return;
  b.innerHTML = LOG.slice(0, 16).map(function(r){
    var d = new Date(r.t), hh = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    if (r.kind === 'игра') return '<div class="pv-logplay"><b>' + hh + '</b> ▶ игра' + (r.n > 1 ? ' ×' + r.n : '') + '</div>';
    var беда = r.kind === 'err' || r.kind === 'stop' || r.kind === 'safe';
    return '<div' + (беда ? ' class="pv-logerr"' : '') + '><b>' + hh + '</b> ' + esc(r.text) + '</div>';
  }).join('') || '<div style="opacity:.6">пока пусто</div>';
}

// Дорожка игры: что именно играло, по порядку, свежее сверху.
function paintPlay(){
  var b = el('pv-play'); if (!b) return;
  b.innerHTML = PLAY.slice(0, 20).map(function(r){
    var d = new Date(r.t), hh = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    return '<div><b>' + hh + '</b> ' + esc(r.text) + '</div>';
  }).join('') || '<div style="opacity:.6">пока ничего не играло</div>';
}

function openWin(){
  css(); buildWin();
  var w = el('pv-win');
  if (w){
    w.classList.add('on');
    showTab(C.tab || 'home');
    paintTabs(); paintBrains(); paintProfiles(); paintFetish(); paintLanes(); paintPat(); paintGraph();
    paintStatus(); paintMeter(); paintLog(); paintGate();
    paintStrips(true);
  }
}

function closeWin(){ var w = el('pv-win'); if (w) w.classList.remove('on'); }
try { pdoc.addEventListener('visibilitychange', function(){ if (!pdoc.hidden) startWaves(); }); } catch(e){}
PV.open = openWin;
PV.readNow = function(){ clearTimeout(msgTimer); return readLast(); };
// Для SillyTavern: рубильник и кнопка ≋ настраиваются снаружи панели.
PV.repaint = function(){ try { buildPrompt(); paintStatus(); } catch(e){} };
PV.resetDock = function(){ try { resetDock(); } catch(e){} };

/* ═══════════════ проводка ═══════════════ */

function rewire(){
  css(); buildDock();
  if (!PV._wired){
    PV._wired = true;
    pwin.addEventListener('pusya-open-vibe', function(){ openWin(); });
    pwin.addEventListener('pv-msg', function(){ onMsgEvent(); });
    pwin.addEventListener('pv-panic', function(){ allStop('чат закрыт'); });
    pwin.addEventListener('pv-chat-opened', function(){
      lastMsgKey = ''; lastCmdCount = 0; brainKey = ''; lastMeKey = ''; lastMsgLen = 0; fbKey = ''; flowKey = ''; flowPos = 0;
      allStop('новый чат');
      F = { cards: [], intensity: 0, moodlet: '', boost: '', at: 0, key: '' };
      pickChat();                              // он же разберёт карточку, когда узнает чат
      pickNames();
      autoConnectAgain();
    });
    if (pwin !== window){
      window.addEventListener('pusya-open-vibe', function(){ openWin(); });
      window.addEventListener('pv-msg', function(){ onMsgEvent(); });
      window.addEventListener('pv-panic', function(){ allStop('чат закрыт'); });
    }
    // страховка: свернули приложение или ушла страница — глушим железо
    try {
      pdoc.addEventListener('visibilitychange', function(){ if (pdoc.hidden) onHide(); else onWake(); });
      pwin.addEventListener('pagehide', function(){ try { if (D) D.stop(); } catch(e){} });
    } catch(e){}
  }
  setDriver(C.driver || 'intiface');
  loadCfgFromTavo();                     // правда из переменных Таво приедет следом
  pickChat();                            // он же разберёт карточку, когда узнает чат
  pickNames();
  setTimeout(autoConnect, 900);          // мост мог уже ждать — цепляемся без кнопки
  buildPrompt();
}
PV.rewire = rewire;

rewire();

} catch(e){ try { console.error('[PUSYA VIBE]', e); } catch(_){} }
})();

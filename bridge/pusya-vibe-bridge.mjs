// PUSYA VIBE — мост между SillyTavern и игрушкой.
// Куда класть: SillyTavern/plugins/pusya-vibe-bridge.mjs
// В config.yaml включить: enableServerPlugins: true — и перезапустить Таверну.
//
// Зачем он нужен. Браузерная вкладка не умеет Bluetooth и засыпает, когда её сворачивают.
// Мост живёт в самом сервере Таверны: расширение отдаёт ему ПРОГРАММУ ощущений целиком,
// а дальше он крутит её сам — хоть вкладку сверни, хоть на другую страницу уйди.
//
// Наружу отдаёт /api/plugins/pusyavibe/* — см. список маршрутов внизу файла.
// Зависимостей нет: клиент WebSocket написан вручную, чтобы ничего не доустанавливать.

import net from 'net';
import tls from 'tls';
import http from 'http';
import https from 'https';
import crypto from 'crypto';
import { EventEmitter } from 'events';

export const info = {
    id: 'pusyavibe',
    name: 'PUSYA VIBE Bridge',
    description: 'Мост к Intiface/Buttplug и Lovense: держит связь с игрушкой и сам проигрывает программу.',
};

/* ═══════════════ минимальный клиент WebSocket (RFC 6455) ═══════════════ */

class MiniWS extends EventEmitter {
    constructor(url) {
        super();
        this.url = url;
        this.sock = null;
        this.open = false;
        this.buf = Buffer.alloc(0);
        this.handshakeDone = false;
    }

    connect(timeoutMs = 6000) {
        return new Promise((resolve) => {
            let u;
            try { u = new URL(this.url); } catch { return resolve(new Error('кривой адрес')); }
            const secure = u.protocol === 'wss:';
            const port = u.port || (secure ? 443 : 80);
            const key = crypto.randomBytes(16).toString('base64');
            const accept = crypto.createHash('sha1')
                .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');

            let settled = false;
            const done = (err) => { if (!settled) { settled = true; resolve(err || null); } };
            const timer = setTimeout(() => { this.close(); done(new Error('мост не дождался ответа')); }, timeoutMs);

            const onReady = () => {
                this.sock.write(
                    `GET ${u.pathname || '/'}${u.search || ''} HTTP/1.1\r\n` +
                    `Host: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
                    `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
            };

            const opts = { host: u.hostname, port: Number(port) };
            this.sock = secure
                ? tls.connect({ ...opts, rejectUnauthorized: false }, onReady)
                : net.connect(opts, onReady);

            this.sock.on('data', (chunk) => {
                this.buf = Buffer.concat([this.buf, chunk]);
                if (!this.handshakeDone) {
                    const end = this.buf.indexOf('\r\n\r\n');
                    if (end < 0) return;
                    const head = this.buf.slice(0, end).toString('utf8');
                    this.buf = this.buf.slice(end + 4);
                    if (!/^HTTP\/1\.1 101/i.test(head) || !head.toLowerCase().includes(accept.toLowerCase())) {
                        this.close();
                        clearTimeout(timer);
                        return done(new Error('это не WebSocket-сервер'));
                    }
                    this.handshakeDone = true;
                    this.open = true;
                    clearTimeout(timer);
                    done(null);
                    this.emit('open');
                }
                this.drain();
            });

            this.sock.on('error', (e) => { clearTimeout(timer); this.shut(); done(e); });
            this.sock.on('close', () => { clearTimeout(timer); this.shut(); done(new Error('связь закрылась')); });
        });
    }

    // Разбор входящих кадров: сервер шлёт без маски.
    drain() {
        for (;;) {
            if (this.buf.length < 2) return;
            const b0 = this.buf[0], b1 = this.buf[1];
            const opcode = b0 & 0x0f;
            const masked = (b1 & 0x80) !== 0;
            let len = b1 & 0x7f, off = 2;
            if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
            else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
            let mask = null;
            if (masked) { if (this.buf.length < off + 4) return; mask = this.buf.slice(off, off + 4); off += 4; }
            if (this.buf.length < off + len) return;

            let payload = this.buf.slice(off, off + len);
            this.buf = this.buf.slice(off + len);
            if (mask) { payload = Buffer.from(payload); for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4]; }

            if (opcode === 0x1) this.emit('message', payload.toString('utf8'));
            else if (opcode === 0x9) this.frame(0xA, payload);          // ping → pong
            else if (opcode === 0x8) { this.close(); return; }
        }
    }

    frame(opcode, payload) {
        if (!this.sock || this.sock.destroyed) return;
        const len = payload.length;
        const head = len < 126 ? Buffer.from([0x80 | opcode, 0x80 | len])
            : len < 65536 ? Buffer.concat([Buffer.from([0x80 | opcode, 0x80 | 126]), (() => { const b = Buffer.alloc(2); b.writeUInt16BE(len); return b; })()])
                : Buffer.concat([Buffer.from([0x80 | opcode, 0x80 | 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(len)); return b; })()]);
        const mask = crypto.randomBytes(4);
        const body = Buffer.from(payload);
        for (let i = 0; i < body.length; i++) body[i] ^= mask[i % 4];
        try { this.sock.write(Buffer.concat([head, mask, body])); } catch { /* оборвалось — увидим в close */ }
    }

    send(text) { this.frame(0x1, Buffer.from(String(text), 'utf8')); }

    shut() {
        if (this.open) { this.open = false; this.emit('close'); }
        this.open = false;
    }

    close() {
        try { if (this.sock) { this.sock.destroy(); } } catch { /* уже закрыт */ }
        this.shut();
    }
}

/* ═══════════════ клиент Buttplug ═══════════════ */

const BP = {
    ws: null, msgId: 1, devices: {}, server: '', state: 'off', info: '',
    pingTimer: null, battTimer: null, keepTimer: null, linPhase: 0,

    async connect(url) {
        this.disconnect();
        const ws = new MiniWS(url);
        const err = await ws.connect();
        if (err) { this.state = 'error'; this.info = err.message; return false; }
        this.ws = ws;

        ws.on('message', (txt) => this.onMessage(txt));
        ws.on('close', () => {
            clearInterval(this.pingTimer); this.pingTimer = null;
            clearInterval(this.battTimer); this.battTimer = null;
            clearInterval(this.keepTimer); this.keepTimer = null;
            this.devices = {}; this.state = 'off'; this.info = 'связь закрылась';
            ENGINE.stop('связь с Intiface потеряна');
        });

        this.tx({ RequestServerInfo: { Id: this.msgId++, ClientName: 'PUSYA VIBE', MessageVersion: 3 } });

        // Ждём ServerInfo: без него мы не знаем, что на том конце действительно Buttplug.
        const ok = await new Promise((resolve) => {
            const t = setTimeout(() => resolve(false), 4000);
            this.onReady = () => { clearTimeout(t); resolve(true); };
        });
        this.onReady = null;
        if (!ok) { this.disconnect(); this.state = 'error'; this.info = 'сервер не представился'; return false; }

        // Даём списку устройств доехать, иначе расширение покажет «подключено» без игрушки.
        await new Promise((resolve) => {
            const t = setTimeout(resolve, 1200);
            this.onDevices = () => { clearTimeout(t); resolve(); };
        });
        this.onDevices = null;
        return true;
    },

    onMessage(txt) {
        let arr; try { arr = JSON.parse(txt); } catch { return; }
        for (const m of (arr || [])) {
            const name = Object.keys(m)[0], b = m[name];
            if (name === 'ServerInfo') {
                this.state = 'on'; this.server = b.ServerName || 'Intiface'; this.info = this.server;
                this.tx({ RequestDeviceList: { Id: this.msgId++ } });
                this.tx({ StartScanning: { Id: this.msgId++ } });
                if (b.MaxPingTime > 0) {
                    clearInterval(this.pingTimer);
                    this.pingTimer = setInterval(() => this.tx({ Ping: { Id: this.msgId++ } }), Math.max(500, b.MaxPingTime / 2));
                }
                clearInterval(this.battTimer);
                this.battTimer = setInterval(() => this.askBattery(), 120000);
                // Молчащий сокет закрывают и система, и роутеры, а каждый обрыв заставляет
                // Intiface остановить все устройства. Держим канал тёплым запросом списка:
                // до игрушки он не доходит, Bluetooth не трогает.
                clearInterval(this.keepTimer);
                this.keepTimer = setInterval(() => {
                    if (this.state === 'on') this.tx({ RequestDeviceList: { Id: this.msgId++ } });
                }, 25000);
                ENGINE.lastOut = '';        // после переподключения отдаём текущий уровень заново
                // Но не рывком: вход всегда мягкий, за пару секунд с нуля.
                ENGINE.soft = { v: 0, r: 0, p: 0, s: 0, t: 0 };
                ENGINE.softStart = Date.now() + 2000;
                if (this.onReady) this.onReady();
            } else if (name === 'DeviceList') {
                // Список приходит и как ответ на «грелку» — старые записи не теряем.
                const было = this.devices;
                this.devices = {};
                for (const d of (b.Devices || [])) this.addDev(d, было[d.DeviceIndex]);
                if (this.onDevices) this.onDevices();
            } else if (name === 'DeviceAdded') {
                this.addDev(b);
                if (this.onDevices) this.onDevices();
            } else if (name === 'SensorReading') {
                const dv = this.devices[b.DeviceIndex];
                if (dv && b.Data && b.Data.length) {
                    dv.batt = Math.round(b.Data[0]);
                    if (dv.batt <= 15 && !dv.warned) {
                        dv.warned = true;
                        console.log(`[PUSYA VIBE] ${dv.name}: заряд ${dv.batt}% — скоро сядет`);
                    }
                }
            } else if (name === 'DeviceRemoved') {
                delete this.devices[b.DeviceIndex];
            }
        }
    },

    addDev(d, прежняя) {
        const msgs = d.DeviceMessages || {};
        this.devices[d.DeviceIndex] = {
            idx: d.DeviceIndex,
            name: d.DeviceName || `устройство ${d.DeviceIndex}`,
            // FeatureDescriptor важен: по нему видно воздушную волну, клитор-насадку и прочее
            scalars: (msgs.ScalarCmd || []).map((f, i) => ({ i, type: String(f.ActuatorType || 'Vibrate'), what: String(f.FeatureDescriptor || '') })),
            linear: (msgs.LinearCmd || []).length,
            rotate: (msgs.RotateCmd || []).length,
            // Заряд: севшая батарея подключается прекрасно, а мотор уже не тянет.
            battIdx: (msgs.SensorReadCmd || []).findIndex((f) => /batter/i.test(String(f.SensorType || ''))),
            batt: прежняя ? прежняя.batt : null,
            warned: !!(прежняя && прежняя.warned),
            // Satisfyer — известная болячка Buttplug: рвёт связь под плотным потоком команд.
            fragile: /satisfyer|sf\s/i.test(String(d.DeviceName || '')),
        };
        if (!прежняя) this.askBattery();
    },

    askBattery() {
        for (const d of Object.values(this.devices)) {
            if (d.battIdx >= 0) this.tx({ SensorReadCmd: { Id: this.msgId++, DeviceIndex: d.idx, SensorIndex: d.battIdx, SensorType: 'Battery' } });
        }
    },

    tx(obj) { if (this.ws && this.ws.open) this.ws.send(JSON.stringify([obj])); },

    send(out, only, off) {
        const pct = (l) => Math.max(0, Math.min(20, l)) / 20;
        for (const d of Object.values(this.devices)) {
            // выключенную в панели не трогаем; адресная команда молчит на остальных
            const skip = (off || []).includes(d.name)
                || (only && !d.name.toLowerCase().includes(String(only).toLowerCase()));
            if (skip) { this.tx({ StopDeviceCmd: { Id: this.msgId++, DeviceIndex: d.idx } }); continue; }
            const scal = d.scalars.map((f) => {
                let lvl = out.v;
                if (/rotat/i.test(f.type)) lvl = out.r || out.v;
                else if (/constrict|suction/i.test(f.type)) lvl = out.s || out.v;
                else if (/inflat/i.test(f.type)) lvl = out.p || 0;
                else if (/oscillat/i.test(f.type)) lvl = out.t || out.v;
                return { Index: f.i, Scalar: pct(lvl), ActuatorType: f.type };
            });
            if (scal.length) this.tx({ ScalarCmd: { Id: this.msgId++, DeviceIndex: d.idx, Scalars: scal } });
            if (d.rotate) this.tx({ RotateCmd: { Id: this.msgId++, DeviceIndex: d.idx, Rotations: [{ Index: 0, Speed: pct(out.r || out.v), Clockwise: true }] } });
            if (d.linear) {
                const lvl = out.t || out.v;
                if (lvl > 0) {
                    this.linPhase = this.linPhase ? 0 : 1;
                    this.tx({ LinearCmd: { Id: this.msgId++, DeviceIndex: d.idx, Vectors: [{ Index: 0, Duration: Math.round(900 - 700 * pct(lvl)), Position: this.linPhase ? 0.85 : 0.1 }] } });
                }
            }
        }
    },

    stopAll() {
        for (const d of Object.values(this.devices)) this.tx({ StopDeviceCmd: { Id: this.msgId++, DeviceIndex: d.idx } });
    },

    disconnect() {
        clearInterval(this.pingTimer); this.pingTimer = null;
        clearInterval(this.battTimer); this.battTimer = null;
        clearInterval(this.keepTimer); this.keepTimer = null;
        try { this.stopAll(); } catch { /* связи уже нет */ }
        try { if (this.ws) this.ws.close(); } catch { /* уже закрыт */ }
        this.ws = null; this.devices = {}; this.state = 'off'; this.info = '';
    },

    deviceNames() { return Object.values(this.devices).map((d) => d.name); },

    // Подробности для расширения: пусть модель знает, ЧТО именно подключено.
    toys() {
        return Object.values(this.devices).map((d) => ({
            name: d.name,
            features: d.scalars.map((f) => ({ type: f.type, what: f.what })),
            linear: d.linear,
            rotate: d.rotate,
            batt: d.batt,
        }));
    },
};

/* ═══════════════ движок: то же, что в панели, но на сервере ═══════════════ */

const ENGINE = {
    prog: [], i: 0, stepEnd: 0, loop: true,
    live: { v: 0, r: 0, p: 0, s: 0, t: 0 },
    soft: { v: 0, r: 0, p: 0, s: 0, t: 0 },     // сглаженный выход
    manual: 0, cap: 20, gain: 1,
    smooth: 35, breathe: true, idleLevel: 0, gentle: false,
    deny: 15, chaos: 15,                        // отказ на пике и своеволие
    flow: { level: 0, until: 0, at: 0 },        // живой отклик на печатающийся текст
    jitter: 1, pauseUntil: 0, denyUntil: 0, denyLevel: 1, spice: true,
    waiting: 0, waitMaxSec: 180,                // модель думает — держим сцену
    overlay: false, saved: null,                // короткий отклик поверх сцены
    off: [],                                    // игрушки, отключённые в панели
    startedAt: 0, lastActive: 0, maxSec: 1800,
    touched: Date.now(), idleStopSec: 900,      // Таверна замолчала — глушим железо
    lastOut: '', lastSendAt: 0, timer: null,
    note: '',

    tick() {
        const t = Date.now();

        if (t - this.touched > this.idleStopSec * 1000 && (this.prog.length || this.manual)) {
            return this.stop('от Таверны давно нет вестей');
        }
        if (this.startedAt && this.maxSec > 0 && t - this.startedAt > this.maxSec * 1000) {
            return this.stop('автостоп по времени');
        }

        if (!this.manual && this.prog.length && t >= this.stepEnd) {
            this.i++;
            if (this.i >= this.prog.length) {
                if (this.overlay) this.restore();          // отклик доиграл — вернём сцену
                else if (this.loop) this.i = 0;
                else { this.prog = []; this.i = 0; this.stepEnd = 0; }
            }
            const st = this.prog[this.i];
            if (!this.overlay || st) this.stepEnd = st ? t + st.ms : 0;
            this.stepStart(st);
        }

        const out = { v: 0, r: 0, p: 0, s: 0, t: 0 };
        // Живой отклик: расширение шлёт уровень по ходу печати, мы держим его с затуханием.
        if (this.manual <= 0 && !this.overlay && this.flow.until > t) {
            const k = 1 - 0.55 * Math.max(0, Math.min(1, (t - this.flow.at) / 9000));
            out.v = this.flow.level * k;
        } else if (this.manual > 0) {
            out.v = this.manual;
        } else {
            const st = this.prog[this.i];
            if (st) {
                const span = Math.max(1, st.ms), left = Math.max(0, this.stepEnd - t);
                const k = 1 - left / span;
                for (const c of ['v', 'r', 'p', 's', 't']) {
                    const a = st[c] || 0;
                    const b = (st.to && st.to[c] != null) ? st.to[c] : a;
                    out[c] = (a + (b - a) * k) * this.gain;
                }
            }
        }
        // Отказ и непредсказуемость — только для сцены, не для заданного вручную ритма.
        if (this.manual <= 0 && this.spice) {
            if ((this.denyUntil && t < this.denyUntil) || (this.pauseUntil && t < this.pauseUntil)) {
                for (const c of ['v', 'r', 'p', 's', 't']) out[c] = 0;
            } else {
                const k = (this.jitter || 1) * (this.denyLevel || 1);
                if (k !== 1) for (const c of ['v', 'r', 'p', 's', 't']) out[c] *= k;
            }
        }

        // Модель думает: сцена не обрывается, тихо «дышит», а на слишком долгом молчании гаснет.
        if (this.waiting) {
            const waited = t - this.waiting;
            if (waited > this.waitMaxSec * 1000) { this.waiting = 0; return this.stop('ответа нет слишком долго'); }
            if (this.breathe) {
                const k = 0.88 + 0.12 * (0.5 + 0.5 * Math.sin(waited / 4200));
                for (const c of ['v', 'r', 'p', 's', 't']) out[c] *= k;
            }
            if (this.idleLevel > 0 && !this.manual && Object.values(out).reduce((a, b) => a + b, 0) < 0.5) {
                out.v = this.idleLevel;
            }
        }

        // Мягкий вход после подключения: за две секунды с нуля, чтобы не било сразу.
        if (this.softStart && t < this.softStart) {
            const вход = Math.max(0, 1 - (this.softStart - t) / 2000);
            for (const c of ['v', 'r', 'p', 's', 't']) out[c] *= вход;
        }

        for (const c of ['v', 'r', 'p', 's', 't']) out[c] = Math.max(0, Math.min(this.cap, out[c]));

        // Плавность: к цели идём шагами, чтобы не било рывком.
        if (this.smooth > 0) {
            const rate = this.cap / (1 + this.smooth / 12);
            for (const c of ['v', 'r', 'p', 's', 't']) {
                const d = out[c] - this.soft[c];
                this.soft[c] += Math.max(-rate, Math.min(rate, d));
                out[c] = this.soft[c];
            }
        } else {
            for (const c of ['v', 'r', 'p', 's', 't']) this.soft[c] = out[c];
        }

        for (const c of ['v', 'r', 'p', 's', 't']) out[c] = Math.round(Math.max(0, Math.min(this.cap, out[c])));

        // Капризным игрушкам огрубляем шкалу вдвое: на слух то же, команд в разы меньше.
        const хрупкая = Object.values(BP.devices).some((d) => d.fragile);
        if (хрупкая || this.gentle) {
            for (const c of ['v', 'r', 'p', 's', 't']) if (out[c] > 0) out[c] = Math.max(1, Math.round(out[c] / 2) * 2);
        }
        this.live = out;

        const only = (!this.manual && this.prog[this.i]) ? this.prog[this.i].only : null;
        const sig = Object.values(out).join('|') + '|' + (only || '');
        const any = Object.values(out).some((x) => x > 0);
        // Не частим по Bluetooth: часть игрушек роняет соединение от плотного потока команд.
        // Buttplug сам шлёт игрушке keepalive, поэтому частых повторов «на всякий случай» не нужно.
        const gapOk = (t - this.lastSendAt) >= (this.gentle || хрупкая ? 1000 : 380);
        // Но и молчать нельзя: игрушка, которой давно ничего не приходило, уходит в сон
        // и роняет связь — Satisfyer делает это за пару минут простоя. Раз в десять секунд
        // подтверждаем текущий уровень, даже нулевой: шесть команд в минуту, не поток.
        const тепло = (t - this.lastSendAt) > 10000;
        if (BP.state === 'on' && (sig !== this.lastOut || тепло) && (gapOk || !any)) {
            this.lastOut = sig; this.lastSendAt = t;
            // На «грелке» шлём обычную команду с нулями: Stop у части прошивок читается
            // как «разговор окончен», и следом игрушка засыпает.
            if (any || тепло) BP.send(out, only, this.off); else BP.stopAll();
        }
        if (any) { this.lastActive = t; if (!this.startedAt) this.startedAt = t; }
        else if (this.startedAt && t - this.lastActive > 20000) this.startedAt = 0;
    },

    run() { if (!this.timer) this.timer = setInterval(() => this.tick(), 250); },

    opts(o = {}) {
        if (o.loop != null) this.loop = !!o.loop;
        if (o.cap != null) this.cap = Math.max(0, Math.min(20, +o.cap || 20));
        if (o.gain != null) this.gain = Math.max(0.4, Math.min(2.5, +o.gain || 1));
        if (o.maxSec != null) this.maxSec = Math.max(0, +o.maxSec || 0);
        if (o.smooth != null) this.smooth = Math.max(0, Math.min(100, +o.smooth || 0));
        if (o.breathe != null) this.breathe = !!o.breathe;
        if (o.idleLevel != null) this.idleLevel = Math.max(0, Math.min(20, +o.idleLevel || 0));
        if (o.waitMaxSec != null) this.waitMaxSec = Math.max(30, +o.waitMaxSec || 180);
        if (o.gentle != null) this.gentle = !!o.gentle;
        if (o.deny != null) this.deny = Math.max(0, Math.min(100, +o.deny || 0));
        if (o.chaos != null) this.chaos = Math.max(0, Math.min(100, +o.chaos || 0));
        if (Array.isArray(o.off)) this.off = o.off;
    },

    // На границе шага решаем: отказать на пике и насколько своевольничать.
    stepStart(st) {
        this.jitter = 1; this.pauseUntil = 0; this.denyLevel = 1;
        if (!this.spice || !st) return;
        const chaos = this.chaos / 100, deny = this.deny / 100;
        if (chaos) {
            this.jitter = 1 + (Math.random() * 2 - 1) * 0.3 * chaos;
            if (Math.random() < 0.12 * chaos) this.pauseUntil = Date.now() + 700 + Math.random() * 900;
        }
        if (deny) {
            const пик = Math.max(st.v || 0, st.r || 0, st.s || 0, st.t || 0, st.p || 0,
                st.to ? Math.max(st.to.v || 0, st.to.s || 0, st.to.t || 0, st.to.r || 0) : 0);
            if (пик >= this.cap * 0.7 && Math.random() < deny) {
                const тишина = 3500 + Math.random() * 3000;
                this.denyUntil = Date.now() + тишина;
                this.denyLevel = 0.35;
                console.log(`[PUSYA VIBE] отказ на пике — тишина ${Math.round(тишина / 1000)} сек`);
            }
        }
    },

    play(steps, o = {}) {
        this.opts(o);
        this.flow = { level: 0, until: 0, at: 0 };    // явная программа главнее потока
        this.spice = !o.exact;
        this.denyUntil = 0;
        this.overlay = false; this.saved = null;      // новая сцена главнее отклика
        this.prog = Array.isArray(steps) ? steps : [];
        this.i = 0;
        this.stepEnd = Date.now() + (this.prog[0] ? this.prog[0].ms : 0);
        this.manual = 0;
        this.touched = Date.now();
        this.note = '';
        this.stepStart(this.prog[0]);
        this.run();
    },

    // Короткая вставка поверх сцены: доиграет — вернёмся туда, где прервались.
    pushOverlay(steps, o = {}) {
        this.opts(o);
        if (!Array.isArray(steps) || !steps.length) return;
        if (!this.overlay) {
            this.saved = this.prog.length
                ? { prog: this.prog, i: this.i, left: Math.max(0, this.stepEnd - Date.now()) }
                : null;
        }
        this.overlay = true;
        this.prog = steps; this.i = 0;
        this.stepEnd = Date.now() + steps[0].ms;
        this.manual = 0;
        this.touched = Date.now();
        this.run();
    },

    restore() {
        this.overlay = false;
        const s = this.saved; this.saved = null;
        if (s && s.prog && s.prog.length) {
            this.prog = s.prog; this.i = s.i;
            this.stepEnd = Date.now() + Math.max(200, s.left || 0);
        } else {
            this.prog = []; this.i = 0; this.stepEnd = 0;
        }
    },

    hold(v) {
        this.manual = Math.max(0, Math.min(20, +v || 0));
        this.prog = []; this.i = 0; this.stepEnd = 0;
        this.touched = Date.now();
        this.run();
    },

    stop(note = '') {
        this.prog = []; this.i = 0; this.stepEnd = 0; this.manual = 0;
        this.live = { v: 0, r: 0, p: 0, s: 0, t: 0 };
        this.soft = { v: 0, r: 0, p: 0, s: 0, t: 0 };   // стоп мгновенный, плавность не применяем
        this.overlay = false; this.saved = null; this.waiting = 0;
        this.flow = { level: 0, until: 0, at: 0 };
        this.denyUntil = 0; this.pauseUntil = 0; this.jitter = 1; this.denyLevel = 1;
        this.lastOut = ''; this.startedAt = 0;
        this.note = note;
        if (BP.state === 'on') BP.stopAll();
        if (note) console.log('[PUSYA VIBE] стоп:', note);
    },
};

/* ═══════════════ Lovense: прокси, как у маринары ═══════════════ */

function lovensePost(url, body) {
    return new Promise((resolve) => {
        let u;
        try { u = new URL(url); } catch { return resolve({ error: 'кривой адрес' }); }
        const isHttps = u.protocol === 'https:';
        const data = JSON.stringify(body);
        const req = (isHttps ? https : http).request({
            hostname: u.hostname,
            port: u.port || (isHttps ? 443 : 80),
            path: u.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'X-platform': 'SillyTavern' },
            timeout: 8000,
            ...(isHttps ? { rejectUnauthorized: false } : {}),
        }, (res) => {
            let out = '';
            res.on('data', (c) => { out += c; });
            res.on('end', () => { try { resolve(JSON.parse(out)); } catch { resolve({ error: 'непонятный ответ игрушки' }); } });
        });
        req.on('timeout', () => { req.destroy(); resolve({ error: 'игрушка не ответила за 8 секунд' }); });
        req.on('error', (e) => resolve({ error: e.message }));
        req.write(data);
        req.end();
    });
}

/* ═══════════════ маршруты ═══════════════ */

// Всё, что приходит снаружи, приводим к безопасному виду: чужие поля и великаны не нужны.
function cleanStep(s) {
    return {
        v: +s.v || 0, r: +s.r || 0, p: +s.p || 0, s: +s.s || 0, t: +s.t || 0,
        ms: Math.max(100, Math.min(120000, +s.ms || 1000)),
        to: s.to || null,
        only: s.only ? String(s.only).slice(0, 60) : null,
    };
}

export async function init(router) {
    console.log('[PUSYA VIBE] мост загружается…');

    router.post('/connect', async (req, res) => {
        const url = String(req.body?.url || 'ws://127.0.0.1:12345');
        const ok = await BP.connect(url);
        ENGINE.touched = Date.now();
        if (ok) ENGINE.run();
        res.json({ ok, server: BP.server, info: BP.info, devices: BP.deviceNames(), toys: BP.toys() });
    });

    router.post('/disconnect', (req, res) => {
        ENGINE.stop('расширение отключилось');
        BP.disconnect();
        res.json({ ok: true });
    });

    router.get('/status', (req, res) => {
        ENGINE.touched = Date.now();
        res.json({
            connected: BP.state === 'on',
            state: BP.state,
            server: BP.server,
            info: BP.info,
            devices: BP.deviceNames(),
            toys: BP.toys(),
            live: ENGINE.live,
            playing: ENGINE.prog.length > 0 || ENGINE.manual > 0,
            steps: ENGINE.prog.length,
            waiting: !!ENGINE.waiting,
            overlay: ENGINE.overlay,
            note: ENGINE.note,
        });
    });

    // Главное: расширение отдаёт программу целиком, дальше её крутит мост.
    router.post('/program', (req, res) => {
        const steps = (req.body?.steps || []).slice(0, 400).map(cleanStep);
        ENGINE.play(steps, req.body || {});
        res.json({ ok: true, steps: steps.length });
    });

    // Короткий отклик поверх сцены (например, на сообщение пользователя).
    router.post('/overlay', (req, res) => {
        const steps = (req.body?.steps || []).slice(0, 40).map(cleanStep);
        ENGINE.pushOverlay(steps, req.body || {});
        res.json({ ok: true, steps: steps.length });
    });

    // Живой отклик: уровень, который держится с затуханием, пока идёт печать ответа.
    router.post('/flow', (req, res) => {
        ENGINE.opts(req.body || {});
        const lvl = Math.max(0, Math.min(20, +req.body?.level || 0));
        // Слово в тексте держится 9 секунд, рука персонажа на регуляторе — дольше.
        const hold = Math.max(1000, Math.min(20000, +req.body?.hold || 9000));
        ENGINE.flow = { level: lvl, until: Date.now() + hold, at: Date.now() };
        ENGINE.waiting = 0;
        ENGINE.touched = Date.now();
        ENGINE.run();
        res.json({ ok: true, level: lvl });
    });

    // Модель думает: сцену держим, но не бесконечно.
    router.post('/waiting', (req, res) => {
        ENGINE.opts(req.body || {});
        ENGINE.waiting = req.body?.on ? Date.now() : 0;
        ENGINE.touched = Date.now();
        res.json({ ok: true, waiting: !!ENGINE.waiting });
    });

    router.post('/level', (req, res) => {
        if (req.body?.cap != null) ENGINE.cap = Math.max(0, Math.min(20, +req.body.cap));
        ENGINE.hold(req.body?.v);
        res.json({ ok: true, v: ENGINE.manual });
    });

    router.post('/stop', (req, res) => {
        ENGINE.stop(req.body?.why || '');
        res.json({ ok: true });
    });

    router.post('/lovense', async (req, res) => {
        const { url, ...cmd } = req.body || {};
        if (!url) return res.status(400).json({ error: 'нужен адрес' });
        res.json(await lovensePost(url, cmd));
    });

    console.log('[PUSYA VIBE] мост готов: /api/plugins/pusyavibe/*');
}

export default { info, init };

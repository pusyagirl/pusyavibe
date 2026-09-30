# 📳 PUSYA VIBE for SillyTavern

**[По-русски ↓](#russian)**

Your character drives a real toy straight from the roleplay. No brand lock-in:
it works through [Intiface Central](https://intiface.com/central/), which covers
~100 brands including Satisfyer, We-Vibe, Lovense and Kiiroo.

The panel is in **English and Russian**. By default it follows SillyTavern's
own language; to pick one by hand: ⚙ Settings → Screen and window →
“panel language” (auto / Русский / English). The plugin reads English and
Russian scenes alike, and hints to the model follow the language of the chat.

The **≋** button opens the panel over the chat: the waves and STOP at the top,
a dock with four sections at the bottom, a step-by-step setup and a button tour.
On a computer you can drag the window by its header and resize it by the
bottom-right corner; double-click the header to put it back. On a phone the
panel opens full screen.

## Installation

1. In SillyTavern open **Extensions** (the cubes icon) → **Install extension**.
2. Paste the link to this repository and press Install.
3. A **≋** button appears over the chat. Tap it — the panel opens with a
   step-by-step setup.

Nothing else to install: the toy connects through Intiface right from the browser.

## Master switch

Extensions → **📳 PUSYA VIBE**:

* **Allow AI control** — while it's off, the toy only listens to you.
* **Strength ceiling**, **auto-stop** and **safeword** — limits you set once.

Everything else is in the panel.

**Does the character know about the toy** — ⚙ Settings → Behaviour:

* **if in the scene** (default) — the character learns about the real toy only
  once it's already in the chat or in the character card, and won't bring it out
  mid-conversation.
* **no** — never: you or the plugin drive the toy from the scene text.
* **always** — knows from the first reply and can bring it into the scene.

## The toy

1. Install Intiface Central on the device next to the toy and press **▶**
   (`Engine running`).
2. Fully close the brand's own app — the toy obeys only one owner.
   A **Satisfyer** must first be paired in the system Bluetooth.
3. In Intiface: Devices → **Start Scanning**, wait for the toy to appear.
4. In the panel: Settings → “Connect”. From then on the plugin connects by itself.

**Intiface on a computer, phone as the remote.** Run Intiface on a computer on
the same Wi-Fi, turn on “Listen on all network interfaces” (App Modes), and in
the panel enter `ws://COMPUTER-IP:12345` under “another address or connection
type”. On Windows the IP is in Settings → Network & internet → Wi-Fi → your
network → IPv4 address; the network profile must be **Private**.

**Intiface accepts only one client.** While the panel is open somewhere else —
another chat, Tavo next to SillyTavern — Intiface won't let this one in. Close
the other panel and press “Reconnect”.

## Troubleshooting

| Symptom | What to do |
|---|---|
| No ≋ button | reload the page; Extensions → PUSYA VIBE → “Open the panel” |
| Dragged the button off screen | Extensions → PUSYA VIBE → “Put the ≋ button back” |
| Panel too small or too large | ⚙ Settings → Screen and window → “font size in the panel” |
| “couldn't reach ws://127.0.0.1:12345” | Intiface isn't running or ▶ isn't pressed — or another panel is already connected |
| Connected but no vibration | Event log → the line “*name* can: …”. Empty means Intiface found no motor; test the toy with Intiface's own slider |
| Silent in a hot scene | is “Allow AI control” on, and the “character” toggle in the panel? |
| The toy keeps dropping | check the battery and that the brand app is closed |

---

<a id="russian"></a>

## 📳 PUSYA VIBE для SillyTavern — по-русски

Персонаж управляет игрушкой прямо из ролеплея. Без привязки к бренду: через
[Intiface Central](https://intiface.com/central/) — это ~100 брендов, включая
Satisfyer, We-Vibe, Lovense, Kiiroo и малоизвестные.

Пульт тот же, что в версии для Таво: кнопка **≋** поверх чата, наверху волны и
СТОП, внизу док из четырёх разделов, настройка по шагам и экскурсия по кнопкам. На компьютере окно можно
таскать за шапку и растягивать за уголок внизу справа хоть на всё свободное
место рядом с чатом; размер шрифта настраивается отдельно, а двойной щелчок по
шапке возвращает всё как было. На телефоне пульт открывается во весь экран.

---

### Установка

1. В Таверне открой **Расширения** (значок кубиков) → **Установить расширение**.
2. Вставь ссылку на этот репозиторий и нажми «Установить».
3. Поверх чата появится кнопка **≋**. Нажми — откроется пульт, а в нём настройка
   по шагам.

Больше ничего ставить не нужно: игрушка подключается через Intiface прямо из
браузера, как в Таво.

### Главный рубильник

Расширения → **📳 PUSYA VIBE**:

* **Разрешить ИИ управлять** — пока выключено, игрушка слушается только тебя.
* **Потолок силы**, **автостоп** и **стоп-слово** — границы, которые выставляют
  один раз.

Всё остальное — в пульте.

**Знает ли персонаж об игрушке** — ⚙ Настройки → Как вести себя:

* **если она в сцене** (по умолчанию) — персонаж узнаёт о настоящей игрушке,
  только когда она уже есть в переписке или в карточке. Сам посреди разговора
  её не достанет.
* **нет** — не знает совсем: игрушкой управляешь ты или плагин по тексту сцены.
* **всегда** — знает с первого ответа и может сам принести её в сцену.

### Игрушка

1. Поставь Intiface Central на то устройство, что рядом с игрушкой, и нажми **▶**
   (`Engine running`).
2. Полностью закрой родное приложение бренда — игрушка слушается одного хозяина.
   **Satisfyer** перед этим нужно спарить в системном Bluetooth.
3. В Intiface: Devices → **Start Scanning**, дождись игрушку в списке.
4. В пульте: Настройки → «Подключить». Дальше плагин цепляется сам.

**Satisfyer виден, но не подключается** («found» и сразу «NotConnected»):
отвяжи его от телефона («Забыть это устройство»), сбрось кнопкой сброса
(3 вибрации и 5 импульсов), а в Windows 11 включи Параметры → Bluetooth и
устройства → Устройства → «Обнаружение устройств Bluetooth» → **«Расширенный»**.

Пока игрушка играет, вкладка с Таверной должна оставаться открытой — как и Таво
на экране.

**Intiface пускает к себе только одного клиента.** Пока пульт открыт где-то ещё —
в другом чате, в Таво рядом с Таверной, на проверочной странице — Intiface
перестаёт слушать порт, и сюда уже не подключиться. Выглядит это как «игрушка
подключена, а плагин её не видит»; в журнале («Настройки» → «Что происходило»)
об этом написано прямо. Закрой лишний пульт и нажми «Переподключить».

### Если что-то не так

| Симптом | Что делать |
|---|---|
| Нет кнопки ≋ | обнови страницу; Расширения → PUSYA VIBE → «Открыть пульт» |
| Кнопку утащила за край | Расширения → PUSYA VIBE → «Вернуть кнопку ≋ на место» |
| Окно пульта мешает | тащи его за шапку, растягивай за уголок внизу справа — до края экрана; вернуть — двойной щелчок по шапке или Расширения → PUSYA VIBE → «Вернуть окно пульта на место» |
| Панель слишком мелкая или крупная | ⚙ Настройки → Экран и окно → «размер шрифта в пульте» |
| Нечем остановить игрушку с телефона | пока она работает, рядом с кнопкой ≋ висит маленький СТОП; долгое нажатие на саму ≋ тоже останавливает |
| «не достучалась до ws://127.0.0.1:12345» | Intiface не запущен, не нажато ▶ — или к нему уже подключён другой пульт: он пускает только одного |
| Подключилось, а вибрации нет | «Что происходило» → строчка «*имя* умеет: …». Пусто — Intiface не нашёл мотор; проверь игрушку его же кнопками, дело не в плагине |
| Игрушка молчит на горячей сцене | включено ли «Разрешить ИИ управлять» и тумблер «персонаж» в пульте |
| Игрушка отваливается | проверь заряд и что родное приложение бренда закрыто |
| Нужен английский пульт | ⚙ Настройки → Экран и окно → «язык пульта» → English |

---

by Pusya · [t.me/pusgir](https://t.me/pusgir)

// Tải data/config.json và render. Muốn đổi nội dung: chỉ sửa config.json rồi commit.
// Tích "Xong" được lưu tạm trong trình duyệt; bấm "Xuất config.json" rồi commit file đó để mọi người cùng thấy.
const WD_FULL = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const TABS = [
  { key: "overdue", label: "Quá hạn", note: "Ít khi là trễ thật — kiểm tra lại và tích Xong nếu đã làm." },
  { key: "none", label: "Chưa có hạn", note: "Chưa có ô màu trên lịch gốc." },
  { key: "done", label: "Đã xong", note: "Bỏ tích để đưa hạng mục trở lại danh sách." },
];
const DONE_KEY = "deadline-done";
const STRIP_DAYS = 14;

const $ = (id) => document.getElementById(id);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ddmm = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const saved = U.load("deadline-view", {});
const state = {
  cfg: null, items: [], code: saved.code || null, person: saved.person || null, tab: saved.tab || "overdue", q: "",
  soonDays: 7, today: U.today(), first: true,
  local: U.load(DONE_KEY, {}), // { id: true/false } — chỉ những mục đã đổi so với config
};

async function init() {
  try {
    // no-store: commit mới lên GitHub Pages là thấy ngay, không dính cache trình duyệt
    const res = await fetch("data/config.json", { cache: "no-store" });
    state.cfg = await res.json();
  } catch {
    $("agenda").innerHTML = `<div class="empty">Không tải được data/config.json.</div>`;
    return;
  }
  const cfg = state.cfg, today = state.today;
  state.soonDays = cfg.rules?.soonDays ?? 7;

  state.items = cfg.items.map((it, i) => {
    const d = U.parseDate(it.deadline);
    const diff = d ? U.daysBetween(today, d) : null;
    const name = `${it.code} - ${it.part} - No.${it.no}`;
    return { ...it, id: name, i, d, diff, name, hay: U.fold(`${name} ${it.people.join(" ")}`) };
  });

  // Bỏ các tích tạm đã trùng với config (vd. sau khi đã commit config mới)
  for (const x of state.items) if (x.id in state.local && state.local[x.id] === !!x.done) delete state.local[x.id];
  U.save(DONE_KEY, state.local);

  if (!TABS.some((t) => t.key === state.tab)) state.tab = "overdue";
  if (state.code && !state.items.some((x) => x.code === state.code)) state.code = null;
  if (state.person && !state.items.some((x) => x.people.includes(state.person))) state.person = null;

  document.title = cfg.app.title;
  $("appTitle").textContent = cfg.app.title;
  $("sourceInfo").innerHTML = `Nguồn: ${U.esc(cfg.app.source)}<br>Cập nhật: ${U.esc(cfg.app.updated)}`;
  $("todayChip").textContent = `Hôm nay · ${WD_FULL[today.getDay()]} ${U.fmt(today)}`;

  bindUI();
  render();
  state.first = false;
}

const isDone = (x) => (x.id in state.local ? state.local[x.id] : !!x.done);

function refreshStatus() {
  for (const x of state.items) {
    x.status = isDone(x) ? "done" : !x.d ? "none" : x.diff < 0 ? "overdue" : x.diff <= state.soonDays ? "soon" : "later";
  }
}

function filtered({ ignoreCode = false, ignorePerson = false } = {}) {
  const q = U.fold(state.q.trim());
  return state.items.filter((x) =>
    (ignoreCode || !state.code || x.code === state.code) &&
    (ignorePerson || !state.person || x.people.includes(state.person)) &&
    (!q || x.hay.includes(q))
  );
}

function render() {
  refreshStatus();
  const list = filtered();
  renderTitle();
  renderProgress();
  renderNav();
  renderStats(list);
  renderStrip(list);
  renderAgenda(list);
  renderSide(list);
  U.save("deadline-view", { code: state.code, person: state.person, tab: state.tab });
}

/* ---------- Header ---------- */
function renderTitle() {
  const chips = [];
  if (state.code) chips.push(`<button class="chip" data-clear="code">${U.esc(state.code)}<span>×</span></button>`);
  if (state.person) chips.push(`<button class="chip" data-clear="person">${U.esc(state.person)}<span>×</span></button>`);
  $("viewTitle").innerHTML = chips.length ? `<span class="title-text">Đang lọc</span>${chips.join("")}` : `<span class="title-text">Tổng quan</span>`;
}

function renderProgress() {
  const scope = state.code ? state.items.filter((x) => x.code === state.code) : state.items;
  const done = scope.filter((x) => x.status === "done").length;
  $("progressText").textContent = `${done}/${scope.length}`;
  $("progressBar").style.width = `${scope.length ? (done / scope.length) * 100 : 0}%`;

  const pending = Object.keys(state.local).length;
  $("pending").hidden = !pending;
  $("pending").textContent = pending;
  $("exportBtn").classList.toggle("dirty", pending > 0);
}

/* ---------- Sidebar ---------- */
function renderNav() {
  // Công trình: số việc còn mở + số quá hạn
  const byCode = new Map();
  for (const x of filtered({ ignoreCode: true })) {
    const c = byCode.get(x.code) || { open: 0, late: 0 };
    if (x.status !== "done") c.open++;
    if (x.status === "overdue") c.late++;
    byCode.set(x.code, c);
  }
  const allOpen = [...byCode.values()].reduce((s, c) => s + c.open, 0);
  $("codeNav").innerHTML =
    `<button class="nav-item ${!state.code ? "active" : ""}" data-code="">Tất cả<span class="n">${allOpen}</span></button>` +
    [...byCode.keys()].sort().map((k) => {
      const c = byCode.get(k);
      return `<button class="nav-item ${state.code === k ? "active" : ""} ${c.open ? "" : "muted"}" data-code="${U.esc(k)}">
        <span class="mono">${U.esc(k)}</span>${c.late ? `<span class="late" title="${c.late} mục quá hạn">${c.late}</span>` : ""}<span class="n">${c.open}</span></button>`;
    }).join("");

  // Người làm: số việc còn mở có deadline từ hôm nay trở đi
  const byPerson = new Map();
  for (const x of filtered({ ignorePerson: true })) {
    if (x.status !== "soon" && x.status !== "later") continue;
    for (const p of x.people) byPerson.set(p, (byPerson.get(p) || 0) + 1);
  }
  if (state.person && !byPerson.has(state.person)) byPerson.set(state.person, 0);
  const people = [...byPerson.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const max = Math.max(1, ...people.map((p) => p[1]));
  $("peopleNav").innerHTML = people.length
    ? people.map(([p, n]) => `<button class="nav-item person ${state.person === p ? "active" : ""}" data-person="${U.esc(p)}">
        <span class="pn">${U.esc(p)}</span><span class="pbar"><i style="width:${(n / max) * 100}%"></i></span><span class="n">${n}</span></button>`).join("")
    : `<div class="nav-empty">Không có việc sắp tới.</div>`;
}

/* ---------- Dải 14 ngày ---------- */
function renderStats(list) {
  const n = (s) => list.filter((x) => x.status === s).length;
  $("stats").innerHTML = `
    <button class="stat soon" data-jump="agenda"><span class="dot soon"></span><b>${n("soon")}</b> trong ${state.soonDays} ngày</button>
    <button class="stat overdue" data-tab="overdue"><span class="dot overdue"></span><b>${n("overdue")}</b> quá hạn</button>
    <button class="stat none" data-tab="none"><span class="dot none"></span><b>${n("none")}</b> chưa có hạn</button>`;
}

function renderStrip(list) {
  const open = list.filter((x) => x.d && x.status !== "done" && x.diff >= 0);
  const days = Array.from({ length: STRIP_DAYS }, (_, k) => ({ d: addDays(state.today, k), k, items: open.filter((x) => x.diff === k) }));
  const max = Math.max(1, ...days.map((x) => x.items.length));

  $("strip").innerHTML = days.map(({ d, k, items }) => {
    const cls = [
      k === 0 ? "today" : "",
      d.getDay() === 0 || d.getDay() === 6 ? "we" : "",
      k <= state.soonDays ? "soon" : "later",
      items.length ? "" : "is-empty",
    ].join(" ");
    const label = k === 0 ? "Hôm nay" : k === 1 ? "Ngày mai" : U.WD[d.getDay()];
    const tip = items.length ? items.map((x) => x.name).join("\n") : "Không có hạng mục";
    return `<button class="day ${cls}" data-date="${iso(d)}" title="${U.esc(tip)}" style="animation-delay:${state.first ? k * 18 : 0}ms">
      <span class="day-wd">${label}</span>
      <span class="day-date">${ddmm(d)}</span>
      <span class="day-n">${items.length || "–"}</span>
      <span class="day-bar"><i style="width:${(items.length / max) * 100}%"></i></span>
    </button>`;
  }).join("");
}

/* ---------- Lịch việc sắp tới ---------- */
function renderAgenda(list) {
  const items = list.filter((x) => x.status === "soon" || x.status === "later").sort((a, b) => a.d - b.d || a.i - b.i);
  $("agendaCount").textContent = items.length;
  $("agendaSub").textContent = items.length ? `Từng ngày trong ${state.soonDays} ngày tới, sau đó gom theo tuần` : "";

  // Nhóm: từng ngày trong soonDays, sau đó theo tuần (T2 → CN)
  const groups = [];
  for (const x of items) {
    let key, kind;
    if (x.diff <= state.soonDays) { key = iso(x.d); kind = "day"; }
    else { key = "w" + iso(addDays(x.d, -((x.d.getDay() + 6) % 7))); kind = "week"; }
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) groups.push((g = { key, kind, first: x, items: [] }));
    g.items.push(x);
  }

  if (!groups.length) {
    $("agenda").innerHTML = `<div class="empty">Không có hạng mục sắp tới${state.q || state.code || state.person ? " khớp bộ lọc" : ""}.</div>`;
    return;
  }

  let k = 0;
  const seen = new Set();
  $("agenda").innerHTML = groups.map((g) => {
    let head;
    if (g.kind === "day") {
      const x = g.first;
      const label = x.diff === 0 ? "Hôm nay" : x.diff === 1 ? "Ngày mai" : WD_FULL[x.d.getDay()];
      const rel = x.diff === 0 ? "Hạn chót hôm nay" : `Còn ${x.diff} ngày`;
      seen.add(iso(x.d));
      head = `<div class="g-head ${x.diff === 0 ? "is-today" : ""}" id="d-${iso(x.d)}">
        <div class="g-date"><span class="g-day">${String(x.d.getDate()).padStart(2, "0")}</span><span class="g-mon">TH${x.d.getMonth() + 1}</span></div>
        <div class="g-label"><b>${label}</b><span>${U.fmt(x.d)}</span></div>
        <div class="g-meta"><span class="pill soon">${rel}</span><span class="g-n">${g.items.length} mục</span></div>
      </div>`;
    } else {
      const mon = U.parseDate(g.key.slice(1)), sun = addDays(mon, 6);
      const a = g.items[0].diff, b = g.items[g.items.length - 1].diff;
      head = `<div class="g-head week">
        <div class="g-label"><b>Tuần ${ddmm(mon)} – ${ddmm(sun)}</b><span>Còn ${a === b ? a : `${a}–${b}`} ngày</span></div>
        <div class="g-meta"><span class="g-n">${g.items.length} mục</span></div>
      </div>`;
    }
    const rows = g.items.map((x) => {
      const key = iso(x.d);
      const anchor = seen.has(key) ? "" : (seen.add(key), `id="d-${key}"`);
      const when = g.kind === "week" ? `<span class="when"><b>${U.WD[x.d.getDay()]}</b> ${U.fmt(x.d)}</span>` : `<span class="when"></span>`; // giữ đủ cột lưới
      return `<div class="a-row ${x.status}" ${anchor} style="animation-delay:${state.first ? Math.min(k++, 24) * 14 : 0}ms">
        <span class="dot ${x.status}"></span>
        <div class="a-name">${nameHTML(x)}</div>
        ${when}
        <span class="who">${U.esc(x.people.join(", "))}</span>
        ${checkHTML(x)}
      </div>`;
    }).join("");
    return `<section class="group k-${g.kind}">${head}<div class="g-rows">${rows}</div></section>`;
  }).join("");
}

/* ---------- Cột phụ ---------- */
function renderSide(list) {
  const lists = {
    overdue: list.filter((x) => x.status === "overdue").sort((a, b) => b.d - a.d || a.i - b.i), // trễ gần nhất lên đầu
    none: list.filter((x) => x.status === "none").sort((a, b) => a.i - b.i),
    done: list.filter((x) => x.status === "done").sort((a, b) => (a.d && b.d ? a.d - b.d : a.d ? -1 : b.d ? 1 : 0) || a.i - b.i),
  };
  $("tabs").innerHTML = TABS.map((t) => `<button class="tab ${t.key} ${state.tab === t.key ? "active" : ""}" data-tab="${t.key}" role="tab" aria-selected="${state.tab === t.key}">
      <span class="dot ${t.key}"></span>${t.label}<span class="n">${lists[t.key].length}</span></button>`).join("");
  $("sideNote").textContent = TABS.find((t) => t.key === state.tab).note;

  const cur = lists[state.tab];
  $("sideList").innerHTML = cur.length
    ? cur.map((x) => {
        const date = x.d ? `<span class="s-date">${U.WD[x.d.getDay()]} ${U.fmt(x.d)}</span>` : "";
        const late = x.status === "overdue" ? `<span class="pill overdue">Trễ ${-x.diff} ngày</span>` : "";
        return `<div class="s-row ${x.status}">
          <div class="s-main">
            <div class="s-name">${nameHTML(x)}</div>
            <div class="s-meta">${late}${date}<span class="who">${U.esc(x.people.join(", "))}</span></div>
          </div>
          ${checkHTML(x)}
        </div>`;
      }).join("")
    : `<div class="empty small">Không có mục nào.</div>`;
}

/* ---------- Mảnh dùng chung ---------- */
function nameHTML(x) {
  const changed = x.id in state.local ? `<span class="unsaved" title="Chưa xuất vào config.json"></span>` : "";
  return `<span class="code">${U.esc(x.code)}</span><span class="sep">-</span><span class="part">${U.esc(x.part)}</span><span class="sep">-</span><span class="no">No.${U.esc(x.no)}</span>${changed}`;
}

function checkHTML(x) {
  const on = x.status === "done";
  return `<button class="check ${on ? "on" : ""}" data-id="${U.esc(x.id)}" aria-pressed="${on}" aria-label="${on ? "Bỏ đánh dấu xong" : "Đánh dấu đã xong"}">
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="m3.5 8.5 3 3 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </button>`;
}

function toggleDone(id, silent = false) {
  const x = state.items.find((it) => it.id === id);
  const next = !isDone(x);
  if (next === !!x.done) delete state.local[id];
  else state.local[id] = next;
  U.save(DONE_KEY, state.local);
  render();
  if (silent) { $("toast").hidden = true; return; }
  toast(`${next ? "Đã xong" : "Đã bỏ đánh dấu"}: ${x.name}`, () => toggleDone(id, true));
}

let toastTimer;
function toast(text, undo) {
  $("toastText").textContent = text;
  $("toast").hidden = false;
  $("toastUndo").onclick = undo;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 4000);
}

function exportConfig() {
  const cfg = structuredClone(state.cfg);
  for (const it of cfg.items) {
    const id = `${it.code} - ${it.part} - No.${it.no}`;
    if (id in state.local) it.done = state.local[id];
  }
  cfg.app.updated = iso(new Date());
  const blob = new Blob([JSON.stringify(cfg, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "config.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function flash(el) {
  el.classList.remove("flash");
  void el.offsetWidth; // chạy lại animation
  el.classList.add("flash");
}

function bindUI() {
  const sidebar = $("sidebar"), scrim = $("scrim");
  const closeMenu = () => { sidebar.classList.remove("open"); scrim.classList.remove("show"); };

  document.addEventListener("click", (e) => {
    const t = e.target;
    const check = t.closest(".check");
    if (check) return toggleDone(check.dataset.id);

    const code = t.closest("[data-code]");
    if (code) { state.code = code.dataset.code || null; render(); return closeMenu(); }

    const person = t.closest("[data-person]");
    if (person) { state.person = state.person === person.dataset.person ? null : person.dataset.person; render(); return closeMenu(); }

    const clear = t.closest("[data-clear]");
    if (clear) { state[clear.dataset.clear] = null; return render(); }

    const tab = t.closest("[data-tab]");
    if (tab) {
      state.tab = tab.dataset.tab;
      render();
      if (!tab.classList.contains("tab")) { // bấm từ thanh số liệu: cuộn tới cột phụ
        const card = $("sideList").closest(".card");
        card.scrollIntoView({ behavior: "smooth", block: "start" });
        flash(card);
      }
      return;
    }

    if (t.closest("[data-jump]")) return $("agenda").closest(".card").scrollIntoView({ behavior: "smooth", block: "start" });

    const day = t.closest(".day");
    if (day) {
      const target = document.getElementById("d-" + day.dataset.date);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      flash(target);
    }
  });

  $("exportBtn").addEventListener("click", exportConfig);

  const input = $("search");
  input.addEventListener("input", () => { state.q = input.value; render(); });
  U.bindSearchKeys(input, () => { state.q = ""; render(); });

  $("menuBtn").addEventListener("click", () => { sidebar.classList.add("open"); scrim.classList.add("show"); });
  scrim.addEventListener("click", closeMenu);
}

init();

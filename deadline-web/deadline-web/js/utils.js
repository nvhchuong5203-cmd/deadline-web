// Tiện ích dùng chung: ngày tháng, escape HTML, localStorage, phím tắt.
const U = {
  WD: ["CN", "T2", "T3", "T4", "T5", "T6", "T7"],

  // "2026-11-16" -> Date lúc 00:00 giờ địa phương (tránh lệch múi giờ của new Date("yyyy-mm-dd"))
  parseDate(s) {
    if (!s) return null;
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  },

  today() {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  },

  daysBetween(a, b) {
    return Math.round((b - a) / 86400000);
  },

  fmt(d) {
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  },

  esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  },

  // Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu
  fold(s) {
    return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();
  },

  load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },

  save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* chế độ riêng tư: bỏ qua */ }
  },

  // "/" hoặc Ctrl/Cmd+K: focus ô tìm kiếm; Esc: xoá tìm kiếm
  bindSearchKeys(input, onClear) {
    document.addEventListener("keydown", (e) => {
      const typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
      if ((e.key === "/" && !typing) || (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        input.focus();
        input.select();
      } else if (e.key === "Escape" && document.activeElement === input) {
        input.value = "";
        input.blur();
        onClear();
      }
    });
  },
};

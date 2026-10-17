/* ==========================================================================
   Small-business landing page — page behavior + chat widget
   All business-specific content comes from business.json (see NEW-CLIENT.md).
   ========================================================================== */

/**
 * Chat widget configuration.
 *
 * apiEndpoint: the URL of the deployed Cloudflare Worker (worker/chat-worker.js),
 * e.g. "https://jims-pub-chat.<your-subdomain>.workers.dev".
 * While it is left as the placeholder "REPLACE_WITH_WORKER_URL", the widget shows a
 * friendly "please call us" fallback instead of making any network request.
 * (Phone number and greeting are filled in from business.json.)
 */
const CHAT_CONFIG = {
  apiEndpoint: "https://jims-pub-chat.muchimedia.workers.dev",
  maxMessageLength: 500, // must match MAX_USER_MESSAGE_CHARS in the Worker
  maxHistory: 10, // the Worker also only forwards the last 10 messages
  phoneDisplay: "",
  phoneHref: "",
  greeting: "",
  businessName: "",
};

const PLACEHOLDER_ENDPOINT = "REPLACE_WITH_WORKER_URL";

// Filled in from business.json -> reservations.
const RESERVATION_CONFIG = {
  endpoint: "",
  subject: "",
  successMessage: "",
  failureMessage: "",
  timeoutMs: 15000,
};

document.addEventListener("DOMContentLoaded", async () => {
  let business;
  try {
    business = await loadBusiness();
    renderBusiness(business);
  } catch (err) {
    console.error("Could not load business.json:", err);
    showLoadError();
    return;
  }
  initNav();
  initYear();
  initReservationForm();
  initChat();
  void document.body.offsetHeight; // apply the theme colors before transitions are re-enabled
  document.body.classList.remove("is-loading");
});

/* Business content -------------------------------------------------------- */
async function loadBusiness() {
  const res = await fetch("business.json");
  if (!res.ok) throw new Error(`business.json responded ${res.status}`);
  return res.json();
}

function showLoadError() {
  const p = document.createElement("p");
  p.className = "load-error";
  p.textContent = "Sorry, this page couldn't load. Please refresh to try again.";
  document.body.prepend(p);
  document.body.classList.remove("is-loading");
  document.body.classList.add("load-failed");
}

function renderBusiness(b) {
  const name = b.name || "";
  const contact = b.contact || {};
  const reservations = b.reservations || {};
  const phone = contact.phone || "";
  const phoneHref = phoneToHref(phone);
  const maxParty = Number(reservations.maxPartySize) || 7;
  const cityLine = [contact.city, contact.region].filter(Boolean).join(", ");

  // Shared config used by the form and chat
  Object.assign(CHAT_CONFIG, {
    phoneDisplay: phone,
    phoneHref,
    greeting: (b.chat && b.chat.greeting) || `Hey there, welcome to ${name}!`,
    businessName: name,
  });
  // "Jim's" -> "Jim's team"; "Blue Door Cafe" -> "The Blue Door Cafe team"
  const team = /['’]s$/i.test(name) ? `${name} team` : `The ${name} team`;
  Object.assign(RESERVATION_CONFIG, {
    endpoint: reservations.formspreeEndpoint || "",
    subject: `New table request – ${name}`,
    successMessage: `Thanks! Your request is in. ${team} will contact you to confirm your table.`,
    failureMessage: `Something went wrong — please call us at ${phone}.`,
  });

  // <head>
  document.title = (b.seo && b.seo.title) || name;
  setMeta("description", (b.seo && b.seo.description) || "");
  applyTheme(b.theme || {}, name);

  // Simple text slots: <el data-text="path.to.value">
  document.querySelectorAll("[data-text]").forEach((el) => {
    const value = getPath(b, el.dataset.text);
    if (typeof value === "string" || typeof value === "number") el.textContent = String(value);
  });

  // About
  setText("about-eyebrow", `About ${name}`);
  const aboutText = document.getElementById("about-text");
  for (const para of (b.about && b.about.paragraphs) || []) {
    aboutText.append(el("p", {}, para));
  }
  const points = document.getElementById("about-points");
  for (const h of (b.about && b.about.highlights) || []) {
    points.append(
      el("li", {}, [
        el("span", { class: "about-icon", "aria-hidden": "true" }, h.icon || ""),
        el("div", {}, [el("strong", {}, h.title || ""), el("span", {}, h.text || "")]),
      ])
    );
  }

  // Menu
  renderMenu(b.menu || {});

  // Hours + happy hour
  const rows = document.getElementById("hours-rows");
  for (const r of (b.hours && b.hours.schedule) || []) {
    rows.append(el("tr", {}, [el("th", { scope: "row" }, r.days || ""), el("td", {}, r.time || "")]));
  }
  const happy = b.happyHour;
  if (happy && (happy.when || (happy.deals && happy.deals.length))) {
    const deals = document.getElementById("happy-hour-deals");
    for (const d of happy.deals || []) deals.append(el("li", {}, d));
  } else {
    document.getElementById("happy-hour").hidden = true;
  }

  // Reservations
  const form = document.getElementById("reserve-form");
  form.action = RESERVATION_CONFIG.endpoint;
  setText(
    "reserve-intro",
    `${reservations.intro ? reservations.intro + " " : ""}For parties of ${maxParty + 1} or more, please call us.`
  );
  form.elements.phone_or_email.placeholder = reservations.contactPlaceholder || "";
  const party = form.elements.party_size;
  for (let n = 1; n <= maxParty; n++) {
    party.append(el("option", { value: String(n) }, n === 1 ? "1 person" : `${n} people`));
  }
  document
    .getElementById("res-party-hint")
    .replaceChildren(`${maxParty + 1} or more? Please call `, el("a", { href: phoneHref }, phone), ".");

  // Location / contact
  document
    .getElementById("visit-address")
    .replaceChildren(
      el("strong", {}, name),
      el("br"),
      contact.street || "",
      el("br"),
      [cityLine, contact.postalCode].filter(Boolean).join(" ")
    );
  const contactLinks = [];
  if (phone) contactLinks.push(el("a", { class: "contact-link", href: phoneHref }, phone));
  if (contact.email) {
    contactLinks.push(el("a", { class: "contact-link", href: `mailto:${contact.email}` }, contact.email));
  }
  document.getElementById("visit-contact").replaceChildren(...joinWith(contactLinks, () => el("br")));

  const socialLinks = (b.social || [])
    .filter((s) => s && s.url)
    .map((s) => el("a", { class: "contact-link", href: s.url, target: "_blank", rel: "noopener" }, s.label || s.url));
  if (socialLinks.length) {
    const social = document.getElementById("visit-social");
    social.replaceChildren(...joinWith(socialLinks, () => " · "));
    social.hidden = false;
  }

  // Footer
  setText("footer-place", [name, cityLine].filter(Boolean).join(" · "));
  document.querySelector(".demo-note").hidden = b.demo !== true;

  // Chat labels
  setText("chat-toggle-label", `Chat with ${name}`);
  document.getElementById("chat-window").setAttribute("aria-label", `Chat with ${name}`);
  setText("chat-title", `Ask ${name}`);
  setText("chat-subtitle", happy ? "Menu, hours, happy hour & more" : "Menu, hours & more");
}

function renderMenu(menu) {
  const featured = menu.featured;
  if (featured && featured.items && featured.items.length) {
    const grid = document.getElementById("menu-featured-items");
    for (const item of featured.items) {
      const card = el("article", { class: item.badge ? "pizza-card pizza-card-special" : "pizza-card" });
      if (item.badge) card.append(el("span", { class: "badge" }, item.badge));
      card.append(
        el("div", { class: "pizza-top" }, [el("h4", {}, item.name || ""), el("span", { class: "price" }, item.price || "")]),
        el("p", {}, item.description || "")
      );
      grid.append(card);
    }
  } else {
    document.getElementById("menu-featured").hidden = true;
  }

  renderMenuGroups(document.getElementById("menu-food"), menu.food || []);
  renderMenuGroups(document.getElementById("menu-drinks"), menu.drinks || []);
}

function renderMenuGroups(column, groups) {
  for (const group of groups) {
    column.append(el("h3", { class: "menu-heading" }, [el("span", {}, group.title || "")]));
    const list = el("ul", { class: "menu-list" });
    for (const item of group.items || []) {
      const li = el("li", {}, [
        el("div", { class: "menu-item-row" }, [
          el("span", { class: "item" }, item.name || ""),
          el("span", { class: "dots", "aria-hidden": "true" }),
          el("span", { class: "price" }, item.price || ""),
        ]),
      ]);
      if (item.description) li.append(el("p", {}, item.description));
      list.append(li);
    }
    column.append(list);
  }
  if (!groups.length) column.hidden = true;
}

/* Theme ----------------------------------------------------------------------
   styles.css holds the hand-tuned palette for the default theme. When
   business.json uses different colors, the lighter/darker shades are derived
   from the three base colors. The design assumes a dark background. */
function applyTheme(theme, name) {
  const root = document.documentElement;
  const css = getComputedStyle(root);
  const bg = parseHex(theme.background);
  const primary = parseHex(theme.primary);
  const accent = parseHex(theme.accent);

  if (bg && !sameColor(bg, css.getPropertyValue("--wood-900"))) {
    setColorVar(root, "--wood-900", bg, "--bg-rgb");
    setColorVar(root, "--wood-950", adjustHsl(bg, 0, -2.5));
    setColorVar(root, "--wood-800", adjustHsl(bg, 0, 3.2));
    setColorVar(root, "--wood-700", adjustHsl(bg, 0, 7.5));
    setColorVar(root, "--wood-600", adjustHsl(bg, 0, 12.8));
    setColorVar(root, "--wood-500", adjustHsl(bg, 0, 20.8));
  }
  if (primary && !sameColor(primary, css.getPropertyValue("--amber-500"))) {
    setColorVar(root, "--amber-500", primary, "--primary-rgb");
    setColorVar(root, "--amber-400", adjustHsl(primary, 11, 9), "--primary-light-rgb");
    setColorVar(root, "--amber-300", adjustHsl(primary, 12, 20), "--primary-pale-rgb");
  }
  if (accent && !sameColor(accent, css.getPropertyValue("--ember"))) {
    setColorVar(root, "--ember", accent, "--accent-rgb");
    setColorVar(root, "--accent-light", adjustHsl(accent, 30, 26));
  }

  const bgHex = bg ? toHex(bg) : css.getPropertyValue("--wood-900").trim();
  const primaryHex = primary ? toHex(primary) : css.getPropertyValue("--amber-500").trim();
  setMeta("theme-color", bgHex);
  setFavicon(Array.from(name.trim())[0] || "", primaryHex, bgHex);
}

function setFavicon(letter, fill, textColor) {
  const xmlLetter = letter.toUpperCase().replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>" +
    `<circle cx='32' cy='32' r='30' fill='${fill}'/>` +
    "<text x='32' y='44' font-size='34' text-anchor='middle' font-family='Georgia,serif' font-weight='bold' " +
    `fill='${textColor}'>${xmlLetter}</text></svg>`;
  const encoded = svg.replace(/[<>#'%]|[^\x20-\x7e]/g, (c) =>
    c === "<" ? "%3C" : c === ">" ? "%3E" : c === "#" ? "%23" : c === "'" ? "%27" : encodeURIComponent(c)
  );
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.append(link);
  }
  link.href = `data:image/svg+xml,${encoded}`;
}

function parseHex(value) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value || "").trim());
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function toHex(rgb) {
  return "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

function sameColor(rgb, cssValue) {
  const other = parseHex(cssValue);
  return !!other && other.every((v, i) => v === rgb[i]);
}

function setColorVar(root, name, rgb, rgbVarName) {
  root.style.setProperty(name, toHex(rgb));
  if (rgbVarName) root.style.setProperty(rgbVarName, rgb.map(Math.round).join(", "));
}

// Shift saturation and lightness (in percentage points), keeping the hue.
function adjustHsl(rgb, dSat, dLight) {
  const [h, s, l] = rgbToHsl(rgb);
  const clamp = (v) => Math.min(100, Math.max(0, v));
  return hslToRgb(h, clamp(s + dSat), clamp(l + dLight));
}

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/* Small DOM helpers ----------------------------------------------------------- */
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  node.append(...(Array.isArray(children) ? children : [children]));
  return node;
}

function setText(id, text) {
  const node = document.getElementById(id);
  if (node) node.textContent = text;
}

function setMeta(name, content) {
  const meta = document.querySelector(`meta[name="${name}"]`);
  if (meta) meta.setAttribute("content", content);
}

function getPath(obj, path) {
  return path.split(".").reduce((o, key) => (o == null ? undefined : o[key]), obj);
}

function joinWith(nodes, makeSeparator) {
  return nodes.flatMap((n, i) => (i === 0 ? [n] : [makeSeparator(), n]));
}

// "(718) 555-0142" -> "tel:+17185550142". Use "+<country code> …" for non-US numbers.
function phoneToHref(phone) {
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return "";
  if (String(phone).trim().startsWith("+")) return `tel:+${digits}`;
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  return `tel:${digits}`;
}

/* Navigation ------------------------------------------------------------- */
function initNav() {
  const toggle = document.querySelector(".nav-toggle");
  const links = document.getElementById("nav-links");
  if (!toggle || !links) return;

  const setOpen = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    links.classList.toggle("open", open);
  };

  toggle.addEventListener("click", () => {
    setOpen(toggle.getAttribute("aria-expanded") !== "true");
  });

  links.addEventListener("click", (e) => {
    if (e.target.closest("a")) setOpen(false);
  });
}

function initYear() {
  const el = document.getElementById("year");
  if (el) el.textContent = String(new Date().getFullYear());
}

/* Reservations ----------------------------------------------------------- */
// Field name -> label used in validation messages.
const RESERVATION_FIELDS = [
  { name: "name", label: "Name" },
  { name: "phone_or_email", label: "Phone or email" },
  { name: "party_size", label: "Party size" },
  { name: "date", label: "Date" },
  { name: "time", label: "Time" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function initReservationForm() {
  const form = document.getElementById("reserve-form");
  const status = document.getElementById("reserve-status");
  const submitBtn = document.getElementById("reserve-submit");
  if (!form || !status || !submitBtn) return;

  const submitLabel = submitBtn.textContent;
  form.elements.date.min = todayISO();
  let sending = false;

  // Clear a field's error state as soon as the guest changes it.
  form.addEventListener("input", (e) => clearFieldError(e.target));
  form.addEventListener("change", (e) => clearFieldError(e.target));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sending) return;

    // Mobile date/time pickers can still hold focus when the button is tapped;
    // blurring commits their value before we read it.
    if (document.activeElement && form.contains(document.activeElement)) {
      document.activeElement.blur();
    }

    const values = readReservationValues(form);
    const problems = validateReservation(values);

    form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
    if (problems.length) {
      for (const p of problems) form.elements[p.name].setAttribute("aria-invalid", "true");
      showStatus(status, "error", problemsMessage(problems));
      form.elements[problems[0].name].focus();
      return;
    }

    sending = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";
    hideStatus(status);

    try {
      await sendReservation(values, form.elements._gotcha.value);
      form.reset();
      showStatus(status, "success", RESERVATION_CONFIG.successMessage);
    } catch (err) {
      // Keep everything the guest typed so they can try again or call.
      showStatus(status, "error", RESERVATION_CONFIG.failureMessage);
    } finally {
      sending = false;
      submitBtn.disabled = false;
      submitBtn.textContent = submitLabel;
    }
  });
}

function readReservationValues(form) {
  const values = {};
  for (const { name } of RESERVATION_FIELDS) {
    values[name] = String(form.elements[name].value || "").trim();
  }
  return values;
}

/**
 * Validates by looking at the actual values rather than the browser's
 * checkValidity(), which on Android Chrome could reject a filled-in time
 * (e.g. minute steps) and produce a misleading "fill in all fields" error.
 */
function validateReservation(v) {
  const problems = [];
  const missing = (name) => problems.push({ name, kind: "missing" });

  if (!v.name) missing("name");

  if (!v.phone_or_email) missing("phone_or_email");
  else if (!isPhoneOrEmail(v.phone_or_email)) problems.push({ name: "phone_or_email", kind: "invalid" });

  if (!v.party_size) missing("party_size");

  if (!v.date) missing("date");
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) problems.push({ name: "date", kind: "invalid" });
  else if (v.date < todayISO()) problems.push({ name: "date", kind: "past" });

  if (!v.time) missing("time");
  else if (!/^\d{2}:\d{2}/.test(v.time)) problems.push({ name: "time", kind: "invalid" });

  return problems;
}

function problemsMessage(problems) {
  const label = (name) => RESERVATION_FIELDS.find((f) => f.name === name).label;
  const missing = problems.filter((p) => p.kind === "missing").map((p) => label(p.name));
  const messages = [];

  if (missing.length) messages.push(`Please fill in: ${missing.join(", ")}.`);
  for (const p of problems) {
    if (p.kind === "invalid" && p.name === "phone_or_email") {
      messages.push("Please enter a valid phone number or email so we can reach you.");
    } else if (p.kind === "invalid") {
      messages.push(`Please choose a valid ${label(p.name).toLowerCase()}.`);
    } else if (p.kind === "past") {
      messages.push("Please choose a date that's today or later.");
    }
  }
  return messages.join(" ");
}

async function sendReservation(v, honeypot) {
  const payload = {
    name: v.name,
    phone_or_email: v.phone_or_email,
    party_size: v.party_size,
    date: formatDate(v.date),
    time: formatTime(v.time),
    _subject: RESERVATION_CONFIG.subject,
    _gotcha: honeypot,
  };
  if (EMAIL_RE.test(v.phone_or_email)) payload._replyto = v.phone_or_email;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESERVATION_CONFIG.timeoutMs);
  try {
    const res = await fetch(RESERVATION_CONFIG.endpoint, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Formspree responded ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}

function clearFieldError(el) {
  if (el && el.getAttribute && el.getAttribute("aria-invalid") === "true") {
    el.removeAttribute("aria-invalid");
  }
}

function showStatus(el, kind, message) {
  // Render the pub's phone number as a tap-to-call link that doesn't wrap mid-number.
  const phone = CHAT_CONFIG.phoneDisplay;
  const at = message.indexOf(phone);
  if (at === -1) {
    el.textContent = message;
  } else {
    const link = document.createElement("a");
    link.href = CHAT_CONFIG.phoneHref;
    link.className = "nowrap";
    link.textContent = phone;
    el.replaceChildren(message.slice(0, at), link, message.slice(at + phone.length));
  }
  el.className = `form-status form-status-${kind}`;
  el.hidden = false;
}

function hideStatus(el) {
  el.hidden = true;
  el.textContent = "";
}

function isPhoneOrEmail(value) {
  const digits = value.replace(/\D/g, "");
  return EMAIL_RE.test(value) || (digits.length >= 7 && digits.length <= 15 && !/[a-z@]/i.test(value));
}

function todayISO() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// "2030-05-03" -> "Friday, May 3, 2030" (falls back to the raw value)
function formatDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

// "19:30" -> "7:30 PM" (falls back to the raw value)
function formatTime(hhmm) {
  const [h, min] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(min)) return hhmm;
  const dt = new Date(2000, 0, 1, h, min);
  return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/* Chat widget ------------------------------------------------------------ */
function initChat() {
  const toggle = document.getElementById("chat-toggle");
  const windowEl = document.getElementById("chat-window");
  const closeBtn = document.getElementById("chat-close");
  const list = document.getElementById("chat-messages");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send");
  const counter = document.getElementById("chat-counter");
  if (!toggle || !windowEl || !list || !form || !input) return;

  const max = CHAT_CONFIG.maxMessageLength;
  input.maxLength = max;

  // Conversation history sent to the Worker: [{ role: "user"|"assistant", content }]
  const history = [];
  let greeted = false;
  let sending = false;

  const open = () => {
    windowEl.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    if (!greeted) {
      addMessage("bot", CHAT_CONFIG.greeting);
      greeted = true;
    }
    input.focus();
  };

  const close = () => {
    windowEl.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    toggle.focus();
  };

  toggle.addEventListener("click", () => (windowEl.hidden ? open() : close()));
  closeBtn.addEventListener("click", close);
  windowEl.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  const updateCounter = () => {
    // Enforce the limit even if maxlength is bypassed (e.g. some paste paths).
    if (input.value.length > max) input.value = input.value.slice(0, max);
    const len = input.value.length;
    counter.textContent = `${len} / ${max}`;
    counter.classList.toggle("near-limit", len >= max * 0.9);
    // Auto-grow textarea
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  };
  input.addEventListener("input", updateCounter);

  // Enter sends, Shift+Enter adds a newline.
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sending) return;

    const text = input.value.trim();
    if (!text) return;
    if (text.length > max) {
      addMessage("bot", `Sorry, messages are limited to ${max} characters. Could you shorten that a bit?`);
      return;
    }

    addMessage("user", text);
    history.push({ role: "user", content: text });
    input.value = "";
    updateCounter();

    if (!isEndpointConfigured()) {
      history.pop(); // nothing was actually exchanged with the bot
      addFallback();
      return;
    }

    sending = true;
    sendBtn.disabled = true;
    const typing = addMessage("bot", `${CHAT_CONFIG.businessName} is typing…`, true);

    try {
      const reply = await sendToWorker(history.slice(-CHAT_CONFIG.maxHistory));
      typing.remove();
      addMessage("bot", reply);
      history.push({ role: "assistant", content: reply });
    } catch (err) {
      typing.remove();
      history.pop(); // drop the unanswered user turn so history stays user/assistant alternating
      addFallback(err && err.userMessage);
    } finally {
      sending = false;
      sendBtn.disabled = false;
      input.focus();
    }
  });

  function addMessage(who, text, isTyping = false) {
    const li = document.createElement("li");
    li.className = `chat-msg chat-msg-${who}${isTyping ? " chat-msg-typing" : ""}`;
    li.textContent = text; // textContent only: never render model output as HTML
    list.appendChild(li);
    list.scrollTop = list.scrollHeight;
    return li;
  }

  function addFallback(customMessage) {
    const li = document.createElement("li");
    li.className = "chat-msg chat-msg-bot";
    li.append(
      document.createTextNode(
        (customMessage ? customMessage + " " : "Sorry, our chat helper is taking a break right now. ") +
          "For the quickest answer, give us a call at "
      )
    );
    const a = document.createElement("a");
    a.href = CHAT_CONFIG.phoneHref;
    a.textContent = CHAT_CONFIG.phoneDisplay;
    li.append(a, document.createTextNode(" — we're happy to help!"));
    list.appendChild(li);
    list.scrollTop = list.scrollHeight;
  }
}

function isEndpointConfigured() {
  const url = CHAT_CONFIG.apiEndpoint;
  return typeof url === "string" && url.trim() !== "" && !url.includes(PLACEHOLDER_ENDPOINT);
}

async function sendToWorker(messages) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(CHAT_CONFIG.apiEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
      signal: controller.signal,
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      /* non-JSON response, handled below */
    }

    if (!res.ok || !data || typeof data.reply !== "string" || !data.reply.trim()) {
      const err = new Error("Chat request failed");
      if (res.status === 429) err.userMessage = "Whoa, that's a lot of questions in a short time!";
      throw err;
    }
    return data.reply.trim();
  } finally {
    clearTimeout(timeout);
  }
}

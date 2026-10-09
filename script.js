/* ==========================================================================
   Jim's — page behavior + chat widget
   ========================================================================== */

/**
 * Chat widget configuration.
 *
 * apiEndpoint: the URL of the deployed Cloudflare Worker (worker/chat-worker.js),
 * e.g. "https://jims-pub-chat.<your-subdomain>.workers.dev".
 * While it is left as the placeholder below, the widget shows a friendly
 * "please call us" fallback instead of making any network request.
 */
const CHAT_CONFIG = {
  apiEndpoint: "https://jims-pub-chat.muchimedia.workers.dev",
  maxMessageLength: 500, // must match MAX_USER_MESSAGE_CHARS in the Worker
  maxHistory: 10, // the Worker also only forwards the last 10 messages
  phoneDisplay: "(718) 555-0142",
  phoneHref: "tel:+17185550142",
  greeting:
    "Hey there, welcome to Jim's! Ask me about the menu, prices, hours, happy hour, or how to grab a table.",
};

const PLACEHOLDER_ENDPOINT = "REPLACE_WITH_WORKER_URL";

document.addEventListener("DOMContentLoaded", () => {
  initNav();
  initYear();
  initReservationForm();
  initChat();
});

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
const RESERVATION_CONFIG = {
  endpoint: "https://formspree.io/f/mgaowbkn",
  subject: "New table request – Jim's",
  successMessage: "Thanks! Your request is in. Jim's team will contact you to confirm your table.",
  failureMessage: "Something went wrong — please call us at (718) 555-0142.",
  timeoutMs: 15000,
};

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
    const typing = addMessage("bot", "Jim's is typing…", true);

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

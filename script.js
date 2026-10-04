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
  apiEndpoint: "REPLACE_WITH_WORKER_URL",
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
function initReservationForm() {
  const form = document.getElementById("reserve-form");
  const confirmBox = document.getElementById("reserve-confirm");
  const errorBox = document.getElementById("reserve-error");
  if (!form || !confirmBox || !errorBox) return;

  // Don't allow booking dates in the past.
  const dateInput = form.elements.date;
  const today = new Date();
  const localISO = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
  dateInput.min = localISO;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    errorBox.hidden = true;

    const fields = ["name", "contact", "party", "date", "time"];
    let firstInvalid = null;

    for (const name of fields) {
      const el = form.elements[name];
      const value = el.value.trim();
      let valid = value !== "" && el.checkValidity();

      if (name === "contact" && valid) valid = isPhoneOrEmail(value);

      el.setAttribute("aria-invalid", String(!valid));
      if (!valid && !firstInvalid) firstInvalid = el;
    }

    if (firstInvalid) {
      errorBox.textContent =
        firstInvalid.name === "contact"
          ? "Please enter a valid phone number or email so we can reach you."
          : "Please fill in all the fields so we can save your table.";
      errorBox.hidden = false;
      firstInvalid.focus();
      return;
    }

    const data = {
      name: form.elements.name.value.trim(),
      contact: form.elements.contact.value.trim(),
      party: form.elements.party.value,
      date: form.elements.date.value,
      time: form.elements.time.value,
    };

    // TODO: This does NOT send the reservation anywhere yet. It only shows an
    // on-page confirmation. Hook this up to a real backend / booking service
    // (and only show "confirmed" language once the pub has actually received it).
    showReservationConfirmation(form, confirmBox, data);
  });
}

function isPhoneOrEmail(value) {
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const digits = value.replace(/\D/g, "");
  return email.test(value) || (digits.length >= 7 && digits.length <= 15);
}

function showReservationConfirmation(form, confirmBox, data) {
  const when = formatDateTime(data.date, data.time);
  const partyLabel = data.party === "1" ? "1 person" : `${data.party} people`;

  confirmBox.replaceChildren();

  const h3 = document.createElement("h3");
  h3.textContent = `Thanks, ${data.name.split(" ")[0]}!`;

  const p1 = document.createElement("p");
  p1.textContent = `We've got your request for ${partyLabel} on ${when}.`;

  const p2 = document.createElement("p");
  p2.textContent = `We'll reach out at ${data.contact} to confirm. Need to change something? Give us a ring at ${CHAT_CONFIG.phoneDisplay}.`;

  const again = document.createElement("button");
  again.type = "button";
  again.className = "btn btn-ghost";
  again.textContent = "Make another request";
  again.addEventListener("click", () => {
    form.reset();
    form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
    confirmBox.hidden = true;
    form.hidden = false;
    form.elements.name.focus();
  });

  const p3 = document.createElement("p");
  p3.appendChild(again);

  confirmBox.append(h3, p1, p2, p3);
  form.hidden = true;
  confirmBox.hidden = false;
  confirmBox.setAttribute("tabindex", "-1");
  confirmBox.focus();
}

function formatDateTime(date, time) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const dt = new Date(y, m - 1, d, hh, mm);
  const datePart = dt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const timePart = dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${datePart} at ${timePart}`;
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

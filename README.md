# Jim's — Neighborhood Pub & Wood-Fired Pizza

A one-page landing site for **Jim's**, a (fictional) neighborhood pub in Brooklyn, NY.
Plain HTML/CSS/JS, no frameworks — `index.html` sits at the repo root so GitHub Pages can serve it directly.

**This repo is also a template for other small-business clients.** All business-specific content lives in
`business.json`; the page and the chatbot are both built from it. See **[NEW-CLIENT.md](NEW-CLIENT.md)** for the
step-by-step checklist.

| File | What it is |
|---|---|
| `business.json` | **All business content**: name, text, contact, hours, happy hour, menu, reservations, colors, demo flag |
| `index.html` | The page layout: hero, about, menu, hours/happy hour, reservation form, location, chat widget |
| `styles.css` | All styling (dark wood + amber theme, mobile-first breakpoints) |
| `script.js` | Fills the page from `business.json`, plus the mobile nav, reservation form, and chat widget (`CHAT_CONFIG`) |
| `worker/chat-worker.js` | Cloudflare Worker that proxies chat messages to the Anthropic API (system prompt built from `business.json`) |
| `wrangler.toml` | Worker config (name `jims-pub-chat`, rate-limit binding — no secrets) |

## Reservation form

The form posts to Formspree (`https://formspree.io/f/mgaowbkn`) with `fetch`, so guests stay on the page,
and Formspree emails each request to the pub. It sends `name`, `phone_or_email`, `party_size`, `date`, and `time`
with the subject "New table request – Jim's", plus `_replyto` when the contact is an email address.
A hidden `_gotcha` honeypot field filters out spam bots. Parties larger than `reservations.maxPartySize`
(7 for Jim's, so 8+) are asked to call instead. The endpoint and party size are set in `business.json` → `reservations`.

## Chat widget setup

### 1. Deploy the Worker and add the API key as a secret

```bash
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY   # paste your key when prompted
npx wrangler deploy
```

`ANTHROPIC_API_KEY` **must be stored as a Cloudflare Worker secret** (the command above, or
Cloudflare dashboard → Workers & Pages → `jims-pub-chat` → Settings → Variables and Secrets → type *Secret*).
Never put the key in `wrangler.toml`, `script.js`, or anywhere else in this repo.
For local testing with `npx wrangler dev`, put `ANTHROPIC_API_KEY=...` in a `.dev.vars` file (already git-ignored).

### 2. Point the website at the Worker

In **`script.js`**, set `CHAT_CONFIG.apiEndpoint` to your deployed Worker URL:

```js
const CHAT_CONFIG = {
  apiEndpoint: "https://jims-pub-chat.<your-subdomain>.workers.dev",
  ...
};
```

While it's still `"REPLACE_WITH_WORKER_URL"` (or whenever a request fails), the widget shows a friendly
message asking the customer to call the pub.

If the site is served from anywhere other than `https://dammy576.github.io` (e.g. a custom domain),
add that origin to `ALLOWED_ORIGINS` at the top of `worker/chat-worker.js` — other origins get a 403.

### 3. Updating the bot's knowledge

The bot's facts (menu, prices, hours, happy hour, address, phone…) come from **`business.json`**, which is bundled
into the Worker when it's built — so the bot and the page always agree. After editing `business.json`, run
`npx wrangler deploy` again (or let Cloudflare's Git integration rebuild it) so the bot picks up the changes.
The rules every bot follows (hand-offs to staff, declining off-topic questions, never inventing items or prices)
are in `buildSystemPrompt` in `worker/chat-worker.js`.

### Worker safeguards

- Only origins in `ALLOWED_ORIGINS` are served (403 otherwise); CORS preflight is handled.
- Rate limiting: ~20 messages per IP per 10 minutes (in-memory, best-effort per isolate) plus a
  Cloudflare Rate Limiting binding as a 5-per-minute burst guard (the binding only supports 10s/60s periods).
- User messages over 500 characters are rejected; only the last 10 messages are forwarded.
- Uses `claude-haiku-4-5` with `max_tokens: 400`. Errors come back as clean JSON; upstream errors and the key are never exposed.

## Previewing locally

The page loads `business.json` with `fetch`, so opening `index.html` straight from disk (`file://`) won't work.
Run a tiny local server from the repo root instead, e.g. `python3 -m http.server 8000`, then open http://localhost:8000.

# Jim's — Neighborhood Pub & Wood-Fired Pizza

A one-page landing site for **Jim's**, a (fictional) neighborhood pub in Brooklyn, NY.
Plain HTML/CSS/JS, no frameworks — `index.html` sits at the repo root so GitHub Pages can serve it directly.

| File | What it is |
|---|---|
| `index.html` | The page: hero, about, menu, hours/happy hour, reservation form, location, chat widget |
| `styles.css` | All styling (dark wood + amber theme, mobile-first breakpoints) |
| `script.js` | Mobile nav, reservation form, and the chat widget (`CHAT_CONFIG`) |
| `worker/chat-worker.js` | Cloudflare Worker that proxies chat messages to the Anthropic API |
| `wrangler.toml` | Worker config (name `jims-pub-chat`, rate-limit binding — no secrets) |

## Reservation form

The form posts to Formspree (`https://formspree.io/f/mgaowbkn`) with `fetch`, so guests stay on the page,
and Formspree emails each request to the pub. It sends `name`, `phone_or_email`, `party_size`, `date`, and `time`
with the subject "New table request – Jim's", plus `_replyto` when the contact is an email address.
A hidden `_gotcha` honeypot field filters out spam bots. Parties of 8+ are asked to call instead.
To change the endpoint, edit `RESERVATION_CONFIG` in `script.js`.

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

Everything the bot knows lives in `SYSTEM_PROMPT` in **`worker/chat-worker.js`** (kept server-side, not in the browser).
To change the menu, prices, hours, happy hour, address, or the hand-off rules, edit that prompt and run
`npx wrangler deploy` again. Keep it in sync with `index.html` so the bot and the page always agree.

### Worker safeguards

- Only origins in `ALLOWED_ORIGINS` are served (403 otherwise); CORS preflight is handled.
- Rate limiting: ~20 messages per IP per 10 minutes (in-memory, best-effort per isolate) plus a
  Cloudflare Rate Limiting binding as a 5-per-minute burst guard (the binding only supports 10s/60s periods).
- User messages over 500 characters are rejected; only the last 10 messages are forwarded.
- Uses `claude-haiku-4-5` with `max_tokens: 400`. Errors come back as clean JSON; upstream errors and the key are never exposed.

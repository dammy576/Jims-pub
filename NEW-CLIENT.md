# New client checklist

How to turn this template into a site for a new small-business client. Jim's is the working example —
copy it, then change the values below. Apart from the link-preview tags in step 3, you never need to touch
the HTML or CSS.

## 1. Make a copy

- [ ] Create a new GitHub repo from this one (on GitHub: **Use this template**, or fork it).
- [ ] Turn on GitHub Pages: repo **Settings → Pages → Deploy from a branch → `main` / root**.

## 2. Fill in `business.json` (the main content file)

Everything the visitor sees, and everything the chatbot knows, comes from this one file.

- [ ] **Basics:** `name`, `type` (e.g. "corner cafe"), `knownFor`, `tagline`, `heroEyebrow`, `heroIntro`.
- [ ] **Search/browser tab:** `seo.title` and `seo.description` (then copy them into `index.html` — step 3).
- [ ] **About:** `about.heading`, `about.paragraphs`, and the three `about.highlights` (icon, title, text).
- [ ] **Contact:** `contact.street`, `city`, `region`, `postalCode`, `phone`, `email`, `directions`.
  Write US phone numbers like `(503) 555-0100`; for other countries start with `+` and the country code.
- [ ] **Social links:** fill in `url` for the ones they use. Leave a `url` empty to hide that link.
- [ ] **Hours:** one line per row in `hours.schedule`, plus `hours.note`.
- [ ] **Happy hour:** `happyHour.when`, `deals`, `note`. No happy hour? Delete the whole `happyHour` block.
- [ ] **Menu:**
  - `menu.featured` — the highlighted cards (Jim's pizzas). Add `"badge": "House favorite"` to one item to
    highlight it. Leave `items` empty (`[]`) to hide the section.
  - `menu.food` and `menu.drinks` — groups (e.g. "Beer", "Cocktails"), each with items.
  - Every item has a `name`, a one-line `description` (leave `""` to hide it) and a `price` written how it
    should appear, e.g. `"$12"`.
- [ ] **Reservations:** `reservations.formspreeEndpoint` (see step 4), `maxPartySize` (bigger groups are asked to
  call), the button labels, and `intro`.
- [ ] **Colors:** `theme.background`, `theme.primary` (buttons, prices, headings), `theme.accent` (warm glow,
  error messages). The design is built for a **dark** background; lighter and darker shades are worked out
  automatically.
- [ ] **Demo flag:** `"demo": true` shows the "Demo concept" note in the footer (`demoNote`) — use it for
  pitches. Set it to `false` once the site is real.
- [ ] **Chat text:** `chat.greeting`, `chat.voice` (e.g. "like a friendly barista"), and any `chat.extraFacts`.

Tip: `business.json` must stay valid JSON — keep the quotes and commas, and paste it into a JSON checker
(e.g. jsonlint.com) if the page shows "Sorry, this page couldn't load".

## 3. Update the title and meta tags in index.html to match business.json

When someone texts or shares the link, the preview (name, description) is read straight from the top of
`index.html` — those apps don't run the page's script, so these tags can't come from `business.json`.

- [ ] Open `index.html` and, in the `<head>` at the top, update the title and meta tags to match business.json:
  - `<title>` → `seo.title`
  - `meta name="description"`, `og:description`, `twitter:description` → `seo.description`
  - `og:site_name` → `name`
  - `og:title` and `twitter:title` → `name — tagline` (e.g. `Blue Door Cafe — Coffee, cake & conversation.`)
  - `meta name="theme-color"` → `theme.background`
- [ ] Write `&` as `&amp;` inside `<title>`. In the `content="…"` values, don't use straight double quotes (`"`).
- [ ] Check: open the site, then the browser's developer console. If any of these tags don't match
  `business.json`, the page prints a warning that names the tag.

## 4. Reservation emails (Formspree)

- [ ] Create a free form at [formspree.io](https://formspree.io) using the client's email address.
- [ ] Put its endpoint (looks like `https://formspree.io/f/abcdwxyz`) in `business.json` →
  `reservations.formspreeEndpoint`.
- [ ] Send one test request from the live site and confirm the form in the email Formspree sends.

## 5. Chatbot — only switch it on after the client has paid

Until then, leave the bot off: set `CHAT_CONFIG.apiEndpoint` in `script.js` to `"REPLACE_WITH_WORKER_URL"` and
don't deploy a Worker. The chat bubble then just suggests calling the business. (A copy of Jim's still points
at Jim's bot, so reset it.)

When the client has paid:

- [ ] **`wrangler.toml`** — set `name` to a new Worker name, e.g. `name = "blue-door-chat"`.
  Also give both rate limiters new numbers that no other client uses (e.g. `namespace_id = "1002"` and,
  under `previews`, `"2002"`), so clients don't share rate-limit counters.
- [ ] **`ALLOWED_ORIGINS`** at the top of `worker/chat-worker.js` — the client site's address, with no path
  and no trailing slash, e.g. `"https://blue-door-cafe.com"` or `"https://youraccount.github.io"`.
  (All GitHub Pages sites on one account share the same address, so this list can't tell them apart —
  the separate Worker URL in the next steps is what keeps each site on its own bot.)
- [ ] Deploy the Worker and add the API key as a secret (never put the key in any file):
  ```bash
  npm install
  npx wrangler secret put ANTHROPIC_API_KEY
  npx wrangler deploy
  ```
- [ ] **`CHAT_CONFIG.apiEndpoint`** in `script.js` — the new Worker's URL, e.g.
  `"https://blue-door-chat.<your-subdomain>.workers.dev"`.
- [ ] Open the live site, ask the bot about hours and a menu price, and check the answers match the page.

The bot's rules are the same for every client (it never invents menu items or prices, sends large parties,
private events, complaints and allergy questions to staff by phone, and politely declines unrelated topics).
Whenever `business.json` changes, redeploy the Worker so the bot learns the new details.

## 6. Final check

- [ ] Preview locally with `python3 -m http.server 8000` (opening `index.html` directly won't load
  `business.json`).
- [ ] Check the page on a phone, send a test reservation, and — if the bot is on — ask it a question.
- [ ] Text the link to yourself and check the preview shows the client's name and description.
  (Messaging apps cache previews, so a link shared before the change may keep showing the old one for a while.)

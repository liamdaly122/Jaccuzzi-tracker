# 🛁 Hot Tub Tracker

A free, private web app that takes the stress out of looking after your
**Lay-Z-Spa** (or any hot tub). You tell it what your test strip says, and it
tells you **exactly what chemical to add and how much**. It also keeps a
maintenance calendar and sends **reminders to your phone** so you never forget
to rinse the filter or shock the water again.

- Works on your phone as a web app (add it to your home screen).
- Supports **chlorine or bromine**.
- 100% free to run. No credit card. Ever.
- Your data is saved online, so it's there on any device.

---

## ⭐ What you need to do (about 15 minutes, one time)

You do **not** need to touch any code. You will click through three free
websites and copy a few values between them. That's it. Follow along slowly —
each step tells you exactly what to click.

There are **three free accounts** involved, and you sign into all of them with
your existing **GitHub** account (one click, no new passwords):

1. **GitHub** – stores the app's code (you already have this — it's where this
   file lives).
2. **Supabase** – the free database that remembers your readings and tasks.
3. **Vercel** – the free host that puts the app online at its own web address.

Plus one free phone app (**ntfy**) for notifications.

Think of it like this: **Supabase is the filing cabinet, Vercel is the shop
window, and ntfy is the doorbell.**

---

### 🔑 About the "keys" (read this first — it's the easy bit)

The app needs **6 secret values**. Don't be put off — **you make up 4 of them
yourself** (they're just passwords you invent), and you **copy 2 of them** from
Supabase with a copy button.

You will paste all 6 into **one screen on Vercel** (a simple form). You never
put them in chat, and you never edit any code. Here's the full list so you know
what's coming:

| # | Name | Where it comes from |
|---|------|--------------------|
| 1 | `APP_PASSCODE` | **You invent it.** The password you'll type to open the app. Use a phrase, e.g. `blue-otter-hot-tub-92`. |
| 2 | `CRON_SECRET` | **You invent it.** Just mash the keyboard, e.g. `x7f9q2m4z8k1`. You never type this again. |
| 3 | `SUPABASE_URL` | **Copy** from Supabase (Step A6). |
| 4 | `SUPABASE_SERVICE_ROLE_KEY` | **Copy** from Supabase (Step A6). |
| 5 | `NTFY_TOPIC` | **You invent it.** A private channel name, e.g. `hottub-x7f9q2`. Treat it like a password. |
| 6 | `ICS_FEED_TOKEN` | **You invent it.** Another keyboard mash, e.g. `k3m8p1w5t9`. Protects your calendar link. |
| 7 | `GEMINI_API_KEY` | **Optional.** Only for the 📷 photo-scan button. **Copy** a free key from Google AI Studio (see Part E). Skip it and the button just won't show. |
| 8 | `IOPOOL_API_KEY` | **Optional.** Connects your iopool probe for live pH/ORP/temperature. **Copy** from the iopool app → Settings → bottom of the page (see Part F). |

Keep a note of #1 (`APP_PASSCODE`) and #5 (`NTFY_TOPIC`) — you'll need them on
your phone. The rest you can forget after setup.

> 💡 Tip: open a blank notes file and write your 4 invented values down now, so
> you can paste them in later.

---

## Part A — Set up the database (Supabase) 🗄️

1. Go to **https://supabase.com** and click **Start your project**.
2. Click **Continue with GitHub** and approve. (No new password needed.)
3. Click **New project**.
   - Give it any name (e.g. `hot-tub`).
   - It will ask for a **database password** — click the **Generate** button and
     then **Copy** it and save it in your notes (you likely won't need it, but
     keep it safe).
   - Pick the region closest to you.
   - Click **Create new project** and wait ~2 minutes while it sets up.
4. On the left sidebar, click **SQL Editor** (the icon looks like `</>`), then
   **+ New query**.
5. Open the file **`supabase/schema.sql`** from this project, copy **everything**
   in it, paste it into the big box, and click the green **Run** button
   (bottom-right). You should see **"Success. No rows returned."** 🎉 That built
   all your tables.
6. Now get your two values. On the left sidebar click **Project Settings** (the
   gear) → **API**.
   - **Project URL** — copy it. This is your `SUPABASE_URL` (value #3).
   - Now the key — **read this bit carefully, it's the easiest thing to get
     wrong.** Look for a section called **"Legacy anon, service_role API
     keys"** and open it. Copy the one labelled **`service_role`** (click
     **Reveal** first). That's your `SUPABASE_SERVICE_ROLE_KEY` (value #4).

   > ⚠️ **Do not grab the key on the main API page.** Supabase now shows a
   > *publishable* key there by default, and the `service_role` key lives in
   > that separate **Legacy** section. They look almost identical. If you paste
   > the wrong one, the app appears to work fine — right up until you turn on
   > the database security setting, and then every page says "Almost there — one
   > setup step left". If that happens to you, this is why.

   ⚠️ The `service_role` key is powerful — paste it only into Vercel (next part).
   Don't post it publicly or in chat.

Leave this tab open; you'll copy from it in a moment.

---

## Part B — Put the app online (Vercel) 🚀

1. In a new tab go to **https://vercel.com** and click **Sign Up**.
2. Choose **Continue with GitHub** and approve.
3. Click **Add New… → Project**.
4. Find this repository (**jaccuzzi-tracker**) in the list and click **Import**.
   - If Vercel asks to install its GitHub app / grant access to your repos, say
     yes.
5. Vercel will recognise it's a Next.js app automatically — **don't change any
   build settings**.
6. Before clicking Deploy, open the **Environment Variables** section. Add all
   **6** values from the table above, one at a time (Name on the left, Value on
   the right, then **Add**):
   - `APP_PASSCODE` = *(your invented passcode)*
   - `CRON_SECRET` = *(your invented random string)*
   - `SUPABASE_URL` = *(paste from Supabase)*
   - `SUPABASE_SERVICE_ROLE_KEY` = *(paste from Supabase)*
   - `NTFY_TOPIC` = *(your invented channel name)*
   - `ICS_FEED_TOKEN` = *(your invented random string)*
   - `GEMINI_API_KEY` = *(optional — only if you want the photo-scan button; see
     Part E. You can always add it later.)*
7. Click **Deploy** and wait a minute or two. When it's done you'll get a web
   address like `https://jaccuzzi-tracker-xxxx.vercel.app`. **That's your app!**
   Open it, enter your `APP_PASSCODE`, and you're in.

> **Which branch does Vercel deploy?** Vercel deploys your repository's main
> branch by default. This code was pushed to a branch called
> `claude/jacuzzi-tracker-app-iwotf7`. Easiest fix: ask Claude to **merge it into
> `main`** (or open a pull request and merge it). Alternatively, in Vercel go to
> **Settings → Git → Production Branch** and set it to
> `claude/jacuzzi-tracker-app-iwotf7`. Either works.

### 📲 Add it to your phone's home screen

- **iPhone (Safari):** open the app's address → tap the **Share** icon → **Add to
  Home Screen**.
- **Android (Chrome):** open the address → tap the **⋮** menu → **Add to Home
  screen / Install app**.

Now it behaves like a normal app icon.

---

## Part C — Get reminders on your phone (ntfy) 🔔

This is the genuinely-no-account, no-API-key notification system.

1. Install the free **ntfy** app:
   - iPhone: App Store → search **ntfy**.
   - Android: Google Play or F-Droid → search **ntfy**.
2. Open the app → tap **+** to subscribe to a topic.
3. Type **exactly** the same `NTFY_TOPIC` value you invented (value #5), e.g.
   `hottub-x7f9q2`, and subscribe.
4. Done. Once a day the app checks your water and tasks, and if anything needs
   doing it'll buzz your phone.

> 🔒 Because anyone who knows your topic name could send you messages, keep it
> private and a bit random — that's why we didn't use something guessable like
> `hottub`.

**Want to test it right now?** In the ntfy app you're subscribed; from a
computer you can send yourself a test by visiting your app and it'll notify on
the daily schedule — or just trust it: the daily check runs every morning.

---

## Part D — (Optional) Put it in your normal calendar 📅

If you'd also like the maintenance dates to appear in Google/Apple/Outlook
calendar:

1. Open the app → **Settings** → the **"Add to your phone's calendar"** box.
2. Tap **Copy** to copy your private calendar link.
3. In your calendar app, choose **Subscribe to calendar** (not "import") and
   paste the link:
   - **Google Calendar:** on a computer, Other calendars → **+** → **From URL**.
   - **Apple Calendar:** File → **New Calendar Subscription**.

Calendar apps refresh on their own slow schedule, so treat this as a bonus —
the ntfy notifications are your reliable reminder.

---

## Part E — (Optional) Turn on 📷 photo-scan of the test strip

This lets you **take a photo of your test strip** and have the app fill in the
readings for you (you still check them before saving). It uses Google's free
Gemini AI. No card, no cost — there's a generous free daily limit.

1. Go to **https://aistudio.google.com/apikey** and sign in with your Google
   account.
2. Click **Create API key** → **Create API key in new project** (accept any
   terms). A long key appears — click **Copy**.
3. Go to your **Vercel** project → **Settings → Environment Variables**.
4. Add one more: Name `GEMINI_API_KEY`, Value = *(paste the key)*, then **Save**.
5. Vercel → **Deployments** → open the latest → **⋯ → Redeploy** so the new key
   takes effect.

Now, on the **🧪 Test the water** screen you'll see a **"📷 Scan strip with
camera"** button. Snap the wet strip in good light, wait a moment, and the
numbers pre-fill. **Always double-check each value against the strip before
saving** — especially your sanitizer — because the camera can misread colours.
Left the key out? The button simply doesn't appear and you type readings in as
normal.

> **If the scan ever says the model has no quota or is unavailable:** Google
> occasionally retires older AI models. The app defaults to the
> `gemini-flash-latest` alias, which tracks whichever Flash model is current, so
> this should keep working — but if it ever breaks, it's an easy fix that still
> needs **no card**: just tell me and I'll point it at the current free model.
> (Advanced: you can also pin a specific model with an optional `GEMINI_MODEL`
> env var in Vercel, e.g. `gemini-flash-lite-latest`, and redeploy.)

---

## Part F — (Optional) Connect your iopool probe

If you have an **iopool EcO**, the app can read your water live — no dipping,
no typing.

1. Open the **iopool app** on your phone → **Settings** → scroll to the very
   bottom → copy your **API key**.
2. Go to your **Vercel** project → **Settings → Environment Variables**.
3. Add: Name `IOPOOL_API_KEY`, Value = *(paste the key)*, then **Save**.
4. Vercel → **Deployments** → open the latest → **⋯ → Redeploy**.

You'll then get a **"Live from your probe"** card at the top of the Today
screen showing your current pH, ORP and water temperature, and a **"Read my
iopool probe"** button on the test screen that fills those numbers in for you.

> The probe measures pH, ORP and temperature — **not alkalinity**. So you'll
> still want a test strip for alkalinity every so often. Pop that number in
> alongside the probe reading and you'll get exact chemical doses back.

---

## Turn on weather warnings 🌦️ (no setup, no key)

In the app, open **Settings → "Your location (for weather warnings)"** and type
your town or postcode, then **Save**. The Today screen then shows the next few
days and warns you about **frost** (protect the pump/pipes) or **hot, sunny
spells** (your sanitizer burns off faster). Leave it blank to keep weather off.
This uses a free service with no key needed.

---

## 🧑‍🔧 How to use it day to day

- **Test the water:** tap **🧪 Test**, dip your strip, type in the numbers. The
  app instantly tells you what to add, **in the right order** (alkalinity → pH →
  sanitizer → shock) and **how many grams**. Tap **"Log this as added"** to keep
  a record.
- **Today screen:** shows your latest water status, anything that's due, and a
  **Water freshness** card that works out how often to drain & refill based on
  your tub size and how many people use it (one tap applies it to your
  schedule).
- **Trends (📈 on the Today screen):** line graphs of your pH, alkalinity and
  sanitizer over time, so you can spot the water drifting before it's a problem.
- **Tasks:** tick off jobs like rinsing the filter. The next due date updates
  itself. You can change how often each task repeats.
- **Calendar:** tap any day to see what's scheduled, browse months, and see an
  "upcoming" list of what's next.
- **Something wrong? (🔎):** on the Today screen or Guides page, pick what you're
  seeing — cloudy, foamy, green, smelly, itchy skin — and it lists the likely
  causes and fixes, putting the ones your latest test points at first.
- **Calibration (in Settings):** as you log tests and doses, the app quietly
  learns how *your* tub actually responds and offers a one-tap tweak so future
  dose suggestions get more accurate.
- **Trends:** with an iopool probe connected, the app quietly banks each
  reading it sees, so the sanitiser-strength (ORP) and temperature charts fill
  in on their own — no typing. It keeps six months of history and tidies up
  anything older automatically.
- **Water freshness:** the app weighs how old the water is, how many
  person-soaks it's had, and whether you're using **more sanitiser than you
  were a fortnight ago** — that last one is the water telling you it's tiring,
  usually before the calendar does. It also shows what a refill costs to heat,
  so you change it on the numbers rather than out of habit.
- **Heater protection (Today screen):** every other check looks at one number on
  its own. This one looks at pH, alkalinity, calcium **and water temperature
  together** — because they can each read "in range" while the combination
  quietly furs up your heating element, which is the expensive thing to replace.
  It needs a **calcium hardness** number, which your probe can't measure but
  most 6-in-1 strips can. Enter one every few weeks (calcium barely moves) and
  the card comes alive, with a matching chart on the Trends page.
- **Test strips or a probe:** in Settings you can switch between **ppm** (test
  strips) and **ORP** (a probe such as an iopool, measured in millivolts). ORP
  measures whether your sanitiser is actually *working*, which is the better
  signal. The two can't be converted into one another, so in ORP mode the app
  tells you if the water is sanitising and guides a gradual top-up instead of
  inventing an exact gram figure — enter a ppm alongside it any time you want
  exact doses back.
- **Settings:** switch between chlorine/bromine, choose ppm or ORP, set your
  water volume and how many people use it on an average day, set your location
  for weather warnings, and fine-tune targets if your product label differs.

---

## ⚠️ Important safety note

The chemical amounts are **helpful starting estimates based on common
guidance — not exact science, and not medical advice.** Always:

- **Read your product's label** and follow its dosing.
- **Add chemicals gradually**, run the pump to circulate, wait, then **retest**
  before adding more.
- **Never mix chemicals** together, and add them to the water (not water to
  them).
- If the app shows a **red "do not use the spa" warning**, don't get in until
  you've fixed it and retested.

You are always responsible for what you put in your tub. When in doubt, dose
less and retest.

---

## 🆘 Troubleshooting

- **The app says "one setup step left."** The app can't reach the database.
  Double-check you ran `supabase/schema.sql` (Part A5) and that `SUPABASE_URL`
  and `SUPABASE_SERVICE_ROLE_KEY` are pasted correctly in Vercel (no extra
  spaces). After changing env vars in Vercel, click **Redeploy**.
- **I changed a setting in Vercel but nothing happened.** Env var changes only
  take effect on a new deploy: Vercel → **Deployments** → **⋯** → **Redeploy**.
- **Every page says "Almost there — one setup step left", and it used to
  work.** Almost always the wrong Supabase key. Go to Supabase → Project
  Settings → API → **"Legacy anon, service_role API keys"** and copy the
  **`service_role`** one (not the publishable key on the main page), then
  update `SUPABASE_SERVICE_ROLE_KEY` in Vercel and redeploy. The app needs the
  `service_role` key specifically, because that's the only one allowed past the
  database's Row Level Security.
- **No notifications.** Make sure the topic in the ntfy app matches `NTFY_TOPIC`
  exactly (case-sensitive), and that notifications are allowed for the ntfy app
  in your phone settings. The check runs once each morning.
- **Forgot the passcode.** In Vercel, change `APP_PASSCODE` to something new and
  redeploy. (Changing it logs out all existing sessions.)
- **Supabase paused my project.** The free tier pauses after 7 idle days — but
  this app writes to the database every day automatically, so it should never
  pause. If it ever does, just open your Supabase dashboard and click
  **Restore**.

---

## 🧠 For the curious — how it's built

You don't need any of this to use the app, but in case you're interested:

- **Next.js** (React) app hosted on **Vercel**'s free Hobby plan — the pages and
  the little backend live in one place.
- **Supabase** (a hosted PostgreSQL database) on its free tier for storage.
- The browser never talks to the database directly — all data goes through the
  app's own server code using a secret key, so there are no complicated database
  security rules to manage.
- **Vercel Cron** runs the daily check; **ntfy.sh** delivers the push.
- The chemistry maths and the "when is this due" logic are **pure functions**
  with **40 automated tests** (`npm test`) — the safety-relevant parts are the
  most thoroughly tested.

### Running it on your own computer (optional, for tinkerers)

```bash
npm install
cp .env.example .env.local   # then fill in your 6 values
npm run dev                  # open http://localhost:3000
npm test                     # run the test suite
```

Enjoy your (perfectly balanced) soak! 🫧

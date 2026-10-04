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

Now, on the **Test the water** screen you'll see a **"Scan a strip"**
button. Snap the wet strip in good light, wait a moment, and the
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

You'll then see your live water temperature, pH and chlorine at the top of
**Today** (with the last day's trend on the **Water** tab), and a **"Use my
probe"** button on the test screen that fills those numbers in for you.

> The probe measures pH, ORP and temperature — **not alkalinity**. So you'll
> still want a test strip for alkalinity every so often. Pop that number in
> alongside the probe reading and you'll get exact chemical doses back.

---

## Turn on weather warnings 🌦️ (no setup, no key)

In the app, tap the **settings button** (top right of Today), then **Location**,
type your town or postcode and tap **Save**. The **Heat** tab then shows the next
few days and warns you about **frost** (protect the pump/pipes) or **hot, sunny
spells** (your sanitizer burns off faster). Leave it blank to keep weather off.
This uses a free service with no key needed.

---

## 🧑‍🔧 How to use it day to day

Along the bottom are four tabs and a big **+** in the middle.

- **+ Log** (on every screen): the one button for anything you've just done:
  **test the water**, **log a soak**, **add a chemical** or **mark a job done**.
  Ticking a job off shows an **Undo** for a few seconds in case of a mis-tap.
- **Today:** what to do now, and nothing else. Three numbers at the top (water
  temperature, pH and chlorine), then **one to-do list** in order of importance:
  chemicals to add, when to switch the heater on, anything overdue, then what's
  due today. Each line is short; tap **Why?** for the reasoning. Tick a line to
  do it: a job is saved, a chemical asks how much went in, and the heater line
  just remembers you've switched it on today. **"N more this month"** opens
  what's coming up. If the water isn't safe, a red **"Don't get in yet"** banner
  sits on top and can't be dismissed. The settings button is top right.
- **Test the water** (from Today or **+**): tap **Use my probe** to fill pH and
  ORP, or **Scan a strip** for a photo of the strip, or step each number with
  − and +. **See what to add** saves the test and lists what to add, **numbered
  in the right order** (alkalinity → pH → sanitiser), with a wait between each
  and an **I've added it** button that logs the dose. Then one line says what's
  fine and one says whether the heater is safe. Saving a test also ticks off the
  "Test the water" job.
- **Water:** everything about the water itself.
  - **From your probe:** live temperature, pH and ORP with the last day's trend.
  - **Last strip test:** each reading with OK, Low or High.
  - **Heater protection:** pH, alkalinity, calcium **and temperature judged
    together**, because they can each read "in range" while the combination
    quietly furs up the heating element. It needs a **calcium** reading, which
    the probe can't measure but most 6-in-1 strips can; one every few weeks is
    plenty. Add **stabiliser (CYA)** too if your strip has it: it makes this
    exact, and past ~100 ppm chlorine stops working however much you add, so
    the app tells you plainly it's time to drain and refill.
  - **Water age:** weighs how old the water is, how many person-soaks it's had,
    and whether you're using **more sanitiser than a fortnight ago** (the water
    telling you it's tiring, usually before the calendar does). One tap sets
    your drain-and-refill reminder to match.
  - **Trends:** pH, ORP, alkalinity, chlorine, balance and temperature over
    time. The probe's readings are banked automatically (six months kept).
  - **History:** every test, dose and soak.
- **Heat:** when to switch on, and what it costs.
  - **Your soak:** when you want it ready, how hot, and which days. **Save** it
    and the morning reminder follows it. The temperature saves as soon as you
    change it (up to 40 °C, the tub's maximum).
  - **Today's heat-up:** what time to switch on so it's ready on time, worked
    backwards from the water temperature, the weather and how well your tub
    holds heat. From cold this can be **14 hours or more**, so "I'll put it on
    when I get home" doesn't work. Once the probe has seen a few real heat-ups
    it uses what *your* tub actually manages. Tap **It's on** when you have.
  - **Leave it on instead?** Letting it cool between soaks never costs more
    than keeping it hot; with good covers the saving is small (pence a week)
    and the price is switching on a couple of hours before each soak.
  - **Running costs:** per day, month, year and soak, split into keeping it
    warm, the lid off while you're in, and the filter pump. It all rests on how
    fast the water cools with the covers on, which the app measures from your
    probe (or you can enter your own).
  - **Weather:** the next three days and any frost, heat or heavy-rain warning.
- **Care:** looking after the tub.
  - **Jobs** (or the same as a **Calendar**): each with how much life it has
    left, a **Done** button and how often it repeats (tap to change).
  - **Winter plan:** from about three months out, a countdown to when to shut
    down for the cold months, worked out from where you live, and sooner if
    frost turns up in the forecast. It compares what each option costs. **Pack
    it away** and the app goes quiet until you **Wake it up**. **Leave it
    running** (Freeze Shield) keeps every reminder going, because the water
    still needs looking after.
  - **Guides:** step-by-step drain and refill, winterising and spring wake-up.
    Your ticks are remembered, because these jobs span a weekend.
  - **Something wrong?** Pick what you're seeing (cloudy, foamy, green,
    smelly, itchy skin...) for the likely causes and fixes, with the ones your
    last test points at first.
- **Settings** (top right of Today): chlorine or bromine, test strips (ppm) or a
  probe (ORP), water volume, people per day, location, phone calendar, and
  fine-tuning. ORP measures whether the sanitiser is actually *working*; it
  can't be converted to ppm, so in ORP mode the app guides a gradual top-up
  instead of inventing exact grams (add a strip's ppm to a test for exact
  doses). **Calibration** learns how *your* tub responds to doses and offers a
  one-tap tweak.
- **Fresh water setup** (Settings, or after the drain-and-refill guide): a
  step-by-step flow from a fresh fill to safe water, with the exact doses for
  your tub. It can be finished on probe readings alone.
- **Dark mode** follows your phone's setting.

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

- **Saving a reading fails after an update added a new field.** A new field
  needs a matching column in your database. Go to Supabase → **SQL Editor** →
  **+ New query**, paste the whole of `supabase/schema.sql` again and click
  **Run**. It's safe to re-run as many times as you like — it only ever adds
  what's missing and never touches your existing data.
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

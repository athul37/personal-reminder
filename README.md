# Payments Ahead

A reminder app for monthly bills, yearly insurance premiums, and renewals that only come round every 5–10 years.

Live at **https://athul37.github.io/personal-reminder/** once GitHub Pages is switched on (step 2 below).

- **Use it without an account.** Payments are saved in the browser on that device. Nothing is sent anywhere.
- **Or sign in with Google.** Payments are saved in a private app-data folder in **the user's own Google Drive** (`drive.appdata`). You run no server and hold no one's data.
- **Google Calendar, three ways:**
  1. **Automatic sync** (signed in): the app keeps a "Payments" calendar up to date, with a "Pay:" event on each due date and a "Heads-up:" event before it.
  2. **Add to Google Calendar links** (no account needed): open a payment and tap *Add Due Date to Google Calendar* or *Add Heads-Up*. Google Calendar opens with the event filled in, repeats included.
  3. **Calendar file (.ics)** (no account needed): Settings › Download Calendar File. Import it at calendar.google.com › Settings › Import & Export, or open it in Apple Calendar, Outlook or Samsung Calendar.
- **Installable** to the home screen (Android: Chrome menu › *Add to Home screen*; iPhone: Safari › Share › *Add to Home Screen*).

It's plain HTML/JS with no build step. Every file in this repo is served as-is.

---

## Set it up (about 30 minutes, free)

### 1. Fill in your details

Edit these on GitHub (open the file › pencil icon › edit › *Commit changes*):

| File | Replace |
|---|---|
| `privacy.html` | `[YOUR EMAIL]` (2 places) |
| `terms.html` | `[YOUR EMAIL]` (1 place) |

Name and jurisdiction are already filled in (Athul Shaji; India, courts of Payyanur, Kerala).

Use an email address you're happy to show publicly. Google also requires it.

### 2. Publish with GitHub Pages

1. **Rename the branch to `main`.** Go to <https://github.com/athul37/personal-reminder/branches>, click the pencil next to `claude/brave-archimedes-3iemvs`, and rename it to `main`.
2. **Make the repo public.** Settings › General › *Danger Zone* › Change visibility › Public. Free GitHub Pages only works on public repos. This is safe because the repo holds no secrets: the Google client ID is designed to be public.
   *(To keep the repo private instead, use GitHub Pro, or host on Cloudflare Pages or Netlify, which deploy private repos for free.)*
3. **Switch on Pages.** Settings › Pages › *Build and deployment* › Source: **Deploy from a branch** › Branch: **main**, folder **/ (root)** › Save.
4. Wait 1–2 minutes, then open **https://athul37.github.io/personal-reminder/**. Make sure **Enforce HTTPS** is ticked on the Pages settings screen.

The app already works at this point, **without an account**. The next steps add Google sign-in.

### 3. Create the Google Cloud project

1. Go to <https://console.cloud.google.com/>. Open the project picker (top left) › **New project** › name it `Payments Ahead` › Create. Make sure it's selected.
2. **APIs & Services › Library**: search for and **Enable** both **Google Drive API** and **Google Calendar API**.
3. **Google Auth Platform › Get started** (older consoles: *OAuth consent screen*):
   - App name: `Payments Ahead`. User support email: yours.
   - Audience: **External**.
   - Contact information: your email. Agree to the policy › **Create**.
4. **Branding**:
   - App home page: `https://athul37.github.io/personal-reminder/`
   - Privacy policy: `https://athul37.github.io/personal-reminder/privacy.html`
   - Terms of service: `https://athul37.github.io/personal-reminder/terms.html`
   - Authorised domain: **`athul37.github.io`**. Not `github.io`: every GitHub user shares that, so Google treats each `username.github.io` as its own domain.
   - Save.
5. **Data access › Add or remove scopes**. Tick or paste these four, then *Update* › *Save*:
   - `openid`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/drive.appdata`
   - `https://www.googleapis.com/auth/calendar.app.created`

   Don't add `userinfo.profile`. The app doesn't need your name or photo.
6. **Audience › Test users › Add users**: your Gmail address and anyone else who'll use it (up to 100).

### 4. Create the sign-in client

1. **Google Auth Platform › Clients › Create client** (older consoles: *Credentials › Create credentials › OAuth client ID*).
2. Application type: **Web application**. Name: `Payments Ahead web`.
3. **Authorised JavaScript origins › Add URI**: `https://athul37.github.io`. Use exactly that: `https`, no trailing slash, no `/personal-reminder`.
   Add `http://localhost:8000` only while you test on your computer, and remove it afterwards.
4. **Authorised redirect URIs**: leave empty. **Create**.
5. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`). On GitHub, edit `config.js`, paste it in place of `YOUR_CLIENT_ID.apps.googleusercontent.com`, and commit.
   If Google also shows a *client secret*, ignore it. This app doesn't use one, and it must **never** go in the repo.

### 5. Try it

Open the app › **Sign in with Google**. Because the app is in *Testing*, Google shows "Google hasn't verified this app". That's expected for your own app: click **Continue**. Then Settings › Google Calendar to turn on automatic reminders.

### 6. Opening it to everyone (optional)

For you, family and friends, **stay in Testing**: up to 100 test users, no review needed. To let anyone sign in:

1. **Audience › Publish app**.
2. Google asks for **brand verification**: a working home page and privacy policy on a domain you've proven you own. Prove `athul37.github.io` in [Google Search Console](https://search.google.com/search-console) as a *URL prefix* property, `https://athul37.github.io/`. The verification file must sit at that root, which means creating a second repo named exactly `athul37.github.io` and uploading Google's file there. A custom domain, verified by DNS, is the cleaner option if you go public.
3. When you add the scopes, the console shows whether each one is *non-sensitive*, *sensitive* or *restricted*. `drive.appdata` is non-sensitive. If `calendar.app.created` shows as **sensitive**, Google also asks for a short scope justification and a demo video, usually a few business days. Until that's approved, new users see the unverified-app warning when they turn on calendar sync.

### Testing on your computer

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. For Google sign-in to work there, `http://localhost:8000` must be an Authorised JavaScript origin (step 4).

---

## Security and privacy

**Built in:**

- **No server, no database.** There is nothing central to breach. Data lives on the user's device or in their own Google account, and travels directly between browser and Google over HTTPS.
- **Fewest permissions that work:** email only (no name or photo), one private app folder in Drive (no access to other files), and only calendars the app itself created.
- **Content Security Policy:** only this site's own code and Google's sign-in library can run, and data can only be sent to Google's APIs. Inline scripts, plugins and form posts are blocked.
- **Validated data:** everything loaded from Drive, browser storage or an imported file is type-checked and length-limited, and all text is escaped before display. Script-injection attempts in imported files show up as plain text.
- **Sign-in tokens** live in memory only and expire within an hour. They are never saved.
- **Sign Out** clears this device's copy, the remembered email and the undo history, so nothing carries over to the next person or account.
- **Delete All My Data** (Settings) removes the Drive file and the Payments calendar, clears the device, and revokes the app's Google access.
- **Clickjacking guard:** the app won't run inside another site's frame.
- **Legal pages:** a privacy policy with Google's required Limited Use statement, and terms of use stating that the app reminds but doesn't pay, comes with no warranty, and limits liability.

**Only you can do these:**

1. **Turn on 2-factor authentication** on your GitHub and Google accounts. Anyone who takes over the repo could change the app's code, so this matters most.
2. **Don't publish untrusted code on other repos under `athul37.github.io`.** All your GitHub Pages sites share one browser origin, so they share storage and your Google client's allowed origin.
3. Keep the **Authorised JavaScript origins** list to `https://athul37.github.io` (plus localhost only while testing).
4. **Never commit a client secret** or any other key. The app needs none.
5. Have the privacy policy and terms checked by a lawyer if you open the app to the public at scale. They're a solid starting point, not legal advice.

---

## How the data is stored

- **With Google:** one JSON file, `payments-ahead.json`, in the user's Drive **appDataFolder**. Users don't see it in their Drive file list, and other apps can't read it. A copy is cached in the browser so the app opens instantly. If a save fails (offline, expired session), changes stay on the device and upload on the next successful save.
- **Without an account:** the same data, in the browser only. Clearing browser data deletes it, and Safari can clear it after about a week without a visit unless the app is on the Home Screen. Settings › Export makes a backup. On the first sign-in to a Google account whose Drive is still empty, payments on the device are copied over.

## Known limits

- Google sessions last about an hour. After that the app shows a **Reconnect** button (one tap, no password).
- Payments due on the 29th–31st: Google Calendar skips months without that date for monthly repeats. Use the 28th or earlier for monthly bills.
- Editing a synced "Pay:" event in Google Calendar doesn't change the app. Edit in the app and the calendar follows. Events added with the *Add to Google Calendar* links or the .ics file are one-off copies, so they don't update when the payment changes.
- Two devices editing at the same moment: the last save wins.

## Design

The interface follows Apple's Human Interface Guidelines and Apple's fluid-motion principles (WWDC "Designing Fluid Interfaces"):

- System font on Apple's type scale (17 pt body, 34 pt large title), in rem so the phone's text-size setting scales the whole layout.
- Semantic light and dark colours, with text contrast of at least 4.5:1.
- 44 pt touch targets, an inset grouped list, and a tick circle on each row to mark a payment paid.
- Swipe a row left for Paid and Delete; swipe all the way to mark it paid.
- Bottom sheets with a grabber and Cancel/Add. Drag down to dismiss; the app asks before discarding unsaved changes.
- Interruptible springs that start from the current position and carry the finger's speed.
- Reduce Motion, Reduce Transparency and Increase Contrast are respected. Several levels of Undo (⌘/Ctrl-Z on desktop).

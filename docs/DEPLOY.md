# Deploying Mail Merge as a Google Sheets add-on

Everything here is verified against current Google documentation (checked 2026-10-15).
Steps marked **[you only]** are things nobody else can do for you.

---

## Files

| File | Goes into Apps Script as |
|---|---|
| `code.gs` | Script file `code` |
| `Sidebar.html` | **HTML** file named exactly `Sidebar` — case matters |
| `appsscript.json` | The manifest (Project Settings → *Show "appsscript.json"*) |

Your original scratch copies are in `old/`. The abandoned no-HTML card version is in
`card-addon-unused/` — it is **not** part of this add-on and should not be uploaded.

---

## Step 0 — What you are signing up for

This add-on uses two **restricted** scopes:

- `https://mail.google.com/` — because `GmailApp` (drafts, sending, inbox search) requires it. Every GmailApp method lists only this scope.
- `https://www.googleapis.com/auth/drive.readonly` — for `DriveApp.getFileById` on attachment links.

Restricted scopes mean, for a **public** listing:

- OAuth verification — several weeks, and it cannot even start until brand verification finishes (2–3 business days)
- An **annual** third-party security assessment (CASA). Google charges nothing; the assessor bills you directly and sets their own price.
- Annual **re-verification**
- Plus Marketplace app review on top — "your app listing cannot be approved until your app's OAuth verification is complete"

There is **no small-developer exemption.** The only free pass is internal-only use,
which is why the private path stays available if you change your mind.

### The private/unlisted shortcut is Workspace-only

This is the part that surprises people. From the Marketplace SDK docs, verbatim:

> "You see the App Visibility option if you're using a Google Workspace account
> (an account created by your work or school organization). If you're using a
> consumer account (an account ending with "@gmail.com"), you can only publish publicly."

And Private means: *"Only people within your domain can find and install your app."*

So **if you're on a personal `@gmail.com` account, the no-review private/unlisted
listing is not available to you at all.** Your options become either a full public
listing (verification + CASA) or the developer-add-on route below.

---

## Path A — Get you and your friends using it today (no Marketplace, no verification)

This is the supported way to run an unpublished add-on, and it's what to do first
regardless of what you do about a public listing later.

Google: *"For testing, install unpublished add-ons (also called Developer add-ons).
Share unpublished add-ons with others by sharing the project."*

### A1. Move to a standard Cloud project FIRST

Do this **before** anyone else authorizes. The move is one-way and forces every
existing user to re-authorize.

Apps Script → **Project Settings → Google Cloud Platform (GCP) Project → Change project**,
and enter the **project number**.

Why it matters: the OAuth consent screen lives on that Cloud project, and its
publishing status decides whether your friends get logged out every week (A3).

### A2. Share the project with your friends

Share the Apps Script project with them as **editors**. Per Google: *"In order to
collaborate on a project, you and your collaborators must all have editor access."*
A viewer-only collaborator can run the script but is not documented as able to create
their own deployment — so use editor.

They then open the script, use **Deploy → Test deployments**, and install it.

### A3. The 7-day trap — decide this deliberately

⚠️ **If your OAuth consent screen is in "Testing" status, every friend's authorization
expires after 7 days.** Verbatim:

> "Authorizations by a test user will expire seven days from the time of consent. If your
> OAuth client requests an offline access type and receives a refresh token, that token
> will also expire."

That means re-approving the add-on every single week. Your two options:

| Consent screen | Refresh behaviour | Cost |
|---|---|---|
| **Testing** | Everyone re-authorizes **every 7 days** | You must add each friend as a test user |
| **In production** (press *Publish app*) | Grants persist | Users see *"Google hasn't verified this app"* → Advanced → *Go to … (unsafe)* |

**Press "Publish app" to move to In production.** Verification is only needed to remove
the warning and the cap — not to publish. Test it with yourself first, then one friend,
before rolling it out.

### A4. Know the 100-user cap

> "The user cap applies over the entire lifetime of the project, and it cannot be reset or
> changed."

Publishing unverified gives you **100 authorizing accounts, ever.** Plenty for friends.
Fine to burn it if you later complete verification, since verification removes the cap —
but don't hand the link to strangers.

There is **no same-domain requirement** for this route. Friends on `@gmail.com` work.
Everyone will see the unverified warning, including you.

### If you'd rather skip all of it

**Bind the script to a spreadsheet instead of shipping an add-on.** Share that sheet with
edit access, and `onOpen` gives your friends the Extensions menu automatically. Same OAuth
behaviour, no project sharing, no install step — but the add-on only lives in that one sheet,
and each person sends mail from **their own** account.

---

## Path B — The public Marketplace listing

Everything below is for the public listing you originally wanted. It is the multi-week
path (OAuth verification + annual CASA). Do it *after* Path A is working.

---

## Step 1 — Create a standalone script project **[you only]**

**It must be standalone, not container-bound.** Google: *"An Editor add-on is a standalone
Apps Script project."* A script bound to one spreadsheet can never be published for other people.

1. Go to <https://script.google.com> → **New project**
2. Rename it (this is not the public name)
3. Copy the contents of `code.gs` into the default `Code.gs`
4. **+** next to Files → **HTML** → name it exactly `Sidebar` → paste `Sidebar.html`
5. Delete any leftover `Untitled` files
6. Project Settings → tick **Show "appsscript.json" manifest file in editor**
7. Open `appsscript.json`, replace it entirely with this repo's `appsscript.json`

> **Why the rename matters:** your code calls `createHtmlOutputFromFile('Sidebar')`.
> If the HTML file is called `sidebar`, that call fails.

Do **not** put anything in global scope that touches Sheets, Gmail, Drive or Properties.
A published add-on loads the file for every user who can see it, and a global statement
that needs authorization takes the entire menu down with it. The current `code.gs` keeps
globals to plain constants, which is correct — keep it that way.

---

## Step 2 — Move to a standard Google Cloud project **[you only]**

You cannot publish from Apps Script's default Cloud project.

1. Create a project at <https://console.cloud.google.com>
2. In Apps Script: **Project Settings → Google Cloud Platform (GCP) Project → Change project**
3. Enter the **project number** (not the project ID)

This is a one-way move — a script can't go back to the default project, and all users
will have to re-authorize.

---

## Step 3 — Test it **[you only]**

1. **Deploy → Test deployments**
2. Next to **Select type**, click the ⚙ → **Enable deployment types** → tick **Editor add-on**
3. **Create new test** → choose code version (or *Latest code*)
4. Under **Test document**, pick a spreadsheet → **Insert** → **Save test**
5. **Deploy → Test deployments → Saved Tests → Execute**

The test document opens with the add-on installed. Sharing that document with an editor
shares the test.

> **Installable triggers are not supported in test deployments.** Scheduled sends will
> appear to do nothing here. Test them in a real deployment.

---

## Step 4 — Publish

### 4a. Create a versioned deployment
**Deploy → New deployment → ⚙ → Enable deployment types → Add-on** → Deploy.

Then note **two things separately**:

- **Project script ID** — Project Settings → IDs
- **Version number** — Deploy → Manage deployments → the number under *Configuration*

> **Editor add-ons use the script ID + version, not the deployment ID.** That's the
> opposite of a CardService Workspace add-on, and it's an easy way to get stuck.

### 4b. Enable the Marketplace SDK
In the Cloud console, enable **Google Workspace Marketplace SDK**.
Google's own warning: *"Make sure you enable the Google Workspace Marketplace SDK, not the API."*

### 4c. App Configuration
**APIs & Services → Google Workspace Marketplace SDK → App Configuration**

- **App visibility** — Public / Private / Unlisted
  ⚠️ **Irreversible.** Openly warned: *"Once you choose a visibility option and save the
  App Configuration page, you can't change your selection later."* Choose deliberately.
- **Installation settings** — Individual + Admin Install (default), or Admin Only
- **App Integrations** — pick **"Editor add-on (Docs, Sheets, Slides, Forms)"** and give
  the **script ID and version** from 4a. This selector is how you tell Google this is a
  classic sidebar add-on — not the "Google Workspace add-on" option.
- **OAuth Scopes** — must match the manifest
- **Developer Information** — name, address, website, email

### 4d. Store Listing
**Store Listing** tab. Required:

- Language, **name (≤50 chars, no "Google")**, short description (≤200), detailed description (<16,000), category
- **Icons: 32×32 and 128×128**
- **Banner: 220×140**
- **Screenshots:** at least one, 1280×800 recommended (640×400 or 2560×1600 also accepted), full bleed, square corners
- **Terms of service, Privacy policy, Support** links — all three required

### 4e. OAuth verification
Cloud console → **APIs & Services → OAuth consent screen**. Requires a published homepage,
a privacy policy on the same verified domain, and an English unlisted YouTube demo showing
your consent screen with the OAuth client ID in the address bar.

Scopes must be declared in **three** places and match: the manifest, the OAuth consent
screen, and the Marketplace SDK.

Then **Submit For Review** on the Store Listing tab. Only the publisher can submit.

---

## Gotchas that will bite you

- **`createAddonMenu`, not `createMenu`.** A top-level menu silently relocates under
  Extensions on publish. Review explicitly checks your menu items live under the add-ons tab.
- **`onOpen` and `onInstall` can't touch authorized services.** For a published add-on they
  run with no authorization. Menu building only.
- **Time-driven triggers max out at once per hour** for add-ons. `CONTINUE_DELAY_MS` in
  `code.gs` is anchored to that. Don't "optimize" it down.
- **Desktop only.** Editor add-ons don't run on Android or iOS.
- **Send quota is the real ceiling:** 100/day consumer, 1,500/day Workspace, 2,000/day
  within your domain, 50 recipients per message.
- **The confirmation step is not optional.** Marketplace policy: *"We don't allow
  applications that send messages on behalf of the user without giving the user the
  ability to confirm the content and intended recipients."* The sidebar now shows the
  rendered email and the recipient list, and the send button stays locked until the box
  is ticked. Don't remove that to save a click — it's a rejection.
- **Google trademark.** Don't call it "Gmail Merge" or use Google imagery.
- **Everything in the Store Listing gets read.** A privacy policy pointing at a support
  page is a documented rejection reason.

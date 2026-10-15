# Simple Mail Merge

A mail merge add-on for Google Sheets. Write your email once as a Gmail draft, list your
recipients in a spreadsheet, and send personalised mail to all of them without leaving Sheets.

I built this because I wanted a YAMM-style tool I could actually read and change, and give to
friends without anyone paying a subscription. It's roughly 500 lines of Apps Script plus a
React front end.

## What it does

- Uses a **Gmail draft** as the template, so you write the email in Gmail with normal formatting
  and inline images
- `{{Column Name}}` placeholders, matched case-insensitively against your sheet headers
- Sends from your own Gmail, with an optional send-as alias, sender name, reply-to, CC and BCC
- Writes back a **Merge status** and **Sent at** column, colour-coded per outcome
- Skips rows that already have a status, so pressing send twice is safe
- Optional per-row `Cc`, `Bcc` and `Attachment` columns (Drive links)
- Honours an optional `Unsubscribed` column — any value skips that row
- Checks replies and bounces by searching your own inbox, then marks the rows
- Emails you a summary when a background merge finishes

## What doesn't work yet

Two things worth knowing before you put real addresses in.

**Scheduled sends don't work in a test deployment.** Google's test-deployment sandbox doesn't
run installable triggers, and scheduling is built on them. You'll set a time, it'll look like it
worked, and nothing will fire. ([Google's wording](https://developers.google.com/apps-script/add-ons/how-tos/testing-editor-addons):
*"Installable triggers aren't supported."*) If you need scheduling, use a script bound to your
own spreadsheet instead — normal trigger rules apply there.

**The scopes make a public Marketplace listing slow and expensive.** Reply and bounce tracking
needs `mail.google.com`; Drive attachments need `drive.readonly`. Both are Google *restricted*
scopes, so publishing publicly means OAuth verification (weeks) plus an annual third-party
security assessment you pay an assessor for. Fine for personal or internal use. Painful to open
up. `docs/SHARING.md` lays out every route and what each one costs.

## Layout

```
.
├── src/                    what clasp pushes to Apps Script
│   ├── appsscript.json     manifest — scopes, runtime, timezone
│   ├── code.gs             all server-side logic
│   └── Sidebar.html        classic sidebar UI (fallback)
├── ui/                     React source for the dialog UI
│   ├── src/App.jsx
│   ├── src/styles.css
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── docs/
│   ├── DEPLOY.md           publishing to the Marketplace, step by step
│   ├── SHARING.md          getting it to other people without a listing
│   └── CLOUD-PROJECT.md    the Cloud project move, explained from scratch
└── .clasp.json.example
```

`src/Dialog.html` is **generated** and gitignored. Run the build before `clasp push` or the
dialog won't exist in the Apps Script project.

## Setup

You need Node 18+ and a Google account.

```bash
git clone git@github.com:shivampandey777/simple_mail_merge.git
cd simple_mail_merge

npm install -g @google/clasp
clasp login                       # opens a browser

cp .clasp.json.example .clasp.json
# open .clasp.json and paste your own Apps Script project ID
# (script.google.com → your project → Project Settings → IDs)

cd ui && npm install && npm run build && cd ..
clasp push
```

Then, in the Apps Script editor: **Deploy → Test deployments → ⚙ Enable deployment types →
Editor add-on**, pick a spreadsheet as the test document, and run it.

Open the sheet, go to **Extensions → Simple Mail Merge → Open Simple Mail Merge**.

### Editing the UI

```bash
cd ui
npm run build     # writes src/Dialog.html
npm run watch     # rebuild on save
```

Apps Script serves exactly one HTML file and can't resolve `node_modules`, so Vite inlines
React and the CSS into a single self-contained document. You can't edit the dialog in the
Apps Script web editor — build, then `clasp push`.

`code.gs`, `appsscript.json` and `Sidebar.html` are plain files you can edit either way.

## Setting up a sheet

Row 1 is the header row. You need one column that's the recipient:

| Name | Email | Company | Merge status | Sent at |
|---|---|---|---|---|
| Ada Lovelace | ada@example.com | Analytical Engines | Sent | 2026-10-15 14:02 |
| Alan Turing | alan@example.com | N/A | | |

The only required header is one named `Recipient`, `Email`, `Email Address` or `E-mail`.
`Merge status` and `Sent at` are created automatically on first send. Everything else is
optional and only used if present.

Placeholders in your draft map to headers, so `{{Company}}` pulls from column `Company`.
A placeholder with no matching column stops the send with an error rather than mailing
someone a literal `{{Company}}`.

## How it works

Everything lives in `code.gs`.

A merge runs for up to five minutes in a single pass — deliberately under Apps Script's
six-minute ceiling so it can finish cleanly and report what's left instead of being killed
mid-send. Any rows it didn't reach are simply left with no status, and the next run picks
them up, because rows carrying a status are always skipped.

Reply and bounce detection is two Gmail searches in total, not one per recipient. That
matters more than it sounds: a search costs roughly a second, so a per-row loop would blow
the runtime limit somewhere around 150 recipients and silently stop checking the rest.

There's also an abandoned CardService version of the UI in my working copy, not in this repo.
Worth knowing if you're tempted: Google Workspace add-ons cap every execution at **30 seconds**
and can't read the active spreadsheet at all (*"Google Workspace add-ons don't yet support the
use of document context in editors"*). Editor add-ons like this one get the full six minutes
and real document access. That's the whole reason this is built the way it is.

## Docs

- [`docs/DEPLOY.md`](docs/DEPLOY.md) — getting it into the Marketplace
- [`docs/SHARING.md`](docs/SHARING.md) — sharing without going through review
- [`docs/CLOUD-PROJECT.md`](docs/CLOUD-PROJECT.md) — the Cloud project move, and why it decides
  whether your users re-approve the add-on every week

## License

MIT — see [LICENSE](LICENSE).

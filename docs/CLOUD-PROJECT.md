# The Cloud project move, explained

This is the least obvious step in the whole setup, and it's the one that decides
whether your friends get logged out every week. Read this once and it'll make sense.

---

## What a Google Cloud project actually is

Think of it as a **configuration box** in Google Cloud. It holds things like:

- Which Google APIs are switched on
- Your OAuth credentials (the identity your app uses when it asks for permission)
- The **OAuth consent screen** — the page users see saying *"Simple Mail Merge wants to: read your email"*
- Quotas, and who gets billed

It is **not** your spreadsheet, and it is **not** your Apps Script code. It's the settings box those things sit inside.

---

## Why your script already has one

Every Apps Script project is attached to a Cloud project. If you never created one,
Google silently made a hidden **"default" project** for you the moment you opened the editor.

You cannot see it. You cannot configure it. That's the whole problem.

### What you can't do while you're on the default project

| | Default project | Standard project |
|---|---|---|
| Edit the OAuth consent screen | ❌ | ✅ |
| Choose Testing vs In production | ❌ | ✅ |
| Avoid the 7-day re-approval | ❌ | ✅ |
| Enable the Marketplace SDK | ❌ | ✅ |
| Publish to the Marketplace at all | ❌ | ✅ |
| Pass OAuth verification | ❌ | ✅ |

Google's own words: *"You can't use the default Google Cloud project to publish."*

So the move isn't optional paperwork — it's the difference between a tool you can actually
distribute and a script only you can run.

---

## What "moving" means

You create a real Cloud project in the Cloud console, then tell Apps Script:
*"stop using the hidden default one, use this instead."*

That's it. Your code doesn't move. Your spreadsheet doesn't move. Only the settings box changes.

---

## Read this before you do it

**It is one-way.** A script can never go back to the default project. Getting it wrong
means starting a new script project.

**It invalidates every existing authorization.** Everyone who has already approved the
add-on — including you — has to approve it again. This is why you do it **first**, before
you share anything with friends. Ten minutes of your time now, versus chasing five people
to re-approve later.

**Nothing carries over.** Settings, users, and any Marketplace listing from the old project
do not come with you.

---

## Step by step

### 1. Create the project
1. Go to <https://console.cloud.google.com>
2. Top bar → project selector → **New Project**
3. Name it `Simple Mail Merge` → **Create**
4. Wait for the notification, then make sure the new project is **selected** in the top bar

### 2. Get the project NUMBER — not the project ID

Both appear on the dashboard and they look similar. You need the **number**, which is a
long string of digits.

> ⚠️ Copying the **project ID** (the one with letters and dashes) is the single most
> common mistake here. It will not work and the error won't explain why.

### 3. Point the script at it
1. Open your script at <https://script.google.com>
2. **Project Settings** (the gear icon, left sidebar)
3. Find **Google Cloud Platform (GCP) Project** → click **Change project**
4. Paste the **project number** → **Set project**

### 4. Configure the consent screen

Cloud console → **APIs & Services → OAuth consent screen**.

- **User type: External.** Internal is greyed out for `@gmail.com` accounts — external is
  the only door available to you.
- Fill in app name, your support email, developer contact email
- **Scopes** — add the ones from `appsscript.json` (the Gmail and Drive ones)
- **Test users** — add yourself (only matters while you're in Testing)

### 5. Press "Publish app" ← the important one

This is the button that saves everyone from re-approving weekly.

| Consent screen status | What your users experience |
|---|---|
| **Testing** (the default) | Everyone re-authorizes **every 7 days**. Forever. |
| **In production** (after pressing *Publish app*) | They approve **once**. Done. |

Google's rule for why: *"A Google Cloud Platform project with an OAuth consent screen
configured for an external user type and a publishing status of 'Testing' is issued a
refresh token expiring in 7 days."*

Note the precondition — **"publishing status of Testing."** Move off Testing and the rule
simply no longer applies.

**Publishing does not require verification.** Verification is a separate, much later
process that only removes the warning screen and the 100-user limit. You can publish
today, unverified.

### 6. What users see the first time

Because the app is published but unverified, each person (you included) sees:

> **Google hasn't verified this app**
> → click **Advanced** → **Go to Simple Mail Merge (unsafe)**

That looks alarming, and it's genuinely worth explaining to your friends before they hit
it. It appears because Google hasn't reviewed the app — not because anything is wrong.
It happens **once per person**, then never again.

---

## The 100-user limit

Publishing unverified gives you **100 authorizing accounts, ever**. Google:

> "The user cap applies over the entire lifetime of the project, and it cannot be reset or changed."

For you and a handful of friends that's plenty. Just don't post the install link publicly —
each stranger who authorizes permanently burns one of the hundred.

Completing verification later removes the cap completely, so spending it now costs you
nothing if you go public eventually.

---

## Checklist, in order

- [ ] Create the Cloud project
- [ ] Copy the project **number** (digits, not the ID)
- [ ] Point the script at it: Project Settings → Change project
- [ ] Configure the OAuth consent screen (External)
- [ ] Add the Gmail + Drive scopes
- [ ] Press **Publish app**
- [ ] Re-approve it yourself, clicking through the unverified warning
- [ ] *Only now* share it with friends

---

## If something goes wrong

**"This project is not associated with a Google Cloud organization"** — normal for personal
accounts. Ignore it.

**The Change project button is greyed out** — you need edit access to the script, which
you have as its owner. If it persists, you're probably looking at a script created by a
different Google account than the one you logged into clasp with.

**Friends get logged out after a week** — the consent screen is still in Testing. Go back
to step 5 and press Publish app.

**"Access blocked: authorization error"** — the scopes on the consent screen don't match
the manifest. They must be listed in both places.

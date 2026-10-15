# Sharing Simple Mail Merge with other people

You're on a personal `@gmail.com` account. That one fact decides almost everything
here, because Google says:

> "If you're using a consumer account (an account ending with '@gmail.com'),
> you can only publish publicly."

So the private/unlisted Marketplace listing — the one that publishes instantly with
no review — **is not available to you.** That leaves the routes below.

---

## Route A — Share the Apps Script project *(works today, no review)*

This is Google's supported way to distribute an unpublished add-on:

> "For testing, install unpublished add-ons (also called Developer add-ons).
> Share unpublished add-ons with others by sharing the project."

### Steps

1. Open your script at <https://script.google.com> (your own project — the one you
   pushed to with `clasp push`)
2. **Share** (top-right) → add each friend's Google address → set **Editor** → Send
3. Share the **test spreadsheet** with them too, as **Editor**
4. Each friend opens the script → **Deploy → Test deployments → Execute**

A viewer-only share is not enough — Google documents viewers as able to run the script
but not create deployments, so use **Editor**.

### What each friend sees the first time

> **Google hasn't verified this app** → **Advanced** → **Go to Simple Mail Merge (unsafe)**

That's expected. It appears because Google hasn't reviewed the app, not because
anything is wrong. It happens once per person. **Warn them before they hit it** —
it looks alarming and some people will stop there.

### What breaks on this route

| Feature | Works? | Why |
|---|---|---|
| Send merge | ✅ | |
| Reply & bounce tracking | ✅ | |
| Send test to myself | ✅ | |
| **Scheduled send** | ❌ | Test deployments don't support installable triggers |
| Delivery to >100 people | ❌ | 100 authorization cap |

**The scheduling limitation is the big one.** It's not fixable in code — Google's
test-deployment sandbox doesn't run triggers at all. Scheduling only becomes available
once you have a *real* deployment, which means the Marketplace, which for a `@gmail.com`
account means full OAuth verification.

### Two more things to know

**The 100-user cap.** Every friend who authorizes permanently consumes one of 100
authorizations for the lifetime of your Cloud project:
> "The user cap applies over the entire lifetime of the project, and it cannot be reset or changed."

Don't post the link publicly. And **publish the OAuth consent screen to production**
(see `CLOUD-PROJECT.md`) or everyone re-approves weekly.

**Their mail, their account.** Each friend authorizes on their own Google account and
mail sends from *their* Gmail, not yours. Their spreadsheets, their drafts, their quota.

---

## Route B — Each person copies it *(most independent)*

Each friend logs in with their own account, creates their own Apps Script project, and
you give them the three files; they paste them in and deploy their own test.

**Upside:** each person owns their own project, so no shared 100-user cap, no dependence
on your account, and nobody can break anyone else's setup.

**Downside:** no updates. Fix a bug and you have to send everyone the new files. And
scheduling still doesn't work, because it's still a test deployment.

Reasonable for 2–3 technical friends. Painful beyond that.

---

## Route C — Public Marketplace listing *(weeks, and it costs money)*

The only route where **everything works**, including scheduling, for everyone.

Requires OAuth verification for the restricted scopes (`mail.google.com`, `drive.readonly`):

- Brand verification first — 2–3 business days
- Restricted-scope verification — Google quotes ~6 weeks
- An **annual** third-party security assessment (CASA). Google charges nothing; an
  independent assessor bills you directly and sets their own price
- Annual **re-verification**
- Marketplace app review on top — and your listing can't be approved until OAuth
  verification completes

Plus the listing assets: domain, privacy policy, terms, support URL, a 32×32 and 128×128
icon, a 220×140 banner, screenshots, and an English YouTube demo video showing your
consent screen with the OAuth client ID in the address bar.

There is no small-developer exemption from the security assessment.

---

## If your friends are on a company Workspace domain

Everything changes, and for the better. A **Private** listing on a Workspace account:

- Publishes **immediately**, no Google review
- No unverified warning
- No 100-user cap
- No 7-day re-authorization
- **Scheduling works**, because it's a real deployment

The catch: only people inside that Workspace domain can use it. Your `@gmail.com`
friends could not.

So if you have access to a Workspace account, that is by far the best route for
colleagues — and Route A remains your option for outside friends.

---

## What I'd actually do

1. **Today:** Route A with two or three friends, telling them about the warning screen
   and that scheduling isn't available yet.
2. **For yourself:** don't wait on the add-on for scheduling. If you want scheduled
   sends *now*, the reliable way is a script bound to your own spreadsheet — normal
   trigger rules apply there, no add-on restrictions.
3. **If you want everyone to have everything:** Route C. Start the OAuth verification
   in the background; it's the long pole and nothing else unblocks scheduling for
   `@gmail.com` users.

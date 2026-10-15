# Why it's built this way

Most of this project's shape comes from platform limits rather than preference. If you're
about to change something structural, read this first — several of the constraints are not
obvious and the code looks odd without them.

## It's an Editor add-on, not a Workspace add-on

Google has two unrelated add-on frameworks with confusingly similar names. This is the older
one: an Apps Script project with an HTML interface.

The newer **Google Workspace add-on** framework (CardService, no HTML) looks like the modern
choice and isn't usable here, for two reasons:

> "Google Workspace add-ons don't yet support the use of document context in editors."
>
> "you can't use methods such as `SpreadsheetApp.getActiveSpreadsheet()` to acquire the current document."

A mail merge that can't read the active spreadsheet is a non-starter. And the runtime budget:

> "Google Workspace add-on runtime | 30 sec / execution"

Thirty seconds gets you roughly forty emails. Editor add-ons get the ordinary six-minute
Script runtime, which is the difference between a tool and a toy.

There is a workaround for the document problem — `requestFileScopeForActiveDocument()` plus a
file-scope trigger — but nothing works around the thirty seconds. There's an abandoned
CardService version of this UI in the author's working copy, which is where it should stay.

## One pass, five minutes

`runMerge_` loops until it has sent everything **or** five minutes have elapsed, whichever
comes first. Apps Script kills a script at six minutes, so stopping at five means it gets to
finish tidily, write its results, and tell you what's left rather than being killed mid-send
with no output.

Interrupted merges are resumable by design, not by a resume feature: every row gets a status
written to the sheet, and rows that already carry one are skipped. Pressing send again simply
picks up where it stopped. This is also why pressing send twice is safe.

## Status lives in the sheet

There's no separate job store, no database, no `PropertiesService` bookkeeping for the merge
itself. The spreadsheet *is* the state — `Merge status` and `Sent at` columns are written per
row as it goes.

That makes the whole thing inspectable: you can look at the sheet and know exactly what
happened, correct a row by hand, or clear a status to re-send it. It also survives everything,
because it's just cells.

Rows marked `ERROR` are deliberately *not* retried on the next run. Without that, a row that
fails permanently would be retried on every send forever. Clear the cell to retry it.

## Reply and bounce detection is two searches, not N+1

`checkRepliesAndBounces` does exactly two Gmail searches regardless of how many recipients
there are: one for mailer-daemon/postmaster threads, one for everything since the earliest
send. It then matches addresses locally against a set.

The obvious implementation — search per recipient — costs about a second per search. Against
a five-minute budget that fails somewhere around 150 recipients, and fails *silently*: the
rows it never reached just stay unmarked and look like nobody replied. That bug was in here
for a while.

## The React bundle is inlined

Apps Script serves one HTML document per view and has no module resolution — no
`node_modules`, no bare imports. `vite-plugin-singlefile` inlines React, the CSS and
everything else into one self-contained file with zero external references. CI enforces that
last part, because a stray CDN link produces a dialog that renders blank with no error
anywhere, and that's a horrible thing to debug backwards from a screenshot.

The cost is real: you can't edit the dialog in the Apps Script web editor. Change
`ui/src/App.jsx`, run `npm run build`, then `clasp push`.

## Scheduled sends are blocked, and it isn't the code's fault

Scheduling uses an installable time-driven trigger. Google's test-deployment sandbox:

> "Installable triggers aren't supported."
>
> "Functionality that depends on installable triggers isn't testable."

So in a test deployment — which is how you run an unpublished add-on — scheduling will
appear to accept your time and then never fire. On top of that, published add-ons can't run
time-driven triggers more than once an hour.

`CONTINUE_DELAY_MS` is set to exactly one hour for that reason. Don't lower it.

## Scopes are deliberately not minimal

Two restricted scopes are in use: `mail.google.com` (reply/bounce tracking reads the inbox)
and `drive.readonly` (attachments by Drive link). Both force OAuth verification and an annual
security assessment if you ever publish publicly.

Keeping them is a deliberate trade — the features are worth more than public distribution is,
for this project. Dropping them would mean no reply tracking and no Drive attachments.

One scope that looks redundant and isn't: `script.send_mail`. `GmailApp` needs
`mail.google.com`, but `MailApp` — used for `getRemainingDailyQuota()` — needs its own
`script.send_mail`. Removing it as "duplicate" takes out the sidebar data, the merge loop,
the test send and the scheduled send all at once, with an error that doesn't mention scopes.

import { useEffect, useRef, useState } from 'react';

/* google.script.run predates promises; wrap it once and forget about it. */
const call = (fn, ...args) =>
  new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler(resolve)
      .withFailureHandler((e) => reject(new Error(e && e.message ? e.message : String(e))))
      [fn](...args);
  });

const fmtTime = (ms) => new Date(ms).toLocaleString();

export default function App() {
  const [data, setData] = useState(null);
  const [step, setStep] = useState('loading'); // loading | setup | review | sending | done
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);

  const [settings, setSettings] = useState({
    subject: '', fromName: '', alias: '', replyTo: '', cc: '', bcc: '', delaySec: 0,
  });
  const [preview, setPreview] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [when, setWhen] = useState('');

  const poll = useRef(null);

  useEffect(() => {
    load();
    return () => clearInterval(poll.current);
  }, []);

  async function load() {
    try {
      const d = await call('getSidebarData');
      setData(d);
      setSettings((s) => ({ ...s, subject: s.subject || (d.drafts[0] || '') }));
      setStep('setup');
    } catch (e) {
      setError(e.message);
      setStep('setup');
    }
  }

  const set = (k) => (e) => {
    const v = e && e.target ? e.target.value : e;
    setSettings((s) => ({ ...s, [k]: v }));
    setConfirmed(false);
    setPreview(null);
    setNote(null);
    if (step !== 'setup') setStep('setup');
  };

  /* ---------------- review ---------------- */

  async function review() {
    if (!settings.subject) return setError('Choose a Gmail draft to use as the template.');
    setError(null); setNote(null); setBusy(true);
    try {
      const p = await call('previewMerge', settings);
      setPreview(p);
      setConfirmed(false);
      setStep('review');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  /* ---------------- send ---------------- */

  async function send() {
    setError(null); setNote(null);
    setStep('sending');
    setProgress(null);
    poll.current = setInterval(() => {
      google.script.run.withSuccessHandler((p) => p && setProgress(p)).getProgress();
    }, 2000);
    try {
      const r = await call('sendMerge', settings);
      setResult(r);
      setStep('done');
    } catch (e) {
      setError(e.message);
      setStep('review');
    } finally {
      clearInterval(poll.current);
      setProgress(null);
    }
  }

  async function testSend() {
    setError(null); setNote(null); setBusy(true);
    try {
      const self = await call('sendTest', settings);
      setNote('Test email sent to ' + self + '. Check your inbox.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function schedule() {
    if (!when) return setError('Pick a date and time first.');
    setError(null); setNote(null); setBusy(true);
    try {
      const ms = new Date(when).getTime();
      const msg = await call('scheduleMerge', settings, ms);
      setNote(msg);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function checkTracking() {
    setError(null); setNote(null); setBusy(true);
    try {
      const r = await call('checkRepliesAndBounces');
      setResult(r);
      setStep('done');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelSchedule() {
    setError(null); setNote(null); setBusy(true);
    try {
      await call('cancelScheduled');
      setNote('Scheduled send cancelled.');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  /* ---------------- views ---------------- */

  if (step === 'loading') {
    return (
      <div className="app">
        <div className="center"><div className="spinner" />Loading your sheet…</div>
      </div>
    );
  }

  const stats = (data && data.stats) || { sent: 0, replied: 0, bounced: 0, invalid: 0, errors: 0 };

  return (
    <div className="app">
      <div className="head">
        <h1>Simple Mail Merge</h1>
        {data && <span className="sheet">{data.sheet}</span>}
      </div>

      {error && <div className="msg err">{error}</div>}
      {note && <div className="msg ok">{note}</div>}

      {step === 'setup' && data && (
        <Setup
          data={data} settings={settings} set={set} busy={busy}
          onReview={review} onTest={testSend}
          onCheck={checkTracking} onCancel={cancelSchedule}
        />
      )}

      {step === 'review' && preview && (
        <Review
          preview={preview} settings={settings} set={set}
          confirmed={confirmed} setConfirmed={setConfirmed}
          onBack={() => setStep('setup')} onSend={send} onTest={testSend}
          onSchedule={schedule} when={when} setWhen={setWhen} busy={busy}
        />
      )}

      {step === 'sending' && (
        <Sending progress={progress} total={preview ? preview.pending : 0} />
      )}

      {step === 'done' && result && (
        <Done result={result} stats={stats} onAgain={load} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- setup -- */

function Setup({ data, settings, set, busy, onReview, onTest, onCheck, onCancel }) {
  const noDrafts = data.drafts.length === 0;

  return (
    <>
      <div className="status">
        <span className="pill"><b>{data.rows}</b> rows</span>
        <span className="pill"><b>{data.quota}</b> sends left today</span>
        <span className="pill">Sent <b>{data.stats.sent}</b></span>
        <span className="pill">Replied <b>{data.stats.replied}</b></span>
        <span className="pill">Bounced <b>{data.stats.bounced}</b></span>
        {data.scheduledAt && (
          <span className="pill">Scheduled <b>{fmtTime(data.scheduledAt)}</b></span>
        )}
      </div>

      <div className="section">
        <div className="label">Template</div>
        {noDrafts ? (
          <div className="msg err">
            No Gmail drafts found. Write your email in Gmail, save it as a draft, then reopen
            this window.
          </div>
        ) : (
          <div className="field">
            <label htmlFor="draft">Gmail draft</label>
            <select id="draft" value={settings.subject} onChange={set('subject')}>
              {data.drafts.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="hint">
              Use placeholders like <code>{'{{Name}}'}</code>. Available columns:{' '}
              {data.headers.join(' · ') || '—'}
            </div>
          </div>
        )}
      </div>

      <details className="adv">
        <summary>Advanced options</summary>
        <div className="body">
          <div className="grid2">
            <div className="field">
              <label htmlFor="fromName">Sender name</label>
              <input id="fromName" type="text" placeholder="Optional"
                     value={settings.fromName} onChange={set('fromName')} />
            </div>
            <div className="field">
              <label htmlFor="alias">Send as</label>
              <select id="alias" value={settings.alias} onChange={set('alias')}>
                <option value="">Default address</option>
                {data.aliases.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="replyTo">Reply-to</label>
            <input id="replyTo" type="text" placeholder="Optional"
                   value={settings.replyTo} onChange={set('replyTo')} />
          </div>
          <div className="grid2">
            <div className="field">
              <label htmlFor="cc">CC</label>
              <input id="cc" type="text" placeholder="a@x.com, b@x.com"
                     value={settings.cc} onChange={set('cc')} />
            </div>
            <div className="field">
              <label htmlFor="bcc">BCC</label>
              <input id="bcc" type="text" placeholder="Optional"
                     value={settings.bcc} onChange={set('bcc')} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="delaySec">Delay between emails (seconds)</label>
            <input id="delaySec" type="number" min="0" max="10"
                   value={settings.delaySec} onChange={set('delaySec')} />
            <div className="hint">
              Optional columns also honoured: <b>Cc</b>, <b>Bcc</b>, <b>Attachment</b> (Drive
              links), <b>Unsubscribed</b> (any value skips that row).
            </div>
          </div>
        </div>
      </details>

      <div className="btn-row">
        <button className="btn-primary" disabled={busy || noDrafts} onClick={onReview}>
          Review recipients &amp; content
        </button>
        <button className="btn-outline" disabled={busy || noDrafts} onClick={onTest}>
          Send test to myself
        </button>
        <span className="spacer" />
        <button className="link" disabled={busy} onClick={onCheck}>Check replies &amp; bounces</button>
        {data.scheduledAt && (
          <button className="link" disabled={busy} onClick={onCancel}>Cancel scheduled send</button>
        )}
      </div>
    </>
  );
}

/* --------------------------------------------------------------- review -- */

function Review({
  preview, settings, set, confirmed, setConfirmed,
  onBack, onSend, onTest, onSchedule, when, setWhen, busy,
}) {
  const n = preview.pending;

  return (
    <>
      <div className="summary">
        <div><span className="dot">●</span><span><b>{n}</b> email{n === 1 ? '' : 's'} will be sent.</span></div>
        {preview.alreadyDone > 0 && (
          <div><span className="dot">●</span><span>{preview.alreadyDone} row(s) already have a status and will be skipped.</span></div>
        )}
        {preview.unsubscribed > 0 && (
          <div><span className="dot">●</span><span>{preview.unsubscribed} row(s) skipped as unsubscribed.</span></div>
        )}
        {preview.invalidCount > 0 && (
          <div><span className="dot warn-text">●</span><span className="warn-text">
            {preview.invalidCount} row(s) have an invalid address and will be marked INVALID EMAIL.
          </span></div>
        )}
        {preview.attachments.length > 0 && (
          <div><span className="dot">●</span><span>Attached to every email: {preview.attachments.join(', ')}</span></div>
        )}
        {preview.pending > preview.quota && (
          <div><span className="dot warn-text">●</span><span className="warn-text">
            More than your remaining daily quota ({preview.quota}) — the rest will be left for tomorrow.
          </span></div>
        )}
      </div>

      {preview.sample ? (
        <div className="section">
          <div className="label">First email — exactly as it will read</div>
          <div className="preview-box">
            <div className="preview-subject">{preview.sample.subject}</div>
            <pre className="preview-body">{preview.sample.body}</pre>
          </div>
        </div>
      ) : (
        <div className="msg err">No rows are ready to send.</div>
      )}

      <div className="section">
        <div className="label">Recipients ({n})</div>
        <div className="chips">
          {preview.recipients.map((r) => <span className="chip" key={r}>{r}</span>)}
          {preview.moreRecipients > 0 && (
            <span className="chip more">…and {preview.moreRecipients} more</span>
          )}
        </div>
      </div>

      {preview.invalid.length > 0 && (
        <div className="section">
          <div className="label">Will not be sent</div>
          <div className="chips">
            {preview.invalid.map((x) => (
              <span className="chip" key={x.row}>Row {x.row}: {x.to}</span>
            ))}
          </div>
        </div>
      )}

      <label className="confirm">
        <input type="checkbox" checked={confirmed}
               onChange={(e) => setConfirmed(e.target.checked)} disabled={n === 0} />
        <span>I have checked the content above and the recipients who will receive it.</span>
      </label>

      <div className="btn-row">
        <button className="btn-primary" disabled={!confirmed || n === 0 || busy} onClick={onSend}>
          Send {n} email{n === 1 ? '' : 's'} now
        </button>
        <button className="btn-outline" disabled={busy} onClick={onTest}>Send test</button>
        <span className="spacer" />
        <button className="link" disabled={busy} onClick={onBack}>Back to settings</button>
      </div>

      <details className="adv" style={{ marginTop: 18 }}>
        <summary>Or schedule this send</summary>
        <div className="body">
          <div className="field">
            <label htmlFor="when">Send at</label>
            <input id="when" type="datetime-local" value={when}
                   onChange={(e) => setWhen(e.target.value)} />
            <div className="hint">
              Scheduled merges run in the background and email you a summary when they finish.
            </div>
          </div>
          <button className="btn-outline" disabled={busy || !when} onClick={onSchedule}>
            Schedule send
          </button>
        </div>
      </details>
    </>
  );
}

/* -------------------------------------------------------------- sending -- */

function Sending({ progress, total }) {
  const done = progress ? progress.done : 0;
  const all = progress ? progress.total : total;
  const pct = all ? Math.round((done / all) * 100) : 0;

  return (
    <div className="section" style={{ marginTop: 28 }}>
      <div className="label">Sending</div>
      <div className="big-num">{done} <span style={{ fontSize: 18, color: 'var(--muted)' }}>of {all}</span></div>
      <div className="bar"><i style={{ width: pct + '%' }} /></div>
      <div className="hint" style={{ color: 'var(--muted)', fontSize: 13 }}>
        Keep this window open. Don’t close the spreadsheet.
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- done -- */

function Done({ result, stats, onAgain }) {
  const isTracking = result.checked !== undefined;

  if (isTracking) {
    return (
      <>
        <div className="section" style={{ marginTop: 18 }}>
          <div className="label">Replies &amp; bounces</div>
          {result.checked === 0 ? (
            <div className="hint">No rows marked “Sent” with a send time to check yet.</div>
          ) : (
            <div className="summary">
              <div><span className="dot">●</span><span>Checked <b>{result.checked}</b> sent email(s)</span></div>
              <div><span className="dot">●</span><span>New replies: <b>{result.newReplied}</b></span></div>
              <div><span className="dot">●</span><span>New bounces: <b>{result.newBounced}</b></span></div>
            </div>
          )}
        </div>
        <div className="status">
          <span className="pill">Replied <b>{result.replied}</b></span>
          <span className="pill">Bounced <b>{result.bounced}</b></span>
        </div>
        <div className="btn-row"><button className="btn-outline" onClick={onAgain}>Done</button></div>
      </>
    );
  }

  const problems = result.problems || [];
  const clean = !result.errors && !result.invalid && !result.remaining;

  return (
    <>
      <div className="msg ok" style={{ marginTop: 18 }}>
        Sent <b>{result.sent}</b> email{result.sent === 1 ? '' : 's'}.
      </div>

      <div className="status">
        <span className="pill">Errors <b>{result.errors}</b></span>
        <span className="pill">Invalid <b>{result.invalid || 0}</b></span>
        <span className="pill">Skipped <b>{result.skipped}</b></span>
        <span className="pill">Total sent <b>{stats.sent}</b></span>
      </div>

      {result.remaining > 0 && (
        <div className="msg err">
          {result.remaining} row(s) were not processed — the run hit the time or quota limit.
          Review and send again to continue.
        </div>
      )}

      {problems.length > 0 && (
        <details className="adv" open>
          <summary>Problems ({problems.length})</summary>
          <div className="body">
            <div className="chips">
              {problems.map((p) => <span className="chip" key={p}>{p}</span>)}
            </div>
          </div>
        </details>
      )}

      <div className="btn-row">
        <button className="btn-outline" onClick={onAgain}>
          {clean ? 'Done' : 'Back to settings'}
        </button>
      </div>
    </>
  );
}

import { useState } from 'react'
import { KSB_STATUS_LABELS } from '../burrowCodes'

// A KSB's full wording, cut to two lines. Hovering shows it all (title);
// tapping or clicking opens it out, which is how it works on a phone.
export function KsbText({ text }) {
  const [open, setOpen] = useState(false)
  return (
    <button
      type="button"
      className={open ? 'burrow-ksb-text is-open' : 'burrow-ksb-text'}
      title={open ? undefined : text}
      aria-expanded={open}
      onClick={() => setOpen((o) => !o)}
    >
      {text}
    </button>
  )
}

export function KsbChip({ status }) {
  return <span className={`burrow-chip burrow-chip-${status}`}>{KSB_STATUS_LABELS[status]}</span>
}

// The four-colour stacked bar, one segment per status that has any KSBs.
export function StatusBar({ counts, total, thin = false }) {
  const order = ['signed_off', 'awaiting_review', 'needs_changes', 'not_started']
  return (
    <div
      className={thin ? 'burrow-bar is-thin' : 'burrow-bar'}
      role="img"
      aria-label={order.map((s) => `${counts[s]} ${KSB_STATUS_LABELS[s].toLowerCase()}`).join(', ')}
    >
      {order
        .filter((s) => counts[s] > 0)
        .map((s) => (
          <span key={s} className={`burrow-bar-${s}`} style={{ flexGrow: counts[s] }} />
        ))}
      {total === 0 && <span className="burrow-bar-not_started" style={{ flexGrow: 1 }} />}
    </div>
  )
}

export function NotLoaded() {
  return (
    <div className="burrow-not-loaded" role="note">
      <strong>Your standard&apos;s KSBs aren&apos;t loaded yet.</strong>
      <span>
        They&apos;ll appear here once they&apos;ve been imported from Skills England. You can still save evidence as a
        draft and add the KSBs later.
      </span>
    </div>
  )
}

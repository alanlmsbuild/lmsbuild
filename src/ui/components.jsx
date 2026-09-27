// Shared components for Warren and Burrow. New screens are built from
// these, and they're styled only through the --ui-* tokens in tokens.css,
// so a design change is a change of token values.
import { useId } from 'react'
import './tokens.css'
import './components.css'

export function Heading({ level = 2, className = '', children }) {
  const Tag = `h${level}`
  return <Tag className={`ui-heading ${className}`.trim()}>{children}</Tag>
}

// variant: 'primary' | 'secondary' | 'link'
export function Button({ variant = 'primary', type = 'button', className = '', ...props }) {
  return <button type={type} className={`ui-button ui-button--${variant} ${className}`.trim()} {...props} />
}

export function Card({ title, titleLevel = 2, meta, as: Tag = 'section', className = '', children, ...props }) {
  return (
    <Tag className={`ui-card ${className}`.trim()} {...props}>
      {(title || meta) && (
        <div className="ui-card-head">
          {title && <Heading level={titleLevel}>{title}</Heading>}
          {meta && <span className="ui-card-meta">{meta}</span>}
        </div>
      )}
      {children}
    </Tag>
  )
}

// A status always shows its word as well as its colour.
// tone: 'done' | 'due' | 'overdue' | 'neutral'
export function StatusBadge({ tone = 'neutral', children }) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>
}

// tone: 'info' | 'success' | 'error'. Errors are announced straight away.
export function Notice({ tone = 'info', children }) {
  return (
    <p className={`ui-notice ui-notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  )
}

// A labelled form control with an optional hint and error. The control is
// passed as a function of its id, so the label and messages are tied to it.
export function Field({ label, hint, error, children }) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className="ui-field">
      <label htmlFor={id}>{label}</label>
      {hint && (
        <span id={hintId} className="ui-field-hint">
          {hint}
        </span>
      )}
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error && (
        <span id={errorId} className="ui-field-error">
          {error}
        </span>
      )}
    </div>
  )
}

// A set of radio buttons with one legend.
export function Choices({ legend, name, options, value, onChange, error }) {
  return (
    <fieldset className="ui-field">
      <legend>{legend}</legend>
      <div className="ui-choices">
        {options.map((o) => (
          <label key={o.code}>
            <input
              type="radio"
              name={name}
              value={o.code}
              checked={value === o.code}
              onChange={() => onChange(o.code)}
            />
            {o.label}
          </label>
        ))}
      </div>
      {error && <span className="ui-field-error">{error}</span>}
    </fieldset>
  )
}

export function Stat({ value, label }) {
  return (
    <div className="ui-stat">
      <span className="ui-stat-value">{value}</span>
      <span className="ui-stat-label">{label}</span>
    </div>
  )
}

// A progress bar with its figure said in words for screen readers.
export function Meter({ value, max, label }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (100 * value) / max)) : 0
  return (
    <div className="ui-meter" role="img" aria-label={label}>
      <div className="ui-meter-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}

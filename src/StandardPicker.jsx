import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { standardLabel } from './lookups'

// More than this and the list gets unwieldy, so the rest are left for
// typing to narrow down.
const MAX_SHOWN = 50

function optionText(standard) {
  return standard.ISOPEN ? standardLabel(standard) : `${standardLabel(standard)} - closed`
}

// A searchable standards dropdown, fed by the list from GET /api/standards.
// Typing part of the name, ST reference or code filters it. Only standards
// open for new starts can be picked, plus `currentCode` - the standard an
// existing learner is already on - which is still offered (labelled as
// closed) so the edit form can show it even after the standard has closed.
function StandardPicker({ standards, status, value, onChange, currentCode = null, disabled = false }) {
  const listId = useId()
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const [open, setOpen] = useState(false)
  // Whether the user has typed since focusing or picking. Until they do, the
  // input shows the chosen standard rather than their search text.
  const [editing, setEditing] = useState(false)
  const [query, setQuery] = useState('')
  // -1 means nothing is highlighted, so pressing Enter straight after
  // tabbing in submits the form as usual instead of picking a standard.
  const [activeIndex, setActiveIndex] = useState(-1)

  const selected = standards.find((s) => String(s.STDCODE) === String(value))
  const selectedText = selected ? optionText(selected) : value ? `Code ${value} (not in LARS)` : ''

  const choices = useMemo(
    () => standards.filter((s) => s.ISOPEN || String(s.STDCODE) === String(currentCode)),
    [standards, currentCode],
  )

  const matches = useMemo(() => {
    const words = editing ? query.trim().toLowerCase().split(/\s+/).filter(Boolean) : []
    return choices.filter((s) => {
      const text = `${s.STDREFERENCE} ${s.STDNAME} ${s.STDCODE}`.toLowerCase()
      return words.every((word) => text.includes(word))
    })
  }, [choices, editing, query])
  const shown = matches.slice(0, MAX_SHOWN)

  // Keep the highlighted option visible while moving through it with the
  // arrow keys.
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  function choose(standard) {
    onChange(String(standard.STDCODE))
    setOpen(false)
    setEditing(false)
    // Selecting the whole label means typing again replaces it with a new
    // search, instead of adding to the end of it.
    requestAnimationFrame(() => inputRef.current?.select())
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((i) => Math.min(Math.max(i + step, 0), shown.length - 1))
    } else if (e.key === 'Enter' && open && shown[activeIndex]) {
      // Picks the highlighted standard rather than submitting the form.
      e.preventDefault()
      choose(shown[activeIndex])
    } else if (e.key === 'Escape' && open) {
      e.preventDefault()
      setOpen(false)
      setEditing(false)
    }
  }

  if (status === 'loading') {
    return <input type="text" disabled placeholder="Loading standards…" />
  }
  if (status === 'error') {
    return <input type="text" disabled placeholder="Couldn't load standards. Refresh to try again." />
  }

  return (
    <div className="combobox">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && shown[activeIndex] ? `${listId}-${shown[activeIndex].STDCODE}` : undefined}
        autoComplete="off"
        disabled={disabled}
        placeholder="Search by name, ST reference or code"
        value={editing ? query : selectedText}
        onFocus={(e) => {
          setOpen(true)
          setEditing(false)
          setActiveIndex(-1)
          e.target.select()
        }}
        onClick={() => setOpen(true)}
        onBlur={() => {
          setOpen(false)
          setEditing(false)
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          setEditing(true)
          setOpen(true)
          setActiveIndex(0)
        }}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <ul className="combobox-list" id={listId} role="listbox" ref={listRef}>
          {shown.length === 0 && <li className="combobox-note">No open standards match.</li>}
          {shown.map((s, i) => (
            <li
              key={s.STDCODE}
              id={`${listId}-${s.STDCODE}`}
              role="option"
              aria-selected={String(s.STDCODE) === String(value)}
              data-active={i === activeIndex}
              className="combobox-option"
              // mousedown, not click, so the pick happens before the input
              // loses focus and closes the list.
              onMouseDown={(e) => {
                e.preventDefault()
                choose(s)
              }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span>{standardLabel(s)}</span>
              {!s.ISOPEN && <span className="standard-closed">Closed</span>}
              <span className="combobox-option-code">{s.STDCODE}</span>
            </li>
          ))}
          {matches.length > shown.length && (
            <li className="combobox-note">
              Showing {shown.length} of {matches.length}. Keep typing to narrow the list.
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

export default StandardPicker

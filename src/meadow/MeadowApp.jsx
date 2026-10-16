import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePageTitle, useShell } from '../shell/navigation'
import { avatarColour } from './avatar'
import PersonRecord from './PersonRecord'
import './meadow.css'

// Meadow, the recruitment CRM, at /meadow (managers only for now). The
// first screen is the people pipeline board from the approved mock-up
// (pipeline option C): the stages in three bands, a column per stage with
// a card per person, and Not proceeding as a count. Read from
// GET /api/meadow/board (server/meadow.js). A card opens the person's
// record at /meadow/people/:leadId (PersonRecord.jsx). Moving cards, the
// employer pipeline, My day and Reports come later.

const PERSON_PATH = /^\/meadow\/people\/([^/]+)\/?$/

function PersonCard({ card }) {
  const where = [card.district, card.situation].filter(Boolean).join(' · ')
  return (
    <li className="meadow-card">
      <div className="meadow-card-who">
        <span className="meadow-avatar" aria-hidden="true" style={{ background: avatarColour(card.leadId) }}>
          {card.initials}
        </span>
        <div className="meadow-card-name">
          <a className="meadow-card-link" href={`/meadow/people/${encodeURIComponent(card.leadId)}`}>
            {card.name}
          </a>
          {where && <span>{where}</span>}
        </div>
      </div>
      {card.interests.length > 0 && (
        <ul className="meadow-tags" aria-label="Interests">
          {card.interests.map((i) => (
            <li key={i.text} title={i.title ?? undefined}>
              {i.text}
            </li>
          ))}
        </ul>
      )}
      <p className="meadow-owner">{card.owner ? `With ${card.owner}` : 'Nobody looking after them yet'}</p>
      <div className="meadow-card-foot">
        <span>{card.days < 1 ? 'Moved here today' : `${card.daysText} in stage`}</span>
        {card.canEmail ? (
          <span className="meadow-consent">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 6.5l2.5 2.5L10 3.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            OK to email
          </span>
        ) : (
          <span className="meadow-no-consent">No email consent</span>
        )}
      </div>
    </li>
  )
}

function StageColumn({ stage }) {
  return (
    <section className="meadow-column" aria-labelledby={`stage-${stage.key}`} data-stage={stage.key}>
      <header className="meadow-column-head">
        <h3 id={`stage-${stage.key}`}>{stage.name}</h3>
        <span className="meadow-count" aria-label={`${stage.count} ${stage.count === 1 ? 'person' : 'people'}`}>
          {stage.count}
        </span>
      </header>
      {stage.note && <p className="meadow-column-note">{stage.note}</p>}
      {stage.cards.length > 0 ? (
        <ul className="meadow-cards">
          {stage.cards.map((c) => (
            <PersonCard key={c.itemId} card={c} />
          ))}
        </ul>
      ) : (
        <p className="meadow-empty">Nobody at this stage</p>
      )}
    </section>
  )
}

// The board scrolls sideways in its box when its columns don't fit. While
// there's more to the right, a fade and an arrow at the right edge say so
// (the arrow scrolls the board on).
function ScrollingBoard({ children }) {
  const ref = useRef(null)
  const [more, setMore] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const update = () => setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
    update()
    el.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [])

  return (
    <div className={more ? 'meadow-board-wrap has-more' : 'meadow-board-wrap'}>
      <div ref={ref} className="meadow-board" role="region" aria-label="Pipeline board" tabIndex={0}>
        {children}
      </div>
      {more && (
        <>
          <div className="meadow-board-fade" aria-hidden="true" />
          <button
            type="button"
            className="meadow-board-more"
            aria-label="Scroll the board right"
            onClick={() => ref.current?.scrollBy({ left: ref.current.clientWidth * 0.8, behavior: 'smooth' })}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M6.5 3.5L12 9l-5.5 5.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </>
      )}
    </div>
  )
}

// The area's tabs, in the shell header.
function MeadowTabs({ current }) {
  const { tabSlot } = useShell()
  if (!tabSlot) return null
  return createPortal(
    <nav aria-label="Meadow">
      <a href="/meadow" className="shell-tab is-active" aria-current={current ? 'page' : undefined}>
        Pipeline
      </a>
    </nav>,
    tabSlot,
  )
}

function MeadowApp() {
  const { pathname } = useShell()
  const person = pathname.match(PERSON_PATH)
  if (person) {
    return (
      <div className="meadow">
        <MeadowTabs current={false} />
        <PersonRecord key={person[1]} leadId={decodeURIComponent(person[1])} />
      </div>
    )
  }
  return (
    <div className="meadow">
      <MeadowTabs current />
      <PipelineBoard />
    </div>
  )
}

function PipelineBoard() {
  const [board, setBoard] = useState(null)
  const [error, setError] = useState(null)
  usePageTitle('People pipeline')

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/meadow/board')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Server responded with ${res.status}`)
      setBoard(data)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <main className="meadow-main">
      <div className="meadow-heading">
        <p className="meadow-eyebrow">Recruitment{board?.organisation ? ` · ${board.organisation}` : ''}</p>
        <h1>People pipeline</h1>
        {board && (
          <p className="meadow-summary">
            <span>
              <strong>{board.open}</strong> {board.open === 1 ? 'person' : 'people'} in the pipeline
            </span>
            <span className="meadow-not-proceeding">
              <strong>{board.notProceeding}</strong> not proceeding
            </span>
            <span>
              <strong>{board.enrolledInAll}</strong> enrolled in all
            </span>
          </p>
        )}
      </div>

      {error && (
        <div className="meadow-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={load}>
            Try again
          </button>
        </div>
      )}
      {!board && !error && <p className="meadow-loading">Loading the pipeline…</p>}

      {board && (
        <ScrollingBoard>
          {board.bands.map((band) => (
            <section
              key={band.key}
              className={`meadow-band meadow-band-${band.key}`}
              aria-labelledby={`band-${band.key}`}
              style={{ '--band-columns': band.stages.length }}
            >
              <header className="meadow-band-head">
                <h2 id={`band-${band.key}`}>{band.name}</h2>
                <span>{band.note}</span>
              </header>
              <div className="meadow-columns" style={{ '--columns': band.stages.length }}>
                {band.stages.map((s) => (
                  <StageColumn key={s.stageId} stage={s} />
                ))}
              </div>
            </section>
          ))}
        </ScrollingBoard>
      )}
    </main>
  )
}

export default MeadowApp

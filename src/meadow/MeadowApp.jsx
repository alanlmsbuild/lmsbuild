import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePageTitle, useShell } from '../shell/navigation'
import './meadow.css'

// Meadow, the recruitment CRM, at /meadow (managers only for now). The
// first screen is the people pipeline board from the approved mock-up
// (pipeline option C): the stages in three bands, a column per stage with
// a card per person, and Not proceeding as a count. Read from
// GET /api/meadow/board (server/meadow.js). Moving cards, the person
// record, the employer pipeline, My day and Reports come later.

const AVATARS = ['#3f5683', '#5c74a6', '#2b3d60', '#55699a', '#4a6293']

function avatarColour(id) {
  let n = 0
  for (const ch of id) n = (n * 31 + ch.charCodeAt(0)) >>> 0
  return AVATARS[n % AVATARS.length]
}

function PersonCard({ card }) {
  const where = [card.district, card.situation].filter(Boolean).join(' · ')
  return (
    <li className="meadow-card">
      <div className="meadow-card-who">
        <span className="meadow-avatar" aria-hidden="true" style={{ background: avatarColour(card.leadId) }}>
          {card.initials}
        </span>
        <div className="meadow-card-name">
          <strong>{card.name}</strong>
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

function MeadowApp() {
  const { tabSlot } = useShell()
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
    <div className="meadow">
      {tabSlot &&
        createPortal(
          <nav aria-label="Meadow">
            <a href="/meadow" className="shell-tab is-active" aria-current="page">
              Pipeline
            </a>
          </nav>,
          tabSlot,
        )}
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
          <div className="meadow-board" role="region" aria-label="Pipeline board" tabIndex={0}>
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
          </div>
        )}
      </main>
    </div>
  )
}

export default MeadowApp

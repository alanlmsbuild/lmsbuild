import { useEffect } from 'react'
import { useShell } from '../shell/navigation'
import { backLabel, learnerTabPath, rememberLearnerTab } from './links'
import './learner.css'

// The top of the learner page, on both tabs: Back, the learner's name and
// standard, and the Record (Warren) and Portfolio (Burrow) tabs. Moving
// between the tabs changes area, so the header's colour changes too.
// Whichever tab is shown is remembered as the one to open next time.
function LearnerHeader({ learnRefNumber, name, detail, tab, back }) {
  const { me } = useShell()

  useEffect(() => {
    rememberLearnerTab(me?.USERID, tab)
  }, [me?.USERID, tab])

  const tabs = [
    { tab: 'record', label: 'Record' },
    { tab: 'portfolio', label: 'Portfolio' },
  ]

  return (
    <header className="learner-header">
      <a className="learner-back" href={back}>
        <span aria-hidden="true">←</span> {backLabel(back)}
      </a>
      <div className="learner-title">
        <h1>{name}</h1>
        <p>{[learnRefNumber, detail].filter(Boolean).join(' · ')}</p>
      </div>
      <nav className="learner-tabs" aria-label="Learner">
        {tabs.map((t) => (
          <a
            key={t.tab}
            href={learnerTabPath(learnRefNumber, t.tab, back)}
            className={`learner-tab learner-tab--${t.tab}${t.tab === tab ? ' is-active' : ''}`}
            aria-current={t.tab === tab ? 'page' : undefined}
          >
            {t.label}
          </a>
        ))}
      </nav>
    </header>
  )
}

export default LearnerHeader

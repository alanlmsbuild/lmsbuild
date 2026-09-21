import { useEffect, useState } from 'react'
import './App.css'
import {
  AIM_TYPE_LABELS,
  COMPLETION_STATUS_LABELS,
  OUTCOME_LABELS,
  describe,
  formatDate,
} from './lookups'

function App() {
  const [learners, setLearners] = useState([])
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/learners')
      .then((res) => {
        if (!res.ok) throw new Error(`Server responded with ${res.status}`)
        return res.json()
      })
      .then((data) => {
        setLearners(data)
        setStatus('ready')
      })
      .catch((err) => {
        setError(err.message)
        setStatus('error')
      })
  }, [])

  return (
    <section id="learners">
      <h1>Learners</h1>
      <p>Dummy ILR apprenticeship learners and their programme aim details.</p>

      {status === 'loading' && <p>Loading learners…</p>}
      {status === 'error' && (
        <p role="alert">Couldn't load learners: {error}</p>
      )}

      {status === 'ready' && (
        <table>
          <thead>
            <tr>
              <th>Learner ref</th>
              <th>Name</th>
              <th>Date of birth</th>
              <th>Aim ref</th>
              <th>Aim type</th>
              <th>Std code</th>
              <th>Start date</th>
              <th>Planned end</th>
              <th>Status</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {learners.map((learner) => (
              <tr key={`${learner.LEARNREFNUMBER}-${learner.LEARNAIMREF}`}>
                <td>{learner.LEARNREFNUMBER}</td>
                <td>
                  {learner.GIVENNAMES} {learner.FAMILYNAME}
                </td>
                <td>{formatDate(learner.DATEOFBIRTH)}</td>
                <td>{learner.LEARNAIMREF}</td>
                <td>{describe(AIM_TYPE_LABELS, learner.AIMTYPE)}</td>
                <td>{learner.STDCODE ?? '—'}</td>
                <td>{formatDate(learner.LEARNSTARTDATE)}</td>
                <td>{formatDate(learner.LEARNPLANENDDATE)}</td>
                <td>{describe(COMPLETION_STATUS_LABELS, learner.COMPSTATUS)}</td>
                <td>{describe(OUTCOME_LABELS, learner.OUTCOME)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export default App

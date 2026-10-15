import './Landing.css'
import DevUserSwitcher from './DevUserSwitcher'
import { signInPath } from './shell/navigation'
import SkillsEnglandFooter from './SkillsEnglandFooter'

// The Rarebit front door at "/" (decision 29). Recreated from the design
// reference in docs/design/landing-front-door.html - same sections, wording,
// colours and fonts - and responsive. Two doors: people exploring their
// options (the school leavers app, with ?audience= saying who they are, for
// the app to use later), and the products for providers, colleges and
// employers. Warren and Burrow sign in on the sign-in page; Meadow's screens
// aren't built yet, so it says "Coming soon" rather than linking anywhere.
// The page has its own cream header, as in the design (the shell leaves
// out the shared dark one here); its "Sign in" goes to the sign-in page,
// like the shared header's.

// The toast icon from the design.
function ToastIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <rect x="3" y="7" width="28" height="20" rx="6" fill="#E9A23B" />
      <circle cx="12" cy="15" r="2.4" fill="#2A1F17" />
      <circle cx="21" cy="19" r="2" fill="#2A1F17" />
      <circle cx="24" cy="13" r="1.6" fill="#2A1F17" />
    </svg>
  )
}

function FrontDoorHeader() {
  return (
    <header className="landing-header">
      <a href="/" className="landing-brand" aria-label="Rarebit home">
        <ToastIcon />
        <span className="landing-wordmark">Rarebit</span>
      </a>
      <nav aria-label="Main" className="landing-nav">
        <a href="#explore">Explore options</a>
        <a href="#products">For providers and employers</a>
        <a href="#promise">Our promise</a>
      </nav>
      <div className="landing-header-right">
        <a href="/sign-in" className="landing-signin">
          Sign in
        </a>
        <DevUserSwitcher currentUserId={null} />
      </div>
    </header>
  )
}

// The school leavers app (~/school-leavers-app) as `npm run dev` serves it.
const OPTIONS_APP = 'http://localhost:4321/'

const AUDIENCES = [
  { name: 'School leaver', audience: 'school-leaver', text: 'Work out what you like, then see where it could take you.', tone: 'cheddar' },
  { name: '18 or over', audience: 'adult', text: 'Just show me my options: courses, apprenticeships, jobs and support.', tone: 'teal' },
  { name: 'Parent or carer', audience: 'parent', text: 'Compare colleges, universities and the places around them.', tone: 'coral' },
]

function WarrenIcon() {
  return (
    <svg width="52" height="40" viewBox="0 0 52 40">
      <path d="M6 8l10 24 10-18 10 18 10-24" stroke="#2E5A4C" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6" cy="8" r="4" fill="#E9A23B" />
      <circle cx="26" cy="14" r="4" fill="#E9A23B" />
      <circle cx="46" cy="8" r="4" fill="#E9A23B" />
    </svg>
  )
}

function BurrowIcon() {
  return (
    <svg width="44" height="48" viewBox="0 0 44 48">
      <path d="M4 46V24a18 18 0 0 1 36 0v22z" fill="#B4532A" />
      <path d="M11 46V25a11 11 0 0 1 22 0v21z" fill="#2A1F17" />
      <rect x="15" y="28" width="15" height="12" rx="2" fill="#F6EEDC" />
      <rect x="15" y="28" width="15" height="4" rx="2" fill="#E9A23B" />
    </svg>
  )
}

function MeadowIcon() {
  return (
    <svg width="52" height="40" viewBox="0 0 52 40">
      <circle cx="38" cy="12" r="7" fill="#E9A23B" />
      <path d="M2 36c8-14 16-20 24-20s16 6 24 20z" fill="#3F5683" />
      <path d="M14 36v-7M20 36v-9M32 36v-8M38 36v-6" stroke="#F6EEDC" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

const PRODUCTS = [
  {
    key: 'warren',
    name: 'Warren',
    kind: 'Learning management',
    Icon: WarrenIcon,
    text: 'Everything a training provider records about a learner, in one place.',
    points: ['Learner records built on the ILR specification', 'Real apprenticeship standards from LARS', 'Caseloads, reviews and a live dashboard'],
    status: 'In pilot',
    signIn: signInPath('/app'),
  },
  {
    key: 'burrow',
    name: 'Burrow',
    kind: 'E-portfolio',
    Icon: BurrowIcon,
    text: 'A home for the evidence learners build, and the proof they’ve built it.',
    points: ['Evidence mapped to each standard’s KSBs', 'Assessor review and sign-off', 'Learners keep what they’ve learned'],
    status: 'In development',
    signIn: signInPath('/burrow'),
  },
  {
    key: 'meadow',
    name: 'Meadow',
    kind: 'Recruitment CRM',
    Icon: MeadowIcon,
    text: 'From first enquiry to someone who stays the course, with employers alongside.',
    points: ['People and employer pipelines', 'Matching on interests, skills and travel', 'Hands over to Warren, no questions asked twice'],
    status: 'Designed',
    signIn: null,
  },
]

const PROMISES = [
  {
    title: 'Nobody pays to be higher',
    text: 'Colleges, universities and providers can’t buy a better place. Every option is shown the same way.',
  },
  {
    title: 'Official facts, plainly put',
    text: 'Every figure says where it came from and when. Small groups are flagged, never hidden behind a percentage.',
  },
  {
    title: 'Your details stay yours',
    text: 'Nothing is shared with a college, provider or employer unless you choose to, and you can delete it any time.',
  },
]

function Landing() {
  return (
    <div className="landing">
      <FrontDoorHeader />

      <main className="landing-page">
        <section className="landing-hero">
          <h1>Honest options, for everyone.</h1>
          <p>
            College, sixth form, university, apprenticeships, gap years and jobs, explained plainly, with the same
            facts for everyone. Pick the door that fits you.
          </p>
        </section>

        <section id="explore" aria-label="Exploring my options" className="landing-door-one">
          <div className="landing-door-one-text">
            <div className="landing-door-label">Door one</div>
            <h2>I’m exploring my options</h2>
            <p>Free, no account needed. Nothing is compulsory, and you can change your mind any time.</p>
          </div>
          <div className="landing-audiences">
            {AUDIENCES.map((a) => (
              <a key={a.name} href={`${OPTIONS_APP}?audience=${a.audience}`} className={`landing-audience landing-audience-${a.tone}`}>
                <span className="landing-audience-name">{a.name}</span>
                <span className="landing-audience-text">{a.text}</span>
              </a>
            ))}
          </div>
        </section>

        <section id="products" aria-label="I work with learners" className="landing-door-two">
          <div className="landing-eyebrow">Door two · for providers, colleges and employers</div>
          <h2>One warren for recruitment, learning and evidence.</h2>
          <div className="landing-products">
            {PRODUCTS.map(({ key, name, kind, Icon, text, points, status, signIn }) => (
              <article key={key} className={`landing-product landing-product-${key}`}>
                <div className="landing-product-title">
                  <div className="landing-product-badge" aria-hidden="true">
                    <Icon />
                  </div>
                  <div>
                    <h3>{name}</h3>
                    <div className="landing-product-kind">{kind}</div>
                  </div>
                </div>
                <p>{text}</p>
                <ul className="landing-product-points">
                  {points.map((point) => (
                    <li key={point}>
                      <span className="landing-dot" aria-hidden="true" />
                      {point}
                    </li>
                  ))}
                </ul>
                <div className="landing-product-foot">
                  <span className="landing-product-status">{status}</span>
                  {signIn ? (
                    <a href={signIn} className="landing-product-signin">
                      Sign in to {name}
                    </a>
                  ) : (
                    <span className="landing-product-soon">Coming soon</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="promise" aria-label="Our promise" className="landing-promises">
          {PROMISES.map((p) => (
            <div key={p.title} className="landing-promise">
              <h3>{p.title}</h3>
              <p>{p.text}</p>
            </div>
          ))}
        </section>
      </main>

      <div className="landing-footer">
        <SkillsEnglandFooter alwaysLight />
      </div>
    </div>
  )
}

export default Landing

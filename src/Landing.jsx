import './Landing.css'
import RarebitMark from './logos/RarebitMark'
import WarrenMark from './logos/WarrenMark'
import BurrowMark from './logos/BurrowMark'

// The Rarebit front page at "/". Recreated from the "Toasted" design
// reference in docs/design/landing-toasted.html - same sections, wording,
// colours and fonts - but responsive instead of a fixed 1440px layout.
// "Book a demo" goes to #contact until there's a booking form.

function ProductPoint({ children }) {
  return (
    <li>
      <span className="landing-dot" aria-hidden="true" />
      <span>{children}</span>
    </li>
  )
}

function Landing() {
  return (
    <div className="landing">
      <div id="top" className="landing-page">
        <header className="landing-header">
          <a href="#top" aria-label="Rarebit home" className="landing-logo">
            <RarebitMark size={52} />
            <span className="landing-wordmark">rarebit</span>
          </a>
          <nav aria-label="Main" className="landing-nav">
            <a href="#products">Products</a>
            <a href="#who">Who it’s for</a>
            <a href="#why">Why Rarebit</a>
            <a href="/app" className="landing-pill landing-pill-outline">
              Open Warren
            </a>
            <a href="#contact" className="landing-pill landing-pill-ink">
              Book a demo
            </a>
          </nav>
        </header>

        <section className="landing-hero">
          <div className="landing-hero-text">
            <div className="landing-eyebrow">Learning &amp; e-portfolio systems</div>
            <h1>Learning, well toasted.</h1>
            <p>
              Rarebit makes Warren, a learning management system, and Burrow, an e-portfolio, for training
              providers running apprenticeships and the Restart Scheme.
            </p>
            <div className="landing-hero-actions">
              <a href="#contact" className="landing-button landing-button-crust">
                Book a demo
              </a>
              <a href="#products" className="landing-button landing-button-outline">
                See the products
              </a>
            </div>
          </div>
          <div className="landing-hero-art">
            <div className="landing-hero-plate">
              <RarebitMark size={290} className="landing-hero-mark" />
            </div>
          </div>
        </section>

        <section id="products" className="landing-products">
          <div className="landing-section-heading">
            <div className="landing-eyebrow">Two products</div>
            <h2>One warren for learning and evidence.</h2>
          </div>
          <div className="landing-product-grid">
            <article className="landing-product landing-product-warren">
              <div className="landing-product-title">
                <div className="landing-product-badge">
                  <WarrenMark size={70} />
                </div>
                <div>
                  <h3>Warren</h3>
                  <div className="landing-product-kind">Learning management</div>
                </div>
              </div>
              <p>Everything a training provider records about a learner, in one place.</p>
              <ul className="landing-product-points">
                <ProductPoint>Learner records built on the ILR specification</ProductPoint>
                <ProductPoint>Real apprenticeship standards from LARS</ProductPoint>
                <ProductPoint>Tutors, assessors and a live dashboard</ProductPoint>
              </ul>
              <div className="landing-product-status">In pilot</div>
            </article>

            <article className="landing-product landing-product-burrow">
              <div className="landing-product-title">
                <div className="landing-product-badge">
                  <BurrowMark size={74} />
                </div>
                <div>
                  <h3>Burrow</h3>
                  <div className="landing-product-kind">E-portfolio</div>
                </div>
              </div>
              <p>A home for the evidence learners build, and the proof they’ve built it.</p>
              <ul className="landing-product-points">
                <ProductPoint>Evidence mapped to each standard’s knowledge, skills and behaviours</ProductPoint>
                <ProductPoint>Assessor review and sign-off</ProductPoint>
                <ProductPoint>Learners keep what they’ve learned</ProductPoint>
              </ul>
              <div className="landing-product-status">In development</div>
            </article>
          </div>
        </section>

        <section id="who" className="landing-who">
          <h2>Built for two kinds of provider.</h2>
          <div className="landing-who-item">
            <h3>Apprenticeship providers</h3>
            <p>Track each apprentice against their standard, from the first day to end-point assessment.</p>
          </div>
          <div className="landing-who-item">
            <h3>Restart Scheme providers</h3>
            <p>Keep participants’ progress, support and outcomes together, ready for reporting.</p>
          </div>
        </section>

        <section id="why" className="landing-why">
          <h2>Why Rarebit</h2>
          <div className="landing-why-grid">
            <div className="landing-why-item">
              <div className="landing-why-number">01</div>
              <h3>Official data at the core</h3>
              <p>
                Apprenticeship standards and learning aims come from the government’s LARS data, refreshed in
                minutes when a new version is published.
              </p>
            </div>
            <div className="landing-why-item">
              <div className="landing-why-number">02</div>
              <h3>Built around the ILR</h3>
              <p>Learner records follow the Individualised Learner Record, so your returns start from clean data.</p>
            </div>
            <div className="landing-why-item">
              <div className="landing-why-number">03</div>
              <h3>Your learners stay yours</h3>
              <p>Designed so each provider sees only its own learners and their evidence.</p>
            </div>
          </div>
        </section>

        <section id="contact" className="landing-contact">
          <div className="landing-contact-text">
            <h2>See Warren in action.</h2>
            <p>Book a short demo, and we’ll walk you through it with your own programmes in mind.</p>
          </div>
          <div className="landing-contact-actions">
            <a href="#contact" className="landing-button landing-button-ink">
              Book a demo
            </a>
            {/* Placeholder kept exactly as in the design until the real address is decided. */}
            <div className="landing-contact-email">or email [your email address]</div>
          </div>
        </section>

        <footer className="landing-footer">
          <div className="landing-footer-top">
            <div className="landing-footer-brand">
              <div className="landing-footer-wordmark">rarebit</div>
              <div className="landing-footer-tagline">Learning &amp; e-portfolio systems</div>
            </div>
            <div className="landing-footer-links">
              <div className="landing-footer-column">
                <div className="landing-footer-heading">Products</div>
                <a href="#products">Warren</a>
                <a href="#products">Burrow</a>
              </div>
              <div className="landing-footer-column">
                <div className="landing-footer-heading">Company</div>
                <a href="#contact">Contact</a>
                <a href="#top">Privacy policy</a>
              </div>
            </div>
          </div>
          <div className="landing-footer-bottom">
            <div>© 2026 Rarebit. All rights reserved.</div>
            <div>Warren · Burrow</div>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default Landing

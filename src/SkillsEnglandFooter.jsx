import './SkillsEnglandFooter.css'

// The Skills England logo and attribution (required by their data terms),
// the OGL credit for the LARS data, and our copyright. Shared by Warren and
// every Burrow screen, so the required wording lives in one place.
function SkillsEnglandFooter() {
  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        {/* Skills England's official colourways, used unchanged: the blue
            stacked logo normally, their all-white landscape one in dark mode. */}
        <picture>
          <source
            media="(prefers-color-scheme: dark)"
            srcSet="/brand/skills-england_lesser_arms_landscape-se-logo-white.svg"
          />
          <img
            src="/brand/skills-england_lesser_arms_stacked-dfe-blue-se-logo.svg"
            alt="Skills England"
            className="footer-logo"
          />
        </picture>
        {/* Attribution statement for online publications, worded exactly
            as Skills England's public API terms require:
            https://occupational-maps.skillsengland.education.gov.uk/public-api/#licence */}
        <div className="footer-attribution">
          <p>© Skills England 2025</p>
          <p>
            This information is licensed under the Open Government Licence{' '}
            <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">
              https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3
            </a>
          </p>
          {/* Standard OGL attribution for the LARS data, which DfE publishes. */}
          <p className="footer-ogl">
            Contains public sector information licensed under the{' '}
            <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">
              Open Government Licence v3.0
            </a>
            .
          </p>
        </div>
        <p className="footer-copyright">© 2026 Rarebit</p>
      </div>
    </footer>
  )
}

export default SkillsEnglandFooter

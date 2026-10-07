import './SkillsEnglandFooter.css'

// The Skills England logo and attribution statement, shown directly under
// every list of knowledge, skills and behaviours (KSBs), which come from
// Skills England's data. Their API terms ask for both, worded exactly as
// their statement for online publications (year as they give it):
// https://occupational-maps.skillsengland.education.gov.uk/public-api/#licence
// The page footer (SkillsEnglandFooter) carries the same statement.
export const SKILLS_ENGLAND_STATEMENT = '© Skills England 2025. This information is licensed under the Open Government Licence'
export const OGL_URL = 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/'

function SkillsEnglandCredit() {
  return (
    <p className="ksb-credit">
      {/* Their official colourways, unchanged: blue normally, white in dark mode. */}
      <picture>
        <source media="(prefers-color-scheme: dark)" srcSet="/brand/skills-england_lesser_arms_landscape-se-logo-white.svg" />
        <img src="/brand/skills-england_lesser_arms_stacked-dfe-blue-se-logo.svg" alt="Skills England" className="ksb-credit-logo" />
      </picture>
      <span>
        Knowledge, skills and behaviours: {SKILLS_ENGLAND_STATEMENT} <a href={OGL_URL}>{OGL_URL}</a>
      </span>
    </p>
  )
}

export default SkillsEnglandCredit

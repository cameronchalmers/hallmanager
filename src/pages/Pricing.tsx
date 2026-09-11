import { Link } from 'react-router-dom'
import { SiteChrome } from '../components/SiteChrome'

/// Pricing, while there is not any.
///
/// Saying "free for now, and here is what it will become" is more useful than
/// an empty page or an invented number, and it is the honest position: the
/// halls using it today are helping build it.
export default function Pricing() {
  return (
    <SiteChrome>
      <main className="lp">
        <section className="lp-hero" style={{ paddingBottom: 44 }}>
          <p className="lp-eyebrow">Pricing</p>
          <h1>Free while it is being built</h1>
          <p className="lp-lead">
            HallManager is in use at a handful of buildings and is not being charged for yet. The
            halls using it now are shaping what it does, which is worth more at this stage than
            the money would be.
          </p>
          <div className="lp-actions">
            <Link to="/login" className="lp-btn">Sign in</Link>
            <Link to="/features" className="lp-btn-ghost">See what it does</Link>
          </div>
        </section>

        <section className="lp-band">
          <div className="lp-inner" style={{ paddingBlock: 54 }}>
            <h2>When it does cost something</h2>
            <p style={{ margin: '10px 0 0', maxWidth: '62ch', fontSize: 16, lineHeight: 1.75,
                        color: 'var(--text-muted)' }}>
              It will be a small yearly amount per building, in the order of what a community
              hall spends on a wall planner, and you will be told well before it starts. Card
              payments already go straight to your own Stripe account, so there is no commission
              on takings now and there will not be.
            </p>
            <div className="lp-grid" style={{ marginTop: 30 }}>
              <div className="lp-feature">
                <h3>No commission on bookings</h3>
                <p>Your Stripe account, your money. We never sit between the hirer and the hall.</p>
              </div>
              <div className="lp-feature">
                <h3>Nothing held hostage</h3>
                <p>
                  Your bookings and payment history stay readable and exportable whatever happens
                  to the arrangement.
                </p>
              </div>
              <div className="lp-feature">
                <h3>Told in advance</h3>
                <p>
                  If it starts costing, you hear about it with plenty of notice and can decide
                  then. Nothing switches off without warning.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </SiteChrome>
  )
}

import { Link } from 'react-router-dom'
import { SiteChrome } from '../components/SiteChrome'

/// The front door.
///
/// Written for the person who runs a hall, not the person hiring it. They are
/// almost always a volunteer or a part-time caretaker with a shared inbox, a
/// paper diary and somebody's mobile number on a laminated sign, and the job
/// they are trying to stop doing is answering "is the hall free on the 14th?"
/// for the fourth time this week.
///
/// Every claim here is something the product actually does today. Nothing
/// about accounting, because the QuickFile integration has gone.
export default function Landing() {
  return (
    <SiteChrome>
      <main className="lp">
        <section className="lp-hero">
          <p className="lp-eyebrow">Bookings for community buildings</p>
          <h1>Stop running the hall out of an inbox</h1>
          <p className="lp-lead">
            Take booking requests, show what is free, collect the deposit and the balance, and
            keep it all in one place. Built for church halls, scout huts, village halls and
            community centres, where the person doing the bookings is doing it on a Tuesday
            evening between other jobs.
          </p>
          <div className="lp-actions">
            <Link to="/login" className="lp-btn">Sign in</Link>
            <Link to="/features" className="lp-btn-ghost">See what it does</Link>
          </div>
          <p className="lp-note">
            Already have a booking link from your hall? You do not need an account: follow the
            link and pick a date.
          </p>
        </section>

        <section className="lp-band">
          <div className="lp-inner">
            <h2>What it takes off your hands</h2>
            <div className="lp-grid">
              {FEATURES.map((f) => (
                <div key={f.title} className="lp-feature">
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </div>
              ))}
            </div>
            <div className="lp-more">
              <Link to="/features" className="lp-btn-ghost">Everything it does</Link>
            </div>
          </div>
        </section>

        <section className="lp-inner lp-story">
          <h2>The way it usually goes wrong</h2>
          <p>
            Somebody emails to ask about a Saturday. You check the diary, or the wall planner, or
            the other person who also takes bookings. You reply. They book. Three weeks later
            they ask to stay an extra hour, you say yes, and the extra hour never gets invoiced
            because the payment already went through.
          </p>
          <p>
            None of that is anybody being careless. It is what happens when the booking lives in
            one place, the money lives in another, and the only thing joining them up is
            somebody remembering.
          </p>
        </section>

        <section className="lp-band">
          <div className="lp-inner lp-cta">
            <h2>Have a look</h2>
            <p>
              If you run a hall and want to see whether this would help, get in touch and we will
              set your building up so you can try it with your own dates.
            </p>
            <div className="lp-actions">
              <Link to="/login" className="lp-btn">Sign in</Link>
              <Link to="/pricing" className="lp-btn-ghost">What it costs</Link>
            </div>
          </div>
        </section>
      </main>
    </SiteChrome>
  )
}

const FEATURES = [
  {
    title: 'Requests instead of phone tag',
    body: 'A booking link people can use themselves. They pick a date, say what it is for, and it '
      + 'lands with you to approve rather than becoming a conversation.',
  },
  {
    title: 'A calendar people can check',
    body: 'Share what is free without giving anybody access to anything. Most of the questions you '
      + 'answer twice a week are answered by the page instead.',
  },
  {
    title: 'Deposits and balances',
    body: 'Take a deposit to hold the date and the balance nearer the time, by card, with the '
      + 'booking updating itself when the money arrives.',
  },
  {
    title: 'Regular bookings',
    body: 'The Brownies every Tuesday for a term is one booking, not thirteen, and cancelling one '
      + 'week does not cancel the rest.',
  },
  {
    title: 'More than one building',
    body: 'A hall, a smaller room and the minibus can all be booked separately, each with their own '
      + 'rates and their own people.',
  },
  {
    title: 'A record of what was agreed',
    body: 'Who booked, what they paid, what was refunded and when the emails went. The things you '
      + 'need when somebody remembers it differently.',
  },
]

import { Link } from 'react-router-dom'
import { SiteChrome } from '../components/SiteChrome'

/// The full list, on its own page.
///
/// Grouped by the job rather than by the screen it lives on, because somebody
/// deciding whether this is for them is thinking "can it handle the Brownies
/// every Tuesday", not "does it have a bookings table".
export default function Features() {
  return (
    <SiteChrome>
      <main className="lp">
        <section className="lp-hero" style={{ paddingBottom: 40 }}>
          <p className="lp-eyebrow">Features</p>
          <h1>Everything HallManager does</h1>
          <p className="lp-lead">
            For the person who looks after the building, keeps the diary and chases the money,
            usually in the evenings and usually alone.
          </p>
        </section>

        {GROUPS.map((group) => (
          <section key={group.title} className="lp-inner" style={{ paddingBottom: 46 }}>
            <h2>{group.title}</h2>
            <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 15 }}>
              {group.intro}
            </p>
            <div className="lp-grid" style={{ marginTop: 24 }}>
              {group.items.map((item) => (
                <div key={item.title} className="lp-feature">
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              ))}
            </div>
          </section>
        ))}

        <section className="lp-band">
          <div className="lp-inner lp-cta">
            <h2>Want your hall on it?</h2>
            <p>Get in touch and we will set your building up so you can try it with real dates.</p>
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

const GROUPS = [
  {
    title: 'Taking bookings',
    intro: 'The part that replaces the inbox and the paper diary.',
    items: [
      { title: 'A booking link of your own',
        body: 'Send it, print it on the noticeboard, put it on the parish website. People pick a '
            + 'date and tell you what it is for, and it arrives as a request rather than an email.' },
      { title: 'Approve or decline',
        body: 'Nothing is confirmed until you say so. Declining is one click and the person is told.' },
      { title: 'Availability people can check',
        body: 'A public calendar showing what is free, without giving anybody a login or showing '
            + 'them who booked what.' },
      { title: 'Extra slot requests',
        body: 'A regular hirer who wants one more evening can ask for it against their existing '
            + 'booking instead of starting again.' },
    ],
  },
  {
    title: 'Getting paid',
    intro: 'Card payments, tied to the booking rather than to a spreadsheet.',
    items: [
      { title: 'Deposits and balances',
        body: 'Hold the date with a deposit and take the balance nearer the time. The booking '
            + 'updates itself when the money lands.' },
      { title: 'Your own Stripe account',
        body: 'Money goes straight to the building, not through us. Each site can use its own '
            + 'account, which matters when a parish runs more than one.' },
      { title: 'Refunds without a spreadsheet',
        body: 'Refund a deposit from the booking itself, and the record shows what went back and '
            + 'when.' },
      { title: 'Emails that go out on their own',
        body: 'Request received, booking confirmed, payment due, payment received, refund issued. '
            + 'Every send is recorded against the booking.' },
    ],
  },
  {
    title: 'The awkward cases',
    intro: 'The ones a simple calendar cannot hold.',
    items: [
      { title: 'Regular bookings',
        body: 'Every Tuesday for a term is one booking. Cancel a single week for half term without '
            + 'unpicking the rest.' },
      { title: 'More than one space',
        body: 'The main hall, the committee room and the minibus each have their own rates, their '
            + 'own calendar and their own people.' },
      { title: 'Different rates for different hirers',
        body: 'The scout group and the private party do not pay the same, and you should not have '
            + 'to remember which is which.' },
      { title: 'Vehicle hire',
        body: 'A minibus is booked by pickup and return rather than by the hour, with its own '
            + 'questions on the form.' },
    ],
  },
  {
    title: 'Knowing what happened',
    intro: 'For the committee meeting, and for when somebody remembers it differently.',
    items: [
      { title: 'Insights',
        body: 'What the building earned, how much it was used, and which months are quiet.' },
      { title: 'A record per booking',
        body: 'Who booked, what they were charged, what they paid, what was refunded, and every '
            + 'email that went to them.' },
      { title: 'Who can see what',
        body: 'Someone can run one hall without seeing another, and a hirer sees only their own '
            + 'bookings in their portal.' },
    ],
  },
]

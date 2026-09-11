import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/// Header and footer for the pages a stranger can see.
///
/// HallManager had no front door at all: "/" redirected straight into a
/// dashboard, so the only way to describe the product to somebody was to send
/// them a booking link for a hall they had no interest in. Everything public
/// now shares this, so the marketing pages, the booking form and the
/// availability calendar all look like one product rather than three.
///
/// Modelled on the equivalent in BuildingSafe, deliberately. Two products from
/// the same person that look unrelated make both look smaller.
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const onHome = pathname === '/'

  return (
    <div className="chrome">
      <header className="chrome-header">
        <div className="chrome-bar">
          <Link to="/" className="chrome-brand">
            <img src="/favicon.svg" alt="" width={30} height={30} />
            <span>HallManager</span>
          </Link>
          <nav className="chrome-nav">
            <Link to="/features" className="chrome-link">Features</Link>
            <Link to="/pricing" className="chrome-link">Pricing</Link>
            {/* The booking pages are the ones a hirer arrives on, and they
                should not be nagged to sign in: the account is for the person
                who runs the hall, not the person hiring it. */}
            {user
              ? <Link to="/" className="chrome-cta">Open HallManager</Link>
              : <Link to="/login" className="chrome-cta">Sign in</Link>}
          </nav>
        </div>
      </header>

      <div className="chrome-body">{children}</div>

      <footer className="chrome-footer">
        <div className="chrome-footer-inner">
          <p className="chrome-footer-note">
            HallManager takes bookings and payments for community buildings. It is not an
            accounting package and does not file anything on your behalf.
          </p>
          <div className="chrome-footer-links">
            <Link to="/features">Features</Link>
            <Link to="/pricing">Pricing</Link>
            {!onHome && <Link to="/">Home</Link>}
            <Link to={user ? '/' : '/login'}>{user ? 'Open HallManager' : 'Sign in'}</Link>
            <span className="chrome-copyright">© {new Date().getFullYear()} CC Apps</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

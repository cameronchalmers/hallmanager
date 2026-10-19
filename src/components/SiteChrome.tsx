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
/// Built the same way as the equivalent in BuildingSafe and VehicleSafe,
/// class for class. Two products from the same person that look unrelated
/// make both look smaller.
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const onHome = pathname === '/'

  return (
    <div className="app-gradient flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/70 backdrop-blur-md
                         dark:border-slate-800 dark:bg-slate-950/70">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-3.5">
          <Link to="/" className="flex items-center gap-3">
            <img src="/favicon.svg" alt="" width={32} height={32} className="h-8 w-8" />
            <span className="font-semibold text-slate-900 dark:text-slate-100">HallManager</span>
          </Link>
          <nav className="ml-auto flex items-center gap-1">
            <Link to="/features" className="btn-plain hidden sm:inline-flex">Features</Link>
            <Link to="/pricing" className="btn-plain hidden sm:inline-flex">Pricing</Link>
            {/* The booking pages are the ones a hirer arrives on, and they
                should not be nagged to sign in: the account is for the person
                who runs the hall, not the person hiring it. */}
            {user
              ? <Link to="/" className="btn-primary">Open HallManager</Link>
              : <Link to="/login" className="btn-secondary">Sign in</Link>}
          </nav>
        </div>
      </header>

      {/* flex-1 so a short page still pushes the footer to the bottom. */}
      <div className="flex-1">{children}</div>

      <footer className="border-t border-slate-200 dark:border-slate-800">
        <div className="mx-auto max-w-5xl px-5 py-10">
          <p className="max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">
            HallManager takes bookings and payments for community buildings. It is not an
            accounting package and does not file anything on your behalf.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t
                          border-slate-200 pt-6 text-sm text-slate-600
                          dark:border-slate-800 dark:text-slate-300">
            <Link to="/features" className="hover:text-slate-900 dark:hover:text-slate-100">Features</Link>
            <Link to="/pricing" className="hover:text-slate-900 dark:hover:text-slate-100">Pricing</Link>
            {!onHome && <Link to="/" className="hover:text-slate-900 dark:hover:text-slate-100">Home</Link>}
            <Link to={user ? '/' : '/login'} className="hover:text-slate-900 dark:hover:text-slate-100">
              {user ? 'Open HallManager' : 'Sign in'}
            </Link>
            <span className="ml-auto text-slate-500 dark:text-slate-400">
              © {new Date().getFullYear()} CC Apps
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}

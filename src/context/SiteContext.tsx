import { createContext, useContext, useState } from 'react'
import type { Site } from '../lib/database.types'

interface SiteCtx {
  currentSite: Site | null
  setCurrentSite: (s: Site | null) => void
}

const Ctx = createContext<SiteCtx>({ currentSite: null, setCurrentSite: () => {} })

export function SiteProvider({ children }: { children: React.ReactNode }) {
  const [currentSite, setCurrentSite] = useState<Site | null>(null)
  return <Ctx.Provider value={{ currentSite, setCurrentSite }}>{children}</Ctx.Provider>
}

export function useSite() { return useContext(Ctx) }

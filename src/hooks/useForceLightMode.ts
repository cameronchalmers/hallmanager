import { useEffect } from 'react'

export function useForceLightMode() {
  useEffect(() => {
    const html = document.documentElement
    const had = html.classList.contains('dark')
    html.classList.remove('dark')
    return () => { if (had) html.classList.add('dark') }
  }, [])
}

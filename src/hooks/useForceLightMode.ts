import { useEffect } from 'react'
import { useTheme } from '../context/ThemeContext'

/// Hirer-facing pages stay light whatever the visitor's system is doing: they
/// carry the venue's own colours, which were chosen against white.
export function useForceLightMode() {
  const { setForcedLight } = useTheme()
  useEffect(() => {
    setForcedLight(true)
    return () => setForcedLight(false)
  }, [])
}

import { useEffect, useState } from "react"

export function useDelayedVisibility(active: boolean, delayMs = 180) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!active) {
      setVisible(false)
      return
    }

    const timer = window.setTimeout(() => {
      setVisible(true)
    }, Math.max(0, delayMs))

    return () => window.clearTimeout(timer)
  }, [active, delayMs])

  return visible
}

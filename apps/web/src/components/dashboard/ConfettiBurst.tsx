"use client"

import React, { useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"

interface ConfettiBurstProps {
  active: boolean
  onDone?: () => void
  colors?: string[]
}

interface Particle {
  id: number
  x: number
  y: number
  color: string
  size: number
  angle: number
  distance: number
}

export function ConfettiBurst({ active, onDone, colors = ["#facc15", "#f472b6", "#60a5fa", "#34d399", "#a78bfa"] }: ConfettiBurstProps) {
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: 30 }, (_, i) => {
      const angle = Math.random() * Math.PI * 2
      const distance = 60 + Math.random() * 100
      return {
        id: i,
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance - 20,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 4 + Math.random() * 6,
        angle: Math.random() * 360,
        distance,
      }
    })
  }, [colors])

  return (
    <AnimatePresence onExitComplete={onDone}>
      {active && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-visible">
          {particles.map((p) => (
            <motion.div
              key={p.id}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
              animate={{
                x: p.x,
                y: p.y,
                opacity: 0,
                scale: 0,
                rotate: p.angle + 180,
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7 + Math.random() * 0.3, ease: "easeOut" }}
              className="absolute rounded-sm"
              style={{
                width: p.size,
                height: p.size,
                backgroundColor: p.color,
              }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  )
}

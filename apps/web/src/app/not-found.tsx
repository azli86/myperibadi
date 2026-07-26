"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function NotFound() {
  const router = useRouter()
  useEffect(() => { router.replace("/login") }, [router])
  return (
    <div style={{ position:"fixed",inset:0,zIndex:2147483647,display:"flex",alignItems:"center",justifyContent:"center",background:"#000",color:"#fff",fontSize:14,fontFamily:"system-ui,sans-serif" }}>
      Redirecting...
    </div>
  )
}

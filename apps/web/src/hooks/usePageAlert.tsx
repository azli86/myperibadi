"use client"

import { useState } from "react"
import { ModernAlert, AlertType } from "@/components/ui/ModernAlert"

type PageAlertConfig = {
  isOpen: boolean
  title: string
  description: string
  type: AlertType
  isConfirm?: boolean
  onConfirm?: () => void
}

export function usePageAlert(lang: string) {
  const [alertConfig, setAlertConfig] = useState<PageAlertConfig>({
    isOpen: false,
    title: "",
    description: "",
    type: "info",
    isConfirm: false,
  })

  function showAlert(title: string, description: string, type: AlertType = "info") {
    setAlertConfig({
      isOpen: true,
      title,
      description,
      type,
      isConfirm: false,
    })
  }

  function showConfirm(title: string, description: string, onConfirm: () => void, type: AlertType = "warning") {
    setAlertConfig({
      isOpen: true,
      title,
      description,
      type,
      isConfirm: true,
      onConfirm,
    })
  }

  const alertModal = (
    <ModernAlert
      isOpen={alertConfig.isOpen}
      title={alertConfig.title}
      description={alertConfig.description}
      type={alertConfig.type}
      isConfirm={alertConfig.isConfirm}
      onConfirm={alertConfig.onConfirm}
      onClose={() => setAlertConfig((prev) => ({ ...prev, isOpen: false }))}
      confirmText={lang === "EN" ? "OK" : "OK"}
      cancelText={lang === "EN" ? "Cancel" : "Batal"}
    />
  )

  return {
    showAlert,
    showConfirm,
    alertModal,
  }
}

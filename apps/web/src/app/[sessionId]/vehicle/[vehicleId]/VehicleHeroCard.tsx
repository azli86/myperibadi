"use client"

import { Bike, Bus, Car, Gauge, ImagePlus, Loader2, Wrench } from "lucide-react"
import { CachedVehicleImage } from "@/components/vehicle/CachedVehicleImage"
import { ModenHero } from "@/components/ui/ModenHero"

export type VehicleHeroData = {
  id: number
  name: string
  vehicle_type?: string | null
  registration_number?: string | null
  current_odometer?: number | null
  has_image?: boolean
  image_url?: string | null
  brand?: string | null
  model?: string | null
}

function typeIcon(vehicleType?: string | null) {
  const t = (vehicleType || "").toLowerCase()
  if (t.includes("motor") || t.includes("bike") || t.includes("scooter")) return Bike
  if (t.includes("van") || t.includes("mpv") || t.includes("truck") || t.includes("lorry")) return Bus
  return Car
}

export function VehicleHeroCard({
  vehicle,
  imageBust = 0,
  isBm,
  uploadingImage,
  monthCost,
  monthLabel,
  dueCount,
  overdueCount,
  onImagePick,
}: {
  vehicle: VehicleHeroData
  imageBust?: number
  isBm: boolean
  uploadingImage?: boolean
  monthCost: number
  monthLabel?: string | null
  dueCount: number
  overdueCount: number
  onImagePick?: (file: File | null) => void
}) {
  const Icon = typeIcon(vehicle.vehicle_type)
  const tr = (bm: string, en: string) => (isBm ? bm : en)
  const odo = vehicle.current_odometer != null ? `${Number(vehicle.current_odometer).toLocaleString("en-MY")} km` : "—"
  const brandModel = [vehicle.brand, vehicle.model].filter(Boolean).join(" ")
  const nameHasModel = brandModel && vehicle.name.toLowerCase().includes(brandModel.toLowerCase())
  const meta = [vehicle.registration_number, nameHasModel ? "" : brandModel].filter(Boolean).join(" · ")

  const picker = onImagePick ? (
    <input
      type="file"
      accept="image/jpeg,image/png,image/webp"
      className="hidden"
      disabled={uploadingImage}
      onChange={(e) => {
        onImagePick(e.target.files?.[0] || null)
        e.currentTarget.value = ""
      }}
    />
  ) : null

  return (
    <div className="space-y-3">
      {vehicle.has_image ? (
        <div className="relative h-44 w-full overflow-hidden rounded-[1.5rem] border border-[var(--border)] sm:h-52 md:h-60">
          <CachedVehicleImage
            vehicleId={vehicle.id}
            hasImage
            imageUrl={vehicle.image_url}
            alt={vehicle.name}
            bust={imageBust}
            className="h-full w-full"
            imgClassName="h-full w-full object-cover object-center"
            fallbackIconSize={56}
          />
          {onImagePick && (
            <label className="absolute bottom-3 right-3 inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-4 text-xs font-semibold text-[var(--text)]">
              {uploadingImage ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
              {tr("Tukar gambar", "Change photo")}
              {picker}
            </label>
          )}
        </div>
      ) : null}

      <ModenHero
        label={
          <>
            <Icon size={16} />
            <span className="min-w-0 truncate">{vehicle.name}</span>
            {meta ? <span className="min-w-0 truncate opacity-70">· {meta}</span> : null}
          </>
        }
        currency={null}
        amount={odo}
        amountSize="clamp(2rem, 9vw, 2.75rem)"
        stats={[
          { key: "cost", tone: "out", icon: <Wrench size={15} strokeWidth={2.2} />, label: monthLabel ? tr(`Kos ${monthLabel}`, `Cost ${monthLabel}`) : tr("Kos bulan ini", "This month"), value: `RM ${monthCost.toLocaleString("en-MY", { maximumFractionDigits: 0 })}` },
          { key: "due", tone: overdueCount > 0 ? "out" : "neutral", icon: <Gauge size={15} strokeWidth={2.2} />, label: tr("Perlu servis", "Needs service"), value: String(dueCount) },
        ]}
      />

      {!vehicle.has_image && onImagePick ? (
        <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-dashed border-[var(--border-strong)] text-sm font-semibold text-[var(--muted)]">
          {uploadingImage ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
          {tr("Tambah gambar (pilihan)", "Add a photo (optional)")}
          {picker}
        </label>
      ) : null}
    </div>
  )
}

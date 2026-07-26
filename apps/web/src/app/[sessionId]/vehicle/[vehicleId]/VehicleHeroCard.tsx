"use client"

import { Bike, Bus, Car, Gauge, Loader2, Settings2, Truck } from "lucide-react"
import { cn } from "@/lib/utils"
import { CachedVehicleImage } from "@/components/vehicle/CachedVehicleImage"

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
  if (t.includes("van") || t.includes("mpv")) return Bus
  if (t.includes("truck") || t.includes("lorry")) return Truck
  return Car
}

function typeLabel(vehicleType?: string | null, isBm?: boolean) {
  const t = (vehicleType || "car").toLowerCase()
  if (t.includes("motor") || t.includes("bike") || t.includes("scooter")) {
    return isBm ? "Motorsikal" : "Motorcycle"
  }
  if (t.includes("van")) return "Van"
  if (t.includes("truck") || t.includes("lorry")) return isBm ? "Lori" : "Truck"
  if (t.includes("other") || t.includes("lain")) return isBm ? "Lain" : "Other"
  return isBm ? "Kereta" : "Car"
}

export function VehicleHeroCard({
  vehicle,
  imageBust = 0,
  isBm,
  uploadingImage,
  onSettings,
  onImagePick,
}: {
  vehicle: VehicleHeroData
  imageBust?: number
  isBm: boolean
  uploadingImage?: boolean
  onSettings: () => void
  onImagePick?: (file: File | null) => void
}) {
  const Icon = typeIcon(vehicle.vehicle_type)
  const label = typeLabel(vehicle.vehicle_type, isBm)
  const odo =
    vehicle.current_odometer != null
      ? `${Number(vehicle.current_odometer).toLocaleString()} km`
      : null

  return (
    <section className="relative w-full pb-5">
      {/* Full width, height capped so hero stays compact */}
      <div className="relative h-48 w-full sm:h-56 md:h-64">
        <div className="absolute inset-0 overflow-hidden rounded-[1.75rem] border border-[var(--border)] shadow-[var(--shadow-card)]">
        {vehicle.has_image ? (
          <CachedVehicleImage
            vehicleId={vehicle.id}
            hasImage
            imageUrl={vehicle.image_url}
            alt={vehicle.name}
            bust={imageBust}
            className="h-full w-full overflow-hidden rounded-[1.75rem]"
            imgClassName="h-full w-full object-cover object-center"
            fallbackIconSize={56}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-[1.75rem] bg-[var(--surface-tint)]">
            <Icon
              size={56}
              className="text-[var(--muted)] opacity-40 md:h-16 md:w-16"
              strokeWidth={1.4}
            />
          </div>
        )}


        </div>

        {/* Top row */}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3.5 sm:p-4 md:p-5 lg:p-6">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_88%,transparent)] px-2.5 py-1.5 text-[0.65rem] font-bold text-[var(--text)] backdrop-blur-md md:px-3 md:py-2 md:text-xs">
            <Icon size={13} className="text-[var(--accent2)]" />
            {label}
          </span>

          <div className="flex items-center gap-2">
            {onImagePick && (
              <label
                className={cn(
                  "inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_88%,transparent)] text-[var(--text)] backdrop-blur-md transition active:scale-95 md:h-11 md:w-11",
                  uploadingImage && "opacity-60"
                )}
                title={isBm ? "Tukar gambar" : "Change photo"}
              >
                {uploadingImage ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <span className="text-[0.65rem] font-black">IMG</span>
                )}
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
              </label>
            )}
            <button
              type="button"
              onClick={onSettings}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_88%,transparent)] text-[var(--text)] backdrop-blur-md transition active:scale-95 md:h-11 md:w-11"
              aria-label={isBm ? "Tetapan kenderaan" : "Vehicle settings"}
            >
              <Settings2 size={17} />
            </button>
          </div>
        </div>

        {/* Bottom content */}
        <div className="absolute inset-x-0 -bottom-3 flex flex-wrap items-center justify-center gap-1.5 px-2.5 sm:px-3 md:px-4 lg:px-5">
          <span className="inline-flex max-w-[42%] items-center truncate rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_90%,transparent)] px-2.5 py-1 text-[0.7rem] font-black text-[var(--text)] shadow-sm backdrop-blur-md md:px-3.5 md:py-1.5 md:text-sm">
            {vehicle.name}
          </span>
          {vehicle.registration_number ? (
            <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_90%,transparent)] px-2.5 py-1 text-[0.7rem] font-black uppercase tracking-wide text-[var(--text)] shadow-sm backdrop-blur-md md:px-3.5 md:py-1.5 md:text-sm">
              {vehicle.registration_number}
            </span>
          ) : null}
          {odo ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_90%,transparent)] px-2.5 py-1 text-[0.7rem] font-bold text-[var(--text)] shadow-sm backdrop-blur-md md:px-3.5 md:py-1.5 md:text-sm">
              <Gauge size={12} className="text-[var(--muted)] md:h-3.5 md:w-3.5" />
              {odo}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_90%,transparent)] px-2.5 py-1 text-[0.7rem] font-bold text-[var(--muted)] shadow-sm backdrop-blur-md md:px-3.5 md:py-1.5 md:text-sm">
              <Gauge size={12} />
              {isBm ? "Tiada odo" : "No odo"}
            </span>
          )}
        </div>
      </div>
    </section>
  )
}

/** Fixed maintenance catalog for the vehicle detail board UI. */

export type MaintenanceStatus = "GOOD" | "DUE SOON" | "OVERDUE" | "NOT SET"

export type MaintenanceCatalogItem = {
  key: string
  name: string
  nameBm: string
  icon: "oil" | "gear" | "coolant" | "filter" | "spark" | "brake" | "fluid" | "tyre" | "align" | "battery" | "inspect" | "other"
}

export type MaintenanceCatalogGroup = {
  key: string
  title: string
  titleBm: string
  subtitle: string
  subtitleBm: string
  items: MaintenanceCatalogItem[]
}

export const MAINTENANCE_GROUPS: MaintenanceCatalogGroup[] = [
  {
    key: "engine",
    title: "Engine & Transmission",
    titleBm: "Enjin & Transmisi",
    subtitle: "Vital fluids & filters",
    subtitleBm: "Bendalir & penapis penting",
    items: [
      { key: "engine_oil", name: "Engine Oil", nameBm: "Minyak Enjin", icon: "oil" },
      { key: "gearbox_oil", name: "Gearbox Oil", nameBm: "Minyak Gearbox", icon: "gear" },
      { key: "coolant", name: "Coolant", nameBm: "Coolant", icon: "coolant" },
      { key: "air_filter", name: "Air Filter", nameBm: "Penapis Udara", icon: "filter" },
      { key: "spark_plug", name: "Spark Plug", nameBm: "Spark Plug", icon: "spark" },
    ],
  },
  {
    key: "brakes",
    title: "Brakes",
    titleBm: "Brek",
    subtitle: "Pads, fluid & safety",
    subtitleBm: "Pad, bendalir & keselamatan",
    items: [
      { key: "brake_pad", name: "Brake Pad", nameBm: "Pad Brek", icon: "brake" },
      { key: "brake_fluid", name: "Brake Fluid", nameBm: "Bendalir Brek", icon: "fluid" },
    ],
  },
  {
    key: "tyres",
    title: "Tyres",
    titleBm: "Tayar",
    subtitle: "Wear, balance & alignment",
    subtitleBm: "Haus, balance & alignment",
    items: [
      { key: "tyre_rotation", name: "Tyre Rotation", nameBm: "Putaran Tayar", icon: "tyre" },
      { key: "alignment", name: "Alignment", nameBm: "Alignment", icon: "align" },
      { key: "balancing", name: "Balancing", nameBm: "Balancing", icon: "tyre" },
    ],
  },
  {
    key: "electrical",
    title: "Electrical",
    titleBm: "Elektrik",
    subtitle: "Battery & charging",
    subtitleBm: "Bateri & cas",
    items: [{ key: "battery", name: "Battery", nameBm: "Bateri", icon: "battery" }],
  },
  {
    key: "other",
    title: "Other Maintenance",
    titleBm: "Servis Lain",
    subtitle: "Inspections & custom items",
    subtitleBm: "Pemeriksaan & item khas",
    items: [
      { key: "general_inspection", name: "General Inspection", nameBm: "Pemeriksaan Umum", icon: "inspect" },
      { key: "custom_service", name: "Custom Service", nameBm: "Servis Khas", icon: "other" },
    ],
  },
]

/** Match free-text service_type from API to a catalog item key. */
export function matchCatalogKey(serviceType: string | null | undefined): string | null {
  const raw = (serviceType || "").trim().toLowerCase()
  if (!raw) return null
  for (const group of MAINTENANCE_GROUPS) {
    for (const item of group.items) {
      const names = [item.key, item.name, item.nameBm].map((n) => n.toLowerCase())
      if (names.some((n) => raw === n || raw.includes(n) || n.includes(raw))) {
        return item.key
      }
    }
  }
  return null
}

/**
 * Status rules:
 * OVERDUE  — odo >= next odo OR next date < today
 * DUE SOON — remaining km <= 500 OR remaining days <= 14
 * GOOD     — remaining km > 500 AND remaining days > 14 (or only one metric set & healthy)
 * NOT SET  — no next date and no next odometer
 */
export function calcMaintenanceStatus(args: {
  currentOdometer?: number | null
  nextServiceOdometer?: number | null
  nextServiceDate?: string | null
  today?: Date
}): MaintenanceStatus {
  const today = args.today ? new Date(args.today) : new Date()
  today.setHours(0, 0, 0, 0)

  const hasOdo = args.nextServiceOdometer != null && Number.isFinite(Number(args.nextServiceOdometer))
  const hasDate = Boolean(args.nextServiceDate)

  if (!hasOdo && !hasDate) return "NOT SET"

  let kmRemaining: number | null = null
  let daysRemaining: number | null = null

  if (hasOdo && args.currentOdometer != null && Number.isFinite(Number(args.currentOdometer))) {
    kmRemaining = Number(args.nextServiceOdometer) - Number(args.currentOdometer)
    if (kmRemaining <= 0) return "OVERDUE"
  } else if (hasOdo && (args.currentOdometer == null || !Number.isFinite(Number(args.currentOdometer)))) {
    // next odo set but no current reading — treat as NOT SET for km side only
    kmRemaining = null
  }

  if (hasDate) {
    const d = new Date(`${args.nextServiceDate}T00:00:00`)
    if (!Number.isNaN(d.getTime())) {
      daysRemaining = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      if (daysRemaining < 0) return "OVERDUE"
    }
  }

  if (
    (kmRemaining != null && kmRemaining <= 500) ||
    (daysRemaining != null && daysRemaining <= 14)
  ) {
    return "DUE SOON"
  }

  // At least one metric is healthy
  if (kmRemaining != null || daysRemaining != null) return "GOOD"
  return "NOT SET"
}

export function formatNextServiceLabel(args: {
  nextServiceOdometer?: number | null
  nextServiceDate?: string | null
  isBm: boolean
}): string {
  const bits: string[] = []
  if (args.nextServiceOdometer != null) {
    bits.push(`${Number(args.nextServiceOdometer).toLocaleString()} km`)
  }
  if (args.nextServiceDate) bits.push(args.nextServiceDate)
  if (!bits.length) return args.isBm ? "Belum ditetapkan" : "Not set"
  return `${args.isBm ? "Seterusnya" : "Next"}: ${bits.join(" · ")}`
}

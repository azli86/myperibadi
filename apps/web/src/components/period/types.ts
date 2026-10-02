// Shapes returned by /api/period, and the labels shown for its keys.

export type PeriodCycle = {
  id: number
  start_date: string
  end_date: string | null
  period_length: number | null
  notes: string | null
}

export type PeriodDayLog = {
  date: string
  flow: string | null
  symptoms: string[]
  mood: string | null
  temperature: number | null
  ovulation_test: string | null
  notes: string | null
}

export type Upcoming = {
  start: string
  end: string
  ovulation: string | null
  fertile_start: string | null
  fertile_end: string | null
  /** A span the period may start within, not a single expected stretch. */
  uncertain: boolean
}

export type PeriodStats = {
  records: number
  cycles_counted: number
  shortest: number | null
  longest: number | null
  median: number | null
  spread: number | null
  shortest_period: number | null
  longest_period: number | null
}

export type PeriodAlert = { key: "short_cycle" | "long_cycle" | "missed" | "long_period" | string; value: number }

export type PeriodSummary = {
  avg_cycle_length: number
  avg_period_length: number
  cycle_length_known: boolean
  cycles_counted: number
  regular: boolean | null
  irregular: boolean
  cycle_range: [number, number] | null
  status: "no_data" | "period" | "waiting" | "expected" | "late" | "pregnant"
  cycle_day: number | null
  period_day: number | null
  days_until_next: number | null
  days_late: number | null
  next_start: string | null
  next_end: string | null
  next_range_start: string | null
  next_range_end: string | null
  anchored_by_test: boolean
  fertile_reliable: boolean
  stats: PeriodStats
  ovulation_date: string | null
  fertile_start: string | null
  fertile_end: string | null
  pregnancy_week: number | null
  upcoming: Upcoming[]
  alerts: PeriodAlert[]
}

export type PeriodPrefs = {
  remind_before_days: number
  remind_late: boolean
  remind_open: boolean
  remind_supplies: boolean
  channels: { push: boolean; whatsapp: boolean; telegram: boolean }
  pregnancy_mode: boolean
  spend_category_id: number | null
  ramadan: Record<string, [string, string]>
  qada_paid: Record<string, number>
}

export type QadaYear = {
  year: string
  ramadan_start: string
  ramadan_end: string
  confirmed: boolean
  missed: number
  made_up: number
  remaining: number
}

export type PeriodSpend = { category_id: number; category_name: string; this_month: number; monthly_average: number }

export type PeriodOverview = {
  today: string
  cycles: PeriodCycle[]
  logs: PeriodDayLog[]
  summary: PeriodSummary
  prefs: PeriodPrefs
  qada: QadaYear[]
  spend: PeriodSpend | null
  options: { flows: string[]; symptoms: string[]; moods: string[]; ovulation_tests: string[] }
}

const LABELS: Record<string, [string, string]> = {
  spotting: ["Tompok", "Spotting"],
  light: ["Sikit", "Light"],
  medium: ["Sederhana", "Medium"],
  heavy: ["Banyak", "Heavy"],
  cramps: ["Senggugut", "Cramps"],
  headache: ["Sakit kepala", "Headache"],
  bloating: ["Kembung", "Bloating"],
  acne: ["Jerawat", "Acne"],
  backache: ["Sakit belakang", "Backache"],
  tired: ["Letih", "Tired"],
  tender: ["Payudara sakit", "Tender breasts"],
  nausea: ["Loya", "Nausea"],
  happy: ["Gembira", "Happy"],
  calm: ["Tenang", "Calm"],
  sensitive: ["Sensitif", "Sensitive"],
  anxious: ["Cemas", "Anxious"],
  sad: ["Sedih", "Sad"],
  irritable: ["Mudah marah", "Irritable"],
  positive: ["Positif", "Positive"],
  negative: ["Negatif", "Negative"],
}

export function periodLabel(key: string, isBm: boolean) {
  const pair = LABELS[key]
  return pair ? pair[isBm ? 0 : 1] : key
}

// Errors the API returns in English, in the reader's language.
const ERRORS_BM: Record<string, string> = {
  "The start date cannot be in the future.": "Tarikh mula tidak boleh pada masa depan.",
  "The end date cannot be before the start date.": "Tarikh tamat tidak boleh sebelum tarikh mula.",
  "These dates overlap another recorded period.": "Tarikh ini bertindih dengan rekod period lain.",
  "The start date is too far in the past.": "Tarikh mula terlalu lama dahulu.",
  "These settings are not valid.": "Tetapan ini tidak sah.",
  "A period is already open. End it first, or edit it.": "Period masih terbuka. Tamatkannya dahulu, atau edit rekod itu.",
  "A period cannot be longer than 15 days.": "Satu period tidak boleh lebih 15 hari.",
  "A day in the future cannot be logged.": "Hari pada masa depan tidak boleh dicatat.",
  "The temperature must be between 34 and 42 °C.": "Suhu mesti antara 34 dan 42 °C.",
  "Ramadan must run 1 to 31 days.": "Ramadan mesti antara 1 hingga 31 hari.",
  "That category was not found.": "Kategori itu tidak dijumpai.",
}

export function periodError(detail: unknown, isBm: boolean) {
  const text = typeof detail === "string" ? detail : ""
  if (!text) return isBm ? "Cuba lagi." : "Please try again."
  return isBm ? ERRORS_BM[text] || text : text
}

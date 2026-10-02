"use client"

import Link from "next/link"
import { AppSheet } from "@/components/ui/AppSheet"
import { HelpBlock, HelpCommands, HelpNote, HelpStep } from "@/components/ui/HelpParts"

/** How to use Period Tracker: in the app, for an irregular cycle, and from the bot. */
export function PeriodHelpSheet({ open, onClose, isBm, sessionId }: { open: boolean; onClose: () => void; isBm: boolean; sessionId: string }) {
  const tr = (bm: string, en: string) => (isBm ? bm : en)
  // [BM command, EN command, BM text, EN text]. Either language works for any account;
  // the sheet shows the one that matches the page.
  const commands: Array<[string, string, string, string]> = [
    ["period", "period", "Status dan ramalan period seterusnya", "Status and the next period's prediction"],
    ["period mula", "period start", "Period bermula hari ini", "Your period started today"],
    ["period tamat", "period end", "Period tamat hari ini", "Your period ended today"],
    ["period mula semalam", "period start yesterday", "Period bermula semalam (atau @DDMMYYYY untuk tarikh lain)", "Your period started yesterday (or @DDMMYYYY for another date)"],
    ["period aliran banyak", "period flow heavy", "Catat aliran: tompok, sikit, sederhana atau banyak", "Log the flow: spotting, light, medium or heavy"],
    ["period senggugut letih", "period cramps tired", "Catat simptom: senggugut, letih, kembung, pening, jerawat, loya…", "Log symptoms: cramps, tired, bloating, headache, acne, nausea…"],
    ["period mood sedih", "period mood sad", "Catat mood: gembira, tenang, sensitif, cemas, sedih, marah", "Log your mood: happy, calm, sensitive, anxious, sad, irritable"],
    ["period suhu 36.6", "period temp 36.6", "Catat suhu badan (°C)", "Log your body temperature (°C)"],
    ["period ovulasi positif", "period ovulation positive", "Catat ujian ovulasi (positif atau negatif)", "Log an ovulation test (positive or negative)"],
    ["period qada", "period qada", "Lihat baki puasa ganti", "See the fasts you still have to make up"],
    ["period qada 2", "period qada 2", "Tanda 2 hari puasa sudah diganti", "Mark 2 fasting days as made up"],
    ["period bantuan", "period help", "Senarai arahan ini dalam chat", "This list of commands, in the chat"],
  ]
  return (
    <AppSheet open={open} onClose={onClose} id="period-help" title={tr("Cara guna Period Tracker", "How to use Period Tracker")} size="md">
      <div className="space-y-4">
        <HelpBlock title={tr("Dalam app", "In the app")}>
          <ol className="space-y-3">
            <HelpStep n={1}>
              {tr(
                "Tekan Mula hari ini bila period bermula, dan Tamat hari ini bila ia habis. Terlupa? Tekan hari itu dalam tab Kalendar, atau Tambah rekod dalam tab Sejarah.",
                "Tap Started today when your period starts and Ended today when it ends. Forgot? Tap that day in the Calendar tab, or Add record in the History tab.",
              )}
            </HelpStep>
            <HelpStep n={2}>
              {tr(
                "Tekan Catat hari ini, atau mana-mana hari dalam Kalendar, untuk catat aliran, simptom, mood, suhu badan dan ujian ovulasi.",
                "Tap Log today, or any day in the Calendar, to note your flow, symptoms, mood, temperature and ovulation test.",
              )}
            </HelpStep>
            <HelpStep n={3}>
              {tr(
                "Tab Ringkasan menunjukkan bila period seterusnya dan tempoh subur. Dalam Kalendar: merah ialah period, garis putus-putus ialah dijangka, biru muda ialah subur, dan biru tua ialah ovulasi.",
                "The Overview tab shows when your next period and fertile window are. On the Calendar: red is a period, dashed is expected, light blue is fertile and dark blue is ovulation.",
              )}
            </HelpStep>
            <HelpStep n={4}>
              {tr(
                "Tab Lagi ada peringatan, puasa ganti (qada), belanja keperluan dan mod kehamilan.",
                "The More tab has reminders, fasts to make up (qada), supplies spending and pregnancy mode.",
              )}
            </HelpStep>
          </ol>
          <HelpNote>
            {tr(
              "Ramalan menjadi lebih tepat selepas 3 rekod atau lebih. Ia anggaran sahaja, bukan kaedah perancang keluarga.",
              "Predictions get more accurate after 3 or more records. They are estimates only, not a method of contraception.",
            )}
          </HelpNote>
        </HelpBlock>

        <HelpBlock title={tr("Kalau kitaran tak teratur", "If your cycle is irregular")}>
          <ol className="space-y-3">
            <HelpStep n={1}>
              {tr(
                "Bila panjang kitaran berbeza lebih seminggu, period dijangka sebagai julat (contoh: 14–18 Okt), bukan satu tarikh.",
                "When your cycle length varies by more than a week, the period is expected as a range (e.g. 14–18 Oct), not one date.",
              )}
            </HelpStep>
            <HelpStep n={2}>
              {tr(
                "Tempoh subur tidak dianggar, kerana kalendar tidak dapat meletakkannya dengan tepat.",
                "No fertile window is estimated, because a calendar cannot place it reliably.",
              )}
            </HelpStep>
            <HelpStep n={3}>
              {tr(
                "Catat ujian ovulasi positif untuk anggaran yang lebih baik. Ovulasi dikira sehari selepas ujian, dan period kira-kira 14 hari kemudian (± 2 hari).",
                "Log a positive ovulation test for a better estimate. Ovulation is counted a day after the test and your period about 14 days later (± 2 days).",
              )}
            </HelpStep>
            <HelpStep n={4}>
              {tr(
                "Tab Sejarah ada ringkasan untuk doktor: kitaran terpendek, terpanjang dan biasa. Boleh disalin atau dieksport.",
                "The History tab has a summary for your doctor: shortest, longest and typical cycle. You can copy or export it.",
              )}
            </HelpStep>
          </ol>
        </HelpBlock>

        <HelpBlock title={tr("Dari WhatsApp, Telegram atau web chat", "From WhatsApp, Telegram or web chat")}>
          <ol className="space-y-3">
            <HelpStep n={1}>
              {tr("Sambungkan WhatsApp atau Telegram anda sekali sahaja di ", "Connect your WhatsApp or Telegram once, in ")}
              <Link href={`/${sessionId}/connector`} onClick={onClose} className="font-semibold text-[var(--btn-primary-bg)] underline underline-offset-2 dark:text-[#5aa6ff]">
                Connector
              </Link>
              {tr(". Web chat tidak perlu disambung.", ". Web chat needs no connecting.")}
            </HelpStep>
            <HelpStep n={2}>
              {tr(
                "WhatsApp: hantar mesej ke chat dengan diri sendiri (Message yourself). Telegram: hantar kepada bot dalam chat peribadi. Web chat: buka Chat dalam app.",
                "WhatsApp: send the message in your chat with yourself (Message yourself). Telegram: send it to the bot in a private chat. Web chat: open Chat in the app.",
              )}
            </HelpStep>
            <HelpStep n={3}>{tr("Taip arahan di bawah. Bot membalas dengan status terkini.", "Type a command below. The bot replies with your latest status.")}</HelpStep>
          </ol>
          <div className="mt-4">
            <HelpCommands commands={commands.map(([cmdBm, cmdEn, bm, en]): [string, string] => [isBm ? cmdBm : cmdEn, isBm ? bm : en])} />
          </div>
          <HelpNote>
            {tr(
              "Arahan dalam BM dan English kedua-duanya diterima (contoh: period mula = period start), dan balasan ikut bahasa akaun anda. Tambah semalam atau @DDMMYYYY pada arahan catatan untuk tarikh lain. Bot tidak pernah membalas arahan period dalam group WhatsApp.",
              "Commands work in both English and Malay (e.g. period start = period mula), and replies follow your account language. Add yesterday or @DDMMYYYY to a log command for another date. The bot never answers period commands in a WhatsApp group.",
            )}
          </HelpNote>
        </HelpBlock>

        <HelpBlock title={tr("Privasi", "Privacy")}>
          <HelpNote>
            {tr(
              "Rekod period hanya untuk anda dan tidak dikongsi dengan household. Peringatan hanya dihantar ke chat peribadi anda, tidak sekali-kali ke group. Anda boleh matikan Period Tracker bila-bila masa di Tetapan; rekod tidak dipadam.",
              "Your period records are for you only and are not shared with your household. Reminders go only to your own chats, never to a group. You can switch Period Tracker off any time in Settings; your records are kept.",
            )}
          </HelpNote>
        </HelpBlock>
      </div>
    </AppSheet>
  )
}

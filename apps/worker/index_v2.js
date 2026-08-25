const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion, downloadMediaMessage } = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const qrcodeTerminal = require("qrcode-terminal");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");
const http = require("http");
const urllib = require("url");
const pino = require("pino");

const AUTH_DIR = path.join(__dirname, "auth_info");
const QUARANTINE_DIR = path.join(__dirname, "auth_quarantine");
const QUARANTINE_INDEX_PATH = path.join(QUARANTINE_DIR, "quarantined_sessions.json");
const LID_MAPPING_DIR = path.join(__dirname, "lid_mapping");
const API_ENV_PATH = path.join(__dirname, "..", "api", ".env");
const sessions = {};
const WA_WEBHOOK_TIMEOUT_MS = parseInt(process.env.WA_WEBHOOK_TIMEOUT_MS || "45000", 10);
const WA_MESSAGE_QUEUE_MAX = Math.max(20, parseInt(process.env.WA_MESSAGE_QUEUE_MAX || "200", 10) || 200);
const WA_PENDING_MEDIA_TTL_MS = Math.max(60000, parseInt(process.env.WA_PENDING_MEDIA_TTL_MS || "600000", 10) || 600000);
const WA_CRYPTO_ERROR_WINDOW_MS = Math.max(60000, parseInt(process.env.WA_CRYPTO_ERROR_WINDOW_MS || "180000", 10) || 180000);
const WA_CRYPTO_ERROR_QUARANTINE_THRESHOLD = Math.max(8, parseInt(process.env.WA_CRYPTO_ERROR_QUARANTINE_THRESHOLD || "50", 10) || 50);
const WA_AUTOSTART_ALL_SESSIONS = process.env.WA_AUTOSTART_ALL_SESSIONS === "true";
const WA_AUTOSTART_STAGGER_MS = Math.max(0, parseInt(process.env.WA_AUTOSTART_STAGGER_MS || "1800", 10) || 0);
const WA_AUTOSTART_MAX_SESSIONS_RAW = parseInt(process.env.WA_AUTOSTART_MAX_SESSIONS || "300", 10);
const WA_AUTOSTART_MAX_SESSIONS = Number.isFinite(WA_AUTOSTART_MAX_SESSIONS_RAW) && WA_AUTOSTART_MAX_SESSIONS_RAW > 0
  ? WA_AUTOSTART_MAX_SESSIONS_RAW
  : 0;
const WA_KEEP_ACTIVE_MS = Math.max(30000, parseInt(process.env.WA_KEEP_ACTIVE_MS || "60000", 10) || 60000);
const WA_KEEP_ACTIVE_STUCK_MS = Math.max(60000, parseInt(process.env.WA_KEEP_ACTIVE_STUCK_MS || "120000", 10) || 120000);
const WHATSAPP_WEBHOOK_SECRET = getEnvValue("WHATSAPP_WEBHOOK_SECRET") || "";
if (!WHATSAPP_WEBHOOK_SECRET) {
  throw new Error("WHATSAPP_WEBHOOK_SECRET environment variable is required");
}
const GROUP_RULE_CACHE_MS = 15000;
const WA_MARK_READ_MODE_OPTIONS = new Set(["none", "self", "self_and_allowed_groups"]);
const WA_MARK_READ_MODE_RAW = (process.env.WA_MARK_READ_MODE || "none").toLowerCase();
const WA_MARK_READ_MODE = WA_MARK_READ_MODE_OPTIONS.has(WA_MARK_READ_MODE_RAW) ? WA_MARK_READ_MODE_RAW : "none";
const WA_ALLOW_NON_SELF_DM = (process.env.WA_ALLOW_NON_SELF_DM || "false").toLowerCase() === "true";
const WA_MEDIA_REUPLOAD_NOTICE_BM = "Gambar ambil masa terlalu lama atau gagal diproses. Sila upload semula gambar ini.";
const WA_MEDIA_REUPLOAD_NOTICE_EN = "Image processing took too long or failed. Please re-upload this image.";
// ── API Gateway ──
// Default ke localhost. Set WA_API_GATEWAY_URL untuk guna CF Worker (contoh: https://gateway.budget.digitalport.my)
const WA_API_GATEWAY_URL = (getEnvValue("WA_API_GATEWAY_URL") || "http://127.0.0.1:8023").replace(/\/+$/, "");
const WA_WORKER_HOST = getEnvValue("WA_WORKER_HOST") || "127.0.0.1";
const WA_WORKER_PORT = parseInt(getEnvValue("WA_WORKER_PORT") || "8024", 10) || 8024;
const _API_URL = urllib.parse(WA_API_GATEWAY_URL);
const _API_IS_HTTPS = _API_URL.protocol === "https:";
const _API_MOD = _API_IS_HTTPS ? require("https") : require("http");
const _API_HOST = _API_URL.hostname || "127.0.0.1";
const _API_PORT = Number(_API_URL.port) || (_API_IS_HTTPS ? 443 : 80);

if (!WA_MARK_READ_MODE_OPTIONS.has(WA_MARK_READ_MODE_RAW)) {
  console.warn(`⚠️ Invalid WA_MARK_READ_MODE="${WA_MARK_READ_MODE_RAW}". Falling back to "none".`);
}
console.log(`ℹ️ WA_MARK_READ_MODE=${WA_MARK_READ_MODE}`);
console.log(`ℹ️ WA_ALLOW_NON_SELF_DM=${WA_ALLOW_NON_SELF_DM}`);
console.log(`ℹ️ WA_AUTOSTART_STAGGER_MS=${WA_AUTOSTART_STAGGER_MS}`);
console.log(`ℹ️ WA_AUTOSTART_MAX_SESSIONS=${WA_AUTOSTART_MAX_SESSIONS || "ALL"}`);
console.log(`ℹ️ WA_KEEP_ACTIVE_MS=${WA_KEEP_ACTIVE_MS}`);
console.log(`ℹ️ WA_CRYPTO_ERROR_QUARANTINE_THRESHOLD=${WA_CRYPTO_ERROR_QUARANTINE_THRESHOLD}/${WA_CRYPTO_ERROR_WINDOW_MS}ms`);

function getEnvValue(name) {
  if (process.env[name]) return process.env[name];
  try {
    const envFile = fs.readFileSync(API_ENV_PATH, "utf8");
    for (const rawLine of envFile.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) continue;
      const key = line.slice(0, separatorIndex).trim();
      if (key !== name) continue;
      return line.slice(separatorIndex + 1).trim();
    }
  } catch (error) {
    return "";
  }
  return "";
}

// Bina HTTP request options guna gateway URL (CF Worker atau localhost)
function _apiOpts(method, path, extra = {}) {
  const opts = {
    hostname: _API_HOST,
    port: _API_PORT,
    path,
    method,
    rejectUnauthorized: false,
    ...extra,
  };
  return opts;
}

function formatPhone(jid) {
  if (!jid || typeof jid !== "string") return "";
  return jid.split(":")[0].split("@")[0].replace(/\D/g, "");
}

function normalizeJidUser(jid) {
  if (!jid || typeof jid !== "string") return null;
  return jid.split("@")[0].split(":")[0] || null;
}

function ensureLidMappingDir() {
  if (!fs.existsSync(LID_MAPPING_DIR)) {
    fs.mkdirSync(LID_MAPPING_DIR, { recursive: true });
  }
}

function loadLidMapping(userId) {
  ensureLidMappingDir();
  const mappingPath = path.join(LID_MAPPING_DIR, `user_${userId}.json`);
  if (!fs.existsSync(mappingPath)) return new Map();
  try {
    const data = JSON.parse(fs.readFileSync(mappingPath, "utf8"));
    return new Map(Object.entries(data));
  } catch (error) {
    console.warn(`⚠️ [${userId}] Failed to load LID mapping: ${error.message}`);
    return new Map();
  }
}

function saveLidMapping(userId, mapping) {
  ensureLidMappingDir();
  const mappingPath = path.join(LID_MAPPING_DIR, `user_${userId}.json`);
  try {
    const data = Object.fromEntries(mapping);
    fs.writeFileSync(mappingPath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.warn(`⚠️ [${userId}] Failed to save LID mapping: ${error.message}`);
  }
}

function rememberLidPhoneMapping(sessionObj, lidJid, phoneJid) {
  if (!sessionObj?.lidToPhoneMap) return;
  if (!lidJid || !phoneJid) return;
  if (typeof lidJid !== "string" || typeof phoneJid !== "string") return;
  if (!lidJid.endsWith("@lid")) return;
  const lidUser = normalizeJidUser(lidJid);
  const phone = formatPhone(phoneJid);
  if (!lidUser || !phone || phone.length < 6) return;
  const existing = sessionObj.lidToPhoneMap.get(lidUser);
  if (existing !== phone) {
    sessionObj.lidToPhoneMap.set(lidUser, phone);
    // Save to disk (throttled - only on new mappings)
    if (sessionObj.userId) {
      saveLidMapping(sessionObj.userId, sessionObj.lidToPhoneMap);
    }
  }
}

function rememberLidPhoneFromContact(sessionObj, contact) {
  if (!contact || typeof contact !== "object") return;
  const lidCandidate = typeof contact.lid === "string"
    ? contact.lid
    : (typeof contact.id === "string" && contact.id.endsWith("@lid") ? contact.id : "");
  const phoneCandidate = typeof contact.jid === "string"
    ? contact.jid
    : (typeof contact.id === "string" && contact.id.endsWith("@s.whatsapp.net") ? contact.id : "");
  rememberLidPhoneMapping(sessionObj, lidCandidate, phoneCandidate);
}

function getPhoneFromLidMapping(sessionObj, lidJid) {
  if (!sessionObj?.lidToPhoneMap) return "";
  if (!lidJid || typeof lidJid !== "string") return "";
  if (!lidJid.endsWith("@lid")) return "";
  const lidUser = normalizeJidUser(lidJid);
  if (!lidUser) return "";
  const mapped = sessionObj.lidToPhoneMap.get(lidUser) || "";
  return mapped.replace(/\D/g, "");
}

function resolveSessionPhone(sessionObj) {
  const meId = sessionObj?.sock?.user?.id || sessionObj?.sock?.user?.lid;
  if (!meId || typeof meId !== "string") return "";
  if (meId.endsWith("@s.whatsapp.net")) {
    return formatPhone(meId);
  }
  if (meId.endsWith("@lid")) {
    return getPhoneFromLidMapping(sessionObj, meId) || "";
  }
  return "";
}

function postLinkedPhone(userId, phone) {
  if (!WHATSAPP_WEBHOOK_SECRET || !userId || !phone) return;
  const data = JSON.stringify({ phone });
  const req = _API_MOD.request(_apiOpts("POST", `/internal/whatsapp/link-phone/${encodeURIComponent(userId)}`, {
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data),
      "X-WhatsApp-Webhook-Secret": WHATSAPP_WEBHOOK_SECRET,
    },
  }), (res) => {
    res.resume();
    if (res.statusCode < 200 || res.statusCode >= 300) {
      console.warn(`⚠️ [${userId}] Link phone notify failed status=${res.statusCode}`);
    }
  });
  req.setTimeout(5000, () => req.destroy(new Error("Link phone notify timeout")));
  req.on("error", (error) => console.warn(`⚠️ [${userId}] Link phone notify error: ${error.message}`));
  req.write(data);
  req.end();
}

function buildSelfReplyTargets({ remoteJid, userPhone, userLid }) {
  const targets = [];
  const appendTarget = (jid) => {
    if (!jid || targets.includes(jid)) return;
    targets.push(jid);
  };

  // Self-chat is usually anchored to the incoming LID thread.
  // Keep that as the primary reply target and only fall back to PN JID if needed.
  appendTarget(remoteJid);
  if (userLid) {
    appendTarget(`${userLid}@lid`);
  }
  if (userPhone) {
    appendTarget(`${userPhone}@s.whatsapp.net`);
  }

  return targets.filter(Boolean);
}

function isGroupJid(jid) {
  return Boolean(jid && typeof jid === "string" && jid.endsWith("@g.us"));
}

function isBroadcastJid(jid) {
  return Boolean(jid && typeof jid === "string" && (jid === "status@broadcast" || jid.endsWith("@broadcast") || jid.endsWith("@newsletter")));
}

function isGroupOrBroadcastJid(jid) {
  return isGroupJid(jid) || isBroadcastJid(jid);
}

function shouldMarkRead({ isSelfChat = false, isAllowedGroup = false }) {
  if (WA_MARK_READ_MODE === "self_and_allowed_groups") {
    return isSelfChat || isAllowedGroup;
  }
  if (WA_MARK_READ_MODE === "self") {
    return isSelfChat;
  }
  return false;
}

function getMediaDescriptor(innerMsg) {
  const img = innerMsg.imageMessage || (innerMsg.mimetype?.startsWith("image/") ? innerMsg : null);
  if (img) {
    return {
      mimeType: img.mimetype || "image/jpeg",
      fileName: img.fileName || "whatsapp-image.jpg",
    };
  }
  const audio = innerMsg.audioMessage || (innerMsg.mimetype?.startsWith("audio/") ? innerMsg : null);
  if (audio) {
    const isVoiceNote = Boolean(audio.ptt);
    return {
      mimeType: audio.mimetype || (isVoiceNote ? "audio/ogg" : "audio/mpeg"),
      fileName: audio.fileName || (isVoiceNote ? "whatsapp-voice.ogg" : "whatsapp-audio.m4a"),
      isVoice: true,
    };
  }
  const video = innerMsg.videoMessage || (innerMsg.mimetype?.startsWith("video/") ? innerMsg : null);
  if (video) {
    return {
      mimeType: video.mimetype || "video/mp4",
      fileName: video.fileName || "whatsapp-video.mp4",
    };
  }
  const doc = innerMsg.documentMessage || (innerMsg.mimetype ? innerMsg : null);
  if (doc) {
    return {
      mimeType: doc.mimetype || "application/octet-stream",
      fileName: doc.fileName || "whatsapp-document",
    };
  }
  return null;
}

function getQuotedMediaMessage(innerMsg) {
  const contextInfo = getContextInfo(innerMsg);
  const quotedMessage = contextInfo?.quotedMessage;
  if (!quotedMessage) return null;

  const unwrappedQuotedMessage = unwrapMessageContent(quotedMessage);
  const mediaDescriptor = getMediaDescriptor(unwrappedQuotedMessage);
  if (!mediaDescriptor) return null;

  return {
    message: unwrappedQuotedMessage,
    mediaDescriptor,
    stanzaId: contextInfo?.stanzaId || null,
    participant: contextInfo?.participant || null,
  };
}

const TXN_REFERENCE_PATTERN = /\b(TXN\d{2}-[A-Z0-9]{6})\b/i;

function extractTxnReference(value) {
  const text = (value || "").toString();
  const match = text.match(TXN_REFERENCE_PATTERN);
  return match ? match[1].toUpperCase() : null;
}

function enqueueSessionJob(sessionObj, label, job) {
  if (!sessionObj.jobQueue) {
    sessionObj.jobQueue = [];
    sessionObj.jobRunning = false;
  }
  if (sessionObj.jobQueue.length >= WA_MESSAGE_QUEUE_MAX) {
    console.warn(`⚠️ [${sessionObj.userId || "unknown"}] WhatsApp queue full; dropping ${label}.`);
    return false;
  }
  sessionObj.jobQueue.push({ label, job });
  if (!sessionObj.jobRunning) {
    drainSessionJobQueue(sessionObj);
  }
  return true;
}

async function drainSessionJobQueue(sessionObj) {
  if (sessionObj.jobRunning) return;
  sessionObj.jobRunning = true;
  while (sessionObj.jobQueue && sessionObj.jobQueue.length) {
    const { label, job } = sessionObj.jobQueue.shift();
    try {
      await job();
    } catch (err) {
      console.error(`❌ [${sessionObj.userId || "unknown"}] Queue job failed (${label}):`, err.message);
    }
  }
  sessionObj.jobRunning = false;
}

async function uploadMediaForTransaction({
  sock,
  userId,
  phone,
  sessionObj,
  jobContext,
  targetTxnRef,
  fallbackMessageId,
  includeContextText = false,
}) {
  const queuedPayload = jobContext.webhookPayload || {};
  const activeMediaDescriptor = jobContext.mediaDescriptor || jobContext.quotedMediaMessage?.mediaDescriptor;
  if (!activeMediaDescriptor) return;
  const activeMediaMessage = jobContext.mediaDescriptor
    ? jobContext.quotedMessage
    : {
        key: {
          remoteJid: jobContext.remoteJid,
          id: jobContext.quotedMediaMessage?.stanzaId || jobContext.messageId,
          fromMe: false,
          participant: jobContext.quotedMediaMessage?.participant || jobContext.quotedMessage.key.participant,
        },
        message: jobContext.quotedMediaMessage?.message,
      };
  const mediaBuffer = await downloadMessageMediaBuffer(
    sock,
    activeMediaMessage,
    userId,
    jobContext.mediaDescriptor ? "message" : "quoted"
  );
  if (!mediaBuffer) {
    const fallbackText = queuedPayload.lang === "EN"
      ? WA_MEDIA_REUPLOAD_NOTICE_EN
      : WA_MEDIA_REUPLOAD_NOTICE_BM;
    await sendPlainMessageToTargets({
      userId,
      remoteJid: jobContext.remoteJid,
      replyTargets: jobContext.replyTargets,
      quotedMessage: jobContext.quotedMessage,
      sessionObj,
      isSelfChat: jobContext.isSelfChat,
      text: fallbackText,
    });
    return;
  }
  const mediaWebhookPayload = {
    media_base64: mediaBuffer.toString("base64"),
    media_mime_type: activeMediaDescriptor.mimeType,
    media_file_name: activeMediaDescriptor.fileName,
    is_reply_message: Boolean(queuedPayload.is_reply_message),
  };
  if (queuedPayload.group_jid) mediaWebhookPayload.group_jid = queuedPayload.group_jid;
  if (queuedPayload.group_name) mediaWebhookPayload.group_name = queuedPayload.group_name;
  if (queuedPayload.participant_jid) mediaWebhookPayload.participant_jid = queuedPayload.participant_jid;
  if (queuedPayload.message_timestamp != null) mediaWebhookPayload.message_timestamp = queuedPayload.message_timestamp;
  if (queuedPayload.remote_jid) mediaWebhookPayload.remote_jid = queuedPayload.remote_jid;
  if (queuedPayload.push_name) mediaWebhookPayload.push_name = queuedPayload.push_name;
  if (queuedPayload.customer_name) mediaWebhookPayload.customer_name = queuedPayload.customer_name;
  if (queuedPayload.from_me != null) mediaWebhookPayload.from_me = Boolean(queuedPayload.from_me);
  if (queuedPayload.is_self_chat != null) mediaWebhookPayload.is_self_chat = Boolean(queuedPayload.is_self_chat);
  if (includeContextText) {
    if (queuedPayload.text) mediaWebhookPayload.text = queuedPayload.text;
    if (queuedPayload.latitude != null) mediaWebhookPayload.latitude = queuedPayload.latitude;
    if (queuedPayload.longitude != null) mediaWebhookPayload.longitude = queuedPayload.longitude;
    if (queuedPayload.location_name) mediaWebhookPayload.location_name = queuedPayload.location_name;
  }
  if (targetTxnRef) mediaWebhookPayload.target_txn_ref = targetTxnRef;
  if (fallbackMessageId) mediaWebhookPayload.message_id = `${fallbackMessageId}:media`;

  const mediaRes = await postToWebhook(userId, phone, mediaWebhookPayload);
  await handleWebhookResponse({
    userId,
    phone,
    remoteJid: jobContext.remoteJid,
    replyTargets: jobContext.replyTargets,
    quotedMessage: jobContext.quotedMessage,
    sessionObj,
    response: mediaRes,
    messageId: mediaWebhookPayload.message_id || fallbackMessageId,
    isSelfChat: jobContext.isSelfChat,
  });
}


function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeBotReplyText(text) {
  if (text == null) return text;
  return String(text).trim();
}

async function startTyping(sock, targetJid) {
  return;
}

async function sendTypingBeforeReply(sock, targetJid) {
  return;
}

async function sendPlainMessageToTargets({ userId, remoteJid, replyTargets, quotedMessage, sessionObj, isSelfChat, text }) {
  text = sanitizeBotReplyText(text);
  if (!text) return false;
  if (!isSelfChat && !isGroupJid(remoteJid)) return false;
  const targets = Array.isArray(replyTargets) && replyTargets.length ? replyTargets : [remoteJid].filter(Boolean);
  let sentMsg = null;
  for (const targetJid of targets) {
    try {
      sentMsg = await sessionObj.sock.sendMessage(targetJid, { text });
      break;
    } catch (err) {
      console.warn(`⚠️ [${userId}] Fallback message failed ${targetJid}: ${err.message}`);
    }
  }
  rememberOutgoingMessage(sessionObj, sentMsg, text);
  return Boolean(sentMsg);
}

function shouldProcessInboundMessage(sessionObj, messageKey) {
  if (!messageKey) return true;
  if (!sessionObj.processedInboundMessageCache) {
    sessionObj.processedInboundMessageCache = new Map();
  }
  const now = Date.now();
  for (const [key, value] of sessionObj.processedInboundMessageCache.entries()) {
    if (!value || value < now) sessionObj.processedInboundMessageCache.delete(key);
  }
  if (sessionObj.processedInboundMessageCache.has(messageKey)) {
    return false;
  }
  sessionObj.processedInboundMessageCache.set(messageKey, now + 120000);
  return true;
}

function shouldSendProcessingNotice(sessionObj, noticeKey) {
  if (!noticeKey) return true;
  if (!sessionObj.processingNoticeCache) {
    sessionObj.processingNoticeCache = new Map();
  }
  const now = Date.now();
  for (const [key, value] of sessionObj.processingNoticeCache.entries()) {
    if (!value || value < now) sessionObj.processingNoticeCache.delete(key);
  }
  if (sessionObj.processingNoticeCache.has(noticeKey)) {
    return false;
  }
  sessionObj.processingNoticeCache.set(noticeKey, now + 60000);
  return true;
}

async function sendProcessingNotice({ userId, remoteJid, replyTargets, quotedMessage, sessionObj, isSelfChat, fromMe, hasMedia, hasQuotedMedia, noticeKey = null }) {
  if (!isSelfChat || !fromMe) return;
  const text = `⚠️ *_Uploading your attachment and processing the transaction shortly._*`;
  const targetJid = remoteJid || (Array.isArray(replyTargets) && replyTargets.length ? replyTargets[0] : null);
  if (!targetJid) return;
  if (!shouldSendProcessingNotice(sessionObj, noticeKey || `${targetJid}:${text}`)) return;
  let sentMsg = null;
  try {
    sentMsg = await sessionObj.sock.sendMessage(targetJid, { text });
    console.log(`ℹ️ [${userId}] Processing notice sent to ${targetJid}`);
  } catch (err) {
    console.warn(`⚠️ [${userId}] Processing notice failed ${targetJid}: ${err.message}`);
  }
  rememberOutgoingMessage(sessionObj, sentMsg, text);
}

function pendingMediaKey(userId, remoteJid) {
  return `${userId}:${remoteJid || ""}`;
}

function storePendingCategoryMedia(sessionObj, key, context) {
  if (!sessionObj.pendingCategoryMedia) {
    sessionObj.pendingCategoryMedia = new Map();
  }
  sessionObj.pendingCategoryMedia.set(key, {
    expiresAt: Date.now() + WA_PENDING_MEDIA_TTL_MS,
    context,
  });
}

function takePendingCategoryMedia(sessionObj, key) {
  const pending = sessionObj.pendingCategoryMedia?.get(key);
  if (!pending) return null;
  sessionObj.pendingCategoryMedia.delete(key);
  if (pending.expiresAt < Date.now()) return null;
  return pending.context;
}

function sweepPendingCategoryMedia(sessionObj) {
  if (!sessionObj.pendingCategoryMedia) return;
  const now = Date.now();
  for (const [key, pending] of sessionObj.pendingCategoryMedia.entries()) {
    if (!pending || pending.expiresAt < now) {
      sessionObj.pendingCategoryMedia.delete(key);
    }
  }
}

function isCategoryPromptReply(replyText) {
  const text = (replyText || "").toString().toLowerCase();
  return text.includes("pilih kategori")
    || text.includes("pick one first")
    || text.includes("reply with 1, 2, or 3")
    || text.includes("balas nombor 1, 2, atau 3");
}

async function sendWebhookMediaAttachments({
  userId,
  sessionObj,
  targets,
  quotedMessage,
  isSelfChat,
  mediaUrls,
}) {
  const urls = (Array.isArray(mediaUrls) ? mediaUrls : [])
    .map((value) => (value || "").toString().trim())
    .filter(Boolean);
  if (!urls.length) return false;

  for (const targetJid of targets) {
    let sentForTarget = false;
    for (const imageUrl of urls) {
      try {
        const sentMsg = await sessionObj.sock.sendMessage(targetJid, { image: { url: imageUrl } });
        rememberOutgoingMessage(sessionObj, sentMsg, imageUrl);
        sentForTarget = true;
      } catch (err) {
        console.warn(`⚠️ [${userId}] Media reply target failed ${targetJid}: ${err.message}`);
      }
    }
    if (sentForTarget) {
      return true;
    }
  }

  return false;
}

async function handleWebhookResponse({
  userId,
  phone,
  remoteJid,
  replyTargets,
  quotedMessage,
  sessionObj,
  response,
  messageId,
  isSelfChat = false,
}) {
  const responseData = response?.data || {};
  const replyText = sanitizeBotReplyText(responseData?.reply);
  const bankDetailsReply = sanitizeBotReplyText(responseData?.bank_details_reply || "");
  const mediaUrls = [responseData?.qr_image_url, responseData?.payment_image_url, responseData?.catalog_image_url]
    .map((value) => (value || "").toString().trim())
    .filter(Boolean);
  const targets = Array.isArray(replyTargets) && replyTargets.length ? replyTargets : [remoteJid].filter(Boolean);

  if (replyText) {
    let sentMsg = null;
    let lastError = null;
    let sentTargetJid = null;

    // If we have text AND media, send first image with caption instead of separate messages
    if (mediaUrls.length > 0) {
      const firstMediaUrl = mediaUrls[0];
      for (const targetJid of targets) {
        console.log(`📤 [${userId}] Replying to ${phone} via ${targetJid} with image + caption...`);
        try {
          await sendTypingBeforeReply(sessionObj.sock, targetJid, replyText);
          sentMsg = await sessionObj.sock.sendMessage(targetJid, {
            image: { url: firstMediaUrl },
            caption: replyText,
          });
          sentTargetJid = targetJid;
          break;
        } catch (err) {
          lastError = err;
          console.warn(`⚠️ [${userId}] Reply target failed ${targetJid}: ${err.message}`);
        }
      }

      if (!sentMsg && lastError) {
        console.error("❌ Send error:", lastError.message);
        return;
      }

      rememberOutgoingMessage(sessionObj, sentMsg, replyText);

      if (bankDetailsReply && sentTargetJid) {
        try {
          await sendTypingBeforeReply(sessionObj.sock, sentTargetJid, bankDetailsReply);
          const bankMsg = await sessionObj.sock.sendMessage(sentTargetJid, { text: bankDetailsReply });
          rememberOutgoingMessage(sessionObj, bankMsg, bankDetailsReply);
        } catch (err) {
          console.warn(`⚠️ [${userId}] Bank details reply failed ${sentTargetJid}: ${err.message}`);
        }
      }

      // Send remaining media (if more than one)
      if (mediaUrls.length > 1) {
        const remainingMediaUrls = mediaUrls.slice(1);
        const mediaTargets = sentTargetJid
          ? [sentTargetJid, ...targets.filter((target) => target !== sentTargetJid)]
          : targets;
        await sendWebhookMediaAttachments({
          userId,
          sessionObj,
          targets: mediaTargets,
          quotedMessage,
          isSelfChat,
          mediaUrls: remainingMediaUrls,
        });
      }
      return;
    }

    // Text only, no media
    for (const targetJid of targets) {
      console.log(`📤 [${userId}] Replying to ${phone} via ${targetJid}...`);
      try {
        await sendTypingBeforeReply(sessionObj.sock, targetJid, replyText);
        sentMsg = await sessionObj.sock.sendMessage(targetJid, { text: replyText });
        sentTargetJid = targetJid;
        break;
      } catch (err) {
        lastError = err;
        console.warn(`⚠️ [${userId}] Reply target failed ${targetJid}: ${err.message}`);
      }
    }

    if (!sentMsg && lastError) {
      console.error("❌ Send error:", lastError.message);
      return;
    }

    rememberOutgoingMessage(sessionObj, sentMsg, replyText);

    if (bankDetailsReply && sentTargetJid) {
      try {
        const bankMsg = await sessionObj.sock.sendMessage(sentTargetJid, { text: bankDetailsReply });
        rememberOutgoingMessage(sessionObj, bankMsg, bankDetailsReply);
      } catch (err) {
        console.warn(`⚠️ [${userId}] Bank details reply failed ${sentTargetJid}: ${err.message}`);
      }
    }

    return;
  }

  if (response?.timedOut) {
    console.warn(`⏳ [${userId}] Webhook timed out after ${WA_WEBHOOK_TIMEOUT_MS}ms for ${phone}; skipping misleading failure reply.`);
    return;
  }

  if (!response?.ok) {
    console.error(`❌ [${userId}] Webhook failed status=${response?.statusCode || "n/a"} err=${response?.error || response?.raw || "unknown"}`);
    if (isSelfChat || isGroupJid(remoteJid)) {
      const sentMsg = await sessionObj.sock.sendMessage(
        remoteJid,
        { text: "Maaf, server sedang bermasalah. Cuba lagi sebentar." }
      ).catch(() => null);
      rememberOutgoingMessage(sessionObj, sentMsg, "Maaf, server sedang bermasalah. Cuba lagi sebentar.");
    }
    return;
  }

  if (mediaUrls.length) {
    const sent = await sendWebhookMediaAttachments({
      userId,
      sessionObj,
      targets,
      quotedMessage,
      isSelfChat,
      mediaUrls,
    });
    if (sent) return;
  }

  console.log(`ℹ️ [${userId}] Webhook returned empty reply for message id=${messageId || "-"}`);
}

function extractMessageText(innerMsg) {
  return innerMsg.conversation
    || innerMsg.extendedTextMessage?.text
    || innerMsg.imageMessage?.caption
    || innerMsg.videoMessage?.caption
    || innerMsg.documentMessage?.caption
    || innerMsg.caption // Handle unwrapped messages
    || innerMsg.buttonsResponseMessage?.selectedDisplayText
    || innerMsg.listResponseMessage?.title
    || "";
}

function unwrapMessageContent(message) {
  let innerMsg = message || {};
  for (let i = 0; i < 8; i++) {
    const next = innerMsg.ephemeralMessage?.message
      || innerMsg.viewOnceMessage?.message
      || innerMsg.viewOnceMessageV2?.message
      || innerMsg.documentWithCaptionMessage?.message
      || null;
    if (!next || next === innerMsg) break;
    innerMsg = next;
  }
  return innerMsg;
}

function getContextInfo(innerMsg) {
  const messageTypes = [
    "extendedTextMessage",
    "imageMessage",
    "videoMessage",
    "documentMessage",
    "locationMessage",
    "liveLocationMessage",
    "buttonsResponseMessage",
    "listResponseMessage",
    "templateButtonReplyMessage",
    "interactiveResponseMessage",
  ];
  for (const messageType of messageTypes) {
    const contextInfo = innerMsg?.[messageType]?.contextInfo;
    if (contextInfo) return contextInfo;
  }
  return innerMsg?.contextInfo || null;
}

function extractQuotedMessageText(innerMsg, sessionObj) {
  const contextInfo = getContextInfo(innerMsg);
  const quotedMessage = contextInfo?.quotedMessage;
  if (quotedMessage) {
    const quotedText = extractMessageText(unwrapMessageContent(quotedMessage));
    if (quotedText) return quotedText;
  }

  const stanzaId = contextInfo?.stanzaId;
  if (stanzaId && sessionObj?.outgoingTexts?.has(stanzaId)) {
    return sessionObj.outgoingTexts.get(stanzaId) || "";
  }
  return "";
}

function extractLocationPayload(innerMsg) {
  const locationMessage = innerMsg.locationMessage || innerMsg.liveLocationMessage || null;
  if (!locationMessage) return null;

  const latitude = Number(
    locationMessage.degreesLatitude
    ?? locationMessage.latitude
    ?? locationMessage.lat
  );
  const longitude = Number(
    locationMessage.degreesLongitude
    ?? locationMessage.longitude
    ?? locationMessage.lng
  );
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const locationName = (
    locationMessage.name
    || locationMessage.address
    || locationMessage.caption
    || ""
  ).trim() || null;

  return { latitude, longitude, location_name: locationName };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripGroupTrigger(text, triggerPrefix) {
  const trimmed = (text || "").trim();
  const prefix = (triggerPrefix || "").trim();
  if (!trimmed || !prefix) return null;
  const triggerRegex = new RegExp(`^${escapeRegExp(prefix)}(?:\\s+|$|[:;,.\\-]\\s*)`, "i");
  if (!triggerRegex.test(trimmed)) return null;
  return trimmed.replace(triggerRegex, "").trim();
}

function hasHereLocationMarker(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return false;
  return /(^|\s)@here\b/i.test(trimmed);
}

function shouldBypassGroupTriggerForLocation({ text, locationPayload, targetTxnRef }) {
  if (!targetTxnRef) return false;
  if (locationPayload) return true;
  return hasHereLocationMarker(text);
}

function shouldBypassGroupTriggerForReplyMedia({ text, quotedMediaMessage }) {
  return Boolean((text || "").trim() && quotedMediaMessage?.mediaDescriptor);
}

async function downloadMessageMediaBuffer(sock, message, userId, label) {
  let mediaBuffer = null;
  let downloadAttempts = 0;
  const maxDownloadAttempts = 3;

  while (downloadAttempts < maxDownloadAttempts) {
    try {
      mediaBuffer = await downloadMediaMessage(
        message,
        "buffer",
        {},
        { logger: console, reuploadRequest: sock.updateMediaMessage }
      );

      if (mediaBuffer && mediaBuffer.length > 0) {
        break;
      }
    } catch (mediaErr) {
      console.error("Quoted media download failed:", mediaErr.message);
    }

    downloadAttempts++;
    if (downloadAttempts < maxDownloadAttempts) {
      console.log("Retrying media download immediately.");
    }
  }

  if (!mediaBuffer || !mediaBuffer.length) {
    console.log("Failed to download media after retries.");
    return null;
  }

  return mediaBuffer;
}

function deleteAuthDir(userId) {
  const dir = path.join(AUTH_DIR, `user_${userId}`);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function ensureQuarantineDir() {
  fs.mkdirSync(QUARANTINE_DIR, { recursive: true });
}

function readQuarantineIndex() {
  try {
    if (!fs.existsSync(QUARANTINE_INDEX_PATH)) return {};
    return JSON.parse(fs.readFileSync(QUARANTINE_INDEX_PATH, "utf8") || "{}");
  } catch (error) {
    console.warn(`Unable to read quarantine index: ${error.message}`);
    return {};
  }
}

function writeQuarantineIndex(index) {
  ensureQuarantineDir();
  fs.writeFileSync(QUARANTINE_INDEX_PATH, JSON.stringify(index, null, 2));
}

function getSessionQuarantine(userId) {
  if (!userId) return null;
  return readQuarantineIndex()[userId] || null;
}

function setSessionQuarantine(userId, value) {
  const index = readQuarantineIndex();
  index[userId] = value;
  writeQuarantineIndex(index);
}

function clearSessionQuarantine(userId) {
  const index = readQuarantineIndex();
  if (!index[userId]) return;
  delete index[userId];
  writeQuarantineIndex(index);
}

function safeQuarantineName(userId, reason) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "").replace(/-/g, "");
  const safeReason = (reason || "session").replace(/[^a-z0-9_-]/gi, "_").slice(0, 48);
  return `user_${userId}-${safeReason}-${stamp}`;
}

function quarantineSession(userId, reason = "crypto_error_storm") {
  const existing = sessions[userId];
  const authDir = path.join(AUTH_DIR, `user_${userId}`);
  const hasAuth = fs.existsSync(authDir);

  // Auto-recovery: try soft reconnect before quarantining
  if (reason === "crypto_error_storm" && hasAuth && existing && !existing.recoveryAttempted) {
    existing.recoveryAttempted = true;
    existing.quarantineStarted = true;
    existing.isClosing = true;
    if (existing.reconnectTimer) clearTimeout(existing.reconnectTimer);
    try {
      existing.sock?.ws?.close?.();
    } catch (error) {
      console.warn(`⚠️ [${userId}] recovery close warning: ${error.message}`);
    }
    delete sessions[userId];
    console.warn(`🔄 [${userId}] Crypto error storm detected. Attempting auto-recovery (soft reconnect)...`);
    setTimeout(() => {
      startSock(userId, null, { forceNew: true }).catch((err) => {
        console.error(`❌ [${userId}] Auto-recovery failed: ${err.message}`);
        // Now actually quarantine
        quarantineSession(userId, reason);
      });
    }, 5000);
    return;
  }

  const quarantine = getSessionQuarantine(userId);
  if (quarantine) return;
  if (existing) {
    existing.quarantineStarted = true;
    existing.isClosing = true;
    existing.status = "quarantined";
    if (existing.reconnectTimer) clearTimeout(existing.reconnectTimer);
    delete sessions[userId];
    try {
      existing.sock?.ws?.close?.();
    } catch (error) {
      console.warn(`⚠️ [${userId}] quarantine close warning: ${error.message}`);
    }
  }

  let backupPath = null;
  if (fs.existsSync(authDir)) {
    ensureQuarantineDir();
    backupPath = path.join(QUARANTINE_DIR, safeQuarantineName(userId, reason));
    try {
      fs.renameSync(authDir, backupPath);
    } catch (error) {
      backupPath = null;
      console.warn(`⚠️ [${userId}] failed to move auth into quarantine: ${error.message}`);
    }
  }

  setSessionQuarantine(userId, {
    reason,
    at: new Date().toISOString(),
    backupPath,
    requiresRelink: true,
  });
  console.error(`🧯 [${userId}] WhatsApp session quarantined (${reason}). Re-link required.`);
  postInternalPush(userId, reason);
}

function isCryptoErrorLog(line) {
  return /Bad MAC|Invalid PreKey ID|No matching sessions found|No session found to decrypt message|failed to decrypt message/i.test(line || "");
}

function recordSessionCryptoError(userId, line) {
  const sessionObj = sessions[userId];
  if (!sessionObj || sessionObj.isClosing || sessionObj.quarantineStarted) return;

  const now = Date.now();
  const currentWindow = sessionObj.cryptoErrors || { startedAt: now, count: 0 };
  if (now - currentWindow.startedAt > WA_CRYPTO_ERROR_WINDOW_MS) {
    sessionObj.cryptoErrors = { startedAt: now, count: 1 };
  } else {
    currentWindow.count += 1;
    sessionObj.cryptoErrors = currentWindow;
  }

  if (sessionObj.cryptoErrors.count === Math.ceil(WA_CRYPTO_ERROR_QUARANTINE_THRESHOLD / 2)) {
    console.warn(`⚠️ [${userId}] WhatsApp crypto errors rising (${sessionObj.cryptoErrors.count}/${WA_CRYPTO_ERROR_QUARANTINE_THRESHOLD}).`);
  }

  if (sessionObj.cryptoErrors.count >= WA_CRYPTO_ERROR_QUARANTINE_THRESHOLD) {
    sessionObj.quarantineStarted = true;
    setImmediate(() => quarantineSession(userId, "crypto_error_storm"));
  }
}

function writeThrottledSessionLog(sessionObj, bucketKey, line, windowMs = 30000) {
  if (!sessionObj.logThrottle) {
    sessionObj.logThrottle = new Map();
  }
  const now = Date.now();
  const current = sessionObj.logThrottle.get(bucketKey) || { startedAt: now, count: 0, suppressed: 0 };
  if (now - current.startedAt > windowMs) {
    if (current.suppressed > 0) {
      process.stdout.write(`[log-throttle] ${bucketKey} suppressed=${current.suppressed}
`);
    }
    sessionObj.logThrottle.set(bucketKey, { startedAt: now, count: 1, suppressed: 0 });
    process.stdout.write(line);
    return;
  }
  current.count += 1;
  if (current.count <= 3) {
    process.stdout.write(line);
  } else {
    current.suppressed += 1;
  }
  sessionObj.logThrottle.set(bucketKey, current);
}

function createSessionLogger(userId) {
  const stream = {
    write(line) {
      const sessionObj = sessions[userId];
      if (isCryptoErrorLog(line)) {
        recordSessionCryptoError(userId, line);
        if (sessionObj) {
          writeThrottledSessionLog(sessionObj, `crypto:${userId}`, line, 30000);
          return;
        }
      }
      process.stdout.write(line);
    },
  };
  return pino({ level: "info" }, stream).child({ userId });
}

function publicQuarantineInfo(quarantine) {
  return {
    reason: quarantine?.reason || "session_error",
    at: quarantine?.at || null,
    requiresRelink: true,
  };
}

function quarantinedStatusPayload(quarantine) {
  return {
    status: "quarantined",
    qr: null,
    pairingCode: null,
    requiresRelink: true,
    detail: "WhatsApp session needs re-link.",
    quarantine: publicQuarantineInfo(quarantine),
  };
}

// [DO-NOT-CHANGE] Autostart uses noiseKey presence instead of registered flag.
// Sessions with registered=false can still auto-connect if they have valid key material.
// Changing this back to check creds.registered will break auto-connect for stale sessions.
function sessionDirHasRegisteredCreds(sessionDirName) {
  const userId = sessionDirName.startsWith("user_") ? sessionDirName.slice(5) : "";
  if (getSessionQuarantine(userId)) {
    console.log(`⏭️ [${userId}] Skipping quarantined WhatsApp session autostart.`);
    return false;
  }
  const credsPath = path.join(AUTH_DIR, sessionDirName, "creds.json");
  if (!fs.existsSync(credsPath)) return false;
  try {
    const creds = JSON.parse(fs.readFileSync(credsPath, "utf8"));
    return Boolean(creds?.noiseKey?.private);
  } catch (error) {
    console.warn(`Skipping ${sessionDirName}: unable to read creds.json (${error.message})`);
    return false;
  }
}

function userHasRegisteredAuth(userId) {
  if (!userId) return false;
  return sessionDirHasRegisteredCreds(`user_${userId}`);
}

function isActiveSession(userId, sessionObj) {
  return sessions[userId]?.instanceId === sessionObj.instanceId;
}

function rememberOutgoingMessage(sessionObj, sentMsg, text = "") {
  const messageId = sentMsg?.key?.id;
  if (!messageId) return;
  sessionObj.outgoingIds.add(messageId);
  if (text) {
    sessionObj.outgoingTexts.set(messageId, text);
  }
  if (sessionObj.outgoingIds.size > 300) {
    const oldest = sessionObj.outgoingIds.values().next().value;
    sessionObj.outgoingIds.delete(oldest);
  }
  if (sessionObj.outgoingTexts.size > 300) {
    const oldestTextId = sessionObj.outgoingTexts.keys().next().value;
    sessionObj.outgoingTexts.delete(oldestTextId);
  }
}

async function closeSession(userId, { logout = false, clearAuth = false } = {}) {
  const existing = sessions[userId];
  if (existing) {
    existing.isClosing = true;
    delete sessions[userId];
    try {
      if (existing.reconnectTimer) clearTimeout(existing.reconnectTimer);
      if (logout) {
        await existing.sock.logout();
      } else {
        existing.sock?.ws?.close?.();
      }
    } catch (e) {
      console.error(`⚠️ [${userId}] close session warning:`, e.message);
    }
  }
  if (clearAuth) deleteAuthDir(userId);
}

function postInternalPush(userId, reason) {
  if (!WHATSAPP_WEBHOOK_SECRET || !userId) return;
  const data = JSON.stringify({ user_id: userId, reason: reason || "session_error" });
  const req = _API_MOD.request(_apiOpts("POST", "/internal/push/whatsapp-reconnect", {
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data),
      "X-WhatsApp-Webhook-Secret": WHATSAPP_WEBHOOK_SECRET,
    },
  }), (res) => {
    res.resume();
    if (res.statusCode < 200 || res.statusCode >= 300) {
      console.warn(`⚠️ [${userId}] Push notify failed status=${res.statusCode}`);
    }
  });
  req.setTimeout(5000, () => req.destroy(new Error("Push notify timeout")));
  req.on("error", (error) => console.warn(`⚠️ [${userId}] Push notify error: ${error.message}`));
  req.write(data);
  req.end();
}

async function postToWebhook(userId, phone, payload = {}) {
  return new Promise((resolve) => {
    let timedOut = false;
    const data = JSON.stringify({ user_id: userId, phone, ...payload });
    const headers = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data),
    };
    if (WHATSAPP_WEBHOOK_SECRET) {
      headers["X-WhatsApp-Webhook-Secret"] = WHATSAPP_WEBHOOK_SECRET;
    }
    const req = _API_MOD.request(_apiOpts("POST", "/whatsapp/webhook", { headers }), (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch (e) {}
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          statusCode: res.statusCode,
          data: parsed,
          raw: body,
          timedOut,
        });
      });
    });
    req.setTimeout(WA_WEBHOOK_TIMEOUT_MS, () => {
      timedOut = true;
      req.destroy(new Error("Webhook timeout"));
    });
    req.on("error", (err) => resolve({ ok: false, error: err.message, timedOut }));
    req.write(data);
    req.end();
  });
}

async function fetchAllowedGroupRules(userId, sessionObj) {
  if (!WHATSAPP_WEBHOOK_SECRET) {
    return [];
  }
  const now = Date.now();
  const cached = sessionObj.groupRulesCache;
  if (cached && cached.expiresAt > now && Array.isArray(cached.rules)) {
    return cached.rules;
  }

  return new Promise((resolve) => {
    const headers = {};
    headers["X-WhatsApp-Webhook-Secret"] = WHATSAPP_WEBHOOK_SECRET;
    const req = _API_MOD.request(_apiOpts("GET", `/internal/whatsapp/group-rules/${encodeURIComponent(userId)}`, { headers }), (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body || "{}");
          const rules = Array.isArray(parsed.rules) ? parsed.rules : [];
          sessionObj.groupRulesCache = {
            expiresAt: Date.now() + GROUP_RULE_CACHE_MS,
            rules,
          };
          resolve(rules);
        } catch (error) {
          resolve([]);
        }
      });
    });
    req.setTimeout(8000, () => req.destroy(new Error("Group rule timeout")));
    req.on("error", () => resolve([]));
    req.end();
  });
}

async function startSock(userId, pairingPhone = null, options = {}) {
  const { forceNew = false, allowQuarantined = false } = options;
  const quarantine = getSessionQuarantine(userId);
  if (quarantine && !allowQuarantined) {
    return quarantinedStatusPayload(quarantine);
  }

  const current = sessions[userId];
  if (current && !forceNew) {
    return current;
  }
  if (current && forceNew) {
    await closeSession(userId, { logout: false, clearAuth: false });
  }

  const { state, saveCreds } = await useMultiFileAuthState(path.join(AUTH_DIR, `user_${userId}`));
  const { version } = await fetchLatestBaileysVersion();
  
  const sock = makeWASocket({
    version,
    auth: state,
    // QR is handled via connection.update; keep terminal clean and avoid deprecated spam.
    printQRInTerminal: false,
    browser: Browsers.ubuntu("Chrome"),
    syncFullHistory: false,
    logger: createSessionLogger(userId),
    // Keep WhatsApp notifications on primary device more consistent.
    markOnlineOnConnect: false,
  });

  const sessionObj = {
    userId,
    instanceId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sock,
    status: "loading",
    qr: null,
    pairingCode: null,
    reconnectTimer: null,
    reconnectAttempts: 0,
    isClosing: false,
    outgoingIds: new Set(),
    outgoingTexts: new Map(),
    groupRulesCache: null,
    cryptoErrors: null,
    pendingCategoryMedia: new Map(),
    lidToPhoneMap: loadLidMapping(userId),
    quarantineStarted: false,
    startedAt: Date.now(),
    lastOpenAt: null,
    lastQrAt: null,
    lastKeepActiveAt: null,
  };
  sessions[userId] = sessionObj;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("chats.phoneNumberShare", ({ lid, jid }) => {
    rememberLidPhoneMapping(sessionObj, lid, jid);
    const meLid = normalizeJidUser(sessionObj.sock?.user?.lid) || normalizeJidUser(state?.creds?.me?.lid);
    if (meLid && normalizeJidUser(lid) === meLid) {
      const phone = formatPhone(jid);
      if (phone) postLinkedPhone(userId, phone);
    }
  });

  sock.ev.on("contacts.upsert", (contacts) => {
    for (const contact of contacts || []) {
      rememberLidPhoneFromContact(sessionObj, contact);
    }
  });

  sock.ev.on("contacts.update", (contacts) => {
    for (const contact of contacts || []) {
      rememberLidPhoneFromContact(sessionObj, contact);
    }
  });

  sock.ev.on("messaging-history.set", (history) => {
    const contacts = Array.isArray(history?.contacts) ? history.contacts : [];
    for (const contact of contacts) {
      rememberLidPhoneFromContact(sessionObj, contact);
    }
  });

  sock.ev.on("connection.update", (update) => {
    if (!isActiveSession(userId, sessionObj)) return;
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
       console.log(`[${userId}] 🎫 QR received, generating Data URL...`);
       QRCode.toDataURL(qr).then(url => {
         if (!isActiveSession(userId, sessionObj)) return;
         sessionObj.qr = url;
         sessionObj.status = "qr";
         sessionObj.lastQrAt = Date.now();
         console.log(`[${userId}] 📸 QR Data URL generated.`);
       }).catch(e => console.error("QR Gen Error:", e.message));
    }
    if (connection === "close") {
      const statusCode = (lastDisconnect?.error instanceof Boom) ? lastDisconnect.error.output.statusCode : 500;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      sessionObj.status = "disconnected";
      console.log(`🔌 [${userId}] Connection closed. statusCode=${statusCode} shouldReconnect=${shouldReconnect}`);
      const hasRegisteredCreds = Boolean(state?.creds?.registered);
      if (shouldReconnect) {
        sessionObj.reconnectAttempts = (sessionObj.reconnectAttempts || 0) + 1;
        if (sessionObj.reconnectTimer) clearTimeout(sessionObj.reconnectTimer);
        const exp = Math.min(sessionObj.reconnectAttempts - 1, 6);
        let reconnectDelayMs = Math.min(60000, 1200 * (2 ** exp));
        if (statusCode === 408 && sessionObj.reconnectAttempts >= 8) {
          reconnectDelayMs = Math.max(reconnectDelayMs, 120000);
        }
        console.log(`⏱️ [${userId}] Reconnect attempt #${sessionObj.reconnectAttempts} in ${reconnectDelayMs}ms registered=${hasRegisteredCreds ? '1' : '0'}`);
        sessionObj.reconnectTimer = setTimeout(() => {
          if (!isActiveSession(userId, sessionObj)) return;
          startSock(userId, null, { forceNew: true }).catch((e) => {
            console.error(`❌ [${userId}] Reconnect failed:`, e.message);
          });
        }, reconnectDelayMs);
      } else {
        // Logged out — clean up stale auth so next request gets a fresh QR
        deleteAuthDir(userId);
        if (isActiveSession(userId, sessionObj)) delete sessions[userId];
        console.log(`🧹 [${userId}] Auth cleaned up after logout. Ready for fresh QR.`);
        postInternalPush(userId, "logged_out");
      }
    } else if (connection === "open") {
      sessionObj.status = "connected";
      sessionObj.userId = userId;
      sessionObj.qr = null;
      sessionObj.pairingCode = null;
      sessionObj.reconnectAttempts = 0;
      sessionObj.cryptoErrors = null;
      sessionObj.lastOpenAt = Date.now();
      const linkedPhone = resolveSessionPhone(sessionObj);
      if (linkedPhone) {
        postLinkedPhone(userId, linkedPhone);
      }
      console.log(`✅ [${userId}] Connected! LID mappings: ${sessionObj.lidToPhoneMap.size} linked_phone=${linkedPhone || "-"}`);
      // Persist LID mapping on connect
      saveLidMapping(userId, sessionObj.lidToPhoneMap);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (!isActiveSession(userId, sessionObj)) return;
    for (const m of messages) {
        try {
          if (!m.message) continue;
          const messageId = m?.key?.id;
          if (m.key?.fromMe && messageId && sessionObj.outgoingIds.has(messageId)) {
            sessionObj.outgoingIds.delete(messageId);
            console.log(`🚫 [${userId}] Skipping bot-generated reply.`);
            continue;
          }
          if (messageId && !shouldProcessInboundMessage(sessionObj, `${userId}:${messageId}`)) {
            if (!sessionObj.duplicateSkipCount) sessionObj.duplicateSkipCount = 0;
            sessionObj.duplicateSkipCount += 1;
            if (sessionObj.duplicateSkipCount <= 3 || sessionObj.duplicateSkipCount % 20 === 0) console.log(`🚫 [${userId}] Skipping duplicate inbound message ${messageId}. total=${sessionObj.duplicateSkipCount}`);
            continue;
          }
          
          const remoteJid = m.key.remoteJid;
          if (isBroadcastJid(remoteJid)) {
            continue;
          }

          const userPhone = normalizeJidUser(sock.user?.id) || normalizeJidUser(state?.creds?.me?.id);
          if (!userPhone) continue;
          const userLid = normalizeJidUser(sock.user?.lid) || normalizeJidUser(state?.creds?.me?.lid);
          const credentialPhone = normalizeJidUser(state?.creds?.me?.id);
          const credentialLid = normalizeJidUser(state?.creds?.me?.lid);
          const participantId = normalizeJidUser(m.key?.participant);
          const selfIds = new Set([userPhone, userLid, credentialPhone, credentialLid].filter(Boolean));
          let isSelfChat = false;
          let replyTargets = [remoteJid].filter(Boolean);
          
          // Unwrap nested message types (WhatsApp wraps messages in various containers)
          const innerMsg = unwrapMessageContent(m.message);
          let text = extractMessageText(innerMsg);
          const mediaDescriptor = getMediaDescriptor(innerMsg);
          const quotedMediaMessage = getQuotedMediaMessage(innerMsg);
          const locationPayload = extractLocationPayload(innerMsg);
          
          // Extract phone from peer_recipient_pn (WhatsApp provides this in message metadata)
          // Baileys puts this directly on the message object
          const peerPn = m.peer_recipient_pn || m.key?.peer_recipient_pn;
          if (peerPn && remoteJid?.endsWith("@lid")) {
            rememberLidPhoneMapping(sessionObj, remoteJid, peerPn);
            console.log(`📞 [${userId}] LID mapped: ${remoteJid} -> ${peerPn}`);
          }
          // Also check participant JID if remoteJid is a LID
          if (m.key?.participant && remoteJid?.endsWith("@lid") && m.key.participant.endsWith("@s.whatsapp.net")) {
            rememberLidPhoneMapping(sessionObj, remoteJid, m.key.participant);
            console.log(`📞 [${userId}] LID mapped from participant: ${remoteJid} -> ${m.key.participant}`);
          }
          // For group messages, participant is a LID - log it for debugging
          if (m.key?.participant?.endsWith("@lid") && !m.key.fromMe) {
            console.log(`🔍 [${userId}] Group LID participant (no phone yet): ${m.key.participant} in ${remoteJid}`);
          }
          
          let phone = formatPhone(m.key.participant || m.key.remoteJid || sock.user?.id);
          const mappedFromParticipant = getPhoneFromLidMapping(sessionObj, m.key?.participant || "");
          const mappedFromRemote = getPhoneFromLidMapping(sessionObj, m.key?.remoteJid || "");
          if (mappedFromParticipant) {
            phone = mappedFromParticipant;
          } else if (mappedFromRemote) {
            phone = mappedFromRemote;
          }
          if (mediaDescriptor || quotedMediaMessage || text) {
            console.log(`[WA-DEBUG][${userId}] route=${mediaDescriptor || quotedMediaMessage ? 'media' : 'text'} remote_jid=${m.key?.remoteJid || '-'} participant_jid=${m.key?.participant || '-'} raw_phone=${formatPhone(m.key.participant || m.key.remoteJid || sock.user?.id) || '-'} mapped_participant=${mappedFromParticipant || '-'} mapped_remote=${mappedFromRemote || '-'} final_phone=${phone || '-'} is_self=${isSelfChat ? '1' : '0'} from_me=${m.key?.fromMe ? '1' : '0'} text=${JSON.stringify(text || '')}`);
          }
          const webhookPayload = {};
          if (messageId) webhookPayload.message_id = messageId;
          if (m.messageTimestamp) {
            const numericTimestamp = Number(m.messageTimestamp);
            if (Number.isFinite(numericTimestamp)) {
              webhookPayload.message_timestamp = numericTimestamp;
            }
          }
          const quotedText = extractQuotedMessageText(innerMsg, sessionObj);
          const quotedTxnRef = extractTxnReference(quotedText);
          if (quotedText || quotedMediaMessage) {
            webhookPayload.is_reply_message = true;
          }
          if (quotedTxnRef) {
            webhookPayload.target_txn_ref = quotedTxnRef;
          }

          if (isGroupJid(remoteJid)) {
            const groupRules = await fetchAllowedGroupRules(userId, sessionObj);
            const matchedRule = groupRules.find((rule) => rule.group_jid === remoteJid);
            if (!matchedRule) {
              continue;
            }

            if (!m.key?.fromMe && m.key?.remoteJid && shouldMarkRead({ isAllowedGroup: true })) {
              try {
                await sock.readMessages([m.key]);
              } catch (readErr) {
                console.warn(`⚠️ [${userId}] Failed to mark read for ${m.key.remoteJid}: ${readErr.message}`);
              }
            }

            const isOwnerMessage = Boolean(m.key?.fromMe) || selfIds.has(participantId);
            const canBypassTriggerForLocation = shouldBypassGroupTriggerForLocation({
              text,
              locationPayload,
              targetTxnRef: webhookPayload.target_txn_ref,
            });
            const canBypassTriggerForReplyMedia = shouldBypassGroupTriggerForReplyMedia({
              text,
              quotedMediaMessage,
            });
            const strippedText = stripGroupTrigger(text, matchedRule.trigger_prefix);
            if (strippedText == null) {
              if (!canBypassTriggerForLocation && !canBypassTriggerForReplyMedia) {
                continue;
              }
              text = (text || "").trim();
            } else {
              text = strippedText;
            }

            if (!text && !mediaDescriptor && !quotedMediaMessage && !locationPayload) continue;

            webhookPayload.group_jid = remoteJid;
            webhookPayload.group_name = matchedRule.group_name;
            if (m.key?.participant) {
              webhookPayload.participant_jid = m.key.participant;
            }
            const logLabel = locationPayload ? "[location]" : (mediaDescriptor ? "[media]" : (quotedMediaMessage ? "[reply-media]" : ""));
            const bypassLabel = strippedText == null ? (canBypassTriggerForReplyMedia ? " [reply-media-bypass]" : (canBypassTriggerForLocation ? " [location-bypass]" : "")) : "";
            console.log(`👥 [${userId}] Group trigger${bypassLabel} in ${matchedRule.group_name}: "${text || logLabel}"`);
          } else {
            const remoteId = normalizeJidUser(remoteJid);
            const candidateIds = [remoteId, participantId].filter(Boolean);
            isSelfChat = candidateIds.some((id) => selfIds.has(id));
            if (!isSelfChat && !WA_ALLOW_NON_SELF_DM) {
              continue;
            }
            if (isSelfChat) {
              replyTargets = buildSelfReplyTargets({ remoteJid, userPhone, userLid });
            }

            if (!m.key?.fromMe && m.key?.remoteJid && shouldMarkRead({ isSelfChat: true })) {
              try {
                await sock.readMessages([m.key]);
              } catch (readErr) {
                console.warn(`⚠️ [${userId}] Failed to mark read for ${m.key.remoteJid}: ${readErr.message}`);
              }
            }

            if (!text && !mediaDescriptor && !locationPayload) continue;

            const fromMe = m.key.fromMe ? "[ME] " : "";
            const logLabel = locationPayload ? "[location]" : (mediaDescriptor ? "[media]" : "");
            console.log(`📩 [${userId}] ${fromMe}Message from ${phone}: "${text || logLabel}"`);
          }

          if (text) webhookPayload.text = text;
          if (m.pushName) {
            webhookPayload.push_name = m.pushName;
            webhookPayload.customer_name = m.pushName;
          }
          if (m.key?.remoteJid) {
            webhookPayload.remote_jid = m.key.remoteJid;
          }
          if (m.key?.participant) {
            webhookPayload.participant_jid = m.key.participant;
          }
          webhookPayload.is_self_chat = isSelfChat;
          webhookPayload.from_me = Boolean(m.key?.fromMe);
          if (quotedMediaMessage) {
            webhookPayload.reply_has_media = true;
          }
          if (locationPayload) {
            webhookPayload.latitude = locationPayload.latitude;
            webhookPayload.longitude = locationPayload.longitude;
            if (locationPayload.location_name) {
              webhookPayload.location_name = locationPayload.location_name;
            }
          }

          sweepPendingCategoryMedia(sessionObj);

          const jobContext = {
            userId,
            phone,
            remoteJid: m.key.remoteJid,
            replyTargets: [...replyTargets],
            quotedMessage: m,
            sessionObj,
            messageId: m.key.id,
            isSelfChat,
            webhookPayload: { ...webhookPayload },
            mediaDescriptor,
            quotedMediaMessage,
          };

          const queueLabel = mediaDescriptor || quotedMediaMessage ? "media" : "text";
          const runJob = async () => {
            const { webhookPayload: queuedPayload } = jobContext;
            const typingTarget = jobContext.remoteJid || (Array.isArray(jobContext.replyTargets) && jobContext.replyTargets.length ? jobContext.replyTargets[0] : null);
            if (typingTarget) {
              await startTyping(sock, typingTarget);
            }
            if (!jobContext.mediaDescriptor && !jobContext.quotedMediaMessage) {
              if (!queuedPayload.text && queuedPayload.latitude == null) return;
              const res = await postToWebhook(userId, phone, queuedPayload);
              await handleWebhookResponse({
                userId,
                phone,
                remoteJid: jobContext.remoteJid,
                replyTargets: jobContext.replyTargets,
                quotedMessage: jobContext.quotedMessage,
                sessionObj,
                response: res,
                messageId: jobContext.messageId,
                isSelfChat,
              });
              const replyTxnRef = extractTxnReference(res?.data?.reply);
              const pendingMediaContext = replyTxnRef ? takePendingCategoryMedia(sessionObj, pendingMediaKey(userId, jobContext.remoteJid)) : null;
              if (pendingMediaContext) {
                await uploadMediaForTransaction({
                  sock,
                  userId,
                  phone,
                  sessionObj,
                  jobContext: pendingMediaContext,
                  targetTxnRef: replyTxnRef,
                  fallbackMessageId: `${pendingMediaContext.messageId || jobContext.messageId}:pending`,
                });
              }
              return;
            }

            let targetTxnRef = queuedPayload.target_txn_ref || extractTxnReference(queuedPayload.text);
            const shouldSkipCaptionWebhook = Boolean(jobContext.mediaDescriptor && queuedPayload.is_reply_message);
            // Barang Saya: media message with an inventory caption (`stuff ...` /
            // `tambah barang ...`) must send text + photo in ONE webhook call so the
            // photo is attached to the item. Otherwise the text-only call creates the
            // item without an image and the later media-only call is OCR'd as a receipt.
            const isInventoryCaption = Boolean(
              jobContext.mediaDescriptor
              && queuedPayload.text
              && /^\s*(stuff|tambah\s+barang|tambah\s+stor)\b/i.test(queuedPayload.text)
            );
            const skipTextCall = shouldSkipCaptionWebhook || isInventoryCaption;
            if (!skipTextCall && (queuedPayload.text || queuedPayload.latitude != null)) {
              const textRes = await postToWebhook(userId, phone, queuedPayload);
              await handleWebhookResponse({
                userId,
                phone,
                remoteJid: jobContext.remoteJid,
                replyTargets: jobContext.replyTargets,
                quotedMessage: jobContext.quotedMessage,
                sessionObj,
                response: textRes,
                messageId: jobContext.messageId,
                isSelfChat,
              });
              const replyText = textRes?.data?.reply || "";
              if (isCategoryPromptReply(replyText)) {
                storePendingCategoryMedia(sessionObj, pendingMediaKey(userId, jobContext.remoteJid), jobContext);
                return;
              }
              const replyTxnRef = extractTxnReference(replyText);
              if (replyTxnRef) {
                targetTxnRef = replyTxnRef;
              }
            }

            await uploadMediaForTransaction({
              sock,
              userId,
              phone,
              sessionObj,
              jobContext,
              targetTxnRef,
              fallbackMessageId: jobContext.messageId,
              includeContextText: isInventoryCaption,
            });
          };

          const isFastMedia = Boolean(mediaDescriptor || quotedMediaMessage);
          if (isFastMedia) {
            await sendProcessingNotice({
              userId,
              remoteJid: m.key.remoteJid,
              replyTargets,
              quotedMessage: m,
              sessionObj,
              isSelfChat,
              fromMe: Boolean(m.key?.fromMe),
              hasMedia: Boolean(mediaDescriptor),
              hasQuotedMedia: Boolean(quotedMediaMessage),
              noticeKey: `${m.key.id || messageId || ''}`,
            });
          }
          const queued = isFastMedia ? true : enqueueSessionJob(sessionObj, queueLabel, runJob);
          if (isFastMedia) {
            setImmediate(() => runJob().catch((err) => console.error(`❌ [${userId}] Fast media job failed:`, err.message)));
          }

          if (!queued) {
            if (isSelfChat || isGroupJid(m.key.remoteJid)) {
              const sentMsg = await sessionObj.sock.sendMessage(m.key.remoteJid, { text: "Sistem sedang sibuk. Cuba lagi sebentar." }, { quoted: m }).catch(() => null);
              rememberOutgoingMessage(sessionObj, sentMsg, "Sistem sedang sibuk. Cuba lagi sebentar.");
            }
            continue;
          }

          const shouldShowMediaProgress = Boolean(mediaDescriptor || quotedMediaMessage);
        } catch (err) {
          console.error(`❌ [${userId}] Error processing message:`, err.message);
        }
    }
  });

  if (pairingPhone) {
    setTimeout(async () => {
      try {
        if (!isActiveSession(userId, sessionObj)) return;
        const code = await sock.requestPairingCode(pairingPhone.replace(/\D/g, ''));
        if (!isActiveSession(userId, sessionObj)) return;
        sessionObj.pairingCode = code;
        sessionObj.status = "pairing";
        console.log(`🔑 [${userId}] Pairing Code: ${code}`);
      } catch (e) {
        console.error(`❌ Pairing Error:`, e.message);
      }
    }, 5000);
  }

  return sessionObj;
}

function listRegisteredKeepActiveUserIds() {
  if (!fs.existsSync(AUTH_DIR)) return [];
  const dirs = fs.readdirSync(AUTH_DIR).filter((file) => file.startsWith("user_"));
  const registeredDirs = dirs.filter(sessionDirHasRegisteredCreds);
  const limitedDirs = WA_AUTOSTART_MAX_SESSIONS > 0
    ? registeredDirs.slice(0, WA_AUTOSTART_MAX_SESSIONS)
    : registeredDirs;
  return limitedDirs.map((file) => file.slice(5)).filter(Boolean);
}

function startWhatsAppKeepActive() {
  let lastStats = { connected: 0, total: 0 };
  
  setInterval(() => {
    const now = Date.now();
    const userIds = listRegisteredKeepActiveUserIds();
    let connectedCount = 0;
    let reconnectedCount = 0;
    
    for (const userId of userIds) {
      const quarantine = getSessionQuarantine(userId);
      if (quarantine) continue;

      const existing = sessions[userId];
      if (existing?.status === "connected") {
        connectedCount++;
        continue;
      }
      if (existing?.status === "qr" || existing?.status === "pairing") continue;
      if (existing?.lastKeepActiveAt && now - existing.lastKeepActiveAt < WA_KEEP_ACTIVE_MS) continue;
      if (existing?.reconnectTimer) continue;
      
      // Handle stuck sessions more aggressively
      if (existing && existing.status !== "disconnected" && now - (existing.startedAt || now) < WA_KEEP_ACTIVE_STUCK_MS) {
        continue;
      }
      
      // Force close stuck sessions
      if (existing && existing.status !== "disconnected" && now - (existing.startedAt || now) >= WA_KEEP_ACTIVE_STUCK_MS) {
        console.warn(`⚠️ [${userId}] Session stuck in ${existing.status} for ${Math.round((now - (existing.startedAt || now)) / 1000)}s, forcing close`);
        try {
          existing.sock?.ws?.close?.();
        } catch (err) {}
        delete sessions[userId];
      }

      if (existing) existing.lastKeepActiveAt = now;
      reconnectedCount++;
      console.log(`💓 [${userId}] Keep active reconnect status=${existing?.status || "missing"}`);
      startSock(userId, null, { forceNew: Boolean(existing), allowQuarantined: true }).catch((error) => {
        console.error(`❌ [${userId}] Keep active reconnect failed:`, error.message);
      });
    }
    
    // Log stats every 5 minutes (300s / 60s = 5 intervals)
    if (lastStats.connected !== connectedCount || lastStats.total !== userIds.length || reconnectedCount > 0) {
      if (reconnectedCount > 0 || connectedCount !== lastStats.connected) {
        console.log(`📊 WhatsApp session stats: ${connectedCount}/${userIds.length} connected, ${reconnectedCount} reconnected this cycle`);
      }
      lastStats = { connected: connectedCount, total: userIds.length };
    }
  }, WA_KEEP_ACTIVE_MS);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2 * 1024 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function normalizeDirectTarget(to) {
  if (!to || typeof to !== "string") return null;
  const trimmed = to.trim();
  if (!trimmed) return null;
  if (trimmed.includes("@")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  return `${digits}@s.whatsapp.net`;
}

async function sendDirectMessage(sessionObj, {
  to,
  text,
  imageUrls = [],
  imageCaption,
  documentUrls = [],
}) {
  const targetJid = normalizeDirectTarget(to);
  if (!targetJid) {
    throw new Error("Invalid target");
  }

  const sent = [];
  const trimmedText = (text || "").toString().trim();
  if (trimmedText) {
    const sentMsg = await sessionObj.sock.sendMessage(targetJid, { text: trimmedText });
    rememberOutgoingMessage(sessionObj, sentMsg, trimmedText);
    sent.push({ type: "text", jid: targetJid });
  }

  const images = Array.isArray(imageUrls) ? imageUrls : [];
  for (let index = 0; index < images.length; index += 1) {
    const imageUrl = (images[index] || "").toString().trim();
    if (!imageUrl) continue;
    const payload = { image: { url: imageUrl } };
    if (index === 0 && imageCaption) {
      payload.caption = imageCaption;
    }
    const sentMsg = await sessionObj.sock.sendMessage(targetJid, payload);
    rememberOutgoingMessage(sessionObj, sentMsg, imageCaption || imageUrl);
    sent.push({ type: "image", jid: targetJid, url: imageUrl });
  }

  const docs = Array.isArray(documentUrls) ? documentUrls : [];
  for (let index = 0; index < docs.length; index += 1) {
    const docUrl = (docs[index] || "").toString().trim();
    if (!docUrl) continue;
    const urlPath = new URL(docUrl).pathname;
    const docFilename = decodeURIComponent(urlPath.split('/').pop() || "Resit.pdf");
    const payload = { document: { url: docUrl }, mimetype: "application/pdf", fileName: docFilename };
    const sentMsg = await sessionObj.sock.sendMessage(targetJid, payload);
    rememberOutgoingMessage(sessionObj, sentMsg, docFilename);
    sent.push({ type: "document", jid: targetJid, url: docUrl });
  }

  return { targetJid, sent };
}

const server = http.createServer(async (req, res) => {
  const parsed = urllib.parse(req.url, true);
  const pathParts = parsed.pathname.split("/").filter(Boolean);

  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET" && pathParts[0] === "api" && pathParts[1] === "session") {
    const userId = pathParts[2];
    const quarantine = getSessionQuarantine(userId);
    if (quarantine) {
      return res.end(JSON.stringify(quarantinedStatusPayload(quarantine)));
    }

    const existing = sessions[userId];
    const s = (!existing || existing.status === "disconnected")
      ? await startSock(userId, null, { forceNew: existing?.status === "disconnected" })
      : existing;
    const phone = s?.status === "connected" ? resolveSessionPhone(s) : null;
    return res.end(JSON.stringify({ status: s.status, qr: s.qr, pairingCode: s.pairingCode, phone }));
  }

  if (req.method === "POST" && pathParts[0] === "api" && pathParts[1] === "pair") {
    const userId = pathParts[2];
    const phone = parsed.query.phone;
    const existing = sessions[userId];
    if (existing?.status === "connected") {
      return res.end(JSON.stringify({
        status: "connected",
        qr: null,
        pairingCode: null,
        detail: "WhatsApp already connected.",
      }));
    }

    const hasRegisteredAuth = userHasRegisteredAuth(userId);
    if (hasRegisteredAuth) {
      clearSessionQuarantine(userId);
      const s = await startSock(userId, null, { forceNew: true, allowQuarantined: true });
      return res.end(JSON.stringify({
        status: s?.status || "reconnecting",
        qr: s?.qr || null,
        pairingCode: s?.pairingCode || null,
        detail: "Existing WhatsApp auth reused.",
      }));
    }

    clearSessionQuarantine(userId);
    await closeSession(userId, { logout: false, clearAuth: false });
    const s = await startSock(userId, phone, { forceNew: true, allowQuarantined: true });
    return res.end(JSON.stringify({ status: "pairing_initiated", qr: s?.qr || null, pairingCode: s?.pairingCode || null }));
  }

  if (req.method === "DELETE" && pathParts[0] === "api" && pathParts[1] === "session") {
    const userId = pathParts[2];
    await closeSession(userId, { logout: true, clearAuth: true });
    clearSessionQuarantine(userId);
    return res.end(JSON.stringify({ success: true }));
  }

  if (req.method === "POST" && pathParts[0] === "api" && pathParts[1] === "session" && pathParts[3] === "reconnect-soft") {
    const userId = pathParts[2];
    clearSessionQuarantine(userId);
    await closeSession(userId, { logout: false, clearAuth: false });
    const s = await startSock(userId, null, { forceNew: true, allowQuarantined: true });
    return res.end(JSON.stringify({ success: true, status: s?.status || "connecting" }));
  }

  if (req.method === "GET" && pathParts[0] === "api" && pathParts[1] === "groups") {
    const userId = pathParts[2];
    const quarantine = getSessionQuarantine(userId);
    if (quarantine) {
      res.writeHead(423);
      return res.end(JSON.stringify({
        detail: "WhatsApp session needs re-link.",
        status: "quarantined",
        groups: [],
        requiresRelink: true,
        quarantine: publicQuarantineInfo(quarantine),
      }));
    }

    const existing = sessions[userId];
    const s = (!existing || existing.status === "disconnected")
      ? await startSock(userId, null, { forceNew: existing?.status === "disconnected" })
      : existing;

    if (!s || s.status !== "connected") {
      res.writeHead(409);
      return res.end(JSON.stringify({
        detail: "WhatsApp session is not connected yet.",
        status: s?.status || "disconnected",
        groups: [],
      }));
    }

    try {
      const groupsMap = await s.sock.groupFetchAllParticipating();
      const groups = Object.values(groupsMap || {})
        .map((group) => ({
          jid: group.id,
          name: group.subject || group.notify || group.id,
          participant_count: Array.isArray(group.participants) ? group.participants.length : 0,
          announce: Boolean(group.announce),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return res.end(JSON.stringify({ groups }));
    } catch (error) {
      res.writeHead(500);
      return res.end(JSON.stringify({ detail: error.message || "Failed to fetch groups", groups: [] }));
    }
  }


  if (req.method === "POST" && pathParts[0] === "api" && pathParts[1] === "send") {
    const userId = pathParts[2];
    const quarantine = getSessionQuarantine(userId);
    if (quarantine) {
      res.writeHead(423);
      return res.end(JSON.stringify({
        detail: "WhatsApp session needs re-link.",
        status: "quarantined",
        requiresRelink: true,
        quarantine: publicQuarantineInfo(quarantine),
      }));
    }

    const existing = sessions[userId];
    const s = (!existing || existing.status === "disconnected")
      ? await startSock(userId, null, { forceNew: existing?.status === "disconnected" })
      : existing;

    if (!s || s.status !== "connected") {
      res.writeHead(409);
      return res.end(JSON.stringify({
        detail: "WhatsApp session is not connected yet.",
        status: s?.status || "disconnected",
      }));
    }

    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (error) {
      res.writeHead(400);
      return res.end(JSON.stringify({ detail: error.message || "Invalid request body." }));
    }

    try {
      const result = await sendDirectMessage(s, {
        to: body.to,
        text: body.text,
        imageUrls: body.image_urls,
        imageCaption: body.image_caption,
        documentUrls: body.document_urls,
      });
      return res.end(JSON.stringify({ ok: true, ...result }));
    } catch (error) {
      res.writeHead(500);
      return res.end(JSON.stringify({ detail: error.message || "Failed to send message." }));
    }
  }
  res.writeHead(404); res.end();
});

server.listen(WA_WORKER_PORT, WA_WORKER_HOST, () => {
  console.log(`🌐 Worker v2 on ${WA_WORKER_HOST}:${WA_WORKER_PORT}`);
});

if (WA_AUTOSTART_ALL_SESSIONS && fs.existsSync(AUTH_DIR)) {
  const allSessionDirs = fs.readdirSync(AUTH_DIR)
    .filter((file) => file.startsWith("user_"));
  const registeredSessionDirs = allSessionDirs.filter(sessionDirHasRegisteredCreds);
  const queuedSessionDirs = WA_AUTOSTART_MAX_SESSIONS > 0
    ? registeredSessionDirs.slice(0, WA_AUTOSTART_MAX_SESSIONS)
    : registeredSessionDirs;

  console.log(`WA autostart queue=${queuedSessionDirs.length}/${registeredSessionDirs.length} registered, skipped=${allSessionDirs.length - registeredSessionDirs.length}, stagger=${WA_AUTOSTART_STAGGER_MS}ms`);

  queuedSessionDirs.forEach((file, index) => {
    const userId = file.split("_")[1];
    if (!userId) return;
    const delayMs = index * WA_AUTOSTART_STAGGER_MS;
    setTimeout(() => {
      startSock(userId).catch((e) => {
        console.error(`❌ [${userId}] Autostart failed:`, e.message);
      });
    }, delayMs);
  });
} else {
  console.log("ℹ️ WA autostart disabled (set WA_AUTOSTART_ALL_SESSIONS=true to enable).");
}

startWhatsAppKeepActive();

// Global Exception Handlers for stability
process.on("uncaughtException", (err) => {
  console.error("🔥 Uncaught Exception:", err.message, err.stack);
  if (err && (err.code === "EADDRINUSE" || /EADDRINUSE/.test(err.message || ""))) {
    console.error("🛑 Fatal: worker cannot bind port (EADDRINUSE). Exiting to avoid duplicate ghost process.");
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("🔥 Unhandled Rejection at:", promise, "reason:", reason);
});

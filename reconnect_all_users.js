#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const http = require("http");

const AUTH_DIR = path.join(__dirname, "apps/worker/auth_info");
const WORKER_URL = process.env.WA_WORKER_URL || `http://${process.env.WA_WORKER_HOST || "127.0.0.1"}:${process.env.WA_WORKER_PORT || "8024"}`;
const DELAY_BETWEEN_REQUESTS = 500; // 500ms between each user

function getRegisteredUsers() {
  if (!fs.existsSync(AUTH_DIR)) {
    console.error("❌ Auth directory not found:", AUTH_DIR);
    return [];
  }

  const dirs = fs.readdirSync(AUTH_DIR)
    .filter(file => file.startsWith("user_"))
    .map(file => file.slice(5)); // Remove "user_" prefix

  // Check which ones have registered=true in creds.json
  const registered = [];
  for (const userId of dirs) {
    const credsPath = path.join(AUTH_DIR, `user_${userId}`, "creds.json");
    if (fs.existsSync(credsPath)) {
      try {
        const creds = JSON.parse(fs.readFileSync(credsPath, "utf8"));
        if (creds.registered === true) {
          registered.push(userId);
        }
      } catch (err) {
        console.warn(`⚠️ Failed to read creds for ${userId}: ${err.message}`);
      }
    }
  }

  return registered;
}

function reconnectUser(userId) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${WORKER_URL}/api/session/${encodeURIComponent(userId)}`, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const result = JSON.parse(data);
          resolve({ userId, status: result.status });
        } catch (err) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
  });
}

async function main() {
  console.log("🔍 Scanning for registered users...\n");
  const users = getRegisteredUsers();
  
  console.log(`✅ Found ${users.length} registered users\n`);
  console.log("🚀 Starting reconnect process...\n");

  let success = 0;
  let failed = 0;
  const results = [];

  for (let i = 0; i < users.length; i++) {
    const userId = users[i];
    try {
      const result = await reconnectUser(userId);
      results.push({ userId, status: result.status, success: true });
      success++;
      console.log(`[${i + 1}/${users.length}] ✅ ${userId}: ${result.status}`);
    } catch (err) {
      results.push({ userId, error: err.message, success: false });
      failed++;
      console.log(`[${i + 1}/${users.length}] ❌ ${userId}: ${err.message}`);
    }

    // Delay between requests
    if (i < users.length - 1) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("📊 Summary:");
  console.log(`   Total users: ${users.length}`);
  console.log(`   Success: ${success}`);
  console.log(`   Failed: ${failed}`);
  console.log("=".repeat(60));

  // Show status breakdown
  const statusCounts = {};
  results.forEach(r => {
    const status = r.success ? r.status : "error";
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });

  console.log("\n📈 Status breakdown:");
  Object.entries(statusCounts).forEach(([status, count]) => {
    console.log(`   ${status}: ${count}`);
  });
}

main().catch(err => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});

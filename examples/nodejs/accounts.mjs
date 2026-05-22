// List / inspect accounts, models, busy state, and dashboard.
//
//   node accounts.mjs              # everything
//   node accounts.mjs accounts     # just /v1/accounts
//   node accounts.mjs dashboard
//   node accounts.mjs history 5    # 5 latest history entries

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:9516";

async function get(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

const action = process.argv[2] || "all";
const arg = process.argv[3];

async function dump(label, p) {
  console.log(`\n── ${label} ──`);
  console.log(JSON.stringify(await get(p), null, 2));
}

try {
  switch (action) {
    case "accounts":
      await dump("accounts", "/v1/accounts");
      break;
    case "models":
      await dump("models", "/v1/admin/models");
      break;
    case "history": {
      const limit = arg ? Number(arg) : 20;
      await dump(`history (limit ${limit})`, `/v1/history?limit=${limit}`);
      break;
    }
    case "busy":
      await dump("busy", "/v1/busy");
      break;
    case "dashboard":
      await dump("dashboard", "/v1/dashboard");
      break;
    case "health":
      await dump("health", "/health");
      break;
    default:
      await dump("health", "/health");
      await dump("dashboard", "/v1/dashboard");
      await dump("accounts", "/v1/accounts");
      await dump("models", "/v1/admin/models");
      await dump("busy", "/v1/busy");
      await dump("history (limit 5)", "/v1/history?limit=5");
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

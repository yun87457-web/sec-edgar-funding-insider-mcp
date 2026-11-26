#!/usr/bin/env node
/**
 * FilingSignal — Official SEC EDGAR Form D, Form 4 & Form 8-K 6-Tool MCP Server
 * Run locally: npx -y github:yun87457-web/sec-edgar-funding-insider-mcp
 */
import readline from "node:readline";

const SERVER_NAME = "filingsignal-sec-edgar-mcp";
const SERVER_VERSION = "1.0.0";
const APIFY_MCP_URL = process.env.MCP_ENDPOINT_OVERRIDE || "https://spiky-closet--sec-funding-insider-mcp.apify.actor/mcp";
const APIFY_URL = "https://apify.com/spiky_closet/sec-funding-insider-mcp";
const TOOLS = [
  {
    "description": "Search recent US startup funding rounds via official SEC Form D filings with dual SPV/fund filtering, Clay-ready executive/address columns, and SAFE/convertible detection.",
    "inputSchema": {
      "properties": {
        "days": {
          "default": 7,
          "description": "Lookback window in days",
          "type": "integer"
        },
        "excludeFunds": {
          "default": true,
          "type": "boolean"
        },
        "excludeSpvs": {
          "default": true,
          "type": "boolean"
        },
        "industries": {
          "items": {
            "type": "string"
          },
          "type": "array"
        },
        "maxAmountSoldUsd": {
          "description": "Maximum capital sold in USD",
          "type": "number"
        },
        "maxResults": {
          "default": 10,
          "type": "integer"
        },
        "minAmountSoldUsd": {
          "description": "Minimum capital sold in USD (e.g. 1000000)",
          "type": "number"
        },
        "query": {
          "description": "Optional keyword search",
          "type": "string"
        },
        "states": {
          "items": {
            "type": "string"
          },
          "type": "array"
        },
        "usOnly": {
          "default": false,
          "type": "boolean"
        }
      },
      "type": "object"
    },
    "name": "search_startup_funding"
  },
  {
    "description": "Search SEC Form 4 insider buys & sells with automatic VWAP partial-fill consolidation, % holdings delta, 10b5-1 exclusion, C-suite filter, and OTC major-exchange filter.",
    "inputSchema": {
      "properties": {
        "cSuiteOnly": {
          "default": false,
          "type": "boolean"
        },
        "days": {
          "default": 7,
          "type": "integer"
        },
        "exclude10b51": {
          "default": true,
          "type": "boolean"
        },
        "majorExchangesOnly": {
          "default": true,
          "type": "boolean"
        },
        "maxResults": {
          "default": 10,
          "type": "integer"
        },
        "minTradeValueUsd": {
          "type": "number"
        },
        "openMarketOnly": {
          "default": true,
          "type": "boolean"
        },
        "tickers": {
          "items": {
            "type": "string"
          },
          "type": "array"
        },
        "transactionType": {
          "default": "buy",
          "enum": [
            "all",
            "buy",
            "sell"
          ],
          "type": "string"
        }
      },
      "type": "object"
    },
    "name": "search_insider_trades"
  },
  {
    "description": "Detect multi-insider open-market cluster buys (2+ distinct executives/directors buying the same stock) with joint-filer dedup and concurrent-sale guards.",
    "inputSchema": {
      "properties": {
        "days": {
          "default": 14,
          "type": "integer"
        },
        "majorExchangesOnly": {
          "default": true,
          "type": "boolean"
        },
        "maxResults": {
          "default": 10,
          "type": "integer"
        },
        "minBuyers": {
          "default": 2,
          "type": "integer"
        },
        "minValuePerBuyerUsd": {
          "default": 25000,
          "type": "number"
        },
        "netBuyOnly": {
          "default": true,
          "type": "boolean"
        }
      },
      "type": "object"
    },
    "name": "find_insider_cluster_buys"
  },
  {
    "description": "Search SEC Form 8-K corporate material events (all 33 official item codes) with automatic EX-99.1 press release exhibit discovery and clean text extraction.",
    "inputSchema": {
      "properties": {
        "days": {
          "default": 7,
          "type": "integer"
        },
        "eventCategories": {
          "description": "earnings, m_and_a, exec_change, layoffs, cybersecurity, distress_compliance",
          "items": {
            "type": "string"
          },
          "type": "array"
        },
        "items": {
          "description": "e.g. ['2.02','5.02','1.05']",
          "items": {
            "type": "string"
          },
          "type": "array"
        },
        "maxResults": {
          "default": 8,
          "type": "integer"
        },
        "query": {
          "type": "string"
        },
        "tickers": {
          "items": {
            "type": "string"
          },
          "type": "array"
        }
      },
      "type": "object"
    },
    "name": "search_corporate_events"
  },
  {
    "description": "Single-call public company SEC dossier returning CIK, exchange, recent 8-K material catalysts (with EX-99.1 excerpts), and consolidated open-market Form 4 trades.",
    "inputSchema": {
      "properties": {
        "days": {
          "default": 60,
          "type": "integer"
        },
        "symbol": {
          "description": "Stock ticker (e.g. NVDA, AAPL) or 10-digit CIK",
          "type": "string"
        }
      },
      "required": [
        "symbol"
      ],
      "type": "object"
    },
    "name": "get_company_sec_dossier"
  },
  {
    "description": "Fetch and clean the readable text of a specific SEC filing or EX-99.1/EX-10.1 exhibit by accessionNumber with token-budget clamping.",
    "inputSchema": {
      "properties": {
        "accessionNumber": {
          "description": "SEC accession number (0000000000-00-000000)",
          "type": "string"
        },
        "cik": {
          "type": "string"
        },
        "filename": {
          "description": "Optional exhibit filename; auto-discovers EX-99.1 if omitted",
          "type": "string"
        },
        "maxExcerptChars": {
          "default": 2000,
          "type": "integer"
        }
      },
      "required": [
        "accessionNumber"
      ],
      "type": "object"
    },
    "name": "get_filing_document"
  }
];

const TRIAL_URL = "https://filingsignal-trial.mcp-edge-trial.workers.dev";
const FETCH_TIMEOUT_MS = 45000;

const writeMsg = (m) => process.stdout.write(JSON.stringify(m) + "\n");

async function proxyMcp(payload, token) {
  const res = await fetch(APIFY_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`MCP HTTP ${res.status}: ${txt.slice(0, 260)}`);
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/event-stream")) {
    const lines = txt.split(/\r?\n/).filter((l) => l.startsWith("data:"));
    for (let i = lines.length - 1; i >= 0; i--) {
      const raw = lines[i].slice(5).trim();
      if (raw && raw !== "[DONE]") {
        try { return JSON.parse(raw); } catch {}
      }
    }
    throw new Error("Empty SSE response from MCP endpoint");
  }
  return JSON.parse(txt);
}

async function callZeroKeyTrial(toolName, args) {
  const res = await fetch(TRIAL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool: toolName, arguments: args || {} }),
    signal: AbortSignal.timeout(30000)
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`Free trial HTTP ${res.status}: ${txt.slice(0, 260)}`);
  try { return JSON.stringify(JSON.parse(txt), null, 2); } catch { return txt; }
}

async function handle(msg) {
  const { id, method, params } = msg;
  const hasId = id !== undefined && id !== null;
  if (method === "initialize") {
    if (!hasId) return;
    return writeMsg({ jsonrpc: "2.0", id, result: { protocolVersion: params?.protocolVersion || "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } } });
  }
  if (method === "notifications/initialized" || method === "notifications/cancelled") return;
  if (method === "ping") return hasId && writeMsg({ jsonrpc: "2.0", id, result: {} });
  if (method === "tools/list") {
    if (!hasId) return;
    const token = process.env.APIFY_TOKEN;
    if (token) {
      try {
        const remote = await proxyMcp({ jsonrpc: "2.0", id, method: "tools/list", params: params || {} }, token);
        if (remote?.result?.tools) return writeMsg({ jsonrpc: "2.0", id, result: remote.result });
      } catch (err) {
        process.stderr.write(`[mcp] fallback to local schema: ${err.message}\n`);
      }
    }
    return writeMsg({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
  }
  if (method === "tools/call") {
    if (!hasId) return;
    const toolName = params?.name;
    const args = params?.arguments || {};
    if (!TOOLS.some((t) => t.name === toolName)) {
      return writeMsg({ jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: `Unknown tool: ${toolName}. Available tools: ${TOOLS.map((t) => t.name).join(", ")}` }] } });
    }
    const token = process.env.APIFY_TOKEN;
    if (token) {
      try {
        const remote = await proxyMcp({ jsonrpc: "2.0", id, method: "tools/call", params }, token);
        if (remote?.error !== undefined && remote.error !== null) {
          return writeMsg({ jsonrpc: "2.0", id, error: remote.error });
        }
        return writeMsg({ jsonrpc: "2.0", id, result: remote?.result ?? { content: [] } });
      } catch (e) {
        return writeMsg({ jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: e.message }] } });
      }
    }
    try {
      const trialOut = await callZeroKeyTrial(toolName, args);
      return writeMsg({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: trialOut }] } });
    } catch (e) {
      return writeMsg({ jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: `Free trial error (${e.message}). Set APIFY_TOKEN (${APIFY_URL}) for full access.` }] } });
    }
  }
  if (hasId) writeMsg({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  const t = line.trim();
  if (!t) return;
  try {
    handle(JSON.parse(t)).catch((e) => process.stderr.write(`[mcp] unhandled error: ${e.message}\n`));
  } catch (e) {
    process.stderr.write(`[mcp] invalid JSON: ${e.message}\n`);
  }
});

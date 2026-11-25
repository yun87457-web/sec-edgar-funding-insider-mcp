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

const writeMsg = (m) => process.stdout.write(JSON.stringify(m) + "\n");

async function proxyMcp(payload, token) {
  const res = await fetch(APIFY_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`MCP HTTP ${res.status}: ${txt.slice(0, 260)}`);
  return JSON.parse(txt);
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
    return writeMsg({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
  }
  if (method === "tools/call") {
    if (!hasId) return;
    const token = process.env.APIFY_TOKEN;
    if (!token) {
      return writeMsg({ jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: `Set APIFY_TOKEN in your MCP client env (3,333 free SEC filings/mo: ${APIFY_URL}).` }] } });
    }
    try {
      const remote = await proxyMcp({ jsonrpc: "2.0", id, method: "tools/call", params }, token);
      return writeMsg({ jsonrpc: "2.0", id, result: remote.result, error: remote.error });
    } catch (e) {
      return writeMsg({ jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: e.message }] } });
    }
  }
  if (hasId) writeMsg({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  const t = line.trim();
  if (!t) return;
  try { handle(JSON.parse(t)).catch((e) => process.stderr.write(e.message + "\n")); } catch {}
});

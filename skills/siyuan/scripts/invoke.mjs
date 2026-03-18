#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadConfig } from "../lib/load-config.mjs";
import { runAction } from "../lib/action-router.mjs";
import { sanitizeErrorMessage } from "../lib/formatters.mjs";

async function readStdin() {
  if (process.stdin.isTTY) {
    return "";
  }

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function readInput() {
  const stdinInput = await readStdin();
  if (stdinInput.trim()) {
    return stdinInput;
  }

  throw new Error("缺少输入。请通过标准输入提供形如 {\"action\":\"...\",\"params\":{}} 的 JSON。")
}

function parsePayload(rawInput) {
  let payload;

  try {
    payload = JSON.parse(rawInput);
  } catch {
    throw new Error("输入必须是合法 JSON，且根节点必须包含 action 与 params。")
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("输入 JSON 的根节点必须是对象。")
  }

  return payload;
}

async function main() {
  const currentFilePath = fileURLToPath(import.meta.url);
  const skillDir = resolve(dirname(currentFilePath), "..");
  const rawInput = await readInput();
  const payload = parsePayload(rawInput);
  const config = await loadConfig({ skillDir });
  const result = await runAction(payload, config);

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

main().catch((error) => {
  const message = sanitizeErrorMessage(error instanceof Error ? error.message : String(error));
  process.stderr.write(`${JSON.stringify({ ok: false, error: { message } }, null, 2)}\n`);
  process.exitCode = 1;
});

import { ACTIONS, ACTION_NAMES } from "./actions.mjs";
import { createErrorResult } from "./formatters.mjs";
import { SiyuanHttpClient } from "./http-client.mjs";

const CONFIRM_REQUIRED_ACTIONS = new Set([
  "create_notebook",
  "remove_notebook",
  "rename_notebook",
  "open_notebook",
  "close_notebook",
  "create_doc_with_md",
  "rename_doc",
  "remove_doc",
  "move_docs",
  "insert_block",
  "prepend_block",
  "append_block",
  "update_block",
  "delete_block",
  "move_block",
  "set_block_attrs",
  "push_msg",
]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExplicitConfirmation(params) {
  return params.confirmed === true;
}

function validateRiskBoundary(action, params) {
  if (CONFIRM_REQUIRED_ACTIONS.has(action) && !hasExplicitConfirmation(params)) {
    throw new Error(`action ${action} 具有副作用。只有在用户已明确确认后，才可设置 params.confirmed=true 执行。`);
  }

  if (action === "sql_query" && params.allowWrite === true && !hasExplicitConfirmation(params)) {
    throw new Error("sql_query 在 allowWrite=true 时具有副作用。只有在用户已明确确认后，才可同时设置 params.confirmed=true 执行。");
  }
}

export async function runAction(payload, config) {
  const action = typeof payload?.action === "string" ? payload.action.trim() : "";
  const params = payload?.params === undefined ? {} : payload.params;

  if (!action) {
    return createErrorResult(action || "unknown_action", new Error("payload.action 必须是非空字符串"));
  }

  if (!isPlainObject(params)) {
    return createErrorResult(action, new Error("payload.params 必须是对象"));
  }

  const handler = ACTIONS[action];
  if (!handler) {
    return createErrorResult(
      action,
      new Error(`不支持的 action: ${action}。可用 action: ${ACTION_NAMES.join(", ")}`),
    );
  }

  try {
    validateRiskBoundary(action, params);
    const client = new SiyuanHttpClient(config);
    return await handler({ client, config }, params);
  } catch (error) {
    return createErrorResult(action, error);
  }
}

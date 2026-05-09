import * as core from '@actions/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { BrowserSession } from './core/browser';
import { purchaseAuto, purchaseManual } from './core/purchase';
import { generateExcluding } from './utils/numbers';
import { initLabels, createConsolidatedIssue, checkWinningIssues } from './github/issues';
import { notifyPurchase, notifyWinning } from './telegram/notify';

interface PurchaseMetadata {
  type: 'auto' | 'manual';
  numbers: number[][];
  timestamp: string;
}

interface WorkflowApi {
  purchaseAuto: (amount: number) => Promise<number[][]>;
  purchaseManual: (numbers: number[][]) => Promise<number[][]>;
  generateExcluding: (exclude: number[][], count: number) => number[][];
}

type CustomWorkflow = (api: WorkflowApi) => Promise<unknown> | unknown;

const ALLOWED_WORKFLOW_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

function isPathInside(parent: string, candidate: string): boolean {
  const relativePath = path.relative(parent, candidate);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

async function resolveWorkflowPath(workflowFile: string): Promise<string> {
  if (workflowFile.includes('\0')) {
    throw new Error('[Main] Invalid custom workflow path: null bytes are not allowed');
  }

  const workspaceRoot = path.resolve(process.env.GITHUB_WORKSPACE || process.cwd());
  const resolvedPath = path.resolve(workspaceRoot, workflowFile);
  const displayPath = JSON.stringify(workflowFile);

  if (!isPathInside(workspaceRoot, resolvedPath)) {
    throw new Error(`[Main] Invalid custom workflow path ${displayPath}: path must stay inside the workspace`);
  }

  const extension = path.extname(resolvedPath).toLowerCase();
  if (!ALLOWED_WORKFLOW_EXTENSIONS.has(extension)) {
    throw new Error(`[Main] Invalid custom workflow path ${displayPath}: only .js, .mjs, and .cjs files are allowed`);
  }

  const stats = await fs.stat(resolvedPath).catch(() => undefined);
  if (!stats?.isFile()) {
    throw new Error(`[Main] Invalid custom workflow path ${displayPath}: file does not exist`);
  }

  return resolvedPath;
}

async function loadWorkflow(workflowFile: string): Promise<CustomWorkflow> {
  const resolvedPath = await resolveWorkflowPath(workflowFile);

  try {
    const workflowModule = await import(pathToFileURL(resolvedPath).href);
    const workflow = workflowModule.default;

    if (typeof workflow !== 'function') {
      throw new Error(
        `[Main] Invalid custom workflow export in "${workflowFile}". ` +
          `Expected default export function.\n` +
          `- ESM (.js/.mjs): export default async (api) => {}\n` +
          `- CJS (.cjs): module.exports = async (api) => {}`
      );
    }

    return workflow as CustomWorkflow;
  } catch (error) {
    if (error instanceof Error && error.message.includes('module is not defined in ES module scope')) {
      throw new Error(
        `[Main] Invalid custom workflow module format in "${workflowFile}".\n` +
          `Detected CommonJS syntax (module.exports) in a .js file under an ESM package.\n` +
          `Choose one of the following:\n` +
          `1) Keep .js and switch to ESM: export default async (api) => {}\n` +
          `2) Keep CommonJS and rename file to .cjs: module.exports = async (api) => {}`
      );
    }

    throw error;
  }
}

async function run() {
  let session: BrowserSession | null = null;
  const purchases: PurchaseMetadata[] = []; // Track all successful purchases

  try {
    // Get inputs
    const checkWinningOnly = core.getBooleanInput('check-winning-only');
    const amount = parseInt(core.getInput('game-count') || '5');
    const workflowFile = core.getInput('workflow-file');

    console.log('[Main] Starting lotto purchase action');

    // Initialize GitHub labels
    console.log('[Main] Initializing GitHub labels');
    await initLabels();

    // Check previous purchases for winning
    console.log('[Main] Checking winning for previous purchases');
    const winningResults = await checkWinningIssues();

    // Send Telegram notifications for winning results
    for (const result of winningResults) {
      await notifyWinning(result.issueNumber, result.round, result.ranks);
    }

    if (checkWinningOnly) {
      console.log('[Main] Check-winning-only mode enabled. Skipping browser login and purchase flow.');
      return;
    }

    const id = core.getInput('dhlottery-id', { required: true });
    const pwd = core.getInput('dhlottery-password', { required: true });
    core.setSecret(id);
    core.setSecret(pwd);

    session = new BrowserSession();

    // Initialize browser and login
    console.log('[Main] Initializing browser session');
    await session.init({
      headless: true,
      args: ['--no-sandbox']
    });

    console.log('[Main] Logging in');
    await session.login(id, pwd);
    const activeSession = session;

    // Create API with session bound to functions (no need to pass session manually)
    const api = {
      purchaseAuto: async (amt: number) => {
        console.log(`[Main] Executing auto purchase: ${amt} games`);
        const result = await purchaseAuto(activeSession, amt);
        purchases.push({
          type: 'auto',
          numbers: result,
          timestamp: new Date().toISOString()
        }); // Auto-track successful purchase
        console.log(`[Main] Auto purchase successful: ${result.length} games`);
        return result;
      },
      purchaseManual: async (numbers: number[][]) => {
        console.log(`[Main] Executing manual purchase: ${numbers.length} games`);
        const result = await purchaseManual(activeSession, numbers);
        purchases.push({
          type: 'manual',
          numbers: result,
          timestamp: new Date().toISOString()
        }); // Auto-track successful purchase
        console.log(`[Main] Manual purchase successful: ${result.length} games`);
        return result;
      },
      generateExcluding: (exclude: number[][], count: number) => {
        console.log(`[Main] Generating ${count} games excluding ${exclude.length} sets`);
        return generateExcluding(exclude, count);
      }
    };

    // Execute user workflow
    if (workflowFile) {
      console.log(`[Main] Loading custom workflow from: ${workflowFile}`);
      const workflow = await loadWorkflow(workflowFile);
      await workflow(api);
      console.log('[Main] Custom workflow completed');
    } else {
      // Default: simple auto purchase
      console.log(`[Main] Running default auto purchase: ${amount} games`);
      await api.purchaseAuto(amount);
    }

    console.log(`[Main] All purchases completed: ${purchases.length} total purchases`);
  } catch (error) {
    if (error instanceof Error) {
      console.error('[Main] Workflow error:', error.message);
      core.setFailed(error.message);
    } else {
      console.error('[Main] Workflow error:', error);
      core.setFailed(String(error));
    }
    // Continue to create issues for successful purchases
  } finally {
    // Create one consolidated issue for all successful purchases
    if (purchases.length > 0) {
      try {
        await createConsolidatedIssue(purchases);
        const totalGames = purchases.reduce((sum, p) => sum + p.numbers.length, 0);
        console.log(`[Main] Created consolidated issue for ${purchases.length} purchases (${totalGames} total games)`);

        // Send Telegram notification for purchases
        await notifyPurchase(purchases);
      } catch (error) {
        console.error(`[Main] Failed to create consolidated issue:`, error);
      }
    } else {
      console.log(`[Main] No successful purchases to create issue`);
    }

    // Close browser session
    if (session) {
      console.log('[Main] Closing browser session');
      await session.close();
    }

    console.log('[Main] Action completed');
  }
}

run();

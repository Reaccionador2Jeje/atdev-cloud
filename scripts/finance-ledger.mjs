import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

const ledgerPath = resolve(process.cwd(), "finance/ledger.json");
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const currencyPattern = /^[A-Z]{3}$/;

async function readLedger() {
  const raw = await readFile(ledgerPath, "utf8");
  const entries = JSON.parse(raw);
  if (!Array.isArray(entries)) throw new Error("finance/ledger.json must contain a JSON array.");
  return entries;
}

function validateEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Entry must be a JSON object.");
  if (!datePattern.test(entry.date) || Number.isNaN(Date.parse(entry.date)) || new Date(entry.date).toISOString().slice(0, 10) !== entry.date) throw new Error("date must use a valid YYYY-MM-DD date.");
  if (!["income", "expense"].includes(entry.type)) throw new Error("type must be income or expense.");
  if (typeof entry.category !== "string" || entry.category.trim().length < 2 || entry.category.length > 40) throw new Error("category must contain 2-40 characters.");
  if (typeof entry.amount !== "number" || !Number.isFinite(entry.amount) || entry.amount <= 0) throw new Error("amount must be a positive number.");
  if (typeof entry.currency !== "string" || !currencyPattern.test(entry.currency)) throw new Error("currency must be a three-letter uppercase ISO code.");
  if (!["confirmed", "planned"].includes(entry.status)) throw new Error("status must be confirmed or planned.");
  if (typeof entry.project !== "string" || entry.project.trim().length < 2 || entry.project.length > 80) throw new Error("project must contain 2-80 characters.");
  if (typeof entry.description !== "string" || entry.description.trim().length < 5 || entry.description.length > 240) throw new Error("description must contain 5-240 characters.");
  if (entry.public_reference !== undefined) {
    try { const url = new URL(entry.public_reference); if (!["http:", "https:"].includes(url.protocol)) throw new Error(); }
    catch { throw new Error("public_reference must be an HTTP(S) URL."); }
  }
  if (entry.notes !== undefined && (typeof entry.notes !== "string" || entry.notes.length > 300)) throw new Error("notes must be a string up to 300 characters.");
}

async function addEntry(raw) {
  const input = JSON.parse(raw);
  validateEntry(input);
  const entries = await readLedger();
  const entry = { ...input, id: randomUUID() };
  entries.push(entry);
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  await writeFile(ledgerPath, JSON.stringify(entries, null, 2) + "\n", "utf8");
  process.stdout.write("Added " + entry.id + " (" + entry.status + ").\n");
}

async function report() {
  const entries = await readLedger();
  const currencies = [...new Set(entries.map((entry) => entry.currency))].sort();
  if (!entries.length) {
    process.stdout.write("AtDev finance ledger is empty. No income or expenses have been recorded.\n");
    return;
  }
  for (const currency of currencies) {
    process.stdout.write("\n" + currency + "\n");
    for (const status of ["confirmed", "planned"]) {
      const rows = entries.filter((entry) => entry.currency === currency && entry.status === status);
      const income = rows.filter((entry) => entry.type === "income").reduce((sum, entry) => sum + entry.amount, 0);
      const expenses = rows.filter((entry) => entry.type === "expense").reduce((sum, entry) => sum + entry.amount, 0);
      process.stdout.write("  " + status + ": income " + income.toFixed(2) + " | expenses " + expenses.toFixed(2) + " | net " + (income - expenses).toFixed(2) + "\n");
    }
  }
  process.stdout.write("\nEntries: " + entries.length + "\n");
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === "add") {
    if (!args.length) throw new Error("Usage: node scripts/finance-ledger.mjs add '<JSON entry>'");
    await addEntry(args.join(" "));
  } else if (command === "report" || !command) {
    await report();
  } else {
    throw new Error("Commands: add, report");
  }
} catch (error) {
  process.stderr.write("Finance ledger error: " + error.message + "\n");
  process.exitCode = 1;
}

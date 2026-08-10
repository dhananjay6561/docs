#!/usr/bin/env node
/**
 * Verifies the JSON-LD graph in the built site.
 *
 * The @id-based consolidation only pays off if every bare {"@id": "..."}
 * reference resolves to a node actually defined on the same page -- an
 * unresolved reference is worse than the inline duplicate it replaced,
 * because consumers get a dangling pointer instead of an entity. This walks
 * the built HTML and fails on unparseable JSON-LD or dangling references.
 *
 * Usage: node scripts/verify-schema-graph.js [buildDir]
 */
const fs = require("fs");
const path = require("path");

const buildDir = process.argv[2] || "build";
const SKIP_VERSIONS = ["/1.0.0/", "/2.0.0/"];

function findHtml(dir, out = []) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findHtml(full, out);
    } else if (entry.name === "index.html") {
      out.push(full);
    }
  }
  return out;
}

// The build inlines JSON-LD into <script type="application/ld+json">. Entities
// are HTML-escaped by React, so unescape before parsing.
const SCRIPT_RE =
  /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;

function unescapeHtml(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// Collect every node that declares an @id, and every bare {"@id"} reference.
function walk(node, defined, referenced) {
  if (Array.isArray(node)) {
    node.forEach((n) => walk(n, defined, referenced));
    return;
  }
  if (!node || typeof node !== "object") {
    return;
  }
  const keys = Object.keys(node).filter((k) => k !== "@context");
  if (node["@id"]) {
    // A node carrying only "@id" is a reference; anything else defines it.
    if (keys.length === 1) {
      referenced.add(node["@id"]);
    } else {
      defined.add(node["@id"]);
    }
  }
  for (const key of keys) {
    walk(node[key], defined, referenced);
  }
}

const files = findHtml(buildDir).filter(
  (f) => !SKIP_VERSIONS.some((v) => f.includes(v))
);

let parseErrors = 0;
let dangling = 0;
let blocks = 0;
const typeCounts = new Map();

for (const file of files) {
  const html = fs.readFileSync(file, "utf8");
  const defined = new Set();
  const referenced = new Set();
  let match;
  SCRIPT_RE.lastIndex = 0;
  while ((match = SCRIPT_RE.exec(html))) {
    blocks += 1;
    let parsed;
    try {
      parsed = JSON.parse(unescapeHtml(match[1]));
    } catch (err) {
      parseErrors += 1;
      console.error(`INVALID JSON-LD  ${file}\n  ${err.message}`);
      continue;
    }
    const graph = parsed["@graph"] || parsed;
    walk(graph, defined, referenced);
    for (const n of Array.isArray(graph) ? graph : [graph]) {
      const t = n && n["@type"];
      if (typeof t === "string") {
        typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
      }
    }
  }
  for (const ref of referenced) {
    if (!defined.has(ref)) {
      dangling += 1;
      console.error(`DANGLING @id     ${file}\n  ${ref}`);
    }
  }
}

console.log(`\nPages scanned:     ${files.length}`);
console.log(`JSON-LD blocks:    ${blocks}`);
console.log(`Invalid JSON:      ${parseErrors}`);
console.log(`Dangling @id refs: ${dangling}`);
console.log("\nTop-level @type distribution:");
for (const [type, count] of [...typeCounts].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(5)}  ${type}`);
}

process.exit(parseErrors || dangling ? 1 : 0);

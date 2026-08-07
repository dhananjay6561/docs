// remarkFaqSchema — emit FAQPage JSON-LD for FAQ docs.
//
// FAQ pages (keploy-explained/*-faq.md) are written as a list of
// `### <question>` headings each followed by answer prose. Google/AI can only
// extract them as an FAQ rich result if the page carries FAQPage structured
// data with Question/Answer pairs — which Docusaurus does not generate.
//
// This build-time plugin detects FAQ docs (by file path), pulls each level-2/3
// heading as a Question and the prose that follows (until the next heading) as
// the acceptedAnswer, and injects a <script type="application/ld+json"> block.
// Dependency-free; never throws — a page it can't parse is simply left as-is.

// Collect the plain-text content of an mdast node subtree (headings, prose).
function textOf(node) {
  if (!node) return "";
  if (typeof node.value === "string") return node.value; // text, inlineCode
  if (Array.isArray(node.children)) {
    return node.children.map(textOf).join("");
  }
  return "";
}

// Strip a leading list number ("1. ", "12. ") that FAQ headings use.
function cleanQuestion(text) {
  return text.replace(/^\s*\d+[.)]\s*/, "").trim();
}

function isFaqFile(file) {
  const p = (file && (file.path || file.history?.[0])) || "";
  return /-faq\.mdx?$/.test(p);
}

function remarkFaqSchema() {
  return function transformer(tree, file) {
    try {
      if (!isFaqFile(file)) return;
      const children = Array.isArray(tree.children) ? tree.children : [];

      const qa = [];
      let current = null;
      for (const node of children) {
        if (node.type === "heading" && (node.depth === 2 || node.depth === 3)) {
          // flush previous
          if (current && current.answer.trim()) qa.push(current);
          const q = cleanQuestion(textOf(node));
          // skip the page's own title-style h2/h3 that isn't a question
          current = q ? {question: q, answer: ""} : null;
        } else if (current && node.type !== "heading") {
          const t = textOf(node).trim();
          if (t) current.answer += (current.answer ? " " : "") + t;
        } else if (node.type === "heading" && node.depth <= 1) {
          if (current && current.answer.trim()) qa.push(current);
          current = null;
        }
      }
      if (current && current.answer.trim()) qa.push(current);

      // Only emit when we found real Q&A pairs.
      if (qa.length < 2) return;

      const schema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: qa.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {"@type": "Answer", text: item.answer},
        })),
      };

      // Inject inside a <head> block: Docusaurus hoists MDX <head> content to
      // the document head (a bare <script> in the body is stripped). The script
      // child is a JS string-literal expression `{"...json..."}`, so the JSX
      // evaluates back to the exact JSON string at render time (matches the
      // DocItem JSON-LD pattern). MDX needs an estree AST on expression nodes,
      // so build a minimal Program(Literal) rather than only a raw value.
      const jsonString = JSON.stringify(schema);
      const raw = JSON.stringify(jsonString);
      const jsonExpression = {
        type: "mdxFlowExpression",
        value: jsonString,
        data: {
          estree: {
            type: "Program",
            sourceType: "module",
            body: [
              {
                type: "ExpressionStatement",
                expression: {type: "Literal", value: jsonString, raw},
              },
            ],
          },
        },
      };
      // Emit as a plain <script> in the page body. react-dom/server treats
      // <script> as a raw-text element, so the JSON renders unescaped (clean
      // quotes) — matching how the site's <HowTo> component emits JSON-LD.
      tree.children.push({
        type: "mdxJsxFlowElement",
        name: "script",
        attributes: [
          {
            type: "mdxJsxAttribute",
            name: "type",
            value: "application/ld+json",
          },
        ],
        children: [jsonExpression],
      });
    } catch (_e) {
      // Never break the build over a schema nicety.
    }
  };
}

module.exports = remarkFaqSchema;

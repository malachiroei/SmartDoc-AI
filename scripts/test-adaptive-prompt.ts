import { loadClassificationMemory, formatFewShotBlock } from "@/lib/ai/memory";
import { buildAdaptiveSystemPrompt } from "@/lib/ai/classify";

async function main() {
  const m = await loadClassificationMemory();
  const p = buildAdaptiveSystemPrompt(m);
  console.log("EXAMPLES", m.examples.length);
  console.log("OVERRIDES", m.feedbackOverrides.length);
  console.log("VENDORS", m.knownVendors.slice(0, 8));
  console.log("FOLDERS", m.knownFolders.slice(0, 8));
  console.log("---PROMPT HEAD---");
  console.log(p.slice(0, 1200));
  console.log("---FEWSHOT BLOCK---");
  console.log(formatFewShotBlock(m.examples));
  const ok =
    p.includes("VERIFIED FEW-SHOT EXAMPLES") &&
    p.includes("מסמכים אישיים") &&
    p.includes("NEVER classify it as an Invoice");
  console.log("PROMPT_OK", ok);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

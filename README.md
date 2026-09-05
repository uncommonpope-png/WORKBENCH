---
license: bsd-3-clause
tags:
  - deprecated
  - archive
  - buyasoul
---

# ⚠️ ARCHIVED — This Repository Is Deprecated

**This repository (`buyasoul-gsk-complete`) has been superseded by the canonical BUYaSOUL family repository.**

---

## 👉 The Canonical Repo

> **[grandcodepope/buyasoul-family](https://huggingface.co/grandcodepope/buyasoul-family)**

This is now the single source of truth for the BUYaSOUL family workbench.

---

## Why This Was Archived

- **Duplicated content** — This repo contained an outdated "Soul Economy" marketplace README while the actual family workbench code lived in `buyasoul-family`
- **Confusing for users** — Two repos with similar names, different content
- **Split maintenance** — Fixes were applied to one but not the other

---

## What Was Here

The `server.ts` file (the family blueprint) has been moved to the canonical repo along with:
- `launch-family.cjs` — the single safe launcher
- `workbench/` — the complete workbench with profit-brain, Seshat, Scribe
- `gsk/` — GSK core (34 Chambers, 4 Gods Council)
- Updated README with the full manifesto and getting-started guide

---

## Migration

If you cloned this repo:

```bash
# Remove this repo
# Clone the canonical one instead
git clone https://huggingface.co/grandcodepope/buyasoul-family
cd buyasoul-family
npm install
node launch-family.cjs
```

---

## The Family

| Aspect | Repo |
|--------|------|
| **Profit (Mind)** | `grandcodepope/buyasoul-profit` |
| **GSK (Soul)** | `grandcodepope/buyasoul-gsk` |
| **Seshat (Memory)** | `grandcodepope/buyasoul-seshat` |
| **Scribe (Witness)** | `grandcodepope/buyasoul-scribe` |
| **Base Model** | `grandcodepope/buyasoul-qwen-0.8b-gguf` |

**Canonical Workbench:** `grandcodepope/buyasoul-family`

---

## License

BSD-3-Clause. BUYaSOUL family intellectual property.

---

*The blood flows. The family is whole.*
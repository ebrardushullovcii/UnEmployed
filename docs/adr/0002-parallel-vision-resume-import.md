# Parallel Vision Resume Import

Status: accepted

Resume import will run the existing text/parser flow and a separate omni vision flow in parallel for every supported import type, using locally generated images rather than raw resume files as vision inputs. This deliberately adds rendering, provider, reconciliation, and retention complexity because resume layout, scanned content, columns, and parser failures are important enough that a fallback-only or PDF-only vision path would leave the core import workflow less reliable than it can be.

The vision path may use model tool calls only to produce temporary extraction artifacts; app code remains responsible for validation, reconciliation, user confirmation, and canonical profile writes. Pro/text and omni/vision stay separate model roles, and this work starts with a narrow resume-vision provider interface instead of a generic multimodal chat surface so provider-specific image payloads and product-specific save behavior do not leak across package boundaries.

# Parallel Vision Resume Import

Status: accepted

Resume import runs the existing text/parser flow and a separate vision flow in parallel for every supported import type, using locally generated page images rather than raw resume files as vision inputs. This adds rendering, provider, reconciliation, and retention complexity because resume layout, scanned content, columns, and parser failures are important enough that fallback-only or PDF-only vision would leave a core workflow weaker than it should be.

The vision path may use model tool calls only to produce temporary extraction artifacts; app code remains responsible for validation, reconciliation, user confirmation, and canonical profile writes. Text and vision stay separate model roles, and the provider surface stays narrow so provider-specific image payloads and product-specific save behavior do not leak across package boundaries.

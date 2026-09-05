import { describe, expect, test } from "vitest";
import { DESKTOP_AUTOMATIC_DATABASE_BACKUP_OPTIONS } from "./create-workspace-service";

describe("desktop automatic workspace database backup wiring", () => {
  test("enables shutdown rotation and the dedicated pre-reset destination", () => {
    expect(DESKTOP_AUTOMATIC_DATABASE_BACKUP_OPTIONS).toEqual({
      onClose: true,
      beforeReset: true,
    });
  });

  // Scope note: these options produce database-only snapshots
  // (`<workspace>.backup` / `.backup.prev` for graceful close and a
  // dedicated `<workspace>.reset-backup` that close rotation cannot
  // overwrite). They do not capture documents or candidate asset files, so
  // they must never be presented as full-workspace restore capability.
});

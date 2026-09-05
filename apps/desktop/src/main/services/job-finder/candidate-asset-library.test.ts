import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  CandidateAssetLibrary,
  CandidateAssetLibraryError,
} from "./candidate-asset-library";

describe("CandidateAssetLibrary", () => {
  let temporaryDirectory: string;
  let sourceDirectory: string;
  let libraryDirectory: string;
  let library: CandidateAssetLibrary;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), "candidate-assets-"),
    );
    sourceDirectory = path.join(temporaryDirectory, "source");
    libraryDirectory = path.join(temporaryDirectory, "library");
    await mkdir(sourceDirectory);
    library = new CandidateAssetLibrary(libraryDirectory);
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  test("copies and verifies an immutable asset without exposing its app-owned path", async () => {
    const bytes = Buffer.from("%PDF-1.7\nprivate candidate material\n%%EOF");
    const sourcePath = path.join(sourceDirectory, "Alex Resume.pdf");
    await writeFile(sourcePath, bytes);

    const result = await library.importFromSourcePath(sourcePath, {
      kind: "resume",
      sensitivity: "sensitive",
      consentScope: "private_storage_only",
      retention: "until_deleted",
    });

    expect(result.status).toBe("imported");
    if (result.status !== "imported")
      throw new Error("Expected imported asset");
    expect(result.asset).toMatchObject({
      originalName: "Alex Resume.pdf",
      mime: "application/pdf",
      byteSize: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      consentScope: "private_storage_only",
      deletedAt: null,
    });
    expect(result.asset).not.toHaveProperty("path");
    expect(result.asset).not.toHaveProperty("bytes");

    const storedFiles = await readdir(libraryDirectory);
    const storedDocument = storedFiles.find((file) => file.endsWith(".pdf"));
    expect(storedDocument).toMatch(/^asset_[a-f0-9-]+\.pdf$/);
    expect(
      await readFile(path.join(libraryDirectory, storedDocument!)),
    ).toEqual(bytes);

    const reopened = new CandidateAssetLibrary(libraryDirectory);
    expect((await reopened.list({ includeDeleted: false })).assets).toEqual([
      result.asset,
    ]);
  });

  test("soft-deletes metadata while retaining the immutable bytes and hides it by default", async () => {
    const sourcePath = path.join(sourceDirectory, "interview-notes.txt");
    await writeFile(sourcePath, "Question one\nAnswer one", "utf8");
    const imported = await library.importFromSourcePath(sourcePath, {
      kind: "transcript",
      sensitivity: "highly_sensitive",
      consentScope: "private_storage_only",
      retention: "30_days",
    });
    if (imported.status !== "imported")
      throw new Error("Expected imported asset");

    expect(imported.asset.extractedText).toMatchObject({
      status: "ready",
      characterCount: 23,
    });
    expect(imported.asset.extractedText).not.toHaveProperty("text");
    const deleted = await library.softDelete(imported.asset.id);

    expect(deleted.asset.deletedAt).not.toBeNull();
    expect((await library.list({ includeDeleted: false })).assets).toEqual([]);
    expect((await library.list({ includeDeleted: true })).assets).toEqual([
      deleted.asset,
    ]);
    expect(
      (await readdir(libraryDirectory)).some((file) => file.endsWith(".txt")),
    ).toBe(true);
  });

  test("resolves only consented, digest-verified assets for application use", async () => {
    const sourcePath = path.join(sourceDirectory, "portfolio.pdf");
    await writeFile(sourcePath, "%PDF-1.7\nportfolio\n%%EOF", "utf8");
    const imported = await library.importFromSourcePath(sourcePath, {
      kind: "portfolio",
      sensitivity: "sensitive",
      consentScope: "job_application_attachment",
      retention: "until_deleted",
    });
    if (imported.status !== "imported")
      throw new Error("Expected imported asset");

    const resolved = await library.resolveForApplication(imported.asset.id);
    expect(resolved.asset).toEqual(imported.asset);
    expect(Buffer.from(await resolved.loadVerifiedBytes())).toEqual(
      Buffer.from("%PDF-1.7\nportfolio\n%%EOF"),
    );

    const storedDocument = (await readdir(libraryDirectory)).find((file) =>
      file.endsWith(".pdf"),
    );
    if (!storedDocument) throw new Error("Expected stored asset");
    await writeFile(
      path.join(libraryDirectory, storedDocument),
      "%PDF-1.7\ntampered\n%%EOF",
      "utf8",
    );
    await expect(resolved.loadVerifiedBytes()).rejects.toThrow(
      /missing or changed|integrity verification/i,
    );
  });

  test("rejects mismatched, executable, and kind-incompatible files before copying", async () => {
    const disguisedPdf = path.join(sourceDirectory, "fake.pdf");
    const executable = path.join(sourceDirectory, "payload.exe");
    const realPdf = path.join(sourceDirectory, "certificate.pdf");
    await writeFile(disguisedPdf, "not a PDF", "utf8");
    await writeFile(executable, Buffer.from([0x4d, 0x5a, 0x90, 0x00]));
    await writeFile(realPdf, "%PDF-1.7\n%%EOF", "utf8");

    for (const [sourcePath, kind] of [
      [disguisedPdf, "resume"],
      [executable, "other"],
      [realPdf, "image"],
    ] as const) {
      await expect(
        library.importFromSourcePath(sourcePath, {
          kind,
          sensitivity: "sensitive",
          consentScope: "private_storage_only",
          retention: "until_deleted",
        }),
      ).rejects.toBeInstanceOf(CandidateAssetLibraryError);
    }

    expect(
      await readdir(libraryDirectory).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return [];
        throw error;
      }),
    ).toEqual([]);
  });

  test("expires timed assets into Trash and purges bytes plus metadata after seven days", async () => {
    let now = new Date("2026-08-10T10:00:00.000Z");
    library = new CandidateAssetLibrary(libraryDirectory, () => now);
    const sourcePath = path.join(sourceDirectory, "timed-notes.txt");
    await writeFile(sourcePath, "Private timed notes", "utf8");
    const imported = await library.importFromSourcePath(sourcePath, {
      kind: "work_sample",
      sensitivity: "sensitive",
      consentScope: "job_application_attachment",
      retention: "30_days",
    });
    if (imported.status !== "imported")
      throw new Error("Expected imported asset");

    expect(imported.asset.lifecycle).toEqual({
      retentionStartedAt: "2026-08-10T10:00:00.000Z",
      expiresAt: "2026-09-09T10:00:00.000Z",
      deletionReason: null,
      purgeAt: null,
    });

    now = new Date("2026-09-09T10:00:00.000Z");
    expect((await library.list({ includeDeleted: false })).assets).toEqual([]);
    const trash = (await library.list({ includeDeleted: true })).assets;
    expect(trash).toHaveLength(1);
    expect(trash[0]).toMatchObject({
      deletedAt: "2026-09-09T10:00:00.000Z",
      lifecycle: {
        deletionReason: "expired",
        purgeAt: "2026-09-16T10:00:00.000Z",
      },
    });
    await expect(
      library.resolveForApplication(imported.asset.id),
    ).rejects.toThrow(/no longer available/i);
    expect(
      (await readdir(libraryDirectory)).some((file) => file.endsWith(".txt")),
    ).toBe(true);

    now = new Date("2026-09-16T10:00:00.000Z");
    await library.enforceLifecycle();
    expect((await library.list({ includeDeleted: true })).assets).toEqual([]);
    expect(
      (await readdir(libraryDirectory)).some((file) => file.endsWith(".txt")),
    ).toBe(false);
  });

  test("restores from Trash only with an explicit policy and a fresh retention clock", async () => {
    let now = new Date("2026-08-10T10:00:00.000Z");
    library = new CandidateAssetLibrary(libraryDirectory, () => now);
    const sourcePath = path.join(sourceDirectory, "restorable.pdf");
    await writeFile(sourcePath, "%PDF-1.7\nrestore me\n%%EOF", "utf8");
    const imported = await library.importFromSourcePath(sourcePath, {
      kind: "portfolio",
      sensitivity: "sensitive",
      consentScope: "job_application_attachment",
      retention: "until_deleted",
    });
    if (imported.status !== "imported")
      throw new Error("Expected imported asset");

    const resolvedBeforeRemoval = await library.resolveForApplication(
      imported.asset.id,
    );
    now = new Date("2026-08-11T10:00:00.000Z");
    const removed = await library.softDelete(imported.asset.id);
    expect(removed.asset.lifecycle?.purgeAt).toBe("2026-08-18T10:00:00.000Z");
    await expect(
      library.resolveForApplication(imported.asset.id),
    ).rejects.toThrow(/no longer available/i);
    await expect(resolvedBeforeRemoval.loadVerifiedBytes()).rejects.toThrow(
      /no longer available/i,
    );

    now = new Date("2026-08-12T10:00:00.000Z");
    const restored = await library.restore({
      assetId: imported.asset.id,
      retention: "90_days",
    });
    expect(restored.asset).toMatchObject({
      retention: "90_days",
      deletedAt: null,
      lifecycle: {
        retentionStartedAt: "2026-08-12T10:00:00.000Z",
        expiresAt: "2026-11-10T10:00:00.000Z",
        deletionReason: null,
        purgeAt: null,
      },
    });

    now = new Date("2026-08-18T10:00:00.000Z");
    const resolvedAfterRestore = await library.resolveForApplication(
      imported.asset.id,
    );
    expect(resolvedAfterRestore.asset.id).toBe(imported.asset.id);
    expect(typeof resolvedAfterRestore.loadVerifiedBytes).toBe("function");
  });

  test("keeps a 90-day asset active until the exact boundary and expires it at the boundary", async () => {
    let now = new Date("2026-01-01T00:00:00.000Z");
    library = new CandidateAssetLibrary(libraryDirectory, () => now);
    const sourcePath = path.join(sourceDirectory, "ninety-days.txt");
    await writeFile(sourcePath, "Ninety day notes", "utf8");
    const imported = await library.importFromSourcePath(sourcePath, {
      kind: "work_sample",
      sensitivity: "sensitive",
      consentScope: "private_storage_only",
      retention: "90_days",
    });
    if (imported.status !== "imported")
      throw new Error("Expected imported asset");

    expect(imported.asset.lifecycle?.expiresAt).toBe(
      "2026-04-01T00:00:00.000Z",
    );
    now = new Date("2026-03-31T23:59:59.999Z");
    expect((await library.list({ includeDeleted: false })).assets).toHaveLength(
      1,
    );

    now = new Date("2026-04-01T00:00:00.000Z");
    expect((await library.list({ includeDeleted: false })).assets).toEqual([]);
    expect(
      (await library.list({ includeDeleted: true })).assets[0],
    ).toMatchObject({
      deletedAt: "2026-04-01T00:00:00.000Z",
      lifecycle: {
        deletionReason: "expired",
        purgeAt: "2026-04-08T00:00:00.000Z",
      },
    });
  });

  test("purges a manually removed asset at its exact seven-day boundary", async () => {
    let now = new Date("2026-08-10T10:00:00.000Z");
    library = new CandidateAssetLibrary(libraryDirectory, () => now);
    const sourcePath = path.join(sourceDirectory, "manual-delete.txt");
    await writeFile(sourcePath, "Delete after grace", "utf8");
    const imported = await library.importFromSourcePath(sourcePath, {
      kind: "other",
      sensitivity: "sensitive",
      consentScope: "private_storage_only",
      retention: "until_deleted",
    });
    if (imported.status !== "imported")
      throw new Error("Expected imported asset");

    now = new Date("2026-08-11T10:00:00.000Z");
    await library.softDelete(imported.asset.id);
    now = new Date("2026-08-18T09:59:59.999Z");
    expect((await library.list({ includeDeleted: true })).assets).toHaveLength(
      1,
    );

    now = new Date("2026-08-18T10:00:00.000Z");
    expect((await library.list({ includeDeleted: true })).assets).toEqual([]);
    expect(
      (await readdir(libraryDirectory)).some((file) => file.endsWith(".txt")),
    ).toBe(false);
  });

  test("normalizes legacy active and deleted records before enforcing lifecycle", async () => {
    let now = new Date("2026-08-10T10:00:00.000Z");
    library = new CandidateAssetLibrary(libraryDirectory, () => now);
    const activePath = path.join(sourceDirectory, "legacy-active.txt");
    const deletedPath = path.join(sourceDirectory, "legacy-deleted.txt");
    await writeFile(activePath, "Active legacy", "utf8");
    await writeFile(deletedPath, "Deleted legacy", "utf8");
    const active = await library.importFromSourcePath(activePath, {
      kind: "other",
      sensitivity: "sensitive",
      consentScope: "private_storage_only",
      retention: "90_days",
    });
    const deleted = await library.importFromSourcePath(deletedPath, {
      kind: "other",
      sensitivity: "sensitive",
      consentScope: "private_storage_only",
      retention: "until_deleted",
    });
    if (active.status !== "imported" || deleted.status !== "imported") {
      throw new Error("Expected imported assets");
    }
    now = new Date("2026-08-11T10:00:00.000Z");
    await library.softDelete(deleted.asset.id);

    const indexPath = path.join(libraryDirectory, "index.json");
    const rawIndex = JSON.parse(await readFile(indexPath, "utf8")) as {
      version: 1;
      assets: Array<{
        asset: { id: string; lifecycle?: unknown };
        storageName: string;
      }>;
    };
    for (const record of rawIndex.assets) delete record.asset.lifecycle;
    await writeFile(indexPath, JSON.stringify(rawIndex, null, 2), "utf8");

    now = new Date("2026-08-12T10:00:00.000Z");
    const reopened = new CandidateAssetLibrary(libraryDirectory, () => now);
    const assets = (await reopened.list({ includeDeleted: true })).assets;
    expect(assets.find((asset) => asset.id === active.asset.id)).toMatchObject({
      deletedAt: null,
      lifecycle: {
        retentionStartedAt: active.asset.createdAt,
        expiresAt: "2026-11-08T10:00:00.000Z",
        deletionReason: null,
        purgeAt: null,
      },
    });
    expect(assets.find((asset) => asset.id === deleted.asset.id)).toMatchObject(
      {
        deletedAt: "2026-08-11T10:00:00.000Z",
        lifecycle: {
          retentionStartedAt: deleted.asset.createdAt,
          expiresAt: null,
          deletionReason: "removed",
          purgeAt: "2026-08-18T10:00:00.000Z",
        },
      },
    );
  });

  test("keeps purge metadata after a deletion failure and retries successfully", async () => {
    let now = new Date("2026-08-10T10:00:00.000Z");
    let deletionBlocked = true;
    let deletionAttempts = 0;
    library = new CandidateAssetLibrary(
      libraryDirectory,
      () => now,
      async (filePath) => {
        deletionAttempts += 1;
        if (deletionBlocked) throw new Error("file is locked");
        await rm(filePath, { force: true });
      },
    );
    const sourcePath = path.join(sourceDirectory, "locked.txt");
    await writeFile(sourcePath, "Locked purge", "utf8");
    const imported = await library.importFromSourcePath(sourcePath, {
      kind: "other",
      sensitivity: "sensitive",
      consentScope: "private_storage_only",
      retention: "until_deleted",
    });
    if (imported.status !== "imported")
      throw new Error("Expected imported asset");
    now = new Date("2026-08-11T10:00:00.000Z");
    await library.softDelete(imported.asset.id);

    now = new Date("2026-08-18T10:00:00.000Z");
    await expect(library.enforceLifecycle()).rejects.toThrow("file is locked");
    expect(deletionAttempts).toBe(1);
    expect(
      JSON.parse(
        await readFile(path.join(libraryDirectory, "index.json"), "utf8"),
      ),
    ).toMatchObject({
      assets: [{ asset: { id: imported.asset.id } }],
    });

    deletionBlocked = false;
    await library.enforceLifecycle();
    expect(deletionAttempts).toBe(2);
    expect((await library.list({ includeDeleted: true })).assets).toEqual([]);
  });

  test("recovers only stale unindexed library-owned files and preserves recent or indexed files", async () => {
    let now = new Date("2026-08-10T10:00:00.000Z");
    library = new CandidateAssetLibrary(libraryDirectory, () => now);
    const sourcePath = path.join(sourceDirectory, "indexed.txt");
    await writeFile(sourcePath, "Indexed bytes", "utf8");
    const imported = await library.importFromSourcePath(sourcePath, {
      kind: "other",
      sensitivity: "sensitive",
      consentScope: "private_storage_only",
      retention: "until_deleted",
    });
    if (imported.status !== "imported")
      throw new Error("Expected imported asset");

    const staleFinal = "asset_11111111-1111-4111-8111-111111111111.txt";
    const staleImporting =
      "asset_22222222-2222-4222-8222-222222222222.txt.importing";
    const recentFinal = "asset_33333333-3333-4333-8333-333333333333.txt";
    const recentImporting =
      "asset_44444444-4444-4444-8444-444444444444.txt.importing";
    const unrelated = "asset_not-owned.txt";
    for (const fileName of [
      staleFinal,
      staleImporting,
      recentFinal,
      recentImporting,
      unrelated,
    ]) {
      await writeFile(path.join(libraryDirectory, fileName), fileName, "utf8");
    }
    const staleTime = new Date(now.getTime() - 2 * 60 * 60 * 1_000);
    const recentTime = new Date(now.getTime() - 30 * 60 * 1_000);
    await utimes(path.join(libraryDirectory, staleFinal), staleTime, staleTime);
    await utimes(
      path.join(libraryDirectory, staleImporting),
      staleTime,
      staleTime,
    );
    await utimes(
      path.join(libraryDirectory, recentFinal),
      recentTime,
      recentTime,
    );
    await utimes(
      path.join(libraryDirectory, recentImporting),
      recentTime,
      recentTime,
    );

    await library.enforceLifecycle();
    let files = await readdir(libraryDirectory);
    expect(files).not.toContain(staleFinal);
    expect(files).not.toContain(staleImporting);
    expect(files).toContain(recentFinal);
    expect(files).toContain(recentImporting);
    expect(files).toContain(unrelated);
    expect(files.some((file) => file.startsWith(`${imported.asset.id}.`))).toBe(
      true,
    );

    now = new Date("2026-08-10T12:00:00.000Z");
    await library.enforceLifecycle();
    files = await readdir(libraryDirectory);
    expect(files).not.toContain(recentFinal);
    expect(files).not.toContain(recentImporting);
    expect(files).toContain(unrelated);
    expect(files.some((file) => file.startsWith(`${imported.asset.id}.`))).toBe(
      true,
    );
  });
});

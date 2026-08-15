import { useEffect, useState } from "react";
import type { CollectionDensity } from "../components/collection-search-toolbar";

export interface PersistedCollectionView {
  density: CollectionDensity;
  query: string;
  savedViews: readonly SavedCollectionView[];
}

export interface SavedCollectionView {
  density: CollectionDensity;
  id: string;
  name: string;
  query: string;
}

function isCollectionDensity(value: unknown): value is CollectionDensity {
  return value === "compact" || value === "comfortable" || value === "detailed";
}

function readCollectionView(
  storageKey: string,
  defaultDensity: CollectionDensity,
): PersistedCollectionView {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return { density: defaultDensity, query: "", savedViews: [] };
    const parsed = JSON.parse(raw) as {
      density?: unknown;
      query?: unknown;
      savedViews?: unknown;
    };
    const savedViews = Array.isArray(parsed.savedViews)
      ? parsed.savedViews
          .flatMap((value) => {
            if (!value || typeof value !== "object") return [];
            const candidate = value as Record<string, unknown>;
            if (
              typeof candidate.id !== "string" ||
              typeof candidate.name !== "string" ||
              typeof candidate.query !== "string" ||
              !isCollectionDensity(candidate.density)
            ) {
              return [];
            }
            return [
              {
                density: candidate.density,
                id: candidate.id.slice(0, 80),
                name: candidate.name.slice(0, 60),
                query: candidate.query.slice(0, 200),
              },
            ];
          })
          .slice(0, 12)
      : [];
    return {
      density: isCollectionDensity(parsed.density)
        ? parsed.density
        : defaultDensity,
      query: typeof parsed.query === "string" ? parsed.query.slice(0, 200) : "",
      savedViews,
    };
  } catch {
    return { density: defaultDensity, query: "", savedViews: [] };
  }
}

export function usePersistedCollectionView(
  name: string,
  defaultDensity: CollectionDensity = "comfortable",
) {
  const storageKey = `unemployed.job-finder.collection.${name}.v1`;
  const [view, setView] = useState<PersistedCollectionView>(() =>
    readCollectionView(storageKey, defaultDensity),
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(view));
    } catch {
      // The list still works when durable renderer preferences are unavailable.
    }
  }, [storageKey, view]);

  return {
    density: view.density,
    query: view.query,
    savedViews: view.savedViews,
    applySavedView: (id: string) =>
      setView((current) => {
        const saved = current.savedViews.find(
          (candidate) => candidate.id === id,
        );
        return saved
          ? { ...current, density: saved.density, query: saved.query }
          : current;
      }),
    deleteSavedView: (id: string) =>
      setView((current) => ({
        ...current,
        savedViews: current.savedViews.filter(
          (candidate) => candidate.id !== id,
        ),
      })),
    saveCurrentView: (name: string) =>
      setView((current) => {
        const trimmedName = name.trim().slice(0, 60);
        if (!trimmedName) return current;
        const id =
          trimmedName.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-") || "view";
        const savedView: SavedCollectionView = {
          density: current.density,
          id,
          name: trimmedName,
          query: current.query,
        };
        return {
          ...current,
          savedViews: [
            savedView,
            ...current.savedViews.filter((candidate) => candidate.id !== id),
          ].slice(0, 12),
        };
      }),
    setDensity: (density: CollectionDensity) =>
      setView((current) => ({ ...current, density })),
    setQuery: (query: string) =>
      setView((current) => ({ ...current, query: query.slice(0, 200) })),
  };
}

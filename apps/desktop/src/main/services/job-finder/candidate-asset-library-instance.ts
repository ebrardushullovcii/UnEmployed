import { CandidateAssetLibrary } from "./candidate-asset-library";
import { getCandidateAssetsDirectory } from "./paths";

let defaultLibrary: CandidateAssetLibrary | null = null;

export function getCandidateAssetLibrary() {
  defaultLibrary ??= new CandidateAssetLibrary(getCandidateAssetsDirectory());
  return defaultLibrary;
}

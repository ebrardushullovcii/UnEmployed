import { ApplicationDocumentLibrary } from "./application-document-library";
import { getCandidateAssetLibrary } from "./candidate-asset-library-instance";
import { getApplicationDocumentsDirectory } from "./paths";

let defaultLibrary: ApplicationDocumentLibrary | null = null;

export function getApplicationDocumentLibrary() {
  defaultLibrary ??= new ApplicationDocumentLibrary(
    getApplicationDocumentsDirectory(),
    getCandidateAssetLibrary(),
  );
  return defaultLibrary;
}

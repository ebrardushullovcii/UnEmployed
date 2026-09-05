import { PageHeader } from "../../components/page-header";
import { SettingsCandidateAssets } from "./settings-candidate-assets";

export function DocumentsScreen() {
  return (
    <section className="grid min-w-0 gap-3 pb-8">
      <PageHeader
        description="Import and manage the documents you reuse across applications. Files are copied into private app-owned storage on this device, and removal always goes through Trash first."
        title="Documents"
      />
      <SettingsCandidateAssets />
    </section>
  );
}

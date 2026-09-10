import { PageHeader } from "../../components/page-header";
import { SettingsCandidateAssets } from "./settings-candidate-assets";

export function DocumentsScreen() {
  return (
    <section className="grid min-w-0 gap-3 pb-8">
      <PageHeader
        description="The extra files you attach to applications, like a portfolio or transcript. Your imported resume is managed in Profile. Files are copied into Job Finder's own folder on this device, and removal goes through Trash first."
        title="Documents"
      />
      <SettingsCandidateAssets />
    </section>
  );
}

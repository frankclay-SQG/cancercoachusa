import { defineCliConfig } from "sanity/cli";

export default defineCliConfig({
  api: { projectId: "s3bcwpk0", dataset: "production" },
  studioHost: "cancercoachusa",
  deployment: { appId: "c2fjxj832pugc7ex9n69pqdx", autoUpdates: true },
});

import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { schemaTypes } from "./schemaTypes";

// Hosted at https://cancercoachusa.sanity.studio/ (the website footer's "Admin" link).
// Sign-in is limited to Google. Access is still controlled by project membership:
// only people added in the Sanity project's member settings can see or edit content.
export default defineConfig({
  name: "default",
  title: "Cancer Coach USA",
  projectId: "s3bcwpk0",
  dataset: "production",
  plugins: [structureTool()],
  schema: { types: schemaTypes },
  auth: {
    redirectOnSingle: false,
    providers: [
      {
        name: "google",
        title: "Google",
        url: "https://api.sanity.io/v1/auth/login/google",
      },
    ],
  },
});

# Sanity Setup

Add the schema types in `sanity/schemaTypes` to your Sanity Studio project.

The website is oriented around cancer survivorship after active treatment and
expects these document types:

- `post`: blog articles with Portable Text rich text, uploaded images, and downloadable files.
- `author`: optional author records for blog posts.
- `scheduleSlot`: Sanity-managed calendar openings with optional booking URLs.

Required Vercel environment variables:

- `SANITY_PROJECT_ID`
- `SANITY_DATASET`

Optional Vercel environment variables:

- `SANITY_READ_TOKEN` or `SANITY_API_READ_TOKEN` if the dataset is private or if draft/preview access is needed.
- `ATTIO_API_KEY` for contact form submission (Attio access token with
  read-write access to records, list entries, notes, and tasks).
- `ATTIO_INTAKE_LIST` (optional) to override the intake list slug; defaults to
  `intake_pipeline`.

Email alert for each intake (sent through a Google Workspace account):

- `ALERT_GMAIL_USER`: the Google Workspace address that sends the alert.
- `ALERT_GMAIL_APP_PASSWORD`: a Google app password for that account (needs
  2-Step Verification turned on).
- `ALERT_EMAIL_TO` (optional): where alerts go; defaults to `ALERT_GMAIL_USER`.

Attio and the email alert run independently: if one fails, the other still
captures the inquiry. The visitor only sees an error if both fail.

Each intake submission creates or updates an Attio Person (matched by email),
attaches a note with every form answer, the consent text, source page, and
timestamp, adds the person to the Intake Pipeline list, and creates a
follow-up task due the next day.

## Blog Studio

Blog posts and schedule slots are edited in the hosted Sanity Studio at
https://cancercoachusa.sanity.studio/. Each editor signs in with their own
Google account; there is no shared password. Add or remove editors in the
Sanity project's member settings. The site footer's "Admin" link opens it.

To schedule a post, set "Published at" to a future date and time. The public
blog API only returns posts where `publishedAt <= now()`, so scheduled posts
stay hidden until that time.

The hosted Studio's schema is managed separately from the files in
`sanity/schemaTypes`; keep the two in sync when fields change.

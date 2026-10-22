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
- `SANITY_WRITE_TOKEN` or `SANITY_API_WRITE_TOKEN` for the controlled blog admin interface.
- `BLOG_ADMIN_MASTER_KEY` for the controlled blog admin interface at `/blog-admin.html`.
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

## Controlled Blog Admin

The site includes a private admin page at `/blog-admin.html`. It is intentionally
not linked in the public navigation.

Required env vars:

- `BLOG_ADMIN_MASTER_KEY`: shared secret required by the admin form.
- `SANITY_WRITE_TOKEN`: Sanity token with permission to create/update `post` documents.

The admin page creates text-based Portable Text posts from paragraph input. Use
the media upload fields for featured images, inline images, and downloadable
files. Uploaded inline media is appended after the text body. Use Sanity Studio
for detailed media placement, advanced rich text formatting, and editorial
review workflows.

The admin page supports:

- Loading existing posts.
- Creating posts.
- Editing posts.
- Deleting posts.
- Saving as draft.
- Publishing immediately.
- Scheduling posts with date and time selection.
- Uploading featured images.
- Uploading inline images and downloadable files.

Scheduled posts are stored as normal Sanity `post` documents with a future
`publishedAt` timestamp. The public blog API only returns posts where
`publishedAt <= now()`, so scheduled posts remain hidden until the publish time.

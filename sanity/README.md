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
- `HUBSPOT_PRIVATE_APP_TOKEN` for contact form submission.

Optional HubSpot custom property mapping:

- `HUBSPOT_CONTACT_ROLE_PROPERTY`
- `HUBSPOT_CONTACT_PILLAR_PROPERTY`
- `HUBSPOT_CONTACT_CHANNEL_PROPERTY`
- `HUBSPOT_CONTACT_MESSAGE_PROPERTY`
- `HUBSPOT_EMAIL_OPT_IN_PROPERTY`
- `HUBSPOT_SMS_OPT_IN_PROPERTY`
- `HUBSPOT_CONSENT_SOURCE_PROPERTY`
- `HUBSPOT_CONSENT_TIMESTAMP_PROPERTY`
- `HUBSPOT_SOURCE_PAGE_PROPERTY`
- `HUBSPOT_CONSENT_TEXT_PROPERTY`

If the optional HubSpot custom property names are not set, the API route will
still create or update the contact using standard HubSpot properties: `email`,
`firstname`, `lastname`, `phone`, and `mobilephone`. Every successful intake
also creates a HubSpot note associated with the contact so the full form details,
consent choices, source page, and message are preserved for follow-up.

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

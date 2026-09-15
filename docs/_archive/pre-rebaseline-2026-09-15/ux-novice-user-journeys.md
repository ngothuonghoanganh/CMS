# Novice user journeys

This guide describes the shortest supported path for a first-time website editor. It uses
the same labels and entry points as the CMS UI.

## Persona

Mai is a non-technical marketer. She understands pages, images, menus, and publishing,
but does not know what a slug, schema, token, node, runtime, or collection query is.

## Create and publish a website

1. Open **Home** and choose **Create a website**.
2. Enter a **Website name**. The URL preview updates automatically; no slug is required.
3. Choose **Create site**. The website is created with a homepage already available.
4. From the website workspace choose **Pages**, then choose a page and **Edit page**.
5. In the builder, add a **Quick section** such as **Hero** or **CTA**.
6. Keep **Content** selected, select the content on the canvas, and edit it in the
   properties panel. Use **Appearance** only when visual changes are needed.
7. Choose **Save**, then **Preview**, and finally **Publish** after the readiness check
   reports that the page is ready.

Advanced URL, dynamic-page, extension, and implementation controls remain available under
**Advanced** for experienced users.

## Add reusable content

1. Open **Content** from the main navigation and create a content type with a readable
   name, such as **Blog posts**.
2. Add only the fields each item needs. Field keys, schema rules, and JSON editing are
   secondary controls inside the field editor.
3. Create an entry and save it as a draft.
4. Use the page builder's content source controls to show the content on a page.

## Shared navigation and brand settings

- Edit a page's **Header, menu & footer** section for shared page areas.
- Open **Brand & styles** from the Websites sidebar or a website workspace for colors,
  typography, buttons, and other visual defaults.
- Legacy `/navigation` bookmarks remain supported through redirects; Navigation is not a
  normal top-level workspace destination.

## Publishing states

The visible state should answer one question: “What is live?” Use **Saved** for a stored
draft, **Preview** to inspect the draft, and **Publish** to make it public. If publishing
is blocked, the readiness dialog lists the actionable issue and keeps the publish action
disabled until it is resolved.

## Responsive checks

The journeys are checked at 1440×900, 1280×800, and 1024×768. At smaller widths the
builder panels become overlays so the canvas remains the primary workspace. Browser Back
returns to the previous website/page context instead of losing the current workspace.

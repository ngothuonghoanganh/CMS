/**
 * Production page-surface styling shared by the public renderer and the
 * GrapesJS iframe. This deliberately contains only PagePayload runtime
 * semantics; editor selection, drag, and other CMS chrome stay in the CMS.
 */
export const PAGE_RUNTIME_CLASS_NAMES = {
  form: 'payload-form',
  formError: 'payload-form-error',
  formField: 'payload-form-field',
  formOptions: 'payload-form-options',
  formSuccess: 'payload-form-success',
} as const;

export const PAGE_RUNTIME_BASELINE_CSS = `
  :root {
    color-scheme: light;
    font-family: Arial, Helvetica, sans-serif;
    background: #f5f7fb;
    color: #182032;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  html, body {
    min-height: 100%;
  }

  body {
    margin: 0;
    background: #fff;
  }

  a {
    color: inherit;
  }

  .payload-page,
  main[data-payload-node-type='root'] {
    min-height: 100vh;
  }

  section[data-payload-node-type='section'],
  div[data-payload-node-type='container'] {
    width: 100%;
  }

  p[data-payload-node-type='text'] {
    margin: 0;
    white-space: pre-wrap;
  }

  img[data-payload-node-type='image'] {
    display: block;
    max-width: 100%;
    height: auto;
  }

  a[data-payload-node-type='button'] {
    display: inline-block;
    cursor: pointer;
    text-decoration: none;
  }

  [data-extension-runtime='countdown.runtime'] {
    display: contents;
  }

  .payload-form {
    display: grid;
    gap: 1rem;
    max-width: 34rem;
    padding: 1.5rem;
  }

  .payload-form-field {
    display: grid;
    gap: 0.4rem;
  }

  [data-payload-form-preview='field'] {
    display: grid;
    gap: 0.4rem;
  }

  .payload-form-field > label {
    font-weight: 700;
  }

  [data-payload-form-preview='field'] > label {
    font-weight: 700;
  }

  .payload-form input:not([type='radio']):not([type='checkbox']),
  .payload-form textarea,
  .payload-form select {
    width: 100%;
    border: 1px solid #cbd5e1;
    border-radius: 0.5rem;
    padding: 0.7rem 0.8rem;
    font: inherit;
  }

  [data-payload-form-preview='control']:not([type='radio']):not([type='checkbox']):not([role='radiogroup']) {
    width: 100%;
    border: 1px solid #cbd5e1;
    border-radius: 0.5rem;
    padding: 0.7rem 0.8rem;
    font: inherit;
  }

  .payload-form textarea {
    min-height: 8rem;
    resize: vertical;
  }

  textarea[data-payload-form-preview='control'] {
    min-height: 8rem;
    resize: vertical;
  }

  .payload-form-options {
    display: grid;
    gap: 0.5rem;
  }

  [data-payload-form-preview='control'][role='radiogroup'] {
    display: grid;
    gap: 0.5rem;
  }

  .payload-form-options label,
  [data-payload-form-preview='option'] {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 400;
    min-height: 20px;
  }

  .payload-form-field > input[type='checkbox'] {
    width: fit-content;
  }

  [data-payload-form-preview='field'] > input[type='checkbox'] {
    width: fit-content;
  }

  .payload-form > button {
    width: fit-content;
    border: 0;
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
    color: #fff;
    background: #243b8f;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
  }

  [data-payload-form-preview='submit'] {
    width: fit-content;
    border: 0;
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
    color: #fff;
    background: #243b8f;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
  }

  .payload-form > button:disabled {
    cursor: wait;
    opacity: 0.65;
  }

  .payload-form-error {
    margin: 0;
    color: #a1263c;
  }

  .payload-form-success {
    max-width: 34rem;
    padding: 1.5rem;
    color: #17603a;
    background: #ecfdf3;
  }
`;

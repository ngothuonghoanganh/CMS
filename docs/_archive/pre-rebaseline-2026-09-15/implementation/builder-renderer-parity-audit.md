# Builder ↔ Review ↔ Published Visual Parity Audit

## Result

The page visual contract is centralized around `PagePayload` and a shared
production runtime baseline. Payload round trips are necessary but not enough:
the regression suite also checks layout, computed styles, and screenshots.

| Finding                                   | Severity | Root cause                                                    | Resolution                                                     | Regression coverage                |
| ----------------------------------------- | -------- | ------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------- |
| Canvas shifted all content                | High     | Builder `body` had `24px` padding and a different root height | Use shared page baseline in the iframe                         | Three-surface geometry/screenshots |
| Font/reset drift                          | High     | Builder specified Inter while renderer inherited Arial        | Shared body, root, text, image, and box-sizing rules           | Computed styles at every viewport  |
| Form visual/interaction drift             | High     | Builder used independently styled fake form markup            | Shared runtime form classes and production-like preview fields | Form fixture and payload gates     |
| Mobile missed tablet inheritance          | High     | Builder applied only the active raw breakpoint map            | Resolve `base -> tablet -> mobile`; persist deltas             | Adapter test and responsive E2E    |
| Preview banner displaced content          | High     | Sticky banner participated in layout                          | Fixed overlay banner                                           | Root geometry/screenshots          |
| Review form was disabled                  | High     | Preview context omitted canonical submission identifiers      | Bridge forwards page/site/tenant context                       | Review form comparison             |
| Renderer style map drift                  | Medium   | React received kebab-case inline style names                  | Shared kebab-to-camel registry conversion                      | Renderer unit test                 |
| Quoted font stacks rejected               | Medium   | Sanitizer rejected valid quoted schema values                 | Permit quotes while blocking executable CSS syntax             | Renderer font test                 |
| Opacity could receive `px`                | Medium   | Inspector treated it as a length                              | Bounded numeric control from `0` to `1`                        | Contracts metadata test            |
| Extension/countdown placeholders differed | Medium   | Builder placeholder markup was unrelated to runtime fallback  | Align deterministic fallback markup                            | Fixture includes both fallbacks    |

## Fixture coverage

The Playwright fixture includes root, section, grid/container, text, image,
button, complete form field set, countdown, custom extension fallback, and a
hidden text node. It exercises registry properties, typography, breakpoints,
absolute positioning, grid variants, quoted font families, and deterministic
image loading. Coverage expectations derive from
`PAGE_STYLE_PROPERTY_DEFINITIONS`.

## Verified invariants

- Builder document, latest draft version, review payload, and public payload
  structurally equal the fixture.
- All page surfaces expose the same payload node IDs and types.
- Rectangles compare within one CSS pixel and registry-derived style values match
  at desktop, tablet, and mobile.
- Isolated page-root screenshots compare all three surface pairs under an
  eight-pixel residual threshold; mismatch artifacts include screenshots,
  trace, and video.

## Intentional differences

Editor selection/drag visuals, CMS chrome, auth/loading/error states, and the
preview banner are not PagePayload output and must not appear publicly. Enabled
live extensions (including ticking countdowns) require a frozen clock/data
provider before they belong in strict screenshot parity; their static fallback
is covered here.

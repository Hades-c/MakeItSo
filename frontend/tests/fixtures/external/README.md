# External fixtures

Recorded upstream responses served by `fetchExternal` when `EXTERNAL_MODE=fixtures` (vitest, Playwright and CI
set it). Tests, the e2e server and the build never touch the network. See `server/http/fixtures.ts` for the
manifest format and matching rules.

| Directory           | Upstream                                                                                  | Content                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `course-schedule/`  | `api.davidson.edu` public course API                                                      | Full Fall 2026 (202601) and Spring 2027 (202602); ~130-section subsets of 202501/202502; 40-section subsets of 202201–202402; terms; filters; `[]` for summers |
| `catalog/`          | `catalog.davidson.edu/widget-api/catalog/4`                                               | Program list (paged and `page-size=100`) and programs 172, 174, 188                                                                     |
| `ratemyprofessors/` | `www.ratemyprofessors.com/graphql`                                                        | **Synthetic** Davidson roster; `cases.json` says what each row tests                                                                   |
| `wildcatsync/`      | `wildcatsync.davidson.edu`                                                                | `events.ics`, `news.rss`                                                                                                                |
| `hurt-hub/`         | `hurthub.davidson.edu`                                                                    | `events.ics` (`?ical=1`), Tribe REST `tribe-events.json`                                                                               |
| `library/`          | `davidson.libcal.com`                                                                     | Hours today (JSON), events (ICS)                                                                                                        |
| `davidsonian/`      | `thedavidsonian.news/feed/`                                                               | RSS                                                                                                                                     |
| `events-digest/`    | `us6.campaign-archive.com` (Mailchimp)                                                    | RSS                                                                                                                                     |
| `davidson-news/`    | `www.davidson.edu/rss.xml`                                                                | RSS (includes the two stale sticky items)                                                                                               |

## Rules

- Real samples were fetched on 2026-09-30 and trimmed (feeds to at most 15 items). Keep files byte-exact:
  `.gitattributes` turns off line-ending conversion and Prettier ignores this directory.
- No personal data: e-mail addresses, phone numbers and event-contact names are replaced (`contact@example.edu`,
  `555-555-0100`, "Event Contact"); RSS bylines read "Staff". No alumni data and no RateMyProfessors review text.
- The RateMyProfessors roster is synthetic: real name forms (so matching can be tested against the course data),
  invented ids and numbers.
- A request no manifest route matches throws `MissingFixtureError`. Add a route (and file) here; never catch it.
- Total size stays under 6 MB (`tests/server/http/fixtures.test.ts` checks it).

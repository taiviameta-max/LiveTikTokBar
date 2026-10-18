# Bar Live

Bar Live is a 9:16 Three.js scene for TikTok LIVE. It can receive join, comment,
and gift events through the community-maintained `tiktok-live-connector`
package. This connector is unofficial and may stop working if TikTok changes
its service.

## Run the app and TikTok LIVE bridge

1. Install Node.js 22 or newer. The current connector's HTTP dependency requires
   Node.js 22 even though the connector itself supports Node.js 20.
2. Copy `.env.example` to `.env.local`.
3. Set `BAR_TIKTOK_USERNAME` to the account's TikTok username (without `@`).
   The account must be live when the bridge connects. No TikTok password,
   session cookie, or login token is needed.
4. Optionally set the `BAR_GIFT_*` variables to the exact gift names shown in
   TikTok LIVE. Gift-name matching ignores letter case. Leave a mapping blank
   to show that gift in the overlay without triggering an effect.
5. Run `npm run dev` and open the local URL printed by Vite in Chrome.
6. Capture the Chrome window in OBS, then send the OBS Virtual Camera to
   TikTok LIVE Studio.

Open `/admin` on the same local app to choose the TikTok LIVE username, change
spotlight/laser visibility, light sweep speed, like-to-zoom behavior, and
gift-name/comment mappings. Selecting another LIVE username switches the
shared bridge account; the selected username is remembered in that browser.
Save changes to store them in this browser and apply them to connected LIVE scenes. Gift
mappings and comment/like settings are also sent to the local bridge; connected
LIVE scenes receive them even when they are in another browser profile. If the
bridge is unavailable, it will receive the saved mappings when Admin reconnects.
The admin gift picker includes a small
set of suggestions and remembers named gifts received by the bridge while the
admin page is open. Observed gift names are stored in that browser's local
storage. The LIVE scene automatically shows comment hints from the current
comment mappings. Semicolon-separated aliases are grouped on one line per
effect. Admin can also add, edit, and remove up to eight custom hints. The
collapsed **Test tính năng** menu
on `/admin` can preview effects
in an open scene tab in the same browser without sending real gifts or TikTok
events. The **Màn hình sân khấu** settings change the LED title/subtitle and DJ
and MC labels, and allow a background image to be uploaded for the LED screen.
Images are center-cropped to fit, compressed in the browser, and saved with
settings in local storage.

The bridge shows its connection status in the lower-left of the scene. If the
account is offline when the app starts, it retries periodically. Comments are
shown in the feed; each effect can be assigned comment keywords from its card
in `/admin`, with multiple words or phrases separated by semicolons. Matching
ignores case and punctuation and works when the keyword appears within a
comment. By default,
`hey hey` changes the commenter's character. If no configured keyword matches,
`hey` or a comment containing `nhảy` makes that viewer's character dance.
The bridge starts with the default `hey hey` comment mapping and Rose gift
mapping, so these work before the Admin page has reconnected after a restart.
Saving custom mappings in Admin sends them to the bridge; reopening Admin sends
the browser's saved mappings again after a bridge restart. Recognized mapped
gifts trigger their configured effect.
Likes zoom the camera in on the viewer who sent them. TikTok may batch like
events or omit them for busy streams. Viewer avatars are shown as circles beside
character names. Avatar images are fetched through a proxy restricted to TikTok
image CDN hosts; if an event has no usable avatar or the image cannot be
fetched, the label shows the viewer's initial instead. The
bridge does not request the extended room gift catalog because that connector
feature requires Eulerstream's paid signing service. If TikTok omits a gift name
from an event, the overlay shows its gift ID instead and name-based gift
mappings cannot match that event. The admin suggestions are not an official or
complete TikTok catalog; obtaining the extended room gift catalog requires
Eulerstream's paid signing service, which this app does not use.

## Deploy the app with TikTok LIVE

The Vercel frontend and TikTok bridge run as separate services. Vercel serves
the built scene, while the Render web service runs the Node.js bridge and
maintains the TikTok connection. The Render service also serves a copy of the
build so the same bridge can be tested independently.

1. Push this repository to GitHub and import it into Vercel. Use the project
   root, the Vite framework preset, `npm run build` as the build command, and
   `dist` as the output directory. The included `vercel.json` keeps `/admin`
   working on direct navigation.
2. Deploy the included `render.yaml` as a Render Blueprint from the same GitHub
   repository. Set `BAR_TIKTOK_USERNAME` to the account username and
   `BAR_ALLOWED_ORIGINS` to the exact Vercel origin, for example
   `https://your-project.vercel.app`. Add custom frontend origins as
   comma-separated full origins. Do not include paths or trailing slashes.
   If the default TikTok signature service rate-limits connections, set
   `BAR_TIKTOK_SIGN_API_KEY` to an Euler Stream API key in Render's environment.
3. In Vercel, set `VITE_LIVE_BRIDGE_URL` to the Render service URL, for example
   `https://bar-live-bridge.onrender.com`, then redeploy the frontend.

The bridge starts when Render starts the service. Render's free web services
can spin down when idle; opening the LIVE scene establishes a WebSocket
connection and wakes the service if needed. Configure Render's environment
variables in its dashboard. The `/admin` page has no login; anyone who can
access it can change the shared LIVE account and bridge settings. Do not commit
`.env.local` or signing API keys.

## Gift mappings

Map each effect to an exact gift name in `.env.local`. Separate translated
names for the same gift with semicolons:

```dotenv
BAR_GIFT_ZOOM=Rose;Hoa hồng
BAR_GIFT_FLY_ZOOM=TikTok
BAR_GIFT_SANTO=
BAR_GIFT_BREAKDANCE=
BAR_GIFT_DI_VONG=
BAR_GIFT_PHAO_HOA=
BAR_GIFT_DOI_NHAN_VAT=
```

The gift labels above are examples only; choose names that are actually
available in the LIVE gift panel. By default, `Rose` / `Hoa hồng` zooms in on
the sender and `TikTok` makes the sender fly up while the camera zooms in.
Configure the exact gift names in `/admin` or `.env.local`. Restart
`npm run dev` after changing `.env.local`; all other gift effects remain
unmapped by default.

## Connector license and limitations

`tiktok-live-connector` is an unofficial, AGPL-3.0-only community project. Review
its license before distributing this app or making it available as a network
service. The connector reads TikTok's internal LIVE event service, not an
official public TikTok LIVE API, and its compatibility and availability are
not guaranteed.

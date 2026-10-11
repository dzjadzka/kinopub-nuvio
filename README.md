# KinoPub for Nuvio

Native Nuvio JS provider, version 0.2.0, for movies and TV episodes.

This repository contains only the public plugin manifest and provider. It hosts no media, credentials, user configuration or backend service.

## Installation

1. Open https://nuvio.tv/account?tab=plugins and sign in to your Nuvio account.
2. Add this URL under **Plugins**, not **Addons**:
   ```text
   https://raw.githubusercontent.com/dzjadzka/kinopub-nuvio/main/manifest.json
   ```
3. Enable **KinoPub** and use the same account on your plugin-capable NuvioTVSmart installation.
4. Check that the repository/provider appears on the TV after account sync. Publication and manifest validation do not by themselves prove account sync or TV playback.

## Configuration status

Installation alone does not authorize media access. Without private runtime settings the provider returns an empty stream list and makes no network request.

The existing implementation uses a user's already authorized KinoPub Stremio addon as its upstream source; it is not an independent KinoPub OAuth client. Playback requires private `SCRAPER_SETTINGS.stremioManifestUrl` and a working Nuvio-provided `TMDB_API_KEY`. Neither belongs in this repository or an installation URL. Personal authorization/setup is outside this publication stage.

## Behavior

- Calls Nuvio's native `getStreams(tmdbId, mediaType, season, episode)` interface.
- Resolves numeric TMDB IDs through TMDB external IDs, never title guessing.
- Preserves exact season and episode numbers.
- Deduplicates shared adaptive HLS URLs instead of presenting fictitious fixed-quality choices.
- Leaves HLS rendition/audio/subtitle handling to Nuvio.
- Rejects unsupported non-direct streams or required custom playback headers.

The existing provider passed four live QuickJS/native-projection integrations in development. Those checks do not establish playback or audio switching on a specific TV. No HDR, Dolby Vision or Atmos capability is inferred.

Use only with media/services you are authorized to access. This plugin is not affiliated with KinoPub or Nuvio.

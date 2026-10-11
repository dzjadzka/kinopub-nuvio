/* KinoPub native Nuvio webOS JS adapter.
   S3 uses a privately configured, authorized Stremio addon; no upstream OAuth.
   S1 synthetic mapping and legacy unconfigured scaffold are retained.
   No browser URL / URLSearchParams dependencies are used.
   No secrets must be hardcoded in this file, manifest, or repo URL. */
'use strict';

function httpsUrl(input) {
  if (typeof input !== 'string') return null;
  var s = input.trim();
  // This is basic scheme validation, NOT DNS / SSRF or host allowlisting.
  if (!/^https:\/\/[^\s/?#@:]+(?::443)?(?:[/?#]|$)/i.test(s)) return null;
  if (/\s/.test(s)) return null;
  if (!/\.(m3u8|mp4|mkv)$/i.test(s.split(/[?#]/)[0])) return null;
  return s;
}
function clean(x, max) {
  if (typeof x !== 'string') return '';
  return x.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 120);
}
function mapBridgeStream(s) {
  if (!s || typeof s !== 'object') return null;
  var url = httpsUrl(s.url);
  if (!url) return null;
  var quality = clean(s.quality, 20);
  var source = clean(s.provider, 40) || 'KinoPub';
  var codec = clean(s.codec, 32);
  var voiceovers = Array.isArray(s.audioLabels) ? s.audioLabels.map(function(x) { return clean(x, 55); }).filter(Boolean).slice(0, 3) : [];
  // Source-contracted Nuvio native projection ignores result.description.
  // Place all essential user-visible metadata in name/title instead.
  var label = [source, quality, codec, voiceovers.length ? voiceovers.join(' / ') : ''].filter(Boolean).join(' • ');
  var subtitles = Array.isArray(s.subtitles) ? s.subtitles.slice(0, 30).map(function(t) {
    var su = t && httpsUrl(t.url);
    // Language is the recognized key; subtitle URL must use supported extension (we expand it below).
    return su ? {url: su, lang: clean(t.lang, 8) || 'und'} : null;
  }).filter(Boolean) : [];
  return {name: label, title: label, quality: quality || undefined, url: url, subtitles: subtitles};
}
function acceptedMediaUrl(input) {
  if (typeof input !== 'string') return null;
  var s=input.trim();
  if (!/^https:\/\/[^\s/?#@:]+(?::443)?(?:[/?#]|$)/i.test(s) || /\s/.test(s)) return null;
  return s;
}
function mapSubtitle(t) {
  var su = t && acceptedMediaUrl(t.url);
  return su ? {url: su, lang: clean(t.language, 8) || clean(t.lang, 8) || 'und'} : null;
}
function mapBridgeStreamSafe(s) {
  var result=mapBridgeStream(s);
  if (!result) return null;
  result.subtitles = Array.isArray(s.subtitles) ? s.subtitles.slice(0,30).map(mapSubtitle).filter(Boolean) : [];
  return result;
}
// S1 is a pure documented-response adapter. This binding is supplied, not a
// claimed TMDB lookup endpoint; only explicit synthetic snapshots may use it.
function positiveId(value) {
  var s = String(value == null ? '' : value);
  return /^[1-9]\d{0,11}$/.test(s) ? s : null;
}
function imdbNumber(value) {
  var s = String(value == null ? '' : value);
  return /^\d{1,10}$/.test(s) && /[1-9]/.test(s) ? s.replace(/^0+/, '') : null;
}
function kinoPubItem(request, snapshot) {
  if (!snapshot || snapshot.fixtureOrigin !== 'synthetic-not-live') return null;
  var b = snapshot.binding || {}, response = snapshot.itemResponse || {};
  var item = response.item;
  if (!item || response.status !== 200 || !positiveId(request.tmdbId)) return null;
  if (String(b.tmdbId) !== String(request.tmdbId) || b.mediaType !== request.mediaType) return null;
  if (typeof b.imdbId !== 'string' || !/^tt\d{7,10}$/.test(b.imdbId)) return null;
  var external = snapshot.tmdbExternalIds;
  if (!external || positiveId(external.id) !== String(request.tmdbId) || external.imdb_id !== b.imdbId) return null;
  var imdb = imdbNumber(b.imdbId.slice(2));
  var type = request.mediaType === 'movie' ? 'movie' : request.mediaType === 'tv' ? 'serial' : '';
  if (!type || item.type !== type || !positiveId(b.kinoPubId)) return null;
  if (positiveId(item.id) !== String(b.kinoPubId) || !imdb || imdbNumber(item.imdb) !== imdb) return null;
  if (snapshot.searchResponse) {
    var search = snapshot.searchResponse;
    if (search.status !== 200 || !Array.isArray(search.items)) return null;
    var matches = search.items.filter(function(candidate) {
      return candidate && candidate.type === type && imdbNumber(candidate.imdb) === imdb;
    });
    if (matches.length !== 1 || positiveId(matches[0].id) !== String(b.kinoPubId)) return null;
  }
  return item;
}
function kinoPubAudioLabels(audios) {
  return (Array.isArray(audios) ? audios.slice(0, 30) : []).map(function(a) {
    if (!a || typeof a !== 'object') return '';
    // index/id/array position are deliberately not used as player-track IDs.
    return [clean(a.lang, 12), clean(a.type && a.type.title, 55),
      clean(a.author && a.author.title, 55), clean(a.codec, 20)].filter(Boolean).join(' ');
  }).filter(Boolean);
}
function kinoPubMediaStreams(media) {
  var audios = kinoPubAudioLabels(media.audios);
  var subtitles = Array.isArray(media.subtitles) ? media.subtitles.slice(0, 30).map(mapSubtitle).filter(Boolean) : [];
  return (Array.isArray(media.files) ? media.files.slice(0, 25) : []).map(function(file) {
    if (!file || typeof file !== 'object') return null;
    var url = '';
    [file.url, file.urls].some(function(urls) {
      if (typeof urls === 'string') url = acceptedMediaUrl(urls);
      else if (urls && typeof urls === 'object') {
        ['hls', 'http', 'hls2', 'hls4'].some(function(protocol) {
          url = acceptedMediaUrl(urls[protocol]); return Boolean(url);
        });
      }
      return Boolean(url);
    });
    if (!url) return null;
    var w = file.w, h = file.h;
    var dimensions = Number.isInteger(w) && w > 0 && Number.isInteger(h) && h > 0 ? w + 'x' + h : '';
    var quality = dimensions ? h + 'p' : clean(file.quality, 20);
    var label = ['KinoPub', dimensions || quality, clean(file.codec, 32),
      audios.length ? 'Available audio: ' + audios.join(' / ') : ''].filter(Boolean).join(' • ');
    return {name: label, title: label, quality: quality || undefined, url: url, subtitles: subtitles};
  }).filter(Boolean).reduce(function(results, stream) {
    var previous = results.filter(function(row) { return row.url === stream.url; })[0];
    if (!previous) results.push(stream);
    else if (previous.name !== stream.name || previous.quality !== stream.quality) {
      // Shared playlist metadata conflicts: do not imply a fixed rendition.
      previous.name = previous.title = ['KinoPub', audios.length ? 'Available audio: ' + audios.join(' / ') : ''].filter(Boolean).join(' • ');
      previous.quality = undefined;
    }
    return results;
  }, []);
}
function mapKinoPub(request, snapshot) {
  var item = kinoPubItem(request, snapshot), media;
  if (!item) return [];
  if (request.mediaType === 'movie') {
    if (!Array.isArray(item.videos)) return [];
    var videos = item.videos;
    if (Object.prototype.hasOwnProperty.call(snapshot.binding, 'mediaId')) {
      var mediaId = positiveId(snapshot.binding.mediaId);
      if (!mediaId) return [];
      videos = videos.filter(function(v) { return v && positiveId(v.id) === mediaId; });
    }
    if (videos.length !== 1) return [];
    media = videos[0];
  } else {
    if (!/^(?:0|[1-9]\d*)$/.test(String(request.season)) || !/^[1-9]\d*$/.test(String(request.episode))) return [];
    var seasons = (Array.isArray(item.seasons) ? item.seasons : []).filter(function(s) {
      return s && String(s.number) === String(request.season);
    });
    if (seasons.length !== 1) return [];
    var episodes = (Array.isArray(seasons[0].episodes) ? seasons[0].episodes : []).filter(function(e) {
      return e && String(e.number) === String(request.episode) &&
        (e.snumber == null || String(e.snumber) === String(request.season));
    });
    if (episodes.length !== 1) return [];
    media = episodes[0];
  }
  if (!media || !positiveId(media.id)) return [];
  if (snapshot.mediaLinks) {
    var links = snapshot.mediaLinks;
    if (positiveId(links.id) !== positiveId(media.id) || (links.status != null && links.status !== 200)) return [];
    // Hydration response may omit status; audios remain selected-episode metadata.
    media = {audios: media.audios,
      files: links.files === undefined ? media.files : links.files,
      subtitles: links.subtitles === undefined ? media.subtitles : links.subtitles};
  }
  return kinoPubMediaStreams(media);
}
// S3: use a user's authorized Stremio addon as a temporary direct-stream source.
// S4 resolves TMDB external IDs with Nuvio's host-injected TMDB_API_KEY.
function mapStremioStream(s) {
  if (!s || typeof s !== 'object' || s.infoHash || s.externalUrl || s.ytId) return null;
  // Required playback headers are not supported by this bounded S3 adapter.
  if (s.headers || (s.behaviorHints && s.behaviorHints.proxyHeaders)) return null;
  var url=acceptedMediaUrl(s.url);
  if (!url) return null;
  var title=clean(s.title,120), name=clean(s.name,80);
  if (/https?:\/\//i.test(title+name)) return null;
  var quality=/^\d{3,4}p$/.test(title) ? title : undefined;
  var label=['KinoPub',name,title].filter(Boolean).join(' • ');
  return {name:label,title:label,quality:quality,url:url,
    subtitles:Array.isArray(s.subtitles)?s.subtitles.slice(0,30).filter(function(t){return t && !t.headers;}).map(mapSubtitle).filter(Boolean):[]};
}
async function stremioStreams(cfg, tmdbId, mediaType, season, episode) {
  var manifest=cfg.stremioManifestUrl;
  if (typeof manifest!=='string' || !/^https:\/\/[^\s/?#@:]+(?::443)?\/[^\s?#]*\/manifest\.json$/.test(manifest)) return [];
  if (!positiveId(tmdbId) || (mediaType!=='movie' && mediaType!=='tv')) return [];
  if (mediaType==='tv' && (!/^(?:0|[1-9]\d*)$/.test(String(season)) || !/^[1-9]\d*$/.test(String(episode)))) return [];
  var key=typeof TMDB_API_KEY==='string'?TMDB_API_KEY.trim():'';
  if (!key) return [];
  try {
    var externalUrl='https://api.themoviedb.org/3/'+mediaType+'/'+String(tmdbId)+'/external_ids';
    var externalHeaders={Accept:'application/json'};
    if (key.split('.').length===3) externalHeaders.Authorization='Bearer '+key;
    else externalUrl+='?api_key='+encodeURIComponent(key);
    var externalResponse=await fetch(externalUrl,{method:'GET',headers:externalHeaders});
    if (!externalResponse || !externalResponse.ok) return [];
    var external=await externalResponse.json();
    if (!external || String(external.id)!==String(tmdbId) || typeof external.imdb_id!=='string' || !/^tt\d{7,10}$/.test(external.imdb_id)) return [];
    var id=external.imdb_id+(mediaType==='tv'?':'+season+':'+episode:'');
    var r=await fetch(manifest.slice(0,-'/manifest.json'.length)+'/stream/'+(mediaType==='tv'?'series':'movie')+'/'+encodeURIComponent(id)+'.json',{method:'GET',headers:{Accept:'application/json'}});
    if (!r || !r.ok) return [];
    var body=await r.json();
    return body && Array.isArray(body.streams)?body.streams.slice(0,30).map(mapStremioStream).filter(Boolean).reduce(function(rows,s){
      var same=rows.filter(function(row){return row.url===s.url;})[0];
      if (!same) rows.push(s);
      else if (same.title!==s.title || same.quality!==s.quality) {
        same.name=same.title=/\.m3u8$/i.test(s.url.split(/[?#]/)[0])?'KinoPub • Adaptive HLS':'KinoPub';
        same.quality=undefined;
      }
      return rows;
    },[]):[];
  } catch (_) {return [];}
}
async function getStreams(tmdbId, mediaType, season, episode) {
  var cfg = typeof SCRAPER_SETTINGS !== 'undefined' ? SCRAPER_SETTINGS : {};
  if (cfg && cfg.kinoPubOffline) {
    if (cfg.mockOnly !== true) return [];
    return mapKinoPub({tmdbId: tmdbId, mediaType: mediaType, season: season, episode: episode}, cfg.kinoPubOffline);
  }
  // Explicit offline mode must not invoke even a configured transport.
  if (cfg && cfg.mockOnly === true) return [];
  if (cfg && cfg.stremioManifestUrl) return stremioStreams(cfg,tmdbId,mediaType,season,episode);
  var base = cfg && typeof cfg.bridgeUrl === 'string' ? cfg.bridgeUrl.replace(/\/+$/, '') : '';
  var token = cfg && typeof cfg.scopedToken === 'string' ? cfg.scopedToken : '';
  // This scaffold cannot be configured from the current webOS TV UI.
  // Reject missing / unsafe settings rather than falling back to public code or P2P.
  if (!/^https:\/\/[^\s/?#@:]+(?::443)?$/i.test(base) || token.length < 20) return [];
  if (!/^\d{1,12}$/.test(String(tmdbId || ''))) return [];
  if (mediaType !== 'movie' && mediaType !== 'tv') return [];
  var query='tmdbId='+encodeURIComponent(String(tmdbId))+'&mediaType='+encodeURIComponent(mediaType);
  if (mediaType === 'tv') {
    if (!/^(?:0|[1-9]\d*)$/.test(String(season)) || !/^[1-9]\d*$/.test(String(episode))) return [];
    query+='&season='+encodeURIComponent(String(season))+'&episode='+encodeURIComponent(String(episode));
  }
  try {
    var r=await fetch(base+'/v1/streams?'+query,{method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
    if (!r || !r.ok) return [];
    var json=await r.json();
    if (!json || !Array.isArray(json.streams)) return [];
    return json.streams.slice(0,30).map(mapBridgeStreamSafe).filter(Boolean);
  } catch (_) { return []; }
}
function onSettings() {
  // Descriptor is optional; pinned webOS has no provider-specific settings editor.
  // Set this through PluginManager.setScraperSettings in the app origin.
  return [{type:'text',key:'stremioManifestUrl',label:'Personal KinoPub Stremio manifest URL',isPassword:true}];
}
if (typeof module !== 'undefined') module.exports={getStreams:getStreams,onSettings:onSettings,mapBridgeStream:mapBridgeStreamSafe};

import {
  ControlEvent,
  TikTokLiveConnection,
  UserOfflineError,
  WebcastEvent,
} from 'tiktok-live-connector';
import { timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

const SOCKET_PATH = '/live-events';
const AVATAR_PATH = '/live-avatar';
const RECONNECT_DELAY_MS = 15_000;
const MAX_CONFIG_MESSAGE_BYTES = 16 * 1024;
const MAX_LIVE_HINTS = 8;
const GIFT_ACTIONS = ['ZOOM', 'FLY_ZOOM', 'SANTO', 'BREAKDANCE', 'ĐI VÒNG', 'PHÁO HOA', 'ĐỔI NHÂN VẬT'];
const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const MAX_AVATAR_REDIRECTS = 3;
const AVATAR_HOST_SUFFIXES = [
  '.tiktokcdn.com',
  '.tiktokcdn-us.com',
  '.tiktokcdn-eu.com',
  '.byteimg.com',
  '.ibytedtos.com',
];

export function normalizeGiftName(name) {
  return typeof name === 'string' ? name.trim().toLocaleLowerCase() : '';
}

export function createGiftActionMap(giftMappings) {
  const mappedGifts = new Map();
  Object.entries(giftMappings).forEach(([action, configuredNames]) => {
    if (typeof configuredNames !== 'string') return;
    configuredNames.split(';').forEach((name) => {
      const normalizedName = normalizeGiftName(name);
      if (normalizedName) mappedGifts.set(normalizedName, action);
    });
  });
  return mappedGifts;
}

export function getTikTokAvatarUrl(user) {
  for (const avatar of [user?.avatarMedium, user?.avatarThumb, user?.avatarLarge]) {
    const urls = Array.isArray(avatar?.urlList) ? avatar.urlList : [];
    const url = urls.find((candidate) => typeof candidate === 'string'
      && candidate.startsWith('https://'));
    if (url) return url;
  }
  return '';
}

function isAllowedAvatarUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === 'https:'
    && !url.username
    && !url.password
    && AVATAR_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix));
}

function isLoopbackAddress(address = '') {
  const normalized = address.replace(/^::ffff:/, '');
  return normalized === '::1' || normalized === '127.0.0.1' || normalized.startsWith('127.');
}

function parseAllowedOrigins(value) {
  const origins = new Set();
  for (const item of value.split(',').map((origin) => origin.trim()).filter(Boolean)) {
    let origin;
    try {
      origin = new URL(item);
    } catch {
      throw new Error(`Invalid origin in BAR_ALLOWED_ORIGINS: ${item}`);
    }
    if (!['http:', 'https:'].includes(origin.protocol)
      || origin.username
      || origin.password
      || origin.pathname !== '/'
      || origin.search
      || origin.hash) {
      throw new Error(`Invalid origin in BAR_ALLOWED_ORIGINS: ${item}`);
    }
    origins.add(origin.origin);
  }
  return origins;
}

function isAllowedOrigin(request, origin, allowedOrigins) {
  if (!origin) return isLoopbackAddress(request.socket.remoteAddress);
  try {
    const parsedOrigin = new URL(origin);
    if (!['http:', 'https:'].includes(parsedOrigin.protocol)) return false;
    return parsedOrigin.host === request.headers.host
      || allowedOrigins.has(parsedOrigin.origin);
  } catch {
    return false;
  }
}

function isAuthorizedAdmin(request, candidate, adminToken) {
  if (!adminToken) return isLoopbackAddress(request.socket.remoteAddress);
  if (typeof candidate !== 'string') return false;
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(adminToken);
  return candidateBuffer.length === expectedBuffer.length
    && timingSafeEqual(candidateBuffer, expectedBuffer);
}

export function tiktokLiveBridge({
  username = '',
  giftMappings = {},
  allowedOrigins = '',
  adminToken = '',
} = {}) {
  const cleanUsername = username.trim().replace(/^@/, '');
  const mappedGifts = createGiftActionMap(giftMappings);
  const trustedOrigins = parseAllowedOrigins(allowedOrigins);

  function configureBridge(server) {
      const clients = new Set();
      const webSocketServer = new WebSocketServer({ noServer: true });
      let status = cleanUsername ? 'connecting' : 'not-configured';
      let sceneSettings;
      let connection;
      let reconnectTimer;
      let stopped = false;
      let connecting = false;

      function broadcast(message) {
        const payload = JSON.stringify(message);
        clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) client.send(payload);
        });
      }

      function updateStatus(nextStatus) {
        status = nextStatus;
        broadcast({ type: 'status', status });
      }

      server.middlewares.use(AVATAR_PATH, async (request, response, next) => {
        if (request.method !== 'GET') {
          response.statusCode = 405;
          response.setHeader('Allow', 'GET');
          response.end();
          return;
        }
        const origin = request.headers.origin;
        if (!isAllowedOrigin(request, origin, trustedOrigins)) {
          response.statusCode = 403;
          response.end('Forbidden');
          return;
        }
        if (origin) {
          response.setHeader('Access-Control-Allow-Origin', new URL(origin).origin);
          response.setHeader('Vary', 'Origin');
        }

        const requestUrl = new URL(request.url, 'http://localhost');
        const avatarUrl = requestUrl.searchParams.get('url');
        if (!avatarUrl || !isAllowedAvatarUrl(avatarUrl)) {
          response.statusCode = 400;
          response.end('Invalid TikTok avatar URL');
          return;
        }

        try {
          let targetUrl = avatarUrl;
          let avatarResponse;
          for (let redirectCount = 0; redirectCount <= MAX_AVATAR_REDIRECTS; redirectCount += 1) {
            avatarResponse = await fetch(targetUrl, {
              redirect: 'manual',
              signal: AbortSignal.timeout(8000),
            });
            if (![301, 302, 303, 307, 308].includes(avatarResponse.status)) break;
            const location = avatarResponse.headers.get('location');
            if (!location || redirectCount === MAX_AVATAR_REDIRECTS) {
              throw new Error('TikTok avatar redirect limit reached.');
            }
            targetUrl = new URL(location, targetUrl).href;
            if (!isAllowedAvatarUrl(targetUrl)) {
              throw new Error('TikTok avatar redirected to a disallowed host.');
            }
          }
          if (!avatarResponse?.ok || !avatarResponse.body) {
            throw new Error(`TikTok avatar request failed with status ${avatarResponse?.status}.`);
          }

          const contentType = avatarResponse.headers.get('content-type')?.split(';')[0] || '';
          if (!/^image\/(jpeg|png|webp|gif|avif)$/i.test(contentType)) {
            throw new Error('TikTok avatar response was not a supported image.');
          }
          const declaredLength = Number(avatarResponse.headers.get('content-length'));
          if (declaredLength > MAX_AVATAR_BYTES) {
            throw new Error('TikTok avatar exceeds the maximum allowed size.');
          }

          const reader = avatarResponse.body.getReader();
          const chunks = [];
          let totalBytes = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            totalBytes += value.byteLength;
            if (totalBytes > MAX_AVATAR_BYTES) {
              await reader.cancel();
              throw new Error('TikTok avatar exceeds the maximum allowed size.');
            }
            chunks.push(Buffer.from(value));
          }
          const image = Buffer.concat(chunks, totalBytes);
          response.statusCode = 200;
          response.setHeader('Content-Type', contentType);
          response.setHeader('Content-Length', image.length);
          response.setHeader('Cache-Control', 'public, max-age=3600');
          response.setHeader('X-Content-Type-Options', 'nosniff');
          response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          response.end(image);
        } catch (error) {
          console.error('Unable to load a TikTok avatar:', error);
          if (!response.headersSent) {
            response.statusCode = 502;
            response.end('Unable to load TikTok avatar');
          }
        }
      });

      webSocketServer.on('connection', (client, request) => {
        clients.add(client);
        client.send(JSON.stringify({ type: 'status', status }));
        client.on('message', (rawMessage) => {
          if (rawMessage.length > MAX_CONFIG_MESSAGE_BYTES) {
            console.error('Rejected oversized Bar Live bridge message.');
            return;
          }
          let payload;
          try {
            payload = JSON.parse(rawMessage.toString());
          } catch (error) {
            console.error('Invalid message from Bar Live bridge client:', error);
            return;
          }
          if (payload?.type === 'scene-ready') {
            if (sceneSettings) {
              client.send(JSON.stringify({ type: 'scene-settings', settings: sceneSettings }));
            }
            return;
          }
          if (payload?.type !== 'admin-config') return;
          if (!isAuthorizedAdmin(request, payload.token, adminToken)) {
            client.send(JSON.stringify({
              type: 'admin-config-error',
              message: 'Admin token is missing or invalid.',
            }));
            return;
          }

          const receivedMappings = payload.settings?.giftMappings;
          if (!receivedMappings || typeof receivedMappings !== 'object' || Array.isArray(receivedMappings)) {
            client.send(JSON.stringify({
              type: 'admin-config-error',
              message: 'Gift mappings must be an object.',
            }));
            return;
          }
          const nextMappings = {};
          const nextSceneSettings = payload.settings?.sceneSettings;
          let validatedSceneSettings;
          for (const action of GIFT_ACTIONS) {
            const mapping = receivedMappings[action] ?? '';
            if (typeof mapping !== 'string' || mapping.length > 500) {
              client.send(JSON.stringify({
                type: 'admin-config-error',
                message: `Invalid gift mapping for ${action}.`,
              }));
              return;
            }
            nextMappings[action] = mapping;
          }
          if (nextSceneSettings !== undefined) {
            const commentMappings = nextSceneSettings?.commentMappings;
            if (typeof nextSceneSettings.zoomOnLike !== 'boolean'
              || !commentMappings
              || typeof commentMappings !== 'object'
              || Array.isArray(commentMappings)
              || !Array.isArray(nextSceneSettings.liveHints)
              || nextSceneSettings.liveHints.length > MAX_LIVE_HINTS) {
              client.send(JSON.stringify({
                type: 'admin-config-error',
                message: 'Invalid scene settings.',
              }));
              return;
            }
            const nextCommentMappings = {};
            for (const action of GIFT_ACTIONS) {
              const mapping = commentMappings[action] ?? '';
              if (typeof mapping !== 'string' || mapping.length > 500) {
                client.send(JSON.stringify({
                  type: 'admin-config-error',
                  message: `Invalid comment mapping for ${action}.`,
                }));
                return;
              }
              nextCommentMappings[action] = mapping;
            }
            const liveHints = [];
            for (const hint of nextSceneSettings.liveHints) {
              if (!hint || typeof hint.trigger !== 'string' || hint.trigger.length > 40
                || typeof hint.effect !== 'string' || hint.effect.length > 40) {
                client.send(JSON.stringify({
                  type: 'admin-config-error',
                  message: 'Invalid live hint.',
                }));
                return;
              }
              liveHints.push({ trigger: hint.trigger, effect: hint.effect });
            }
            validatedSceneSettings = {
              zoomOnLike: nextSceneSettings.zoomOnLike,
              commentMappings: nextCommentMappings,
              giftMappings: nextMappings,
              liveHints,
            };
          }
          mappedGifts.clear();
          createGiftActionMap(nextMappings).forEach((action, giftName) => {
            mappedGifts.set(giftName, action);
          });
          if (validatedSceneSettings) {
            sceneSettings = validatedSceneSettings;
            broadcast({ type: 'scene-settings', settings: sceneSettings });
          }
          client.send(JSON.stringify({ type: 'admin-config-saved' }));
        });
        client.on('close', () => clients.delete(client));
        client.on('error', (error) => {
          console.error('Live bridge browser socket error:', error);
          clients.delete(client);
        });
      });

      function onUpgrade(request, socket, head) {
        let pathname;
        try {
          pathname = new URL(request.url, 'http://localhost').pathname;
        } catch (error) {
          console.error('Invalid live bridge WebSocket URL:', error);
          socket.destroy();
          return;
        }
        if (pathname !== SOCKET_PATH) return;

        if (!isAllowedOrigin(request, request.headers.origin, trustedOrigins)) {
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          socket.destroy();
          return;
        }

        webSocketServer.handleUpgrade(request, socket, head, (client) => {
          webSocketServer.emit('connection', client, request);
        });
      }

      server.httpServer?.on('upgrade', onUpgrade);

      async function connectToLive() {
        if (stopped || connecting || !cleanUsername) return;
        connecting = true;
        updateStatus('connecting');

        const activeConnection = new TikTokLiveConnection(cleanUsername, {
          processInitialData: false,
          enableExtendedGiftInfo: false,
        });
        connection = activeConnection;

        activeConnection.on(ControlEvent.CONNECTED, () => {
          if (connection === activeConnection) updateStatus('connected');
        });
        activeConnection.on(ControlEvent.DISCONNECTED, () => {
          if (connection !== activeConnection || stopped) return;
          updateStatus('reconnecting');
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connectToLive, RECONNECT_DELAY_MS);
        });
        activeConnection.on(ControlEvent.ERROR, ({ info, exception } = {}) => {
          const isOffline = exception instanceof UserOfflineError;
          if (!isOffline) console.error('TikTok LIVE connector error:', info, exception);
          if (connection === activeConnection) updateStatus(isOffline ? 'offline' : 'error');
        });
        activeConnection.on(WebcastEvent.STREAM_END, () => {
          if (connection === activeConnection) updateStatus('offline');
        });
        activeConnection.on(WebcastEvent.MEMBER, (data) => {
          const user = data.user;
          const userId = user?.uniqueId || user?.nickname;
          if (!userId) return;
          broadcast({
            type: 'event',
            event: {
              type: 'join',
              user: userId,
              displayName: user.nickname || user.uniqueId || userId,
              avatarUrl: getTikTokAvatarUrl(user),
            },
          });
        });
        activeConnection.on(WebcastEvent.CHAT, (data) => {
          const user = data.user;
          const userId = user?.uniqueId || user?.nickname;
          if (!userId || typeof data.comment !== 'string') return;
          broadcast({
            type: 'event',
            event: {
              type: 'comment',
              user: userId,
              displayName: user.nickname || user.uniqueId || userId,
              avatarUrl: getTikTokAvatarUrl(user),
              text: data.comment,
              isHost: userId.toLocaleLowerCase() === cleanUsername.toLocaleLowerCase(),
            },
          });
        });
        activeConnection.on(WebcastEvent.LIKE, (data) => {
          const user = data.user;
          const userId = user?.uniqueId || user?.nickname;
          if (!userId) return;
          broadcast({
            type: 'event',
            event: {
              type: 'like',
              user: userId,
              displayName: user.nickname || user.uniqueId || userId,
              avatarUrl: getTikTokAvatarUrl(user),
              likeCount: Number.isFinite(data.likeCount) ? data.likeCount : 1,
            },
          });
        });
        activeConnection.on(WebcastEvent.GIFT, (data) => {
          if (data.giftDetails?.giftType === 1 && !data.repeatEnd) return;
          const user = data.user;
          const userId = user?.uniqueId || user?.nickname;
          if (!userId) return;
          const giftName = data.giftDetails?.giftName || `Quà #${data.giftId}`;
          const normalizedGiftName = normalizeGiftName(giftName);
          broadcast({
            type: 'event',
            event: {
              type: 'gift',
              user: userId,
              displayName: user.nickname || user.uniqueId || userId,
              avatarUrl: getTikTokAvatarUrl(user),
              giftName,
              action: mappedGifts.get(normalizedGiftName) || null,
            },
          });
        });

        try {
          await activeConnection.connect();
          if (!stopped && connection === activeConnection) updateStatus('connected');
        } catch (error) {
          const isOffline = error instanceof UserOfflineError;
          if (!isOffline) {
            console.error(`Unable to connect to TikTok LIVE @${cleanUsername}:`, error);
          }
          if (connection === activeConnection) updateStatus(isOffline ? 'offline' : 'error');
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connectToLive, RECONNECT_DELAY_MS);
        } finally {
          connecting = false;
        }
      }

      if (cleanUsername) {
        connectToLive();
      } else {
        server.config.logger.info('TikTok LIVE bridge idle. Set BAR_TIKTOK_USERNAME to connect.');
      }

      function cleanup() {
        stopped = true;
        clearTimeout(reconnectTimer);
        server.httpServer?.off('upgrade', onUpgrade);
        clients.forEach((client) => client.close());
        clients.clear();
        webSocketServer.close();
        if (connection) {
          connection.disconnect().catch((error) => {
            console.error('Unable to close TikTok LIVE connection:', error);
          });
        }
      }
      server.httpServer?.once('close', cleanup);
  }

  return {
    name: 'bar-live-tiktok-bridge',
    configureServer: configureBridge,
    configurePreviewServer: configureBridge,
  };
}

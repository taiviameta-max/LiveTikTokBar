function getBridgeOrigin() {
  const configuredUrl = import.meta.env.VITE_LIVE_BRIDGE_URL?.trim();
  const bridgeUrl = new URL(configuredUrl || window.location.origin);
  if (!['http:', 'https:'].includes(bridgeUrl.protocol)) {
    throw new Error('VITE_LIVE_BRIDGE_URL must use HTTP or HTTPS.');
  }
  return bridgeUrl.origin;
}

export function getBridgeSocketUrl() {
  const socketUrl = new URL('/live-events', getBridgeOrigin());
  socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  return socketUrl.href;
}

export function getAvatarProxyUrl(avatarUrl) {
  const proxyUrl = new URL('/live-avatar', getBridgeOrigin());
  proxyUrl.searchParams.set('url', avatarUrl);
  return proxyUrl.href;
}

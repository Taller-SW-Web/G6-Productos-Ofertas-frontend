export function tlsOwnerCommand(platform, uid, gid) {
  if (platform === 'win32') return '';
  if (!Number.isSafeInteger(uid) || uid < 0 || !Number.isSafeInteger(gid) || gid < 0) {
    throw new Error('G5_TLS_HOST_ID_UNAVAILABLE');
  }
  return ` && chown ${uid}:${gid} /out/server.key /out/server.crt`;
}

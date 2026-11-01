// Vercel Blob 비공개 저장소. 기록 전체를 JSON 한 개로 둔다.
// 읽을 때는 캐시를 건너뛰고(useCache: false), 쓸 때는 읽은 ETag가 그대로일 때만 쓴다(ifMatch).
// 토큰은 프로젝트에 연결된 Blob 저장소가 넣어 주는 BLOB_READ_WRITE_TOKEN을 쓴다.

import { BlobPreconditionFailedError, get, put } from '@vercel/blob';
import { emptyState } from './core.js';
import { VersionConflict } from './service.js';

export function blobStore(pathname = 'signal-noise/store.json') {
  return {
    async load() {
      const res = await get(pathname, { access: 'private', useCache: false });
      if (!res || res.statusCode !== 200) return { state: emptyState(), version: null };
      const text = await new Response(res.stream).text();
      return { state: { ...emptyState(), ...JSON.parse(text) }, version: res.blob.etag };
    },
    async save(state, version) {
      try {
        await put(pathname, JSON.stringify(state), {
          access: 'private',
          contentType: 'application/json',
          addRandomSuffix: false,
          allowOverwrite: true,
          cacheControlMaxAge: 60,
          ...(version ? { ifMatch: version } : {}),
        });
      } catch (e) {
        if (e instanceof BlobPreconditionFailedError) throw new VersionConflict();
        throw e;
      }
    },
  };
}

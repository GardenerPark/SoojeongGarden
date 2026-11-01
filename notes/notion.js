// 노션 공개 API 클라이언트(필요한 것만). 토큰은 서버에만 있고 앱 화면으로는 나가지 않는다.
// 429·5xx는 Retry-After를 지켜 몇 번 다시 시도하고, 동시에 나가는 요청은 3개로 묶는다(노션 한도 초당 3회 안팎).

export class NotionError extends Error {
  constructor(status, code, message) {
    super(message || `노션 요청이 실패했어요 (${status}${code ? ` ${code}` : ''}).`);
    this.status = status;
    this.code = code;
  }
}

function limiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => {
      active--;
      next();
    });
  };
  return (fn) => new Promise((resolve, reject) => (queue.push({ fn, resolve, reject }), next()));
}

export function createNotion({ token, fetchImpl = fetch, version = '2022-06-28', retries = 3, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const limit = limiter(3);

  async function call(method, path, body) {
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await limit(() =>
          fetchImpl(`https://api.notion.com/v1${path}`, {
            method,
            headers: { Authorization: `Bearer ${token}`, 'Notion-Version': version, 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
          }),
        );
      } catch (e) {
        if (attempt < retries) {
          await sleep(500 * 2 ** attempt);
          continue;
        }
        throw new NotionError(0, 'network', '노션에 연결하지 못했어요.');
      }
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        const wait = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(wait) && wait > 0 ? wait * 1000 : 500 * 2 ** attempt);
        continue;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new NotionError(res.status, data.code, data.message && `노션: ${data.message}`);
      return data;
    }
  }

  return {
    getDatabase: (id) => call('GET', `/databases/${id}`),
    queryDatabase: (id, body) => call('POST', `/databases/${id}/query`, body),
    getPage: (id) => call('GET', `/pages/${id}`),
    createPage: (body) => call('POST', '/pages', body),
    updatePage: (id, properties) => call('PATCH', `/pages/${id}`, { properties }),
    listChildren: (id, cursor, pageSize = 100) =>
      call('GET', `/blocks/${id}/children?page_size=${pageSize}${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ''}`),
    appendChildren: (id, children, after) => call('PATCH', `/blocks/${id}/children`, { children, ...(after ? { after } : {}) }),
    updateBlock: (id, body) => call('PATCH', `/blocks/${id}`, body),
    deleteBlock: (id) => call('DELETE', `/blocks/${id}`),
  };
}

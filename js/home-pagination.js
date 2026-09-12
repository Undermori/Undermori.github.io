(() => {
  if (window.homePaginationInstalled || window.pjax) return;
  window.homePaginationInstalled = true;
  const cache = new Map();
  const positions = new Map();
  let controller;
  let sequence = 0;
  let activeId = history.state?.studyHome?.id;
  const valid = url => url.origin === location.origin && /^\/(?:page\/[1-9]\d*\/)?$/.test(url.pathname);
  const list = () => document.getElementById('recent-posts');
  const snapshot = doc => ({
    html: doc.getElementById('recent-posts').innerHTML,
    title: doc.title,
    canonical: doc.querySelector('link[rel="canonical"]')?.href,
    ogURL: doc.querySelector('meta[property="og:url"]')?.content
  });
  const remember = (url, value) => {
    cache.set(url.pathname, value);
    if (cache.size > 12) cache.delete(cache.keys().next().value);
  };
  const newState = position => ({id: `${Date.now()}-${++sequence}`, position});
  const apply = (data, position) => {
    list().innerHTML = data.html;
    document.title = data.title;
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical && data.canonical) canonical.href = data.canonical;
    const ogURL = document.querySelector('meta[property="og:url"]');
    if (ogURL && data.ogURL) ogURL.content = data.ogURL;
    // Keep the current document/Hero and commit the list and scroll before the next paint.
    const destination = position || [0, document.getElementById('content-inner').getBoundingClientRect().top + scrollY];
    window.scrollTo({left: destination[0], top: destination[1], behavior: 'instant'});
    document.dispatchEvent(new Event('home:paginated'));
  };
  const load = async (url, signal) => {
    if (cache.has(url.pathname)) return cache.get(url.pathname);
    const response = await fetch(url.pathname + url.search, {signal, credentials:'same-origin'});
    if (!response.ok || !valid(new URL(response.url))) throw new Error('Pagination response unavailable');
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    if (!doc.querySelector('#recent-posts #pagination') || !doc.querySelector('#page-header.full_page')) throw new Error('Not a home pagination page');
    const data = snapshot(doc);
    remember(url, data);
    return data;
  };
  document.addEventListener('click', async event => {
    const link = event.target.closest('#recent-posts #pagination a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target || link.hasAttribute('download')) return;
    const url = new URL(link.href);
    if (!valid(url) || url.hash !== '#content-inner') return;
    event.preventDefault();
    controller?.abort();
    controller = new AbortController();
    const request = controller;
    const pagination = link.closest('#pagination');
    remember(new URL(location.href), snapshot(document));
    pagination.setAttribute('aria-busy', 'true');
    const previous = history.state?.studyHome || newState([scrollX, scrollY]);
    positions.set(previous.id, [scrollX, scrollY]);
    activeId = previous.id;
    history.replaceState({...history.state, studyHome:previous}, '');
    try {
      const data = await load(url, request.signal);
      if (request.signal.aborted) return;
      const state = newState(null);
      history.pushState({studyHome:state}, '', url);
      activeId = state.id;
      apply(data);
      positions.set(activeId, [scrollX, scrollY]);
    } catch (error) {
      if (error.name !== 'AbortError') location.assign(url.href);
    } finally {
      pagination.removeAttribute('aria-busy');
    }
  });
  window.addEventListener('scroll', () => {
    if (activeId) positions.set(activeId, [scrollX, scrollY]);
  }, {passive:true});
  window.addEventListener('popstate', event => {
    const state = event.state?.studyHome;
    const url = new URL(location.href);
    if (!state || !valid(url) || !list()) return;
    controller?.abort();
    activeId = state.id;
    const position = positions.get(state.id) || state.position;
    const cached = cache.get(url.pathname);
    if (cached) { apply(cached, position); return; }
    controller = new AbortController();
    const request = controller;
    load(url, request.signal).then(data => {
      if (!request.signal.aborted) apply(data, position);
    }).catch(error => { if (error.name !== 'AbortError') location.reload(); });
  });
  window.addEventListener('pagehide', () => controller?.abort());
})();

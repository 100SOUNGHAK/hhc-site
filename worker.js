// ============================================================
// HHC Calendar Sync Worker
// 구글 캘린더 + Google Tasks -> Firestore(schedules 컬렉션) 자동 동기화
// ============================================================

const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/tasks.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function b64url(bytes) {
  let bin = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlFromStr(str) {
  return b64url(new TextEncoder().encode(str));
}
function pemToBinary(pem) {
  const clean = pem
    .replace(/\\n/g, '\n')
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function getServiceAccountKey(env) {
  const keyData = pemToBinary(env.FIREBASE_PRIVATE_KEY);
  return crypto.subtle.importKey(
    'pkcs8', keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
}

// 서버(서비스 계정) 인증 -> Firestore 쓰기용 access token
async function getFirestoreAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now
  };
  const unsigned = b64urlFromStr(JSON.stringify(header)) + '.' + b64urlFromStr(JSON.stringify(payload));
  const key = await getServiceAccountKey(env);
  const sig = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(unsigned)
  );
  const jwt = unsigned + '.' + b64url(sig);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Firestore 인증 실패: ' + JSON.stringify(data));
  return data.access_token;
}

// 사용자(구글 로그인) refresh_token -> Calendar/Tasks 읽기용 access token
async function getUserAccessToken(env) {
  const refreshToken = await env.HHC_KV.get('google_refresh_token');
  if (!refreshToken) throw new Error('구글 로그인이 아직 안 되어 있습니다. /auth 로 먼저 로그인하세요.');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('구글 토큰 갱신 실패: ' + JSON.stringify(data));
  return data.access_token;
}

// ---- Google Calendar ----
async function fetchCalendarEvents(accessToken, timeMin, timeMax) {
  let events = [];
  let pageToken = '';
  do {
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.set('timeMin', timeMin);
    url.searchParams.set('timeMax', timeMax);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', '250');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
    const data = await res.json();
    if (data.error) throw new Error('Calendar API 오류: ' + JSON.stringify(data.error));
    events = events.concat(data.items || []);
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return events;
}

// ---- Google Tasks ----
async function fetchAllTasks(accessToken) {
  const listsRes = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
    headers: { Authorization: 'Bearer ' + accessToken }
  });
  const listsData = await listsRes.json();
  if (listsData.error) throw new Error('Tasks API 오류: ' + JSON.stringify(listsData.error));
  let allTasks = [];
  for (const list of (listsData.items || [])) {
    let pageToken = '';
    do {
      const url = new URL(`https://tasks.googleapis.com/tasks/v1/lists/${list.id}/tasks`);
      url.searchParams.set('showCompleted', 'true');
      url.searchParams.set('showHidden', 'true');
      url.searchParams.set('maxResults', '100');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const res = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
      const data = await res.json();
      if (data.error) throw new Error('Tasks API 오류: ' + JSON.stringify(data.error));
      (data.items || []).forEach(t => allTasks.push(t));
      pageToken = data.nextPageToken || '';
    } while (pageToken);
  }
  return allTasks;
}

// ---- Firestore REST 쓰기 ----
function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { doubleValue: v };
  return { stringValue: String(v) };
}
function toFirestoreFields(obj) {
  const fields = {};
  Object.keys(obj).forEach(k => { fields[k] = toFirestoreValue(obj[k]); });
  return fields;
}
async function upsertFirestoreDoc(env, firestoreToken, docId, data) {
  const projectId = env.FIREBASE_CLIENT_EMAIL.split('@')[1].split('.iam.gserviceaccount.com')[0];
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schedules/${docId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer ' + firestoreToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields: toFirestoreFields(data) })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('Firestore 쓰기 실패 (' + docId + '): ' + t);
  }
}

function ymd(dateObj) {
  return dateObj.getFullYear() + '-' + String(dateObj.getMonth() + 1).padStart(2, '0') + '-' + String(dateObj.getDate()).padStart(2, '0');
}
function hm(dateObj) {
  return String(dateObj.getHours()).padStart(2, '0') + ':' + String(dateObj.getMinutes()).padStart(2, '0');
}

// ---- 메인 동기화 로직 ----
async function runSync(env, { pastDays = 7, futureDays = 180 } = {}) {
  const userToken = await getUserAccessToken(env);
  const firestoreToken = await getFirestoreAccessToken(env);

  const now = new Date();
  const timeMin = new Date(now.getTime() - pastDays * 86400000).toISOString();
  const timeMax = new Date(now.getTime() + futureDays * 86400000).toISOString();

  const events = await fetchCalendarEvents(userToken, timeMin, timeMax);
  let count = 0;
  for (const ev of events) {
    if (ev.status === 'cancelled') continue;
    const startRaw = ev.start && (ev.start.dateTime || ev.start.date);
    if (!startRaw) continue;
    const isAllDay = !!(ev.start && ev.start.date && !ev.start.dateTime);
    const startDt = new Date(startRaw);
    const endDt = ev.end && (ev.end.dateTime || ev.end.date) ? new Date(ev.end.dateTime || ev.end.date) : null;
    await upsertFirestoreDoc(env, firestoreToken, 'gcal_' + ev.id, {
      date: ymd(startDt),
      time_s: isAllDay ? '' : hm(startDt),
      time_e: (!isAllDay && endDt) ? hm(endDt) : '',
      title: ev.summary || '(제목 없음)',
      type: 'google',
      memo: [ev.location ? '📍 ' + ev.location : '', ev.description || ''].filter(Boolean).join('\n'),
      source: 'google_calendar'
    });
    count++;
  }

  const tasks = await fetchAllTasks(userToken);
  for (const t of tasks) {
    if (!t.due) continue; // 날짜 없는 태스크는 캘린더에 표시할 수 없으므로 skip
    const dueDt = new Date(t.due);
    await upsertFirestoreDoc(env, firestoreToken, 'gtask_' + t.id, {
      date: ymd(dueDt),
      time_s: '',
      time_e: '',
      title: (t.completed ? '✅ ' : '') + (t.title || '(제목 없음)'),
      type: 'google',
      memo: t.notes || '',
      source: 'google_tasks'
    });
    count++;
  }

  return { events: events.length, tasks: tasks.length, written: count };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/auth') {
      const redirectUri = url.origin + '/oauth-callback';
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', SCOPES);
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      return Response.redirect(authUrl.toString(), 302);
    }

    if (url.pathname === '/oauth-callback') {
      const code = url.searchParams.get('code');
      if (!code) return new Response('인증 코드가 없습니다.', { status: 400 });
      const redirectUri = url.origin + '/oauth-callback';
      const tokenRes = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        })
      });
      const tokenData = await tokenRes.json();
      if (!tokenData.refresh_token) {
        return new Response(
          '로그인은 됐지만 refresh_token을 못 받았습니다. 이미 한 번 인증한 적이 있다면, ' +
          'Google 계정 설정 > 보안 > 타사 액세스 권한에서 이 앱 연결을 해제한 뒤 /auth 를 다시 시도해주세요.\n\n' +
          JSON.stringify(tokenData), { status: 400 }
        );
      }
      await env.HHC_KV.put('google_refresh_token', tokenData.refresh_token);

      let result;
      try {
        result = await runSync(env, { pastDays: 730, futureDays: 365 }); // 최초 1회: 과거 2년 ~ 미래 1년 백필
      } catch (e) {
        return new Response('로그인은 완료됐지만 최초 동기화 중 오류: ' + e.message, { status: 500 });
      }
      return new Response(
        `구글 캘린더 연동 완료!\n\n가져온 일정: ${result.events}개\n가져온 Tasks: ${result.tasks}개\nFirestore에 저장됨: ${result.written}개\n\n이 창은 닫으셔도 됩니다.`,
        { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
      );
    }

    if (url.pathname === '/backfill') {
      try {
        const result = await runSync(env, { pastDays: 1095, futureDays: 365 });
        return new Response('백필 완료: ' + JSON.stringify(result), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      } catch (e) {
        return new Response('백필 오류: ' + e.message, { status: 500 });
      }
    }

    if (url.pathname === '/sync-now') {
      try {
        const result = await runSync(env, { pastDays: 7, futureDays: 180 });
        return new Response('동기화 완료: ' + JSON.stringify(result), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      } catch (e) {
        return new Response('동기화 오류: ' + e.message, { status: 500 });
      }
    }

    return new Response('HHC Calendar Sync Worker\n\n/auth 로 구글 로그인\n/sync-now 로 수동 동기화\n/backfill 로 과거 기록 재수집', { status: 200 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runSync(env, { pastDays: 7, futureDays: 180 }));
  }
};

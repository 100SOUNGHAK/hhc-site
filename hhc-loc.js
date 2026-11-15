/* ─────────────────────────────────────────────────────────────────────────────
   hhc-loc.js — 구글맵 위치 검색 · 등록 창 (2026-11-16)
   출장점검 비용 확인(visit-fee.html)과 같은 방식: 이름·주소로 구글 장소 검색 → 지도에서 핀 선택
   → 핀을 끌어 정확한 입구로 옮기기 → 「이 위치로 확정」

   쓰는 곳
     · work-admin.html  관리자 「직원 일정표」 일정 편집 → 방문 위치 등록
     · request.html     고객 의뢰신청서 「위치 확인 · 등록하기」(선택 항목)

   사용법
     const loc = await HHCLoc.pick({ lang:'ko'|'en', query:'Arcoris Mont Kiara', initial:{lat,lng,name,addr,pid}|null, who:'admin'|'customer' });
     → {lat,lng,name,addr,pid} 또는 null(닫음)
     HHCLoc.navUrl(loc)  → 구글맵 길 안내 주소 (휴대폰에서는 구글맵 앱이 열려 바로 안내 시작)
     HHCLoc.viewUrl(loc) → 구글맵에서 그 위치 보기

   지도 키는 /api/travel?cfg=1 (visit-fee 와 같은 브라우저 키 · 우리 도메인에서만 동작)
   ───────────────────────────────────────────────────────────────────────────── */
(function(){
  if (window.HHCLoc) return;
  var KL = { lat: 3.139, lng: 101.6869 };
  var T = {
    ko: { tA:'방문 위치 등록', tC:'방문 위치 확인',
      subA:'콘도명·주소로 검색하거나 지도를 눌러 위치를 고르세요. 등록하면 직원 일정표에서 누르는 즉시 구글맵 길 안내가 시작됩니다.',
      subC:'정확한 방문을 위해 우리 집 위치를 확인해 주세요. 기사가 헤매지 않고 약속 시간에 도착할 수 있습니다.',
      ph:'콘도명 또는 주소 (예: Arcoris Mont Kiara)', find:'검색', close:'닫기',
      tip0:'콘도명을 검색하거나 <b>지도를 눌러</b> 위치를 고르세요', searching:'구글맵에서 찾는 중…',
      none:'검색 결과가 없습니다. 이름을 조금 바꾸거나 지도를 직접 눌러 주세요.', listH:function(n){return '검색 결과 '+n+'곳 — 맞는 곳을 누르세요';},
      drag:'빨간 핀을 끌어 <b>건물 입구·블록</b>에 맞출 수 있습니다', pin:'지도에서 고른 위치', back:'← 목록',
      ok:'이 위치로 확정', off:'지금은 지도를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.', err:'연결이 고르지 않습니다. 다시 검색해 주세요.' },
    en: { tA:'Set visit location', tC:'Confirm your location',
      subA:'Search by condo name or address, or tap the map.',
      subC:'Please confirm your home on the map so our technician finds you exactly and arrives on time.',
      ph:'Condo name or address (e.g. Arcoris Mont Kiara)', find:'Search', close:'Close',
      tip0:'Search your condo or <b>tap the map</b> to choose', searching:'Searching Google Maps…',
      none:'No results. Try a different name or tap the map.', listH:function(n){return n+' result'+(n>1?'s':'')+' — tap the right one';},
      drag:'Drag the red pin to your <b>building entrance / block</b>', pin:'Selected on map', back:'← List',
      ok:'Confirm this location', off:'The map is not available right now. Please try again later.', err:'Connection problem. Please search again.' }
  };

  var CSS = ''
  + '.hl-ov{position:fixed;inset:0;z-index:300;background:rgba(8,23,43,.55);display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .2s}'
  + '.hl-ov.on{opacity:1}'
  + '.hl-sh{width:100%;max-width:560px;height:100%;background:#F6F8FC;display:flex;flex-direction:column;overflow:hidden;font-family:inherit;color:#14192A;transform:translateY(24px);transition:transform .24s cubic-bezier(.22,.61,.36,1)}'
  + '.hl-ov.on .hl-sh{transform:none}'
  + '@media (min-width:700px){.hl-ov{align-items:center;padding:24px}.hl-sh{height:min(860px,100%);border-radius:20px;box-shadow:0 2px 6px rgba(11,24,51,.16),0 14px 26px -6px rgba(11,24,51,.24),0 38px 68px -18px rgba(11,24,51,.48)}}'
  + '.hl-bar{flex:none;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#0E2350,#16346E);color:#fff;padding:calc(12px + env(safe-area-inset-top)) 14px 12px}'
  + '.hl-bar b{flex:1;font-size:17px;font-weight:900;letter-spacing:-.02em}'
  + '.hl-x{border:0;border-radius:999px;background:rgba(255,255,255,.14);color:#fff;font:800 14px/1 inherit;font-family:inherit;padding:9px 14px;cursor:pointer}'
  + '.hl-sub{flex:none;font-size:13px;line-height:1.55;color:#5A6478;padding:11px 16px 0}'
  + '.hl-sub.c{color:#5B4410;background:#FBF5E6;border:1px solid rgba(201,164,76,.45);border-radius:12px;margin:12px 14px 0;padding:10px 12px;font-weight:600}'
  + '.hl-sr{flex:none;display:flex;gap:8px;padding:11px 14px}'
  + '.hl-sr input{flex:1;min-width:0;border:1.5px solid #E4E9F2;border-radius:12px;padding:12px 13px;font-size:16px;font-family:inherit;background:#fff;color:#14192A}'
  + '.hl-sr input:focus{outline:none;border-color:#14958a;box-shadow:0 0 0 4px rgba(20,149,138,.12)}'
  + '.hl-sr button{flex:none;border:0;border-radius:12px;padding:0 16px;font-size:15px;font-weight:900;background:#0E2350;color:#fff;cursor:pointer}'
  + '.hl-mw{position:relative;flex:1;min-height:220px;margin:0 14px;border-radius:14px;overflow:hidden;background:#E8EDF4;box-shadow:0 1px 2px rgba(11,24,51,.09),0 5px 12px -3px rgba(11,24,51,.14)}'
  + '.hl-map{position:absolute;inset:0}'
  + '.hl-tip{position:absolute;left:10px;right:56px;top:10px;z-index:2;background:rgba(255,255,255,.95);border-radius:10px;padding:8px 11px;font-size:12.5px;font-weight:600;color:#14192A;line-height:1.45;box-shadow:0 1px 2px rgba(11,24,51,.12),0 6px 14px -6px rgba(11,24,51,.3);pointer-events:none}'
  + '.hl-tip b{color:#C5221F}'
  + '.hl-msg{position:absolute;inset:0;display:none;align-items:center;justify-content:center;text-align:center;padding:24px;font-size:14px;font-weight:600;color:#5A6478;line-height:1.6;z-index:3;background:#F1F4F9}'
  + '.hl-pn{flex:none;max-height:42%;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:10px 14px calc(14px + env(safe-area-inset-bottom))}'
  + '.hl-lh{font-size:12px;font-weight:800;color:#98A1B4;margin:2px 2px 7px}'
  + '.hl-it{display:flex;gap:10px;align-items:flex-start;width:100%;text-align:left;border:0;background:#fff;border-radius:12px;padding:11px 12px;margin-bottom:7px;cursor:pointer;font-family:inherit;color:inherit;box-shadow:0 1px 2px rgba(14,35,80,.06),0 6px 14px -8px rgba(14,35,80,.18)}'
  + '.hl-it:active{background:#FBFCFE}'
  + '.hl-it i{flex:none;font-style:normal;width:22px;height:22px;border-radius:50%;background:#EA4335;color:#fff;font-size:11.5px;font-weight:900;display:grid;place-items:center;margin-top:1px}'
  + '.hl-it b{display:block;font-size:14.5px;font-weight:800;line-height:1.35}'
  + '.hl-it span{display:block;font-size:12.5px;color:#5A6478;line-height:1.45;margin-top:2px}'
  + '.hl-cf{background:#fff;border-radius:14px;padding:13px 14px;box-shadow:0 1px 2px rgba(14,35,80,.06),0 8px 18px -8px rgba(14,35,80,.16)}'
  + '.hl-cf .n{font-size:16px;font-weight:900;letter-spacing:-.02em;line-height:1.35}'
  + '.hl-cf .a{font-size:12.5px;color:#5A6478;line-height:1.5;margin-top:3px}'
  + '.hl-cf .d{font-size:12px;color:#5A6478;margin-top:8px;line-height:1.45}'
  + '.hl-cf .d b{color:#C5221F}'
  + '.hl-cf .k{display:flex;gap:8px;margin-top:11px}'
  + '.hl-cf .bk{flex:none;border:0;border-radius:12px;padding:0 14px;font-size:13.5px;font-weight:800;background:#F6F8FC;color:#16346E;cursor:pointer;font-family:inherit}'
  + '.hl-cf .go{flex:1;border:0;border-radius:12px;padding:14px;font-size:15.5px;font-weight:900;color:#1B1405;background:linear-gradient(180deg,#E3C98A,#C9A44C);cursor:pointer;font-family:inherit;box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 6px 14px -6px rgba(143,111,40,.55)}'
  + '.hl-cf .go:active,.hl-it:active,.hl-sr button:active{transform:scale(.98)}'
  + '.hl-ml{text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff}'
  + '@media (prefers-reduced-motion:reduce){.hl-ov,.hl-sh{transition:none}}';

  var mapsP = null;
  function loadMaps(lang){
    if (window.google && google.maps && google.maps.Map) return Promise.resolve(true);
    if (mapsP) return mapsP;
    mapsP = fetch('/api/travel?cfg=1', { cache: 'no-store' }).then(function(r){ return r.json(); }).then(function(cfg){
      if (!cfg || !cfg.ready || !cfg.key) throw new Error('off');
      return new Promise(function(res, rej){
        window.__hhcLocInit = function(){ res(true); };
        var s = document.createElement('script');
        s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(cfg.key) + '&v=weekly&libraries=places&language=' + (lang === 'en' ? 'en' : 'ko') + '&region=MY&loading=async&callback=__hhcLocInit';
        s.async = true; s.onerror = function(){ rej(new Error('off')); };
        document.head.appendChild(s);
      });
    }).catch(function(e){ mapsP = null; throw e; });
    return mapsP;
  }

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
  function r6(n){ return Math.round(n * 1e6) / 1e6; }

  function pick(opt){
    opt = opt || {};
    var L = opt.lang === 'en' ? 'en' : 'ko', t = T[L], cust = opt.who === 'customer';
    if (!document.getElementById('hl-css')){ var st = document.createElement('style'); st.id = 'hl-css'; st.textContent = CSS; document.head.appendChild(st); }
    var ov = document.createElement('div'); ov.className = 'hl-ov';
    ov.innerHTML = '<div class="hl-sh" role="dialog" aria-modal="true">'
      + '<div class="hl-bar"><b>📍 ' + (cust ? t.tC : t.tA) + '</b><button type="button" class="hl-x">' + t.close + '</button></div>'
      + '<div class="hl-sub' + (cust ? ' c' : '') + '">' + (cust ? t.subC : t.subA) + '</div>'
      + '<form class="hl-sr"><input type="search" enterkeyhint="search" autocomplete="off" placeholder="' + esc(t.ph) + '"><button type="submit">' + t.find + '</button></form>'
      + '<div class="hl-mw"><div class="hl-map"></div><div class="hl-tip"></div><div class="hl-msg"></div></div>'
      + '<div class="hl-pn"></div></div>';
    var prevOv = document.body.style.overflow;
    document.body.appendChild(ov); document.body.style.overflow = 'hidden';
    requestAnimationFrame(function(){ ov.classList.add('on'); });
    var q = function(s){ return ov.querySelector(s); };
    var inp = q('.hl-sr input'), tip = q('.hl-tip'), pn = q('.hl-pn'), msg = q('.hl-msg');
    inp.value = opt.query || '';

    var map = null, geocoder = null, mks = [], selMk = null, cands = [], sel = null, seq = 0, done = false, resolveFn;
    var P = new Promise(function(r){ resolveFn = r; });

    function finish(v){
      if (done) return; done = true;
      ov.classList.remove('on');
      setTimeout(function(){ ov.remove(); document.body.style.overflow = prevOv; }, 220);
      document.removeEventListener('keydown', onKey);
      resolveFn(v);
    }
    function onKey(e){ if (e.key === 'Escape') finish(null); }
    document.addEventListener('keydown', onKey);
    q('.hl-x').onclick = function(){ finish(null); };
    ov.addEventListener('click', function(e){ if (e.target === ov) finish(null); });

    function PIN(c, big){
      var w = big ? 36 : 28, h = big ? 48 : 38;
      return { url: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="-12 -34 24 35"><path d="M0 0C-2-7-11-12-11-21A11 11 0 1 1 11-21C11-12 2-7 0 0Z" fill="' + c + '" stroke="#fff" stroke-width="1.6"/><circle cy="-21" r="4.2" fill="#fff"/></svg>'),
        scaledSize: new google.maps.Size(w, h), anchor: new google.maps.Point(w / 2, h), labelOrigin: new google.maps.Point(w / 2, h + 11) };
    }
    function LBL(s, c){ s = String(s || ''); return { text: s.length > 24 ? s.slice(0, 23) + '…' : s, color: c, fontWeight: '800', fontSize: '12px', className: 'hl-ml' }; }

    function setTip(h){ tip.innerHTML = h; tip.style.display = h ? 'block' : 'none'; }
    function clearMks(){ mks.forEach(function(m){ m.setMap(null); }); mks = []; }

    function renderPanel(){
      if (sel){
        pn.innerHTML = '<div class="hl-cf"><div class="n">' + esc(sel.name || t.pin) + '</div>' + (sel.addr ? '<div class="a">' + esc(sel.addr) + '</div>' : '')
          + '<div class="d">✋ ' + t.drag + '</div>'
          + '<div class="k">' + (cands.length > 1 ? '<button type="button" class="bk">' + t.back + '</button>' : '') + '<button type="button" class="go">' + t.ok + '</button></div></div>';
        q('.go').onclick = function(){
          finish({ lat: r6(sel.lat), lng: r6(sel.lng), name: String(sel.name || (sel.addr || '').split(',')[0] || t.pin).slice(0, 120), addr: String(sel.addr || '').slice(0, 300), pid: String(sel.pid || '').slice(0, 300) });
        };
        var bk = q('.bk'); if (bk) bk.onclick = function(){ select(null); fitCands(); };
        return;
      }
      if (cands.length){
        pn.innerHTML = '<div class="hl-lh">' + t.listH(cands.length) + '</div>' + cands.map(function(c, i){
          return '<button type="button" class="hl-it" data-i="' + i + '"><i>' + (i + 1) + '</i><div><b>' + esc(c.name) + '</b><span>' + esc(c.addr) + '</span></div></button>';
        }).join('');
        pn.querySelectorAll('.hl-it').forEach(function(b){ b.onclick = function(){ select(cands[+b.dataset.i], true); }; });
        return;
      }
      pn.innerHTML = '';
    }

    function select(c, zoom){
      sel = c;
      if (selMk){ selMk.setMap(null); selMk = null; }
      mks.forEach(function(m){ m.setVisible(!c); });
      if (c && map){
        selMk = new google.maps.Marker({ map: map, position: { lat: c.lat, lng: c.lng }, icon: PIN('#C5221F', true), draggable: true, zIndex: 50, label: c.name ? LBL(c.name, '#B3261E') : null });
        selMk.addListener('dragend', function(e){
          c.lat = e.latLng.lat(); c.lng = e.latLng.lng();
          geocoder.geocode({ location: { lat: c.lat, lng: c.lng }, language: L }).then(function(g){
            var b = (g.results || [])[0]; if (b && sel === c){ c.addr = b.formatted_address; if (!c.name) c.name = b.formatted_address.split(',')[0]; renderPanel(); }
          }).catch(function(){});
        });
        map.panTo({ lat: c.lat, lng: c.lng }); if (zoom || map.getZoom() < 17) map.setZoom(18);
        setTip(t.drag);
      } else setTip(cands.length ? '' : t.tip0);
      renderPanel();
    }
    function fitCands(){
      if (!map || !cands.length) return;
      if (cands.length === 1){ map.panTo({ lat: cands[0].lat, lng: cands[0].lng }); map.setZoom(16); return; }
      var b = new google.maps.LatLngBounds(); cands.forEach(function(c){ b.extend({ lat: c.lat, lng: c.lng }); });
      map.fitBounds(b, { top: 60, bottom: 30, left: 30, right: 60 });
    }

    function search(){
      var s = inp.value.trim(); if (!s || !map) return;
      var my = ++seq; setTip(t.searching); inp.blur();
      google.maps.importLibrary('places').then(function(lib){
        return lib.Place.searchByText({ textQuery: s, fields: ['id', 'displayName', 'formattedAddress', 'location'],
          locationBias: { center: KL, radius: 50000 }, region: 'my', language: L, maxResultCount: 6 });
      }).then(function(r){
        if (my !== seq) return;
        clearMks(); cands = []; sel = null; if (selMk){ selMk.setMap(null); selMk = null; }
        (r.places || []).forEach(function(p, i, all){
          var c = { pid: p.id, name: String(p.displayName || '').trim() || p.formattedAddress, addr: p.formattedAddress || '', lat: p.location.lat(), lng: p.location.lng() };
          var m = new google.maps.Marker({ map: map, position: { lat: c.lat, lng: c.lng }, icon: PIN('#EA4335'), label: LBL((all.length > 1 ? (i + 1) + '. ' : '') + c.name, '#B3261E'), zIndex: 10 });
          m.addListener('click', function(){ select(c, true); });
          mks.push(m); cands.push(c);
        });
        if (cands.length === 1) select(cands[0], true);
        else { fitCands(); setTip(cands.length ? '' : t.none); renderPanel(); }
      }).catch(function(){ if (my === seq) setTip(t.err); });
    }
    q('.hl-sr').addEventListener('submit', function(e){ e.preventDefault(); search(); });

    loadMaps(L).then(function(){
      if (done) return;
      var init = opt.initial && isFinite(opt.initial.lat) && isFinite(opt.initial.lng) ? opt.initial : null;
      map = new google.maps.Map(q('.hl-map'), { center: init ? { lat: +init.lat, lng: +init.lng } : KL, zoom: init ? 18 : 11,
        disableDefaultUI: true, zoomControl: true, mapTypeControl: true,
        mapTypeControlOptions: { position: google.maps.ControlPosition.LEFT_BOTTOM, style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR, mapTypeIds: ['roadmap', 'hybrid'] },
        zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM }, gestureHandling: 'greedy', clickableIcons: true });
      geocoder = new google.maps.Geocoder();
      map.addListener('click', function(e){
        if (!e.latLng) return;
        var c = { pid: '', name: '', addr: '', lat: e.latLng.lat(), lng: e.latLng.lng() };
        if (e.placeId){
          if (e.stop) e.stop();
          c.pid = e.placeId;
          google.maps.importLibrary('places').then(function(lib){ var p = new lib.Place({ id: e.placeId }); return p.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] }).then(function(){ return p; }); })
            .then(function(p){ if (sel !== c) return; c.name = p.displayName || ''; c.addr = p.formattedAddress || ''; if (p.location){ c.lat = p.location.lat(); c.lng = p.location.lng(); selMk && selMk.setPosition({ lat: c.lat, lng: c.lng }); selMk && selMk.setLabel(LBL(c.name, '#B3261E')); } renderPanel(); }).catch(function(){});
        } else {
          geocoder.geocode({ location: { lat: c.lat, lng: c.lng }, language: L }).then(function(g){
            var b = (g.results || [])[0]; if (b && sel === c){ c.addr = b.formatted_address; renderPanel(); }
          }).catch(function(){});
        }
        select(c, false);
      });
      if (init) select({ pid: init.pid || '', name: init.name || '', addr: init.addr || '', lat: +init.lat, lng: +init.lng }, false);
      else if (inp.value.trim()) search();
      else { setTip(t.tip0); setTimeout(function(){ inp.focus(); }, 250); }
    }).catch(function(){ msg.textContent = t.off; msg.style.display = 'flex'; setTip(''); });
    setTip('');
    return P;
  }

  function navUrl(l){
    if (!l) return '';
    return 'https://www.google.com/maps/dir/?api=1&destination=' + l.lat + ',' + l.lng + (l.pid ? '&destination_place_id=' + encodeURIComponent(l.pid) : '') + '&travelmode=driving&dir_action=navigate';
  }
  function viewUrl(l){
    if (!l) return '';
    return 'https://www.google.com/maps/search/?api=1&query=' + l.lat + ',' + l.lng + (l.pid ? '&query_place_id=' + encodeURIComponent(l.pid) : '');
  }
  window.HHCLoc = { pick: pick, navUrl: navUrl, viewUrl: viewUrl };
})();

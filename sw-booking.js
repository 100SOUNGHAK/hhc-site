const CACHE='hhc-booking-v1';
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/booking-admin.html','/booking.html','/manifest-booking.json'])));
});
self.addEventListener('fetch',e=>{
  e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
});

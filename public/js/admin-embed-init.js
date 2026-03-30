/**
 * Hub iframes load tool pages with ?adminEmbed=1 — hide sidebar and full-bleed content.
 */
(function () {
    'use strict';
    var embed = false;
    try {
        embed = new URLSearchParams(window.location.search).get('adminEmbed') === '1';
    } catch (e) {}
    window.__ADMIN_EMBED__ = embed;
    if (embed) {
        document.documentElement.classList.add('admin-embed');
        var l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = 'css/admin-hub-embed.css';
        document.head.appendChild(l);
    }
})();

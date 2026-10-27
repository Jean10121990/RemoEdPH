/**
 * RemoEdPH Google Analytics (gtag). Load once per page from <head>.
 * Measurement ID: G-ERS58WHW7V
 */
(function (global) {
  'use strict';
  var GA_ID = 'G-ERS58WHW7V';
  if (global.__remoedGtagReady) return;
  global.__remoedGtagReady = true;

  global.dataLayer = global.dataLayer || [];
  function gtag() {
    global.dataLayer.push(arguments);
  }
  global.gtag = gtag;

  var s = global.document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  var first = global.document.getElementsByTagName('script')[0];
  if (first && first.parentNode) first.parentNode.insertBefore(s, first);
  else if (global.document.head) global.document.head.appendChild(s);
  else global.document.documentElement.appendChild(s);

  gtag('js', new Date());
  gtag('config', GA_ID);
})(typeof window !== 'undefined' ? window : this);

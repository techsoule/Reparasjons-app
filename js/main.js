/* ===============================
   FiXiPhone — interactivity
   =============================== */
(function () {
  'use strict';

  /* ---- Mobile nav ---- */
  var navToggle = document.getElementById('navToggle');
  var nav = document.getElementById('nav');

  if (navToggle && nav) {
    navToggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      navToggle.classList.toggle('is-open', open);
      navToggle.setAttribute('aria-expanded', String(open));
      navToggle.setAttribute('aria-label', open ? 'Lukk meny' : 'Åpne meny');
    });

    // Close menu when a link is tapped
    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        nav.classList.remove('is-open');
        navToggle.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ---- Pricing tables ---- */
  var prices = {
    iphone: [
      { name: 'Skjermbytte', desc: 'Bytte av knust glass / display', price: 'fra 990 kr' },
      { name: 'Batteribytte', desc: 'Nytt batteri, full kapasitet', price: 'fra 590 kr' },
      { name: 'Ladeport', desc: 'Rens eller bytte av ladekontakt', price: 'fra 690 kr' },
      { name: 'Bakglass', desc: 'Bytte av sprukket bakside', price: 'fra 790 kr' },
      { name: 'Kamera', desc: 'Front- eller bakkamera', price: 'fra 690 kr' },
      { name: 'Vannskade – rens', desc: 'Diagnose og rens av kretskort', price: 'fra 890 kr' }
    ],
    samsung: [
      { name: 'Skjermbytte', desc: 'Original AMOLED-display', price: 'fra 1290 kr' },
      { name: 'Batteribytte', desc: 'Nytt batteri, full kapasitet', price: 'fra 690 kr' },
      { name: 'Ladeport', desc: 'Rens eller bytte av ladekontakt', price: 'fra 690 kr' },
      { name: 'Bakglass', desc: 'Bytte av sprukket bakside', price: 'fra 890 kr' },
      { name: 'Kamera', desc: 'Front- eller bakkamera', price: 'fra 790 kr' },
      { name: 'Vannskade – rens', desc: 'Diagnose og rens av kretskort', price: 'fra 890 kr' }
    ],
    ipad: [
      { name: 'Skjermbytte', desc: 'Glass / digitizer eller LCD', price: 'fra 1490 kr' },
      { name: 'Batteribytte', desc: 'Nytt batteri, full kapasitet', price: 'fra 990 kr' },
      { name: 'Ladeport', desc: 'Rens eller bytte av ladekontakt', price: 'fra 890 kr' },
      { name: 'Knapper', desc: 'Home- eller volumknapp', price: 'fra 690 kr' },
      { name: 'Vannskade – rens', desc: 'Diagnose og rens av kretskort', price: 'fra 990 kr' }
    ]
  };

  var priceTable = document.getElementById('priceTable');
  var priceTabs = document.querySelectorAll('.price-tab');

  function renderPrices(brand) {
    if (!priceTable) return;
    var rows = prices[brand] || [];
    priceTable.innerHTML = rows.map(function (r, i) {
      return (
        '<div class="price-row" style="animation-delay:' + (i * 40) + 'ms">' +
          '<div><span class="pr-name">' + r.name + '</span>' +
          '<span class="pr-desc">' + r.desc + '</span></div>' +
          '<div class="pr-price">' + r.price + '<small>inkl. mva</small></div>' +
        '</div>'
      );
    }).join('');
  }

  priceTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      priceTabs.forEach(function (t) {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      renderPrices(tab.getAttribute('data-brand'));
    });
  });

  renderPrices('iphone');

  /* ---- Booking form (client-side validation + mailto fallback) ---- */
  var form = document.getElementById('bookingForm');
  var note = document.getElementById('formNote');

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var valid = true;

      ['name', 'email', 'device', 'service'].forEach(function (id) {
        var field = document.getElementById(id);
        if (!field) return;
        var empty = !field.value.trim();
        var badEmail = id === 'email' && field.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value);
        if (empty || badEmail) {
          field.classList.add('invalid');
          valid = false;
        } else {
          field.classList.remove('invalid');
        }
      });

      if (!valid) {
        note.textContent = 'Fyll ut de påkrevde feltene, så sender vi forespørselen.';
        note.className = 'form-note err';
        return;
      }

      // Build a prefilled email as a no-backend fallback.
      var data = {
        Navn: form.name.value.trim(),
        Epost: form.email.value.trim(),
        Telefon: form.phone.value.trim() || '–',
        Enhet: form.device.value.trim(),
        Reparasjon: form.service.value,
        Melding: form.message.value.trim() || '–'
      };
      var body = Object.keys(data).map(function (k) { return k + ': ' + data[k]; }).join('\n');
      var subject = 'Reparasjonsforespørsel – ' + data.Enhet + ' (' + data.Reparasjon + ')';
      var mailto = 'mailto:kontakt@fixiphone.no?subject=' +
        encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);

      note.textContent = 'Takk! Vi åpner e-postklienten din slik at du kan sende forespørselen.';
      note.className = 'form-note ok';
      window.location.href = mailto;
      form.reset();
    });

    // Clear invalid state as the user types
    form.querySelectorAll('input, select, textarea').forEach(function (el) {
      el.addEventListener('input', function () { el.classList.remove('invalid'); });
    });
  }

  /* ---- Footer year ---- */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---- Reveal on scroll ---- */
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'none';
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    document.querySelectorAll('.card, .step, .review, .faq-item').forEach(function (el) {
      el.style.opacity = '0';
      el.style.transform = 'translateY(16px)';
      el.style.transition = 'opacity .5s ease, transform .5s ease';
      observer.observe(el);
    });
  }
})();

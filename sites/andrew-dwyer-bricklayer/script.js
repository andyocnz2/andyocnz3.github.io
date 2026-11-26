document.addEventListener('DOMContentLoaded', () => {
  // Mobile menu toggle
  const menuToggle = document.getElementById('menu-toggle');
  const mobileNav = document.getElementById('mobile-nav');

  if (menuToggle && mobileNav) {
    menuToggle.addEventListener('click', () => {
      const isExpanded = menuToggle.getAttribute('aria-expanded') === 'true';
      menuToggle.setAttribute('aria-expanded', String(!isExpanded));
      mobileNav.hidden = isExpanded;
    });

    mobileNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        menuToggle.setAttribute('aria-expanded', 'false');
        mobileNav.hidden = true;
      });
    });
  }

  // Interactive Marlborough Service Area selector
  const areaChips = document.querySelectorAll('.area-chip');
  const areaTitle = document.getElementById('area-title');
  const areaDesc = document.getElementById('area-desc');

  areaChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      areaChips.forEach((item) => item.classList.remove('is-active'));
      chip.classList.add('is-active');
      if (areaTitle && areaDesc) {
        areaTitle.textContent = chip.dataset.area || '';
        areaDesc.textContent = chip.dataset.desc || '';
      }
    });
  });

  // Client-side Quick Ballpark Estimator (no server required)
  // Adjust these NZD guide rates anytime to match Andrew's pricing.
  const ESTIMATE_CONFIG = {
    areaJobs: {
      'block-wall': {
        label: 'Concrete Block Wall / Fence',
        supplyPerSqm: [220, 280],
        labourPerSqm: [130, 170],
        footingPerM: [140, 190],
      },
      'brick-veneer': {
        label: 'Brick Wall / New Build Veneer',
        supplyPerSqm: [210, 270],
        labourPerSqm: [120, 160],
        footingPerM: [130, 180],
      },
      'stone-wall': {
        label: 'Natural Stone Wall',
        supplyPerSqm: [360, 480],
        labourPerSqm: [220, 300],
        footingPerM: [150, 210],
      },
    },
    tieredJobs: {
      letterbox: {
        label: 'Custom Brick Letterbox',
        supportsFootings: true,
        footingFlat: [250, 380],
        tiers: [
          { value: 'standard', label: 'Standard Brick Pillar Letterbox', supply: [850, 1200], labour: [550, 780] },
          { value: 'wide', label: 'Wide / Double Feature Letterbox', supply: [1350, 1900], labour: [850, 1200] },
        ],
      },
      fireplace: {
        label: 'Chimney / Outdoor Fireplace',
        supportsFootings: true,
        footingFlat: [600, 950],
        tiers: [
          { value: 'standard', label: 'Standard Outdoor Brick Fireplace', supply: [4200, 5800], labour: [2600, 3600] },
          { value: 'large', label: 'Large Feature Brick / Stone Chimney', supply: [6500, 9000], labour: [4000, 5600] },
        ],
      },
      repair: {
        label: 'Earthquake Repair / Repointing',
        supportsFootings: false,
        tiers: [
          { value: 'small', label: 'Small Patch / Mortar Repointing', supply: [650, 1100], labour: [550, 950] },
          { value: 'medium', label: 'Medium Wall / Chimney Stabilisation', supply: [1600, 2800], labour: [1300, 2300] },
          { value: 'major', label: 'Major Rebuild / Structural Masonry', supply: [3500, 6000], labour: [2800, 4800] },
        ],
      },
    },
    zones: {
      local: { label: 'Renwick / Blenheim', extra: [0, 0] },
      mid: { label: 'Picton / Havelock / Rai Valley / Seddon', extra: [150, 250] },
      far: { label: 'Marlborough Sounds / Kaikoura', extra: [300, 500] },
    },
  };

  const typeEl = document.getElementById('est-type');
  const dimensionsRow = document.getElementById('est-dimensions-row');
  const lengthEl = document.getElementById('est-length');
  const heightEl = document.getElementById('est-height');
  const scopeRow = document.getElementById('est-scope-row');
  const scopeEl = document.getElementById('est-scope');
  const supplyEl = document.getElementById('est-supply');
  const zoneEl = document.getElementById('est-zone');
  const footingsWrap = document.getElementById('est-footings-wrap');
  const footingsEl = document.getElementById('est-footings');
  const priceEl = document.getElementById('est-price');
  const breakdownEl = document.getElementById('est-breakdown');
  const emailLinkEl = document.getElementById('est-email-link');
  const copyBtnEl = document.getElementById('est-copy-btn');

  const nzd = new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
    maximumFractionDigits: 0,
  });

  const roundTo50 = (val) => Math.max(50, Math.round(val / 50) * 50);
  let latestSummaryText = '';

  function populateScopeOptions(jobKey) {
    const tiered = ESTIMATE_CONFIG.tieredJobs[jobKey];
    if (!tiered || !scopeEl) return;
    scopeEl.innerHTML = '';
    tiered.tiers.forEach((tier) => {
      const opt = document.createElement('option');
      opt.value = tier.value;
      opt.textContent = tier.label;
      scopeEl.appendChild(opt);
    });
  }

  function updateEstimatorUI() {
    if (!typeEl) return;
    const jobKey = typeEl.value;
    const isAreaJob = Boolean(ESTIMATE_CONFIG.areaJobs[jobKey]);

    if (dimensionsRow) dimensionsRow.hidden = !isAreaJob;
    if (scopeRow) scopeRow.hidden = isAreaJob;

    if (!isAreaJob) {
      populateScopeOptions(jobKey);
      const showFootings = ESTIMATE_CONFIG.tieredJobs[jobKey].supportsFootings;
      if (footingsWrap) footingsWrap.hidden = !showFootings;
    } else if (footingsWrap) {
      footingsWrap.hidden = false;
    }

    calculateEstimate();
  }

  function calculateEstimate() {
    if (!typeEl || !priceEl || !breakdownEl) return;

    const jobKey = typeEl.value;
    const isSupply = supplyEl && supplyEl.value === 'supply';
    const zoneKey = zoneEl ? zoneEl.value : 'local';
    const zone = ESTIMATE_CONFIG.zones[zoneKey] || ESTIMATE_CONFIG.zones.local;
    const includeFootings = footingsEl && footingsEl.checked;

    let min = 0;
    let max = 0;
    let scopeSummary = '';
    let footingNote = '';

    if (ESTIMATE_CONFIG.areaJobs[jobKey]) {
      const cfg = ESTIMATE_CONFIG.areaJobs[jobKey];
      const length = Math.min(200, Math.max(1, parseFloat(lengthEl.value) || 1));
      const height = Math.min(6, Math.max(0.4, parseFloat(heightEl.value) || 0.4));
      const sqm = length * height;
      const rate = isSupply ? cfg.supplyPerSqm : cfg.labourPerSqm;

      min = sqm * rate[0];
      max = sqm * rate[1];

      if (includeFootings) {
        min += length * cfg.footingPerM[0];
        max += length * cfg.footingPerM[1];
        footingNote = 'Incl. footings allowance';
      } else {
        footingNote = 'Excl. footings';
      }

      scopeSummary = `${cfg.label} (${length}m × ${height}m ≈ ${sqm.toFixed(1)} m²)`;
    } else {
      const cfg = ESTIMATE_CONFIG.tieredJobs[jobKey];
      const selectedTier = cfg.tiers.find((t) => t.value === scopeEl.value) || cfg.tiers[0];
      const tierRate = isSupply ? selectedTier.supply : selectedTier.labour;

      min = tierRate[0];
      max = tierRate[1];

      if (cfg.supportsFootings && includeFootings) {
        min += cfg.footingFlat[0];
        max += cfg.footingFlat[1];
        footingNote = 'Incl. base prep/footings';
      } else if (cfg.supportsFootings) {
        footingNote = 'Excl. base prep/footings';
      }

      scopeSummary = `${cfg.label} — ${selectedTier.label}`;
    }

    min = roundTo50(min + zone.extra[0]);
    max = roundTo50(max + zone.extra[1]);

    const rangeText = `${nzd.format(min)} – ${nzd.format(max)}`;
    const supplyText = isSupply ? 'Supply & Lay' : 'Labour & Mortar Only';
    const parts = [scopeSummary, supplyText, zone.label, footingNote].filter(Boolean);

    priceEl.textContent = rangeText;
    breakdownEl.textContent = parts.join(' • ');

    latestSummaryText = [
      'Hi Andrew,',
      '',
      'I used the ballpark estimator on your website and would like to arrange a free on-site quote:',
      '',
      `Project: ${scopeSummary}`,
      `Materials: ${supplyText}`,
      `Location: ${zone.label}`,
      footingNote ? `Footings/Prep: ${footingNote}` : null,
      `Indicative Estimate Shown: ${rangeText} (excl. GST)`,
      '',
      'Best contact number / details:',
    ]
      .filter((line) => line !== null)
      .join('\n');

    if (emailLinkEl) {
      const subject = `Quote Request: ${scopeSummary} (${zone.label})`;
      emailLinkEl.href = `mailto:andrewdwyer20@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(latestSummaryText)}`;
    }
  }

  if (typeEl) {
    typeEl.addEventListener('change', updateEstimatorUI);
    [lengthEl, heightEl, scopeEl, supplyEl, zoneEl, footingsEl].forEach((el) => {
      if (el) {
        el.addEventListener('input', calculateEstimate);
        el.addEventListener('change', calculateEstimate);
      }
    });
    updateEstimatorUI();
  }

  function bindCopyButton(button, getText, defaultLabel, fallbackLabel) {
    if (!button) return;
    const labelTarget = button.querySelector('span') || button;
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(getText());
        labelTarget.textContent = 'Copied!';
        setTimeout(() => {
          labelTarget.textContent = defaultLabel;
        }, 2000);
      } catch {
        labelTarget.textContent = fallbackLabel;
      }
    });
  }

  bindCopyButton(copyBtnEl, () => latestSummaryText, 'Copy Summary', 'Call 027 220 4556');
  bindCopyButton(
    document.getElementById('copy-email-btn'),
    () => 'andrewdwyer20@gmail.com',
    'Copy',
    'andrewdwyer20@gmail.com'
  );

  // Keep footer year current
  const yearEl = document.getElementById('year');
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }
});

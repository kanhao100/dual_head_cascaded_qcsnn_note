/* Renumber the section badges in document order (new sections were inserted between the original ones). */
(function () { HW.$$('section.step').forEach((s, i) => { const n = s.querySelector('.step-no'); if (n) n.textContent = String(i + 1).padStart(2, '0'); }); })();

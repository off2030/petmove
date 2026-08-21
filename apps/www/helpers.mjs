export const q = (title, ...paras) =>
  `<p><b><strong style="white-space: pre-wrap;">${title}</strong></b></p>` +
  paras.map((p) => `<p><span style="white-space: pre-wrap;">${p}</span></p>`).join('')
export const B = (t) => `<b><strong style="white-space: pre-wrap;">${t}</strong></b>`
export const more = (...faqs) =>
  `<details class="more"><summary><span>더 자세한 설명</span><i class="ti ti-chevron-down"></i></summary><div class="more-body">${faqs.join('<br/>')}</div></details>`
export const ul = (...items) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`

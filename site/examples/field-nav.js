const fields = [
  ['index', '../index.html#examples', 'Field index'],
  ['dunes', './dunes.html', 'Dunes'],
  ['swell', './swell.html', 'Swell'],
  ['wind', './wind.html', 'Wind'],
  ['serpent', './serpent.html', 'Serpent'],
  ['fieldwork', '../fieldwork/', 'Flooded Basin'],
  ['parity', './parity.html', 'Assay'],
];

function currentField() {
  const demo = document.body.dataset.demo;
  if (demo) return demo;
  return location.pathname.endsWith('/parity.html') ? 'parity' : null;
}

export function mountFieldNav() {
  const header = document.querySelector('header.shell');
  if (!header || document.querySelector('.field-switcher')) return;

  const nav = document.createElement('nav');
  nav.className = 'field-switcher shell';
  nav.setAttribute('aria-label', 'Live fields');

  const label = document.createElement('span');
  label.textContent = 'Live fields';
  nav.append(label);

  const current = currentField();
  for (const [id, href, text] of fields) {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = text;
    link.dataset.fieldRoute = id;
    if (id === current) link.setAttribute('aria-current', 'page');
    nav.append(link);
  }

  header.insertAdjacentElement('afterend', nav);
}

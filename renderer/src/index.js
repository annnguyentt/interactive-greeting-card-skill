// The page's entry: mounts the cards from the data the build script wrote into the page.
import { mount } from './page.js';

function run() {
  const data = JSON.parse(document.getElementById('card-data').textContent);
  mount(document.querySelector('.gc'), data);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
else run();

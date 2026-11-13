/** Theme, Add Page, and AI page generation for the visual editor */
import { API } from './api.js';

const THEME_ROLES = [
  { key: 'primary', picker: 'themePrimary', hex: 'themePrimaryHex' },
  { key: 'secondary', picker: 'themeSecondary', hex: 'themeSecondaryHex' },
  { key: 'accent', picker: 'themeAccent', hex: 'themeAccentHex' },
  { key: 'background', picker: 'themeBackground', hex: 'themeBackgroundHex' },
  { key: 'text', picker: 'themeText', hex: 'themeTextHex' },
];

function normalizeHex(value) {
  if (!value) return '';
  let hex = String(value).trim().toLowerCase();
  if (!hex.startsWith('#')) hex = `#${hex}`;
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex : '';
}

function hexToRgb(hex) {
  const h = normalizeHex(hex).slice(1);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function channelLuma(value) {
  const s = value / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * channelLuma(r)) + (0.7152 * channelLuma(g)) + (0.0722 * channelLuma(b));
}

function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

function mixHex(from, to, amount) {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const mix = (x, y) => Math.round(x + ((y - x) * amount));
  return `#${[mix(a.r, b.r), mix(a.g, b.g), mix(a.b, b.b)]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')}`;
}

function withContrast(color, background, min = 4.5) {
  const bg = normalizeHex(background) || '#ffffff';
  const fg = normalizeHex(color) || (relativeLuminance(bg) > 0.4 ? '#111111' : '#ffffff');
  if (contrastRatio(fg, bg) >= min) return fg;
  const target = relativeLuminance(bg) > 0.4 ? '#111111' : '#ffffff';
  for (let step = 1; step <= 8; step += 1) {
    const next = mixHex(fg, target, step / 8);
    if (contrastRatio(next, bg) >= min) return next;
  }
  return contrastRatio('#111111', bg) >= contrastRatio('#ffffff', bg) ? '#111111' : '#ffffff';
}

export function initSiteTools({ folder, previewFrame, pageSelect, loadPages, loadPreview, showSaveToast }) {
  let themeBaseline = null;
  let themeModal;

  function themeBaselineFrom(theme) {
    return {
      primary: normalizeHex(theme?.primary) || '#513f29',
      secondary: normalizeHex(theme?.secondary) || '#ff6900',
      accent: normalizeHex(theme?.accent) || '#203d8d',
      background: normalizeHex(theme?.background) || '#e8e8e8',
      text: normalizeHex(theme?.text) || '#333333',
    };
  }
  let addPageModal;
  let aiPageModal;
  let currentTheme = {};
  let activeRole = 'primary';
  let themeUiBound = false;

  function setStatus(el, msg, isError = false) {
    if (!el) return;
    el.textContent = msg;
    el.className = isError ? 'small text-danger mt-2' : 'small text-muted mt-2';
  }

  async function parseJsonResponse(res) {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      if (res.status === 404 || text === 'Not found') {
        throw new Error('API server needs a restart. Run: npm run api');
      }
      throw new Error(text || `Request failed (${res.status})`);
    }
  }

  function rolePicker(key) {
    return document.getElementById(THEME_ROLES.find((role) => role.key === key).picker);
  }

  function roleHex(key) {
    return document.getElementById(THEME_ROLES.find((role) => role.key === key).hex);
  }

  function readThemeForm() {
    return {
      primary: normalizeHex(rolePicker('primary').value) || '#1d4ed8',
      secondary: normalizeHex(rolePicker('secondary').value) || '#0f172a',
      accent: normalizeHex(rolePicker('accent').value) || '#f59e0b',
      background: normalizeHex(rolePicker('background').value) || '#ffffff',
      text: normalizeHex(rolePicker('text').value) || '#111827',
    };
  }

  function setRoleColor(key, color, { syncHex = true } = {}) {
    const hex = normalizeHex(color);
    if (!hex) return;
    const picker = rolePicker(key);
    const hexInput = roleHex(key);
    picker.value = hex;
    if (syncHex) hexInput.value = hex.toUpperCase();
  }

  function setActiveRole(key) {
    activeRole = key;
    document.querySelectorAll('.theme-role').forEach((el) => {
      el.classList.toggle('active', el.dataset.role === key);
    });
  }

  function updateThemePreview() {
    const theme = readThemeForm();
    const text = withContrast(theme.text, theme.background);
    const heading = withContrast(theme.primary, theme.background);
    const accent = withContrast(theme.accent, theme.background);
    const onPrimary = withContrast('#ffffff', theme.primary);
    const onSecondary = withContrast('#ffffff', theme.secondary);
    const preview = document.getElementById('themePreview');
    if (!preview) return;
    preview.style.setProperty('--theme-preview-bg', theme.background);
    preview.style.setProperty('--theme-preview-text', text);
    preview.style.setProperty('--theme-preview-heading', heading);
    preview.style.setProperty('--theme-preview-accent', accent);
    preview.style.setProperty('--theme-preview-primary', theme.primary);
    preview.style.setProperty('--theme-preview-on-primary', onPrimary);
    preview.style.setProperty('--theme-preview-secondary', theme.secondary);
    preview.style.setProperty('--theme-preview-on-secondary', onSecondary);

    const note = document.getElementById('themeContrast');
    if (!note) return;
    const ratio = contrastRatio(theme.text, theme.background);
    if (ratio >= 4.5) {
      note.className = 'theme-contrast-note small mt-3 is-ok';
      note.textContent = `Text contrast ${ratio.toFixed(1)}:1 — WCAG AA ready.`;
    } else {
      note.className = 'theme-contrast-note small mt-3 is-warn';
      note.textContent = `Text contrast ${ratio.toFixed(1)}:1 is too low. Apply Theme will auto-fix body text for readability.`;
    }
  }

  function fillThemeForm(theme) {
    setRoleColor('primary', theme.primary || '#1d4ed8');
    setRoleColor('secondary', theme.secondary || '#0f172a');
    setRoleColor('accent', theme.accent || '#f59e0b');
    setRoleColor('background', theme.background || '#ffffff');
    setRoleColor('text', theme.text || '#111827');

    const swatches = document.getElementById('themePalette');
    if (swatches) {
      const palette = theme.palette?.length
        ? theme.palette
        : [theme.primary, theme.secondary, theme.accent, theme.background, theme.text].filter(Boolean);
      swatches.innerHTML = palette.map((c) => {
        const color = normalizeHex(c);
        if (!color) return '';
        return `<button type="button" class="theme-swatch" data-color="${color}" title="${color.toUpperCase()}" style="background:${color}" aria-label="Use ${color}"></button>`;
      }).join('');
      swatches.querySelectorAll('.theme-swatch').forEach((btn) => {
        btn.addEventListener('click', () => {
          setRoleColor(activeRole, btn.dataset.color);
          updateThemePreview();
          setStatus(document.getElementById('themeStatus'), `Applied ${btn.dataset.color.toUpperCase()} to ${activeRole}.`);
        });
      });
    }

    setActiveRole(activeRole);
    updateThemePreview();
  }

  function bindThemeUi() {
    if (themeUiBound) return;
    themeUiBound = true;

    document.querySelectorAll('.theme-role').forEach((roleEl) => {
      roleEl.addEventListener('click', (e) => {
        if (e.target.closest('input')) return;
        setActiveRole(roleEl.dataset.role);
      });
    });

    THEME_ROLES.forEach(({ key, picker, hex }) => {
      const pickerEl = document.getElementById(picker);
      const hexEl = document.getElementById(hex);
      pickerEl?.addEventListener('input', () => {
        setActiveRole(key);
        hexEl.value = pickerEl.value.toUpperCase();
        updateThemePreview();
      });
      pickerEl?.addEventListener('focus', () => setActiveRole(key));
      hexEl?.addEventListener('focus', () => setActiveRole(key));
      hexEl?.addEventListener('input', () => {
        const next = normalizeHex(hexEl.value);
        if (!next) return;
        pickerEl.value = next;
        updateThemePreview();
      });
      hexEl?.addEventListener('blur', () => {
        const next = normalizeHex(hexEl.value) || pickerEl.value;
        hexEl.value = next.toUpperCase();
        pickerEl.value = next;
        updateThemePreview();
      });
      hexEl?.addEventListener('click', (e) => e.stopPropagation());
      pickerEl?.addEventListener('click', (e) => e.stopPropagation());
    });
  }

  async function openThemeModal() {
    try {
      bindThemeUi();
      const res = await fetch(API.theme(folder));
      const data = await parseJsonResponse(res);
      if (!data.success) throw new Error(data.error || 'Failed to load theme');
      currentTheme = data.theme;
      const opened = themeBaselineFrom(data.theme);
      themeBaseline = opened;
      fillThemeForm({ ...data.theme, ...opened });
      setStatus(document.getElementById('themeStatus'), '');
      themeModal.show();
    } catch (err) {
      alert(err.message);
    }
  }

  async function applyTheme() {
    const btn = document.getElementById('applyThemeBtn');
    const status = document.getElementById('themeStatus');
    btn.disabled = true;
    setStatus(status, 'Applying theme across the whole site...');

    const raw = readThemeForm();
    const theme = {};
    for (const key of ['primary', 'secondary', 'accent', 'background', 'text']) {
      const next = normalizeHex(raw[key]);
      const previous = themeBaseline?.[key];
      if (next && next !== previous) theme[key] = next;
    }
    if (!Object.keys(theme).length) {
      setStatus(status, 'Choose a new color. Nothing else on the site will change.');
      btn.disabled = false;
      return;
    }

    try {
      const res = await fetch(API.themePost, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder, theme }),
      });
      const data = await parseJsonResponse(res);
      if (!data.success) throw new Error(data.error || 'Theme apply failed');

      currentTheme = data.theme;
      themeModal.hide();
      loadPreview(pageSelect.value);
      showSaveToast?.('Theme applied across the site');
    } catch (err) {
      setStatus(status, err.message, true);
    } finally {
      btn.disabled = false;
    }
  }

  async function createPage() {
    const btn = document.getElementById('createPageBtn');
    const status = document.getElementById('addPageStatus');
    const pageName = document.getElementById('newPageName').value.trim();
    const title = document.getElementById('newPageTitle').value.trim();
    const template = document.getElementById('newPageTemplate').value;

    if (!pageName) {
      setStatus(status, 'Page name is required.', true);
      return;
    }

    btn.disabled = true;
    setStatus(status, 'Creating page...');

    try {
      const res = await fetch(API.createPage, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder, pageName, title, template }),
      });
      const data = await parseJsonResponse(res);
      if (!data.success) throw new Error(data.error || 'Failed to create page');

      await loadPages();
      pageSelect.value = data.page.file;
      loadPreview(data.page.file);
      addPageModal.hide();
      document.getElementById('newPageName').value = '';
      document.getElementById('newPageTitle').value = '';
      setStatus(status, '');
    } catch (err) {
      setStatus(status, err.message, true);
    } finally {
      btn.disabled = false;
    }
  }

  const DEFAULT_PAGE_TEMPLATE = `I need to add a new page named **{{PAGE_NAME}}** for **{{SERVICE_NAME}}**.

Keep the existing cloned project's structure unchanged and follow the same file organization, coding patterns, framework conventions, and asset structure already used by the project.

Before creating the page, analyze the existing cloned project and identify:

- Existing page structure
- Common section order
- Reusable components
- Header and navigation
- Footer
- Buttons and CTA patterns
- Cards and content blocks
- Forms
- Containers and grid system
- Typography
- Color palette
- Spacing system
- Border radius
- Shadows
- Icons
- Images and visual treatment
- Responsive behavior
- Hover states
- Animations and interactions
- Theme configuration
- CSS variables and design tokens
- Existing global styles
- Existing JavaScript patterns
- Existing asset organization

The cloned project is the source of truth for how the new page should look and behave.

## MAIN RULE

**USER INPUT = WHAT PAGE TO CREATE**

**CLONED PROJECT = HOW THE PAGE SHOULD LOOK**

The new page must feel like it was originally designed and developed as part of the existing website.

Do not introduce a new theme, unrelated design style, different visual language, random colors, new typography system, or inconsistent component styling.

---

## FILE AND PROJECT STRUCTURE

Follow the existing project's file structure exactly.

Do not assume specific folders unless they already exist in the cloned project.

Before adding code, inspect how the existing project organizes:

- Page files
- CSS files
- JavaScript files
- Images
- Components
- Includes
- Templates
- Layouts
- Shared assets

Add new code and assets to the same locations and files already used by similar existing pages.

If the project uses a shared stylesheet, add styles there only when appropriate.

If the project uses page-specific stylesheets, follow that existing pattern.

If the project uses shared JavaScript files, add behavior there when appropriate.

If the project uses components, partials, includes, templates, or layouts, reuse them.

Do not create unnecessary folders or duplicate shared files.

---

## REUSE EXISTING UI EXACTLY

Before creating any new UI element, search the cloned project for an existing equivalent.

Reuse existing components wherever possible, including:

- Header
- Navigation
- Hero patterns
- Buttons
- CTA bars
- Phone/contact bars
- Chat buttons
- Cards
- Feature grids
- Testimonials
- Logo sections
- Forms
- FAQ components
- Accordions
- Tabs
- Sliders
- Footer
- Shared containers
- Section wrappers
- Decorative elements

If a component already exists, reuse its exact:

- HTML structure
- CSS classes
- JavaScript behavior
- Dimensions
- Padding
- Spacing
- Colors
- Typography
- Icons
- Border radius
- Borders
- Shadows
- Hover states
- Responsive behavior

Do not visually approximate an existing shared component.

Do not rebuild it from memory.

Do not replace it with a generic version.

**EXISTING COMPONENT > NEWLY GENERATED COMPONENT**

---

## PAGE STRUCTURE

The new page should follow the structure and visual language of existing pages, but the content should be specifically written for **{{SERVICE_NAME}}**.

Do not blindly copy one page and only replace the text.

Instead:

1. Analyze multiple existing pages.
2. Identify the most relevant layout and section patterns.
3. Reuse those patterns intelligently.
4. Build the best page structure for **{{SERVICE_NAME}}**.

Possible sections may include:

- Hero section
- Service overview
- Benefits
- Features or capabilities
- Types of services
- Process or how it works
- Use cases
- Why choose us
- Existing testimonials or trust elements
- FAQs
- Strong final CTA

Do not force every section into every page.

Choose sections based on:

- The requested service
- Existing page patterns
- User intent
- Content needs
- Conversion flow

---

## CONTENT REQUIREMENTS

Write professional, natural, engaging, service-specific content for **{{SERVICE_NAME}}**.

Do not use:

- Lorem Ipsum
- Placeholder text
- Repetitive AI-style content
- Empty marketing phrases
- Generic headings unrelated to the service

Make the page content specific to **{{SERVICE_NAME}}**.

Use clear:

- Headlines
- Supporting copy
- Benefits
- Service descriptions
- CTA text
- FAQs

Preserve existing brand/company information already present in the cloned project.

Do not invent unsupported:

- Testimonials
- Reviews
- Client names
- Statistics
- Awards
- Certifications
- Partnerships
- Ratings
- Business claims

Only reuse those items if they already exist in the project.

---

## THEME AND DESIGN

Use the existing cloned project's theme as the source of truth.

Maintain the same:

- Color palette
- Typography
- Header
- Navigation
- Footer
- Buttons
- CTA styles
- Containers
- Layout proportions
- Spacing
- Section styling
- Cards
- Borders
- Border radius
- Shadows
- Icon style
- Image treatment
- Responsive patterns
- Hover effects
- Animations
- Overall visual identity

If the project contains:

- CSS variables
- Theme tokens
- Tailwind configuration
- Theme providers
- Utility classes
- Shared style constants

reuse those instead of hardcoding new values.

Do not redesign the website.

Do not change the existing brand identity.

Do not create a standalone landing-page theme.

---

## IMAGES

Use professional, high-quality images relevant to **{{SERVICE_NAME}}** when images are appropriate.

Follow the cloned project's existing image style and conventions.

Place new images in the same image or asset location used by the existing project.

Use existing:

- Image sizes
- Aspect ratios
- Border radius
- Cropping style
- Image containers
- Overlay treatments
- Lazy-loading conventions

Do not add visually inconsistent stock imagery.

---

## RESPONSIVE DESIGN

The new page must be fully responsive.

Follow the existing project's responsive behavior for:

- Desktop
- Laptop
- Tablet
- Mobile

Match existing breakpoints and mobile layout patterns.

Ensure:

- Text remains readable
- Buttons fit correctly
- Grids collapse appropriately
- Images scale correctly
- Shared CTA bars behave exactly like existing pages
- No horizontal overflow occurs
- Spacing remains consistent

Do not invent a different responsive system.

---

## TECHNICAL REQUIREMENTS

Generate production-quality code.

Keep the existing:

- Framework
- Technology stack
- Routing system
- Folder structure
- Naming conventions
- Component architecture
- Styling approach
- JavaScript approach
- Installed dependencies

Do not migrate technologies.

Do not add unnecessary packages.

Do not break existing pages.

Do not unnecessarily modify global styles.

Do not change shared components unless required.

If modifying a shared component is necessary, ensure the change does not negatively affect existing pages.

Maintain:

- Semantic HTML
- Accessibility
- Maintainable code
- Reusability
- Performance
- Existing project conventions

---

## FINAL VISUAL VALIDATION

Before considering the page complete, compare it with existing pages in the cloned project.

Verify:

- Header matches
- Footer matches
- Typography matches
- Colors match
- Buttons match
- CTA bars match
- Icons match
- Container widths match
- Section spacing matches
- Cards match
- Border radius matches
- Shadows match
- Responsive behavior matches
- Mobile layout matches
- Overall visual identity matches

If an existing shared component looks different on the new page, fix it by reusing the original implementation.

The finished page should look like it was created by the same designers and developers who built the original cloned website.

---

## PAGE LINK / NAVIGATION INTEGRATION

The new page must also be integrated into the existing website navigation.

Requested link placement:

**{{LINK_PLACEMENT}}**

Before adding the link, analyze how the cloned project currently handles navigation and page links.

Inspect:

- Main header navigation
- Dropdown menus
- Services menus
- Mega menus
- Mobile navigation
- Sidebar navigation, if present
- Footer navigation
- Service lists
- Internal page links
- Existing routing/link conventions

Do not create a new navigation system.

Reuse the exact existing navigation markup, classes, styling, icons, JavaScript behavior, and responsive behavior.

The link text should normally use:

**{{SERVICE_NAME}}**

and should point to:

**{{PAGE_NAME}}**

unless the cloned project uses a routing system that requires a different URL format.

### Link Placement Rules

If \`{{LINK_PLACEMENT}}\` is provided, place the new page link exactly in that requested area while following the existing project's menu structure.

Examples:

- Main Navigation
- Services Dropdown
- Mega Menu
- Footer Services
- Sidebar
- Header + Footer
- Services Dropdown + Footer

Do not arbitrarily place the link elsewhere.

If the requested location contains an existing list of services, insert the new service in the most logical position without changing the styling or structure of the menu.

### If Link Placement Is Not Provided

If \`{{LINK_PLACEMENT}}\` is empty, inspect the cloned project and determine the most appropriate existing navigation location.

Use this priority:

1. Existing Services dropdown/menu
2. Existing services mega menu
3. Existing service-related navigation area
4. Footer services list
5. Main navigation only if the site's existing structure uses direct service links

Do not add the page to every menu automatically.

Use the site's existing navigation patterns as the source of truth.

### Exact Navigation Reuse

When adding the link:

- Reuse the existing \`<a>\` markup
- Reuse existing list/menu structure
- Reuse existing CSS classes
- Reuse dropdown classes
- Reuse active-state behavior
- Reuse hover behavior
- Reuse mobile menu behavior
- Reuse existing icons if menu items use icons
- Preserve accessibility attributes
- Preserve ARIA attributes
- Preserve existing JavaScript interactions

Do not recreate the menu.

Do not replace the navigation component.

Do not change existing menu styling.

Do not break dropdown or mobile navigation behavior.

### Internal Linking

Where appropriate and consistent with existing pages, add internal links to the new page from related existing service sections.

Only add these links when the cloned project already uses similar cross-linking patterns.

Do not modify unrelated pages solely to add backlinks.

### Final Navigation Validation

Before completion, verify:

- The new page link appears in the requested location.
- The link URL is correct.
- Desktop navigation works.
- Mobile navigation works.
- Dropdown behavior remains functional.
- Existing menu styling has not changed.
- Existing menu items still work.
- Active/current-page styling works if the project supports it.
- No duplicate navigation links were introduced.

---

## FINAL REQUIREMENTS

Create **{{PAGE_NAME}}** for **{{SERVICE_NAME}}**.

The final page must:

- Match the cloned project's existing theme
- Match its design system
- Match its layout patterns
- Reuse existing components wherever possible
- Contain unique content for **{{SERVICE_NAME}}**
- Be integrated into existing navigation at **{{LINK_PLACEMENT}}** (or the best matching location if that is empty)
- Be fully responsive
- Be accessible
- Be production-ready
- Preserve existing functionality
- Avoid unnecessary project changes

Do not redesign the website.

Do not change the existing theme.

Do not introduce unrelated styling.

Create only the changes required to successfully add **{{PAGE_NAME}}**.`;

  function fillPagePromptTemplate(template, pageName, serviceName, linkPlacement = '') {
    return String(template || '')
      .replaceAll('{{PAGE_NAME}}', pageName || 'new-page.php')
      .replaceAll('{{SERVICE_NAME}}', serviceName || 'this service')
      .replaceAll('{{LINK_PLACEMENT}}', linkPlacement || '');
  }

  const DEFAULT_PAGE_EXAMPLE = {
    pageName: 'book-editing.php',
    pageTitle: 'Book Editing Services',
    linkPlacement: 'Services Dropdown',
    prompt: fillPagePromptTemplate(
      DEFAULT_PAGE_TEMPLATE,
      'book-editing.php',
      'Book Editing Services',
      'Services Dropdown',
    ),
  };

  function applyDefaultPageExample() {
    const name = document.getElementById('aiPageName');
    const title = document.getElementById('aiPageTitle');
    const placement = document.getElementById('aiPageLinkPlacement');
    const prompt = document.getElementById('aiPagePrompt');
    const pageName = (name?.value.trim() || DEFAULT_PAGE_EXAMPLE.pageName);
    const serviceName = (title?.value.trim() || DEFAULT_PAGE_EXAMPLE.pageTitle);
    const linkPlacement = (placement?.value.trim() || DEFAULT_PAGE_EXAMPLE.linkPlacement);
    if (name && !name.value.trim()) name.value = DEFAULT_PAGE_EXAMPLE.pageName;
    if (title && !title.value.trim()) title.value = DEFAULT_PAGE_EXAMPLE.pageTitle;
    if (placement && !placement.value.trim()) placement.value = DEFAULT_PAGE_EXAMPLE.linkPlacement;
    if (prompt) {
      prompt.value = fillPagePromptTemplate(DEFAULT_PAGE_TEMPLATE, pageName, serviceName, linkPlacement);
    }
  }

  async function generateAiPage() {
    const btn = document.getElementById('generateAiPageBtn');
    const status = document.getElementById('aiPageStatus');
    const pageName = document.getElementById('aiPageName').value.trim();
    const pageTitle = document.getElementById('aiPageTitle').value.trim();
    const linkPlacement = document.getElementById('aiPageLinkPlacement')?.value.trim() || '';
    const prompt = fillPagePromptTemplate(
      document.getElementById('aiPagePrompt').value.trim(),
      pageName,
      pageTitle || pageName.replace(/\.php$/i, '').replace(/[-_]/g, ' '),
      linkPlacement,
    );

    if (!pageName || !prompt) {
      setStatus(status, 'Page name and prompt are required.', true);
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Generating...';
    setStatus(status, 'Writing the page and creating the photos together. This usually takes about a minute.');

    try {
      const res = await fetch(API.generatePage, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder, pageName, pageTitle, prompt, linkPlacement }),
      });
      const data = await parseJsonResponse(res);
      if (!data.success) throw new Error(data.error || 'AI generation failed');

      await loadPages();
      pageSelect.value = data.page.file;
      loadPreview(data.page.file);
      aiPageModal.hide();
      document.getElementById('aiPageName').value = '';
      document.getElementById('aiPageTitle').value = '';
      document.getElementById('aiPagePrompt').value = '';
      setStatus(status, '');
    } catch (err) {
      setStatus(status, err.message, true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-stars me-1"></i>Generate Page';
    }
  }

  function bind() {
    themeModal = new bootstrap.Modal(document.getElementById('themeModal'));
    addPageModal = new bootstrap.Modal(document.getElementById('addPageModal'));
    aiPageModal = new bootstrap.Modal(document.getElementById('aiPageModal'));
    bindThemeUi();

    document.getElementById('themeBtn')?.addEventListener('click', openThemeModal);
    document.getElementById('addPageBtn')?.addEventListener('click', () => addPageModal.show());
    document.getElementById('aiPageBtn')?.addEventListener('click', () => aiPageModal.show());
    document.getElementById('applyThemeBtn')?.addEventListener('click', applyTheme);
    document.getElementById('createPageBtn')?.addEventListener('click', createPage);
    document.getElementById('generateAiPageBtn')?.addEventListener('click', generateAiPage);
    document.getElementById('aiPageDefaultPrompt')?.addEventListener('click', applyDefaultPageExample);
    document.getElementById('refreshThemeBtn')?.addEventListener('click', async () => {
      const status = document.getElementById('themeStatus');
      setStatus(status, 'Re-detecting brand colors from the site CSS...');
      try {
        const res = await fetch(API.theme(folder, true));
        const data = await parseJsonResponse(res);
        if (!data.success) throw new Error(data.error);
        currentTheme = data.theme;
        fillThemeForm(data.theme);
        themeBaseline = themeBaselineFrom(data.theme);
        setStatus(status, 'Theme re-detected from the site.');
      } catch (err) {
        setStatus(status, err.message, true);
      }
    });
  }

  return { bind };
}

# Brand profiles

17 brands in 6 groups, one folder per domain: `<Group>/<domain>/`.
Everything here was read from each live website on 2026-11-18. Nothing is generated: if a site doesn't show something, the field is `null` / "not shown on site".

Open **index.html** to see all brands on one page.

## Each brand folder

| File | What it is |
|---|---|
| `brand.json` | Machine-readable profile: name, tagline, about text, copyright line, SEO title/description, phones, emails, address, colours, fonts, logo files, services, stats. The rebrand script reads this. |
| `brand-profile.md` | The same profile, readable. |
| `brand.css` | The site's real colours and fonts as CSS variables. |
| `logos/` | The site's own logo files (`logo`, `logo_white`, `favicon`, …), downloaded from the URLs listed in brand.json. |

Colours and fonts come from the computed styles of each homepage. `colors.primary` is the colour of the site's main buttons/brand elements. It is `null` where the site has no single brand colour (e.g. black/white sites), in which case the logo file is the reference.

## Downloading / refreshing the logos

```bash
bash ~/Desktop/Ai/brand_data/tools/fetch_original_logos.sh
```

## Rebranding a cloned website

```bash
cd ~/Desktop/Ai/brand_data
python3 tools/rebrand.py --site ~/path/to/clone --to bes-publisher.com            # writes a new copy
python3 tools/rebrand.py --site ~/path/to/clone --to bes-publisher.com --dry-run  # preview only
python3 tools/rebrand.py --site ~/path/to/clone --to bes-publisher.com --in-place # change the clone itself
```

It detects which brand the clone is (or pass `--from <domain>`) and swaps name, domain, emails, phones (all formats and `tel:` links), address, tagline, about text, copyright line, SEO title/description, primary colour, fonts and logo files. Only values both sites actually show are swapped; anything `null` is left untouched and reported, so you can fill it in by hand.

## Gaps on the live sites

- **writers-bloom.com**: showed only "We're Under Maintenance", so its profile is empty.
- **americancreativesagency.com**: no street address; meta description is template text.
- **primebooksagency.co**: no font set (generic sans-serif); meta description is template text.
- **onlineshopexpert.co**, **expressbookpublishing.com**: no meta description.
- **bluemountpublishers.co, americancreativesagency.com, bes-publisher.com, pandabookpublishing.co, primebooksagency.co**: no single brand colour in the site CSS (see logo).

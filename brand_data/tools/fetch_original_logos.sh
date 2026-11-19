#!/bin/bash
# Downloads each brand's ORIGINAL logo files from its live website into <Group>/<domain>/logos/.
# Run from anywhere:  bash ~/Desktop/Ai/brand_data/tools/fetch_original_logos.sh
cd "$(dirname "$0")/.." || exit 1
ok=0; fail=0
while IFS=$'\t' read -r dir file url; do
  mkdir -p "$(dirname "$dir/$file")"
  if curl -fsSL -m 30 -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36" -o "$dir/$file" "$url"; then
    echo "ok    $dir/$file"; ok=$((ok+1))
  else
    echo "FAIL  $url"; fail=$((fail+1)); rm -f "$dir/$file"
  fi
done < <(python3 - <<'PY'
import json, glob, os
for f in sorted(glob.glob("*/*/brand.json")):
    d = os.path.dirname(f)
    for role, v in json.load(open(f))["logos"].items():
        print(f"{d}\t{v['file']}\t{v['source_url']}")
PY
)
echo "Downloaded $ok file(s), $fail failed."

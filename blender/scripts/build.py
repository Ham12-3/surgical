"""
Rebuild asset models headless, without the Blender MCP:

    blender --background --factory-startup --python blender/scripts/build.py -- inst_needle_holder_mayo_hegar

With no ids after `--`, every script in blender/scripts/assets/ is rebuilt.
Each one runs with kit.py and kit_shapes.py prepended, exactly as it is sent
through the MCP, and is written to public/models/<id>.glb.

On the Microsoft Store build, `blender` is
%LOCALAPPDATA%\\Microsoft\\WindowsApps\\blender-launcher.exe. It prints
nothing to the console, so check the .glb's timestamp to confirm a rebuild.
"""

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_DIR = HERE.parent.parent / "public" / "models"

ids = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
ids = ids or sorted(path.stem for path in (HERE / "assets").glob("*.py"))
kit = "\n".join((HERE / name).read_text(encoding="utf-8") for name in ("kit.py", "kit_shapes.py"))

for asset_id in ids:
    script = HERE / "assets" / f"{asset_id}.py"
    source = kit + "\n" + script.read_text(encoding="utf-8")
    namespace = {"__name__": f"asset_{asset_id}"}
    exec(compile(source, str(script), "exec"), namespace)
    namespace["build_and_export"](asset_id, str(OUT_DIR))
    print(f"wrote {OUT_DIR / (asset_id + '.glb')}")

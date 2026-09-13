"""
Rebuild asset models headless, without the Blender MCP:

    blender --background --factory-startup --python blender/scripts/build.py -- inst_needle_holder_mayo_hegar

With no ids after `--`, every script in blender/scripts/assets/ is rebuilt.
Each one runs with the kit prepended (asset_source() below), exactly as it is
sent through the MCP, and is written to public/models/<id>.glb.

On the Microsoft Store build, `blender` is
%LOCALAPPDATA%\\Microsoft\\WindowsApps\\blender-launcher.exe. It prints
nothing to the console, so check the .glb's timestamp to confirm a rebuild.
"""

import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_DIR = HERE.parent.parent / "public" / "models"

# Every script gets these; a script names any others it needs on its own
# `# kit: <file>` lines, such as the ring-handle parts in kit_instruments.py.
BASE_KIT = ("kit.py", "kit_shapes.py")


def asset_source(asset_id):
    """The asset's script with its kit prepended, and the script's path."""
    script = HERE / "assets" / f"{asset_id}.py"
    text = script.read_text(encoding="utf-8")
    kits = list(BASE_KIT) + re.findall(r"^# kit: (\S+)\s*$", text, re.MULTILINE)
    parts = [(HERE / name).read_text(encoding="utf-8") for name in kits]
    return "\n".join(parts + [text]), script


def main():
    ids = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ids = ids or sorted(path.stem for path in (HERE / "assets").glob("*.py"))
    for asset_id in ids:
        source, script = asset_source(asset_id)
        namespace = {"__name__": f"asset_{asset_id}"}
        exec(compile(source, str(script), "exec"), namespace)
        namespace["build_and_export"](asset_id, str(OUT_DIR))
        print(f"wrote {OUT_DIR / (asset_id + '.glb')}")


if __name__ == "__main__":
    main()

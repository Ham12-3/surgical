"""
Rebuild instrument models headless, without the Blender MCP:

    blender --background --factory-startup --python blender/build.py -- needle_holder

With no names after `--`, every script in blender/instruments/ is rebuilt.
Each one runs with kit.py prepended, exactly as it is sent through the MCP,
and is written to public/models/instruments/<name>.glb.
"""

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_DIR = HERE.parent / "public" / "models" / "instruments"

names = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
keys = names or sorted(path.stem for path in (HERE / "instruments").glob("*.py"))
kit = (HERE / "kit.py").read_text(encoding="utf-8")

for key in keys:
    script = HERE / "instruments" / f"{key}.py"
    source = kit + "\n" + script.read_text(encoding="utf-8")
    namespace = {"__name__": f"instrument_{key}"}
    exec(compile(source, str(script), "exec"), namespace)
    namespace["build_and_export"](key, str(OUT_DIR))
    print(f"wrote {OUT_DIR / (key + '.glb')}")
